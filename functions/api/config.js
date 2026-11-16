/**
 * Cloudflare Pages Function: GET /api/config & PUT /api/config
 * Authenticated read/write endpoint wired to Firebase Cloud Firestore REST API
 * and AES-256-GCM Link Vault encryption.
 */

import {
  verifyAdminRequest,
  getFirebaseEnvFromEnv,
  buildEdgeEnvDiagnostics,
  readSiteConfigFromFirestoreRest,
  writeSiteConfigToFirestoreRest,
  encryptVaultValueWeb,
  jsonResponse
} from '../_shared/auth.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const { verification, adminCreds } = await verifyAdminRequest(request, env);

  if (!verification.valid) {
    return jsonResponse(
      { success: false, error: 'Unauthorized. Admin authentication required.' },
      401
    );
  }

  const fbEnv = getFirebaseEnvFromEnv(env);
  const cloudConfig = fbEnv.isConfigured
    ? await readSiteConfigFromFirestoreRest(fbEnv.config)
    : null;

  return jsonResponse({
    success: true,
    config: cloudConfig || null,
    firebaseEnv: fbEnv,
    envDiagnostics: buildEdgeEnvDiagnostics(adminCreds, fbEnv, env, true, cloudConfig),
    runtime: 'Cloudflare Pages Functions'
  });
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const { verification } = await verifyAdminRequest(request, env);

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

  const incomingConfig = body.config || body;
  if (!incomingConfig || typeof incomingConfig !== 'object') {
    return jsonResponse({ success: false, error: 'Invalid configuration payload.' }, 400);
  }

  // Encrypt securityGate.primaryDownloadUrl using AES-256-GCM at the edge
  if (incomingConfig.securityGate?.primaryDownloadUrl) {
    try {
      incomingConfig.securityGate.encryptedPrimaryUrl = await encryptVaultValueWeb(
        incomingConfig.securityGate.primaryDownloadUrl,
        env
      );
    } catch {
      // Fallback handled on clearance
    }
  }
  incomingConfig.updatedAt = Date.now();

  const fbEnv = getFirebaseEnvFromEnv(env);
  let firestoreResult = { ok: false, error: 'Firebase not configured in Cloudflare env' };
  if (fbEnv.isConfigured) {
    firestoreResult = await writeSiteConfigToFirestoreRest(fbEnv.config, incomingConfig);
  }

  return jsonResponse({
    success: true,
    config: incomingConfig,
    firestoreSaved: firestoreResult.ok,
    firestoreNotice: firestoreResult.ok ? null : firestoreResult.error,
    savedAt: incomingConfig.updatedAt,
    runtime: 'Cloudflare Pages Functions'
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
