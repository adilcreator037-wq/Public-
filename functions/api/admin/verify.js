/**
 * Cloudflare Pages Function: GET /api/admin/verify
 * Zero-leak session check: unauthenticated callers receive only
 * `{ authenticated: false, user: null, loginHints: { requiresApiKey } }`.
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

  if (!verification.valid) {
    return jsonResponse(
      {
        authenticated: false,
        user: null
      },
      200,
      {},
      request,
      true
    );
  }

  const fbEnv = getFirebaseEnvFromEnv(env);
  const siteConfig = fbEnv.isConfigured
    ? await readSiteConfigFromFirestoreRest(fbEnv.config)
    : null;

  return jsonResponse(
    {
      authenticated: true,
      user: { email: verification.email || adminCreds.email, role: 'Master Administrator' },
      loginHints: {
        requiresApiKey: adminCreds.requiresApiKey
      },
      envDiagnostics: buildEdgeEnvDiagnostics(adminCreds, fbEnv, env, true, siteConfig)
    },
    200,
    {},
    request,
    true
  );
}
