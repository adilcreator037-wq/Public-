/**
 * Shared Cloudflare Pages Functions Authentication & Cryptography Helper
 * Uses standard Web Crypto (crypto.subtle) native to Cloudflare Workers edge.
 */

export function cleanEnvVal(val) {
  if (!val) return '';
  return String(val)
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
    env.ADMIN_EMAIL ||
    env.ADMIN_USER ||
    env.ADMIN_USERNAME ||
    env.CMS_ADMIN_EMAIL
  );

  const isCustomPassword = Boolean(
    env.ADMIN_PASSWORD ||
    env.ADMIN_PASS ||
    env.CMS_ADMIN_PASSWORD
  );

  return {
    email,
    password,
    apiKey,
    secret,
    isCustomEmail,
    isCustomPassword,
    requiresApiKey: Boolean(apiKey)
  };
}

export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  if (bufA.byteLength !== bufB.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < bufA.byteLength; i++) {
    diff |= bufA[i] ^ bufB[i];
  }
  return diff === 0;
}

function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToUtf8(base64url) {
  let b64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) {
    b64 += '=';
  }
  return atob(b64);
}

export async function createHmacSignature(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return bufferToBase64Url(signature);
}

export async function createAdminToken(email, secret) {
  const payload = {
    email,
    role: 'Master Administrator',
    iat: Date.now(),
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days valid
  };
  const enc = new TextEncoder();
  const b64Payload = bufferToBase64Url(enc.encode(JSON.stringify(payload)));
  const signature = await createHmacSignature(secret, b64Payload);
  return `${b64Payload}.${signature}`;
}

export async function verifyAdminToken(token, secret, expectedApiKey = '') {
  if (!token || typeof token !== 'string') return { valid: false };

  // Check if token matches raw ADMIN_API_KEY
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
    const decoded = JSON.parse(jsonStr);
    if (decoded.exp && Date.now() > decoded.exp) {
      return { valid: false, expired: true };
    }
    return { valid: true, email: decoded.email, role: decoded.role || 'admin' };
  } catch {
    return { valid: false };
  }
}

export function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-api-key',
      ...extraHeaders
    }
  });
}
