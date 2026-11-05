/**
 * Cloudflare Pages Function: GET /api/admin/verify
 * Verifies the admin bearer token or API key against Cloudflare environment secrets.
 */

import {
  getAdminCredentials,
  verifyAdminToken,
  jsonResponse
} from '../../_shared/auth.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  const authHeader = request.headers.get('authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const headerApiKey = request.headers.get('x-admin-api-key') || '';

  const adminCreds = getAdminCredentials(env);
  const tokenToVerify = bearerToken || headerApiKey;

  const verification = await verifyAdminToken(
    tokenToVerify,
    adminCreds.secret,
    adminCreds.apiKey
  );

  return jsonResponse({
    authenticated: verification.valid,
    user: verification.valid
      ? { email: verification.email || adminCreds.email, role: 'Master Administrator' }
      : null,
    loginHints: {
      requiresApiKey: adminCreds.requiresApiKey,
      usingDefaultDevCredentials:
        !adminCreds.isCustomEmail && !adminCreds.isCustomPassword
    },
    envDiagnostics: {
      adminEmailConfigured: adminCreds.isCustomEmail,
      adminPasswordConfigured: adminCreds.isCustomPassword,
      adminApiKeyRequired: adminCreds.requiresApiKey,
      runtime: 'Cloudflare Pages Functions'
    }
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
