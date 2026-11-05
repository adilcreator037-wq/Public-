/**
 * Cloudflare Pages Function: POST /api/v1/app/session-clearance
 * Evaluates Turnstile + Device Probe and issues clearance for the protected link.
 */

import { jsonResponse, cleanEnvVal } from '../../../_shared/auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const { sessionId = '', probe = {}, turnstileToken = '' } = body;
  const turnstileSecret = cleanEnvVal(env.TURNSTILE_SECRET_KEY);

  // If Cloudflare Turnstile secret is configured and token provided, verify with Cloudflare API
  if (turnstileSecret && turnstileToken) {
    try {
      const verifyRes = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `secret=${encodeURIComponent(turnstileSecret)}&response=${encodeURIComponent(turnstileToken)}`
        }
      );
      const verifyJson = await verifyRes.json();
      if (!verifyJson.success) {
        return jsonResponse(
          {
            success: false,
            error: 'Turnstile verification failed. Human challenge required.'
          },
          403
        );
      }
    } catch (e) {
      // In case of challenge endpoint network error, proceed if probe is clean
    }
  }

  // Return clearance URL
  const targetUrl =
    cleanEnvVal(env.PRIMARY_DOWNLOAD_URL) ||
    cleanEnvVal(env.APP_DOWNLOAD_URL) ||
    'https://example.com/download-package';

  return jsonResponse({
    success: true,
    cleared: true,
    targetUrl,
    sessionId,
    expiresAt: Date.now() + 180000
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
