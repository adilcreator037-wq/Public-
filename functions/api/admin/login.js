/**
 * Cloudflare Pages Function: POST /api/admin/login
 * Authenticates admin users using Cloudflare Pages environment variables / secrets
 * (ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_API_KEY, ADMIN_SESSION_SECRET).
 */

import {
  getAdminCredentials,
  getFirebaseEnvFromEnv,
  buildEdgeEnvDiagnostics,
  readSiteConfigFromFirestoreRest,
  timingSafeEqual,
  createAdminToken,
  jsonResponse,
  cleanEnvVal
} from '../../_shared/auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const email = cleanEnvVal(body.email);
  const password = cleanEnvVal(body.password);
  const apiKey = cleanEnvVal(body.apiKey);

  const adminCreds = getAdminCredentials(env);

  const apiKeyAuthenticated = Boolean(
    adminCreds.requiresApiKey && apiKey && timingSafeEqual(apiKey, adminCreds.apiKey)
  );
  const credentialsAuthenticated = Boolean(
    email &&
    timingSafeEqual(email.toLowerCase(), adminCreds.email.toLowerCase()) &&
    timingSafeEqual(password, adminCreds.password)
  );

  if (!apiKeyAuthenticated && !credentialsAuthenticated) {
    return jsonResponse(
      {
        success: false,
        error: apiKey
          ? 'Invalid Admin API Key. Verify ADMIN_API_KEY in your Cloudflare Pages environment variables.'
          : 'Invalid Admin Email or Password. Verify ADMIN_EMAIL and ADMIN_PASSWORD in your Cloudflare Pages environment variables.'
      },
      401
    );
  }

  const token = await createAdminToken(adminCreds.email, adminCreds.secret);
  const fbEnv = getFirebaseEnvFromEnv(env);
  const siteConfig = fbEnv.isConfigured ? await readSiteConfigFromFirestoreRest(fbEnv.config) : null;

  return jsonResponse({
    success: true,
    token,
    user: {
      email: adminCreds.email,
      role: 'Master Administrator'
    },
    envDiagnostics: buildEdgeEnvDiagnostics(adminCreds, fbEnv, env, true, siteConfig)
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-api-key'
    }
  });
}
