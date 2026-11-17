/**
 * Cloudflare Pages Function: POST /api/admin/login
 * Hardened admin sign-in with fail-closed prod checks, CSRF validation,
 * IP brute-force throttling, and HttpOnly session cookies.
 */

import {
  getAdminCredentials,
  deriveEdgeAdminAuthSecrets,
  getFirebaseEnvFromEnv,
  buildEdgeEnvDiagnostics,
  readSiteConfigFromFirestoreRest,
  timingSafeEqualDigest,
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

  // Only trust Cloudflare-verified cf-connecting-ip (never attacker-spoofable x-forwarded-for)
  const clientIp = (cleanEnvVal(request.headers.get('cf-connecting-ip')) || 'edge-client').trim();

  const rate = checkEdgeLoginRateLimit(clientIp);
  if (!rate.allowed) {
    return jsonResponse(
      {
        success: false,
        retryAfterSec: rate.retryAfterSec || 60,
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

  const email = cleanEnvVal(rawEmailField);
  const password = cleanEnvVal(rawPasswordField);
  const apiKey = cleanEnvVal(rawKeyField);

  if (!apiKey && (!email || !password)) {
    return jsonResponse(
      { success: false, error: 'Please enter your administrator email and password to sign in.' },
      400,
      {},
      request,
      true
    );
  }

  const apiKeyAuthenticated = Boolean(
    adminCreds.requiresApiKey && apiKey && (await timingSafeEqualDigest(apiKey, adminCreds.apiKey))
  );
  const [emailMatch, passMatch] = await Promise.all([
    adminCreds.email && email
      ? timingSafeEqualDigest(email.toLowerCase(), adminCreds.email.toLowerCase())
      : Promise.resolve(false),
    adminCreds.password && password
      ? timingSafeEqualDigest(password, adminCreds.password)
      : Promise.resolve(false)
  ]);
  const credentialsAuthenticated = Boolean(emailMatch && passMatch);

  if (!apiKeyAuthenticated && !credentialsAuthenticated) {
    recordEdgeFailedLogin(clientIp);
    await new Promise((r) => setTimeout(r, 220));
    return jsonResponse(
      {
        success: false,
        error: 'Invalid email address or password.'
      },
      401,
      {},
      request,
      true
    );
  }

  clearEdgeLoginAttempts(clientIp);
  const loginSubject = credentialsAuthenticated ? adminCreds.email : 'api-key-admin';
  const { signingSecret, credVersion } = await deriveEdgeAdminAuthSecrets(adminCreds, env);
  const token = await createAdminToken(loginSubject, signingSecret, credVersion);
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
