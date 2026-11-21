import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import {
  EMPTY_ADMIN_CONFIG,
  CMS_MODULE_KEYS,
  isCmsModuleKey,
  applyModulePatch,
  applyMultiModulePatch,
  preserveSecretsOnSave,
  sanitizeConfigForClient,
  appendSyncLogEntry,
  cleanAuthEnvValue,
  resolveAdminSecurityPolicy,
  validateAdminSessionClaims,
  mergeSiteConfig,
  mergeRemoteConfigPreservingUserContent,
  generateSlug,
  buildPartialRoutePayload,
  renderCompleteStaticPageHtml,
  generateSitemapXml,
  generateRobotsTxt,
  generateRssFeedXml,
  generateWebManifestJson,
  auditSiteSeoHealth,
  renderGatewayPageHtml,
  SECRET_MASK,
  encryptVaultValue,
  decryptVaultValue,
  resolveVaultSecret,
  evaluateGateG1,
  handleSessionInit,
  handleSessionClearance,
  parseFirebaseConfigSnippet,
  normalizeFirebaseClientConfig,
  isValidFirebaseClientConfig,
  sanitizeTurnstileKey,
  sanitizeFirebaseConfigForClient,
  sanitizeEditorialHtmlForSeo,
  sanitizeSafeUrl,
  GateRequestContext,
  SiteConfig,
  SyncLogEntry,
  CmsModuleKey
} from './src/utils/cms-engine';
import { compileStaticSiteBundle } from './src/utils/static-compiler';
import { verifyGitHubRepoAccess, pushStaticFilesToGitHub } from './src/utils/github-publisher';
import { getAdminWorkspaceShellHtml } from './src/utils/admin-workspace-html';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const UPLOADS_DIR = path.resolve(process.cwd(), 'public', 'uploads');
const PUBLIC_STATIC_ROUTES_DIR = path.resolve(process.cwd(), 'public', 'static-routes');
const DIST_PUBLIC_DIR = path.resolve(process.cwd(), 'dist-public');
const CONFIG_FILE_PATH = path.join(DATA_DIR, 'site-config.json');

for (const dir of [DATA_DIR, UPLOADS_DIR, PUBLIC_STATIC_ROUTES_DIR, DIST_PUBLIC_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function cleanEnvVal(val: unknown): string {
  return cleanAuthEnvValue(val);
}

function getAdminAuthEnv(reqHost = '') {
  const policy = resolveAdminSecurityPolicy(process.env, reqHost);

  const email =
    cleanEnvVal(process.env.ADMIN_EMAIL) ||
    cleanEnvVal(process.env.ADMIN_EMAIL_ID) ||
    cleanEnvVal(process.env.ADMIN_ID) ||
    cleanEnvVal(process.env.ADMIN_USER) ||
    cleanEnvVal(process.env.ADMIN_USERNAME) ||
    cleanEnvVal(process.env.CMS_ADMIN_EMAIL) ||
    cleanEnvVal(process.env.CMS_ADMIN_EMAIL_ID);

  const password =
    cleanEnvVal(process.env.ADMIN_PASSWORD) ||
    cleanEnvVal(process.env.ADMIN_PASS) ||
    cleanEnvVal(process.env.ADMIN_PWD) ||
    cleanEnvVal(process.env.CMS_ADMIN_PASSWORD);

  const apiKey =
    cleanEnvVal(process.env.ADMIN_API_KEY) ||
    cleanEnvVal(process.env.CMS_ADMIN_API_KEY) ||
    '';

  const rawExplicitSecret =
    cleanEnvVal(process.env.ADMIN_SESSION_SECRET) ||
    cleanEnvVal(process.env.ADMIN_SECRET) ||
    cleanEnvVal(process.env.SESSION_SECRET);

  const safeEmail = policy.hasCustomEmail ? email : '';
  const safePassword = policy.hasCustomPassword ? password : '';
  const safeApiKey = policy.hasApiKey ? apiKey : '';

  let secret = '';
  if (policy.credentialsReady) {
    if (!policy.hasDerivedSecret && rawExplicitSecret) {
      secret = crypto
        .createHmac('sha256', rawExplicitSecret)
        .update('master-cms:session:explicit:v2')
        .digest('hex');
    } else if (policy.hasDerivedSecret) {
      const vaultSalt = cleanEnvVal(
        process.env.VAULT_ENCRYPTION_SECRET ||
          process.env.LINK_VAULT_MASTER_SECRET ||
          process.env.FIREBASE_API_KEY ||
          ''
      );
      const ikm = `${safePassword}\0${safeApiKey}\0${vaultSalt}`;
      secret = crypto
        .createHmac('sha256', ikm)
        .update(`master-cms:session:derived:v2:${safeEmail.toLowerCase()}`)
        .digest('hex');
    }
  }

  const credVersion = secret
    ? crypto
        .createHmac('sha256', secret)
        .update(`cred-epoch:v2:${safeEmail.toLowerCase()}\0${safePassword}\0${safeApiKey}`)
        .digest('base64url')
        .slice(0, 16)
    : '';

  return {
    email: safeEmail,
    password: safePassword,
    apiKey: safeApiKey,
    secret,
    credVersion,
    isCustomEmail: policy.hasCustomEmail,
    isCustomPassword: policy.hasCustomPassword,
    isCustomSecret: policy.hasCustomSecret,
    requiresApiKey: policy.hasApiKey,
    policy
  };
}

let runtimeFirebaseOverride: ReturnType<typeof normalizeFirebaseClientConfig> | null = null;

/**
 * Optional Bootstrap Firebase Environment Variable Reader (Used ONLY by Authenticated Admin Studio)
 */
function getFirebaseEnvConfig() {
  if (runtimeFirebaseOverride && isValidFirebaseClientConfig(runtimeFirebaseOverride)) {
    return {
      isConfigured: true,
      source: 'runtime' as const,
      config: runtimeFirebaseOverride
    };
  }

  const rawJsonEnv = cleanEnvVal(
    process.env.FIREBASE_CONFIG_JSON || process.env.VITE_FIREBASE_CONFIG_JSON
  );
  const parsedSnippet = rawJsonEnv ? parseFirebaseConfigSnippet(rawJsonEnv) : null;

  const candidate = normalizeFirebaseClientConfig({
    apiKey:
      parsedSnippet?.apiKey ||
      cleanEnvVal(process.env.FIREBASE_API_KEY) ||
      cleanEnvVal(process.env.VITE_FIREBASE_API_KEY) ||
      cleanEnvVal(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    projectId:
      parsedSnippet?.projectId ||
      cleanEnvVal(process.env.FIREBASE_PROJECT_ID) ||
      cleanEnvVal(process.env.VITE_FIREBASE_PROJECT_ID) ||
      cleanEnvVal(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    authDomain:
      parsedSnippet?.authDomain ||
      cleanEnvVal(process.env.FIREBASE_AUTH_DOMAIN) ||
      cleanEnvVal(process.env.VITE_FIREBASE_AUTH_DOMAIN) ||
      cleanEnvVal(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
    storageBucket:
      parsedSnippet?.storageBucket ||
      cleanEnvVal(process.env.FIREBASE_STORAGE_BUCKET) ||
      cleanEnvVal(process.env.VITE_FIREBASE_STORAGE_BUCKET) ||
      cleanEnvVal(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
    messagingSenderId:
      parsedSnippet?.messagingSenderId ||
      cleanEnvVal(process.env.FIREBASE_MESSAGING_SENDER_ID) ||
      cleanEnvVal(process.env.VITE_FIREBASE_MESSAGING_SENDER_ID) ||
      cleanEnvVal(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
    appId:
      parsedSnippet?.appId ||
      cleanEnvVal(process.env.FIREBASE_APP_ID) ||
      cleanEnvVal(process.env.VITE_FIREBASE_APP_ID) ||
      cleanEnvVal(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
    databaseId:
      parsedSnippet?.databaseId ||
      cleanEnvVal(process.env.FIREBASE_DATABASE_ID) ||
      cleanEnvVal(process.env.VITE_FIREBASE_DATABASE_ID) ||
      '(default)'
  });

  const isConfigured = isValidFirebaseClientConfig(candidate);

  return {
    isConfigured,
    source: isConfigured ? ('env' as const) : ('none' as const),
    config: isConfigured ? candidate : null
  };
}

function getEnvSecretFlags() {
  const githubTokenEnv = cleanEnvVal(
    process.env.GITHUB_FINE_GRAINED_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  );
  const turnstileSecretEnv = sanitizeTurnstileKey(
    process.env.TURNSTILE_SECRET_KEY ||
      process.env.VITE_TURNSTILE_SECRET_KEY ||
      process.env.CF_TURNSTILE_SECRET_KEY ||
      ''
  );
  return {
    hasEnvGithubToken: Boolean(githubTokenEnv),
    hasEnvTurnstileSecret: Boolean(turnstileSecretEnv)
  };
}

function buildSafeEnvDiagnostics(
  adminEnv: ReturnType<typeof getAdminAuthEnv>,
  fbEnv: ReturnType<typeof getFirebaseEnvConfig>,
  includeFirebaseConfig = false,
  siteConfig?: SiteConfig
) {
  const vaultSecretSet = Boolean(
    cleanEnvVal(process.env.VAULT_ENCRYPTION_SECRET) ||
      cleanEnvVal(process.env.LINK_VAULT_MASTER_SECRET) ||
      cleanEnvVal(process.env.AES_KEY) ||
      cleanEnvVal(process.env.AES_SECRET) ||
      cleanEnvVal(process.env.VAULT_SECRET_KEY) ||
      cleanEnvVal(process.env.HMAC_SECRET)
  );
  const turnstileSiteKeyEnv = sanitizeTurnstileKey(
    process.env.VITE_TURNSTILE_SITE_KEY ||
      process.env.TURNSTILE_SITE_KEY ||
      process.env.CF_TURNSTILE_SITE_KEY ||
      siteConfig?.securityGate?.turnstileSiteKey ||
      ''
  );
  const { hasEnvGithubToken, hasEnvTurnstileSecret } = getEnvSecretFlags();

  return {
    isProduction: adminEnv.policy.isProduction,
    adminEmailConfigured: adminEnv.isCustomEmail,
    adminPasswordConfigured: adminEnv.isCustomPassword,
    adminApiKeyRequired: adminEnv.requiresApiKey,
    adminSessionSecretCustom: adminEnv.isCustomSecret,
    vaultSecretCustom: vaultSecretSet,
    turnstileSiteKeyConfigured: Boolean(turnstileSiteKeyEnv),
    turnstileSecretKeyConfigured: Boolean(
      hasEnvTurnstileSecret ||
        siteConfig?.securityGate?.turnstileSecretKey ||
        siteConfig?.securityGate?.hasTurnstileSecretKey
    ),
    githubTokenConfigured: Boolean(
      hasEnvGithubToken ||
        siteConfig?.githubConfig?.fineGrainedToken ||
        siteConfig?.githubConfig?.hasFineGrainedToken
    ),
    firebaseEnvConfigured: fbEnv.isConfigured,
    firebaseProjectId: fbEnv.config?.projectId || null,
    ...(includeFirebaseConfig
      ? { firebaseConfig: sanitizeFirebaseConfigForClient(fbEnv.config) }
      : {}),
    runtime: 'Node.js Express'
  };
}

/**
 * Clean Empty Admin Configuration seeded ONLY with optional Infrastructure Env Vars
 * (Zero static/demo articles, sections, or FAQs!)
 */
function getEnvSeededEmptyConfig(): SiteConfig {
  const base = JSON.parse(JSON.stringify(EMPTY_ADMIN_CONFIG)) as SiteConfig;
  const envBrand = (process.env.SITE_BRAND_NAME || '').trim();
  const envCanonical = (process.env.SITE_CANONICAL_URL || '').trim();
  const envEmail = (process.env.SITE_CONTACT_EMAIL || '').trim();

  if (envBrand) {
    base.brand.name = envBrand;
    base.brand.shortName = envBrand;
    base.seo.softwareDetails.name = envBrand;
    base.navigation.copyright = `© ${new Date().getFullYear()} ${envBrand}. All rights reserved.`;
  }
  if (envCanonical) {
    base.seo.canonicalUrl = envCanonical;
    base.domainConfig.primaryDomain = envCanonical;
  }
  if (envEmail) {
    base.brand.contactEmail = envEmail;
  }

  const envGhOwner = cleanEnvVal(process.env.GITHUB_REPO_OWNER || process.env.GITHUB_OWNER);
  const envGhRepo = cleanEnvVal(process.env.GITHUB_REPO_NAME || process.env.GITHUB_REPO);
  const envGhBranch = cleanEnvVal(process.env.GITHUB_BRANCH);
  const envGhToken = cleanEnvVal(
    process.env.GITHUB_FINE_GRAINED_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  );
  if (envGhOwner) base.githubConfig.repoOwner = envGhOwner;
  if (envGhRepo) base.githubConfig.repoName = envGhRepo;
  if (envGhBranch) base.githubConfig.branch = envGhBranch;
  if (envGhToken) {
    base.githubConfig.fineGrainedToken = envGhToken;
    base.githubConfig.hasFineGrainedToken = true;
  }

  return base;
}

function decodeFsVal(val: any): any {
  if (!val || typeof val !== 'object') return null;
  if ('stringValue' in val) return val.stringValue;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    return (val.arrayValue?.values || []).map((item: any) => decodeFsVal(item));
  }
  if ('mapValue' in val) {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(val.mapValue?.fields || {})) {
      out[k] = decodeFsVal(v);
    }
    return out;
  }
  return null;
}

function encodeFsVal(val: any): Record<string, any> {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return { integerValue: '0' };
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map((item) => encodeFsVal(item)) } };
  }
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) fields[k] = encodeFsVal(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

const FIRESTORE_FETCH_TIMEOUT_MS = 15000;

async function fetchWithTimeoutNode(
  url: string,
  init: RequestInit = {},
  timeoutMs = FIRESTORE_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readSiteConfigWithStatusNode(
  fbCfg: any
): Promise<{ status: 'ok' | 'empty' | 'error'; config: SiteConfig | null; error?: string }> {
  if (!fbCfg?.projectId || !fbCfg?.apiKey) {
    return { status: 'error', config: null, error: 'Missing Firebase config' };
  }
  const dbId = encodeURIComponent(fbCfg.databaseId || '(default)');
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    fbCfg.projectId
  )}/databases/${dbId}/documents`;

  const [modulesRes, mainRes] = await Promise.all([
    fetchWithTimeoutNode(`${base}/cmsModules?pageSize=50&key=${encodeURIComponent(fbCfg.apiKey)}`, {
      headers: { Accept: 'application/json' }
    }).catch(() => null),
    fetchWithTimeoutNode(`${base}/siteConfig/main?key=${encodeURIComponent(fbCfg.apiKey)}`, {
      headers: { Accept: 'application/json' }
    }).catch(() => null)
  ]);

  if (!modulesRes || !mainRes) {
    return { status: 'error', config: null, error: 'Network error reaching Firestore' };
  }

  if (
    (mainRes.status !== 200 && mainRes.status !== 404) ||
    (modulesRes.status !== 200 && modulesRes.status !== 404)
  ) {
    const failedRes = mainRes.status !== 200 && mainRes.status !== 404 ? mainRes : modulesRes;
    const errBody: any = await failedRes.json().catch(() => ({}));
    const errMsg = errBody?.error?.message || `Firestore HTTP ${failedRes.status}`;
    return { status: 'error', config: null, error: errMsg };
  }

  let mainObj: Record<string, any> | null = null;
  if (mainRes.ok) {
    const docData: any = await mainRes.json().catch(() => null);
    if (docData?.fields) {
      mainObj = {};
      for (const [k, v] of Object.entries(docData.fields)) {
        mainObj[k] = decodeFsVal(v);
      }
    }
  }

  let modulesCount = 0;
  const assembled: Record<string, any> = JSON.parse(JSON.stringify(EMPTY_ADMIN_CONFIG));
  if (mainObj) {
    for (const key of Object.keys(mainObj)) {
      if (key !== 'modularSync') assembled[key] = mainObj[key];
    }
  }
  if (modulesRes && modulesRes.ok) {
    const listData: any = await modulesRes.json().catch(() => null);
    const docs = Array.isArray(listData?.documents) ? listData.documents : [];
    for (const docItem of docs) {
      const docName = String(docItem.name || '').split('/').pop() || '';
      if (isCmsModuleKey(docName) && docItem.fields) {
        const decodedFields: Record<string, any> = {};
        for (const [k, v] of Object.entries(docItem.fields)) {
          decodedFields[k] = decodeFsVal(v);
        }
        if (decodedFields.data !== undefined) {
          assembled[docName] = decodedFields.data;
          modulesCount += 1;
        }
      }
    }
  }
  if (modulesCount === 0 && !mainObj) {
    return { status: 'empty', config: null };
  }

  if (assembled.githubConfig && typeof assembled.githubConfig === 'object') {
    const rawTok = cleanEnvVal(assembled.githubConfig.fineGrainedToken);
    let decryptedTok = '';
    if (rawTok && rawTok !== SECRET_MASK) {
      try {
        decryptedTok = rawTok.startsWith('v2.')
          ? await decryptVaultValue(rawTok, process.env, resolveVaultSecret(process.env))
          : rawTok;
      } catch {
        decryptedTok = '';
      }
    }
    assembled.githubConfig.fineGrainedToken = decryptedTok;
    assembled.githubConfig.hasFineGrainedToken = Boolean(decryptedTok);
  }

  if (assembled.securityGate && typeof assembled.securityGate === 'object') {
    const rawTs = cleanEnvVal(assembled.securityGate.turnstileSecretKey);
    let decryptedTs = '';
    if (rawTs && rawTs !== SECRET_MASK) {
      try {
        decryptedTs = rawTs.startsWith('v2.')
          ? await decryptVaultValue(rawTs, process.env, resolveVaultSecret(process.env))
          : rawTs;
      } catch {
        decryptedTs = '';
      }
    }
    assembled.securityGate.turnstileSecretKey = decryptedTs;
    assembled.securityGate.hasTurnstileSecretKey = Boolean(decryptedTs);
  }

  return { status: 'ok', config: mergeSiteConfig(assembled, EMPTY_ADMIN_CONFIG) };
}

async function prepareModuleForFirestoreNode(moduleKey: string, moduleData: any): Promise<any> {
  if (!moduleData || typeof moduleData !== 'object') return moduleData;
  const clone = JSON.parse(JSON.stringify(moduleData));
  if (moduleKey === 'githubConfig') {
    const rawTok = cleanEnvVal(clone.fineGrainedToken);
    if (rawTok && rawTok !== SECRET_MASK) {
      clone.fineGrainedToken = rawTok.startsWith('v2.')
        ? rawTok
        : await encryptVaultValue(rawTok, process.env, resolveVaultSecret(process.env));
      clone.hasFineGrainedToken = true;
    } else {
      clone.fineGrainedToken = '';
      clone.hasFineGrainedToken = false;
    }
  } else if (moduleKey === 'securityGate') {
    const rawTs = cleanEnvVal(clone.turnstileSecretKey);
    if (rawTs && rawTs !== SECRET_MASK) {
      clone.turnstileSecretKey = rawTs.startsWith('v2.')
        ? rawTs
        : await encryptVaultValue(rawTs, process.env, resolveVaultSecret(process.env));
      clone.hasTurnstileSecretKey = true;
    } else {
      clone.turnstileSecretKey = '';
      clone.hasTurnstileSecretKey = false;
    }
  }
  return clone;
}

async function writeBatchToFirestoreRestNode(
  fbCfg: any,
  modulesMap: Record<string, any>,
  meta: { updatedAt?: number; dirtyModulesSinceSync?: string[] } = {}
): Promise<{ ok: boolean; error?: string; writesCommitted?: number }> {
  if (!fbCfg?.projectId || !fbCfg?.apiKey) {
    return { ok: false, error: 'Missing Firebase config' };
  }
  const dbIdRaw = fbCfg.databaseId || '(default)';
  const docRoot = `projects/${fbCfg.projectId}/databases/${dbIdRaw}/documents`;
  const commitUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    fbCfg.projectId
  )}/databases/${encodeURIComponent(dbIdRaw)}/documents:commit?key=${encodeURIComponent(fbCfg.apiKey)}`;
  const now = meta.updatedAt || Date.now();
  const writes: Array<Record<string, any>> = [];

  for (const [moduleKey, moduleData] of Object.entries(modulesMap || {})) {
    if (!isCmsModuleKey(moduleKey) || moduleData === undefined) continue;
    const preparedData = await prepareModuleForFirestoreNode(moduleKey, moduleData);
    writes.push({
      update: {
        name: `${docRoot}/cmsModules/${moduleKey}`,
        fields: {
          data: encodeFsVal(preparedData),
          updatedAt: encodeFsVal(now)
        }
      }
    });
  }

  writes.push({
    update: {
      name: `${docRoot}/siteConfig/main`,
      fields: {
        updatedAt: encodeFsVal(now),
        dirtyModulesSinceSync: encodeFsVal(meta.dirtyModulesSinceSync || []),
        modularSync: encodeFsVal(true)
      }
    },
    updateMask: { fieldPaths: ['updatedAt', 'dirtyModulesSinceSync', 'modularSync'] }
  });

  try {
    const res = await fetchWithTimeoutNode(commitUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes })
    });
    if (!res.ok) {
      const errBody: any = await res.json().catch(() => ({}));
      return { ok: false, error: errBody?.error?.message || `HTTP ${res.status}` };
    }
    return { ok: true, writesCommitted: writes.length };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Firestore batch commit failed' };
  }
}

let cachedServerConfig: SiteConfig | null = null;

/**
 * Compile the 100% static public website files to `/public/static-routes` and `/dist-public`
 */
function buildStaticPublicFilesOnDisk(config: SiteConfig) {
  try {
    const indexHtmlPath = path.resolve(process.cwd(), 'index.html');
    const appJsPath = path.resolve(process.cwd(), 'app.js');
    const moreinfoHtmlPath = path.resolve(process.cwd(), 'moreinfo.html');
    const moreinfoJsPath = path.resolve(process.cwd(), 'moreinfo.js');
    if (!fs.existsSync(indexHtmlPath)) return null;
    const indexTemplate = fs.readFileSync(indexHtmlPath, 'utf-8');
    const appJsContent = fs.existsSync(appJsPath) ? fs.readFileSync(appJsPath, 'utf-8') : undefined;
    const moreinfoHtmlTemplate = fs.existsSync(moreinfoHtmlPath)
      ? fs.readFileSync(moreinfoHtmlPath, 'utf-8')
      : undefined;
    const moreinfoJsContent = fs.existsSync(moreinfoJsPath)
      ? fs.readFileSync(moreinfoJsPath, 'utf-8')
      : undefined;

    return compileStaticSiteBundle(config, indexTemplate, {
      writeToDisk: true,
      distPublicDir: DIST_PUBLIC_DIR,
      publicStaticRoutesDir: PUBLIC_STATIC_ROUTES_DIR,
      appJsContent,
      moreinfoHtmlTemplate,
      moreinfoJsContent
    });
  } catch (err) {
    console.warn('Warning compiling static public bundle:', err);
    return null;
  }
}

function loadPersistedSiteConfig(): SiteConfig {
  if (cachedServerConfig) return cachedServerConfig;

  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      const raw = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      cachedServerConfig = mergeSiteConfig(parsed, EMPTY_ADMIN_CONFIG);
      buildStaticPublicFilesOnDisk(cachedServerConfig);
      return cachedServerConfig;
    }
  } catch (err) {
    console.warn('Warning reading site-config.json, initializing clean state:', err);
  }

  const seeded = getEnvSeededEmptyConfig();
  savePersistedSiteConfig(seeded);
  return seeded;
}

function savePersistedSiteConfig(newConfig: Partial<SiteConfig>): SiteConfig {
  const existing = cachedServerConfig || EMPTY_ADMIN_CONFIG;
  const withSecrets = preserveSecretsOnSave(newConfig, existing);
  const normalized = mergeSiteConfig(withSecrets, EMPTY_ADMIN_CONFIG);
  normalized.updatedAt = Date.now();
  normalized.syncLogs = Array.isArray(withSecrets.syncLogs)
    ? withSecrets.syncLogs.slice(0, 30)
    : Array.isArray(existing.syncLogs)
    ? existing.syncLogs.slice(0, 30)
    : [];
  normalized.dirtyModulesSinceSync = Array.isArray(withSecrets.dirtyModulesSinceSync)
    ? withSecrets.dirtyModulesSinceSync
    : Array.isArray(existing.dirtyModulesSinceSync)
    ? existing.dirtyModulesSinceSync
    : [];

  cachedServerConfig = normalized;

  try {
    const tempPath = `${CONFIG_FILE_PATH}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(normalized, null, 2), 'utf-8');
    fs.renameSync(tempPath, CONFIG_FILE_PATH);
  } catch (err) {
    console.error('Failed writing site-config.json:', err);
  }

  // Always re-compile the static public website bundle whenever Admin saves!
  buildStaticPublicFilesOnDisk(normalized);

  return normalized;
}

function safeTimingCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  // Hash both values with SHA-256 so buffer lengths are always identical (32 bytes),
  // eliminating secret-length timing side-channels.
  const digestA = crypto.createHash('sha256').update(a, 'utf-8').digest();
  const digestB = crypto.createHash('sha256').update(b, 'utf-8').digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

const ADMIN_SESSION_TTL_SEC = 60 * 60 * 12; // 12 hours
const ADMIN_SESSION_TTL_MS = ADMIN_SESSION_TTL_SEC * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_IP_ATTEMPTS = 5;
const LOGIN_MAX_GLOBAL_ATTEMPTS = 12;

const loginAttemptTracker = new Map<string, { count: number; resetAt: number }>();
const revokedJtis = new Map<string, number>();

function cleanupRevokedJtis() {
  const now = Date.now();
  for (const [jti, exp] of revokedJtis.entries()) {
    if (now > exp) {
      revokedJtis.delete(jti);
    }
  }
  while (revokedJtis.size > 5000) {
    const oldestKey = revokedJtis.keys().next().value;
    if (!oldestKey) break;
    revokedJtis.delete(oldestKey);
  }
}

function getTrustedLoginRateLimitIp(req: express.Request): string {
  const cfIp = cleanEnvVal(req.headers['cf-connecting-ip']);
  if (cfIp) return cfIp;
  if (cleanEnvVal(process.env.TRUST_PROXY).toLowerCase() === 'true') {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (xff) return xff;
  }
  return String(req.socket.remoteAddress || 'local').trim();
}

function checkLoginRateLimit(ip: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const globalEntry = loginAttemptTracker.get('__global__');
  if (globalEntry && now <= globalEntry.resetAt && globalEntry.count >= LOGIN_MAX_GLOBAL_ATTEMPTS) {
    return { allowed: false, retryAfterSec: Math.ceil((globalEntry.resetAt - now) / 1000) };
  }
  const entry = loginAttemptTracker.get(ip);
  if (!entry || now > entry.resetAt) {
    if (entry) loginAttemptTracker.delete(ip);
    return { allowed: true };
  }
  if (entry.count >= LOGIN_MAX_IP_ATTEMPTS) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true };
}

function recordFailedLoginAttempt(ip: string) {
  const now = Date.now();
  for (const [k, v] of loginAttemptTracker.entries()) {
    if (now > v.resetAt) loginAttemptTracker.delete(k);
  }
  while (loginAttemptTracker.size > 5000) {
    const oldest = loginAttemptTracker.keys().next().value;
    if (!oldest) break;
    loginAttemptTracker.delete(oldest);
  }
  for (const bucketKey of [ip, '__global__']) {
    const entry = loginAttemptTracker.get(bucketKey);
    if (!entry || now > entry.resetAt) {
      loginAttemptTracker.set(bucketKey, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    } else {
      entry.count += 1;
    }
  }
}

function clearLoginAttempts(ip: string) {
  loginAttemptTracker.delete(ip);
  loginAttemptTracker.delete('__global__');
}

function parseCookies(cookieHeader = ''): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of String(cookieHeader).split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

function isHttpsRequest(req: express.Request): boolean {
  const xfProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  return Boolean(req.secure || xfProto.includes('https'));
}

function getSessionCookieName(isHttps: boolean): string {
  return isHttps ? '__Host-cms_admin_session' : 'cms_admin_session';
}

function setAdminSessionCookie(res: express.Response, token: string, isHttps: boolean) {
  const name = getSessionCookieName(isHttps);
  const parts = [
    `${name}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${ADMIN_SESSION_TTL_SEC}`
  ];
  if (isHttps) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearAdminSessionCookie(res: express.Response, isHttps: boolean) {
  const cookies = [
    'cms_admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    `__Host-cms_admin_session=; Path=/; HttpOnly; SameSite=Lax; ${isHttps ? 'Secure; ' : ''}Max-Age=0`
  ];
  res.setHeader('Set-Cookie', cookies);
}

function createAdminToken(email: string, secret: string, credVersion = ''): string {
  const jti = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  const now = Date.now();
  const payload = JSON.stringify({
    iss: 'master-cms-admin',
    typ: 'admin-session',
    ver: 2,
    email,
    role: 'Master Administrator',
    cv: credVersion,
    jti,
    iat: now,
    exp: now + ADMIN_SESSION_TTL_MS
  });
  const base64Payload = Buffer.from(payload).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(base64Payload)
    .digest('base64url');
  return `${base64Payload}.${signature}`;
}

function extractAdminTokenFromReq(req: express.Request): {
  token: string;
  viaApiKeyHeader: boolean;
  fromCookie: boolean;
} {
  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const headerApiKey = ((req.headers['x-admin-api-key'] as string) || '').trim();
  const cookies = parseCookies(req.headers.cookie || '');
  const cookieToken =
    cookies['__Host-cms_admin_session'] || cookies['cms_admin_session'] || '';

  if (headerApiKey) {
    return { token: headerApiKey, viaApiKeyHeader: true, fromCookie: false };
  }
  if (cookieToken) {
    return { token: cookieToken, viaApiKeyHeader: false, fromCookie: true };
  }
  return { token: bearerToken, viaApiKeyHeader: Boolean(bearerToken), fromCookie: false };
}

function verifyAdminToken(
  token: string | undefined,
  reqHost = '',
  ignoreExpiryForLogout = false,
  fromCookie = false
): { valid: boolean; email?: string; role?: string; jti?: string; exp?: number; policyError?: string } {
  const adminEnv = getAdminAuthEnv(reqHost);
  if (!adminEnv.policy.credentialsReady) {
    return { valid: false, policyError: adminEnv.policy.setupError || 'Admin auth not configured' };
  }
  if (!token || typeof token !== 'string') return { valid: false };

  // Session cookies may never contain static API keys — only signed session tokens
  if (!fromCookie && adminEnv.apiKey && safeTimingCompare(token, adminEnv.apiKey)) {
    return { valid: true, email: 'api-key-admin', role: 'Master Administrator' };
  }

  if (!adminEnv.secret) return { valid: false };

  const parts = token.split('.');
  if (parts.length !== 2) return { valid: false };
  const [base64Payload, signature] = parts;

  const expectedSig = crypto
    .createHmac('sha256', adminEnv.secret)
    .update(base64Payload)
    .digest('base64url');

  if (!safeTimingCompare(signature, expectedSig)) return { valid: false };

  try {
    const decoded = JSON.parse(Buffer.from(base64Payload, 'base64url').toString('utf-8'));
    const claimCheck = validateAdminSessionClaims(decoded, Date.now());
    if (!claimCheck.valid || !claimCheck.claims) {
      if (ignoreExpiryForLogout && claimCheck.reason === 'expired' && typeof decoded?.jti === 'string') {
        return { valid: false, jti: decoded.jti, exp: typeof decoded.exp === 'number' ? decoded.exp : undefined };
      }
      return { valid: false };
    }
    if (adminEnv.credVersion) {
      if (!claimCheck.claims.cv || !safeTimingCompare(claimCheck.claims.cv, adminEnv.credVersion)) {
        return { valid: false };
      }
    }
    if (revokedJtis.has(claimCheck.claims.jti)) {
      return { valid: false };
    }
    return {
      valid: true,
      email: claimCheck.claims.email,
      role: claimCheck.claims.role,
      jti: claimCheck.claims.jti,
      exp: claimCheck.claims.exp
    };
  } catch {
    return { valid: false };
  }
}

function verifyAdminCsrf(req: express.Request): { ok: boolean; error?: string } {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return { ok: true };
  }

  const secFetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase().trim();
  if (secFetchSite === 'cross-site') {
    return { ok: false, error: 'Cross-site request blocked.' };
  }

  const reqHost = String(req.headers.host || '').toLowerCase();
  const origin = String(req.headers.origin || '').trim();
  const referer = String(req.headers.referer || '').trim();

  if (origin) {
    try {
      const originHost = new URL(origin).host.toLowerCase();
      if (reqHost && originHost !== reqHost) {
        return { ok: false, error: 'Cross-origin mutating request blocked.' };
      }
    } catch {
      return { ok: false, error: 'Invalid Origin header.' };
    }
  } else if (referer) {
    try {
      const refHost = new URL(referer).host.toLowerCase();
      if (reqHost && refHost !== reqHost) {
        return { ok: false, error: 'Cross-origin Referer blocked.' };
      }
    } catch {
      return { ok: false, error: 'Invalid Referer header.' };
    }
  }

  const adminEnv = getAdminAuthEnv(req.headers.host || '');
  const headerApiKey = ((req.headers['x-admin-api-key'] as string) || '').trim();
  if (headerApiKey && adminEnv.apiKey && safeTimingCompare(headerApiKey, adminEnv.apiKey)) {
    return { ok: true };
  }

  const csrfHeader = String(req.headers['x-admin-csrf'] || req.headers['x-requested-with'] || '').trim();
  if (csrfHeader !== '1' && csrfHeader !== 'XMLHttpRequest') {
    return { ok: false, error: 'Missing required CSRF verification header (X-Admin-CSRF).' };
  }

  return { ok: true };
}

function requireAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const { token, fromCookie } = extractAdminTokenFromReq(req);
  const verification = verifyAdminToken(token, req.headers.host || '', false, fromCookie);
  if (verification.policyError) {
    res.status(503).json({
      success: false,
      code: 'admin-not-configured',
      error: 'Administrator authentication is unavailable until configured on this server.'
    });
    return;
  }
  if (!verification.valid) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized. Please sign in to continue.'
    });
    return;
  }

  const csrf = verifyAdminCsrf(req);
  if (!csrf.ok) {
    res.status(403).json({
      success: false,
      error: csrf.error || 'CSRF verification failed.'
    });
    return;
  }

  const rawFbHeader = req.headers['x-firebase-config'];
  if (typeof rawFbHeader === 'string' && rawFbHeader.trim()) {
    try {
      const parsedFb = normalizeFirebaseClientConfig(JSON.parse(rawFbHeader));
      if (isValidFirebaseClientConfig(parsedFb)) {
        runtimeFirebaseOverride = parsedFb;
      }
    } catch {
      // Ignore malformed X-Firebase-Config header
    }
  }

  (req as any).adminEmail = verification.email;
  (req as any).adminJti = verification.jti;
  (req as any).adminExp = verification.exp;
  next();
}

const ADMIN_CSP_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https://firestore.googleapis.com https://api.github.com; frame-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";

async function startServer() {
  const app = express();
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    const urlPath = req.path || '';
    if (
      urlPath.startsWith('/admin') ||
      urlPath.startsWith('/api/admin') ||
      urlPath.startsWith('/api/config') ||
      urlPath.startsWith('/api/github') ||
      urlPath.startsWith('/api/firebase') ||
      urlPath === '/api/static-bundle' ||
      urlPath === '/api/upload-image' ||
      urlPath === '/api/seo-health' ||
      urlPath === '/api/news'
    ) {
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Content-Security-Policy', ADMIN_CSP_POLICY);
      res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
      res.setHeader('Referrer-Policy', 'no-referrer');
    }
    next();
  });
  app.use(express.json({ limit: '15mb' }));
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
      res.status(400).json({ success: false, error: 'Invalid JSON request body.' });
      return;
    }
    if (err && err.type === 'entity.too.large') {
      res.status(413).json({ success: false, error: 'Request payload exceeds maximum allowed size.' });
      return;
    }
    next(err);
  });
  app.use(
    '/uploads',
    (_req, res, next) => {
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      next();
    },
    express.static(UPLOADS_DIR)
  );
  app.use(
    '/static-routes',
    (_req, res, next) => {
      res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
      next();
    },
    express.static(PUBLIC_STATIC_ROUTES_DIR)
  );

  setImmediate(() => {
    try {
      loadPersistedSiteConfig();
    } catch (err) {
      console.warn('Initial config warmup warning:', err);
    }
  });

  // 1. Static / Partial Route Payload Endpoint (Used when filtering news categories or fallback)
  app.get('/api/route', (req, res) => {
    const rawPath = String(req.query.path || '/').trim();
    const newsCategory = String(req.query.cat || 'ALL').trim();
    const config = loadPersistedSiteConfig();
    const payload = buildPartialRoutePayload(rawPath, config, newsCategory);

    res.setHeader('Cache-Control', 'no-cache');
    res.json({
      success: true,
      payload
    });
  });

  // 2. Environment Firebase Config Endpoint (Protected: Authenticated Admin Studio ONLY — Never leaks raw apiKey)
  app.get('/api/firebase-config', requireAdminAuth, (_req, res) => {
    const fbEnv = getFirebaseEnvConfig();
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      success: true,
      isConfigured: fbEnv.isConfigured,
      source: fbEnv.source,
      config: sanitizeFirebaseConfigForClient(fbEnv.config)
    });
  });

  // 2a. Save or Revert Runtime Firebase Connection Server-Side (`POST /api/firebase/connect`)
  app.post('/api/firebase/connect', requireAdminAuth, async (req, res) => {
    if (req.body?.clear) {
      runtimeFirebaseOverride = null;
      const fbEnv = getFirebaseEnvConfig();
      res.json({
        success: true,
        cleared: true,
        isConfigured: fbEnv.isConfigured,
        config: sanitizeFirebaseConfigForClient(fbEnv.config)
      });
      return;
    }

    const rawCandidate = req.body?.firebaseConfig || req.body || {};
    const envCfg = getFirebaseEnvConfig().config;
    const mergedCandidate = normalizeFirebaseClientConfig({
      ...rawCandidate,
      apiKey:
        rawCandidate.apiKey && rawCandidate.apiKey !== '__SECRET_CONFIGURED__'
          ? rawCandidate.apiKey
          : envCfg?.apiKey || ''
    });

    if (!isValidFirebaseClientConfig(mergedCandidate)) {
      res.status(400).json({
        success: false,
        error: 'Valid Firebase API Key and Project ID are required.'
      });
      return;
    }

    runtimeFirebaseOverride = mergedCandidate;
    const cloudRead = await readSiteConfigWithStatusNode(mergedCandidate);
    let currentConfig = loadPersistedSiteConfig();
    if (cloudRead.status === 'ok' && cloudRead.config) {
      currentConfig = savePersistedSiteConfig(preserveSecretsOnSave(cloudRead.config, currentConfig));
    } else if (cloudRead.status === 'empty') {
      currentConfig = savePersistedSiteConfig(getEnvSeededEmptyConfig());
    }

    const fbEnv = getFirebaseEnvConfig();
    res.json({
      success: true,
      isConfigured: fbEnv.isConfigured,
      firestoreStatus: cloudRead.status,
      config: sanitizeFirebaseConfigForClient(fbEnv.config),
      siteConfig: sanitizeConfigForClient(currentConfig, getEnvSecretFlags())
    });
  });

  // 2b. Live Firebase Firestore REST Connectivity Diagnostic (`POST /api/firebase/test`)
  app.post('/api/firebase/test', requireAdminAuth, async (req, res) => {
    const fbEnv = getFirebaseEnvConfig();
    const rawCandidate = req.body?.firebaseConfig || {};
    const cfg = normalizeFirebaseClientConfig({
      ...(fbEnv.config || {}),
      ...rawCandidate,
      apiKey:
        rawCandidate.apiKey && rawCandidate.apiKey !== '__SECRET_CONFIGURED__'
          ? rawCandidate.apiKey
          : fbEnv.config?.apiKey || ''
    });

    if (!isValidFirebaseClientConfig(cfg)) {
      res.status(400).json({
        success: false,
        code: 'invalid-config',
        error: 'Valid Firebase API Key and Project ID are required.'
      });
      return;
    }

    const dbId = encodeURIComponent(cfg.databaseId || '(default)');
    const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      cfg.projectId
    )}/databases/${dbId}/documents/siteConfig/main?key=${encodeURIComponent(cfg.apiKey)}`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const fbRes = await fetch(endpoint, { signal: controller.signal });
      clearTimeout(timer);

      if (fbRes.ok) {
        res.json({
          success: true,
          status: 'connected',
          documentExists: true,
          projectId: cfg.projectId,
          databaseId: cfg.databaseId,
          message: `Connected to Firestore (${cfg.projectId}) — live modular workspace verified.`
        });
        return;
      }

      const errData: any = await fbRes.json().catch(() => ({}));
      const msg = String(errData?.error?.message || fbRes.statusText || '');
      const statusText = String(errData?.error?.status || '');

      if (fbRes.status === 404 && !msg.toLowerCase().includes('database')) {
        res.json({
          success: true,
          status: 'connected-empty',
          documentExists: false,
          projectId: cfg.projectId,
          databaseId: cfg.databaseId,
          message: `Connected to Firestore (${cfg.projectId}). Database is empty and ready for your live edits.`
        });
        return;
      }

      if (fbRes.status === 403 || statusText === 'PERMISSION_DENIED') {
        res.status(403).json({
          success: false,
          code: 'permission-denied',
          error: `Firestore Permission Denied for ${cfg.projectId}. Check your Firestore Security Rules or API Key restrictions.`
        });
        return;
      }

      res.status(fbRes.status).json({
        success: false,
        code: statusText || `http-${fbRes.status}`,
        error: msg || `Firestore check failed with HTTP ${fbRes.status}`
      });
    } catch (err: any) {
      res.status(502).json({
        success: false,
        code: 'network-error',
        error: `Could not reach Firestore REST API: ${err?.message || 'Timeout'}`
      });
    }
  });

  // 3. Live Admin Configuration Endpoint (Protected: Authenticated Admin Studio ONLY — Never cached, Secrets Masked)
  app.get('/api/config', requireAdminAuth, async (req, res) => {
    const adminEnv = getAdminAuthEnv(req.headers.host || '');
    const fbEnv = getFirebaseEnvConfig();
    let config = loadPersistedSiteConfig();
    let serverReadFirestore = false;

    if (fbEnv.isConfigured && fbEnv.config) {
      const cloudRead = await readSiteConfigWithStatusNode(fbEnv.config);
      if (cloudRead.status === 'ok' && cloudRead.config) {
        serverReadFirestore = true;
        config = savePersistedSiteConfig(preserveSecretsOnSave(cloudRead.config, config));
      } else if (cloudRead.status === 'empty') {
        serverReadFirestore = true;
        // Never wipe existing user content! Seed Firestore with the existing config so cloud Firestore has the content!
        const existingMap: Record<string, any> = {};
        for (const k of CMS_MODULE_KEYS) {
          existingMap[k] = config[k as CmsModuleKey];
        }
        await writeBatchToFirestoreRestNode(fbEnv.config, existingMap, {
          updatedAt: config.updatedAt,
          dirtyModulesSinceSync: config.dirtyModulesSinceSync
        });
      }
    }

    const seoAudit = auditSiteSeoHealth(config);
    const sanitizedConfig = sanitizeConfigForClient(config, getEnvSecretFlags());
    const safeFbEnv = {
      isConfigured: fbEnv.isConfigured,
      source: fbEnv.source,
      config: sanitizeFirebaseConfigForClient(fbEnv.config)
    };

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      success: true,
      config: sanitizedConfig,
      firebaseEnv: safeFbEnv,
      serverReadFirestore,
      firebaseProjectId: fbEnv.config?.projectId || null,
      envDiagnostics: buildSafeEnvDiagnostics(adminEnv, fbEnv, true, config),
      seoAudit
    });
  });

  // 4. Device Image Upload Endpoint (Strict MIME, Magic-Byte, SVG Script Guard, Size Cap & Path Confinement)
  app.post('/api/upload-image', requireAdminAuth, (req, res) => {
    try {
      const { fileName = 'image.png', dataUrl = '' } = req.body || {};
      if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
        res.status(400).json({ success: false, error: 'Valid image dataUrl is required.' });
        return;
      }

      const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/=\s]+)$/);
      if (!matches || matches.length !== 3) {
        res.status(400).json({ success: false, error: 'Invalid base64 image format.' });
        return;
      }

      const rawMimeSub = matches[1].toLowerCase();
      const mimeToExt: Record<string, string> = {
        png: 'png',
        jpeg: 'jpg',
        jpg: 'jpg',
        webp: 'webp',
        gif: 'gif',
        avif: 'avif',
        'svg+xml': 'svg'
      };
      const ext = mimeToExt[rawMimeSub];
      if (!ext) {
        res.status(400).json({
          success: false,
          error: 'Unsupported image format. Allowed formats: PNG, JPEG, WebP, GIF, AVIF, and static SVG.'
        });
        return;
      }

      const base64Data = matches[2].replace(/\s+/g, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
      if (buffer.length === 0 || buffer.length > MAX_UPLOAD_BYTES) {
        res.status(400).json({
          success: false,
          error: 'Image must be non-empty and under 5 MB.'
        });
        return;
      }

      // Verify binary magic bytes for raster formats & block active scripts in SVG uploads
      if (ext === 'png') {
        const isPng =
          buffer.length >= 8 &&
          buffer[0] === 0x89 &&
          buffer[1] === 0x50 &&
          buffer[2] === 0x4e &&
          buffer[3] === 0x47;
        if (!isPng) {
          res.status(400).json({ success: false, error: 'Invalid PNG image file signature.' });
          return;
        }
      } else if (ext === 'jpg') {
        const isJpg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
        if (!isJpg) {
          res.status(400).json({ success: false, error: 'Invalid JPEG image file signature.' });
          return;
        }
      } else if (ext === 'gif') {
        const sig = buffer.subarray(0, 6).toString('ascii');
        if (sig !== 'GIF87a' && sig !== 'GIF89a') {
          res.status(400).json({ success: false, error: 'Invalid GIF image file signature.' });
          return;
        }
      } else if (ext === 'webp') {
        const isWebp =
          buffer.length >= 12 &&
          buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
          buffer.subarray(8, 12).toString('ascii') === 'WEBP';
        if (!isWebp) {
          res.status(400).json({ success: false, error: 'Invalid WebP image file signature.' });
          return;
        }
      } else if (ext === 'avif') {
        const isAvif = buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp';
        if (!isAvif) {
          res.status(400).json({ success: false, error: 'Invalid AVIF image file signature.' });
          return;
        }
      } else if (ext === 'svg') {
        const svgText = buffer.toString('utf-8');
        if (
          !/<svg\b/i.test(svgText) ||
          /<(script|foreignObject|iframe|object|embed|applet|meta|link)\b/i.test(svgText) ||
          /\bon[a-z0-9_-]*\s*=/i.test(svgText) ||
          /(?:javascript|vbscript|data\s*:\s*text\/html)\s*:/i.test(svgText)
        ) {
          res.status(400).json({
            success: false,
            error: 'SVG upload rejected: only static SVGs without scripts or event handlers are allowed.'
          });
          return;
        }
      }

      const cleanBaseName = generateSlug(String(fileName).replace(/\.[^/.]+$/, '')) || 'asset';
      const finalFileName = `${cleanBaseName}-${Date.now().toString(36)}.${ext}`;
      const resolvedPath = path.resolve(UPLOADS_DIR, finalFileName);
      if (!resolvedPath.startsWith(UPLOADS_DIR + path.sep)) {
        res.status(400).json({ success: false, error: 'Invalid upload file path.' });
        return;
      }

      fs.writeFileSync(resolvedPath, buffer);

      res.json({
        success: true,
        url: `/uploads/${finalFileName}`,
        fileName: finalFileName,
        sizeBytes: buffer.length
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: `Image upload failed: ${err?.message || 'Unknown error'}`
      });
    }
  });

  // 5. Live Technical SEO Health Audit Endpoint (Authenticated Admin Studio ONLY)
  app.get('/api/seo-health', requireAdminAuth, (_req, res) => {
    const config = loadPersistedSiteConfig();
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({
      success: true,
      audit: auditSiteSeoHealth(config)
    });
  });

  // 6. Inbuilt Automatic XML Sitemap (/sitemap.xml)
  app.get('/sitemap.xml', (_req, res) => {
    const config = loadPersistedSiteConfig();
    res.status(200).set('Content-Type', 'application/xml; charset=utf-8').send(generateSitemapXml(config));
  });

  // 7. Inbuilt Automatic Robots.txt (/robots.txt — zero /admin disclosure)
  app.get('/robots.txt', (_req, res) => {
    const config = loadPersistedSiteConfig();
    res.status(200).set('Content-Type', 'text/plain; charset=utf-8').send(generateRobotsTxt(config));
  });

  // 8. Inbuilt Automatic RSS 2.0 Feed for Daily News (/feed.xml)
  app.get('/feed.xml', (_req, res) => {
    const config = loadPersistedSiteConfig();
    res.status(200).set('Content-Type', 'application/rss+xml; charset=utf-8').send(generateRssFeedXml(config));
  });

  // 8b. Inbuilt Automatic W3C Web App Manifest (/manifest.webmanifest & /manifest.json)
  app.get(['/manifest.webmanifest', '/manifest.json', '/site.webmanifest'], (_req, res) => {
    const config = loadPersistedSiteConfig();
    res
      .status(200)
      .set('Content-Type', 'application/manifest+json; charset=utf-8')
      .send(generateWebManifestJson(config));
  });

  // 9. Hardened Server-Side Admin Login (HttpOnly Cookie + Fail-Closed Policy + Rate-Limiting + Zero Env Var Disclosure)
  app.post('/api/admin/login', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const adminEnv = getAdminAuthEnv(req.headers.host || '');
    if (!adminEnv.policy.credentialsReady) {
      res.status(503).json({
        success: false,
        code: 'admin-not-configured',
        error: 'Administrator sign-in is currently unavailable on this server.'
      });
      return;
    }

    const csrf = verifyAdminCsrf(req);
    if (!csrf.ok) {
      res.status(403).json({ success: false, error: csrf.error });
      return;
    }

    const clientIp = getTrustedLoginRateLimitIp(req);
    const rateCheck = checkLoginRateLimit(clientIp);
    if (!rateCheck.allowed) {
      if (rateCheck.retryAfterSec) {
        res.setHeader('Retry-After', String(rateCheck.retryAfterSec));
      }
      res.status(429).json({
        success: false,
        retryAfterSec: rateCheck.retryAfterSec || 60,
        error: `Too many failed sign-in attempts. Please wait ${rateCheck.retryAfterSec || 60} seconds.`
      });
      return;
    }

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({ success: false, error: 'Invalid sign-in request.' });
      return;
    }

    const { email = '', password = '', apiKey = '' } = body;
    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      typeof apiKey !== 'string' ||
      email.length > 320 ||
      password.length > 512 ||
      apiKey.length > 512
    ) {
      res.status(400).json({ success: false, error: 'Invalid credential format.' });
      return;
    }

    const cleanEmail = cleanAuthEnvValue(email);
    const cleanPass = cleanAuthEnvValue(password);
    const cleanKey = cleanAuthEnvValue(apiKey);

    if (!cleanKey && (!cleanEmail || !cleanPass)) {
      res.status(400).json({
        success: false,
        error: 'Please enter your administrator email and password to sign in.'
      });
      return;
    }

    const apiKeyAuthenticated = Boolean(
      adminEnv.requiresApiKey && cleanKey && safeTimingCompare(cleanKey, adminEnv.apiKey)
    );
    const emailMatch = Boolean(
      adminEnv.email && cleanEmail && safeTimingCompare(cleanEmail.toLowerCase(), adminEnv.email.toLowerCase())
    );
    const passMatch = Boolean(
      adminEnv.password && cleanPass && safeTimingCompare(cleanPass, adminEnv.password)
    );
    const credentialsAuthenticated = emailMatch && passMatch;

    if (!apiKeyAuthenticated && !credentialsAuthenticated) {
      recordFailedLoginAttempt(clientIp);
      await new Promise((r) => setTimeout(r, 220));
      res.status(401).json({
        success: false,
        error: 'Invalid email address or password.'
      });
      return;
    }

    clearLoginAttempts(clientIp);
    const loginSubject = credentialsAuthenticated ? adminEnv.email : 'api-key-admin';
    const token = createAdminToken(loginSubject, adminEnv.secret, adminEnv.credVersion);
    setAdminSessionCookie(res, token, isHttpsRequest(req));

    const fbEnv = getFirebaseEnvConfig();
    const config = loadPersistedSiteConfig();

    res.json({
      success: true,
      user: {
        email: loginSubject,
        role: 'Master Administrator'
      },
      envDiagnostics: buildSafeEnvDiagnostics(adminEnv, fbEnv, true, config)
    });
  });

  // 9b. Server-Side Admin Logout (Revokes token jti + Clears HttpOnly Cookies)
  app.post('/api/admin/logout', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const csrf = verifyAdminCsrf(req);
    if (!csrf.ok) {
      res.status(403).json({ success: false, error: csrf.error });
      return;
    }
    const { token, fromCookie } = extractAdminTokenFromReq(req);
    const verification = verifyAdminToken(token, req.headers.host || '', true, fromCookie);
    if (verification.jti) {
      cleanupRevokedJtis();
      revokedJtis.set(verification.jti, verification.exp || Date.now() + ADMIN_SESSION_TTL_MS);
    }
    clearAdminSessionCookie(res, isHttpsRequest(req));
    res.json({ success: true });
  });

  // 10. Zero-Leak Admin Session Verification (Never discloses env var names or setup hints when unauthenticated)
  app.get('/api/admin/verify', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const { token, fromCookie } = extractAdminTokenFromReq(req);
    const verification = verifyAdminToken(token, req.headers.host || '', false, fromCookie);

    if (!verification.valid) {
      res.json({
        authenticated: false,
        user: null
      });
      return;
    }

    const adminEnv = getAdminAuthEnv(req.headers.host || '');
    const fbEnv = getFirebaseEnvConfig();
    const config = loadPersistedSiteConfig();

    res.json({
      authenticated: true,
      user: { email: verification.email, role: verification.role || 'Master Administrator' },
      loginHints: {
        requiresApiKey: adminEnv.requiresApiKey
      },
      envDiagnostics: buildSafeEnvDiagnostics(adminEnv, fbEnv, true, config)
    });
  });

  // 10b. Authenticated Admin Studio Workspace HTML Loader (`GET /api/admin/workspace`)
  // Ensures zero internal CMS controls or field IDs exist in unauthenticated /admin HTML.
  app.get('/api/admin/workspace', requireAdminAuth, (_req, res) => {
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    res.json({
      success: true,
      html: getAdminWorkspaceShellHtml()
    });
  });

  // 10c. Clear Sync & Activity Logs (`POST /api/admin/clear-logs`)
  app.post('/api/admin/clear-logs', requireAdminAuth, async (_req, res) => {
    const existing = loadPersistedSiteConfig();
    existing.syncLogs = [];
    if (existing.githubConfig) {
      existing.githubConfig.deployHistory = [];
    }
    const saved = savePersistedSiteConfig(existing);
    const sanitized = sanitizeConfigForClient(saved, getEnvSecretFlags());
    const fbEnv = getFirebaseEnvConfig();
    let firestoreSaved = false;
    let firestoreNotice: string | null = null;
    if (fbEnv.isConfigured && fbEnv.config) {
      const fbRes = await writeBatchToFirestoreRestNode(
        fbEnv.config,
        {
          syncLogs: [],
          githubConfig: saved.githubConfig
        },
        { updatedAt: saved.updatedAt, dirtyModulesSinceSync: saved.dirtyModulesSinceSync }
      );
      firestoreSaved = fbRes.ok;
      firestoreNotice = fbRes.ok ? null : fbRes.error || 'Firestore write failed';
    }
    res.json({
      success: true,
      firestoreSaved,
      firestoreNotice,
      config: sanitized
    });
  });

  // 11a. Granular Single-Module Patch Endpoint (`PATCH /api/config/module`)
  app.patch('/api/config/module', requireAdminAuth, async (req, res) => {
    const moduleKey = req.body?.moduleKey || req.body?.module;
    const data = req.body?.data;
    if (!isCmsModuleKey(moduleKey)) {
      res.status(400).json({
        success: false,
        error: 'Invalid or missing CMS moduleKey.'
      });
      return;
    }

    const existing = loadPersistedSiteConfig();
    const patched = applyModulePatch(existing, moduleKey as CmsModuleKey, data, EMPTY_ADMIN_CONFIG);

    if (moduleKey === 'securityGate' && patched.config.securityGate?.primaryDownloadUrl) {
      try {
        patched.config.securityGate.encryptedPrimaryUrl = await encryptVaultValue(
          patched.config.securityGate.primaryDownloadUrl,
          undefined,
          getVaultMasterSecret()
        );
      } catch {
        // Fallback handled at clearance
      }
    }

    const bytesSent = Buffer.byteLength(JSON.stringify(data ?? {}), 'utf-8');
    const fbEnv = getFirebaseEnvConfig();
    let firestoreSaved = false;
    let firestoreNotice: string | null = null;
    let workingConfig = patched.config;

    if (fbEnv.isConfigured && fbEnv.config) {
      const candidateWithLog =
        moduleKey !== 'syncLogs'
          ? appendSyncLogEntry(
              workingConfig,
              {
                trigger: 'firebase-save',
                status: 'success',
                modulesChanged: [moduleKey],
                filesCount: 1,
                changedPaths: [`cmsModules/${moduleKey}`],
                steps: [
                  `Updated module "${moduleKey}" (${(bytesSent / 1024).toFixed(1)} KB payload)`,
                  `Committed to Cloud Firestore (${fbEnv.config?.projectId})`
                ],
                message: `Saved module "${moduleKey}" to Firebase Firestore (${(bytesSent / 1024).toFixed(1)} KB).`
              },
              false
            )
          : workingConfig;

      const batchMap: Record<string, any> = {
        [moduleKey]: candidateWithLog[moduleKey as CmsModuleKey],
        syncLogs: candidateWithLog.syncLogs,
        githubConfig: candidateWithLog.githubConfig
      };
      if (moduleKey === 'domainConfig') batchMap.seo = candidateWithLog.seo;
      if (moduleKey === 'seo') batchMap.domainConfig = candidateWithLog.domainConfig;

      const fbRes = await writeBatchToFirestoreRestNode(fbEnv.config, batchMap, {
        updatedAt: candidateWithLog.updatedAt,
        dirtyModulesSinceSync: candidateWithLog.dirtyModulesSinceSync
      });
      firestoreSaved = fbRes.ok;
      firestoreNotice = fbRes.ok ? null : fbRes.error || 'Firestore write failed';
      if (fbRes.ok) {
        workingConfig = candidateWithLog;
      }
    }

    const saveMsg = firestoreSaved
      ? `Saved module "${moduleKey}" to Firebase Firestore (${(bytesSent / 1024).toFixed(1)} KB).`
      : fbEnv.isConfigured && firestoreNotice
      ? `Saved module "${moduleKey}" locally, but Firebase sync failed: ${firestoreNotice}`
      : `Saved module "${moduleKey}" & updated static bundle (${(bytesSent / 1024).toFixed(1)} KB).`;

    if (!firestoreSaved && moduleKey !== 'syncLogs') {
      workingConfig = appendSyncLogEntry(
        workingConfig,
        {
          trigger: 'firebase-save',
          status: 'local-only',
          modulesChanged: [moduleKey],
          filesCount: 1,
          changedPaths: [`cmsModules/${moduleKey}`],
          steps: [
            `Updated module "${moduleKey}" (${(bytesSent / 1024).toFixed(1)} KB payload)`,
            firestoreNotice
              ? `Firestore write failed (${firestoreNotice}); saved to local workspace (/dist-public)`
              : 'Saved to local workspace & re-compiled static bundle (/dist-public)'
          ],
          message: saveMsg
        },
        false
      );
    }

    const saved = savePersistedSiteConfig(workingConfig);
    const sanitizedConfig = sanitizeConfigForClient(saved, getEnvSecretFlags());

    res.json({
      success: true,
      savedModule: patched.savedModule,
      bytesSent,
      dirtyModulesSinceSync: saved.dirtyModulesSinceSync || [],
      firestoreSaved,
      firestoreNotice,
      message: saveMsg,
      config: sanitizedConfig,
      seoAudit: auditSiteSeoHealth(saved),
      savedAt: saved.updatedAt
    });
  });

  // 11a-batch. Atomic Batch Multi-Module Patch (`PATCH /api/config/modules`)
  app.patch('/api/config/modules', requireAdminAuth, async (req, res) => {
    const startTime = Date.now();
    const modulesMap = req.body?.modules && typeof req.body.modules === 'object' ? req.body.modules : req.body;
    const validKeys = Object.keys(modulesMap || {}).filter(
      (k) => isCmsModuleKey(k) && modulesMap[k] !== undefined
    ) as CmsModuleKey[];

    if (validKeys.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Provide at least one valid CMS module in `modules`.'
      });
      return;
    }

    const existing = loadPersistedSiteConfig();
    const patched = applyMultiModulePatch(existing, modulesMap, EMPTY_ADMIN_CONFIG);

    if (validKeys.includes('securityGate') && patched.config.securityGate?.primaryDownloadUrl) {
      try {
        patched.config.securityGate.encryptedPrimaryUrl = await encryptVaultValue(
          patched.config.securityGate.primaryDownloadUrl,
          undefined,
          getVaultMasterSecret()
        );
      } catch {
        // Fallback handled at clearance
      }
    }

    const bytesSent = Buffer.byteLength(JSON.stringify(modulesMap ?? {}), 'utf-8');
    const fbEnv = getFirebaseEnvConfig();
    let firestoreSaved = false;
    let firestoreNotice: string | null = null;
    const nonLogKeys = validKeys.filter((k) => k !== 'syncLogs');
    let workingConfig = patched.config;

    if (fbEnv.isConfigured && fbEnv.config) {
      const candidateWithLog =
        nonLogKeys.length > 0
          ? appendSyncLogEntry(
              workingConfig,
              {
                trigger: 'firebase-save',
                status: 'success',
                modulesChanged: nonLogKeys,
                filesCount: nonLogKeys.length,
                changedPaths: nonLogKeys.map((k) => `cmsModules/${k}`),
                durationMs: Date.now() - startTime,
                steps: [
                  `Patched ${nonLogKeys.length} module(s): ${nonLogKeys.join(', ')} (${(bytesSent / 1024).toFixed(1)} KB)`,
                  `Committed atomic batch to Cloud Firestore (${fbEnv.config?.projectId})`
                ],
                message: `Saved ${nonLogKeys.join(', ')} to Firebase Firestore (${(bytesSent / 1024).toFixed(1)} KB).`
              },
              false
            )
          : workingConfig;

      const batchData: Record<string, any> = {
        syncLogs: candidateWithLog.syncLogs,
        githubConfig: candidateWithLog.githubConfig
      };
      for (const k of validKeys) {
        batchData[k] = candidateWithLog[k];
      }
      if (validKeys.includes('domainConfig')) batchData.seo = candidateWithLog.seo;
      if (validKeys.includes('seo')) batchData.domainConfig = candidateWithLog.domainConfig;

      const fbRes = await writeBatchToFirestoreRestNode(fbEnv.config, batchData, {
        updatedAt: candidateWithLog.updatedAt,
        dirtyModulesSinceSync: candidateWithLog.dirtyModulesSinceSync
      });
      firestoreSaved = fbRes.ok;
      firestoreNotice = fbRes.ok ? null : fbRes.error || 'Firestore write failed';
      if (fbRes.ok) {
        workingConfig = candidateWithLog;
      }
    }

    if (!firestoreSaved && nonLogKeys.length > 0) {
      workingConfig = appendSyncLogEntry(
        workingConfig,
        {
          trigger: 'firebase-save',
          status: 'local-only',
          modulesChanged: nonLogKeys,
          filesCount: nonLogKeys.length,
          changedPaths: nonLogKeys.map((k) => `cmsModules/${k}`),
          durationMs: Date.now() - startTime,
          steps: [
            `Patched ${nonLogKeys.length} module(s): ${nonLogKeys.join(', ')} (${(bytesSent / 1024).toFixed(1)} KB)`,
            firestoreNotice
              ? `Firestore write failed (${firestoreNotice}); saved to local workspace (/dist-public)`
              : 'Saved to local workspace & re-compiled static public bundle (/dist-public)'
          ],
          message:
            fbEnv.isConfigured && firestoreNotice
              ? `Saved ${nonLogKeys.join(', ')} locally, but Firebase sync failed: ${firestoreNotice}`
              : `Saved ${nonLogKeys.join(', ')} & re-compiled static bundle (${(bytesSent / 1024).toFixed(1)} KB).`
        },
        false
      );
    }

    const saved = savePersistedSiteConfig(workingConfig);
    const sanitizedConfig = sanitizeConfigForClient(saved, getEnvSecretFlags());

    res.json({
      success: true,
      savedModules: patched.savedModules,
      bytesSent,
      dirtyModulesSinceSync: saved.dirtyModulesSinceSync || [],
      firestoreSaved,
      firestoreNotice,
      config: sanitizedConfig,
      seoAudit: auditSiteSeoHealth(saved),
      savedAt: saved.updatedAt
    });
  });

  // 11b. Save Complete Admin Configuration + Compile Static Public Website (+ Optional Auto-Push to GitHub)
  const handleSaveFullConfig = async (req: express.Request, res: express.Response) => {
    const incomingConfig = req.body?.config || req.body;
    if (!incomingConfig || typeof incomingConfig !== 'object') {
      res.status(400).json({ success: false, error: 'Invalid configuration payload.' });
      return;
    }

    const existing = loadPersistedSiteConfig();
    const withSecrets = preserveSecretsOnSave(incomingConfig, existing);
    const mergedIncoming = mergeSiteConfig(withSecrets, EMPTY_ADMIN_CONFIG);

    if (mergedIncoming.securityGate?.primaryDownloadUrl) {
      try {
        mergedIncoming.securityGate.encryptedPrimaryUrl = await encryptVaultValue(
          mergedIncoming.securityGate.primaryDownloadUrl,
          undefined,
          getVaultMasterSecret()
        );
      } catch {
        // Fallback handled at clearance
      }
    }

    const dirtyList = Array.isArray(req.body?.dirtyModules)
      ? req.body.dirtyModules.filter((k: unknown) => typeof k === 'string')
      : [];
    mergedIncoming.dirtyModulesSinceSync = Array.from(
      new Set([...(existing.dirtyModulesSinceSync || []), ...dirtyList])
    );

    let saved = savePersistedSiteConfig(mergedIncoming);
    let sanitizedConfig = sanitizeConfigForClient(saved, getEnvSecretFlags());
    const fbEnv = getFirebaseEnvConfig();
    let firestoreSaved = false;
    let firestoreNotice: string | null = null;
    if (fbEnv.isConfigured && fbEnv.config) {
      const fullModulesMap: Record<string, any> = {};
      for (const k of [
        'brand',
        'hero',
        'uiConfig',
        'packageSpecs',
        'sections',
        'newsSection',
        'faqsSection',
        'content',
        'navigation',
        'pages',
        'domainConfig',
        'seo',
        'securityGate',
        'githubConfig',
        'syncLogs'
      ] as CmsModuleKey[]) {
        fullModulesMap[k] = saved[k];
      }
      const fbRes = await writeBatchToFirestoreRestNode(fbEnv.config, fullModulesMap, {
        updatedAt: saved.updatedAt,
        dirtyModulesSinceSync: saved.dirtyModulesSinceSync
      });
      firestoreSaved = fbRes.ok;
      firestoreNotice = fbRes.ok ? null : fbRes.error || 'Firestore write failed';
    }

    let githubPush = null;

    if (
      saved.githubConfig?.autoPushOnPublish &&
      (saved.githubConfig?.fineGrainedToken || getEnvSecretFlags().hasEnvGithubToken) &&
      saved.githubConfig?.repoOwner &&
      saved.githubConfig?.repoName
    ) {
      const startTime = Date.now();
      const envToken = cleanEnvVal(
        process.env.GITHUB_FINE_GRAINED_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN
      );
      const effectiveGhCfg = {
        ...saved.githubConfig,
        fineGrainedToken: saved.githubConfig.fineGrainedToken || envToken
      };
      const bundle = buildStaticPublicFilesOnDisk(saved);
      if (bundle) {
        githubPush = await pushStaticFilesToGitHub(effectiveGhCfg, bundle.files);
        saved = appendSyncLogEntry(
          saved,
          {
            trigger: 'auto-push',
            status: githubPush.status,
            modulesChanged: saved.dirtyModulesSinceSync || [],
            filesCount: bundle.totalFiles,
            changedPaths: bundle.files.map((f) => f.path).slice(0, 20),
            branch: effectiveGhCfg.branch || 'main',
            repo: `${effectiveGhCfg.repoOwner}/${effectiveGhCfg.repoName}`,
            commitSha: githubPush.commitSha,
            commitUrl: githubPush.commitUrl,
            durationMs: Date.now() - startTime,
            steps: [
              `Compiled ${bundle.totalFiles} static files`,
              githubPush.ok
                ? `Auto-pushed atomic commit to ${effectiveGhCfg.repoOwner}/${effectiveGhCfg.repoName}`
                : `GitHub auto-push notice: ${githubPush.message}`
            ],
            message: githubPush.message
          },
          githubPush.ok
        );
        saved = savePersistedSiteConfig(saved);
        sanitizedConfig = sanitizeConfigForClient(saved, getEnvSecretFlags());
        if (fbEnv.isConfigured && fbEnv.config && firestoreSaved) {
          await writeBatchToFirestoreRestNode(
            fbEnv.config,
            {
              syncLogs: saved.syncLogs,
              githubConfig: saved.githubConfig
            },
            {
              updatedAt: saved.updatedAt,
              dirtyModulesSinceSync: saved.dirtyModulesSinceSync
            }
          );
        }
      }
    }

    res.json({
      success: true,
      firestoreSaved,
      firestoreNotice,
      config: sanitizedConfig,
      githubPush,
      seoAudit: auditSiteSeoHealth(saved),
      savedAt: saved.updatedAt
    });
  };
  app.put('/api/config', requireAdminAuth, handleSaveFullConfig);
  app.post('/api/config', requireAdminAuth, handleSaveFullConfig);

  // 12. Verify GitHub Fine-Grained Token & Repository Write Access (`POST /api/github/verify`)
  app.post('/api/github/verify', requireAdminAuth, async (req, res) => {
    const ghCfg = req.body?.githubConfig || req.body || {};
    const persisted = loadPersistedSiteConfig();
    const envToken = cleanEnvVal(
      process.env.GITHUB_FINE_GRAINED_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN
    );
    const incomingToken = String(ghCfg.fineGrainedToken || '').trim();
    const effectiveToken =
      incomingToken && incomingToken !== '__SECRET_CONFIGURED__'
        ? incomingToken
        : persisted.githubConfig?.fineGrainedToken || envToken;

    const repoOwner =
      ghCfg.repoOwner || persisted.githubConfig?.repoOwner || cleanEnvVal(process.env.GITHUB_REPO_OWNER);
    const repoName =
      ghCfg.repoName || persisted.githubConfig?.repoName || cleanEnvVal(process.env.GITHUB_REPO_NAME);
    const branch =
      ghCfg.branch || persisted.githubConfig?.branch || cleanEnvVal(process.env.GITHUB_BRANCH) || 'main';

    const result = await verifyGitHubRepoAccess({
      repoOwner,
      repoName,
      branch,
      fineGrainedToken: effectiveToken
    });

    if (result.ok && effectiveToken) {
      const patched = applyModulePatch(
        persisted,
        'githubConfig',
        {
          ...persisted.githubConfig,
          repoOwner,
          repoName,
          branch: result.defaultBranch || branch,
          fineGrainedToken: effectiveToken,
          hasFineGrainedToken: true
        },
        EMPTY_ADMIN_CONFIG
      );
      const saved = savePersistedSiteConfig(patched.config);
      const fbEnv = getFirebaseEnvConfig();
      if (fbEnv.isConfigured && fbEnv.config) {
        await writeBatchToFirestoreRestNode(
          fbEnv.config,
          { githubConfig: saved.githubConfig },
          { updatedAt: saved.updatedAt, dirtyModulesSinceSync: saved.dirtyModulesSinceSync }
        );
      }
      res.json({
        ...result,
        config: sanitizeConfigForClient(saved, getEnvSecretFlags())
      });
      return;
    }

    res.json(result);
  });

  // 12b. Inspect Compiled Static Public Website Bundle (`GET /api/static-bundle`)
  app.get('/api/static-bundle', requireAdminAuth, (_req, res) => {
    const config = loadPersistedSiteConfig();
    const bundle = buildStaticPublicFilesOnDisk(config);
    if (!bundle) {
      res.status(500).json({ success: false, error: 'Failed compiling static public website bundle.' });
      return;
    }
    const fbEnv = getFirebaseEnvConfig();
    const hasFirebase = fbEnv.isConfigured;
    const distinctIcons = new Set(
      [
        config.brand?.logoUrl,
        config.brand?.faviconUrl,
        config.brand?.searchLogoUrl,
        config.brand?.appleTouchIconUrl
      ]
        .map((u) => String(u || '').trim())
        .filter(Boolean)
    );
    res.json({
      success: true,
      compiledAt: bundle.compiledAt,
      totalFiles: bundle.totalFiles,
      routesCompiled: bundle.routesCompiled,
      dirtyModulesSinceSync: config.dirtyModulesSinceSync || [],
      contentSource: hasFirebase ? 'Live Cloud Firestore' : 'Local Admin Workspace',
      brandSummary: {
        name: config.brand?.name || '',
        logoUrl: config.brand?.logoUrl || '',
        faviconUrl: config.brand?.faviconUrl || '',
        primaryDomain: config.domainConfig?.primaryDomain || config.seo?.canonicalUrl || ''
      },
      seoManifestSummary: {
        manifestEnabled: config.domainConfig?.enableWebManifest !== false,
        sitemapEnabled: config.domainConfig?.enableSitemapXml !== false,
        robotsEnabled: true,
        rssEnabled: Boolean(config.domainConfig?.enableRssFeed),
        manifestIconsCount: distinctIcons.size
      },
      filesList: bundle.files.map((f) => ({
        path: f.path,
        sizeBytes: Buffer.byteLength(f.content, f.encoding === 'base64' ? 'base64' : 'utf-8'),
        description: f.description
      }))
    });
  });

  // 13. Compile Static Public Website & Push Atomic Commit to GitHub (`POST /api/github/publish`)
  app.post('/api/github/publish', requireAdminAuth, async (req, res) => {
    const startTime = Date.now();
    const persisted = loadPersistedSiteConfig();
    let incomingConfig = req.body?.config
      ? mergeRemoteConfigPreservingUserContent(preserveSecretsOnSave(req.body.config, persisted), persisted)
      : persisted;
    const ghOverride =
      req.body?.githubConfig && typeof req.body.githubConfig === 'object'
        ? req.body.githubConfig
        : !req.body?.config && (req.body?.repoOwner || req.body?.repoName || req.body?.fineGrainedToken)
        ? req.body
        : null;
    if (ghOverride) {
      incomingConfig = mergeSiteConfig(
        preserveSecretsOnSave({ ...incomingConfig, githubConfig: ghOverride }, incomingConfig),
        EMPTY_ADMIN_CONFIG
      );
    }

    const customCommitMessage = String(req.body?.commitMessage || '').trim();
    const modulesChanged: string[] = Array.isArray(req.body?.modulesChanged)
      ? req.body.modulesChanged
      : incomingConfig.dirtyModulesSinceSync || [];

    let saved = savePersistedSiteConfig(incomingConfig);
    const envToken = cleanEnvVal(
      process.env.GITHUB_FINE_GRAINED_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN
    );
    const effectiveToken = saved.githubConfig.fineGrainedToken || envToken;
    const effectiveOwner =
      saved.githubConfig.repoOwner || cleanEnvVal(process.env.GITHUB_REPO_OWNER);
    const effectiveRepo =
      saved.githubConfig.repoName || cleanEnvVal(process.env.GITHUB_REPO_NAME);
    const effectiveBranch =
      saved.githubConfig.branch || cleanEnvVal(process.env.GITHUB_BRANCH) || 'main';

    const effectiveGhCfg = {
      ...saved.githubConfig,
      repoOwner: effectiveOwner,
      repoName: effectiveRepo,
      branch: effectiveBranch,
      fineGrainedToken: effectiveToken
    };

    const steps: string[] = [];
    const bundle = buildStaticPublicFilesOnDisk(saved);

    if (!bundle) {
      res.status(500).json({
        success: false,
        error: 'Failed to compile static public website bundle.'
      });
      return;
    }

    steps.push(
      `Compiled ${bundle.totalFiles} static files (${bundle.routesCompiled.length} routes, zero Firebase SDK)`
    );

    const pushResult = await pushStaticFilesToGitHub(
      effectiveGhCfg,
      bundle.files,
      customCommitMessage
    );

    if (pushResult.skipped) {
      steps.push(
        `Remote repository matches compiled bundle (${pushResult.unchangedCount || 0} unchanged files — skipped empty commit)`
      );
    } else if (pushResult.ok) {
      steps.push(
        `Committed to ${effectiveOwner}/${effectiveRepo}@${effectiveBranch}: +${pushResult.addedCount || 0} added, ~${pushResult.updatedCount || 0} updated, -${pushResult.deletedCount || 0} pruned`
      );
    } else {
      steps.push(`GitHub sync returned ${pushResult.status}: ${pushResult.message}`);
    }

    const changedPathsList =
      Array.isArray(pushResult.changedPaths) && pushResult.changedPaths.length > 0
        ? pushResult.changedPaths
        : pushResult.skipped
        ? []
        : bundle.files.map((f) => f.path).slice(0, 24);

    const syncLogEntry: Omit<SyncLogEntry, 'id' | 'timestamp'> = {
      trigger: 'manual-push',
      status: pushResult.status,
      modulesChanged,
      filesCount: pushResult.filesPushed ?? bundle.totalFiles,
      addedCount: pushResult.addedCount,
      updatedCount: pushResult.updatedCount,
      deletedCount: pushResult.deletedCount,
      unchangedCount: pushResult.unchangedCount,
      skipped: pushResult.skipped,
      changedPaths: changedPathsList,
      branch: effectiveBranch,
      repo: effectiveOwner && effectiveRepo ? `${effectiveOwner}/${effectiveRepo}` : '',
      commitSha: pushResult.commitSha,
      commitUrl: pushResult.commitUrl,
      durationMs: Date.now() - startTime,
      steps,
      message: pushResult.message,
      errorDetail: pushResult.ok ? undefined : pushResult.message
    };

    saved = appendSyncLogEntry(saved, syncLogEntry, pushResult.ok);
    saved = savePersistedSiteConfig(saved);

    const sanitizedConfig = sanitizeConfigForClient(saved, getEnvSecretFlags());
    const fbEnv = getFirebaseEnvConfig();
    let firestoreSaved = false;
    let firestoreNotice: string | null = null;
    if (fbEnv.isConfigured && fbEnv.config) {
      const fullSyncMap: Record<string, any> = {};
      for (const k of CMS_MODULE_KEYS) {
        fullSyncMap[k] = saved[k as CmsModuleKey];
      }
      const fbRes = await writeBatchToFirestoreRestNode(
        fbEnv.config,
        fullSyncMap,
        {
          updatedAt: saved.updatedAt,
          dirtyModulesSinceSync: saved.dirtyModulesSinceSync
        }
      );
      firestoreSaved = fbRes.ok;
      firestoreNotice = fbRes.ok ? null : fbRes.error || 'Firestore write failed';
    }

    const distinctIcons = new Set(
      [
        saved.brand?.logoUrl,
        saved.brand?.faviconUrl,
        saved.brand?.searchLogoUrl,
        saved.brand?.appleTouchIconUrl
      ]
        .map((u) => String(u || '').trim())
        .filter(Boolean)
    );

    res.json({
      success: pushResult.ok,
      firestoreSaved,
      firestoreNotice,
      publishResult: pushResult,
      addedCount: pushResult.addedCount ?? 0,
      updatedCount: pushResult.updatedCount ?? 0,
      deletedCount: pushResult.deletedCount ?? 0,
      unchangedCount: pushResult.unchangedCount ?? 0,
      skipped: Boolean(pushResult.skipped),
      filesCount: pushResult.filesPushed ?? bundle.totalFiles,
      compiledLocalFiles: bundle.totalFiles,
      commitSha: pushResult.commitSha,
      commitUrl: pushResult.commitUrl,
      message: pushResult.message,
      ...(pushResult.ok ? {} : { error: pushResult.message }),
      syncLog: saved.syncLogs?.[0] || null,
      compiledBundle: {
        compiledAt: bundle.compiledAt,
        totalFiles: bundle.totalFiles,
        routesCompiled: bundle.routesCompiled,
        contentSource: fbEnv.isConfigured ? 'Live Cloud Firestore' : 'Local Admin Workspace',
        brandSummary: {
          name: saved.brand?.name || '',
          logoUrl: saved.brand?.logoUrl || '',
          faviconUrl: saved.brand?.faviconUrl || '',
          primaryDomain: saved.domainConfig?.primaryDomain || saved.seo?.canonicalUrl || ''
        },
        seoManifestSummary: {
          manifestEnabled: saved.domainConfig?.enableWebManifest !== false,
          sitemapEnabled: saved.domainConfig?.enableSitemapXml !== false,
          robotsEnabled: true,
          rssEnabled: Boolean(saved.domainConfig?.enableRssFeed),
          manifestIconsCount: distinctIcons.size
        },
        filesList: bundle.files.map((f) => ({
          path: f.path,
          sizeBytes: Buffer.byteLength(f.content, f.encoding === 'base64' ? 'base64' : 'utf-8'),
          description: f.description
        }))
      },
      config: sanitizedConfig
    });
  });

  // 14. Fast Single-Click Daily News Publish Endpoint
  app.post('/api/news', requireAdminAuth, async (req, res) => {
    const current = loadPersistedSiteConfig();
    const article = req.body?.article || req.body;
    if (!article || !article.title) {
      res.status(400).json({ success: false, error: 'News headline is required.' });
      return;
    }

    const brandName = current.brand?.name || 'Editorial';
    const slug = generateSlug(article.slug || article.title || `news-${Date.now()}`);
    const newArticle = {
      id: article.id || `news-${Date.now()}`,
      title: String(article.title).trim(),
      slug,
      date:
        article.date ||
        new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      category: article.category || 'Daily Update',
      author: article.author || `${brandName} Editorial`,
      readTime: article.readTime || '2 min read',
      featured: Boolean(article.featured),
      summary: article.summary || '',
      coverImageUrl: article.coverImageUrl || '',
      coverImageAlt: article.coverImageAlt || article.title || '',
      coverImageCaption: article.coverImageCaption || '',
      ctaLabel: article.ctaLabel || '',
      ctaUrl: article.ctaUrl || '',
      metaTitle: article.metaTitle || `${article.title} | ${brandName}`,
      metaDescription: article.metaDescription || article.summary || '',
      htmlContent: article.htmlContent || `<p>${article.summary || ''}</p>`
    };

    const nextNewsSection = JSON.parse(JSON.stringify(current.newsSection || EMPTY_ADMIN_CONFIG.newsSection));
    const existingIdx = nextNewsSection.articles.findIndex(
      (a: any) => a.id === newArticle.id || a.slug === newArticle.slug
    );
    if (existingIdx >= 0) {
      nextNewsSection.articles[existingIdx] = newArticle;
    } else {
      nextNewsSection.articles.unshift(newArticle);
    }

    const patched = applyModulePatch(current, 'newsSection', nextNewsSection, EMPTY_ADMIN_CONFIG);
    const fbEnv = getFirebaseEnvConfig();
    let firestoreSaved = false;
    let firestoreNotice: string | null = null;
    let workingConfig = patched.config;

    if (fbEnv.isConfigured && fbEnv.config) {
      const candidateWithLog = appendSyncLogEntry(
        workingConfig,
        {
          trigger: 'firebase-save',
          status: 'success',
          modulesChanged: ['newsSection'],
          filesCount: 1,
          changedPaths: [`/news/${newArticle.slug}`],
          steps: [
            `Published news article "${newArticle.title}" (/news/${newArticle.slug})`,
            `Saved newsSection to Cloud Firestore (${fbEnv.config?.projectId})`
          ],
          message: `Published news article "${newArticle.title}" (/news/${newArticle.slug}).`
        },
        false
      );
      const fbRes = await writeBatchToFirestoreRestNode(
        fbEnv.config,
        {
          newsSection: candidateWithLog.newsSection,
          syncLogs: candidateWithLog.syncLogs,
          githubConfig: candidateWithLog.githubConfig
        },
        { updatedAt: candidateWithLog.updatedAt, dirtyModulesSinceSync: candidateWithLog.dirtyModulesSinceSync }
      );
      firestoreSaved = fbRes.ok;
      firestoreNotice = fbRes.ok ? null : fbRes.error || 'Firestore write failed';
      if (fbRes.ok) {
        workingConfig = candidateWithLog;
      }
    }

    if (!firestoreSaved) {
      workingConfig = appendSyncLogEntry(
        workingConfig,
        {
          trigger: 'firebase-save',
          status: 'local-only',
          modulesChanged: ['newsSection'],
          filesCount: 1,
          changedPaths: [`/news/${newArticle.slug}`],
          steps: [
            `Published news article "${newArticle.title}" (/news/${newArticle.slug})`,
            firestoreNotice
              ? `Firestore write failed (${firestoreNotice}); saved locally`
              : 'Saved to local workspace & re-compiled static news route'
          ],
          message: `Published news article "${newArticle.title}" (/news/${newArticle.slug}).`
        },
        false
      );
    }

    const saved = savePersistedSiteConfig(workingConfig);
    const sanitized = sanitizeConfigForClient(saved, getEnvSecretFlags());
    res.json({
      success: true,
      firestoreSaved,
      firestoreNotice,
      article: newArticle,
      config: sanitized,
      seoAudit: auditSiteSeoHealth(saved)
    });
  });

  // 15. Clear Admin Data (Reset cleanly to Empty Live Firebase State — ZERO static demo content)
  app.post('/api/config/reset', requireAdminAuth, async (_req, res) => {
    const fresh = savePersistedSiteConfig(getEnvSeededEmptyConfig());
    const sanitized = sanitizeConfigForClient(fresh, getEnvSecretFlags());
    const fbEnv = getFirebaseEnvConfig();
    let firestoreSaved = false;
    let firestoreNotice: string | null = null;
    if (fbEnv.isConfigured && fbEnv.config) {
      const clearMap: Record<string, any> = {};
      for (const k of ['brand', 'hero', 'uiConfig', 'packageSpecs', 'sections', 'newsSection', 'faqsSection', 'content', 'navigation', 'pages', 'domainConfig', 'seo', 'securityGate', 'githubConfig', 'syncLogs']) {
        clearMap[k] = (sanitized as any)[k];
      }
      const fbRes = await writeBatchToFirestoreRestNode(fbEnv.config, clearMap, {
        updatedAt: fresh.updatedAt,
        dirtyModulesSinceSync: []
      });
      firestoreSaved = fbRes.ok;
      firestoreNotice = fbRes.ok ? null : fbRes.error || 'Firestore write failed';
    }
    res.json({
      success: true,
      firestoreSaved,
      firestoreNotice,
      config: sanitized,
      seoAudit: auditSiteSeoHealth(fresh)
    });
  });

  // --------------------------------------------------------------------------
  // 16. v12 7-GATE SECURITY & AES-256-GCM LINK VAULT ENDPOINTS
  // --------------------------------------------------------------------------
  const getVaultMasterSecret = () =>
    (
      cleanEnvVal(process.env.VAULT_ENCRYPTION_SECRET) ||
      cleanEnvVal(process.env.LINK_VAULT_MASTER_SECRET) ||
      cleanEnvVal(process.env.AES_KEY) ||
      cleanEnvVal(process.env.AES_SECRET) ||
      cleanEnvVal(process.env.VAULT_SECRET_KEY) ||
      cleanEnvVal(process.env.HMAC_SECRET) ||
      getAdminAuthEnv().secret ||
      'master-cms-v12-aes-256-gcm-vault-secret-key-2026'
    ).trim();

  const buildGateRequestContext = (
    req: express.Request,
    config: SiteConfig
  ): GateRequestContext => {
    const headers: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
    }
    if (!headers.host) {
      headers.host = 'localhost';
    }
    const clientIp = String(
      req.headers['cf-connecting-ip'] ||
        req.headers['x-forwarded-for'] ||
        req.socket.remoteAddress ||
        '127.0.0.1'
    )
      .split(',')[0]
      .trim();

    const masterSecret = getVaultMasterSecret();
    const envMap: Record<string, string | undefined> = {
      ...(process.env as Record<string, string | undefined>),
      AES_SECRET: masterSecret,
      NONCE_HMAC_SECRET: masterSecret,
      DID_HMAC_SECRET: masterSecret
    };

    const rawBody =
      req.body && typeof req.body === 'object'
        ? JSON.stringify(req.body)
        : typeof req.body === 'string'
        ? req.body
        : '';

    return {
      method: req.method,
      path: req.path,
      headers,
      rawBody,
      ip: clientIp,
      adapter: 'express',
      env: envMap,
      siteConfig: config
    };
  };

  // 16a. Admin 1-Click AES-256-GCM URL Encryption (`POST /api/admin/encrypt-url`)
  app.post('/api/admin/encrypt-url', requireAdminAuth, async (req, res) => {
    try {
      const rawUrl = String(req.body?.url || '').trim();
      if (!rawUrl) {
        res
          .status(400)
          .json({ success: false, error: 'Please enter a valid download destination URL to encrypt.' });
        return;
      }
      const encrypted = await encryptVaultValue(rawUrl, undefined, getVaultMasterSecret());
      res.json({
        success: true,
        encryptedUrl: encrypted
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: `Encryption failed: ${err?.message || 'Unknown error'}`
      });
    }
  });

  // 16b. Gate G1–G2 Session Init (`POST /api/v1/app/session-init`)
  app.post('/api/v1/app/session-init', async (req, res) => {
    const config = loadPersistedSiteConfig();
    const sec = config.securityGate || EMPTY_ADMIN_CONFIG.securityGate;
    const ctx = buildGateRequestContext(req, config);
    const initResult = await handleSessionInit(ctx);

    for (const [hk, hv] of Object.entries(initResult.headers)) {
      res.setHeader(hk, hv);
    }

    if (initResult.status !== 200) {
      res.status(initResult.status).type('application/json').send(initResult.body);
      return;
    }

    let parsedBody: Record<string, any> = {};
    try {
      parsedBody = JSON.parse(initResult.body);
    } catch {
      parsedBody = {};
    }

    res.status(200).json({
      ...parsedBody,
      siteKey:
        parsedBody.siteKey ||
        sec.turnstileSiteKey ||
        '1x00000000000000000000AA',
      appMeta: {
        brandName: config.brand?.name || '',
        logoUrl: config.brand?.logoUrl || '',
        accentColor: config.brand?.accentColor || '#EF4444',
        appSlug: sec.appSlug || 'gateway',
        appSerialId: sec.appSerialId || 'PKG-001',
        devicePolicyMode: sec.devicePolicyMode || 'universal_human',
        proceedButtonLabel: sec.proceedButtonLabel || 'PROCEED',
        unavailableMessage: sec.unavailableMessage || '',
        helplineWhatsapp: sanitizeSafeUrl(sec.helplineWhatsapp || '', {
          allowHash: false,
          allowMailto: false
        }),
        helplineTelegram: sanitizeSafeUrl(sec.helplineTelegram || '', {
          allowHash: false,
          allowMailto: false
        }),
        customHeading: sec.customHeading || '',
        customNoteHtml: sanitizeEditorialHtmlForSeo(
          sec.customNoteHtml || '',
          sec.customHeading || config.brand?.name || 'Official Notice'
        ),
        showSpecsOnGateway: Boolean(sec.showSpecsOnGateway),
        appName: sec.customHeading || config.packageSpecs?.appName || config.brand?.name || '',
        version: config.packageSpecs?.version || '',
        fileSize: config.packageSpecs?.fileSize || '',
        operatingSystem: config.packageSpecs?.operatingSystem || '',
        securityStatus: config.packageSpecs?.securityStatus || '',
        sha256: config.packageSpecs?.sha256 || ''
      }
    });
  });

  // 16c. Gate G1–G7 Session Clearance & Ephemeral AES-256-GCM Decrypt (`POST /api/v1/app/session-clearance`)
  app.post('/api/v1/app/session-clearance', async (req, res) => {
    const config = loadPersistedSiteConfig();
    const sec = config.securityGate || EMPTY_ADMIN_CONFIG.securityGate;

    if (!sec.encryptedPrimaryUrl && sec.primaryDownloadUrl) {
      try {
        sec.encryptedPrimaryUrl = await encryptVaultValue(
          sec.primaryDownloadUrl,
          undefined,
          getVaultMasterSecret()
        );
      } catch {
        // Fallback handled by decryptVaultValue
      }
    }

    const ctx = buildGateRequestContext(req, config);
    const clearance = await handleSessionClearance(ctx);

    for (const [hk, hv] of Object.entries(clearance.headers)) {
      res.setHeader(hk, hv);
    }

    if (clearance.status === 200) {
      try {
        const parsed = JSON.parse(clearance.body);
        if (parsed.status === 'unavailable') {
          parsed.helpline = {
            whatsapp: sec.helplineWhatsapp || '',
            telegram: sec.helplineTelegram || ''
          };
          res.status(200).json(parsed);
          return;
        }
      } catch {
        // Fall through
      }
    }

    res.status(clearance.status).type('application/json').send(clearance.body);
  });

  // --------------------------------------------------------------------------
  // ROUTE HANDLING FOR PUBLIC STATIC PAGES vs. ISOLATED GATEWAY vs. LIVE ADMIN
  // --------------------------------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, watch: null },
      appType: 'custom'
    });

    const stripViteHmrClient = (html: string) =>
      html.replace(/<script\s+type="module"\s+src="\/@vite\/client"><\/script>\s*/gi, '');

    app.get(['/admin', '/admin/', '/admin.html'], async (_req, res, next) => {
      try {
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
        res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
        res.setHeader('Referrer-Policy', 'no-referrer');
        const adminHtmlPath = path.resolve(process.cwd(), 'admin.html');
        let template = fs.readFileSync(adminHtmlPath, 'utf-8');
        template = stripViteHmrClient(await vite.transformIndexHtml('/admin.html', template));
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        next(e);
      }
    });

    app.get(['/moreinfo', '/moreinfo/', '/moreinfo/:slug', '/download', '/download/'], async (req, res, next) => {
      try {
        res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
        res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
        res.setHeader('Referrer-Policy', 'no-referrer');

        const config = loadPersistedSiteConfig();
        const g1 = evaluateGateG1(buildGateRequestContext(req, config));

        const moreinfoHtmlPath = path.resolve(process.cwd(), 'moreinfo.html');
        let template = fs.readFileSync(moreinfoHtmlPath, 'utf-8');
        template = stripViteHmrClient(await vite.transformIndexHtml('/moreinfo.html', template));
        const gatewayHtml = renderGatewayPageHtml(template, config);

        res.status(g1.pass ? 200 : 404).set({ 'Content-Type': 'text/html' }).end(gatewayHtml);
      } catch (e) {
        next(e);
      }
    });

    app.get(['/', '/index.html'], async (req, res, next) => {
      try {
        const indexHtmlPath = path.resolve(process.cwd(), 'index.html');
        let template = fs.readFileSync(indexHtmlPath, 'utf-8');
        template = stripViteHmrClient(await vite.transformIndexHtml('/', template));
        const config = loadPersistedSiteConfig();
        const staticHtml = renderCompleteStaticPageHtml(template, config, req.path);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(staticHtml);
      } catch (e) {
        next(e);
      }
    });

    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      const url = req.originalUrl.split('?')[0];
      if (url.startsWith('/api/') || url.includes('.')) {
        next();
        return;
      }

      try {
        const indexHtmlPath = path.resolve(process.cwd(), 'index.html');
        let template = fs.readFileSync(indexHtmlPath, 'utf-8');
        template = stripViteHmrClient(await vite.transformIndexHtml(url, template));
        const config = loadPersistedSiteConfig();
        const staticHtml = renderCompleteStaticPageHtml(template, config, url);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(staticHtml);
      } catch (e) {
        next(e);
      }
    });
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath, { index: false }));

    app.get(['/admin', '/admin/', '/admin.html'], (_req, res) => {
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
      res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
      res.setHeader('Referrer-Policy', 'no-referrer');
      const adminHtmlPath = path.join(distPath, 'admin.html');
      const rawHtml = fs.readFileSync(adminHtmlPath, 'utf-8');
      res.status(200).set({ 'Content-Type': 'text/html' }).end(rawHtml);
    });

    app.get(['/moreinfo', '/moreinfo/', '/moreinfo/:slug', '/download', '/download/'], (req, res) => {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
      res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
      res.setHeader('Referrer-Policy', 'no-referrer');

      const config = loadPersistedSiteConfig();
      const g1 = evaluateGateG1(buildGateRequestContext(req, config));

      const moreinfoPath = path.join(distPath, 'moreinfo.html');
      const fallbackPath = path.resolve(process.cwd(), 'moreinfo.html');
      const rawHtml = fs.readFileSync(fs.existsSync(moreinfoPath) ? moreinfoPath : fallbackPath, 'utf-8');
      const gatewayHtml = renderGatewayPageHtml(rawHtml, config);
      res.status(g1.pass ? 200 : 404).set({ 'Content-Type': 'text/html' }).end(gatewayHtml);
    });

    app.get('*', (req, res) => {
      const url = req.originalUrl.split('?')[0];
      const indexHtmlPath = path.join(distPath, 'index.html');
      const rawHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
      const config = loadPersistedSiteConfig();
      const staticHtml = renderCompleteStaticPageHtml(rawHtml, config, url);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(staticHtml);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`⚡ Hardened Live-Firebase Admin + Static Public Compiler running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
