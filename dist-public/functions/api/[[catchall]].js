/**
 * Cloudflare Pages Function: Edge API Router & Catch-All (/api/[[catchall]])
 * Handles /api/admin/encrypt-url, /api/firebase-config, /api/firebase/test,
 * and ensures unknown /api/* paths always return clean JSON instead of HTML/empty 404.
 */

import {
  verifyAdminRequest,
  getFirebaseEnvFromEnv,
  encryptVaultValueWeb,
  cleanEnvVal,
  jsonResponse
} from '../_shared/auth.js';

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-api-key'
      }
    });
  }

  const path = Array.isArray(params.catchall)
    ? params.catchall.join('/')
    : params.catchall || '';

  // 1. Admin 1-Click AES-256-GCM URL Encryption (`POST /api/admin/encrypt-url`)
  if (path === 'admin/encrypt-url' && request.method === 'POST') {
    const { verification } = await verifyAdminRequest(request, env);
    if (!verification.valid) {
      return jsonResponse({ success: false, error: 'Unauthorized.' }, 401);
    }
    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const rawUrl = cleanEnvVal(body?.url);
    if (!rawUrl) {
      return jsonResponse(
        { success: false, error: 'Please enter a valid download destination URL to encrypt.' },
        400
      );
    }
    const encryptedUrl = await encryptVaultValueWeb(rawUrl, env);
    return jsonResponse({ success: true, encryptedUrl });
  }

  // 2. Authenticated Environment Firebase Config (`GET /api/firebase-config`)
  if (path === 'firebase-config' && request.method === 'GET') {
    const { verification } = await verifyAdminRequest(request, env);
    if (!verification.valid) {
      return jsonResponse({ success: false, error: 'Unauthorized.' }, 401);
    }
    const fbEnv = getFirebaseEnvFromEnv(env);
    return jsonResponse({ success: true, ...fbEnv });
  }

  // 3. Authenticated Firebase Firestore REST Test (`POST /api/firebase/test`)
  if (path === 'firebase/test' && request.method === 'POST') {
    const { verification } = await verifyAdminRequest(request, env);
    if (!verification.valid) {
      return jsonResponse({ success: false, error: 'Unauthorized.' }, 401);
    }
    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const fbEnv = getFirebaseEnvFromEnv(env);
    const raw = body?.firebaseConfig || {};
    const projectId = cleanEnvVal(raw.projectId) || fbEnv.config?.projectId || '';
    const apiKey = cleanEnvVal(raw.apiKey) || fbEnv.config?.apiKey || '';
    const databaseId = cleanEnvVal(raw.databaseId) || fbEnv.config?.databaseId || '(default)';

    if (!apiKey || !projectId) {
      return jsonResponse(
        { success: false, code: 'invalid-config', error: 'Valid Firebase API Key and Project ID are required.' },
        400
      );
    }

    const dbId = encodeURIComponent(databaseId);
    const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      projectId
    )}/databases/${dbId}/documents/siteConfig/main?key=${encodeURIComponent(apiKey)}`;

    try {
      const fbRes = await fetch(endpoint, { headers: { Accept: 'application/json' } });
      if (fbRes.ok) {
        return jsonResponse({
          success: true,
          status: 'connected',
          documentExists: true,
          projectId,
          databaseId,
          message: `Connected to Firestore (${projectId}) — live siteConfig/main document found.`
        });
      }
      const errData = await fbRes.json().catch(() => ({}));
      const msg = String(errData?.error?.message || fbRes.statusText || '');
      const statusText = String(errData?.error?.status || '');
      if (fbRes.status === 404 && !msg.toLowerCase().includes('database')) {
        return jsonResponse({
          success: true,
          status: 'connected-empty',
          documentExists: false,
          projectId,
          databaseId,
          message: `Connected to Firestore (${projectId}). Document siteConfig/main will be created on your next Publish.`
        });
      }
      return jsonResponse(
        {
          success: false,
          code: statusText || `http-${fbRes.status}`,
          error: msg || `Firestore check failed with HTTP ${fbRes.status}`
        },
        fbRes.status
      );
    } catch (err) {
      return jsonResponse(
        { success: false, code: 'network-error', error: err?.message || 'Firestore request failed' },
        502
      );
    }
  }

  return jsonResponse(
    {
      success: false,
      error: `API route not found: /api/${path}`,
      path: `/api/${path}`,
      method: request.method,
      runtime: 'Cloudflare Pages Functions'
    },
    404
  );
}
