/**
 * ============================================================================
 * ADMIN LIVE FIREBASE v10+ & GITHUB STATIC PUBLISHER CLIENT (firebase-config.js)
 * Exclusively used by the Admin Studio (`/admin.js`).
 * Public Website (`/app.js`) does NOT import this file and runs 100% on static data!
 *
 * Features:
 * - Live Dynamic State from Firebase Cloud Firestore (`siteConfig/main`) + Server API
 * - GitHub Fine-Grained Token Verification (`verifyGitHubRepoRemote`)
 * - 1-Click Static Public Website Compilation & GitHub Push (`publishStaticSiteToGitHubRemote`)
 * - Device Image Upload Helper (`uploadImageRemote`)
 * ============================================================================
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot
} from 'firebase/firestore';
import {
  MASTER_DEFAULT_CONFIG,
  mergeSiteConfig,
  buildPartialRoutePayload
} from './src/utils/cms-engine';

export const DEFAULT_SITE_CONFIG = MASTER_DEFAULT_CONFIG;

let serverInjectedFirebaseConfig =
  typeof window !== 'undefined' && window.__SERVER_FIREBASE_CONFIG__
    ? window.__SERVER_FIREBASE_CONFIG__
    : null;
let firestoreDb = null;

function broadcastPublicStaticRefresh(updatedConfig) {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    try {
      const ch = new BroadcastChannel('apex_cms_sync_channel');
      ch.postMessage({ type: 'SITE_CONFIG_UPDATED', config: updatedConfig });
      ch.close();
    } catch {
      // Ignore BroadcastChannel errors
    }
  }
}

/**
 * Resolve active Firebase configuration from:
 * 1. Admin custom override in localStorage (`firebase_custom_config`)
 * 2. Server-injected .env variables (`window.__SERVER_FIREBASE_CONFIG__`)
 * 3. Vite client environment variables (`import.meta.env.VITE_FIREBASE_*`)
 */
export function getActiveFirebaseConfig() {
  try {
    const saved = localStorage.getItem('firebase_custom_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.apiKey && parsed.projectId) {
        return {
          apiKey: parsed.apiKey.trim(),
          authDomain: (parsed.authDomain || `${parsed.projectId.trim()}.firebaseapp.com`).trim(),
          projectId: parsed.projectId.trim(),
          storageBucket: (parsed.storageBucket || `${parsed.projectId.trim()}.appspot.com`).trim(),
          messagingSenderId: (parsed.messagingSenderId || '').trim(),
          appId: (parsed.appId || '').trim(),
          databaseId: (parsed.databaseId || '(default)').trim(),
          source: 'admin-override'
        };
      }
    }
  } catch (e) {
    console.warn('Could not read firebase_custom_config from localStorage:', e);
  }

  const srvCfg =
    serverInjectedFirebaseConfig ||
    (typeof window !== 'undefined' ? window.__SERVER_FIREBASE_CONFIG__ : null);

  if (srvCfg && srvCfg.apiKey && srvCfg.projectId) {
    return {
      apiKey: srvCfg.apiKey,
      authDomain: srvCfg.authDomain || `${srvCfg.projectId}.firebaseapp.com`,
      projectId: srvCfg.projectId,
      storageBucket: srvCfg.storageBucket || `${srvCfg.projectId}.appspot.com`,
      messagingSenderId: srvCfg.messagingSenderId || '',
      appId: srvCfg.appId || '',
      databaseId: srvCfg.databaseId || '(default)',
      source: 'server-env'
    };
  }

  const viteApiKey = (import.meta.env?.VITE_FIREBASE_API_KEY || '').trim();
  const viteProjectId = (import.meta.env?.VITE_FIREBASE_PROJECT_ID || '').trim();
  if (viteApiKey && viteProjectId) {
    return {
      apiKey: viteApiKey,
      authDomain: (import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN || `${viteProjectId}.firebaseapp.com`).trim(),
      projectId: viteProjectId,
      storageBucket: (import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET || `${viteProjectId}.appspot.com`).trim(),
      messagingSenderId: (import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim(),
      appId: (import.meta.env?.VITE_FIREBASE_APP_ID || '').trim(),
      databaseId: (import.meta.env?.VITE_FIREBASE_DATABASE_ID || '(default)').trim(),
      source: 'vite-env'
    };
  }

  return {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
    databaseId: '(default)',
    source: 'unconfigured'
  };
}

export function isRealFirebaseConfig(config = getActiveFirebaseConfig()) {
  return Boolean(
    config &&
    config.apiKey &&
    config.projectId &&
    !config.apiKey.includes('DummyKey') &&
    !config.apiKey.includes('YOUR_') &&
    !config.projectId.includes('my-single-domain-cms')
  );
}

export function saveActiveFirebaseConfig(config) {
  try {
    if (!config || (!config.apiKey && !config.projectId)) {
      localStorage.removeItem('firebase_custom_config');
    } else {
      const pid = (config.projectId || '').trim();
      localStorage.setItem(
        'firebase_custom_config',
        JSON.stringify({
          apiKey: (config.apiKey || '').trim(),
          authDomain: (config.authDomain || (pid ? `${pid}.firebaseapp.com` : '')).trim(),
          projectId: pid,
          storageBucket: (config.storageBucket || (pid ? `${pid}.appspot.com` : '')).trim(),
          messagingSenderId: (config.messagingSenderId || '').trim(),
          appId: (config.appId || '').trim(),
          databaseId: (config.databaseId || '(default)').trim()
        })
      );
    }
    firestoreDb = null;
    return true;
  } catch (e) {
    console.error('Failed saving custom Firebase config:', e);
    return false;
  }
}

/**
 * Initialize or retrieve Firestore instance when valid credentials exist
 */
export function getFirestoreInstance() {
  if (firestoreDb) return firestoreDb;
  const active = getActiveFirebaseConfig();
  if (!isRealFirebaseConfig(active)) return null;

  try {
    const appInstance = !getApps().length
      ? initializeApp({
          apiKey: active.apiKey,
          authDomain: active.authDomain,
          projectId: active.projectId,
          storageBucket: active.storageBucket,
          messagingSenderId: active.messagingSenderId,
          appId: active.appId
        })
      : getApp();
    firestoreDb =
      active.databaseId && active.databaseId !== '(default)'
        ? getFirestore(appInstance, active.databaseId)
        : getFirestore(appInstance);
    return firestoreDb;
  } catch (err) {
    console.warn('Firestore initialization notice:', err.message);
    return null;
  }
}

const partialRouteMemoryCache = new Map();

export function getInitialPartialRouteSync(pathname = '/', newsCategory = 'ALL') {
  const cleanPath = (pathname || '/').split('?')[0].replace(/\/+$/, '') || '/';
  const cacheKey = `${cleanPath}::${newsCategory}`;

  if (partialRouteMemoryCache.has(cacheKey)) {
    return partialRouteMemoryCache.get(cacheKey);
  }

  try {
    const raw = localStorage.getItem('siteConfig_main');
    if (raw) {
      const cfg = mergeSiteConfig(JSON.parse(raw), MASTER_DEFAULT_CONFIG);
      const computed = buildPartialRoutePayload(cleanPath, cfg, newsCategory);
      partialRouteMemoryCache.set(cacheKey, computed);
      return computed;
    }
  } catch {
    // Ignore
  }

  return null;
}

export function clearPartialRouteCache() {
  partialRouteMemoryCache.clear();
}

export function getCachedSiteConfigSync() {
  try {
    const raw = localStorage.getItem('siteConfig_main');
    if (raw) {
      return mergeSiteConfig(JSON.parse(raw), MASTER_DEFAULT_CONFIG);
    }
  } catch {
    // Ignore parse error
  }
  return mergeSiteConfig(null, MASTER_DEFAULT_CONFIG);
}

/**
 * Fetch LIVE site configuration for Admin Studio directly from Firebase Cloud Firestore
 * (`siteConfig/main`) and Live Backend API (`/api/config`).
 */
export async function getSiteConfigRemote() {
  let latestConfig = null;

  // 1. Fetch from Live Backend API (/api/config with cache: 'no-store')
  try {
    const response = await fetch('/api/config', {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    if (response.ok) {
      const data = await response.json();
      if (data.firebaseEnv?.isConfigured && data.firebaseEnv.config) {
        serverInjectedFirebaseConfig = data.firebaseEnv.config;
      }
      if (data.config) {
        latestConfig = mergeSiteConfig(data.config, MASTER_DEFAULT_CONFIG);
      }
    }
  } catch (err) {
    console.warn('Server API fetch fallback:', err.message);
  }

  // 2. If Firebase Firestore is configured, fetch live 'siteConfig/main' from Firestore
  const db = getFirestoreInstance();
  if (db) {
    try {
      const configRef = doc(db, 'siteConfig', 'main');
      const snap = await getDoc(configRef);
      if (snap.exists()) {
        const cloudData = mergeSiteConfig(snap.data(), MASTER_DEFAULT_CONFIG);
        if (!latestConfig || (cloudData.updatedAt || 0) >= (latestConfig.updatedAt || 0)) {
          latestConfig = cloudData;
        }
      }
    } catch (err) {
      console.warn('Firestore read notice:', err.message);
    }
  }

  if (latestConfig) {
    try {
      localStorage.setItem('siteConfig_main', JSON.stringify(latestConfig));
      clearPartialRouteCache();
    } catch {
      // Ignore storage quota warning
    }
    return latestConfig;
  }

  return getCachedSiteConfigSync();
}

/**
 * Save Live Admin Configuration to Firebase Cloud Firestore (`siteConfig/main`)
 * and Server Live Storage (`PUT /api/config`), which also re-compiles the local
 * static public bundle (`/dist-public` & `/public/static-routes`).
 * If `githubConfig.autoPushOnPublish` is enabled and a Fine-Grained Token is set,
 * automatically pushes the compiled static files to GitHub as well!
 */
export async function saveSiteConfigRemote(configData) {
  const normalized = mergeSiteConfig(configData, MASTER_DEFAULT_CONFIG);
  normalized.updatedAt = Date.now();
  clearPartialRouteCache();

  try {
    localStorage.setItem('siteConfig_main', JSON.stringify(normalized));
  } catch (e) {
    console.warn('LocalStorage write warning:', e);
  }

  let serverSaved = false;
  let firestoreSaved = false;
  let githubPushResult = null;
  let savedServerConfig = null;
  let serverError = null;
  let firestoreError = null;

  // 1. Save to Firebase Cloud Firestore (`siteConfig/main`) first if configured
  const db = getFirestoreInstance();
  if (db) {
    try {
      const configRef = doc(db, 'siteConfig', 'main');
      await setDoc(configRef, normalized, { merge: true });
      firestoreSaved = true;
    } catch (err) {
      firestoreError = err.message;
    }
  }

  // 2. Save to Backend Server API (which also compiles static public HTML/JSON files)
  const token = getAdminAuthToken();
  try {
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ config: normalized })
    });
    if (res.ok) {
      const resData = await res.json();
      serverSaved = true;
      if (resData.githubPush) {
        githubPushResult = resData.githubPush;
      }
      if (resData.config) {
        savedServerConfig = resData.config;
        localStorage.setItem('siteConfig_main', JSON.stringify(resData.config));
      }
    } else {
      const errBody = await res.json().catch(() => ({}));
      serverError = errBody.error || `HTTP ${res.status}`;
    }
  } catch (err) {
    serverError = err.message;
  }

  broadcastPublicStaticRefresh(savedServerConfig || normalized);

  const githubSuffix =
    githubPushResult && githubPushResult.status === 'success'
      ? ` + Pushed ${githubPushResult.filesPushed} static files to GitHub (${githubPushResult.commitSha?.slice(0, 7)})!`
      : '';

  if (serverSaved && firestoreSaved) {
    return {
      success: true,
      mode: 'server+firestore',
      config: savedServerConfig || normalized,
      githubPush: githubPushResult,
      message: `Saved to Live Firebase Firestore & Compiled Static Public Website${githubSuffix}`
    };
  }

  if (serverSaved) {
    return {
      success: true,
      mode: 'server',
      config: savedServerConfig || normalized,
      githubPush: githubPushResult,
      message: firestoreError
        ? `Saved & Compiled Static Public Files! (Firestore notice: ${firestoreError})`
        : `Saved Live Admin State & Compiled Static Public Website!${githubSuffix}`
    };
  }

  if (firestoreSaved) {
    return {
      success: true,
      mode: 'firestore',
      config: normalized,
      message: 'Saved to Live Firebase Cloud Firestore!'
    };
  }

  return {
    success: false,
    mode: 'local-only',
    error: serverError || firestoreError || 'Could not reach server storage.'
  };
}

/**
 * Verify GitHub Fine-Grained Personal Access Token & Repository Write Permissions
 */
export async function verifyGitHubRepoRemote(githubConfig) {
  const token = getAdminAuthToken();
  try {
    const res = await fetch('/api/github/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ githubConfig })
    });
    const data = await res.json();
    return data;
  } catch (err) {
    return {
      ok: false,
      message: `Could not reach GitHub verification endpoint: ${err.message}`
    };
  }
}

/**
 * Compile 100% Static Public Website Bundle & Push Atomic Commit to GitHub
 * via Fine-Grained Token (`POST /api/github/publish`)
 */
export async function publishStaticSiteToGitHubRemote(configData, customCommitMessage = '') {
  const token = getAdminAuthToken();
  const normalized = mergeSiteConfig(configData, MASTER_DEFAULT_CONFIG);

  // Also sync latest config to Firebase Firestore if active
  const db = getFirestoreInstance();
  if (db) {
    try {
      const configRef = doc(db, 'siteConfig', 'main');
      await setDoc(configRef, normalized, { merge: true });
    } catch {
      // Non-fatal
    }
  }

  try {
    const res = await fetch('/api/github/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        config: normalized,
        commitMessage: customCommitMessage
      })
    });
    const data = await res.json();
    if (data.config) {
      localStorage.setItem('siteConfig_main', JSON.stringify(data.config));
      broadcastPublicStaticRefresh(data.config);
    }
    return data;
  } catch (err) {
    return {
      success: false,
      error: `Failed to publish static site to GitHub: ${err.message}`
    };
  }
}

/**
 * Upload an image file from the Admin's device to `/api/upload-image`
 */
export async function uploadImageRemote(file) {
  if (!file) return { success: false, error: 'No file selected.' };
  const token = getAdminAuthToken();

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });

  try {
    const res = await fetch('/api/upload-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        fileName: file.name || 'upload.png',
        dataUrl
      })
    });
    const data = await res.json();
    if (res.ok && data.success && data.url) {
      return { success: true, url: data.url, fileName: data.fileName };
    }
    return { success: false, error: data.error || 'Image upload failed.' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Reset configuration to Master Default Template
 */
export async function resetSiteConfigRemote() {
  const token = getAdminAuthToken();
  clearPartialRouteCache();
  try {
    const res = await fetch('/api/config/reset', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.config) {
        localStorage.setItem('siteConfig_main', JSON.stringify(data.config));
        broadcastPublicStaticRefresh(data.config);
        return data.config;
      }
    }
  } catch (err) {
    console.warn('Server reset fallback:', err);
  }
  const fresh = mergeSiteConfig(null, MASTER_DEFAULT_CONFIG);
  localStorage.setItem('siteConfig_main', JSON.stringify(fresh));
  return fresh;
}

/**
 * Subscribe to real-time updates in Admin Studio (Firestore snapshot + storage sync)
 */
export function subscribeToSiteConfig(onUpdate) {
  const unsubscribers = [];

  const storageHandler = (e) => {
    if (e.key === 'siteConfig_main' && e.newValue) {
      try {
        clearPartialRouteCache();
        onUpdate(mergeSiteConfig(JSON.parse(e.newValue), MASTER_DEFAULT_CONFIG));
      } catch {
        // Ignore
      }
    }
  };
  window.addEventListener('storage', storageHandler);
  unsubscribers.push(() => window.removeEventListener('storage', storageHandler));

  const db = getFirestoreInstance();
  if (db) {
    try {
      const configRef = doc(db, 'siteConfig', 'main');
      const unsubFirestore = onSnapshot(
        configRef,
        (docSnap) => {
          if (docSnap.exists()) {
            clearPartialRouteCache();
            const merged = mergeSiteConfig(docSnap.data(), MASTER_DEFAULT_CONFIG);
            localStorage.setItem('siteConfig_main', JSON.stringify(merged));
            onUpdate(merged);
          }
        },
        (err) => {
          console.warn('Firestore listener notice:', err.message);
        }
      );
      unsubscribers.push(unsubFirestore);
    } catch {
      // Ignore
    }
  }

  return () => {
    unsubscribers.forEach((fn) => fn());
  };
}

/**
 * Server-Backed Admin Authentication Helpers
 */
const ADMIN_TOKEN_KEY = 'cms_admin_bearer_token';
const ADMIN_USER_KEY = 'cms_admin_user_info';

export function getAdminAuthToken() {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export async function loginAdminUser(email, password, apiKey = '') {
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, apiKey })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      return {
        success: false,
        error: data.error || 'Invalid credentials.'
      };
    }

    localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
    localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(data.user));
    return {
      success: true,
      user: data.user,
      envDiagnostics: data.envDiagnostics
    };
  } catch (err) {
    return {
      success: false,
      error: `Authentication request failed: ${err.message}`
    };
  }
}

export async function verifyAdminSession() {
  const token = getAdminAuthToken();
  try {
    const res = await fetch('/api/admin/verify', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (res.ok) {
      const data = await res.json();
      if (data.envDiagnostics?.firebaseConfig) {
        serverInjectedFirebaseConfig = data.envDiagnostics.firebaseConfig;
      }
      return data;
    }
  } catch (err) {
    console.warn('Verify session warning:', err.message);
  }
  return { authenticated: false, user: null, loginHints: {}, envDiagnostics: {} };
}

export async function logoutAdminUser() {
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_USER_KEY);
  } catch {
    // Ignore
  }
}
