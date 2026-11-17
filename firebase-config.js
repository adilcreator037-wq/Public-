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
  cleanFirebaseEnvString,
  normalizeFirebaseClientConfig,
  isValidFirebaseClientConfig,
  parseFirebaseConfigSnippet
} from './src/utils/cms-engine.ts';

export const FIREBASE_OVERRIDE_STORAGE_KEY = 'cms_firebase_custom_config_v3';

export {
  cleanFirebaseEnvString,
  normalizeFirebaseClientConfig,
  isValidFirebaseClientConfig,
  parseFirebaseConfigSnippet
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
 * Test live Firestore connectivity via authenticated server endpoint `/api/firebase/test`
 */
export async function testFirebaseConnectionRemote(customConfig = null) {
  try {
    const res = await fetch('/api/firebase/test', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Admin-CSRF': '1'
      },
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
 * Fetch live site configuration from authenticated `/api/config`
 * (Server reads directly from Firebase Firestore when configured; zero static demo fallback!)
 */
export async function getSiteConfigRemote() {
  try {
    const res = await fetch('/api/config', {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
    if (res.status === 401) {
      notifyAdminUnauthorized();
      return inMemoryCachedConfig;
    }
    if (!res.ok) return inMemoryCachedConfig;
    const data = await res.json().catch(() => null);
    if (!data) return inMemoryCachedConfig;

    const fbCfg = data.firebaseEnv?.config || data.firebaseConfig || data._firebaseConfig;
    if (fbCfg) {
      setServerEnvFirebaseConfig(fbCfg);
    }
    const envDiag = data.envDiagnostics || data._envDiagnostics;
    if (envDiag) {
      lastEnvDiagnostics = envDiag;
    }

    const rawCfg = data.config && typeof data.config === 'object' ? data.config : data;
    inMemoryCachedConfig = mergeSiteConfig(rawCfg, EMPTY_ADMIN_CONFIG);
    return inMemoryCachedConfig;
  } catch {
    return inMemoryCachedConfig;
  }
}

/**
 * Save full configuration to live Firebase & compile static public routes
 */
export async function saveSiteConfigRemote(config, editedModules = []) {
  const payload = {
    ...config,
    _editedModules: Array.isArray(editedModules) ? editedModules : []
  };
  const res = await fetch('/api/config', {
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
  if (res.status === 401) {
    notifyAdminUnauthorized(data?.error);
  }
  if (!res.ok || !data?.success) {
    return {
      success: false,
      status: res.status,
      error: data?.error || `Failed to save configuration (HTTP ${res.status}).`
    };
  }
  if (data.config) {
    inMemoryCachedConfig = mergeSiteConfig(data.config, EMPTY_ADMIN_CONFIG);
  }
  return data;
}

/**
 * Save a single isolated module (`PATCH /api/config/module`) to live Firebase
 */
export async function saveSiteConfigModuleRemote(moduleKey, dataPayload) {
  const res = await fetch('/api/config/module', {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Admin-CSRF': '1'
    },
    body: JSON.stringify({
      moduleKey,
      module: moduleKey,
      data: dataPayload
    })
  });
  const data = await res.json().catch(() => null);
  if (res.status === 401) {
    notifyAdminUnauthorized(data?.error);
  }
  if (!res.ok || !data?.success) {
    return {
      success: false,
      status: res.status,
      error: data?.error || `Failed to save module [${moduleKey}] (HTTP ${res.status}).`
    };
  }
  if (data.config) {
    inMemoryCachedConfig = mergeSiteConfig(data.config, EMPTY_ADMIN_CONFIG);
  }
  return {
    ...data,
    message: data.message || `Saved module [${moduleKey}]`
  };
}

/**
 * Save multiple edited modules atomically (`PATCH /api/config/modules`) to live Firebase
 */
export async function saveSiteConfigModulesBatchRemote(modulesMap, editedModules = []) {
  const res = await fetch('/api/config/modules', {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Admin-CSRF': '1'
    },
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
    return {
      success: false,
      status: res.status,
      error: data?.error || `Failed to save modules batch (HTTP ${res.status}).`
    };
  }
  if (data.config) {
    inMemoryCachedConfig = mergeSiteConfig(data.config, EMPTY_ADMIN_CONFIG);
  }
  return data;
}

/**
 * Reset Admin Studio & Live Firebase to clean EMPTY_ADMIN_CONFIG (Zero static demo data)
 */
export async function resetSiteConfigRemote() {
  const res = await fetch('/api/config/reset', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Admin-CSRF': '1'
    },
    body: JSON.stringify({})
  });
  const data = await res.json().catch(() => null);
  if (res.status === 401) {
    notifyAdminUnauthorized(data?.error);
  }
  if (res.ok && data?.config) {
    inMemoryCachedConfig = mergeSiteConfig(data.config, EMPTY_ADMIN_CONFIG);
    return inMemoryCachedConfig;
  }
  inMemoryCachedConfig = mergeSiteConfig({}, EMPTY_ADMIN_CONFIG);
  return inMemoryCachedConfig;
}

/**
 * Upload an image file from smartphone/desktop via `/api/upload-image`
 */
export async function uploadImageRemote(file) {
  try {
    const reader = new FileReader();
    const dataUrl = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.readAsDataURL(file);
    });

    const res = await fetch('/api/upload-image', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Admin-CSRF': '1'
      },
      body: JSON.stringify({
        fileName: file.name || `upload-${Date.now()}.png`,
        contentType: file.type || 'image/png',
        dataUrl
      })
    });
    const data = await res.json().catch(() => null);
    if (res.status === 401) notifyAdminUnauthorized(data?.error);
    if (res.ok && data?.success && data?.url) {
      return { success: true, url: data.url };
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
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Admin-CSRF': '1'
      },
      body: JSON.stringify(ghPayload || {})
    });
    const data = await res.json().catch(() => null);
    if (res.status === 401) notifyAdminUnauthorized(data?.error);
    return data || { success: false, status: res.status, error: `HTTP ${res.status}` };
  } catch (err) {
    return { success: false, error: err?.message || 'Network error verifying GitHub access.' };
  }
}

/**
 * Compile static public website & push changed blobs to GitHub (`POST /api/github/publish`)
 */
export async function publishStaticSiteToGitHubRemote(payload) {
  try {
    const res = await fetch('/api/github/publish', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Admin-CSRF': '1'
      },
      body: JSON.stringify(payload || {})
    });
    const data = await res.json().catch(() => null);
    if (res.status === 401) notifyAdminUnauthorized(data?.error);
    if (data?.config) {
      inMemoryCachedConfig = mergeSiteConfig(data.config, EMPTY_ADMIN_CONFIG);
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
      const fbCfg = data.firebaseEnv?.config || data.firebaseConfig;
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
      if (data.firebaseConfig) setServerEnvFirebaseConfig(data.firebaseConfig);
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
