/**
 * Cloudflare Pages Function: POST /api/admin/logout
 * Revokes current session token jti and clears HttpOnly session cookies.
 */

import {
  verifyAdminRequest,
  verifyCsrfEdge,
  revokeAdminJti,
  isHttpsEdgeRequest,
  clearSessionCookieHeaders,
  jsonResponse
} from '../../_shared/auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const csrf = verifyCsrfEdge(request, env);
  if (!csrf.ok) {
    return jsonResponse({ success: false, error: csrf.error }, 403, {}, request, true);
  }

  const { verification } = await verifyAdminRequest(request, env, true);
  if (verification?.jti) {
    revokeAdminJti(verification.jti, verification.exp);
  }

  return jsonResponse(
    { success: true },
    200,
    { 'Set-Cookie': clearSessionCookieHeaders(isHttpsEdgeRequest(request)) },
    request,
    true
  );
}
