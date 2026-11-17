/**
 * Cloudflare Pages Function: POST /api/admin/login
 * Hardened admin sign-in with fail-closed prod checks, CSRF validation,
 * IP brute-force throttling, and HttpOnly session cookies.
 */

import {
  getAdminCredentials,
  getFirebaseEnvFromEnv,
  buildEdgeEnvDiagnostics,
  readSiteConfigFromFirestoreRest,
  timingSafeEqual,
  createAdminToken,
  verifyCsrfEdge,
  checkEdgeLoginRateLimit,
  recordEdgeFailedLogin,
  clearEdgeLoginAttempts,
  isHttpsEdgeRequest,
  buildSessionCookieHeader,
  jsonResponse,
  cleanEnvVal
} from '../../_shared/auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const reqHost = request.headers.get('host') || new URL(request.url).host || '';
  const adminCreds = getAdminCredentials(env, reqHost);

  if (!adminCreds.policy.credentialsReady) {
    return jsonResponse(
      {
        success: false,
        code: 'admin-not-configured',
        error: 'Administrator sign-in is currently unavailable on this server.'
      },
      503,
      {},
      request,
      true
    );
  }

  const csrf = verifyCsrfEdge(request, env);
  if (!csrf.ok) {
    return jsonResponse({ success: false, error: csrf.error }, 403, {}, request, true);
  }

  const clientIp = (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for') ||
    'local'
  )
    .split(',')[0]
    .trim();

  const rate = checkEdgeLoginRateLimit(clientIp);
  if (!rate.allowed) {
    return jsonResponse(
      {
        success: false,
        error: `Too many failed sign-in attempts. Please wait ${rate.retryAfterSec || 60} seconds.`
      },
      429,
      rate.retryAfterSec ? { 'Retry-After': String(rate.retryAfterSec) } : {},
      request,
      true
    );
  }

  let body = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse({ success: false, error: 'Invalid sign-in request.' }, 400, {}, request, true);
  }

  const { email: rawEmailField = '', password: rawPasswordField = '', apiKey: rawKeyField = '' } = body;
  if (
    typeof rawEmailField !== 'string' ||
    typeof rawPasswordField !== 'string' ||
    typeof rawKeyField !== 'string' ||
    rawEmailField.length > 320 ||
    rawPasswordField.length > 512 ||
    rawKeyField.length > 512
  ) {
    return jsonResponse({ success: false, error: 'Invalid credential format.' }, 400, {}, request, true);
  }

  const email = rawEmailField.trim();
  const password = rawPasswordField.trim();
  const apiKey = rawKeyField.trim();

  if (!apiKey && (!email || !password)) {
    return jsonResponse(
      { success: false, error: 'Please enter your administrator credentials to sign in.' },
      400,
      {},
      request,
      true
    );
  }

  const apiKeyAuthenticated = Boolean(
    adminCreds.requiresApiKey && apiKey && timingSafeEqual(apiKey, adminCreds.apiKey)
  );
  const credentialsAuthenticated = Boolean(
    adminCreds.email &&
    adminCreds.password &&
    email &&
    password &&
    timingSafeEqual(email.toLowerCase(), adminCreds.email.toLowerCase()) &&
    timingSafeEqual(password, adminCreds.password)
  );

  if (!apiKeyAuthenticated && !credentialsAuthenticated) {
    recordEdgeFailedLogin(clientIp);
    return jsonResponse(
      {
        success: false,
        error: 'Invalid administrator credentials.'
      },
      401,
      {},
      request,
      true
    );
  }

  clearEdgeLoginAttempts(clientIp);
  const loginSubject = credentialsAuthenticated ? adminCreds.email : 'api-key-admin';
  const token = await createAdminToken(loginSubject, adminCreds.secret);
  const cookieHeader = buildSessionCookieHeader(token, isHttpsEdgeRequest(request));

  const fbEnv = getFirebaseEnvFromEnv(env);
  const siteConfig = fbEnv.isConfigured ? await readSiteConfigFromFirestoreRest(fbEnv.config) : null;

  return jsonResponse(
    {
      success: true,
      user: {
        email: loginSubject,
        role: 'Master Administrator'
      },
      envDiagnostics: buildEdgeEnvDiagnostics(adminCreds, fbEnv, env, true, siteConfig)
    },
    200,
    { 'Set-Cookie': cookieHeader },
    request,
    true
  );
}
