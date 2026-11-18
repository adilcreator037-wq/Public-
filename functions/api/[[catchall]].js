/**
 * Cloudflare Pages Function: Edge API Router & Catch-All (/api/[[catchall]])
 * Supports modular patch (/api/config/module, /api/config/modules), news (/api/news),
 * reset (/api/config/reset), GitHub verify & publish (/api/github/verify, /api/github/publish),
 * static bundle preview (/api/static-bundle), encrypt-url, and Firebase checks.
 */

import { getAdminWorkspaceShellHtml } from "../_shared/admin-workspace-html.js";
import {
  sanitizeFirebaseConfigForClientEdge,
  verifyAdminRequest,
  verifyCsrfEdge,
  getFirebaseEnvFromEnv,
  encryptVaultValueWeb,
  readSiteConfigFromFirestoreRest,
  readSiteConfigWithStatusEdge,
  writeBatchToFirestoreRest,
  writeSiteConfigToFirestoreRest,
  sanitizeConfigForClientEdge,
  preserveSecretsEdge,
  applyModulePatchEdge,
  applyMultiModulePatchEdge,
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
import { buildPartialRoutePayloadEdge } from '../_shared/static-compiler.js';

async function loadEdgeTemplates(env, reqUrl) {
  const fetchAsset = async (assetPath) => {
    if (!env?.ASSETS?.fetch) return undefined;
    try {
      const url = new URL(assetPath, reqUrl);
      const res = await env.ASSETS.fetch(new Request(url.toString()));
      if (res && res.ok) return await res.text();
    } catch {
      // fallback to internal template
    }
    return undefined;
  };
  const [indexHtmlTemplate, moreinfoHtmlTemplate, appJsContent, moreinfoJsContent] = await Promise.all([
    fetchAsset('/index.html'),
    fetchAsset('/moreinfo.html'),
    fetchAsset('/app.js'),
    fetchAsset('/moreinfo.js')
  ]);
  return { indexHtmlTemplate, moreinfoHtmlTemplate, appJsContent, moreinfoJsContent };
}

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

  // 0. Public Per-URL Route Payload Endpoint (`GET /api/route?path=/news&cat=ALL`)
  if (path === 'route' && request.method === 'GET') {
    const reqUrl = new URL(request.url);
    const rawPath = String(reqUrl.searchParams.get('path') || '/').trim() || '/';
    const newsCategory = String(reqUrl.searchParams.get('cat') || 'ALL').trim() || 'ALL';
    const fbEnv = getFirebaseEnvFromEnv(env);
    let cfg = EMPTY_ADMIN_CONFIG;
    if (fbEnv.isConfigured) {
      const readRes = await readSiteConfigWithStatusEdge(fbEnv.config, env);
      if (readRes.status === 'ok' && readRes.config) {
        cfg = readRes.config;
      }
    }
    const payload = buildPartialRoutePayloadEdge(rawPath, cfg, newsCategory);
    return jsonResponse(
      {
        success: true,
        payload
      },
      200,
      { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=120' },
      request,
      false
    );
  }

  // 0a. Authenticated Admin Studio Workspace HTML Loader (`GET /api/admin/workspace`)
  if (path === 'admin/workspace' && request.method === 'GET') {
    const { verification } = await verifyAdminRequest(request, env);
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
    return jsonResponse(
      {
        success: true,
        html: getAdminWorkspaceShellHtml()
      },
      200,
      {},
      request,
      true
    );
  }

  // 0b. Clear Sync & Activity Logs (`POST /api/admin/clear-logs`)
  if (path === 'admin/clear-logs' && request.method === 'POST') {
    const { verification } = await verifyAdminRequest(request, env);
    if (!verification.valid) {
      return jsonResponse({ success: false, error: 'Unauthorized.' }, 401, {}, request, true);
    }
    const csrf = verifyCsrfEdge(request, env);
    if (!csrf.ok) return jsonResponse({ success: false, error: csrf.error }, 403, {}, request, true);

    const fbEnv = getFirebaseEnvFromEnv(env);
    if (!fbEnv.isConfigured) {
      return jsonResponse(
        {
          success: false,
          firestoreSaved: false,
          error: 'Firebase is not configured in Cloudflare environment variables. Add FIREBASE_API_KEY and FIREBASE_PROJECT_ID to clear logs.'
        },
        503,
        {},
        request,
        true
      );
    }

    const readRes = await readSiteConfigWithStatusEdge(fbEnv.config, env);
    if (readRes.status === 'error') {
      return jsonResponse(
        {
          success: false,
          firestoreSaved: false,
          error: `Firebase Firestore read failed before clearing logs: ${readRes.error || 'Unknown error'}`
        },
        502,
        {},
        request,
        true
      );
    }

    const existing = readRes.config || JSON.parse(JSON.stringify(EMPTY_ADMIN_CONFIG));
    existing.syncLogs = [];
    if (existing.githubConfig) {
      existing.githubConfig.deployHistory = [];
    }
    existing.updatedAt = Date.now();
    const sanitized = sanitizeConfigForClientEdge(existing, env);

    const batchRes = await writeBatchToFirestoreRest(
      fbEnv.config,
      {
        syncLogs: [],
        githubConfig: existing.githubConfig
      },
      { updatedAt: existing.updatedAt, dirtyModulesSinceSync: existing.dirtyModulesSinceSync || [] },
      env
    );
    if (!batchRes.ok) {
      return jsonResponse(
        {
          success: false,
          firestoreSaved: false,
          error: `Firebase Firestore rejected log clear: ${batchRes.error || 'Unknown error'}`
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
        firestoreSaved: true,
        config: sanitized
      },
      200,
      {},
      request,
      true
    );
  }

  // 0c. Connect or Revert Runtime Firebase Connection (`POST /api/firebase/connect`)
  if (path === 'firebase/connect' && request.method === 'POST') {
    const { verification } = await verifyAdminRequest(request, env);
    if (!verification.valid) {
      return jsonResponse({ success: false, error: 'Unauthorized.' }, 401, {}, request, true);
    }
    const csrf = verifyCsrfEdge(request, env);
    if (!csrf.ok) return jsonResponse({ success: false, error: csrf.error }, 403, {}, request, true);

    const body = await readJsonBodySafe(request);
    const fbEnv = getFirebaseEnvFromEnv(env);
    if (body?.clear) {
      return jsonResponse(
        {
          success: true,
          cleared: true,
          isConfigured: fbEnv.isConfigured,
          config: sanitizeFirebaseConfigForClientEdge(fbEnv.config)
        },
        200,
        {},
        request,
        true
      );
    }

    const raw = body?.firebaseConfig || body || {};
    const projectId = cleanEnvVal(raw.projectId) || fbEnv.config?.projectId || '';
    const apiKey =
      raw.apiKey && raw.apiKey !== '__SECRET_CONFIGURED__'
        ? cleanEnvVal(raw.apiKey)
        : fbEnv.config?.apiKey || '';
    const databaseId = cleanEnvVal(raw.databaseId) || fbEnv.config?.databaseId || '(default)';

    if (!apiKey || !projectId) {
      return jsonResponse(
        { success: false, error: 'Valid Firebase API Key and Project ID are required.' },
        400,
        {},
        request,
        true
      );
    }

    const candidateConfig = {
      apiKey,
      projectId,
      authDomain: cleanEnvVal(raw.authDomain) || `${projectId}.firebaseapp.com`,
      storageBucket: cleanEnvVal(raw.storageBucket) || `${projectId}.appspot.com`,
      messagingSenderId: cleanEnvVal(raw.messagingSenderId),
      appId: cleanEnvVal(raw.appId),
      databaseId
    };

    const readRes = await readSiteConfigWithStatusEdge(candidateConfig, env);
    if (readRes.status === 'error') {
      return jsonResponse(
        {
          success: false,
          error: `Unable to connect to Firestore (${projectId}): ${readRes.error || 'Connection failed'}`
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
        isConfigured: true,
        config: sanitizeFirebaseConfigForClientEdge(candidateConfig),
        siteConfig: readRes.config ? sanitizeConfigForClientEdge(readRes.config, env) : null
      },
      200,
      {},
      request,
      true
    );
  }

  // 0d. Device Image Upload Fallback on Stateless Edge (`POST /api/upload-image`)
  if (path === 'upload-image' && request.method === 'POST') {
    const { verification } = await verifyAdminRequest(request, env);
    if (!verification.valid) {
      return jsonResponse({ success: false, error: 'Unauthorized.' }, 401, {}, request, true);
    }
    const csrf = verifyCsrfEdge(request, env);
    if (!csrf.ok) return jsonResponse({ success: false, error: csrf.error }, 403, {}, request, true);

    const body = await readJsonBodySafe(request);
    const { fileName = 'image.png', dataUrl = '' } = body || {};
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      return jsonResponse({ success: false, error: 'Valid image dataUrl is required.' }, 400, {}, request, true);
    }
    const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return jsonResponse({ success: false, error: 'Invalid base64 image format.' }, 400, {}, request, true);
    }
    if (dataUrl.length > 1_600_000) {
      return jsonResponse(
        {
          success: false,
          error: 'Image exceeds 1.2 MB edge upload limit. Compress the image or paste an external CDN/SVG URL.'
        },
        413,
        {},
        request,
        true
      );
    }
    return jsonResponse(
      {
        success: true,
        url: dataUrl,
        fileName: String(fileName || 'image.png'),
        sizeBytes: Math.floor((matches[2].length * 3) / 4),
        storageMode: 'inline-data-url'
      },
      200,
      {},
      request,
      true
    );
  }

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

    const readRes = await readSiteConfigWithStatusEdge(fbEnv.config, env);
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
        // Fallback at clearance
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
      [moduleKey]: nextConfig[moduleKey],
      syncLogs: nextConfig.syncLogs,
      githubConfig: nextConfig.githubConfig
    };
    if (moduleKey === 'domainConfig') batchModules.seo = nextConfig.seo;
    if (moduleKey === 'seo') batchModules.domainConfig = nextConfig.domainConfig;

    const res = await writeBatchToFirestoreRest(
      fbEnv.config,
      batchModules,
      {
        updatedAt: nextConfig.updatedAt,
        dirtyModulesSinceSync: nextConfig.dirtyModulesSinceSync
      },
      env
    );
    if (!res.ok) {
      return jsonResponse(
        {
          success: false,
          firestoreSaved: false,
          error: `Firebase Firestore rejected module save: ${res.error || 'Unknown error'}`
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
        savedAt: sanitized.updatedAt
      },
      200,
      {},
      request,
      true
    );
  }

  // 2b. Atomic Batch Multi-Module Patch (`PATCH /api/config/modules`)
  if (path === 'config/modules' && request.method === 'PATCH') {
    const { verification } = await verifyAdminRequest(request, env);
    if (!verification.valid) {
      return jsonResponse({ success: false, error: 'Unauthorized.' }, 401, {}, request, true);
    }
    const csrf = verifyCsrfEdge(request, env);
    if (!csrf.ok) return jsonResponse({ success: false, error: csrf.error }, 403, {}, request, true);

    const body = await readJsonBodySafe(request);
    const modulesMap = body?.modules && typeof body.modules === 'object' ? body.modules : body;
    const validKeys = Object.keys(modulesMap || {}).filter((k) => isCmsModuleKey(k) && modulesMap[k] !== undefined);
    if (validKeys.length === 0) {
      return jsonResponse({ success: false, error: 'Provide at least one valid CMS module in `modules`.' }, 400, {}, request, true);
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

    const readRes = await readSiteConfigWithStatusEdge(fbEnv.config, env);
    if (readRes.status === 'error') {
      return jsonResponse(
        {
          success: false,
          firestoreSaved: false,
          error: `Firebase Firestore read failed before batch save: ${readRes.error || 'Unable to read existing configuration'}`
        },
        502,
        {},
        request,
        true
      );
    }
    const existing = readRes.config || EMPTY_ADMIN_CONFIG;

    const patched = applyMultiModulePatchEdge(existing, modulesMap);
    if (validKeys.includes('securityGate') && patched.config.securityGate?.primaryDownloadUrl) {
      try {
        patched.config.securityGate.encryptedPrimaryUrl = await encryptVaultValueWeb(
          patched.config.securityGate.primaryDownloadUrl,
          env
        );
      } catch {
        // Fallback at clearance
      }
    }

    let nextConfig = patched.config;
    const nonLogKeys = validKeys.filter((k) => k !== 'syncLogs');
    if (nonLogKeys.length > 0) {
      nextConfig = appendSyncLogEntryEdge(
        nextConfig,
        {
          trigger: 'firebase-save',
          status: 'saved',
          modulesChanged: nonLogKeys,
          filesCount: nonLogKeys.length,
          branch: nextConfig.githubConfig?.branch || 'main',
          repo:
            nextConfig.githubConfig?.repoOwner && nextConfig.githubConfig?.repoName
              ? `${nextConfig.githubConfig.repoOwner}/${nextConfig.githubConfig.repoName}`
              : '',
          durationMs: 0,
          steps: [
            `Batch-saved ${nonLogKeys.length} module(s) (${nonLogKeys.join(', ')}) to Cloud Firestore (${fbEnv.config?.projectId})`,
            'Staged for next GitHub static site deployment'
          ],
          message: `Batch-saved ${nonLogKeys.length} module(s) to Firebase Firestore.`
        },
        false
      );
    }

    const sanitized = sanitizeConfigForClientEdge(nextConfig, env);
    const batchData = {
      syncLogs: nextConfig.syncLogs,
      githubConfig: nextConfig.githubConfig
    };
    for (const k of validKeys) batchData[k] = nextConfig[k];
    if (validKeys.includes('domainConfig')) batchData.seo = nextConfig.seo;
    if (validKeys.includes('seo')) batchData.domainConfig = nextConfig.domainConfig;

    const res = await writeBatchToFirestoreRest(
      fbEnv.config,
      batchData,
      {
        updatedAt: nextConfig.updatedAt,
        dirtyModulesSinceSync: nextConfig.dirtyModulesSinceSync
      },
      env
    );
    if (!res.ok) {
      return jsonResponse(
        {
          success: false,
          firestoreSaved: false,
          error: `Firebase Firestore rejected batch save: ${res.error || 'Unknown error'}`
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
        savedModules: patched.savedModules,
        dirtyModulesSinceSync: sanitized.dirtyModulesSinceSync || [],
        config: sanitized,
        firestoreSaved: true,
        firestoreNotice: null,
        savedAt: sanitized.updatedAt
      },
      200,
      {},
      request,
      true
    );
  }

  // 2c. Publish News Post (`POST /api/news`)
  if (path === 'news' && request.method === 'POST') {
    const { verification } = await verifyAdminRequest(request, env);
    if (!verification.valid) {
      return jsonResponse({ success: false, error: 'Unauthorized.' }, 401, {}, request, true);
    }
    const csrf = verifyCsrfEdge(request, env);
    if (!csrf.ok) return jsonResponse({ success: false, error: csrf.error }, 403, {}, request, true);

    const fbEnv = getFirebaseEnvFromEnv(env);
    if (!fbEnv.isConfigured) {
      return jsonResponse(
        {
          success: false,
          firestoreSaved: false,
          error: 'Firebase is not configured in Cloudflare environment variables. Add FIREBASE_API_KEY and FIREBASE_PROJECT_ID to publish news.'
        },
        503,
        {},
        request,
        true
      );
    }

    const readRes = await readSiteConfigWithStatusEdge(fbEnv.config, env);
    if (readRes.status === 'error') {
      return jsonResponse(
        {
          success: false,
          firestoreSaved: false,
          error: `Firebase Firestore read failed before publishing news: ${readRes.error || 'Unknown error'}`
        },
        502,
        {},
        request,
        true
      );
    }
    const existing = readRes.config || JSON.parse(JSON.stringify(EMPTY_ADMIN_CONFIG));

    const body = await readJsonBodySafe(request);
    const {
      title,
      date,
      category,
      excerpt,
      summary,
      bodyHtml,
      htmlContent,
      coverImage,
      coverImageUrl,
      featured,
      readTime,
      author
    } = body || {};
    const finalSummary = String(summary || excerpt || '').trim();
    const finalHtml = String(htmlContent || bodyHtml || '').trim();
    const finalCover = String(coverImageUrl || coverImage || '').trim();
    if (!title || !finalSummary) {
      return jsonResponse({ success: false, error: 'Title and Summary are required.' }, 400, {}, request, true);
    }

    const cleanSlug =
      String(title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || `post-${Date.now()}`;

    const newPost = {
      id: `news-${Date.now()}`,
      slug: cleanSlug,
      title: String(title).trim(),
      date: date ? String(date).trim() : new Date().toISOString().slice(0, 10),
      category: category ? String(category).trim() : 'Release',
      summary: finalSummary,
      htmlContent: finalHtml || `<p>${finalSummary}</p>`,
      coverImageUrl: finalCover,
      featured: Boolean(featured),
      readTime: readTime ? String(readTime).trim() : '2 min read',
      author: author ? String(author).trim() : 'Editorial Team'
    };

    if (!existing.newsSection) {
      existing.newsSection = { heading: '', subheading: '', layout: 'featured-grid', articles: [] };
    }
    if (!Array.isArray(existing.newsSection.articles)) {
      existing.newsSection.articles = [];
    }
    existing.newsSection.articles.unshift(newPost);

    const patched = applyModulePatchEdge(existing, 'newsSection', existing.newsSection);
    const nextConfig = appendSyncLogEntryEdge(
      patched.config,
      {
        trigger: 'firebase-save',
        status: 'saved',
        modulesChanged: ['newsSection'],
        filesCount: 1,
        branch: patched.config.githubConfig?.branch || 'main',
        repo:
          patched.config.githubConfig?.repoOwner && patched.config.githubConfig?.repoName
            ? `${patched.config.githubConfig.repoOwner}/${patched.config.githubConfig.repoName}`
            : '',
        durationMs: 0,
        steps: [
          `Saved news article "${newPost.title}" to Cloud Firestore (${fbEnv.config?.projectId})`,
          'Staged for next GitHub static site deployment'
        ],
        message: `Published news article "${newPost.title}" to Firebase Firestore.`
      },
      false
    );

    const sanitized = sanitizeConfigForClientEdge(nextConfig, env);
    const res = await writeBatchToFirestoreRest(
      fbEnv.config,
      {
        newsSection: nextConfig.newsSection,
        syncLogs: nextConfig.syncLogs,
        githubConfig: nextConfig.githubConfig
      },
      {
        updatedAt: nextConfig.updatedAt,
        dirtyModulesSinceSync: nextConfig.dirtyModulesSinceSync
      },
      env
    );
    if (!res.ok) {
      return jsonResponse(
        {
          success: false,
          firestoreSaved: false,
          error: `Firebase Firestore rejected news save: ${res.error || 'Unknown error'}`
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
        post: newPost,
        config: sanitized,
        firestoreSaved: true,
        firestoreNotice: null
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

    const fbEnv = getFirebaseEnvFromEnv(env);
    if (!fbEnv.isConfigured) {
      return jsonResponse(
        {
          success: false,
          firestoreSaved: false,
          error: 'Firebase is not configured in Cloudflare environment variables. Add FIREBASE_API_KEY and FIREBASE_PROJECT_ID to reset workspace.'
        },
        503,
        {},
        request,
        true
      );
    }

    const emptyCopy = JSON.parse(JSON.stringify(EMPTY_ADMIN_CONFIG));
    emptyCopy.updatedAt = Date.now();
    const res = await writeSiteConfigToFirestoreRest(fbEnv.config, emptyCopy, env);
    if (!res.ok) {
      return jsonResponse(
        {
          success: false,
          firestoreSaved: false,
          error: `Firebase Firestore rejected workspace reset: ${res.error || 'Unknown error'}`
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
        firestoreSaved: true,
        config: sanitizeConfigForClientEdge(emptyCopy, env)
      },
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
    const persisted = fbEnv.isConfigured ? await readSiteConfigFromFirestoreRest(fbEnv.config, env) : null;
    const envToken = cleanEnvVal(env.GITHUB_FINE_GRAINED_TOKEN || env.GITHUB_TOKEN || env.GH_TOKEN);
    const incomingTok = cleanEnvVal(ghCfg.fineGrainedToken);
    const token =
      incomingTok && incomingTok !== '__SECRET_CONFIGURED__'
        ? incomingTok
        : cleanEnvVal(persisted?.githubConfig?.fineGrainedToken) || envToken;

    const repoOwner = ghCfg.repoOwner || persisted?.githubConfig?.repoOwner || cleanEnvVal(env.GITHUB_REPO_OWNER);
    const repoName = ghCfg.repoName || persisted?.githubConfig?.repoName || cleanEnvVal(env.GITHUB_REPO_NAME);
    const branch = ghCfg.branch || persisted?.githubConfig?.branch || cleanEnvVal(env.GITHUB_BRANCH) || 'main';

    const result = await verifyGitHubRepoAccessEdge({
      repoOwner,
      repoName,
      branch,
      fineGrainedToken: token
    });

    if (result.ok && fbEnv.isConfigured && token) {
      const baseCfg = persisted || JSON.parse(JSON.stringify(EMPTY_ADMIN_CONFIG));
      const patched = applyModulePatchEdge(baseCfg, 'githubConfig', {
        ...(baseCfg.githubConfig || {}),
        repoOwner,
        repoName,
        branch: result.defaultBranch || branch,
        fineGrainedToken: token,
        hasFineGrainedToken: true
      });
      await writeBatchToFirestoreRest(
        fbEnv.config,
        { githubConfig: patched.config.githubConfig },
        { updatedAt: patched.config.updatedAt, dirtyModulesSinceSync: patched.config.dirtyModulesSinceSync },
        env
      );
      return jsonResponse(
        {
          ...result,
          config: sanitizeConfigForClientEdge(patched.config, env)
        },
        200,
        {},
        request,
        true
      );
    }

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
      ? (await readSiteConfigFromFirestoreRest(fbEnv.config, env)) || EMPTY_ADMIN_CONFIG
      : EMPTY_ADMIN_CONFIG;
    const templates = await loadEdgeTemplates(env, request.url);
    const files = buildEdgeStaticFiles(cfg, templates);
    const distinctIcons = new Set(
      [
        cfg.brand?.logoUrl,
        cfg.brand?.faviconUrl,
        cfg.brand?.searchLogoUrl,
        cfg.brand?.appleTouchIconUrl
      ]
        .map((u) => String(u || '').trim())
        .filter(Boolean)
    );
    return jsonResponse(
      {
        success: true,
        compiledAt: Date.now(),
        totalFiles: files.length,
        dirtyModulesSinceSync: cfg.dirtyModulesSinceSync || [],
        contentSource: fbEnv.isConfigured ? 'Live Cloud Firestore' : 'Local Admin Workspace',
        brandSummary: {
          name: cfg.brand?.name || '',
          logoUrl: cfg.brand?.logoUrl || '',
          faviconUrl: cfg.brand?.faviconUrl || '',
          primaryDomain: cfg.domainConfig?.primaryDomain || cfg.seo?.canonicalUrl || ''
        },
        seoManifestSummary: {
          manifestEnabled: cfg.domainConfig?.enableWebManifest !== false,
          sitemapEnabled: cfg.domainConfig?.enableSitemapXml !== false,
          robotsEnabled: true,
          rssEnabled: Boolean(cfg.domainConfig?.enableRssFeed),
          manifestIconsCount: distinctIcons.size
        },
        filesList: files.map((f) => ({
          path: f.path,
          sizeBytes: String(f.content || '').length,
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
    let persisted = EMPTY_ADMIN_CONFIG;
    if (fbEnv.isConfigured) {
      const readRes = await readSiteConfigWithStatusEdge(fbEnv.config, env);
      if (readRes.status === 'error') {
        return jsonResponse(
          {
            success: false,
            firestoreSaved: false,
            error: `Firebase Firestore read failed before GitHub publish: ${readRes.error || 'Unable to load workspace configuration'}`
          },
          502,
          {},
          request,
          true
        );
      }
      if (readRes.config) persisted = readRes.config;
    }

    let merged = body?.config
      ? preserveSecretsEdge(body.config, persisted)
      : JSON.parse(JSON.stringify(persisted));

    const ghOverride =
      body?.githubConfig && typeof body.githubConfig === 'object'
        ? body.githubConfig
        : !body?.config && (body?.repoOwner || body?.repoName || body?.fineGrainedToken)
        ? body
        : null;
    if (ghOverride) {
      merged = preserveSecretsEdge({ ...merged, githubConfig: ghOverride }, merged);
    }

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
    const templates = customFiles ? {} : await loadEdgeTemplates(env, request.url);
    const files = customFiles || buildEdgeStaticFiles(merged, templates);
    const modulesChanged = Array.isArray(body?.modulesChanged)
      ? body.modulesChanged
      : merged.dirtyModulesSinceSync || [];

    const pushResult = await pushStaticFilesToGitHubEdge(
      effectiveGhCfg,
      files,
      cleanEnvVal(body?.commitMessage)
    );

    const changedList =
      Array.isArray(pushResult.changedPaths) && pushResult.changedPaths.length > 0
        ? pushResult.changedPaths
        : pushResult.skipped
        ? []
        : files.map((f) => f.path).slice(0, 24);

    merged = appendSyncLogEntryEdge(
      merged,
      {
        trigger: 'manual-push',
        status: pushResult.status,
        modulesChanged,
        filesCount: pushResult.filesPushed ?? files.length,
        addedCount: pushResult.addedCount,
        updatedCount: pushResult.updatedCount,
        deletedCount: pushResult.deletedCount,
        unchangedCount: pushResult.unchangedCount,
        skipped: pushResult.skipped,
        changedPaths: changedList,
        branch: effectiveGhCfg.branch,
        repo:
          effectiveGhCfg.repoOwner && effectiveGhCfg.repoName
            ? `${effectiveGhCfg.repoOwner}/${effectiveGhCfg.repoName}`
            : '',
        commitSha: pushResult.commitSha,
        commitUrl: pushResult.commitUrl,
        durationMs: Date.now() - startTime,
        steps: [
          `Compiled ${files.length} complete static public files (Zero Firebase SDK)`,
          pushResult.skipped
            ? 'Remote repository matches compiled bundle (0 changed files — skipped empty commit)'
            : pushResult.ok
            ? `Pushed commit (+${pushResult.addedCount || 0} / ~${pushResult.updatedCount || 0} / -${pushResult.deletedCount || 0}) to ${effectiveGhCfg.repoOwner}/${effectiveGhCfg.repoName}`
            : `GitHub push notice: ${pushResult.message}`
        ],
        message: pushResult.message,
        errorDetail: pushResult.ok ? undefined : pushResult.message
      },
      pushResult.ok
    );

    const sanitized = sanitizeConfigForClientEdge(merged, env);
    let firestoreSaved = false;
    let firestoreNotice = null;
    if (fbEnv.isConfigured) {
      const batchRes = await writeBatchToFirestoreRest(
        fbEnv.config,
        {
          syncLogs: merged.syncLogs,
          githubConfig: merged.githubConfig
        },
        {
          updatedAt: merged.updatedAt,
          dirtyModulesSinceSync: merged.dirtyModulesSinceSync
        },
        env
      );
      firestoreSaved = batchRes.ok;
      if (!batchRes.ok) {
        firestoreNotice = `GitHub publish completed, but Firestore sync log update failed: ${batchRes.error || 'Unknown error'}`;
      }
    } else {
      firestoreNotice = 'Firebase is not configured; sync log was returned for this session only.';
    }

    return jsonResponse(
      {
        success: pushResult.ok,
        firestoreSaved,
        firestoreNotice,
        publishResult: pushResult,
        addedCount: pushResult.addedCount ?? 0,
        updatedCount: pushResult.updatedCount ?? 0,
        deletedCount: pushResult.deletedCount ?? 0,
        unchangedCount: pushResult.unchangedCount ?? 0,
        skipped: Boolean(pushResult.skipped),
        filesCount: pushResult.filesPushed ?? files.length,
        compiledLocalFiles: files.length,
        commitSha: pushResult.commitSha,
        commitUrl: pushResult.commitUrl,
        message: pushResult.message,
        ...(pushResult.ok ? {} : { error: pushResult.message }),
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
    return jsonResponse({ success: true, isConfigured: fbEnv.isConfigured, config: sanitizeFirebaseConfigForClientEdge(fbEnv.config) }, 200, {}, request, true);
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
    const rawKey = cleanEnvVal(raw.apiKey);
    const apiKey =
      rawKey && rawKey !== '__SECRET_CONFIGURED__'
        ? rawKey
        : fbEnv.config?.apiKey || '';
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
      if (fbRes.status === 403 || statusText === 'PERMISSION_DENIED') {
        return jsonResponse(
          {
            success: false,
            code: 'permission-denied',
            projectId,
            databaseId,
            error: 'Firestore Rules blocked access (403 PERMISSION_DENIED). Allow read/write on siteConfig/main and cmsModules/{module}.'
          },
          403,
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
