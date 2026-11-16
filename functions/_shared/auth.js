/**
 * Shared Cloudflare Pages Functions Authentication, Vault Cryptography,
 * 7-Gate Security Engine, and Firestore REST Helper
 * Uses standard Web Crypto (crypto.subtle) native to Cloudflare Workers edge.
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const DEFAULT_VAULT_SECRET = 'master-cms-v12-aes-256-gcm-vault-secret-key-2026';

export function cleanEnvVal(val) {
  if (!val) return '';
  return String(val)
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim();
}

export function getAdminCredentials(env = {}) {
  const email =
    cleanEnvVal(env.ADMIN_EMAIL) ||
    cleanEnvVal(env.ADMIN_USER) ||
    cleanEnvVal(env.ADMIN_USERNAME) ||
    cleanEnvVal(env.CMS_ADMIN_EMAIL) ||
    'admin@domain.com';

  const password =
    cleanEnvVal(env.ADMIN_PASSWORD) ||
    cleanEnvVal(env.ADMIN_PASS) ||
    cleanEnvVal(env.CMS_ADMIN_PASSWORD) ||
    'admin123';

  const apiKey =
    cleanEnvVal(env.ADMIN_API_KEY) ||
    cleanEnvVal(env.CMS_ADMIN_API_KEY) ||
    '';

  const secret =
    cleanEnvVal(env.ADMIN_SESSION_SECRET) ||
    cleanEnvVal(env.ADMIN_SECRET) ||
    cleanEnvVal(env.SESSION_SECRET) ||
    'master-cms-hmac-secret-2026';

  const isCustomEmail = Boolean(
    cleanEnvVal(env.ADMIN_EMAIL) ||
    cleanEnvVal(env.ADMIN_USER) ||
    cleanEnvVal(env.ADMIN_USERNAME) ||
    cleanEnvVal(env.CMS_ADMIN_EMAIL)
  );

  const isCustomPassword = Boolean(
    cleanEnvVal(env.ADMIN_PASSWORD) ||
    cleanEnvVal(env.ADMIN_PASS) ||
    cleanEnvVal(env.CMS_ADMIN_PASSWORD)
  );

  const isCustomSecret = Boolean(
    cleanEnvVal(env.ADMIN_SESSION_SECRET) ||
    cleanEnvVal(env.ADMIN_SECRET) ||
    cleanEnvVal(env.SESSION_SECRET)
  );

  return {
    email,
    password,
    apiKey,
    secret,
    isCustomEmail,
    isCustomPassword,
    isCustomSecret,
    requiresApiKey: Boolean(apiKey)
  };
}

export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = textEncoder.encode(a);
  const bufB = textEncoder.encode(b);
  if (bufA.byteLength !== bufB.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < bufA.byteLength; i++) {
    diff |= bufA[i] ^ bufB[i];
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

export async function createAdminToken(email, secret) {
  const payload = {
    email,
    role: 'Master Administrator',
    iat: Date.now(),
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000
  };
  const b64Payload = bytesToBase64Url(textEncoder.encode(JSON.stringify(payload)));
  const signature = await createHmacSignature(secret, b64Payload);
  return `${b64Payload}.${signature}`;
}

export async function verifyAdminToken(token, secret, expectedApiKey = '') {
  if (!token || typeof token !== 'string') return { valid: false };

  if (expectedApiKey && timingSafeEqual(token.trim(), expectedApiKey.trim())) {
    return { valid: true, email: 'api-key-admin' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) return { valid: false };
  const [b64Payload, signature] = parts;

  try {
    const expectedSig = await createHmacSignature(secret, b64Payload);
    if (!timingSafeEqual(signature, expectedSig)) {
      return { valid: false };
    }

    const jsonStr = base64UrlToUtf8(b64Payload);
    if (!jsonStr) return { valid: false };
    const decoded = JSON.parse(jsonStr);
    if (decoded.exp && Date.now() > decoded.exp) {
      return { valid: false, expired: true };
    }
    return { valid: true, email: decoded.email, role: decoded.role || 'admin' };
  } catch {
    return { valid: false };
  }
}

export async function verifyAdminRequest(request, env = {}) {
  const authHeader = request.headers.get('authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const headerApiKey = cleanEnvVal(request.headers.get('x-admin-api-key'));
  const adminCreds = getAdminCredentials(env);
  const verification = await verifyAdminToken(
    bearerToken || headerApiKey,
    adminCreds.secret,
    adminCreds.apiKey
  );
  return { verification, adminCreds };
}

export function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-api-key',
      ...extraHeaders
    }
  });
}

// ============================================================================
// Firebase Env & Firestore REST API Helpers (Edge-Native)
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
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    fbCfg.projectId
  )}/databases/${dbId}/documents/siteConfig/main?key=${encodeURIComponent(fbCfg.apiKey)}`;

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const docData = await res.json();
    if (!docData?.fields) return null;
    const out = {};
    for (const [k, v] of Object.entries(docData.fields)) {
      out[k] = decodeFirestoreValue(v);
    }
    return out;
  } catch {
    return null;
  }
}

export async function writeSiteConfigToFirestoreRest(fbCfg, siteConfig) {
  if (!fbCfg?.projectId || !fbCfg?.apiKey || !siteConfig || typeof siteConfig !== 'object') {
    return { ok: false, error: 'Missing Firebase config or payload' };
  }
  const dbId = encodeURIComponent(fbCfg.databaseId || '(default)');
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    fbCfg.projectId
  )}/databases/${dbId}/documents/siteConfig/main?key=${encodeURIComponent(fbCfg.apiKey)}`;

  try {
    const fields = {};
    for (const [k, v] of Object.entries(siteConfig)) {
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
    adminEmailConfigured: adminCreds.isCustomEmail,
    adminPasswordConfigured: adminCreds.isCustomPassword,
    adminApiKeyRequired: adminCreds.requiresApiKey,
    adminSessionSecretCustom: adminCreds.isCustomSecret,
    vaultSecretCustom,
    turnstileSiteKeyConfigured: Boolean(turnstileSiteKey),
    turnstileSecretKeyConfigured: Boolean(turnstileSecretKey),
    githubTokenConfigured: Boolean(githubToken),
    firebaseEnvConfigured: fbEnv.isConfigured,
    firebaseProjectId: fbEnv.config?.projectId || null,
    ...(includeFirebaseConfig ? { firebaseConfig: fbEnv.config } : {}),
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
  const cookies = {};
  for (const pair of cookieHeader.split(';')) {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      cookies[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
    }
  }
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
