/**
 * Cloudflare Pages Function: GET /api/admin/verify
 * Verifies the admin bearer token or API key against Cloudflare environment secrets
 * and returns safe (non-secret) environment diagnostics.
 */

import {
  verifyAdminRequest,
  getFirebaseEnvFromEnv,
  buildEdgeEnvDiagnostics,
  readSiteConfigFromFirestoreRest,
  jsonResponse
} from '../../_shared/auth.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  const { verification, adminCreds } = await verifyAdminRequest(request, env);
  const fbEnv = getFirebaseEnvFromEnv(env);
  const siteConfig =
    verification.valid && fbEnv.isConfigured
      ? await readSiteConfigFromFirestoreRest(fbEnv.config)
      : null;

  return jsonResponse({
    authenticated: verification.valid,
    user: verification.valid
      ? { email: verification.email || adminCreds.email, role: 'Master Administrator' }
      : null,
    loginHints: {
      requiresApiKey: adminCreds.requiresApiKey,
      usingDefaultDevCredentials: !adminCreds.isCustomEmail && !adminCreds.isCustomPassword,
      defaultEmailHint:
        !adminCreds.isCustomEmail && !adminCreds.isCustomPassword ? adminCreds.email : undefined
    },
    envDiagnostics: buildEdgeEnvDiagnostics(
      adminCreds,
      fbEnv,
      env,
      verification.valid,
      siteConfig
    )
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-api-key'
    }
  });
}
