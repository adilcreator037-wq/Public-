/**
 * Cloudflare Pages Function: GET / PUT / PATCH /api/config
 * Authenticated modular read/write endpoint wired to Firebase Cloud Firestore REST API,
 * AES-256-GCM Link Vault encryption, secret masking, and granular module saves.
 */

import {
  verifyAdminRequest,
  verifyCsrfEdge,
  getFirebaseEnvFromEnv,
  buildEdgeEnvDiagnostics,
  readSiteConfigFromFirestoreRest,
  writeSiteConfigToFirestoreRest,
  writeModuleToFirestoreRest,
  sanitizeConfigForClientEdge,
  sanitizeFirebaseConfigForClientEdge,
  preserveSecretsEdge,
  applyModulePatchEdge,
  isCmsModuleKey,
  encryptVaultValueWeb,
  EMPTY_ADMIN_CONFIG,
  jsonResponse
} from '../_shared/auth.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const { verification, adminCreds } = await verifyAdminRequest(request, env);

  if (!verification.valid) {
    return jsonResponse(
      {
        success: false,
        error: verification.policyError
          ? 'Administrator sign-in is currently unavailable on this server.'
          : 'Unauthorized. Admin authentication required.'
      },
      verification.policyError ? 503 : 401,
      {},
      request,
      true
    );
  }

  const fbEnv = getFirebaseEnvFromEnv(env);
  const cloudConfig = fbEnv.isConfigured
    ? await readSiteConfigFromFirestoreRest(fbEnv.config)
    : null;

  const effectiveConfig = cloudConfig || EMPTY_ADMIN_CONFIG;
  const sanitizedConfig = sanitizeConfigForClientEdge(effectiveConfig, env);
  const safeFbEnv = {
    isConfigured: fbEnv.isConfigured,
    source: fbEnv.isConfigured ? 'env' : 'none',
    config: sanitizeFirebaseConfigForClientEdge(fbEnv.config)
  };

  return jsonResponse(
    {
      success: true,
      config: sanitizedConfig,
      firebaseEnv: safeFbEnv,
      serverReadFirestore: Boolean(fbEnv.isConfigured),
      firebaseProjectId: fbEnv.config?.projectId || null,
      envDiagnostics: buildEdgeEnvDiagnostics(adminCreds, fbEnv, env, true, effectiveConfig),
      runtime: 'Cloudflare Pages Functions'
    },
    200,
    {},
    request,
    true
  );
}

export async function onRequestPatch(context) {
  const { request, env } = context;
  const { verification } = await verifyAdminRequest(request, env);
  if (!verification.valid) {
    return jsonResponse(
      { success: false, error: 'Unauthorized. Admin authentication required.' },
      401,
      {},
      request,
      true
    );
  }

  const csrf = verifyCsrfEdge(request, env);
  if (!csrf.ok) {
    return jsonResponse({ success: false, error: csrf.error }, 403, {}, request, true);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const { moduleKey, data } = body || {};
  if (!isCmsModuleKey(moduleKey)) {
    return jsonResponse({ success: false, error: 'Invalid or missing moduleKey.' }, 400, {}, request, true);
  }

  const fbEnv = getFirebaseEnvFromEnv(env);
  const existing = fbEnv.isConfigured
    ? (await readSiteConfigFromFirestoreRest(fbEnv.config)) || EMPTY_ADMIN_CONFIG
    : EMPTY_ADMIN_CONFIG;

  const patched = applyModulePatchEdge(existing, moduleKey, data);

  if (moduleKey === 'securityGate' && patched.config.securityGate?.primaryDownloadUrl) {
    try {
      patched.config.securityGate.encryptedPrimaryUrl = await encryptVaultValueWeb(
        patched.config.securityGate.primaryDownloadUrl,
        env
      );
    } catch {
      // Fallback handled on clearance
    }
  }

  const sanitized = sanitizeConfigForClientEdge(patched.config, env);
  let firestoreResult = { ok: false, error: 'Firebase not configured in Cloudflare env' };
  if (fbEnv.isConfigured) {
    firestoreResult = await writeModuleToFirestoreRest(
      fbEnv.config,
      moduleKey,
      sanitized[moduleKey],
      { updatedAt: sanitized.updatedAt, dirtyModulesSinceSync: sanitized.dirtyModulesSinceSync }
    );
  }

  return jsonResponse(
    {
      success: true,
      savedModule: moduleKey,
      bytesSent: JSON.stringify(data ?? {}).length,
      dirtyModulesSinceSync: sanitized.dirtyModulesSinceSync || [],
      config: sanitized,
      firestoreSaved: firestoreResult.ok,
      firestoreNotice: firestoreResult.ok ? null : firestoreResult.error,
      savedAt: sanitized.updatedAt,
      runtime: 'Cloudflare Pages Functions'
    },
    200,
    {},
    request,
    true
  );
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const { verification } = await verifyAdminRequest(request, env);

  if (!verification.valid) {
    return jsonResponse(
      { success: false, error: 'Unauthorized. Admin authentication required.' },
      401,
      {},
      request,
      true
    );
  }

  const csrf = verifyCsrfEdge(request, env);
  if (!csrf.ok) {
    return jsonResponse({ success: false, error: csrf.error }, 403, {}, request, true);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const incomingConfig = body.config || body;
  if (!incomingConfig || typeof incomingConfig !== 'object') {
    return jsonResponse({ success: false, error: 'Invalid configuration payload.' }, 400, {}, request, true);
  }

  const fbEnv = getFirebaseEnvFromEnv(env);
  const existing = fbEnv.isConfigured
    ? (await readSiteConfigFromFirestoreRest(fbEnv.config)) || EMPTY_ADMIN_CONFIG
    : EMPTY_ADMIN_CONFIG;

  const nextConfig = preserveSecretsEdge(incomingConfig, existing);
  if (nextConfig.securityGate?.primaryDownloadUrl) {
    try {
      nextConfig.securityGate.encryptedPrimaryUrl = await encryptVaultValueWeb(
        nextConfig.securityGate.primaryDownloadUrl,
        env
      );
    } catch {
      // Fallback handled on clearance
    }
  }
  nextConfig.updatedAt = Date.now();

  let firestoreResult = { ok: false, error: 'Firebase not configured in Cloudflare env' };
  if (fbEnv.isConfigured) {
    firestoreResult = await writeSiteConfigToFirestoreRest(fbEnv.config, nextConfig, env);
  }

  return jsonResponse(
    {
      success: true,
      config: sanitizeConfigForClientEdge(nextConfig, env),
      firestoreSaved: firestoreResult.ok,
      firestoreNotice: firestoreResult.ok ? null : firestoreResult.error,
      savedAt: nextConfig.updatedAt,
      runtime: 'Cloudflare Pages Functions'
    },
    200,
    {},
    request,
    true
  );
}

export const onRequestPost = onRequestPut;

