/**
 * Shared Cloudflare Pages Functions Authentication, Security Policy, CSRF,
 * Rate-Limiting, AES-256-GCM Link Vault, 7-Gate Security Engine, and Modular
 * Firestore REST Helper (Pure Web Crypto / Edge-native JS).
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const DEFAULT_VAULT_SECRET = 'master-cms-v12-aes-256-gcm-vault-secret-key-2026';

export const SECRET_MASK = '__SECRET_CONFIGURED__';

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
];

export const EMPTY_ADMIN_CONFIG = {
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
    secondaryCta: { label: '', url: '', relSponsored: false },
    primaryCta: { label: '', url: '', relSponsored: false },
    floatingCta: { enabled: false, label: '', url: '' }
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
  content: { rawHtml: '' },
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

export function cleanEnvVal(val) {
  if (!val) return '';
  return String(val)
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim();
}

export function isCmsModuleKey(value) {
  return typeof value === 'string' && CMS_MODULE_KEYS.includes(value);
}

const PLACEHOLDER_PREFIX_RE = /^(replace-with-|your[-_]|changeme|example[-_])/i;

function isPlaceholderCredentialValueEdge(val) {
  if (!val) return true;
  if (PLACEHOLDER_PREFIX_RE.test(val)) return true;
  const lowered = val.toLowerCase();
  if (lowered === 'replace-with-password' || lowered === 'replace-with-secret' || lowered === 'changeme') {
    return true;
  }
  return false;
}

export function resolveAdminSecurityPolicyEdge(env = {}, reqHost = '') {
  const rawEmail =
    cleanEnvVal(env.ADMIN_EMAIL) ||
    cleanEnvVal(env.ADMIN_EMAIL_ID) ||
    cleanEnvVal(env.ADMIN_ID) ||
    cleanEnvVal(env.ADMIN_USER) ||
    cleanEnvVal(env.ADMIN_USERNAME) ||
    cleanEnvVal(env.CMS_ADMIN_EMAIL) ||
    cleanEnvVal(env.CMS_ADMIN_EMAIL_ID);

  const rawPass =
    cleanEnvVal(env.ADMIN_PASSWORD) ||
    cleanEnvVal(env.ADMIN_PASS) ||
    cleanEnvVal(env.ADMIN_PWD) ||
    cleanEnvVal(env.CMS_ADMIN_PASSWORD);

  const rawSecret =
    cleanEnvVal(env.ADMIN_SESSION_SECRET) ||
    cleanEnvVal(env.ADMIN_SECRET) ||
    cleanEnvVal(env.SESSION_SECRET);

  const rawApiKey = cleanEnvVal(env.ADMIN_API_KEY) || cleanEnvVal(env.CMS_ADMIN_API_KEY);

  const hostOnly = String(reqHost || '').toLowerCase().split(':')[0].trim();
  const isLocalHost = !hostOnly || hostOnly === 'localhost' || hostOnly === '127.0.0.1';
  const nodeEnvProd = cleanEnvVal(env.NODE_ENV).toLowerCase() === 'production';
  const isCfPages = Boolean(cleanEnvVal(env.CF_PAGES) || cleanEnvVal(env.CF_PAGES_URL));
  const isProduction = nodeEnvProd || (isCfPages && !isLocalHost) || (!isLocalHost && Boolean(hostOnly));

  const hasValidEmail = Boolean(rawEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) && !isPlaceholderCredentialValueEdge(rawEmail));
  const hasValidPassword = Boolean(rawPass && rawPass.length >= 1 && !isPlaceholderCredentialValueEdge(rawPass));
  const hasExplicitSecret = Boolean(rawSecret && rawSecret.length >= 1 && !isPlaceholderCredentialValueEdge(rawSecret));
  const hasExplicitPlaceholderSecret = Boolean(rawSecret) && !hasExplicitSecret;
  const hasValidApiKey = Boolean(rawApiKey && rawApiKey.length >= 8 && !isPlaceholderCredentialValueEdge(rawApiKey));

  const hasValidAuthMethod = (hasValidEmail && hasValidPassword) || hasValidApiKey;
  const hasDerivedSecret = Boolean(!hasExplicitSecret && hasValidAuthMethod);
  const hasCustomSecret = hasExplicitSecret || hasDerivedSecret;

  if (!hasValidAuthMethod || hasExplicitPlaceholderSecret) {
    const missingParts = [];
    if (!hasValidAuthMethod) {
      missingParts.push('ADMIN_EMAIL + ADMIN_PASSWORD');
    }
    if (hasExplicitPlaceholderSecret) {
      missingParts.push('non-placeholder ADMIN_SESSION_SECRET');
    }
    return {
      isProduction,
      allowDefaultDevCreds: false,
      hasCustomEmail: hasValidEmail,
      hasCustomPassword: hasValidPassword,
      hasCustomSecret: hasExplicitSecret,
      hasDerivedSecret: false,
      hasApiKey: hasValidApiKey,
      credentialsReady: false,
      setupError: `Admin authentication is not configured. Set ${missingParts.join(' and ')} in Cloudflare Pages secrets.`
    };
  }

  return {
    isProduction,
    allowDefaultDevCreds: false,
    hasCustomEmail: hasValidEmail,
    hasCustomPassword: hasValidPassword,
    hasCustomSecret,
    hasDerivedSecret,
    hasApiKey: hasValidApiKey,
    credentialsReady: true,
    setupError: null
  };
}

export function getAdminCredentials(env = {}, reqHost = '') {
  const policy = resolveAdminSecurityPolicyEdge(env, reqHost);

  const email =
    cleanEnvVal(env.ADMIN_EMAIL) ||
    cleanEnvVal(env.ADMIN_EMAIL_ID) ||
    cleanEnvVal(env.ADMIN_ID) ||
    cleanEnvVal(env.ADMIN_USER) ||
    cleanEnvVal(env.ADMIN_USERNAME) ||
    cleanEnvVal(env.CMS_ADMIN_EMAIL) ||
    cleanEnvVal(env.CMS_ADMIN_EMAIL_ID);

  const password =
    cleanEnvVal(env.ADMIN_PASSWORD) ||
    cleanEnvVal(env.ADMIN_PASS) ||
    cleanEnvVal(env.ADMIN_PWD) ||
    cleanEnvVal(env.CMS_ADMIN_PASSWORD);

  const apiKey =
    cleanEnvVal(env.ADMIN_API_KEY) ||
    cleanEnvVal(env.CMS_ADMIN_API_KEY) ||
    '';

  const rawExplicitSecret =
    cleanEnvVal(env.ADMIN_SESSION_SECRET) ||
    cleanEnvVal(env.ADMIN_SECRET) ||
    cleanEnvVal(env.SESSION_SECRET);

  return {
    email: policy.hasCustomEmail ? email : '',
    password: policy.hasCustomPassword ? password : '',
    apiKey: policy.hasApiKey ? apiKey : '',
    secret: rawExplicitSecret,
    isCustomEmail: policy.hasCustomEmail,
    isCustomPassword: policy.hasCustomPassword,
    isCustomSecret: policy.hasCustomSecret,
    hasDerivedSecret: policy.hasDerivedSecret,
    requiresApiKey: policy.hasApiKey,
    policy
  };
}

export async function deriveEdgeAdminAuthSecrets(adminCreds, env = {}) {
  if (!adminCreds?.policy?.credentialsReady) {
    return { signingSecret: '', credVersion: '' };
  }
  let signingSecret = '';
  if (!adminCreds.hasDerivedSecret && adminCreds.secret) {
    signingSecret = await createHmacSignature(adminCreds.secret, 'master-cms:session:explicit:v2');
  } else if (adminCreds.hasDerivedSecret) {
    const vaultSalt = cleanEnvVal(
      env.VAULT_ENCRYPTION_SECRET || env.LINK_VAULT_MASTER_SECRET || env.FIREBASE_API_KEY || ''
    );
    const ikm = `${adminCreds.password}\0${adminCreds.apiKey}\0${vaultSalt}`;
    signingSecret = await createHmacSignature(
      ikm,
      `master-cms:session:derived:v2:${adminCreds.email.toLowerCase()}`
    );
  }
  const credVersion = signingSecret
    ? (
        await createHmacSignature(
          signingSecret,
          `cred-epoch:v2:${adminCreds.email.toLowerCase()}\0${adminCreds.password}\0${adminCreds.apiKey}`
        )
      ).slice(0, 16)
    : '';
  return { signingSecret, credVersion };
}

export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = textEncoder.encode(a);
  const bufB = textEncoder.encode(b);
  const maxLen = Math.max(bufA.byteLength, bufB.byteLength, 32);
  let diff = bufA.byteLength ^ bufB.byteLength;
  for (let i = 0; i < maxLen; i++) {
    const ba = i < bufA.byteLength ? bufA[i] : 0;
    const bb = i < bufB.byteLength ? bufB[i] : 0;
    diff |= ba ^ bb;
  }
  return diff === 0;
}

export async function timingSafeEqualDigest(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest('SHA-256', textEncoder.encode(a)),
    crypto.subtle.digest('SHA-256', textEncoder.encode(b))
  ]);
  const viewA = new Uint8Array(hashA);
  const viewB = new Uint8Array(hashB);
  let diff = 0;
  for (let i = 0; i < 32; i++) {
    diff |= viewA[i] ^ viewB[i];
  }
  return diff === 0;
}

export function bytesToBase64Url(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < arr.byteLength; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function base64UrlToBytes(b64url) {
  try {
    const trimmed = String(b64url || '').trim().replace(/-/g, '+').replace(/_/g, '/');
    const padded = trimmed + '='.repeat((4 - (trimmed.length % 4)) % 4);
    const bin = atob(padded);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      out[i] = bin.charCodeAt(i);
    }
    return out;
  } catch {
    return null;
  }
}

export function base64UrlToUtf8(base64url) {
  const bytes = base64UrlToBytes(base64url);
  if (!bytes) return null;
  try {
    return textDecoder.decode(bytes);
  } catch {
    return null;
  }
}

export async function sha256Hex(input) {
  const buf = await crypto.subtle.digest('SHA-256', textEncoder.encode(String(input || '')));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function createHmacSignature(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(data));
  return bytesToBase64Url(signature);
}

export async function hmacTruncated16B64Url(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(data));
  return bytesToBase64Url(new Uint8Array(signature).slice(0, 16));
}

const EDGE_SESSION_TTL_SEC = 12 * 60 * 60;
const EDGE_SESSION_TTL_MS = EDGE_SESSION_TTL_SEC * 1000;
const EDGE_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const edgeRevokedJtis = new Map();
const edgeLoginTracker = new Map();

export function revokeAdminJti(jti, exp) {
  if (!jti) return;
  const now = Date.now();
  for (const [k, expiry] of edgeRevokedJtis.entries()) {
    if (now > expiry) edgeRevokedJtis.delete(k);
  }
  while (edgeRevokedJtis.size > 5000) {
    const oldest = edgeRevokedJtis.keys().next().value;
    if (!oldest) break;
    edgeRevokedJtis.delete(oldest);
  }
  edgeRevokedJtis.set(jti, exp || now + EDGE_SESSION_TTL_MS);
}

export function checkEdgeLoginRateLimit(ip) {
  const now = Date.now();
  const globalEntry = edgeLoginTracker.get('__global__');
  if (globalEntry && now <= globalEntry.resetAt && globalEntry.count >= 12) {
    return { allowed: false, retryAfterSec: Math.ceil((globalEntry.resetAt - now) / 1000) };
  }
  const entry = edgeLoginTracker.get(ip);
  if (!entry || now > entry.resetAt) {
    if (entry) edgeLoginTracker.delete(ip);
    return { allowed: true };
  }
  if (entry.count >= 5) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true };
}

export function recordEdgeFailedLogin(ip) {
  const now = Date.now();
  for (const [k, v] of edgeLoginTracker.entries()) {
    if (now > v.resetAt) edgeLoginTracker.delete(k);
  }
  while (edgeLoginTracker.size > 5000) {
    const oldest = edgeLoginTracker.keys().next().value;
    if (!oldest) break;
    edgeLoginTracker.delete(oldest);
  }
  for (const bucketKey of [ip, '__global__']) {
    const entry = edgeLoginTracker.get(bucketKey);
    if (!entry || now > entry.resetAt) {
      edgeLoginTracker.set(bucketKey, { count: 1, resetAt: now + EDGE_LOGIN_WINDOW_MS });
    } else {
      entry.count += 1;
    }
  }
}

export function clearEdgeLoginAttempts(ip) {
  edgeLoginTracker.delete(ip);
  edgeLoginTracker.delete('__global__');
}

export function parseCookies(cookieHeader = '') {
  const out = {};
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

export function isHttpsEdgeRequest(request) {
  try {
    const url = new URL(request.url);
    const xfProto = String(request.headers.get('x-forwarded-proto') || '').toLowerCase();
    return url.protocol === 'https:' || xfProto.includes('https');
  } catch {
    return false;
  }
}

export function buildSessionCookieHeader(token, isHttps) {
  const name = isHttps ? '__Host-cms_admin_session' : 'cms_admin_session';
  const parts = [
    `${name}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${EDGE_SESSION_TTL_SEC}`
  ];
  if (isHttps) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookieHeaders(isHttps) {
  return [
    'cms_admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    `__Host-cms_admin_session=; Path=/; HttpOnly; SameSite=Lax; ${isHttps ? 'Secure; ' : ''}Max-Age=0`
  ];
}

export async function createAdminToken(email, secret, credVersion = '') {
  const rnd = new Uint8Array(16);
  crypto.getRandomValues(rnd);
  const jti = Array.from(rnd).map((b) => b.toString(16).padStart(2, '0')).join('');
  const now = Date.now();
  const payload = {
    iss: 'master-cms-admin',
    typ: 'admin-session',
    ver: 2,
    email,
    cv: credVersion,
    jti,
    role: 'Master Administrator',
    iat: now,
    exp: now + EDGE_SESSION_TTL_MS
  };
  const b64Payload = bytesToBase64Url(textEncoder.encode(JSON.stringify(payload)));
  const signature = await createHmacSignature(secret, b64Payload);
  return `${b64Payload}.${signature}`;
}

export async function verifyAdminToken(
  token,
  secret,
  expectedApiKey = '',
  ignoreExpiryForLogout = false,
  expectedCredVersion = '',
  fromCookie = false
) {
  if (!token || typeof token !== 'string') return { valid: false };

  if (!fromCookie && expectedApiKey && (await timingSafeEqualDigest(token.trim(), expectedApiKey.trim()))) {
    return { valid: true, email: 'api-key-admin', role: 'Master Administrator' };
  }
  if (!secret) return { valid: false };

  const parts = token.split('.');
  if (parts.length !== 2) return { valid: false };
  const [b64Payload, signature] = parts;

  try {
    const expectedSig = await createHmacSignature(secret, b64Payload);
    if (!(await timingSafeEqualDigest(signature, expectedSig))) {
      return { valid: false };
    }

    const jsonStr = base64UrlToUtf8(b64Payload);
    if (!jsonStr) return { valid: false };
    const decoded = JSON.parse(jsonStr);
    const nowMs = Date.now();
    if (
      !decoded ||
      typeof decoded !== 'object' ||
      decoded.iss !== 'master-cms-admin' ||
      decoded.typ !== 'admin-session' ||
      typeof decoded.email !== 'string' ||
      !decoded.email.trim() ||
      typeof decoded.jti !== 'string' ||
      decoded.jti.trim().length < 16 ||
      typeof decoded.iat !== 'number' ||
      !Number.isFinite(decoded.iat) ||
      decoded.iat > nowMs + 60000 ||
      typeof decoded.exp !== 'number' ||
      !Number.isFinite(decoded.exp)
    ) {
      return { valid: false };
    }
    if (nowMs > decoded.exp) {
      if (ignoreExpiryForLogout) {
        return { valid: false, expired: true, jti: decoded.jti, exp: decoded.exp };
      }
      return { valid: false, expired: true };
    }
    if (expectedCredVersion) {
      if (!decoded.cv || typeof decoded.cv !== 'string' || !(await timingSafeEqualDigest(decoded.cv, expectedCredVersion))) {
        return { valid: false, expired: true };
      }
    }
    if (edgeRevokedJtis.has(decoded.jti)) {
      return { valid: false, revoked: true };
    }
    return {
      valid: true,
      email: decoded.email.trim(),
      role: typeof decoded.role === 'string' && decoded.role.trim() ? decoded.role.trim() : 'Master Administrator',
      jti: decoded.jti.trim(),
      exp: decoded.exp
    };
  } catch {
    return { valid: false };
  }
}

export function verifyCsrfEdge(request, env = {}) {
  const method = (request.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return { ok: true };
  }

  const secFetchSite = cleanEnvVal(request.headers.get('sec-fetch-site')).toLowerCase();
  if (secFetchSite === 'cross-site') {
    return { ok: false, error: 'Cross-site request blocked.' };
  }

  const reqHost = (request.headers.get('host') || new URL(request.url).host || '').toLowerCase();
  const origin = cleanEnvVal(request.headers.get('origin'));
  const referer = cleanEnvVal(request.headers.get('referer'));

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

  const adminCreds = getAdminCredentials(env, reqHost);
  const headerApiKey = cleanEnvVal(request.headers.get('x-admin-api-key'));
  if (headerApiKey && adminCreds.apiKey && timingSafeEqual(headerApiKey, adminCreds.apiKey)) {
    return { ok: true };
  }

  const csrfHeader = cleanEnvVal(
    request.headers.get('x-admin-csrf') || request.headers.get('x-requested-with')
  );
  if (csrfHeader !== '1' && csrfHeader !== 'XMLHttpRequest') {
    return { ok: false, error: 'Missing required CSRF verification header (X-Admin-CSRF).' };
  }

  return { ok: true };
}

export async function verifyAdminRequest(request, env = {}, ignoreExpiryForLogout = false) {
  const reqHost = (request.headers.get('host') || new URL(request.url).host || '').toLowerCase();
  const adminCreds = getAdminCredentials(env, reqHost);

  if (!adminCreds.policy.credentialsReady) {
    return {
      verification: { valid: false, policyError: adminCreds.policy.setupError },
      adminCreds
    };
  }

  const { signingSecret, credVersion } = await deriveEdgeAdminAuthSecrets(adminCreds, env);
  const authHeader = request.headers.get('authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const headerApiKey = cleanEnvVal(request.headers.get('x-admin-api-key'));
  const cookies = parseCookies(request.headers.get('cookie') || '');
  const cookieToken =
    cookies['__Host-cms_admin_session'] || cookies['cms_admin_session'] || '';

  const fromCookie = Boolean(!headerApiKey && cookieToken);
  const token = headerApiKey || cookieToken || bearerToken;
  const verification = await verifyAdminToken(
    token,
    signingSecret,
    adminCreds.apiKey,
    ignoreExpiryForLogout,
    credVersion,
    fromCookie
  );
  return { verification, adminCreds };
}

export function jsonResponse(data, status = 200, extraHeaders = {}, request = null, isSensitive = true) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store, no-cache, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet'
  });

  if (!isSensitive) {
    headers.set('Access-Control-Allow-Origin', '*');
  } else if (request) {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host') || '';
    if (origin) {
      try {
        if (new URL(origin).host.toLowerCase() === host.toLowerCase()) {
          headers.set('Access-Control-Allow-Origin', origin);
          headers.set('Access-Control-Allow-Credentials', 'true');
          headers.set('Vary', 'Origin');
        }
      } catch {
        // Ignore invalid origin
      }
    }
  }

  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-api-key, x-admin-csrf, x-requested-with');

  for (const [k, v] of Object.entries(extraHeaders || {})) {
    if (Array.isArray(v)) {
      for (const item of v) headers.append(k, item);
    } else if (v !== undefined && v !== null) {
      headers.set(k, String(v));
    }
  }

  return new Response(JSON.stringify(data), { status, headers });
}

export function sanitizeConfigForClientEdge(config, env = {}) {
  const clone = JSON.parse(JSON.stringify(config || EMPTY_ADMIN_CONFIG));
  const envGhToken = cleanEnvVal(
    env.GITHUB_FINE_GRAINED_TOKEN || env.GITHUB_TOKEN || env.GH_TOKEN
  );
  const envTsSecret = cleanEnvVal(
    env.TURNSTILE_SECRET_KEY || env.VITE_TURNSTILE_SECRET_KEY || env.CF_TURNSTILE_SECRET_KEY
  );

  if (clone.githubConfig && typeof clone.githubConfig === 'object') {
    const hasStored = Boolean(
      cleanEnvVal(clone.githubConfig.fineGrainedToken) &&
        clone.githubConfig.fineGrainedToken !== SECRET_MASK
    );
    clone.githubConfig.hasFineGrainedToken = Boolean(
      hasStored || clone.githubConfig.hasFineGrainedToken || envGhToken
    );
    clone.githubConfig.fineGrainedToken = '';
  }

  if (clone.securityGate && typeof clone.securityGate === 'object') {
    const hasStored = Boolean(
      cleanEnvVal(clone.securityGate.turnstileSecretKey) &&
        clone.securityGate.turnstileSecretKey !== SECRET_MASK
    );
    clone.securityGate.hasTurnstileSecretKey = Boolean(
      hasStored || clone.securityGate.hasTurnstileSecretKey || envTsSecret
    );
    clone.securityGate.turnstileSecretKey = '';
  }

  return clone;
}

export function preserveSecretsEdge(incoming, existing = {}) {
  const next = JSON.parse(JSON.stringify(incoming || {}));
  const prev = existing || {};

  if (next.githubConfig && typeof next.githubConfig === 'object') {
    const raw = cleanEnvVal(next.githubConfig.fineGrainedToken);
    const clr = Boolean(next.githubConfig.clearFineGrainedToken);
    if (clr) {
      next.githubConfig.fineGrainedToken = '';
      next.githubConfig.hasFineGrainedToken = false;
    } else if (!raw || raw === SECRET_MASK) {
      const prevTok = cleanEnvVal(prev.githubConfig?.fineGrainedToken);
      next.githubConfig.fineGrainedToken = prevTok;
      next.githubConfig.hasFineGrainedToken = Boolean(prevTok);
    } else {
      next.githubConfig.hasFineGrainedToken = true;
    }
    delete next.githubConfig.clearFineGrainedToken;
  }

  if (next.securityGate && typeof next.securityGate === 'object') {
    const raw = cleanEnvVal(next.securityGate.turnstileSecretKey);
    const clr = Boolean(next.securityGate.clearTurnstileSecretKey);
    if (clr) {
      next.securityGate.turnstileSecretKey = '';
      next.securityGate.hasTurnstileSecretKey = false;
    } else if (!raw || raw === SECRET_MASK) {
      const prevTok = cleanEnvVal(prev.securityGate?.turnstileSecretKey);
      next.securityGate.turnstileSecretKey = prevTok;
      next.securityGate.hasTurnstileSecretKey = Boolean(prevTok);
    } else {
      next.securityGate.hasTurnstileSecretKey = true;
    }
    delete next.securityGate.clearTurnstileSecretKey;
  }

  return next;
}

export function applyModulePatchEdge(existingConfig, moduleKey, moduleValue) {
  const base = JSON.parse(JSON.stringify(EMPTY_ADMIN_CONFIG));
  const mergedExisting = {
    ...base,
    ...(existingConfig || {})
  };

  const withSecrets = preserveSecretsEdge(
    { ...mergedExisting, [moduleKey]: moduleValue },
    mergedExisting
  );

  const prevDirty = Array.isArray(mergedExisting.dirtyModulesSinceSync)
    ? mergedExisting.dirtyModulesSinceSync
    : [];
  const nextDirty =
    moduleKey === 'syncLogs' || moduleKey === 'githubConfig'
      ? [...prevDirty]
      : Array.from(new Set([...prevDirty, moduleKey]));

  withSecrets.dirtyModulesSinceSync = nextDirty;
  withSecrets.updatedAt = Date.now();
  return { config: withSecrets, savedModule: moduleKey, dirtyModulesSinceSync: nextDirty };
}

export function applyMultiModulePatchEdge(existingConfig, modulesMap = {}) {
  let working = JSON.parse(JSON.stringify(existingConfig || EMPTY_ADMIN_CONFIG));
  const savedModules = [];
  for (const [key, val] of Object.entries(modulesMap || {})) {
    if (!isCmsModuleKey(key) || val === undefined) continue;
    const patched = applyModulePatchEdge(working, key, val);
    working = patched.config;
    savedModules.push(key);
  }
  return {
    config: working,
    savedModules,
    dirtyModulesSinceSync: Array.isArray(working.dirtyModulesSinceSync)
      ? working.dirtyModulesSinceSync
      : []
  };
}

export function appendSyncLogEntryEdge(config, entry, clearDirtyOnSuccess = true) {
  const clone = JSON.parse(JSON.stringify(config || EMPTY_ADMIN_CONFIG));
  const fullEntry = {
    id: entry.id || `sync-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: entry.timestamp || Date.now(),
    trigger: entry.trigger || 'manual-push',
    status: entry.status || 'success',
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
    message: entry.message || '',
    errorDetail: entry.errorDetail
  };

  clone.syncLogs = [fullEntry, ...(Array.isArray(clone.syncLogs) ? clone.syncLogs : [])].slice(0, 30);
  if (!clone.githubConfig) clone.githubConfig = { ...EMPTY_ADMIN_CONFIG.githubConfig };
  clone.githubConfig.deployHistory = [
    {
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
    },
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

export function sanitizeFirebaseConfigForClientEdge(fbCfg) {
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

// ============================================================================
// Firebase Env & Modular Firestore REST API Helpers (Edge-Native)
// ============================================================================

export function getFirebaseEnvFromEnv(env = {}) {
  let jsonEnv = {};
  const rawJson = cleanEnvVal(env.FIREBASE_CONFIG_JSON || env.VITE_FIREBASE_CONFIG_JSON);
  if (rawJson) {
    try {
      jsonEnv = JSON.parse(rawJson);
    } catch {
      // Ignore malformed JSON
    }
  }

  const projectId =
    cleanEnvVal(jsonEnv.projectId) ||
    cleanEnvVal(env.FIREBASE_PROJECT_ID) ||
    cleanEnvVal(env.VITE_FIREBASE_PROJECT_ID) ||
    cleanEnvVal(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);

  const apiKey =
    cleanEnvVal(jsonEnv.apiKey) ||
    cleanEnvVal(env.FIREBASE_API_KEY) ||
    cleanEnvVal(env.VITE_FIREBASE_API_KEY) ||
    cleanEnvVal(env.NEXT_PUBLIC_FIREBASE_API_KEY);

  const authDomain =
    cleanEnvVal(jsonEnv.authDomain) ||
    cleanEnvVal(env.FIREBASE_AUTH_DOMAIN) ||
    cleanEnvVal(env.VITE_FIREBASE_AUTH_DOMAIN) ||
    cleanEnvVal(env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN) ||
    (projectId ? `${projectId}.firebaseapp.com` : '');

  const storageBucket =
    cleanEnvVal(jsonEnv.storageBucket) ||
    cleanEnvVal(env.FIREBASE_STORAGE_BUCKET) ||
    cleanEnvVal(env.VITE_FIREBASE_STORAGE_BUCKET) ||
    cleanEnvVal(env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) ||
    (projectId ? `${projectId}.appspot.com` : '');

  const messagingSenderId =
    cleanEnvVal(jsonEnv.messagingSenderId) ||
    cleanEnvVal(env.FIREBASE_MESSAGING_SENDER_ID) ||
    cleanEnvVal(env.VITE_FIREBASE_MESSAGING_SENDER_ID) ||
    cleanEnvVal(env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID);

  const appId =
    cleanEnvVal(jsonEnv.appId) ||
    cleanEnvVal(env.FIREBASE_APP_ID) ||
    cleanEnvVal(env.VITE_FIREBASE_APP_ID) ||
    cleanEnvVal(env.NEXT_PUBLIC_FIREBASE_APP_ID);

  const databaseId =
    cleanEnvVal(jsonEnv.databaseId) ||
    cleanEnvVal(env.FIREBASE_DATABASE_ID) ||
    cleanEnvVal(env.VITE_FIREBASE_DATABASE_ID) ||
    '(default)';

  const isConfigured = Boolean(
    apiKey &&
    projectId &&
    !apiKey.includes('DummyKey') &&
    !apiKey.includes('YOUR_') &&
    !projectId.includes('my-single-domain-cms')
  );

  return {
    isConfigured,
    config: isConfigured
      ? { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId, databaseId }
      : null
  };
}

function decodeFirestoreValue(val) {
  if (!val || typeof val !== 'object') return null;
  if ('stringValue' in val) return val.stringValue;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    const arr = val.arrayValue?.values || [];
    return arr.map((item) => decodeFirestoreValue(item));
  }
  if ('mapValue' in val) {
    const out = {};
    const fields = val.mapValue?.fields || {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = decodeFirestoreValue(v);
    }
    return out;
  }
  return null;
}

function encodeFirestoreValue(val) {
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
        values: val.map((item) => encodeFirestoreValue(item))
      }
    };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        fields[k] = encodeFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

export async function readSiteConfigFromFirestoreRest(fbCfg) {
  if (!fbCfg?.projectId || !fbCfg?.apiKey) return null;
  const dbId = encodeURIComponent(fbCfg.databaseId || '(default)');
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    fbCfg.projectId
  )}/databases/${dbId}/documents`;

  const [modulesRes, mainRes] = await Promise.all([
    fetch(`${base}/cmsModules?pageSize=50&key=${encodeURIComponent(fbCfg.apiKey)}`, {
      headers: { Accept: 'application/json' }
    }).catch(() => null),
    fetch(`${base}/siteConfig/main?key=${encodeURIComponent(fbCfg.apiKey)}`, {
      headers: { Accept: 'application/json' }
    }).catch(() => null)
  ]);

  let mainObj = null;
  if (mainRes && mainRes.ok) {
    const docData = await mainRes.json().catch(() => null);
    if (docData?.fields) {
      mainObj = {};
      for (const [k, v] of Object.entries(docData.fields)) {
        mainObj[k] = decodeFirestoreValue(v);
      }
    }
  }

  let modulesCount = 0;
  const assembled = JSON.parse(JSON.stringify(EMPTY_ADMIN_CONFIG));
  if (mainObj) {
    for (const key of Object.keys(mainObj)) {
      if (key !== 'modularSync') {
        assembled[key] = mainObj[key];
      }
    }
  }

  if (modulesRes && modulesRes.ok) {
    const listData = await modulesRes.json().catch(() => null);
    const docs = Array.isArray(listData?.documents) ? listData.documents : [];
    for (const docItem of docs) {
      const docName = String(docItem.name || '').split('/').pop() || '';
      if (isCmsModuleKey(docName) && docItem.fields) {
        const decodedFields = {};
        for (const [k, v] of Object.entries(docItem.fields)) {
          decodedFields[k] = decodeFirestoreValue(v);
        }
        if (decodedFields.data !== undefined) {
          assembled[docName] = decodedFields.data;
          modulesCount += 1;
        }
      }
    }
  }

  if (modulesCount === 0 && !mainObj) {
    return null;
  }
  return assembled;
}

/**
 * Atomic single-request batch write to Cloud Firestore REST API (`documents:commit`).
 * Eliminates multiple sequential/parallel REST calls and metadata race conditions.
 */
export async function writeBatchToFirestoreRest(fbCfg, modulesMap = {}, meta = {}) {
  if (!fbCfg?.projectId || !fbCfg?.apiKey) {
    return { ok: false, error: 'Missing Firebase config' };
  }
  const dbIdRaw = fbCfg.databaseId || '(default)';
  const docRoot = `projects/${fbCfg.projectId}/databases/${dbIdRaw}/documents`;
  const commitUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    fbCfg.projectId
  )}/databases/${encodeURIComponent(dbIdRaw)}/documents:commit?key=${encodeURIComponent(fbCfg.apiKey)}`;

  const now = meta.updatedAt || Date.now();
  const writes = [];
  for (const [moduleKey, moduleData] of Object.entries(modulesMap || {})) {
    if (!isCmsModuleKey(moduleKey) || moduleData === undefined) continue;
    writes.push({
      update: {
        name: `${docRoot}/cmsModules/${moduleKey}`,
        fields: {
          data: encodeFirestoreValue(moduleData),
          updatedAt: encodeFirestoreValue(now)
        }
      }
    });
  }

  writes.push({
    update: {
      name: `${docRoot}/siteConfig/main`,
      fields: {
        updatedAt: encodeFirestoreValue(now),
        dirtyModulesSinceSync: encodeFirestoreValue(meta.dirtyModulesSinceSync || []),
        modularSync: encodeFirestoreValue(true)
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
      return { ok: false, error: errBody?.error?.message || `HTTP ${res.status}` };
    }
    return { ok: true, writesCommitted: writes.length };
  } catch (err) {
    return { ok: false, error: err?.message || 'Firestore batch commit failed' };
  }
}

export async function writeModuleToFirestoreRest(fbCfg, moduleKey, moduleData, meta = {}) {
  if (!fbCfg?.projectId || !fbCfg?.apiKey || !isCmsModuleKey(moduleKey)) {
    return { ok: false, error: 'Missing Firebase config or valid moduleKey' };
  }
  return writeBatchToFirestoreRest(fbCfg, { [moduleKey]: moduleData }, meta);
}

export async function writeSiteConfigToFirestoreRest(fbCfg, siteConfig, env = {}) {
  if (!fbCfg?.projectId || !fbCfg?.apiKey || !siteConfig || typeof siteConfig !== 'object') {
    return { ok: false, error: 'Missing Firebase config or payload' };
  }

  // Strip secrets cleanly before writing to client-accessible Firestore documents
  const safeCopy = sanitizeConfigForClientEdge(siteConfig, env);
  safeCopy.updatedAt = siteConfig.updatedAt || Date.now();

  const dbId = encodeURIComponent(fbCfg.databaseId || '(default)');
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    fbCfg.projectId
  )}/databases/${dbId}/documents/siteConfig/main?key=${encodeURIComponent(fbCfg.apiKey)}`;

  try {
    const fields = {};
    for (const [k, v] of Object.entries(safeCopy)) {
      if (v !== undefined) fields[k] = encodeFirestoreValue(v);
    }
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return { ok: false, error: errBody?.error?.message || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || 'Firestore write failed' };
  }
}

export function buildEdgeEnvDiagnostics(
  adminCreds,
  fbEnv,
  env = {},
  includeFirebaseConfig = false,
  siteConfig = null
) {
  const vaultSecretCustom = Boolean(
    cleanEnvVal(env.VAULT_ENCRYPTION_SECRET) ||
    cleanEnvVal(env.LINK_VAULT_MASTER_SECRET) ||
    cleanEnvVal(env.AES_KEY) ||
    cleanEnvVal(env.AES_SECRET) ||
    cleanEnvVal(env.VAULT_SECRET_KEY) ||
    cleanEnvVal(env.HMAC_SECRET)
  );
  const turnstileSiteKey =
    cleanEnvVal(env.VITE_TURNSTILE_SITE_KEY) ||
    cleanEnvVal(env.TURNSTILE_SITE_KEY) ||
    cleanEnvVal(env.CF_TURNSTILE_SITE_KEY) ||
    cleanEnvVal(siteConfig?.securityGate?.turnstileSiteKey);
  const turnstileSecretKey =
    cleanEnvVal(env.TURNSTILE_SECRET_KEY) ||
    cleanEnvVal(env.VITE_TURNSTILE_SECRET_KEY) ||
    cleanEnvVal(env.CF_TURNSTILE_SECRET_KEY) ||
    cleanEnvVal(siteConfig?.securityGate?.turnstileSecretKey);
  const githubToken =
    cleanEnvVal(env.GITHUB_FINE_GRAINED_TOKEN) ||
    cleanEnvVal(env.GITHUB_TOKEN) ||
    cleanEnvVal(env.GH_TOKEN);

  return {
    isProduction: adminCreds.policy?.isProduction ?? false,
    adminEmailConfigured: adminCreds.isCustomEmail,
    adminPasswordConfigured: adminCreds.isCustomPassword,
    adminApiKeyRequired: adminCreds.requiresApiKey,
    adminSessionSecretCustom: adminCreds.isCustomSecret,
    vaultSecretCustom,
    turnstileSiteKeyConfigured: Boolean(turnstileSiteKey),
    turnstileSecretKeyConfigured: Boolean(
      turnstileSecretKey || siteConfig?.securityGate?.hasTurnstileSecretKey
    ),
    githubTokenConfigured: Boolean(
      githubToken || siteConfig?.githubConfig?.fineGrainedToken || siteConfig?.githubConfig?.hasFineGrainedToken
    ),
    firebaseEnvConfigured: fbEnv.isConfigured,
    firebaseProjectId: fbEnv.config?.projectId || null,
    ...(includeFirebaseConfig
      ? { firebaseConfig: sanitizeFirebaseConfigForClientEdge(fbEnv.config) }
      : {}),
    runtime: 'Cloudflare Pages Functions'
  };
}

// ============================================================================
// AES-256-GCM Link Vault & 7-Gate Edge Cryptography
// ============================================================================

export function resolveVaultSecretFromEnv(env = {}) {
  const candidates = [
    env.VAULT_ENCRYPTION_SECRET,
    env.LINK_VAULT_MASTER_SECRET,
    env.AES_KEY,
    env.AES_SECRET,
    env.VAULT_SECRET_KEY,
    env.VITE_AES_SECRET,
    env.HMAC_SECRET,
    env.ADMIN_SESSION_SECRET,
    env.ADMIN_SECRET
  ];
  for (const raw of candidates) {
    const cleaned = cleanEnvVal(raw);
    if (cleaned.length >= 8) return cleaned;
  }
  return DEFAULT_VAULT_SECRET;
}

async function deriveAesKey(secret) {
  const hashBuf = await crypto.subtle.digest('SHA-256', textEncoder.encode(secret));
  return crypto.subtle.importKey(
    'raw',
    hashBuf,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptVaultValueWeb(plaintext, env = {}) {
  const clean = String(plaintext || '').trim();
  if (!clean) return '';
  if (clean.startsWith('v2.')) return clean;
  const secret = resolveVaultSecretFromEnv(env);
  const key = await deriveAesKey(secret);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    textEncoder.encode(clean)
  );
  return `v2.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(cipherBuf))}`;
}

export async function decryptVaultValueWeb(cipherOrPlain, env = {}) {
  const raw = String(cipherOrPlain || '').trim();
  if (!raw) return '';
  if (!raw.startsWith('v2.')) return raw;

  const parts = raw.split('.');
  if (parts.length !== 3) return '';
  const iv = base64UrlToBytes(parts[1]);
  const cipherBytes = base64UrlToBytes(parts[2]);
  if (!iv || !cipherBytes || iv.byteLength !== 12) return '';

  const secretsToTry = [
    resolveVaultSecretFromEnv(env),
    cleanEnvVal(env.ADMIN_SESSION_SECRET),
    DEFAULT_VAULT_SECRET
  ].filter((s, idx, arr) => s && arr.indexOf(s) === idx);

  for (const sec of secretsToTry) {
    try {
      const key = await deriveAesKey(sec);
      const plainBuf = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        cipherBytes
      );
      const decoded = textDecoder.decode(plainBuf).trim();
      if (decoded) return decoded;
    } catch {
      // Try next secret
    }
  }
  return '';
}

export function isValidDestinationUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed === '#' || trimmed.startsWith('javascript:') || trimmed.startsWith('data:')) {
    return false;
  }
  if (trimmed.startsWith('/')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

const UA_BLACKLIST = [
  'curl/', 'wget/', 'python', 'urllib', 'requests', 'httpx', 'aiohttp',
  'scrapy', 'axios', 'httpclient', 'go-http-client', 'okhttp', 'guzzle',
  'node-fetch', 'postman', 'insomnia', 'headlesschrome', 'puppeteer',
  'playwright', 'selenium', 'phantomjs', 'webdriver', 'cypress',
  'crawler', 'spider', 'scraper', 'ahrefsbot', 'semrushbot', 'dotbot',
  'mj12bot', 'petalbot', 'bytespider', 'gptbot', 'claudebot',
  'perplexitybot', 'googlebot', 'bingbot', 'yandexbot', 'baiduspider'
];

const HOSTING_ASNS = new Set([
  16509, 14618, 15169, 396982, 8075, 13335, 20473, 14061,
  16276, 24940, 63949, 45102, 132203, 9009, 212238
]);

export function evaluateGateG1Edge(request, env = {}, policyMode = 'universal_human') {
  const ua = (request.headers.get('user-agent') || '').trim();
  if (ua.length < 10) return { pass: false, reason: 'ua_short' };

  const uaLower = ua.toLowerCase();
  const host = (request.headers.get('host') || '').toLowerCase().split(':')[0];
  const isLocalUniversal = (host === 'localhost' || host === '127.0.0.1') && policyMode === 'universal_human';

  for (const tok of UA_BLACKLIST) {
    if (isLocalUniversal && (tok === 'headlesschrome' || tok === 'playwright')) continue;
    if (uaLower.includes(tok)) return { pass: false, reason: 'ua_blacklist' };
  }

  if (policyMode === 'strict_mobile_only') {
    const isIpadDesktop = /Macintosh/.test(ua) && /Mobile\//.test(ua) && /Safari\//.test(ua);
    if (!/Android|iPhone|iPad|iPod/i.test(ua) && !isIpadDesktop) {
      return { pass: false, reason: 'non_mobile_ua' };
    }
    if (/Windows|CrOS|X11|Linux\s+(x86_64|i[3-6]86)/i.test(ua) || (/Macintosh/.test(ua) && !isIpadDesktop)) {
      return { pass: false, reason: 'desktop_ua_token' };
    }
  }

  const asn = Number(request.cf?.asn || 0);
  if (asn && HOSTING_ASNS.has(asn)) {
    return { pass: false, reason: 'hosting_asn' };
  }

  return { pass: true };
}

export function getEdgeDidSecret(env = {}) {
  return (
    cleanEnvVal(env.DID_HMAC_SECRET) ||
    cleanEnvVal(env.GATE_SIGNING_SECRET) ||
    cleanEnvVal(env.NONCE_HMAC_SECRET) ||
    cleanEnvVal(env.VAULT_ENCRYPTION_SECRET) ||
    cleanEnvVal(env.ADMIN_SESSION_SECRET) ||
    'default-v12-did-hmac-fallback-secret-32-bytes'
  );
}

export async function issueStatelessNonceEdge(appId, env = {}) {
  const secret =
    cleanEnvVal(env.NONCE_HMAC_SECRET) ||
    cleanEnvVal(env.GATE_SIGNING_SECRET) ||
    cleanEnvVal(env.ADMIN_SESSION_SECRET) ||
    cleanEnvVal(env.VAULT_ENCRYPTION_SECRET) ||
    'default-v12-nonce-hmac-fallback-secret-32-bytes';

  const rnd = new Uint8Array(16);
  crypto.getRandomValues(rnd);
  const nid = Array.from(rnd).map((b) => b.toString(16).padStart(2, '0')).join('');
  const issuedAtMs = String(Date.now());
  const sig = await hmacTruncated16B64Url(secret, `${nid}|${issuedAtMs}|${appId}`);
  return `${nid}.${issuedAtMs}.${sig}`;
}

export async function verifyStatelessNonceEdge(nonce, appId, env = {}) {
  if (!nonce || typeof nonce !== 'string') return { valid: false };
  const parts = nonce.split('.');
  if (parts.length !== 3) return { valid: false };
  const [nid, issuedStr, sig] = parts;
  if (!/^[0-9a-f]{32}$/.test(nid) || !/^\d{10,15}$/.test(issuedStr) || !sig) {
    return { valid: false };
  }
  const issuedAtMs = Number(issuedStr);
  if (!Number.isFinite(issuedAtMs) || issuedAtMs <= 0) return { valid: false };

  const candidates = [
    cleanEnvVal(env.NONCE_HMAC_SECRET),
    cleanEnvVal(env.GATE_SIGNING_SECRET),
    cleanEnvVal(env.ADMIN_SESSION_SECRET),
    cleanEnvVal(env.VAULT_ENCRYPTION_SECRET),
    'default-v12-nonce-hmac-fallback-secret-32-bytes'
  ].filter((s, idx, arr) => s && arr.indexOf(s) === idx);

  for (const sec of candidates) {
    const expected = await hmacTruncated16B64Url(sec, `${nid}|${issuedStr}|${appId}`);
    if (timingSafeEqual(sig, expected)) {
      return { valid: true, nid, issuedAtMs };
    }
  }
  return { valid: false };
}

export async function verifyOrMintDidCookieEdge(request, env = {}) {
  const secret = getEdgeDidSecret(env);
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = parseCookies(cookieHeader);
  const raw = cookies['__Host-rd_did'] || cookies['rd_did'] || '';
  if (raw && raw.indexOf('.') === 32) {
    const hex = raw.slice(0, 32);
    const sig = raw.slice(33);
    if (/^[0-9a-f]{32}$/.test(hex) && sig) {
      const expected = await hmacTruncated16B64Url(secret, hex);
      if (timingSafeEqual(sig, expected)) {
        return { did: hex, setCookie: null };
      }
    }
  }

  const host = (request.headers.get('host') || '').toLowerCase().split(':')[0];
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  const rnd = new Uint8Array(16);
  crypto.getRandomValues(rnd);
  const did = Array.from(rnd).map((b) => b.toString(16).padStart(2, '0')).join('');
  const sig = await hmacTruncated16B64Url(secret, did);
  const name = isLocal ? 'rd_did' : '__Host-rd_did';
  const secAttr = isLocal ? '' : ' Secure;';
  const setCookie = `${name}=${did}.${sig};${secAttr} HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`;
  return { did, setCookie };
}

const edgeNonceBurnMap = new Map();

export async function burnSingleUseNonceEdge(nid, env = {}) {
  const upUrl = cleanEnvVal(env.UPSTASH_REDIS_REST_URL);
  const upToken = cleanEnvVal(env.UPSTASH_REDIS_REST_TOKEN);
  if (upUrl && upToken && upUrl.startsWith('http')) {
    try {
      const endpoint = upUrl.endsWith('/') ? `${upUrl}pipeline` : `${upUrl}/pipeline`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${upToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([['SET', `nonce:${nid}`, '1', 'EX', 600, 'NX']])
      });
      if (res.ok) {
        const data = await res.json();
        return data?.[0]?.result === 'OK';
      }
    } catch {
      // Fall back to isolate cache
    }
  }

  const now = Date.now();
  for (const [k, exp] of edgeNonceBurnMap.entries()) {
    if (now > exp) edgeNonceBurnMap.delete(k);
  }
  if (edgeNonceBurnMap.has(nid)) return false;
  edgeNonceBurnMap.set(nid, now + 600000);
  return true;
}
