/**
 * Cloudflare Pages Function: GET /api/config & PUT /api/config
 * Provides configuration read/write at the edge.
 */

import {
  getAdminCredentials,
  verifyAdminToken,
  jsonResponse
} from '../_shared/auth.js';

export async function onRequestGet() {
  // Edge response for site config; client also syncs with Firestore
  return jsonResponse({
    success: true,
    message: 'Edge config endpoint active',
    runtime: 'Cloudflare Pages Functions'
  });
}

export async function onRequestPut(context) {
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

  if (!verification.valid) {
    return jsonResponse(
      { success: false, error: 'Unauthorized. Admin authentication required.' },
      401
    );
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  return jsonResponse({
    success: true,
    config: body.config || body,
    message: 'Configuration verified by Cloudflare Edge Function',
    savedAt: Date.now()
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-api-key'
    }
  });
}
