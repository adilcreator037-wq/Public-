/**
 * Cloudflare Pages Function: POST /api/v1/app/session-init
 * Handles v12 7-Gate Security Gate Session Initialization at the Edge.
 */

import { jsonResponse } from '../../../_shared/auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const clientIp =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for') ||
    '127.0.0.1';

  const userAgent = request.headers.get('user-agent') || '';
  const now = Date.now();

  // Generate random session tokens using Web Crypto
  const rawId = new Uint8Array(16);
  crypto.getRandomValues(rawId);
  const sessionId = Array.from(rawId)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const rawNonce = new Uint8Array(16);
  crypto.getRandomValues(rawNonce);
  const nonce = Array.from(rawNonce)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return jsonResponse({
    success: true,
    sessionId: `cf-${sessionId}`,
    nonce,
    timestamp: now,
    expiresAt: now + 600000,
    runtime: 'Cloudflare Pages Functions'
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Device-Fingerprint, X-Session-Token'
    }
  });
}
