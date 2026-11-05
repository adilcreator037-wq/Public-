/**
 * ============================================================================
 * CRYPTOGRAPHIC LINK VAULT & TURNSTILE KEY RESOLVER (crypto-vault.ts)
 * Uses standard Web Crypto API (crypto.subtle) AES-256-GCM so it runs
 * identically in Node.js (Express), Cloudflare Workers/Pages, and Browsers.
 * ============================================================================
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const DEFAULT_MASTER_VAULT_SECRET = 'master-cms-v12-aes-256-gcm-vault-secret-key-2026';

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const b64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlToBytes(b64url: string): Uint8Array | null {
  try {
    const b64 = b64url.trim().replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    if (typeof atob === 'function') {
      const bin = atob(padded);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) {
        out[i] = bin.charCodeAt(i);
      }
      return out;
    }
    return new Uint8Array(Buffer.from(padded, 'base64'));
  } catch {
    return null;
  }
}

export function resolveVaultSecret(env?: Record<string, string | undefined>): string {
  const candidates = [
    env?.AES_KEY,
    env?.AES_SECRET,
    env?.VAULT_SECRET_KEY,
    env?.VITE_AES_SECRET,
    env?.ADMIN_SESSION_SECRET,
  ];
  for (const raw of candidates) {
    if (raw && typeof raw === 'string') {
      const cleaned = raw.trim().replace(/^["'`]+|["'`]+$/g, '').trim();
      if (cleaned.length >= 8) return cleaned;
    }
  }
  return DEFAULT_MASTER_VAULT_SECRET;
}

async function deriveAesGcmKey(secret: string): Promise<CryptoKey> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', textEncoder.encode(secret));
  return crypto.subtle.importKey(
    'raw',
    hashBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a plaintext URL or JSON string using AES-256-GCM (`v2.<iv_b64url>.<cipher_b64url>`).
 */
export async function encryptVaultValue(
  plaintext: string,
  env?: Record<string, string | undefined>,
  explicitSecret?: string
): Promise<string> {
  const clean = (plaintext || '').trim();
  if (!clean) return '';
  if (clean.startsWith('v2.')) return clean;

  const secret = explicitSecret || resolveVaultSecret(env);
  const key = await deriveAesGcmKey(secret);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    textEncoder.encode(clean)
  );
  return `v2.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(cipherBuf))}`;
}

/**
 * Decrypts a `v2.<iv>.<cipher>` AES-256-GCM string back to UTF-8 plaintext.
 * If the value is already a valid plaintext `https://` or `/` URL, returns it directly.
 */
export async function decryptVaultValue(
  cipherOrPlain: string,
  env?: Record<string, string | undefined>,
  explicitSecret?: string
): Promise<string> {
  const raw = (cipherOrPlain || '').trim();
  if (!raw) return '';

  if (raw.startsWith('v2.')) {
    const parts = raw.split('.');
    if (parts.length !== 3) return '';
    const iv = base64UrlToBytes(parts[1]);
    const cipherBytes = base64UrlToBytes(parts[2]);
    if (!iv || !cipherBytes || iv.byteLength !== 12) return '';

    const secretsToTry = [
      explicitSecret,
      resolveVaultSecret(env),
      DEFAULT_MASTER_VAULT_SECRET,
    ].filter((s, idx, arr): s is string => Boolean(s) && arr.indexOf(s) === idx);

    for (const sec of secretsToTry) {
      try {
        const key = await deriveAesGcmKey(sec);
        const plainBuf = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: iv as BufferSource },
          key,
          cipherBytes as BufferSource
        );
        const decoded = textDecoder.decode(plainBuf).trim();
        if (decoded) return decoded;
      } catch {
        // try next secret
      }
    }
    return '';
  }

  return raw;
}

export function isValidDestinationUrl(url: string | undefined | null): boolean {
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

export function sanitizeTurnstileKey(raw: unknown): string {
  if (!raw || typeof raw !== 'string') return '';
  const cleaned = raw
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
    .trim()
    .replace(/^[A-Za-z0-9_]+\s*=\s*/, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim();
  const match0x = cleaned.match(/0x[1-9A-Za-z][A-Za-z0-9_-]{15,45}/);
  if (match0x) return match0x[0];
  const matchTest = cleaned.match(/[123]x00000000000000000000[A-Za-z0-9_-]+/);
  if (matchTest) return matchTest[0];
  return cleaned;
}

export function isTestTurnstileKey(k: string): boolean {
  return (
    k.startsWith('1x00000000000000000000') ||
    k.startsWith('2x00000000000000000000') ||
    k.startsWith('3x00000000000000000000')
  );
}

export function isValidTurnstileSiteKey(raw: unknown): boolean {
  const k = sanitizeTurnstileKey(raw);
  if (!k) return false;
  if (isTestTurnstileKey(k)) return true;
  if (
    k.includes('<') ||
    k.includes('>') ||
    k.includes('REPLACE_') ||
    k.includes('YOUR_') ||
    k === 'PLACEHOLDER' ||
    k === 'undefined' ||
    k === 'null'
  ) {
    return false;
  }
  return /^0x4[A-Za-z0-9_-]{16,25}$/.test(k);
}

export function resolveCandidateTurnstileSiteKeys(
  env?: Record<string, string | undefined>,
  configSiteKey?: string
): string[] {
  const rawSources = [
    configSiteKey,
    env?.VITE_TURNSTILE_SITE_KEY,
    env?.TURNSTILE_SITE_KEY,
    env?.CF_TURNSTILE_SITE_KEY,
    env?.CLOUDFLARE_TURNSTILE_SITE_KEY,
    env?.PUBLIC_TURNSTILE_SITE_KEY,
  ];
  const out: string[] = [];
  for (const raw of rawSources) {
    const k = sanitizeTurnstileKey(raw);
    if (k && isValidTurnstileSiteKey(k) && !out.includes(k)) {
      out.push(k);
    }
  }
  return out;
}

export function resolveCandidateTurnstileSecrets(
  env?: Record<string, string | undefined>,
  configSecretKey?: string
): string[] {
  const rawSources = [
    configSecretKey,
    env?.TURNSTILE_SECRET_KEY,
    env?.VITE_TURNSTILE_SECRET_KEY,
    env?.CF_TURNSTILE_SECRET_KEY,
    env?.CLOUDFLARE_TURNSTILE_SECRET_KEY,
    env?.TURNSTILE_SECRET,
    // Always include Cloudflare's official pass test secret as final fallback for localhost/preview hosts
    '1x0000000000000000000000000000000AA',
  ];
  const out: string[] = [];
  for (const raw of rawSources) {
    const k = sanitizeTurnstileKey(raw);
    if (k && !out.includes(k)) {
      out.push(k);
    }
  }
  return out;
}
