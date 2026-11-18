/**
 * ============================================================================
 * MODULE 6: MODULAR ADMIN CONFIG, SECRET SANITIZATION & SYNC LOGS (admin-config.ts)
 * Pure, Edge-safe utilities shared across Node.js server, Cloudflare Pages
 * Functions, Admin Studio client, and unit tests:
 * - Zero static demo content (`EMPTY_ADMIN_CONFIG` for live Firebase Admin)
 * - Granular module-by-module patching (`CMS_MODULE_KEYS`, `applyModulePatch`)
 * - Secret stripping & preservation (`sanitizeConfigForClient`, `preserveSecretsOnSave`)
 * - Fail-closed production auth environment validation (`resolveAdminSecurityPolicy`)
 * - Rich Admin -> Public static sync & GitHub push audit logs (`appendSyncLogEntry`)
 * ============================================================================
 */

import {
  SiteConfig,
  GitHubDeployLogItem,
  mergeSiteConfig,
  generateSlug,
  normalizeDomainUrl
} from './cms-types';

export const CMS_MODULE_KEYS = [
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
] as const;

export type CmsModuleKey = (typeof CMS_MODULE_KEYS)[number];

export const SECRET_MASK = '__SECRET_CONFIGURED__';

export interface SyncLogEntry {
  id: string;
  timestamp: number;
  trigger: 'manual-push' | 'auto-push' | 'module-compile' | 'full-compile' | 'verify' | 'firebase-save';
  status: 'success' | 'saved' | 'local-only' | 'error';
  modulesChanged: string[];
  filesCount: number;
  addedCount?: number;
  updatedCount?: number;
  deletedCount?: number;
  unchangedCount?: number;
  skipped?: boolean;
  changedPaths: string[];
  branch?: string;
  repo?: string;
  commitSha?: string;
  commitUrl?: string;
  durationMs?: number;
  steps?: string[];
  message: string;
  errorDetail?: string;
}

/**
 * Strip raw Firebase API key before sending Firebase environment status to the Admin client
 * so server environment variables (FIREBASE_API_KEY) never leak in JSON payloads.
 */
export function sanitizeFirebaseConfigForClient(
  fbCfg: Record<string, any> | null | undefined
): Record<string, any> | null {
  if (!fbCfg || typeof fbCfg !== 'object' || !fbCfg.projectId) return null;
  return {
    apiKey: '',
    hasEnvApiKey: Boolean(fbCfg.apiKey),
    authDomain: String(fbCfg.authDomain || `${fbCfg.projectId}.firebaseapp.com`),
    projectId: String(fbCfg.projectId || ''),
    storageBucket: String(fbCfg.storageBucket || `${fbCfg.projectId}.appspot.com`),
    messagingSenderId: String(fbCfg.messagingSenderId || ''),
    appId: String(fbCfg.appId || ''),
    databaseId: String(fbCfg.databaseId || '(default)')
  };
}

/**
 * Clean empty structural configuration for Admin Studio when starting fresh or
 * connecting an empty Firebase Firestore database (ZERO static demo articles/sections).
 */
export const EMPTY_ADMIN_CONFIG: SiteConfig = {
  brand: {
    name: '',
    shortName: '',
    tagline: '',
    logoUrl: '',
    faviconUrl: '',
    searchLogoUrl: '',
    appleTouchIconUrl: '',
    accentColor: '#EF4444',
    themeColor: '#EF4444',
    contactEmail: ''
  },
  uiConfig: {
    maxContainerWidth: '768px',
    pageBackgroundColor: '#F8FAFC',
    surfaceBackgroundColor: '#FFFFFF',
    headerBackgroundColor: '#FFFFFF',
    headerTextColor: '#111827',
    footerBackgroundColor: '#0F172A',
    footerTextColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    cardBorderRadius: '12px',
    buttonTextColor: '#FFFFFF',
    textColor: '#1F2937',
    headingColor: '#111827',
    fontFamily: 'system',
    baseFontSize: '16px',
    showHeaderNewsButton: true,
    headerNewsButtonLabel: 'News',
    showNewsCountInHeader: true,
    autoIncludeSectionsInDrawer: true,
    showNewsInDrawer: true,
    showLegalLinksInDrawer: true,
    showCtaInDrawer: true,
    showHeroSection: true,
    showHeroCtaButtons: true,
    homepageNewsLimit: 5,
    newsReadMoreLabel: 'Read Full Article →',
    newsViewAllLabel: 'View All News →',
    backToHomeLabel: '← Back to Home',
    allNewsBreadcrumbLabel: 'All News →',
    showSubpageSwitcherPills: true,
    showFooterDisclaimer: true,
    showFooterLinksHeading: true,
    stickyHeader: true,
    showBreadcrumbs: true,
    enableFaqAccordion: true,
    showTocJumpBar: true,
    homepageSectionOrder: ['specs', 'sections', 'rawHtml', 'news', 'faqs']
  },
  domainConfig: {
    primaryDomain: '',
    forceHttps: true,
    googleSiteVerification: '',
    bingSiteVerification: '',
    googleAnalyticsId: '',
    enableSitemapXml: true,
    enableImageSitemap: true,
    enableWebManifest: true,
    enableRssFeed: true,
    enableAutoInternalLinks: true,
    internalLinks: [],
    customRobotsTxt:
      'User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /admin.html\nDisallow: /moreinfo\nDisallow: /moreinfo/\nDisallow: /download\nDisallow: /download/\nDisallow: /api/v1/app/'
  },
  githubConfig: {
    repoOwner: '',
    repoName: '',
    branch: 'main',
    targetDirectory: 'dist-public',
    fineGrainedToken: '',
    hasFineGrainedToken: false,
    commitMessageTemplate: 'chore(static-publish): sync compiled static public site',
    autoPushOnPublish: false,
    deployHistory: []
  },
  securityGate: {
    enabled: true,
    gatewayPath: '/moreinfo',
    appSlug: '',
    appSerialId: '',
    devicePolicyMode: 'universal_human',
    primaryDownloadUrl: '',
    encryptedPrimaryUrl: '',
    turnstileSiteKey: '',
    turnstileSecretKey: '',
    hasTurnstileSecretKey: false,
    proceedButtonLabel: 'PROCEED',
    unavailableMessage: 'Download mirror is temporarily unavailable. Please check back shortly.',
    isPaused: false,
    isComingSoon: false,
    dailyIssueCap: 0,
    helplineWhatsapp: '',
    helplineTelegram: '',
    customHeading: '',
    customNoteHtml: '',
    showSpecsOnGateway: false
  },
  hero: {
    h1: '',
    metaTitle: '',
    metaDescription: '',
    introHtml: '',
    bannerImageUrl: '',
    bannerAlt: '',
    bannerCaption: '',
    showBanner: false,
    secondaryCta: {
      label: '',
      url: '',
      relSponsored: false
    },
    primaryCta: {
      label: '',
      url: '',
      relSponsored: false
    },
    floatingCta: {
      enabled: false,
      label: '',
      url: ''
    }
  },
  packageSpecs: {
    enabled: false,
    heading: 'Technical Package Specifications',
    metaTitle: '',
    metaDescription: '',
    appName: '',
    version: '',
    fileSize: '',
    operatingSystem: '',
    packageFormat: '',
    sha256: '',
    license: '',
    lastUpdated: '',
    securityStatus: '',
    customRows: []
  },
  sections: [],
  newsSection: {
    enabled: true,
    heading: 'Latest News & Updates',
    metaTitle: '',
    metaDescription: '',
    articles: []
  },
  faqsSection: {
    enabled: true,
    heading: 'Frequently Asked Questions',
    metaTitle: '',
    metaDescription: '',
    items: []
  },
  content: {
    rawHtml: ''
  },
  navigation: {
    headerLinks: [],
    footerSummary: '',
    showFooterBrandSummary: true,
    showFooterContactEmail: true,
    footerQuickLinks: [],
    disclaimerHeading: '',
    disclaimerMetaTitle: '',
    disclaimerMetaDescription: '',
    disclaimer: '',
    siteLinksHeading: '',
    copyright: '',
    showAdminLink: false
  },
  pages: [],
  seo: {
    metaTitle: '',
    metaDescription: '',
    canonicalUrl: '',
    ogImageUrl: '',
    enableSoftwareSchema: false,
    softwareDetails: {
      name: '',
      operatingSystem: '',
      applicationCategory: 'UtilitiesApplication',
      ratingValue: '5.0',
      reviewCount: '0',
      price: '0.00',
      priceCurrency: 'USD'
    },
    rawJsonLd: ''
  },
  syncLogs: [],
  dirtyModulesSinceSync: [],
  updatedAt: 0
};

export function isCmsModuleKey(value: unknown): value is CmsModuleKey {
  return typeof value === 'string' && (CMS_MODULE_KEYS as readonly string[]).includes(value);
}

/**
 * Extract only the target module slice from a complete SiteConfig.
 */
export function extractConfigModule(config: SiteConfig, moduleKey: CmsModuleKey): any {
  const safe = config || EMPTY_ADMIN_CONFIG;
  switch (moduleKey) {
    case 'brand':
      return JSON.parse(JSON.stringify(safe.brand || EMPTY_ADMIN_CONFIG.brand));
    case 'hero':
      return JSON.parse(JSON.stringify(safe.hero || EMPTY_ADMIN_CONFIG.hero));
    case 'uiConfig':
      return JSON.parse(JSON.stringify(safe.uiConfig || EMPTY_ADMIN_CONFIG.uiConfig));
    case 'packageSpecs':
      return JSON.parse(JSON.stringify(safe.packageSpecs || EMPTY_ADMIN_CONFIG.packageSpecs));
    case 'sections':
      return JSON.parse(JSON.stringify(Array.isArray(safe.sections) ? safe.sections : []));
    case 'newsSection':
      return JSON.parse(JSON.stringify(safe.newsSection || EMPTY_ADMIN_CONFIG.newsSection));
    case 'faqsSection':
      return JSON.parse(JSON.stringify(safe.faqsSection || EMPTY_ADMIN_CONFIG.faqsSection));
    case 'content':
      return JSON.parse(JSON.stringify(safe.content || EMPTY_ADMIN_CONFIG.content));
    case 'navigation':
      return JSON.parse(JSON.stringify(safe.navigation || EMPTY_ADMIN_CONFIG.navigation));
    case 'pages':
      return JSON.parse(JSON.stringify(Array.isArray(safe.pages) ? safe.pages : []));
    case 'domainConfig':
      return JSON.parse(JSON.stringify(safe.domainConfig || EMPTY_ADMIN_CONFIG.domainConfig));
    case 'seo':
      return JSON.parse(JSON.stringify(safe.seo || EMPTY_ADMIN_CONFIG.seo));
    case 'securityGate':
      return JSON.parse(JSON.stringify(safe.securityGate || EMPTY_ADMIN_CONFIG.securityGate));
    case 'githubConfig':
      return JSON.parse(JSON.stringify(safe.githubConfig || EMPTY_ADMIN_CONFIG.githubConfig));
    case 'syncLogs':
      return JSON.parse(JSON.stringify(Array.isArray(safe.syncLogs) ? safe.syncLogs : []));
  }
}

/**
 * Preserve stored write-only secrets on server/persistence if the incoming Admin payload
 * contains blank or masked values (`__SECRET_CONFIGURED__`), unless explicitly cleared.
 */
export function preserveSecretsOnSave(
  incoming: Partial<SiteConfig> | Record<string, any>,
  existing?: Partial<SiteConfig> | null
): Record<string, any> {
  const next = JSON.parse(JSON.stringify(incoming || {}));
  const prev = existing || {};

  if (next.githubConfig && typeof next.githubConfig === 'object') {
    next.githubConfig = {
      ...(prev.githubConfig || {}),
      ...next.githubConfig
    };
    const rawToken = String((incoming as any)?.githubConfig?.fineGrainedToken || '').trim();
    const clearToken = Boolean((incoming as any)?.githubConfig?.clearFineGrainedToken);
    if (clearToken) {
      next.githubConfig.fineGrainedToken = '';
      next.githubConfig.hasFineGrainedToken = false;
    } else if (!rawToken || rawToken === SECRET_MASK) {
      const prevToken = String(prev.githubConfig?.fineGrainedToken || '').trim();
      next.githubConfig.fineGrainedToken = prevToken;
      next.githubConfig.hasFineGrainedToken = Boolean(prevToken);
    } else {
      next.githubConfig.fineGrainedToken = rawToken;
      next.githubConfig.hasFineGrainedToken = true;
    }
    delete next.githubConfig.clearFineGrainedToken;
  }

  if (next.securityGate && typeof next.securityGate === 'object') {
    next.securityGate = {
      ...(prev.securityGate || {}),
      ...next.securityGate
    };
    const rawTs = String((incoming as any)?.securityGate?.turnstileSecretKey || '').trim();
    const clearTs = Boolean((incoming as any)?.securityGate?.clearTurnstileSecretKey);
    if (clearTs) {
      next.securityGate.turnstileSecretKey = '';
      next.securityGate.hasTurnstileSecretKey = false;
    } else if (!rawTs || rawTs === SECRET_MASK) {
      const prevTs = String(prev.securityGate?.turnstileSecretKey || '').trim();
      next.securityGate.turnstileSecretKey = prevTs;
      next.securityGate.hasTurnstileSecretKey = Boolean(prevTs);
    } else {
      next.securityGate.turnstileSecretKey = rawTs;
      next.securityGate.hasTurnstileSecretKey = true;
    }
    delete next.securityGate.clearTurnstileSecretKey;
  }

  return next;
}

/**
 * Strip raw write-only secrets before returning any SiteConfig object to the Admin browser,
 * storing in browser localStorage, or writing to public Firestore metadata docs.
 */
export function sanitizeConfigForClient(
  config: SiteConfig | Record<string, any>,
  envFlags?: { hasEnvGithubToken?: boolean; hasEnvTurnstileSecret?: boolean }
): SiteConfig {
  const clone = JSON.parse(JSON.stringify(config || EMPTY_ADMIN_CONFIG));

  if (clone.githubConfig && typeof clone.githubConfig === 'object') {
    const hasStoredToken = Boolean(
      String(clone.githubConfig.fineGrainedToken || '').trim() &&
        clone.githubConfig.fineGrainedToken !== SECRET_MASK
    );
    clone.githubConfig.hasFineGrainedToken = Boolean(
      hasStoredToken || envFlags?.hasEnvGithubToken
    );
    clone.githubConfig.fineGrainedToken = '';
  }

  if (clone.securityGate && typeof clone.securityGate === 'object') {
    const hasStoredSecret = Boolean(
      String(clone.securityGate.turnstileSecretKey || '').trim() &&
        clone.securityGate.turnstileSecretKey !== SECRET_MASK
    );
    clone.securityGate.hasTurnstileSecretKey = Boolean(
      hasStoredSecret || envFlags?.hasEnvTurnstileSecret
    );
    clone.securityGate.turnstileSecretKey = '';
  }

  return clone as SiteConfig;
}

/**
 * Apply a partial/granular update for a single CMS module onto an existing SiteConfig
 * without touching sibling modules, while preserving stored secrets and tracking
 * `dirtyModulesSinceSync` for the Admin -> Public GitHub sync log.
 */
export function applyModulePatch(
  existingConfig: SiteConfig,
  moduleKey: CmsModuleKey,
  moduleValue: any,
  baseFallback: SiteConfig = EMPTY_ADMIN_CONFIG
): { config: SiteConfig; savedModule: CmsModuleKey; dirtyModulesSinceSync: string[] } {
  const existingClone = JSON.parse(JSON.stringify(existingConfig || baseFallback)) as Record<string, any>;
  const patchWrapper: Record<string, any> = {
    ...existingClone,
    [moduleKey]: moduleValue
  };

  const withSecrets = preserveSecretsOnSave(patchWrapper, existingClone);
  const merged = mergeSiteConfig(withSecrets, baseFallback);

  // Synchronize domain / canonical when one of them is edited cleanly
  if (moduleKey === 'domainConfig' && moduleValue?.primaryDomain !== undefined) {
    const forceHttps = merged.domainConfig.forceHttps !== false;
    const norm = moduleValue.primaryDomain
      ? normalizeDomainUrl(moduleValue.primaryDomain, forceHttps)
      : '';
    merged.domainConfig.primaryDomain = norm;
    merged.seo.canonicalUrl = norm;
  } else if (moduleKey === 'seo' && moduleValue?.canonicalUrl !== undefined) {
    const forceHttps = merged.domainConfig.forceHttps !== false;
    const norm = moduleValue.canonicalUrl
      ? normalizeDomainUrl(moduleValue.canonicalUrl, forceHttps)
      : '';
    merged.seo.canonicalUrl = norm;
    merged.domainConfig.primaryDomain = norm;
  }

  if (moduleKey === 'brand' && !merged.securityGate.appSlug && merged.brand.name) {
    merged.securityGate.appSlug = generateSlug(merged.brand.shortName || merged.brand.name);
  }

  const prevDirty = Array.isArray(existingConfig?.dirtyModulesSinceSync)
    ? existingConfig.dirtyModulesSinceSync
    : [];
  const nextDirty =
    moduleKey === 'syncLogs' || moduleKey === 'githubConfig'
      ? [...prevDirty]
      : Array.from(new Set([...prevDirty, moduleKey]));

  merged.dirtyModulesSinceSync = nextDirty;
  merged.syncLogs = Array.isArray(withSecrets.syncLogs)
    ? withSecrets.syncLogs.slice(0, 30)
    : Array.isArray(existingConfig?.syncLogs)
    ? existingConfig.syncLogs.slice(0, 30)
    : [];
  merged.updatedAt = Date.now();

  return {
    config: merged,
    savedModule: moduleKey,
    dirtyModulesSinceSync: nextDirty
  };
}

/**
 * Apply an atomic batch of partial CMS module updates onto an existing SiteConfig
 * in a single pass, preserving stored secrets and sibling modules while cutting
 * Firestore/API writes from N individual module requests down to 1 batch commit.
 */
export function applyMultiModulePatch(
  existingConfig: SiteConfig,
  modulesMap: Partial<Record<CmsModuleKey, any>>,
  baseFallback: SiteConfig = EMPTY_ADMIN_CONFIG
): { config: SiteConfig; savedModules: CmsModuleKey[]; dirtyModulesSinceSync: string[] } {
  let working: SiteConfig = JSON.parse(JSON.stringify(existingConfig || baseFallback));
  const savedModules: CmsModuleKey[] = [];
  const entries = Object.entries(modulesMap || {}) as Array<[CmsModuleKey, any]>;

  for (const [key, val] of entries) {
    if (!CMS_MODULE_KEYS.includes(key) || val === undefined) continue;
    const patched = applyModulePatch(working, key, val, baseFallback);
    working = patched.config;
    savedModules.push(key);
  }

  return {
    config: working,
    savedModules,
    dirtyModulesSinceSync: Array.isArray(working.dirtyModulesSinceSync) ? working.dirtyModulesSinceSync : []
  };
}

/**
 * Append a structured Sync / GitHub Push audit log entry and mirror a summary row
 * onto `githubConfig.deployHistory`. Clears `dirtyModulesSinceSync` on successful GitHub push.
 */
export function appendSyncLogEntry(
  config: SiteConfig,
  entry: Omit<SyncLogEntry, 'id' | 'timestamp'> & { id?: string; timestamp?: number },
  clearDirtyOnSuccess = true
): SiteConfig {
  const clone = JSON.parse(JSON.stringify(config)) as SiteConfig;
  const fullEntry: SyncLogEntry = {
    id: entry.id || `sync-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: entry.timestamp || Date.now(),
    trigger: entry.trigger,
    status: entry.status,
    modulesChanged: Array.isArray(entry.modulesChanged) ? entry.modulesChanged : [],
    filesCount: Number(entry.filesCount) || 0,
    ...(typeof entry.addedCount === 'number' ? { addedCount: entry.addedCount } : {}),
    ...(typeof entry.updatedCount === 'number' ? { updatedCount: entry.updatedCount } : {}),
    ...(typeof entry.deletedCount === 'number' ? { deletedCount: entry.deletedCount } : {}),
    ...(typeof entry.unchangedCount === 'number' ? { unchangedCount: entry.unchangedCount } : {}),
    ...(typeof entry.skipped === 'boolean' ? { skipped: entry.skipped } : {}),
    changedPaths: Array.isArray(entry.changedPaths) ? entry.changedPaths.slice(0, 24) : [],
    branch: entry.branch || '',
    repo: entry.repo || '',
    commitSha: entry.commitSha,
    commitUrl: entry.commitUrl,
    durationMs: entry.durationMs,
    steps: Array.isArray(entry.steps) ? entry.steps : [],
    message: entry.message,
    errorDetail: entry.errorDetail
  };

  const prevLogs = Array.isArray(clone.syncLogs) ? clone.syncLogs : [];
  clone.syncLogs = [fullEntry, ...prevLogs].slice(0, 30);

  const deployRow: GitHubDeployLogItem = {
    id: fullEntry.id,
    timestamp: fullEntry.timestamp,
    status: fullEntry.status,
    commitSha: fullEntry.commitSha,
    commitUrl: fullEntry.commitUrl,
    filesCount: fullEntry.filesCount,
    ...(typeof fullEntry.addedCount === 'number' ? { addedCount: fullEntry.addedCount } : {}),
    ...(typeof fullEntry.updatedCount === 'number' ? { updatedCount: fullEntry.updatedCount } : {}),
    ...(typeof fullEntry.deletedCount === 'number' ? { deletedCount: fullEntry.deletedCount } : {}),
    ...(typeof fullEntry.unchangedCount === 'number' ? { unchangedCount: fullEntry.unchangedCount } : {}),
    ...(typeof fullEntry.skipped === 'boolean' ? { skipped: fullEntry.skipped } : {}),
    durationMs: fullEntry.durationMs,
    steps: fullEntry.steps,
    errorDetail: fullEntry.errorDetail,
    message: fullEntry.message
  };
  clone.githubConfig.deployHistory = [
    deployRow,
    ...(Array.isArray(clone.githubConfig.deployHistory) ? clone.githubConfig.deployHistory : [])
  ].slice(0, 20);

  if (fullEntry.status === 'success' && fullEntry.trigger !== 'firebase-save') {
    clone.githubConfig.lastPublishedAt = fullEntry.timestamp;
    if (fullEntry.commitSha) clone.githubConfig.lastCommitSha = fullEntry.commitSha;
    if (fullEntry.commitUrl) clone.githubConfig.lastCommitUrl = fullEntry.commitUrl;
    if (clearDirtyOnSuccess) {
      clone.dirtyModulesSinceSync = [];
    }
  }

  return clone;
}

const PLACEHOLDER_PREFIX_RE = /^(replace-with-|your[-_]|changeme|example[-_])/i;

export function cleanAuthEnvValue(v: unknown): string {
  return v
    ? String(v)
        .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
        .trim()
        .replace(/^["'`]+|["'`]+$/g, '')
        .trim()
    : '';
}

function isPlaceholderCredentialValue(val: string): boolean {
  if (!val) return true;
  if (PLACEHOLDER_PREFIX_RE.test(val)) return true;
  const lowered = val.toLowerCase();
  if (lowered === 'replace-with-password' || lowered === 'replace-with-secret' || lowered === 'changeme') {
    return true;
  }
  return false;
}

export interface AdminSessionClaims {
  iss: 'master-cms-admin';
  typ: 'admin-session';
  ver?: number;
  email: string;
  role: string;
  cv?: string;
  jti: string;
  iat: number;
  exp: number;
}

export function validateAdminSessionClaims(
  decoded: unknown,
  nowMs: number = Date.now()
): { valid: boolean; reason?: string; claims?: AdminSessionClaims } {
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
    return { valid: false, reason: 'malformed_payload' };
  }
  const obj = decoded as Record<string, unknown>;
  if (obj.iss !== 'master-cms-admin' || obj.typ !== 'admin-session') {
    return { valid: false, reason: 'invalid_issuer_or_type' };
  }
  if (typeof obj.email !== 'string' || !obj.email.trim()) {
    return { valid: false, reason: 'missing_subject' };
  }
  if (typeof obj.jti !== 'string' || obj.jti.trim().length < 16) {
    return { valid: false, reason: 'missing_jti' };
  }
  if (typeof obj.iat !== 'number' || !Number.isFinite(obj.iat) || obj.iat > nowMs + 60_000) {
    return { valid: false, reason: 'invalid_iat' };
  }
  if (typeof obj.exp !== 'number' || !Number.isFinite(obj.exp) || nowMs > obj.exp) {
    return { valid: false, reason: 'expired' };
  }
  return {
    valid: true,
    claims: {
      iss: 'master-cms-admin',
      typ: 'admin-session',
      ...(typeof obj.ver === 'number' ? { ver: obj.ver } : {}),
      email: obj.email.trim(),
      role: typeof obj.role === 'string' && obj.role.trim() ? obj.role.trim() : 'Master Administrator',
      ...(typeof obj.cv === 'string' && obj.cv.trim() ? { cv: obj.cv.trim() } : {}),
      jti: obj.jti.trim(),
      iat: obj.iat,
      exp: obj.exp
    }
  };
}

/**
 * Determine if the current runtime is local vs deployed and strictly enforce
 * fail-closed Admin credentials in ALL environments.
 * Zero default credentials or hardcoded signing secrets ever exist.
 * Accepts any valid email + non-placeholder password configured in environment
 * secrets (including 6-char passwords) and stretches optional custom session
 * secrets cleanly via HMAC-SHA256.
 */
export function resolveAdminSecurityPolicy(
  env: Record<string, any> = {},
  reqHost = ''
): {
  isProduction: boolean;
  allowDefaultDevCreds: boolean;
  hasCustomEmail: boolean;
  hasCustomPassword: boolean;
  hasCustomSecret: boolean;
  hasDerivedSecret: boolean;
  hasApiKey: boolean;
  credentialsReady: boolean;
  setupError: string | null;
} {
  const rawEmail =
    cleanAuthEnvValue(env.ADMIN_EMAIL) ||
    cleanAuthEnvValue(env.ADMIN_EMAIL_ID) ||
    cleanAuthEnvValue(env.ADMIN_ID) ||
    cleanAuthEnvValue(env.ADMIN_USER) ||
    cleanAuthEnvValue(env.ADMIN_USERNAME) ||
    cleanAuthEnvValue(env.CMS_ADMIN_EMAIL) ||
    cleanAuthEnvValue(env.CMS_ADMIN_EMAIL_ID);
  const rawPass =
    cleanAuthEnvValue(env.ADMIN_PASSWORD) ||
    cleanAuthEnvValue(env.ADMIN_PASS) ||
    cleanAuthEnvValue(env.ADMIN_PWD) ||
    cleanAuthEnvValue(env.CMS_ADMIN_PASSWORD);
  const rawSecret =
    cleanAuthEnvValue(env.ADMIN_SESSION_SECRET) ||
    cleanAuthEnvValue(env.ADMIN_SECRET) ||
    cleanAuthEnvValue(env.SESSION_SECRET);
  const rawApiKey = cleanAuthEnvValue(env.ADMIN_API_KEY) || cleanAuthEnvValue(env.CMS_ADMIN_API_KEY);

  const hostOnly = String(reqHost || '').toLowerCase().split(':')[0].trim();
  const isLocalHost = !hostOnly || hostOnly === 'localhost' || hostOnly === '127.0.0.1';
  const nodeEnvProd = cleanAuthEnvValue(env.NODE_ENV).toLowerCase() === 'production';
  const isCloudflarePages = Boolean(cleanAuthEnvValue(env.CF_PAGES) || cleanAuthEnvValue(env.CF_PAGES_URL));
  const isProduction = nodeEnvProd || (isCloudflarePages && !isLocalHost) || (!isLocalHost && Boolean(hostOnly));

  const hasValidEmail = Boolean(rawEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) && !isPlaceholderCredentialValue(rawEmail));
  const hasValidPassword = Boolean(rawPass && rawPass.length >= 1 && !isPlaceholderCredentialValue(rawPass));
  const hasExplicitSecret = Boolean(rawSecret && rawSecret.length >= 1 && !isPlaceholderCredentialValue(rawSecret));
  const hasExplicitPlaceholderSecret = Boolean(rawSecret) && !hasExplicitSecret;
  const hasValidApiKey = Boolean(rawApiKey && rawApiKey.length >= 8 && !isPlaceholderCredentialValue(rawApiKey));

  const hasCustomEmail = hasValidEmail;
  const hasCustomPassword = hasValidPassword;
  const hasApiKey = hasValidApiKey;
  const hasValidAuthMethod = (hasValidEmail && hasValidPassword) || hasValidApiKey;
  const hasDerivedSecret = Boolean(!hasExplicitSecret && hasValidAuthMethod);
  const hasCustomSecret = hasExplicitSecret || hasDerivedSecret;

  if (!hasValidAuthMethod || hasExplicitPlaceholderSecret) {
    const missingParts: string[] = [];
    if (!hasValidAuthMethod) {
      missingParts.push('ADMIN_EMAIL + ADMIN_PASSWORD');
    }
    if (hasExplicitPlaceholderSecret) {
      missingParts.push('non-placeholder ADMIN_SESSION_SECRET');
    }
    return {
      isProduction,
      allowDefaultDevCreds: false,
      hasCustomEmail,
      hasCustomPassword,
      hasCustomSecret: hasExplicitSecret,
      hasDerivedSecret: false,
      hasApiKey,
      credentialsReady: false,
      setupError: `Admin authentication is not configured. Set ${missingParts.join(' and ')} in your environment secrets.`
    };
  }

  return {
    isProduction,
    allowDefaultDevCreds: false,
    hasCustomEmail,
    hasCustomPassword,
    hasCustomSecret: true,
    hasDerivedSecret,
    hasApiKey,
    credentialsReady: true,
    setupError: null
  };
}
