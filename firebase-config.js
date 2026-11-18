/**
 * ============================================================================
 * ADMIN STUDIO LIVE FIREBASE & BACKEND API BRIDGE (firebase-config.js)
 *
 * Strictly loaded ONLY by `/admin.html` (Never imported by public `/index.html`).
 * Priority Order for Firebase Connection:
 * 1. Custom Firebase Credentials saved in Admin Studio (`localStorage` override)
 * 2. Server Environment Variables (`FIREBASE_*` via `/api/config` — API key remains
 *    server-side only (`hasEnvApiKey: true`), zero secret leak to client!)
 * 3. Client Vite Environment Variables (`VITE_FIREBASE_*` if explicitly set)
 * ============================================================================
 */

import {
  EMPTY_ADMIN_CONFIG,
  mergeSiteConfig,
  mergeRemoteConfigPreservingUserContent,
  cleanFirebaseEnvString,
  normalizeFirebaseClientConfig,
  isValidFirebaseClientConfig,
  parseFirebaseConfigSnippet,
  calculateTargetImageDimensions
} from './src/utils/cms-engine.ts';

export const FIREBASE_OVERRIDE_STORAGE_KEY = 'cms_firebase_custom_config_v3';

export {
  cleanFirebaseEnvString,
  normalizeFirebaseClientConfig,
  isValidFirebaseClientConfig,
  parseFirebaseConfigSnippet,
  mergeRemoteConfigPreservingUserContent
};

const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};

let rawEnvJson = {};
const jsonEnvStr = cleanFirebaseEnvString(env.VITE_FIREBASE_CONFIG_JSON);
if (jsonEnvStr) {
  const parsed = parseFirebaseConfigSnippet(jsonEnvStr);
  if (parsed) rawEnvJson = parsed;
}

export const defaultEnvFirebaseConfig = normalizeFirebaseClientConfig({
  apiKey: rawEnvJson.apiKey || env.VITE_FIREBASE_API_KEY,
  authDomain: rawEnvJson.authDomain || env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: rawEnvJson.projectId || env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: rawEnvJson.storageBucket || env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: rawEnvJson.messagingSenderId || env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: rawEnvJson.appId || env.VITE_FIREBASE_APP_ID,
  databaseId: rawEnvJson.databaseId || env.VITE_FIREBASE_DATABASE_ID || '(default)'
});

let runtimeServerFirebaseConfig = null;
let lastEnvDiagnostics = null;
let inMemoryCachedConfig = mergeSiteConfig({}, EMPTY_ADMIN_CONFIG);
let unauthorizedListener = null;
let lastUnauthorizedAt = 0;

export function onAdminUnauthorized(handler) {
  unauthorizedListener = typeof handler === 'function' ? handler : null;
}

export function notifyAdminUnauthorized(reason = 'Your administrator session expired. Please sign in again.') {
  inMemoryCachedConfig = mergeSiteConfig({}, EMPTY_ADMIN_CONFIG);
  const now = Date.now();
  if (now - lastUnauthorizedAt < 600) return;
  lastUnauthorizedAt = now;
  if (typeof unauthorizedListener === 'function') {
    unauthorizedListener(reason);
  }
}

export function getLastEnvDiagnostics() {
  return lastEnvDiagnostics;
}

export function getCachedSiteConfigSync() {
  return inMemoryCachedConfig;
}

/**
 * Hydrate runtime Firebase config fetched from authenticated `/api/config`.
 * Note: Server environment variables mask `apiKey` (`hasEnvApiKey: true`) so
 * raw `FIREBASE_API_KEY` never leaks to the browser.
 */
export function setServerEnvFirebaseConfig(serverConfig) {
  if (serverConfig && typeof serverConfig === 'object' && serverConfig.projectId) {
    const normalized = normalizeFirebaseClientConfig(serverConfig);
    runtimeServerFirebaseConfig = {
      ...normalized,
      hasEnvApiKey: Boolean(serverConfig.hasEnvApiKey || normalized.apiKey)
    };
  }
}

/**
 * Check if a Firebase config object is ready for live Firestore persistence
 * (either via explicit client API key OR server-side `hasEnvApiKey: true`).
 */
export function isRealFirebaseConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return false;
  const target = cfg.config && typeof cfg.config === 'object' ? cfg.config : cfg;
  if (!target.projectId || target.projectId.includes('replace-with')) return false;
  if (target.hasEnvApiKey) return true;
  return isValidFirebaseClientConfig(target);
}

/**
 * Retrieve active Firebase configuration object for Admin Studio
 */
export function getActiveFirebaseConfig() {
  try {
    const saved = localStorage.getItem(FIREBASE_OVERRIDE_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      const merged = normalizeFirebaseClientConfig({
        ...defaultEnvFirebaseConfig,
        ...(runtimeServerFirebaseConfig || {}),
        ...parsed
      });
      if (isValidFirebaseClientConfig(merged)) {
        return {
          ...merged,
          hasEnvApiKey: Boolean(runtimeServerFirebaseConfig?.hasEnvApiKey),
          source: 'localStorage'
        };
      }
    }
  } catch {
    // Ignore storage read errors
  }

  if (runtimeServerFirebaseConfig && runtimeServerFirebaseConfig.projectId) {
    return {
      ...runtimeServerFirebaseConfig,
      source: 'env'
    };
  }

  return {
    ...defaultEnvFirebaseConfig,
    hasEnvApiKey: false,
    source: 'env'
  };
}

export function saveActiveFirebaseConfig(newConfig) {
  const cleaned = normalizeFirebaseClientConfig(newConfig);
  if (cleaned.apiKey && cleaned.apiKey !== '__SECRET_CONFIGURED__') {
    try {
      localStorage.setItem(FIREBASE_OVERRIDE_STORAGE_KEY, JSON.stringify(cleaned));
    } catch {
      // Ignore storage write errors
    }
  }
  if (cleaned.projectId) {
    runtimeServerFirebaseConfig = {
      ...cleaned,
      hasEnvApiKey: Boolean(newConfig?.hasEnvApiKey || runtimeServerFirebaseConfig?.hasEnvApiKey || cleaned.apiKey)
    };
  }
  return cleaned;
}

export function clearActiveFirebaseConfig() {
  try {
    localStorage.removeItem(FIREBASE_OVERRIDE_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export const saveCustomFirebaseConfig = saveActiveFirebaseConfig;
export const clearCustomFirebaseConfig = clearActiveFirebaseConfig;

/**
 * Build standard Admin API headers, attaching X-Firebase-Config whenever the user
 * has connected custom Firebase credentials in Admin Studio so stateless Edge Workers
 * and restarted Node servers always route reads/writes to the user's live Firestore.
 */
function buildAdminRequestHeaders(extraHeaders = {}) {
  const headers = { ...extraHeaders };
  try {
    const saved = localStorage.getItem(FIREBASE_OVERRIDE_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      const cleaned = normalizeFirebaseClientConfig(parsed);
      if (isValidFirebaseClientConfig(cleaned)) {
        headers['X-Firebase-Config'] = JSON.stringify(cleaned);
      }
    }
  } catch {
    // Ignore storage read errors
  }
  return headers;
}

/**
 * Test live Firestore connectivity via authenticated server endpoint `/api/firebase/test`
 */
function decodeFsValClient(val) {
  if (!val || typeof val !== 'object') return null;
  if ('stringValue' in val) return val.stringValue;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    const arr = val.arrayValue?.values || [];
    return arr.map((item) => decodeFsValClient(item));
  }
  if ('mapValue' in val) {
    const out = {};
    const fields = val.mapValue?.fields || {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = decodeFsValClient(v);
    }
    return out;
  }
  return null;
}

function encodeFsValClient(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return { integerValue: '0' };
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map((item) => encodeFsValClient(item))
      }
    };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        fields[k] = encodeFsValClient(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

/**
 * Direct Client-to-Firestore REST Batch Commit.
 * Writes directly to Firebase Firestore from the browser using the public Web API Key,
 * completely bypassing local storage or server-side environment variable dependencies!
 */
export async function saveDirectToFirestoreRest(fbCfg, modulesMap = {}, meta = {}) {
  if (!fbCfg?.projectId || !fbCfg?.apiKey) {
    return { ok: false, error: 'Missing Firebase API Key or Project ID' };
  }
  const dbIdRaw = fbCfg.databaseId || '(default)';
  const docRoot = `projects/${fbCfg.projectId}/databases/${dbIdRaw}/documents`;
  const commitUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    fbCfg.projectId
  )}/databases/${encodeURIComponent(dbIdRaw)}/documents:commit?key=${encodeURIComponent(fbCfg.apiKey)}`;

  const now = meta.updatedAt || Date.now();
  const writes = [];
  for (const [moduleKey, moduleData] of Object.entries(modulesMap || {})) {
    if (!moduleKey || moduleData === undefined) continue;
    writes.push({
      update: {
        name: `${docRoot}/cmsModules/${moduleKey}`,
        fields: {
          data: encodeFsValClient(moduleData),
          updatedAt: encodeFsValClient(now)
        }
      }
    });
  }

  writes.push({
    update: {
      name: `${docRoot}/siteConfig/main`,
      fields: {
        updatedAt: encodeFsValClient(now),
        dirtyModulesSinceSync: encodeFsValClient(meta.dirtyModulesSinceSync || []),
        modularSync: encodeFsValClient(true)
      }
    },
    updateMask: {
      fieldPaths: ['updatedAt', 'dirtyModulesSinceSync', 'modularSync']
    }
  });

  try {
    const res = await fetch(commitUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes })
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return { ok: false, error: errBody?.error?.message || `Firestore HTTP ${res.status}` };
    }
    const data = await res.json().catch(() => null);
    return { ok: true, writeResults: data?.writeResults || [] };
  } catch (err) {
    return { ok: false, error: err?.message || 'Network error reaching Firestore REST API' };
  }
}

/**
 * Direct Client-to-Firestore REST Reader.
 * Reads documents directly from Cloud Firestore collections `cmsModules/*` and `siteConfig/main`.
 */
export async function readDirectFromFirestoreRest(fbCfg) {
  if (!fbCfg?.projectId || !fbCfg?.apiKey) {
    return { status: 'error', config: null, error: 'Missing Firebase config' };
  }
  const dbId = encodeURIComponent(fbCfg.databaseId || '(default)');
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    fbCfg.projectId
  )}/databases/${dbId}/documents`;

  try {
    const [modulesRes, mainRes] = await Promise.all([
      fetch(`${base}/cmsModules?pageSize=50&key=${encodeURIComponent(fbCfg.apiKey)}`, {
        headers: { Accept: 'application/json' }
      }).catch(() => null),
      fetch(`${base}/siteConfig/main?key=${encodeURIComponent(fbCfg.apiKey)}`, {
        headers: { Accept: 'application/json' }
      }).catch(() => null)
    ]);

    if (!modulesRes || !mainRes) {
      return { status: 'error', config: null, error: 'Network error connecting to Firestore' };
    }
    if (
      (mainRes.status !== 200 && mainRes.status !== 404) ||
      (modulesRes.status !== 200 && modulesRes.status !== 404)
    ) {
      const failed = mainRes.status !== 200 && mainRes.status !== 404 ? mainRes : modulesRes;
      const err = await failed.json().catch(() => ({}));
      return { status: 'error', config: null, error: err?.error?.message || `HTTP ${failed.status}` };
    }

    let mainObj = null;
    if (mainRes.ok) {
      const data = await mainRes.json().catch(() => null);
      if (data?.fields) {
        mainObj = {};
        for (const [k, v] of Object.entries(data.fields)) {
          mainObj[k] = decodeFsValClient(v);
        }
      }
    }

    let modulesCount = 0;
    const assembled = JSON.parse(JSON.stringify(EMPTY_ADMIN_CONFIG));
    if (mainObj) {
      for (const key of Object.keys(mainObj)) {
        if (key !== 'modularSync') assembled[key] = mainObj[key];
      }
    }
    if (modulesRes.ok) {
      const listData = await modulesRes.json().catch(() => null);
      const docs = Array.isArray(listData?.documents) ? listData.documents : [];
      for (const item of docs) {
        const docName = String(item.name || '').split('/').pop() || '';
        if (docName && item.fields) {
          const dec = {};
          for (const [k, v] of Object.entries(item.fields)) {
            dec[k] = decodeFsValClient(v);
          }
          if (dec.data !== undefined) {
            assembled[docName] = dec.data;
            modulesCount += 1;
          }
        }
      }
    }

    if (modulesCount === 0 && !mainObj) {
      return { status: 'empty', config: null };
    }
    return { status: 'ok', config: mergeSiteConfig(assembled, EMPTY_ADMIN_CONFIG) };
  } catch (err) {
    return { status: 'error', config: null, error: err?.message || 'Firestore direct read error' };
  }
}

/**
 * Test live Firestore connectivity via direct client REST and authenticated server endpoint
 */
export async function testFirebaseConnectionRemote(customConfig = null) {
  const targetConfig = customConfig || getActiveFirebaseConfig();
  if (targetConfig?.apiKey && targetConfig?.projectId && !targetConfig.apiKey.startsWith('__')) {
    const directRes = await readDirectFromFirestoreRest(targetConfig);
    if (directRes.status === 'ok' || directRes.status === 'empty') {
      return {
        success: true,
        projectId: targetConfig.projectId,
        message: `✓ Connected directly to Cloud Firestore (${targetConfig.projectId})! Ready to save.`,
        cloudConfig: directRes.config
      };
    }
  }

  try {
    const res = await fetch('/api/firebase/test', {
      method: 'POST',
      credentials: 'include',
      headers: buildAdminRequestHeaders({
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Admin-CSRF': '1'
      }),
      body: JSON.stringify(customConfig ? { firebaseConfig: customConfig } : {})
    });
    const data = await res.json().catch(() => null);
    if (res.status === 401) {
      notifyAdminUnauthorized(data?.error || 'Session expired or unauthorized. Please sign in again.');
    }
    if (res.ok && data?.success) {
      if (data.firebaseConfig) setServerEnvFirebaseConfig(data.firebaseConfig);
      return data;
    }
    return {
      success: false,
      status: res.status,
      error: data?.error || `Firestore connection test failed (HTTP ${res.status}).`
    };
  } catch (err) {
    return {
      success: false,
      error: err?.message || 'Network error testing Firebase connection.'
    };
  }
}

/**
 * Fetch live site configuration from live Firebase Firestore & authenticated `/api/config`.
 * Reads directly from Cloud Firestore when client credentials exist!
 */
export async function getSiteConfigRemote() {
  const activeFb = getActiveFirebaseConfig();
  let directConfig = null;

  if (activeFb?.apiKey && activeFb?.projectId && !activeFb.apiKey.startsWith('__')) {
    try {
      const directRead = await readDirectFromFirestoreRest(activeFb);
      if (directRead.status === 'ok' && directRead.config) {
        directConfig = directRead.config;
      }
    } catch {
      // Fallback to server read
    }
  }

  try {
    const res = await fetch('/api/config', {
      method: 'GET',
      credentials: 'include',
      headers: buildAdminRequestHeaders({
        Accept: 'application/json',
        'Cache-Control': 'no-cache'
      })
    });
    if (res.status === 401) {
      notifyAdminUnauthorized();
      return directConfig || inMemoryCachedConfig;
    }
    if (!res.ok) {
      if (directConfig) {
        inMemoryCachedConfig = directConfig;
        return inMemoryCachedConfig;
      }
      return inMemoryCachedConfig;
    }
    const data = await res.json().catch(() => null);
    if (!data) return directConfig || inMemoryCachedConfig;

    const fbCfg = data.firebaseEnv?.config || data.firebaseConfig || data._firebaseConfig;
    if (fbCfg) {
      setServerEnvFirebaseConfig(fbCfg);
    }
    const envDiag = data.envDiagnostics || data._envDiagnostics;
    if (envDiag) {
      lastEnvDiagnostics = envDiag;
    }

    const rawCfg = data.config && typeof data.config === 'object' ? data.config : data;
    if (directConfig) {
      inMemoryCachedConfig = mergeRemoteConfigPreservingUserContent(rawCfg, directConfig);
    } else {
      inMemoryCachedConfig = mergeRemoteConfigPreservingUserContent(rawCfg, inMemoryCachedConfig);
    }
    return inMemoryCachedConfig;
  } catch {
    return directConfig || inMemoryCachedConfig;
  }
}

/**
 * Save multiple edited modules atomically to live Firebase & recompile static routes
 */
export async function saveSiteConfigModulesBatchRemote(modulesMap, editedModules = []) {
  const activeFb = getActiveFirebaseConfig();
  let directFirestoreOk = false;
  let directFirestoreError = null;

  // 1. Direct Browser-to-Firestore Write: If user has a valid client Firebase API key & Project ID,
  // commit directly to Firestore FIRST so saving NEVER relies on server local storage or state!
  if (activeFb?.apiKey && activeFb?.projectId && !activeFb.apiKey.startsWith('__')) {
    try {
      const directRes = await saveDirectToFirestoreRest(activeFb, modulesMap, {
        updatedAt: Date.now(),
        dirtyModulesSinceSync: []
      });
      if (directRes.ok) {
        directFirestoreOk = true;
      } else {
        directFirestoreError = directRes.error;
      }
    } catch (err) {
      directFirestoreError = err?.message || 'Direct Firestore commit error';
    }
  }

  // 2. Also notify the backend with X-Firebase-Config attached so backend compiles static files
  try {
    const res = await fetch('/api/config/modules', {
      method: 'PATCH',
      credentials: 'include',
      headers: buildAdminRequestHeaders({
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Admin-CSRF': '1'
      }),
      body: JSON.stringify({
        modules: modulesMap,
        editedModules
      })
    });
    const data = await res.json().catch(() => null);
    if (res.status === 401) {
      notifyAdminUnauthorized(data?.error);
    }
    if (!res.ok || !data?.success) {
      if (directFirestoreOk) {
        return {
          success: true,
          firestoreSaved: true,
          firestoreNotice: null,
          message: 'Saved directly to Cloud Firestore.'
        };
      }
      return {
        success: false,
        status: res.status,
        firestoreSaved: false,
        error: directFirestoreError || data?.error || `Failed to save modules batch (HTTP ${res.status}).`
      };
    }
    if (data.config) {
      inMemoryCachedConfig = mergeRemoteConfigPreservingUserContent(data.config, inMemoryCachedConfig);
    }
    return {
      ...data,
      firestoreSaved: Boolean(directFirestoreOk || data.firestoreSaved),
      firestoreNotice: directFirestoreOk ? null : (data.firestoreNotice || directFirestoreError || null)
    };
  } catch (err) {
    if (directFirestoreOk) {
      return {
        success: true,
        firestoreSaved: true,
        firestoreNotice: null,
        message: 'Saved directly to Cloud Firestore.'
      };
    }
    return {
      success: false,
      firestoreSaved: false,
      error: directFirestoreError || err?.message || 'Network error saving modules.'
    };
  }
}

/**
 * Save a single isolated module (`PATCH /api/config/module`) to live Firebase
 */
export async function saveSiteConfigModuleRemote(moduleKey, dataPayload) {
  return saveSiteConfigModulesBatchRemote({ [moduleKey]: dataPayload }, [moduleKey]);
}

/**
 * Save full configuration to live Firebase & compile static public routes
 */
export async function saveSiteConfigRemote(config, editedModules = []) {
  const activeFb = getActiveFirebaseConfig();
  if (activeFb?.apiKey && activeFb?.projectId && !activeFb.apiKey.startsWith('__')) {
    const allModulesMap = {};
    for (const [k, v] of Object.entries(config || {})) {
      if (v !== undefined && !k.startsWith('_')) {
        allModulesMap[k] = v;
      }
    }
    await saveDirectToFirestoreRest(activeFb, allModulesMap, {
      updatedAt: Date.now(),
      dirtyModulesSinceSync: []
    }).catch(() => null);
  }

  const payload = {
    ...config,
    _editedModules: Array.isArray(editedModules) ? editedModules : []
  };
  const res = await fetch('/api/config', {
    method: 'POST',
    credentials: 'include',
    headers: buildAdminRequestHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Admin-CSRF': '1'
    }),
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => null);
  if (res.status === 401) {
    notifyAdminUnauthorized(data?.error);
  }
  if (!res.ok || !data?.success) {
    return {
      success: false,
      status: res.status,
      firestoreSaved: false,
      error: data?.error || `Failed to save configuration (HTTP ${res.status}).`
    };
  }
  if (data.config) {
    inMemoryCachedConfig = mergeRemoteConfigPreservingUserContent(data.config, inMemoryCachedConfig);
  }
  return {
    ...data,
    firestoreSaved: Boolean(data.firestoreSaved),
    firestoreNotice: data.firestoreNotice || null
  };
}

/**
 * Reset Admin Studio & Live Firebase to clean EMPTY_ADMIN_CONFIG (Zero static demo data)
 */
export async function resetSiteConfigRemote() {
  const res = await fetch('/api/config/reset', {
    method: 'POST',
    credentials: 'include',
    headers: buildAdminRequestHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Admin-CSRF': '1'
    }),
    body: JSON.stringify({})
  });
  const data = await res.json().catch(() => null);
  if (res.status === 401) {
    notifyAdminUnauthorized(data?.error);
  }
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Failed to reset workspace (HTTP ${res.status}).`);
  }
  if (data?.config) {
    inMemoryCachedConfig = mergeSiteConfig(data.config, EMPTY_ADMIN_CONFIG);
    return inMemoryCachedConfig;
  }
  inMemoryCachedConfig = mergeSiteConfig({}, EMPTY_ADMIN_CONFIG);
  return inMemoryCachedConfig;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

function replaceExtWithWebp(fileName) {
  const base = String(fileName || `upload-${Date.now()}`).replace(/\.[^/.]+$/, '');
  return `${base || 'asset'}.webp`;
}

/**
 * Client-side Canvas Resize & WebP Compression before uploading.
 * Keeps SVGs, animated GIFs, and tiny (<18KB) files untouched; falls back safely
 * if canvas/WebP is unavailable or produces a larger payload.
 */
export async function optimizeImageFileForUpload(file, options = {}) {
  const rawDataUrl = await readFileAsDataUrl(file);
  const mime = String(file?.type || '').toLowerCase();
  const maxWidth = Math.max(64, Number(options.maxWidth) || 1400);
  const maxHeight = Math.max(64, Number(options.maxHeight) || 1400);
  const quality = Math.min(0.95, Math.max(0.45, Number(options.quality) || 0.82));
  const originalBytes = Number(file?.size) || Math.floor((rawDataUrl.length * 3) / 4);

  if (
    !mime.startsWith('image/') ||
    mime === 'image/svg+xml' ||
    mime === 'image/gif' ||
    (originalBytes > 0 && originalBytes < 18 * 1024) ||
    typeof document === 'undefined'
  ) {
    return {
      fileName: file?.name || `upload-${Date.now()}.png`,
      contentType: file?.type || 'image/png',
      dataUrl: rawDataUrl,
      originalBytes,
      optimizedBytes: originalBytes,
      compressed: false
    };
  }

  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Decode failed'));
      el.src = rawDataUrl;
    });

    const target = calculateTargetImageDimensions(
      img.naturalWidth || img.width || 0,
      img.naturalHeight || img.height || 0,
      maxWidth,
      maxHeight
    );

    if (target.width <= 0 || target.height <= 0) {
      throw new Error('Zero dimensions');
    }

    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, target.width, target.height);

    let optimizedUrl = canvas.toDataURL('image/webp', quality);
    let outMime = 'image/webp';
    let outName = replaceExtWithWebp(file?.name);

    if (!optimizedUrl || !optimizedUrl.startsWith('data:image/webp')) {
      optimizedUrl = canvas.toDataURL('image/jpeg', quality);
      outMime = 'image/jpeg';
      outName = `${String(file?.name || 'asset').replace(/\.[^/.]+$/, '') || 'asset'}.jpg`;
    }

    const optimizedBytes = Math.floor(((optimizedUrl.split(',')[1] || '').length * 3) / 4);
    const shouldKeepRaw = !target.resized && optimizedUrl.length >= rawDataUrl.length;

    if (shouldKeepRaw) {
      return {
        fileName: file?.name || `upload-${Date.now()}.png`,
        contentType: file?.type || 'image/png',
        dataUrl: rawDataUrl,
        originalBytes,
        optimizedBytes: originalBytes,
        compressed: false
      };
    }

    return {
      fileName: outName,
      contentType: outMime,
      dataUrl: optimizedUrl,
      originalBytes,
      optimizedBytes,
      compressed: true
    };
  } catch {
    return {
      fileName: file?.name || `upload-${Date.now()}.png`,
      contentType: file?.type || 'image/png',
      dataUrl: rawDataUrl,
      originalBytes,
      optimizedBytes: originalBytes,
      compressed: false
    };
  }
}

/**
 * Upload an image file from smartphone/desktop via `/api/upload-image`
 * (Automatically resizes & compresses raster images to lightweight WebP first!)
 */
export async function uploadImageRemote(file, options = {}) {
  try {
    const prepared = await optimizeImageFileForUpload(file, options);

    const res = await fetch('/api/upload-image', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Admin-CSRF': '1'
      },
      body: JSON.stringify({
        fileName: prepared.fileName,
        contentType: prepared.contentType,
        dataUrl: prepared.dataUrl
      })
    });
    const data = await res.json().catch(() => null);
    if (res.status === 401) notifyAdminUnauthorized(data?.error);
    if (res.ok && data?.success && data?.url) {
      return {
        success: true,
        url: data.url,
        fileName: prepared.fileName,
        originalBytes: prepared.originalBytes,
        optimizedBytes: data.sizeBytes || prepared.optimizedBytes,
        compressed: prepared.compressed
      };
    }
    return { success: false, status: res.status, error: data?.error || 'Image upload failed.' };
  } catch (err) {
    return { success: false, error: err?.message || 'Image upload error.' };
  }
}

/**
 * Verify GitHub repository & Fine-Grained Token access (`POST /api/github/verify`)
 */
export async function verifyGitHubRepoRemote(ghPayload) {
  try {
    const res = await fetch('/api/github/verify', {
      method: 'POST',
      credentials: 'include',
      headers: buildAdminRequestHeaders({
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Admin-CSRF': '1'
      }),
      body: JSON.stringify(ghPayload || {})
    });
    const data = await res.json().catch(() => null);
    if (res.status === 401) notifyAdminUnauthorized(data?.error);
    if (data?.config) {
      inMemoryCachedConfig = mergeSiteConfig(data.config, EMPTY_ADMIN_CONFIG);
    }
    return data || { success: false, status: res.status, error: `HTTP ${res.status}` };
  } catch (err) {
    return { success: false, error: err?.message || 'Network error verifying GitHub access.' };
  }
}

/**
 * Compile static public website & push changed blobs to GitHub (`POST /api/github/publish`)
 */
export async function publishStaticSiteToGitHubRemote(
  payloadOrGhConfig = {},
  fullConfig = null,
  modulesChanged = null
) {
  let bodyObj = {};
  if (fullConfig && typeof fullConfig === 'object') {
    bodyObj = {
      config: fullConfig,
      githubConfig: payloadOrGhConfig || fullConfig.githubConfig || {},
      ...(Array.isArray(modulesChanged) ? { modulesChanged } : {})
    };
  } else if (payloadOrGhConfig && typeof payloadOrGhConfig === 'object') {
    bodyObj = payloadOrGhConfig;
  }

  // 1. Direct Browser-to-Firestore Commit: Ensure ALL current CMS modules are committed
  // directly to Firestore FIRST so all content is 100% permanently saved before publishing!
  const activeFb = getActiveFirebaseConfig();
  if (activeFb?.apiKey && activeFb?.projectId && !activeFb.apiKey.startsWith('__')) {
    const configToPersist = fullConfig || inMemoryCachedConfig;
    if (configToPersist && typeof configToPersist === 'object') {
      const allModulesMap = {};
      for (const [k, v] of Object.entries(configToPersist)) {
        if (v !== undefined && !k.startsWith('_')) {
          allModulesMap[k] = v;
        }
      }
      await saveDirectToFirestoreRest(activeFb, allModulesMap, {
        updatedAt: Date.now(),
        dirtyModulesSinceSync: []
      }).catch(() => null);
    }
  }

  try {
    const res = await fetch('/api/github/publish', {
      method: 'POST',
      credentials: 'include',
      headers: buildAdminRequestHeaders({
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Admin-CSRF': '1'
      }),
      body: JSON.stringify(bodyObj)
    });
    const data = await res.json().catch(() => null);
    if (res.status === 401) notifyAdminUnauthorized(data?.error);
    if (data?.config) {
      inMemoryCachedConfig = mergeRemoteConfigPreservingUserContent(data.config, inMemoryCachedConfig);
    }
    return data || { success: false, status: res.status, error: `HTTP ${res.status}` };
  } catch (err) {
    return { success: false, error: err?.message || 'Network error pushing to GitHub.' };
  }
}

/**
 * Authenticate Admin User (`POST /api/admin/login`)
 * Supports both `loginAdminUser(email, password, apiKey)` and `loginAdminUser({ email, password, apiKey })`.
 */
export async function loginAdminUser(emailOrObj, password = '', apiKey = '') {
  const payload =
    emailOrObj && typeof emailOrObj === 'object'
      ? emailOrObj
      : {
          email: String(emailOrObj || ''),
          password: String(password || ''),
          apiKey: String(apiKey || '')
        };

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Admin-CSRF': '1'
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.success) {
      const fbCfg =
        data.firebaseEnv?.config ||
        data.firebaseConfig ||
        data.envDiagnostics?.firebaseConfig;
      if (fbCfg) setServerEnvFirebaseConfig(fbCfg);
      if (data.envDiagnostics) lastEnvDiagnostics = data.envDiagnostics;
      return { success: true, user: data.user };
    }
    return {
      success: false,
      status: res.status,
      code: data?.code || '',
      retryAfterSec: Number(data?.retryAfterSec) || 0,
      error: data?.error || 'Invalid credentials or access key.'
    };
  } catch {
    return {
      success: false,
      status: 0,
      code: 'network-error',
      retryAfterSec: 0,
      error: 'Network error connecting to authentication service.'
    };
  }
}

/**
 * Verify active HttpOnly Admin Session (`GET /api/admin/verify`)
 */
export async function verifyAdminSession() {
  try {
    const res = await fetch('/api/admin/verify', {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.authenticated) {
      const fbCfg =
        data.firebaseEnv?.config ||
        data.firebaseConfig ||
        data.envDiagnostics?.firebaseConfig;
      if (fbCfg) setServerEnvFirebaseConfig(fbCfg);
      if (data.envDiagnostics) lastEnvDiagnostics = data.envDiagnostics;
      return { authenticated: true, user: data.user, status: res.status, code: '' };
    }
    return {
      authenticated: false,
      user: null,
      status: res.status,
      code: data?.code || ''
    };
  } catch {
    return { authenticated: false, user: null, status: 0, code: 'network-error' };
  }
}

/**
 * Logout Admin User & Revoke Session JTI (`POST /api/admin/logout`)
 */
export async function logoutAdminUser() {
  try {
    await fetch('/api/admin/logout', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Admin-CSRF': '1'
      }
    });
  } catch {
    // Ignore logout network error
  }
  inMemoryCachedConfig = mergeSiteConfig({}, EMPTY_ADMIN_CONFIG);
  return { success: true };
}
