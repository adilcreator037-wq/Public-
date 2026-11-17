/**
 * Cloudflare Pages Function: Edge API Router & Catch-All (/api/[[catchall]])
 * Supports modular patch (/api/config/module), reset (/api/config/reset),
 * GitHub verify & publish (/api/github/verify, /api/github/publish),
 * static bundle preview (/api/static-bundle), encrypt-url, and Firebase checks.
 */

import {
  verifyAdminRequest,
  verifyCsrfEdge,
  getFirebaseEnvFromEnv,
  encryptVaultValueWeb,
  readSiteConfigFromFirestoreRest,
  writeModuleToFirestoreRest,
  writeSiteConfigToFirestoreRest,
  sanitizeConfigForClientEdge,
  preserveSecretsEdge,
  applyModulePatchEdge,
  appendSyncLogEntryEdge,
  isCmsModuleKey,
  EMPTY_ADMIN_CONFIG,
  cleanEnvVal,
  jsonResponse
} from '../_shared/auth.js';

import {
  verifyGitHubRepoAccessEdge,
  pushStaticFilesToGitHubEdge,
  buildEdgeStaticFiles
} from '../_shared/github.js';

async function readJsonBodySafe(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const path = Array.isArray(params.catchall)
    ? params.catchall.join('/')
    : params.catchall || '';

  // 1. Admin 1-Click AES-256-GCM URL Encryption (`POST /api/admin/encrypt-url`)
  if (path === 'admin/encrypt-url' && request.method === 'POST') {
    const { verification } = await verifyAdminRequest(request, env);
    if (!verification.valid) {
      return jsonResponse({ success: false, error: 'Unauthorized.' }, 401, {}, request, true);
    }
    const csrf = verifyCsrfEdge(request, env);
    if (!csrf.ok) return jsonResponse({ success: false, error: csrf.error }, 403, {}, request, true);

    const body = await readJsonBodySafe(request);
    const rawUrl = cleanEnvVal(body?.url);
    if (!rawUrl) {
      return jsonResponse(
        { success: false, error: 'Please enter a valid download destination URL to encrypt.' },
        400,
        {},
        request,
        true
      );
    }
    const encryptedUrl = await encryptVaultValueWeb(rawUrl, env);
    return jsonResponse({ success: true, encryptedUrl }, 200, {}, request, true);
  }

  // 2. Granular Single-Module Patch (`PATCH /api/config/module`)
  if (path === 'config/module' && request.method === 'PATCH') {
    const { verification } = await verifyAdminRequest(request, env);
    if (!verification.valid) {
      return jsonResponse({ success: false, error: 'Unauthorized.' }, 401, {}, request, true);
    }
    const csrf = verifyCsrfEdge(request, env);
    if (!csrf.ok) return jsonResponse({ success: false, error: csrf.error }, 403, {}, request, true);

    const body = await readJsonBodySafe(request);
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
        // Fallback at clearance
      }
    }

    const sanitized = sanitizeConfigForClientEdge(patched.config, env);
    let firestoreSaved = false;
    if (fbEnv.isConfigured) {
      const res = await writeModuleToFirestoreRest(fbEnv.config, moduleKey, sanitized[moduleKey], {
        updatedAt: sanitized.updatedAt,
        dirtyModulesSinceSync: sanitized.dirtyModulesSinceSync
      });
      firestoreSaved = res.ok;
    }

    return jsonResponse(
      {
        success: true,
        savedModule: moduleKey,
        bytesSent: JSON.stringify(data ?? {}).length,
        dirtyModulesSinceSync: sanitized.dirtyModulesSinceSync || [],
        config: sanitized,
        firestoreSaved,
        savedAt: sanitized.updatedAt
      },
      200,
      {},
      request,
      true
    );
  }

  // 3. Clear Admin Data (`POST /api/config/reset`)
  if (path === 'config/reset' && request.method === 'POST') {
    const { verification } = await verifyAdminRequest(request, env);
    if (!verification.valid) {
      return jsonResponse({ success: false, error: 'Unauthorized.' }, 401, {}, request, true);
    }
    const csrf = verifyCsrfEdge(request, env);
    if (!csrf.ok) return jsonResponse({ success: false, error: csrf.error }, 403, {}, request, true);

    const emptyCopy = JSON.parse(JSON.stringify(EMPTY_ADMIN_CONFIG));
    emptyCopy.updatedAt = Date.now();
    const fbEnv = getFirebaseEnvFromEnv(env);
    if (fbEnv.isConfigured) {
      await writeSiteConfigToFirestoreRest(fbEnv.config, emptyCopy, env);
    }
    return jsonResponse(
      { success: true, config: sanitizeConfigForClientEdge(emptyCopy, env) },
      200,
      {},
      request,
      true
    );
  }

  // 4. Verify GitHub Repository Access (`POST /api/github/verify`)
  if (path === 'github/verify' && request.method === 'POST') {
    const { verification } = await verifyAdminRequest(request, env);
    if (!verification.valid) {
      return jsonResponse({ success: false, error: 'Unauthorized.' }, 401, {}, request, true);
    }
    const csrf = verifyCsrfEdge(request, env);
    if (!csrf.ok) return jsonResponse({ success: false, error: csrf.error }, 403, {}, request, true);

    const body = await readJsonBodySafe(request);
    const ghCfg = body?.githubConfig || body || {};
    const fbEnv = getFirebaseEnvFromEnv(env);
    const persisted = fbEnv.isConfigured ? await readSiteConfigFromFirestoreRest(fbEnv.config) : null;
    const envToken = cleanEnvVal(env.GITHUB_FINE_GRAINED_TOKEN || env.GITHUB_TOKEN || env.GH_TOKEN);
    const incomingTok = cleanEnvVal(ghCfg.fineGrainedToken);
    const token =
      incomingTok && incomingTok !== '__SECRET_CONFIGURED__'
        ? incomingTok
        : cleanEnvVal(persisted?.githubConfig?.fineGrainedToken) || envToken;

    const result = await verifyGitHubRepoAccessEdge({
      repoOwner: ghCfg.repoOwner || persisted?.githubConfig?.repoOwner || cleanEnvVal(env.GITHUB_REPO_OWNER),
      repoName: ghCfg.repoName || persisted?.githubConfig?.repoName || cleanEnvVal(env.GITHUB_REPO_NAME),
      branch: ghCfg.branch || persisted?.githubConfig?.branch || cleanEnvVal(env.GITHUB_BRANCH) || 'main',
      fineGrainedToken: token
    });
    return jsonResponse(result, 200, {}, request, true);
  }

  // 5. Inspect Compiled Static Bundle (`GET /api/static-bundle`)
  if (path === 'static-bundle' && request.method === 'GET') {
    const { verification } = await verifyAdminRequest(request, env);
    if (!verification.valid) {
      return jsonResponse({ success: false, error: 'Unauthorized.' }, 401, {}, request, true);
    }
    const fbEnv = getFirebaseEnvFromEnv(env);
    const cfg = fbEnv.isConfigured
      ? (await readSiteConfigFromFirestoreRest(fbEnv.config)) || EMPTY_ADMIN_CONFIG
      : EMPTY_ADMIN_CONFIG;
    const files = buildEdgeStaticFiles(cfg);
    return jsonResponse(
      {
        success: true,
        compiledAt: Date.now(),
        totalFiles: files.length,
        dirtyModulesSinceSync: cfg.dirtyModulesSinceSync || [],
        filesList: files.map((f) => ({
          path: f.path,
          sizeBytes: f.content.length,
          description: f.description
        }))
      },
      200,
      {},
      request,
      true
    );
  }

  // 6. Push Static Website Bundle to GitHub + Record Audit Sync Logs (`POST /api/github/publish`)
  if (path === 'github/publish' && request.method === 'POST') {
    const { verification } = await verifyAdminRequest(request, env);
    if (!verification.valid) {
      return jsonResponse({ success: false, error: 'Unauthorized.' }, 401, {}, request, true);
    }
    const csrf = verifyCsrfEdge(request, env);
    if (!csrf.ok) return jsonResponse({ success: false, error: csrf.error }, 403, {}, request, true);

    const startTime = Date.now();
    const body = await readJsonBodySafe(request);
    const fbEnv = getFirebaseEnvFromEnv(env);
    const persisted = fbEnv.isConfigured
      ? (await readSiteConfigFromFirestoreRest(fbEnv.config)) || EMPTY_ADMIN_CONFIG
      : EMPTY_ADMIN_CONFIG;

    let merged = body?.config
      ? preserveSecretsEdge(body.config, persisted)
      : JSON.parse(JSON.stringify(persisted));

    const envToken = cleanEnvVal(env.GITHUB_FINE_GRAINED_TOKEN || env.GITHUB_TOKEN || env.GH_TOKEN);
    const effectiveGhCfg = {
      ...(merged.githubConfig || {}),
      repoOwner:
        merged.githubConfig?.repoOwner || cleanEnvVal(env.GITHUB_REPO_OWNER),
      repoName:
        merged.githubConfig?.repoName || cleanEnvVal(env.GITHUB_REPO_NAME),
      branch:
        merged.githubConfig?.branch || cleanEnvVal(env.GITHUB_BRANCH) || 'main',
      fineGrainedToken:
        merged.githubConfig?.fineGrainedToken || envToken
    };

    const customFiles =
      Array.isArray(body?.bundleFiles) && body.bundleFiles.length > 0 ? body.bundleFiles : null;
    const files = customFiles || buildEdgeStaticFiles(merged);
    const modulesChanged = Array.isArray(body?.modulesChanged)
      ? body.modulesChanged
      : merged.dirtyModulesSinceSync || [];

    const pushResult = await pushStaticFilesToGitHubEdge(
      effectiveGhCfg,
      files,
      cleanEnvVal(body?.commitMessage)
    );

    merged = appendSyncLogEntryEdge(
      merged,
      {
        trigger: 'manual-push',
        status: pushResult.status,
        modulesChanged,
        filesCount: files.length,
        changedPaths: files.map((f) => f.path).slice(0, 24),
        branch: effectiveGhCfg.branch,
        repo:
          effectiveGhCfg.repoOwner && effectiveGhCfg.repoName
            ? `${effectiveGhCfg.repoOwner}/${effectiveGhCfg.repoName}`
            : '',
        commitSha: pushResult.commitSha,
        commitUrl: pushResult.commitUrl,
        durationMs: Date.now() - startTime,
        steps: [
          `Prepared ${files.length} static public files (Zero Firebase SDK)`,
          pushResult.ok
            ? `Pushed commit to ${effectiveGhCfg.repoOwner}/${effectiveGhCfg.repoName}`
            : `GitHub push notice: ${pushResult.message}`
        ],
        message: pushResult.message,
        errorDetail: pushResult.ok ? undefined : pushResult.message
      },
      pushResult.ok
    );

    const sanitized = sanitizeConfigForClientEdge(merged, env);
    if (fbEnv.isConfigured) {
      await Promise.all([
        writeModuleToFirestoreRest(fbEnv.config, 'syncLogs', sanitized.syncLogs, {
          updatedAt: sanitized.updatedAt,
          dirtyModulesSinceSync: sanitized.dirtyModulesSinceSync
        }),
        writeModuleToFirestoreRest(fbEnv.config, 'githubConfig', sanitized.githubConfig, {
          updatedAt: sanitized.updatedAt,
          dirtyModulesSinceSync: sanitized.dirtyModulesSinceSync
        })
      ]);
    }

    return jsonResponse(
      {
        success: pushResult.ok,
        publishResult: pushResult,
        syncLog: sanitized.syncLogs?.[0] || null,
        compiledBundle: {
          compiledAt: Date.now(),
          totalFiles: files.length,
          filesList: files.map((f) => ({
            path: f.path,
            sizeBytes: String(f.content || '').length,
            description: f.description || 'Static asset'
          }))
        },
        config: sanitized
      },
      200,
      {},
      request,
      true
    );
  }

  // 7. Authenticated Environment Firebase Config (`GET /api/firebase-config`)
  if (path === 'firebase-config' && request.method === 'GET') {
    const { verification } = await verifyAdminRequest(request, env);
    if (!verification.valid) {
      return jsonResponse({ success: false, error: 'Unauthorized.' }, 401, {}, request, true);
    }
    const fbEnv = getFirebaseEnvFromEnv(env);
    return jsonResponse({ success: true, ...fbEnv }, 200, {}, request, true);
  }

  // 8. Authenticated Firebase Firestore REST Test (`POST /api/firebase/test`)
  if (path === 'firebase/test' && request.method === 'POST') {
    const { verification } = await verifyAdminRequest(request, env);
    if (!verification.valid) {
      return jsonResponse({ success: false, error: 'Unauthorized.' }, 401, {}, request, true);
    }
    const csrf = verifyCsrfEdge(request, env);
    if (!csrf.ok) return jsonResponse({ success: false, error: csrf.error }, 403, {}, request, true);

    const body = await readJsonBodySafe(request);
    const fbEnv = getFirebaseEnvFromEnv(env);
    const raw = body?.firebaseConfig || {};
    const projectId = cleanEnvVal(raw.projectId) || fbEnv.config?.projectId || '';
    const apiKey = cleanEnvVal(raw.apiKey) || fbEnv.config?.apiKey || '';
    const databaseId = cleanEnvVal(raw.databaseId) || fbEnv.config?.databaseId || '(default)';

    if (!apiKey || !projectId) {
      return jsonResponse(
        { success: false, code: 'invalid-config', error: 'Valid Firebase API Key and Project ID are required.' },
        400,
        {},
        request,
        true
      );
    }

    const dbId = encodeURIComponent(databaseId);
    const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      projectId
    )}/databases/${dbId}/documents/siteConfig/main?key=${encodeURIComponent(apiKey)}`;

    try {
      const fbRes = await fetch(endpoint, { headers: { Accept: 'application/json' } });
      if (fbRes.ok) {
        return jsonResponse(
          {
            success: true,
            status: 'connected',
            documentExists: true,
            projectId,
            databaseId,
            message: `Connected to Firestore (${projectId}) — live modular workspace verified.`
          },
          200,
          {},
          request,
          true
        );
      }
      const errData = await fbRes.json().catch(() => ({}));
      const msg = String(errData?.error?.message || fbRes.statusText || '');
      const statusText = String(errData?.error?.status || '');
      if (fbRes.status === 404 && !msg.toLowerCase().includes('database')) {
        return jsonResponse(
          {
            success: true,
            status: 'connected-empty',
            documentExists: false,
            projectId,
            databaseId,
            message: `Connected to Firestore (${projectId}). Database is empty and ready for live edits.`
          },
          200,
          {},
          request,
          true
        );
      }
      return jsonResponse(
        {
          success: false,
          code: statusText || `http-${fbRes.status}`,
          error: msg || `Firestore check failed with HTTP ${fbRes.status}`
        },
        fbRes.status,
        {},
        request,
        true
      );
    } catch (err) {
      return jsonResponse(
        { success: false, code: 'network-error', error: err?.message || 'Firestore request failed' },
        502,
        {},
        request,
        true
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
    404,
    {},
    request,
    true
  );
}
