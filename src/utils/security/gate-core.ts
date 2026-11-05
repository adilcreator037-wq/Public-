/**
 * ============================================================================
 * 7-GATE SEQUENTIAL SECURITY & CLEARANCE ENGINE (gate-core.ts)
 * Implements:
 * - Step 1: POST /api/v1/app/session-init (Gate G1 + G2 -> Signed Nonce + Cookie + SiteKey)
 * - Step 2: POST /api/v1/app/session-clearance (7 Sequential Gates:
 *   G1 Edge/ASN/UA -> G2 Burst -> G3 TokenV12/Nonce/Dwell -> G4 Device Truth & hw ->
 *   G5 Physical Gesture -> G6 Atomic Nonce Burn + Turnstile siteverify & cData ->
 *   G7 Late AES-256-GCM Decrypt & Ephemeral URL Dispatch)
 * ============================================================================
 */

import {
  TURNSTILE_ACTION,
  TOKEN_V,
  NONCE_TTL_MS,
  NONCE_BURN_TTL_S,
  DWELL_HARD_BELOW_MS,
  MIN_SERVER_DWELL_MS,
  DWELL_NV0_MIN_MS,
  INIT_RATE_DEVICE,
  INIT_RATE_NET,
  CLEARANCE_BURST,
  QUARANTINE_HARD_S,
  NET_FLOOD_HARD,
  NET_COOLDOWN_S,
  SOFT_STRIKES_DEVICE,
  SOFT_STRIKES_NET,
  SITEVERIFY_TIMEOUT_MS,
  REQUEST_BODY_MAX_BYTES,
  HARD_PAD_MS,
  APP_DAILY_ISSUE_CAP_DEFAULT,
  DID_COOKIE,
  DID_COOKIE_FALLBACK,
  DID_COOKIE_MAX_AGE_S,
  DEFAULT_ALLOWED_HOSTNAMES,
  HOSTING_ASNS,
  HOSTING_ORG_KEYWORDS,
  NEVER_BLOCK_ASNS,
  TEXT_PHYSICS_DENYLIST,
  DEFAULT_SIGNAL_MODES,
  HARD_RESPONSE_STATUS,
  HARD_RESPONSE_BODY,
  type BrowserFamily,
  type DevicePolicyMode,
  type SignalMode,
  type TokenV12,
} from './gate-config';

import {
  decryptVaultValue,
  isValidDestinationUrl,
  resolveCandidateTurnstileSiteKeys,
  resolveCandidateTurnstileSecrets,
  bytesToBase64Url,
} from './crypto-vault';

import type { SiteConfig } from '../cms-types';

export interface GateRequestContext {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  rawBody: string;
  ip: string;
  cf?: {
    asn?: number;
    asOrganization?: string;
    httpProtocol?: string;
    tlsVersion?: string;
  };
  adapter: 'cloudflare' | 'express' | 'vercel';
  env: Record<string, string | undefined>;
  siteConfig?: SiteConfig;
}

export interface GateResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

// ============================================================================
// Isolate / In-Memory Fast Caches & Local Dev Redis Fallback
// ============================================================================

const isolateQuarantineCache = new Map<string, number>();
let cachedSignalModes: { modes: Record<string, SignalMode>; expiresAt: number } | null = null;

interface LocalMemEntry {
  val: string;
  expiresAt: number;
}
const localMemRedis = new Map<string, LocalMemEntry>();

function cleanLocalKey(key: string): LocalMemEntry | undefined {
  const entry = localMemRedis.get(key);
  if (entry && entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
    localMemRedis.delete(key);
    return undefined;
  }
  return entry;
}

export function clearLocalSecurityRedisForTests(): void {
  localMemRedis.clear();
  isolateQuarantineCache.clear();
}

function execLocalCommand(cmd: (string | number)[]): unknown {
  const op = String(cmd[0] || '').toUpperCase();
  const key = String(cmd[1] || '');
  const now = Date.now();

  if (op === 'GET') {
    const e = cleanLocalKey(key);
    return e ? e.val : null;
  }
  if (op === 'SET') {
    const val = String(cmd[2] ?? '');
    let ttlMs = 0;
    let nx = false;
    for (let i = 3; i < cmd.length; i++) {
      const token = String(cmd[i]).toUpperCase();
      if (token === 'EX' && cmd[i + 1] !== undefined) {
        ttlMs = Number(cmd[i + 1]) * 1000;
        i++;
      } else if (token === 'PX' && cmd[i + 1] !== undefined) {
        ttlMs = Number(cmd[i + 1]);
        i++;
      } else if (token === 'NX') {
        nx = true;
      }
    }
    const existing = cleanLocalKey(key);
    if (nx && existing) {
      return null;
    }
    localMemRedis.set(key, {
      val,
      expiresAt: ttlMs > 0 ? now + ttlMs : 0,
    });
    return 'OK';
  }
  if (op === 'INCR' || op === 'INCRBY') {
    const delta = op === 'INCRBY' ? Number(cmd[2] ?? 1) : 1;
    const existing = cleanLocalKey(key);
    const nextVal = (existing ? Number(existing.val) || 0 : 0) + delta;
    localMemRedis.set(key, {
      val: String(nextVal),
      expiresAt: existing ? existing.expiresAt : 0,
    });
    return nextVal;
  }
  if (op === 'EXPIRE') {
    const seconds = Number(cmd[2] ?? 0);
    const nxt = String(cmd[3] ?? '').toUpperCase();
    const existing = cleanLocalKey(key);
    if (!existing) return 0;
    if (nxt === 'NX' && existing.expiresAt > 0) return 0;
    existing.expiresAt = now + seconds * 1000;
    return 1;
  }
  if (op === 'PEXPIRE') {
    const ms = Number(cmd[2] ?? 0);
    const nxt = String(cmd[3] ?? '').toUpperCase();
    const existing = cleanLocalKey(key);
    if (!existing) return 0;
    if (nxt === 'NX' && existing.expiresAt > 0) return 0;
    existing.expiresAt = now + ms;
    return 1;
  }
  if (op === 'DEL') {
    let deleted = 0;
    for (let i = 1; i < cmd.length; i++) {
      if (localMemRedis.delete(String(cmd[i] || ''))) deleted++;
    }
    return deleted;
  }
  return null;
}

async function runRedisPipeline(
  commands: (string | number)[][],
  env: Record<string, string | undefined>
): Promise<{ ok: boolean; results: unknown[] }> {
  const url = (env.UPSTASH_REDIS_REST_URL || '').trim().replace(/^["'`]+|["'`]+$/g, '').trim();
  const token = (env.UPSTASH_REDIS_REST_TOKEN || '').trim().replace(/^["'`]+|["'`]+$/g, '').trim();

  if (!url || !token || !url.startsWith('http')) {
    const results = commands.map((c) => execLocalCommand(c));
    return { ok: true, results };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const endpoint = url.endsWith('/') ? `${url}pipeline` : `${url}/pipeline`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
      signal: controller.signal,
    });
    if (!res.ok) {
      const results = commands.map((c) => execLocalCommand(c));
      return { ok: true, results };
    }
    const data = (await res.json()) as Array<{ result?: unknown; error?: string }>;
    if (!Array.isArray(data) || data.some((d) => d && typeof d.error === 'string')) {
      const results = commands.map((c) => execLocalCommand(c));
      return { ok: true, results };
    }
    return { ok: true, results: data.map((d) => d.result) };
  } catch {
    const results = commands.map((c) => execLocalCommand(c));
    return { ok: true, results };
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// Web Crypto Primitives
// ============================================================================

const textEncoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

function base64UrlToUtf8(input: string): string | null {
  try {
    const trimmed = input.trim();
    if (trimmed.startsWith('{')) return trimmed;
    const b64 = trimmed.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    if (typeof atob === 'function') {
      const bin = atob(padded);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    }
    return Buffer.from(padded, 'base64').toString('utf-8');
  } catch {
    return null;
  }
}

export async function sha256HexServer(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', textEncoder.encode(input));
  return bytesToHex(new Uint8Array(buf));
}

async function hmacSha256Truncated16B64Url(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, textEncoder.encode(message));
  return bytesToBase64Url(new Uint8Array(sig).slice(0, 16));
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBytes = textEncoder.encode(a);
  const bBytes = textEncoder.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

function randomHex16Bytes(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return bytesToHex(arr);
}

// ============================================================================
// Standard Envelopes, Headers & Counter Helpers
// ============================================================================

function baseSecurityHeaders(setCookie?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, private, max-age=0',
    'CDN-Cache-Control': 'no-store, private',
    'Cloudflare-CDN-Cache-Control': 'no-store, private',
    Pragma: 'no-cache',
    Expires: '0',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
  };
  if (setCookie) {
    headers['Set-Cookie'] = setCookie;
  }
  return headers;
}

export function hard404Response(): GateResponse {
  return {
    status: HARD_RESPONSE_STATUS,
    headers: baseSecurityHeaders(),
    body: HARD_RESPONSE_BODY,
  };
}

async function paddedHard404Response(): Promise<GateResponse> {
  const [minMs, maxMs] = HARD_PAD_MS;
  const delay = minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
  await new Promise((r) => setTimeout(r, delay));
  return hard404Response();
}

function softRetryResponse(opts?: { reload?: 1; setCookie?: string }): GateResponse {
  const payload = opts?.reload === 1 ? { status: 'retry', reload: 1 } : { status: 'retry' };
  return {
    status: 200,
    headers: baseSecurityHeaders(opts?.setCookie),
    body: JSON.stringify(payload),
  };
}

function getUtcDateStamp(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function emitGateCounter(
  env: Record<string, string | undefined>,
  gate: string,
  signal: string,
  outcome: 'pass' | 'fail',
  family: string
): void {
  if (outcome === 'pass' && Math.random() >= 0.1) return;
  const inc = outcome === 'pass' ? 10 : 1;
  const dateStr = getUtcDateStamp();
  const key = `gate:${gate}:${signal}:${outcome}:${dateStr}:${family || 'unknown'}`;
  const ttlS = 14 * 86400;
  void runRedisPipeline(
    [
      ['INCRBY', key, inc],
      ['EXPIRE', key, ttlS],
    ],
    env
  );
}

// ============================================================================
// Derived Keys & Cookie Helpers
// ============================================================================

export function computeIpKey(rawIp: string): string {
  const ip = (rawIp || '0.0.0.0').trim();
  if (ip.includes(':')) {
    const parts = ip.split(':');
    return parts.slice(0, 4).join(':') + '::/64';
  }
  return ip;
}

export async function computeNetKey(
  rawIp: string,
  ua: string,
  acceptLang: string
): Promise<string> {
  const ipKey = computeIpKey(rawIp);
  const h = await sha256HexServer(`${ipKey} ${ua} ${acceptLang}`);
  return h.slice(0, 32);
}

function cleanEnvVal(raw: unknown): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw.trim().replace(/^["'`]+|["'`]+$/g, '').trim();
}

function getDidSecret(env: Record<string, string | undefined>): string {
  const s =
    cleanEnvVal(env.DID_HMAC_SECRET) ||
    cleanEnvVal(env.GATE_SIGNING_SECRET) ||
    cleanEnvVal(env.NONCE_HMAC_SECRET) ||
    cleanEnvVal(env.ADMIN_SESSION_SECRET) ||
    cleanEnvVal(env.AES_KEY) ||
    cleanEnvVal(env.AES_SECRET);
  if (s) return s;
  return 'default-v12-did-hmac-fallback-secret-32-bytes';
}

function getNonceSecrets(env: Record<string, string | undefined>): string[] {
  const out: string[] = [];
  const add = (val: unknown) => {
    const c = cleanEnvVal(val);
    if (c && !out.includes(c)) out.push(c);
  };
  add(env.NONCE_HMAC_SECRET);
  add(env.GATE_SIGNING_SECRET);
  add(env.NONCE_HMAC_SECRET_PREVIOUS);
  add(env.ADMIN_SESSION_SECRET);
  add(env.DID_HMAC_SECRET);
  add(env.AES_KEY);
  if (out.length === 0) {
    out.push('default-v12-nonce-hmac-fallback-secret-32-bytes');
  }
  return out;
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const pair of cookieHeader.split(';')) {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      out[k] = v;
    }
  }
  return out;
}

export async function verifyDidCookie(
  cookieHeader: string | undefined,
  env: Record<string, string | undefined>
): Promise<string | null> {
  const secret = getDidSecret(env);
  if (!secret) return null;
  const cookies = parseCookies(cookieHeader);
  const raw = cookies[DID_COOKIE] || cookies[DID_COOKIE_FALLBACK];
  if (!raw) return null;
  const dotIdx = raw.indexOf('.');
  if (dotIdx !== 32) return null;
  const hex = raw.slice(0, 32);
  const sig = raw.slice(33);
  if (!/^[0-9a-f]{32}$/.test(hex) || !sig) return null;
  const expected = await hmacSha256Truncated16B64Url(secret, hex);
  if (!timingSafeEqualStr(sig, expected)) return null;
  return hex;
}

export async function mintDidCookie(
  env: Record<string, string | undefined>,
  isLocalHttp = false
): Promise<{ did: string; setCookie: string } | null> {
  const secret = getDidSecret(env);
  if (!secret) return null;
  const did = randomHex16Bytes();
  const sig = await hmacSha256Truncated16B64Url(secret, did);
  const val = `${did}.${sig}`;
  const cookieName = isLocalHttp ? DID_COOKIE_FALLBACK : DID_COOKIE;
  const secureAttr = isLocalHttp ? '' : ' Secure;';
  const setCookie = `${cookieName}=${val};${secureAttr} HttpOnly; SameSite=Lax; Path=/; Max-Age=${DID_COOKIE_MAX_AGE_S}`;
  return { did, setCookie };
}

export async function issueStatelessNonce(
  appId: string,
  env: Record<string, string | undefined>,
  explicitSecret?: string
): Promise<string | null> {
  const secrets = explicitSecret ? [explicitSecret] : getNonceSecrets(env);
  const primary = secrets[0];
  if (!primary) return null;
  const nid = randomHex16Bytes();
  const issuedAtMs = String(Date.now());
  const sig = await hmacSha256Truncated16B64Url(primary, `${nid}|${issuedAtMs}|${appId}`);
  return `${nid}.${issuedAtMs}.${sig}`;
}

export async function verifyStatelessNonce(
  nonce: string,
  appId: string,
  env: Record<string, string | undefined>
): Promise<{ valid: true; nid: string; issuedAtMs: number } | { valid: false }> {
  if (!nonce || typeof nonce !== 'string') return { valid: false };
  const parts = nonce.split('.');
  if (parts.length !== 3) return { valid: false };
  const [nid, issuedStr, sig] = parts;
  if (!/^[0-9a-f]{32}$/.test(nid) || !/^\d{10,15}$/.test(issuedStr) || !sig) {
    return { valid: false };
  }
  const issuedAtMs = Number(issuedStr);
  if (!Number.isFinite(issuedAtMs) || issuedAtMs <= 0) return { valid: false };

  const secrets = getNonceSecrets(env);
  for (const secret of secrets) {
    const expected = await hmacSha256Truncated16B64Url(secret, `${nid}|${issuedStr}|${appId}`);
    if (timingSafeEqualStr(sig, expected)) {
      return { valid: true, nid, issuedAtMs };
    }
  }
  return { valid: false };
}

// ============================================================================
// Gate G1 — Edge, ASN, Transport, OS & Header Coherence
// ============================================================================

const UA_BLACKLIST_TOKENS = [
  'curl/',
  'wget/',
  'python',
  'urllib',
  'requests',
  'httpx',
  'aiohttp',
  'scrapy',
  'axios',
  'httpclient',
  'go-http-client',
  'okhttp',
  'guzzle',
  'node-fetch',
  'postman',
  'insomnia',
  'headlesschrome',
  'puppeteer',
  'playwright',
  'selenium',
  'phantomjs',
  'webdriver',
  'cypress',
  'crawler',
  'spider',
  'scraper',
  'ahrefsbot',
  'semrushbot',
  'dotbot',
  'mj12bot',
  'petalbot',
  'bytespider',
  'gptbot',
  'claudebot',
  'perplexitybot',
  'googlebot',
  'bingbot',
  'yandexbot',
  'baiduspider',
];

export function classifyUA(ua: string): BrowserFamily {
  const isIpadDesktopMode = /Macintosh/.test(ua) && /Mobile\//.test(ua) && /Safari\//.test(ua);
  if (/iPhone|iPad|iPod/.test(ua) || isIpadDesktopMode) {
    if (/CriOS\//.test(ua)) return 'ios-chrome';
    if (/FxiOS\//.test(ua)) return 'ios-firefox';
    if ((/Version\//.test(ua) || isIpadDesktopMode) && /Safari\//.test(ua) && !/EdgiOS\/|OPiOS\//.test(ua)) {
      return 'ios-safari';
    }
    return 'ios-inapp';
  }
  if (/Android/i.test(ua)) {
    if (/; wv\)/.test(ua)) return 'android-webview';
    if (/SamsungBrowser\//.test(ua)) return 'android-samsung';
    if (/EdgA\//.test(ua)) return 'android-edge';
    if (/Firefox\//.test(ua)) return 'android-firefox';
    if (
      /Chrome\//.test(ua) &&
      !/SamsungBrowser|EdgA|OPR\/|OPT\/|UCBrowser|MiuiBrowser|HeyTapBrowser|Vivaldi|YaBrowser|; wv\)/.test(ua)
    ) {
      return 'android-chrome';
    }
    return 'android-other';
  }
  return 'desktop-browser';
}

function getAllowedHostnames(env: Record<string, string | undefined>): Set<string> {
  const raw = env.ALLOWED_HOSTNAMES || DEFAULT_ALLOWED_HOSTNAMES.join(',');
  const set = new Set<string>(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  const pubDomain = (env.PUBLIC_DOMAIN || env.VITE_PUBLIC_DOMAIN || '').trim();
  if (pubDomain) {
    try {
      const parsedHost = new URL(
        pubDomain.startsWith('http') ? pubDomain : `https://${pubDomain}`
      ).hostname.toLowerCase();
      const bare = parsedHost.replace(/^www\./, '');
      if (bare && bare !== 'localhost' && bare !== '127.0.0.1') {
        set.add(bare);
        set.add(`www.${bare}`);
      }
    } catch {
      // ignore invalid URL
    }
  }
  return set;
}

export function resolveDevicePolicyMode(ctx: GateRequestContext): DevicePolicyMode {
  const cfgMode = ctx.siteConfig?.securityGate?.devicePolicyMode;
  if (cfgMode === 'strict_mobile_only' || cfgMode === 'universal_human') {
    return cfgMode;
  }
  const envMode = (ctx.env?.SECURITY_DEVICE_POLICY || '').trim().toLowerCase();
  if (envMode === 'strict_mobile_only') return 'strict_mobile_only';
  return 'universal_human';
}

export function evaluateGateG1(
  ctx: GateRequestContext
): { pass: true; family: BrowserFamily } | { pass: false; reason: string; family: string } {
  const h = ctx.headers || {};
  const env = ctx.env || {};
  const policyMode = resolveDevicePolicyMode(ctx);

  // 1. Host Allowlist
  const rawHost = (h['x-forwarded-host'] || h['host'] || '').split(',')[0].trim().toLowerCase();
  const hostname = rawHost.split(':')[0];
  if (!hostname || !/^[a-z0-9.-]+$/.test(hostname)) {
    return { pass: false, reason: 'bad_host', family: 'unknown' };
  }
  const allowedHosts = getAllowedHostnames(env);
  const isStrictHostMode = env.STRICT_HOST_CHECK === '1' && allowedHosts.size > 0;
  if (isStrictHostMode && !allowedHosts.has(hostname)) {
    return { pass: false, reason: 'bad_host', family: 'unknown' };
  }

  // 2. Origin Auth
  const expectedCfAuth = (env.X_CF_AUTH_SECRET || '').trim();
  const providedCfAuth = h['x-cf-auth'];
  let trustedForwardedCf = false;

  if (ctx.adapter !== 'cloudflare') {
    if (expectedCfAuth) {
      if (providedCfAuth !== undefined || env.STRICT_ORIGIN_AUTH === '1') {
        if (!providedCfAuth || !timingSafeEqualStr(providedCfAuth, expectedCfAuth)) {
          return { pass: false, reason: 'origin_auth', family: 'unknown' };
        }
        trustedForwardedCf = true;
      }
    } else if (providedCfAuth !== undefined) {
      return { pass: false, reason: 'origin_auth', family: 'unknown' };
    }
  } else {
    trustedForwardedCf = true;
  }

  // 3. UA Blacklist & Floor
  const ua = (h['user-agent'] || '').trim();
  if (ua.length < 10) {
    return { pass: false, reason: 'ua_short', family: 'unknown' };
  }
  const uaLower = ua.toLowerCase();
  const isLocalUniversalPreview =
    (hostname === 'localhost' || hostname === '127.0.0.1') && policyMode === 'universal_human';
  for (const token of UA_BLACKLIST_TOKENS) {
    if (isLocalUniversalPreview && (token === 'headlesschrome' || token === 'playwright')) {
      continue;
    }
    if (uaLower.includes(token)) {
      return { pass: false, reason: 'ua_blacklist', family: 'unknown' };
    }
  }

  // 4. Device Policy Check ('strict_mobile_only' vs 'universal_human')
  if (policyMode === 'strict_mobile_only') {
    const isIpadDesktopMode = /Macintosh/.test(ua) && /Mobile\//.test(ua) && /Safari\//.test(ua);
    if (!/Android|iPhone|iPad|iPod/i.test(ua) && !isIpadDesktopMode) {
      return { pass: false, reason: 'non_mobile_ua', family: 'unknown' };
    }
    if (
      /Windows|CrOS|X11|Linux\s+(x86_64|i[3-6]86)/i.test(ua) ||
      (/Macintosh/.test(ua) && !isIpadDesktopMode)
    ) {
      return { pass: false, reason: 'desktop_ua_token', family: 'unknown' };
    }

    const chMobile = (h['sec-ch-ua-mobile'] || '').trim();
    const chPlatRaw = (h['sec-ch-ua-platform'] || '').trim().replace(/^"|"$/g, '');

    if (chMobile === '?0') {
      return { pass: false, reason: 'ch_mobile_0', family: 'unknown' };
    }
    if (
      /^(Windows|Chrome OS|Chromium OS|Linux)$/i.test(chPlatRaw) ||
      (chPlatRaw.toLowerCase() === 'macos' && !isIpadDesktopMode)
    ) {
      return { pass: false, reason: 'ch_desktop_platform', family: 'unknown' };
    }
  }

  const family = classifyUA(ua);

  // 5. ASN & Hosting Organization (Strictly block Cloud Servers & Datacenters with 404; NEVER_BLOCK_ASNS protects mobile carriers)
  const asn =
    ctx.cf?.asn ??
    (trustedForwardedCf && h['x-cf-asn'] ? Number(h['x-cf-asn']) : undefined);
  const asOrg = (
    ctx.cf?.asOrganization ||
    (trustedForwardedCf ? h['x-cf-as-org'] : '') ||
    ''
  ).toLowerCase();

  if (asn && Number.isFinite(asn) && !NEVER_BLOCK_ASNS.has(asn)) {
    if (HOSTING_ASNS.has(asn) || (asOrg && HOSTING_ORG_KEYWORDS.some((kw) => asOrg.includes(kw)))) {
      return { pass: false, reason: 'hosting_asn', family };
    }
  }

  // 6. Header Coherence
  const secFetchSite = (h['sec-fetch-site'] || '').trim().toLowerCase();
  const secFetchMode = (h['sec-fetch-mode'] || '').trim().toLowerCase();

  if (secFetchSite && !['same-origin', 'same-site', 'none', 'cross-site'].includes(secFetchSite)) {
    return { pass: false, reason: 'sec_fetch_mismatch', family };
  }
  if (secFetchMode && !['cors', 'navigate', 'same-origin', 'no-cors'].includes(secFetchMode)) {
    return { pass: false, reason: 'sec_fetch_mismatch', family };
  }

  // 7. Transport Floor
  const httpProto =
    ctx.cf?.httpProtocol || (trustedForwardedCf ? h['x-cf-http-proto'] : undefined);
  if (httpProto && !/^(HTTP\/1\.1|HTTP\/2|HTTP\/3|h2|h3)$/i.test(httpProto.trim())) {
    return { pass: false, reason: 'http_proto_floor', family };
  }

  const tlsVer = ctx.cf?.tlsVersion || (trustedForwardedCf ? h['x-cf-tls'] : undefined);
  if (tlsVer && !/^(TLSv1\.2|TLSv1\.3)$/i.test(tlsVer.trim())) {
    return { pass: false, reason: 'tls_floor', family };
  }

  return { pass: true, family };
}

// ============================================================================
// Quarantine, Net Flood & Soft Strikes Helpers
// ============================================================================

async function recordHardFailure(
  did: string | null,
  netKey: string,
  env: Record<string, string | undefined>,
  quarantineDevice: boolean
): Promise<void> {
  const cmds: (string | number)[][] = [];
  if (quarantineDevice && did) {
    isolateQuarantineCache.set(did, Date.now() + QUARANTINE_HARD_S * 1000);
    cmds.push(['SET', `quarantine:${did}`, '1', 'EX', QUARANTINE_HARD_S, 'NX']);
  }
  if (!did) {
    cmds.push(['INCR', `netflood:${netKey}`]);
    cmds.push(['EXPIRE', `netflood:${netKey}`, NET_FLOOD_HARD.windowS]);
  }
  if (cmds.length === 0) return;

  const pipe = await runRedisPipeline(cmds, env);
  if (!did && pipe.ok) {
    const floodCount = Number(pipe.results[pipe.results.length - 2] ?? 0);
    if (floodCount >= NET_FLOOD_HARD.limit) {
      await runRedisPipeline(
        [['SET', `netcool:${netKey}`, '1', 'EX', NET_COOLDOWN_S, 'NX']],
        env
      );
    }
  }
}

async function recordSoftStrike(
  did: string | null,
  netKey: string,
  env: Record<string, string | undefined>
): Promise<void> {
  if (did) {
    const pipe = await runRedisPipeline(
      [
        ['INCR', `softstrike:did:${did}`],
        ['EXPIRE', `softstrike:did:${did}`, SOFT_STRIKES_DEVICE.windowS],
      ],
      env
    );
    if (pipe.ok && Number(pipe.results[0] ?? 0) >= SOFT_STRIKES_DEVICE.limit) {
      await runRedisPipeline(
        [['SET', `softcool:did:${did}`, '1', 'EX', SOFT_STRIKES_DEVICE.cooldownS, 'NX']],
        env
      );
    }
  } else {
    const pipe = await runRedisPipeline(
      [
        ['INCR', `softstrike:net:${netKey}`],
        ['EXPIRE', `softstrike:net:${netKey}`, SOFT_STRIKES_NET.windowS],
      ],
      env
    );
    if (pipe.ok && Number(pipe.results[0] ?? 0) >= SOFT_STRIKES_NET.limit) {
      await runRedisPipeline(
        [['SET', `netcool:${netKey}`, '1', 'EX', SOFT_STRIKES_NET.cooldownS, 'NX']],
        env
      );
    }
  }
}

async function getSignalModes(
  env: Record<string, string | undefined>
): Promise<Record<string, SignalMode>> {
  const now = Date.now();
  if (cachedSignalModes && now < cachedSignalModes.expiresAt) {
    return cachedSignalModes.modes;
  }
  const modes = { ...DEFAULT_SIGNAL_MODES };
  const pipe = await runRedisPipeline([['GET', 'cfg:signal_modes']], env);
  if (pipe.ok && typeof pipe.results[0] === 'string' && pipe.results[0]) {
    try {
      const parsed = JSON.parse(pipe.results[0]);
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) {
          if (v === 'enforce' || v === 'shadow') {
            modes[k] = v;
          }
        }
      }
    } catch {
      // Keep default signal modes
    }
  }
  cachedSignalModes = { modes, expiresAt: now + 30000 };
  return modes;
}

// ============================================================================
// Step 1 — POST /api/v1/app/session-init (G1 + G2 -> Nonce + Cookie + SiteKey)
// ============================================================================

export async function handleSessionInit(ctx: GateRequestContext): Promise<GateResponse> {
  if (ctx.method.toUpperCase() !== 'POST') {
    return hard404Response();
  }

  const ua = (ctx.headers['user-agent'] || '').trim();
  const acceptLang = (ctx.headers['accept-language'] || '').trim();
  const netKey = await computeNetKey(ctx.ip, ua, acceptLang);

  // Gate G1
  const g1 = evaluateGateG1(ctx);
  if (g1.pass === false) {
    emitGateCounter(ctx.env, 'G1', g1.reason, 'fail', g1.family);
    await recordHardFailure(null, netKey, ctx.env, false);
    return hard404Response();
  }
  const family = g1.family;
  emitGateCounter(ctx.env, 'G1', 'edge', 'pass', family);

  // Body size & appId schema check
  if (textEncoder.encode(ctx.rawBody || '').byteLength > REQUEST_BODY_MAX_BYTES) {
    await recordHardFailure(null, netKey, ctx.env, false);
    return hard404Response();
  }

  let appId = '';
  try {
    const parsed = JSON.parse(ctx.rawBody || '{}');
    appId = typeof parsed?.appId === 'string' ? parsed.appId.trim() : '';
  } catch {
    await recordHardFailure(null, netKey, ctx.env, false);
    return hard404Response();
  }

  if (!/^[a-zA-Z0-9\-_]{1,64}$/.test(appId)) {
    await recordHardFailure(null, netKey, ctx.env, false);
    return hard404Response();
  }

  const rawHost = (ctx.headers['x-forwarded-host'] || ctx.headers['host'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .split(':')[0];
  const isLocalHttp = rawHost === 'localhost' || rawHost === '127.0.0.1';

  // Gate G2 — Read or mint __Host-rd_did / rd_did
  let did = await verifyDidCookie(ctx.headers['cookie'], ctx.env);
  let setCookieHeader: string | undefined;

  if (did) {
    isolateQuarantineCache.delete(did);
  } else {
    const minted = await mintDidCookie(ctx.env, isLocalHttp);
    if (minted) {
      did = minted.did;
      setCookieHeader = minted.setCookie;
    }
  }

  if (did) {
    const g2Pipe = await runRedisPipeline(
      [
        ['DEL', `quarantine:${did}`],
        ['DEL', `softcool:did:${did}`],
        ['INCR', `init:did:${did}`],
        ['EXPIRE', `init:did:${did}`, INIT_RATE_DEVICE.windowS],
        ['INCR', `init:net:${netKey}`],
        ['EXPIRE', `init:net:${netKey}`, INIT_RATE_NET.windowS],
      ],
      ctx.env
    );
    if (g2Pipe.ok) {
      const [, , didInitCount, , netInitCount] = g2Pipe.results;
      if (
        Number(didInitCount ?? 0) > INIT_RATE_DEVICE.limit * 4 ||
        Number(netInitCount ?? 0) > INIT_RATE_NET.limit * 4
      ) {
        emitGateCounter(ctx.env, 'G2', 'init_rate', 'fail', family);
        return softRetryResponse({ setCookie: setCookieHeader });
      }
    }
  }

  const nonce = await issueStatelessNonce(appId, ctx.env);
  if (!nonce) {
    emitGateCounter(ctx.env, 'G3', 'nonce_secret_missing', 'fail', family);
    return softRetryResponse({ setCookie: setCookieHeader });
  }

  emitGateCounter(ctx.env, 'G2', 'init', 'pass', family);
  const siteKeys = resolveCandidateTurnstileSiteKeys(
    ctx.env,
    ctx.siteConfig?.securityGate?.turnstileSiteKey
  );
  const siteKey = siteKeys[0] || '';
  const policyMode = resolveDevicePolicyMode(ctx);

  return {
    status: 200,
    headers: baseSecurityHeaders(setCookieHeader),
    body: JSON.stringify({
      nonce,
      siteKey: siteKey || undefined,
      siteKeys: siteKeys.length > 0 ? siteKeys : undefined,
      policyMode,
    }),
  };
}

// ============================================================================
// Step 2 — POST /api/v1/app/session-clearance (7 Sequential Gates)
// ============================================================================

export async function handleSessionClearance(ctx: GateRequestContext): Promise<GateResponse> {
  if (ctx.method.toUpperCase() !== 'POST') {
    return hard404Response();
  }

  const ua = (ctx.headers['user-agent'] || '').trim();
  const acceptLang = (ctx.headers['accept-language'] || '').trim();
  const netKey = await computeNetKey(ctx.ip, ua, acceptLang);
  const policyMode = resolveDevicePolicyMode(ctx);

  // --------------------------------------------------------------------------
  // Gate G1 — Edge, ASN, Transport, OS & Header Coherence (< 0.1 ms, HARD)
  // --------------------------------------------------------------------------
  const g1 = evaluateGateG1(ctx);
  if (g1.pass === false) {
    emitGateCounter(ctx.env, 'G1', g1.reason, 'fail', g1.family);
    await recordHardFailure(null, netKey, ctx.env, false);
    return hard404Response();
  }
  const family = g1.family;
  emitGateCounter(ctx.env, 'G1', 'edge', 'pass', family);

  // --------------------------------------------------------------------------
  // Gate G2 — Per-Device Burst Protection (< 1 ms)
  // --------------------------------------------------------------------------
  const did = await verifyDidCookie(ctx.headers['cookie'], ctx.env);
  const setCookieHeader: string | undefined = undefined;

  if (did) {
    const g2Pipe = await runRedisPipeline(
      [
        ['INCR', `burst2s:did:${did}`],
        ['PEXPIRE', `burst2s:did:${did}`, CLEARANCE_BURST.hardWindowMs],
        ['INCR', `burst10s:did:${did}`],
        ['EXPIRE', `burst10s:did:${did}`, CLEARANCE_BURST.softWindowS],
      ],
      ctx.env
    );
    if (g2Pipe.ok) {
      const [burst2s, , burst10s] = g2Pipe.results;
      if (
        Number(burst2s ?? 0) > CLEARANCE_BURST.hardCount * 2 ||
        Number(burst10s ?? 0) > CLEARANCE_BURST.softCount * 2
      ) {
        emitGateCounter(ctx.env, 'G2', 'burst_soft', 'fail', family);
        return softRetryResponse();
      }
    }
  } else {
    const g2Pipe = await runRedisPipeline(
      [
        ['INCR', `burst2s:net:${netKey}`],
        ['PEXPIRE', `burst2s:net:${netKey}`, CLEARANCE_BURST.hardWindowMs],
        ['INCR', `burst10s:net:${netKey}`],
        ['EXPIRE', `burst10s:net:${netKey}`, CLEARANCE_BURST.softWindowS],
      ],
      ctx.env
    );
    if (g2Pipe.ok) {
      const [burst2s, , burst10s] = g2Pipe.results;
      if (
        Number(burst2s ?? 0) > CLEARANCE_BURST.hardCount * 3 ||
        Number(burst10s ?? 0) > CLEARANCE_BURST.softCount * 3
      ) {
        emitGateCounter(ctx.env, 'G2', 'burst_net_soft', 'fail', family);
        return softRetryResponse();
      }
    }
  }
  emitGateCounter(ctx.env, 'G2', 'burst', 'pass', family);

  // --------------------------------------------------------------------------
  // Gate G3 — Token, Nonce & Server Dwell (< 1 ms)
  // --------------------------------------------------------------------------
  if (
    !ctx.rawBody ||
    textEncoder.encode(ctx.rawBody).byteLength > REQUEST_BODY_MAX_BYTES
  ) {
    emitGateCounter(ctx.env, 'G3', 'body_size', 'fail', family);
    await recordHardFailure(did, netKey, ctx.env, false);
    return paddedHard404Response();
  }

  let bodyObj: { token?: unknown; cf?: unknown };
  try {
    bodyObj = JSON.parse(ctx.rawBody);
  } catch {
    emitGateCounter(ctx.env, 'G3', 'body_json', 'fail', family);
    await recordHardFailure(did, netKey, ctx.env, false);
    return paddedHard404Response();
  }

  if (
    !bodyObj ||
    typeof bodyObj.token !== 'string' ||
    !bodyObj.token.trim() ||
    typeof bodyObj.cf !== 'string' ||
    !bodyObj.cf.trim()
  ) {
    emitGateCounter(ctx.env, 'G3', 'missing_fields', 'fail', family);
    await recordHardFailure(did, netKey, ctx.env, false);
    return paddedHard404Response();
  }

  const cfToken = bodyObj.cf.trim();
  const decodedTokenStr = base64UrlToUtf8(bodyObj.token);
  if (!decodedTokenStr) {
    emitGateCounter(ctx.env, 'G3', 'token_b64', 'fail', family);
    await recordHardFailure(did, netKey, ctx.env, false);
    return paddedHard404Response();
  }

  let token: Partial<TokenV12> & Record<string, any>;
  try {
    token = JSON.parse(decodedTokenStr);
  } catch {
    emitGateCounter(ctx.env, 'G3', 'token_json', 'fail', family);
    await recordHardFailure(did, netKey, ctx.env, false);
    return paddedHard404Response();
  }

  if (!token || typeof token !== 'object' || typeof token.v !== 'number') {
    emitGateCounter(ctx.env, 'G3', 'token_schema', 'fail', family);
    await recordHardFailure(did, netKey, ctx.env, false);
    return paddedHard404Response();
  }

  // Version check: v !== TOKEN_V => SOFT with reload: 1
  if (token.v !== TOKEN_V) {
    emitGateCounter(ctx.env, 'G3', 'token_version', 'fail', family);
    await recordSoftStrike(did, netKey, ctx.env);
    return softRetryResponse({ reload: 1 });
  }

  const appId = typeof token.id === 'string' ? token.id.trim() : '';
  const nonceStr = typeof token.nonce === 'string' ? token.nonce.trim() : '';
  const nv = token.nv;
  const hardRaw = token.hard;
  const softRaw = token.soft;
  const tap = token.tap;
  const flags = token.f;

  if (
    !/^[a-zA-Z0-9\-_]{1,64}$/.test(appId) ||
    !nonceStr ||
    (nv !== 0 && nv !== 1) ||
    typeof hardRaw !== 'string' ||
    !hardRaw ||
    typeof softRaw !== 'string' ||
    !softRaw ||
    !tap ||
    typeof tap !== 'object' ||
    !flags ||
    typeof flags !== 'object'
  ) {
    emitGateCounter(ctx.env, 'G3', 'token_schema_fields', 'fail', family);
    await recordHardFailure(did, netKey, ctx.env, false);
    return paddedHard404Response();
  }

  // Verify nonce HMAC in constant time
  const nonceCheck = await verifyStatelessNonce(nonceStr, appId, ctx.env);
  if (!nonceCheck.valid) {
    emitGateCounter(ctx.env, 'G3', 'nonce_hmac', 'fail', family);
    await recordHardFailure(did, netKey, ctx.env, false);
    return paddedHard404Response();
  }
  const { nid, issuedAtMs } = nonceCheck;

  // Server-measured dwell time
  const dwell = Date.now() - issuedAtMs;
  if (dwell < 0 || dwell < DWELL_HARD_BELOW_MS) {
    emitGateCounter(ctx.env, 'G3', 'dwell_hard', 'fail', family);
    await recordHardFailure(did, netKey, ctx.env, false);
    return paddedHard404Response();
  }
  if (dwell > NONCE_TTL_MS) {
    emitGateCounter(ctx.env, 'G3', 'nonce_expired', 'fail', family);
    await recordSoftStrike(did, netKey, ctx.env);
    return softRetryResponse({ setCookie: setCookieHeader });
  }
  if (dwell < MIN_SERVER_DWELL_MS) {
    emitGateCounter(ctx.env, 'G3', 'dwell_soft', 'fail', family);
    await recordSoftStrike(did, netKey, ctx.env);
    return softRetryResponse({ setCookie: setCookieHeader });
  }
  if (nv === 0 && dwell < DWELL_NV0_MIN_MS) {
    emitGateCounter(ctx.env, 'G3', 'dwell_nv0', 'fail', family);
    await recordSoftStrike(did, netKey, ctx.env);
    return softRetryResponse({ setCookie: setCookieHeader });
  }

  // Flags check: wb=0, hl=0, cb=0, tr=1, and dk=0 if strict_mobile_only
  const dkFailed = policyMode === 'strict_mobile_only' && flags.dk !== 0;
  if (
    flags.wb !== 0 ||
    flags.hl !== 0 ||
    dkFailed ||
    flags.cb !== 0 ||
    flags.tr !== 1
  ) {
    emitGateCounter(ctx.env, 'G3', 'flags', 'fail', family);
    await recordHardFailure(did, netKey, ctx.env, true);
    return paddedHard404Response();
  }
  emitGateCounter(ctx.env, 'G3', 'token', 'pass', family);

  // --------------------------------------------------------------------------
  // Gate G4 — Device Truth (< 1 ms)
  // --------------------------------------------------------------------------
  let hardObj: Record<string, any>;
  let softObj: Record<string, any>;
  try {
    hardObj = JSON.parse(hardRaw);
    softObj = JSON.parse(softRaw);
  } catch {
    emitGateCounter(ctx.env, 'G4', 'env_json', 'fail', family);
    await recordHardFailure(did, netKey, ctx.env, false);
    return paddedHard404Response();
  }

  const expectedHardKeys = ['arch', 'dm', 'plat', 'sa', 'ud', 'udp', 'vend', 'wc'];
  const expectedSoftKeys = ['gl', 'gpu', 'mdl', 'mp', 'tp', 'tx'];
  if (
    !hardObj ||
    typeof hardObj !== 'object' ||
    !expectedHardKeys.every((k) => k in hardObj) ||
    !softObj ||
    typeof softObj !== 'object' ||
    !expectedSoftKeys.every((k) => k in softObj)
  ) {
    emitGateCounter(ctx.env, 'G4', 'env_keys', 'fail', family);
    await recordHardFailure(did, netKey, ctx.env, false);
    return paddedHard404Response();
  }

  const signalModes = await getSignalModes(ctx.env);

  const plat = String(hardObj.plat ?? '');
  const arch = String(hardObj.arch ?? '');
  const gpu = String(softObj.gpu ?? '');
  const hasVerifiedMobileTouch =
    tap.pt === 'touch' && Number(tap.mtp) >= 1 && tap.coarse === 1;

  if (policyMode === 'strict_mobile_only') {
    const isSoftwareRenderer = /SwiftShader|llvmpipe|softpipe|VirtualBox|VMware/i.test(gpu);
    if (isSoftwareRenderer) {
      emitGateCounter(ctx.env, 'G4', 'G4-A-software-gpu', 'fail', family);
      await recordHardFailure(did, netKey, ctx.env, false);
      return paddedHard404Response();
    }
    const isMobileGpu =
      /Xclipse|Samsung|Adreno|Mali|Immortalis|Apple|PowerVR|RDNA|Qualcomm|Exynos|MediaTek|Vivante|Tegra/i.test(
        gpu
      );
    const isDesktopRadeon = !isMobileGpu && /Radeon/i.test(gpu);
    const isDesktopAppleM =
      /Apple M[1-4]/i.test(gpu) && !family.startsWith('ios-') && !hasVerifiedMobileTouch;
    const isDesktopIntel = /Intel\(R\) (UHD|Iris|HD Graphics)/i.test(gpu);
    const isDesktopDedicatedGpu = /GeForce|RTX|GTX/i.test(gpu);
    const isDesktopLinuxPlat = /^Linux (x86|i[3-6]86)/i.test(plat);
    const isDesktopX86Arch = /^x86/i.test(arch);

    if (
      /^(Win|CrOS)/i.test(plat) ||
      isDesktopLinuxPlat ||
      (/^Mac/i.test(plat) && !family.startsWith('ios-')) ||
      isDesktopX86Arch ||
      isDesktopDedicatedGpu ||
      isDesktopRadeon ||
      isDesktopAppleM ||
      isDesktopIntel
    ) {
      emitGateCounter(ctx.env, 'G4', 'G4-A-base', 'fail', family);
      await recordHardFailure(did, netKey, ctx.env, false);
      return paddedHard404Response();
    }
  }

  // G4-D: Text physics denylist check
  const tpSerialized = JSON.stringify(softObj.tp ?? []);
  const g4dOk = !TEXT_PHYSICS_DENYLIST.has(tpSerialized);
  emitGateCounter(ctx.env, 'G4', 'G4-D', g4dOk ? 'pass' : 'fail', family);
  if (!g4dOk && signalModes['G4-D'] === 'enforce') {
    await recordHardFailure(did, netKey, ctx.env, false);
    return paddedHard404Response();
  }

  // G4-E: Hardware commitment hash computed on raw hard string as received
  const hw = (await sha256HexServer(hardRaw)).slice(0, 24);
  emitGateCounter(ctx.env, 'G4', 'device_truth', 'pass', family);

  // --------------------------------------------------------------------------
  // Gate G5 — Touch & Pointer Invariants
  // --------------------------------------------------------------------------
  const evList = typeof tap.ev === 'string' ? tap.ev.split(',').map((s: string) => s.trim()) : [];
  const idxTs = evList.indexOf('ts');
  const idxTe = evList.indexOf('te');
  const idxPd = evList.indexOf('pd');
  const idxPu = evList.indexOf('pu');
  const idxCk = evList.indexOf('ck');
  const hasTsTeCk = idxTs !== -1 && idxTe !== -1 && idxCk !== -1 && idxTs < idxTe && idxTe < idxCk;
  const hasPdPuCk = idxPd !== -1 && idxPu !== -1 && idxCk !== -1 && idxPd < idxPu && idxPu < idxCk;

  const duration = Number(tap.d);
  const coordX = Number(tap.x);
  const coordY = Number(tap.y);
  const mtpCount = Number(tap.mtp);

  if (policyMode === 'strict_mobile_only') {
    if (tap.pt !== 'touch' || mtpCount < 1 || tap.coarse !== 1) {
      emitGateCounter(ctx.env, 'G5', 'touch_core', 'fail', family);
      await recordHardFailure(did, netKey, ctx.env, false);
      return paddedHard404Response();
    }
  }

  const g5CoreOk =
    (hasTsTeCk || (policyMode === 'universal_human' && hasPdPuCk)) &&
    Number.isFinite(duration) &&
    duration >= 1 &&
    duration <= 10000 &&
    Number.isFinite(coordX) &&
    coordX > 0 &&
    Number.isFinite(coordY) &&
    coordY > 0;

  if (!g5CoreOk) {
    emitGateCounter(ctx.env, 'G5', 'touch_gesture_retry', 'fail', family);
    return softRetryResponse();
  }
  emitGateCounter(ctx.env, 'G5', 'touch_core', 'pass', family);

  // --------------------------------------------------------------------------
  // Gate G6 — Atomic Nonce Burn FIRST, Then Turnstile siteverify & cData
  // --------------------------------------------------------------------------
  const burnPipe = await runRedisPipeline(
    [['SET', `nonce:${nid}`, '1', 'EX', NONCE_BURN_TTL_S, 'NX']],
    ctx.env
  );
  if (!burnPipe.ok) {
    emitGateCounter(ctx.env, 'G6', 'redis_burn_error', 'fail', family);
    return softRetryResponse();
  }
  if (burnPipe.results[0] !== 'OK') {
    // Nonce already burned => Replay attack! Immediately return 404
    emitGateCounter(ctx.env, 'G6', 'nonce_replay', 'fail', family);
    await recordHardFailure(did, netKey, ctx.env, false);
    return paddedHard404Response();
  }

  const rawHost = (ctx.headers['x-forwarded-host'] || ctx.headers['host'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .split(':')[0];

  const isNonProdHost =
    rawHost === 'localhost' ||
    rawHost === '127.0.0.1' ||
    rawHost === '[::1]' ||
    rawHost.endsWith('.run.app');

  if (
    cfToken.startsWith('HW_VERIFIED_MOBILE.') ||
    (!isNonProdHost && cfToken.includes('DUMMY.TOKEN'))
  ) {
    emitGateCounter(ctx.env, 'G6', 'synthetic_token_rejected', 'fail', family);
    await recordHardFailure(did, netKey, ctx.env, false);
    return paddedHard404Response();
  }

  const rawSecrets = resolveCandidateTurnstileSecrets(
    ctx.env,
    ctx.siteConfig?.securityGate?.turnstileSecretKey
  );
  const secretsToTry = isNonProdHost
    ? rawSecrets
    : rawSecrets.filter((s) => s && !s.startsWith('1x00000000000000000000'));

  if (secretsToTry.length === 0) {
    emitGateCounter(ctx.env, 'G6', 'secret_missing', 'fail', family);
    return softRetryResponse({ setCookie: setCookieHeader });
  }

  const svEndpoint =
    ctx.env.TURNSTILE_SITEVERIFY_URL ||
    'https://challenges.cloudflare.com/turnstile/v0/siteverify';

  interface TurnstileSiteverifyData {
    success?: boolean;
    action?: string;
    hostname?: string;
    cdata?: string;
    'error-codes'?: string[];
  }
  let svData: TurnstileSiteverifyData | null = null;
  let sawSoftTokenError = false;
  let sawNetworkOr5xxError = false;
  let sawSecretConfigError = false;

  if (isNonProdHost && cfToken === 'XXXX.DUMMY.TOKEN.XXXX') {
    svData = {
      success: true,
      action: TURNSTILE_ACTION,
      hostname: rawHost,
      cdata: `${appId}_${nid}_${hw}`
    };
  } else {
    for (let i = 0; i < secretsToTry.length; i++) {
      const candidateSecret = secretsToTry[i];
      const svController = new AbortController();
      const svTimer = setTimeout(() => svController.abort(), SITEVERIFY_TIMEOUT_MS);
      try {
        const svRes = await fetch(svEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            secret: candidateSecret,
            response: cfToken,
            remoteip: ctx.ip,
          }),
          signal: svController.signal,
        });
        if (svRes.status >= 500) {
          sawNetworkOr5xxError = true;
          continue;
        }
        const parsedSv = (await svRes.json()) as TurnstileSiteverifyData;
        svData = parsedSv;
        if (parsedSv?.success === true) {
          break;
        }
        const codes: string[] = Array.isArray(parsedSv?.['error-codes'])
          ? parsedSv['error-codes']!
          : [];
        if (codes.includes('timeout-or-duplicate') || codes.includes('internal-error')) {
          sawSoftTokenError = true;
        }
        if (codes.includes('invalid-input-secret') || codes.includes('missing-input-secret')) {
          sawSecretConfigError = true;
        }
      } catch {
        sawNetworkOr5xxError = true;
      } finally {
        clearTimeout(svTimer);
      }
    }
  }

  if (!svData || svData.success !== true) {
    if (sawSoftTokenError || sawNetworkOr5xxError || sawSecretConfigError) {
      emitGateCounter(ctx.env, 'G6', 'siteverify_soft_err', 'fail', family);
      await recordSoftStrike(did, netKey, ctx.env);
      return softRetryResponse({ setCookie: setCookieHeader });
    }
    emitGateCounter(ctx.env, 'G6', 'siteverify_hard_reject', 'fail', family);
    await recordHardFailure(did, netKey, ctx.env, false);
    return paddedHard404Response();
  }

  if (svData.action && svData.action !== TURNSTILE_ACTION) {
    emitGateCounter(ctx.env, 'G6', 'action_mismatch', 'fail', family);
    await recordHardFailure(did, netKey, ctx.env, false);
    return paddedHard404Response();
  }

  // Verify Turnstile cData hardware + nonce + appId commitment (`${appId}_${nid}_${hw}`)
  const svCdata = String(svData.cdata || '');
  if (svCdata) {
    if (svCdata.length < 58) {
      emitGateCounter(ctx.env, 'G6', 'cdata_short', 'fail', family);
      await recordHardFailure(did, netKey, ctx.env, false);
      return paddedHard404Response();
    }
    const cdataHw = svCdata.slice(-24);
    const sep2 = svCdata.slice(-25, -24);
    const cdataNid = svCdata.slice(-57, -25);
    const sep1 = svCdata.slice(-58, -57);
    const cdataAppId = svCdata.slice(0, -58);
    if (
      sep1 !== '_' ||
      sep2 !== '_' ||
      cdataAppId !== appId ||
      !timingSafeEqualStr(cdataNid, nid) ||
      !timingSafeEqualStr(cdataHw, hw)
    ) {
      emitGateCounter(ctx.env, 'G6', 'cdata_binding', 'fail', family);
      await recordHardFailure(did, netKey, ctx.env, false);
      return paddedHard404Response();
    }
  }
  emitGateCounter(ctx.env, 'G6', 'turnstile', 'pass', family);

  // --------------------------------------------------------------------------
  // Gate G7 — Late AES-256-GCM Decrypt & Dispatch (< 0.5 ms)
  // --------------------------------------------------------------------------
  const dateStamp = getUtcDateStamp();
  const gateCfg = ctx.siteConfig?.securityGate;
  const dailyCap = Number(
    gateCfg?.dailyIssueCap ?? ctx.env.APP_DAILY_ISSUE_CAP ?? APP_DAILY_ISSUE_CAP_DEFAULT
  );
  const unavailMsg =
    gateCfg?.unavailableMessage ||
    'The package link is currently not available. It will be updated soon by the admin.';

  if (gateCfg?.isPaused || gateCfg?.isComingSoon) {
    emitGateCounter(ctx.env, 'G7', 'paused_in_config', 'fail', family);
    return {
      status: 200,
      headers: baseSecurityHeaders(setCookieHeader),
      body: JSON.stringify({
        status: 'unavailable',
        message: unavailMsg,
      }),
    };
  }

  const g7Check = await runRedisPipeline(
    [
      ['GET', `paused:${appId}`],
      ['GET', `issued:${appId}:${dateStamp}`],
    ],
    ctx.env
  );
  if (g7Check.ok) {
    const [isPaused, issuedToday] = g7Check.results;
    if (
      isPaused === '1' ||
      isPaused === 'true' ||
      (dailyCap > 0 && Number(issuedToday ?? 0) >= dailyCap)
    ) {
      emitGateCounter(ctx.env, 'G7', 'paused_or_capped', 'fail', family);
      return {
        status: 200,
        headers: baseSecurityHeaders(setCookieHeader),
        body: JSON.stringify({
          status: 'unavailable',
          message: unavailMsg,
        }),
      };
    }
  }

  // Resolve and decrypt the protected download URL in RAM only now that Gates G1-G6 passed
  const rawStoredTarget =
    gateCfg?.encryptedPrimaryUrl ||
    gateCfg?.primaryDownloadUrl ||
    ctx.env.PROTECTED_DOWNLOAD_URL ||
    '';

  const decryptedUrl = await decryptVaultValue(rawStoredTarget, ctx.env);

  if (!isValidDestinationUrl(decryptedUrl)) {
    emitGateCounter(ctx.env, 'G7', 'unavailable', 'fail', family);
    return {
      status: 200,
      headers: baseSecurityHeaders(setCookieHeader),
      body: JSON.stringify({
        status: 'unavailable',
        message: unavailMsg,
      }),
    };
  }

  void runRedisPipeline(
    [
      ['INCR', `issued:${appId}:${dateStamp}`],
      ['EXPIRE', `issued:${appId}:${dateStamp}`, 172800],
    ],
    ctx.env
  );
  emitGateCounter(ctx.env, 'G7', 'issued', 'pass', family);

  return {
    status: 200,
    headers: baseSecurityHeaders(setCookieHeader),
    body: JSON.stringify({
      status: 'available',
      url: decryptedUrl,
    }),
  };
}
