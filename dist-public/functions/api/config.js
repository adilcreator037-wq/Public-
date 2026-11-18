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
  readSiteConfigWithStatusEdge,
  writeSiteConfigToFirestoreRest,
  writeBatchToFirestoreRest,
  sanitizeConfigForClientEdge,
  sanitizeFirebaseConfigForClientEdge,
  preserveSecretsEdge,
  applyModulePatchEdge,
  appendSyncLogEntryEdge,
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
  let cloudConfig = null;
  if (fbEnv.isConfigured) {
    const readRes = await readSiteConfigWithStatusEdge(fbEnv.config);
    if (readRes.status === 'error') {
      return jsonResponse(
        {
          success: false,
          error: `Firebase Firestore read failed: ${readRes.error || 'Unable to load workspace configuration'}`
        },
        502,
        {},
        request,
        true
      );
    }
    cloudConfig = readRes.config;
  }

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
  if (!fbEnv.isConfigured) {
    return jsonResponse(
      {
        success: false,
        firestoreSaved: false,
        error: 'Firebase is not configured in Cloudflare environment variables. Add FIREBASE_API_KEY and FIREBASE_PROJECT_ID to persist changes.'
      },
      503,
      {},
      request,
      true
    );
  }

  const readRes = await readSiteConfigWithStatusEdge(fbEnv.config);
  if (readRes.status === 'error') {
    return jsonResponse(
      {
        success: false,
        firestoreSaved: false,
        error: `Firebase Firestore read failed before save: ${readRes.error || 'Unable to read existing configuration'}`
      },
      502,
      {},
      request,
      true
    );
  }
  const existing = readRes.config || EMPTY_ADMIN_CONFIG;

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

  let nextConfig = patched.config;
  if (moduleKey !== 'syncLogs') {
    nextConfig = appendSyncLogEntryEdge(
      nextConfig,
      {
        trigger: 'firebase-save',
        status: 'saved',
        modulesChanged: [moduleKey],
        filesCount: 1,
        branch: nextConfig.githubConfig?.branch || 'main',
        repo:
          nextConfig.githubConfig?.repoOwner && nextConfig.githubConfig?.repoName
            ? `${nextConfig.githubConfig.repoOwner}/${nextConfig.githubConfig.repoName}`
            : '',
        durationMs: 0,
        steps: [
          `Saved module "${moduleKey}" to Cloud Firestore (${fbEnv.config?.projectId})`,
          'Staged for next GitHub static site deployment'
        ],
        message: `Saved "${moduleKey}" to Firebase Firestore.`
      },
      false
    );
  }

  const sanitized = sanitizeConfigForClientEdge(nextConfig, env);
  const batchModules = {
    [moduleKey]: sanitized[moduleKey],
    syncLogs: sanitized.syncLogs,
    githubConfig: sanitized.githubConfig
  };
  if (moduleKey === 'domainConfig') batchModules.seo = sanitized.seo;
  if (moduleKey === 'seo') batchModules.domainConfig = sanitized.domainConfig;

  const firestoreResult = await writeBatchToFirestoreRest(
    fbEnv.config,
    batchModules,
    { updatedAt: sanitized.updatedAt, dirtyModulesSinceSync: sanitized.dirtyModulesSinceSync }
  );

  if (!firestoreResult.ok) {
    return jsonResponse(
      {
        success: false,
        firestoreSaved: false,
        error: `Firebase Firestore rejected save: ${firestoreResult.error || 'Unknown error'}`
      },
      502,
      {},
      request,
      true
    );
  }

  return jsonResponse(
    {
      success: true,
      savedModule: moduleKey,
      bytesSent: JSON.stringify(data ?? {}).length,
      dirtyModulesSinceSync: sanitized.dirtyModulesSinceSync || [],
      config: sanitized,
      firestoreSaved: true,
      firestoreNotice: null,
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
  if (!fbEnv.isConfigured) {
    return jsonResponse(
      {
        success: false,
        firestoreSaved: false,
        error: 'Firebase is not configured in Cloudflare environment variables. Add FIREBASE_API_KEY and FIREBASE_PROJECT_ID to persist changes.'
      },
      503,
      {},
      request,
      true
    );
  }

  const readRes = await readSiteConfigWithStatusEdge(fbEnv.config);
  if (readRes.status === 'error') {
    return jsonResponse(
      {
        success: false,
        firestoreSaved: false,
        error: `Firebase Firestore read failed before save: ${readRes.error || 'Unable to read existing configuration'}`
      },
      502,
      {},
      request,
      true
    );
  }
  const existing = readRes.config || EMPTY_ADMIN_CONFIG;

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

  const firestoreResult = await writeSiteConfigToFirestoreRest(fbEnv.config, nextConfig, env);
  if (!firestoreResult.ok) {
    return jsonResponse(
      {
        success: false,
        firestoreSaved: false,
        error: `Firebase Firestore rejected save: ${firestoreResult.error || 'Unknown error'}`
      },
      502,
      {},
      request,
      true
    );
  }

  return jsonResponse(
    {
      success: true,
      config: sanitizeConfigForClientEdge(nextConfig, env),
      firestoreSaved: true,
      firestoreNotice: null,
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

