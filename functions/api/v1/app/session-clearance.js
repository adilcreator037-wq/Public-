/**
 * Cloudflare Pages Function: POST /api/v1/app/session-clearance
 * Evaluates v12 7-Gate Sequential Clearance (Bot Filter, TokenV12, Nonce HMAC + Replay Burn,
 * Dwell, Hardware Commitment cData, Cloudflare Turnstile siteverify, AES-256-GCM RAM Decrypt).
 */

import {
  jsonResponse,
  cleanEnvVal,
  base64UrlToUtf8,
  sha256Hex,
  timingSafeEqual,
  getFirebaseEnvFromEnv,
  readSiteConfigFromFirestoreRest,
  evaluateGateG1Edge,
  verifyStatelessNonceEdge,
  burnSingleUseNonceEdge,
  decryptVaultValueWeb,
  isValidDestinationUrl
} from '../../../_shared/auth.js';

function hard404() {
  return jsonResponse({ error: 'Not Found' }, 404, {
    'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
    'Referrer-Policy': 'no-referrer'
  });
}

function softRetry(reload = false) {
  return jsonResponse(reload ? { status: 'retry', reload: 1 } : { status: 'retry' }, 200, {
    'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
    'Referrer-Policy': 'no-referrer'
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body = {};
  try {
    body = await request.json();
  } catch {
    return hard404();
  }

  const encodedToken = typeof body?.token === 'string' ? body.token.trim() : '';
  const cfToken = typeof body?.cf === 'string' ? body.cf.trim() : '';
  if (!encodedToken || !cfToken) {
    return hard404();
  }

  const decodedStr = base64UrlToUtf8(encodedToken);
  if (!decodedStr) return hard404();

  let token;
  try {
    token = JSON.parse(decodedStr);
  } catch {
    return hard404();
  }

  if (!token || typeof token !== 'object') return hard404();
  if (token.v !== 12) return softRetry(true);

  const appId = typeof token.id === 'string' ? token.id.trim() : '';
  const nonceStr = typeof token.nonce === 'string' ? token.nonce.trim() : '';
  const flags = token.f;
  const tap = token.tap;
  const hardRaw = token.hard;
  const softRaw = token.soft;

  if (
    !/^[a-zA-Z0-9\-_]{1,64}$/.test(appId) ||
    !nonceStr ||
    !flags ||
    typeof flags !== 'object' ||
    !tap ||
    typeof tap !== 'object' ||
    typeof hardRaw !== 'string' ||
    typeof softRaw !== 'string'
  ) {
    return hard404();
  }

  const fbEnv = getFirebaseEnvFromEnv(env);
  const siteConfig = fbEnv.isConfigured ? await readSiteConfigFromFirestoreRest(fbEnv.config, env) : null;
  const sec = siteConfig?.securityGate || {};
  const policyMode =
    sec.devicePolicyMode === 'strict_mobile_only' ||
    cleanEnvVal(env.SECURITY_DEVICE_POLICY).toLowerCase() === 'strict_mobile_only'
      ? 'strict_mobile_only'
      : 'universal_human';

  // Gate G1
  const g1 = evaluateGateG1Edge(request, env, policyMode);
  if (!g1.pass) return hard404();

  // Gate G3: Nonce HMAC & Server Dwell
  const nonceCheck = await verifyStatelessNonceEdge(nonceStr, appId, env);
  if (!nonceCheck.valid) return hard404();
  const { nid, issuedAtMs } = nonceCheck;

  const dwell = Date.now() - issuedAtMs;
  if (dwell < 0 || dwell < 350) return hard404();
  if (dwell > 600000 || dwell < 500) return softRetry(false);

  const dkFailed = policyMode === 'strict_mobile_only' && flags.dk !== 0;
  if (flags.wb !== 0 || flags.hl !== 0 || dkFailed || flags.cb !== 0 || flags.tr !== 1) {
    return hard404();
  }

  // Gate G4: Hardware commitment
  const hw = (await sha256Hex(hardRaw)).slice(0, 24);

  // Gate G5: Physical tap/pointer gesture check
  const evList = typeof tap.ev === 'string' ? tap.ev.split(',').map((s) => s.trim()) : [];
  const hasTsTeCk =
    evList.includes('ts') &&
    evList.includes('te') &&
    evList.includes('ck') &&
    evList.indexOf('ts') < evList.indexOf('te') &&
    evList.indexOf('te') < evList.indexOf('ck');
  const hasPdPuCk =
    evList.includes('pd') &&
    evList.includes('pu') &&
    evList.includes('ck') &&
    evList.indexOf('pd') < evList.indexOf('pu') &&
    evList.indexOf('pu') < evList.indexOf('ck');

  if (policyMode === 'strict_mobile_only' && (tap.pt !== 'touch' || Number(tap.mtp) < 1 || tap.coarse !== 1)) {
    return hard404();
  }
  if (!(hasTsTeCk || (policyMode === 'universal_human' && hasPdPuCk))) {
    return softRetry(false);
  }

  // Gate G6: Single-use nonce burn FIRST + Turnstile siteverify
  const burned = await burnSingleUseNonceEdge(nid, env);
  if (!burned) return hard404();

  const host = (request.headers.get('host') || '').toLowerCase().split(':')[0];
  const isNonProdHost = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.run.app');

  if (cfToken.startsWith('HW_VERIFIED_MOBILE.') || (!isNonProdHost && cfToken.includes('DUMMY.TOKEN'))) {
    return hard404();
  }

  const candidateSecrets = [
    cleanEnvVal(sec.turnstileSecretKey),
    cleanEnvVal(env.TURNSTILE_SECRET_KEY),
    cleanEnvVal(env.VITE_TURNSTILE_SECRET_KEY),
    cleanEnvVal(env.CF_TURNSTILE_SECRET_KEY),
    isNonProdHost ? '1x0000000000000000000000000000000AA' : ''
  ].filter((s, idx, arr) => s && arr.indexOf(s) === idx);

  let svPassed = false;
  let svData = null;

  if (isNonProdHost && cfToken === 'XXXX.DUMMY.TOKEN.XXXX') {
    svPassed = true;
    svData = { success: true, cdata: `${appId}_${nid}_${hw}` };
  } else if (candidateSecrets.length > 0) {
    const clientIp =
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-forwarded-for') ||
      '127.0.0.1';
    for (const secKey of candidateSecrets) {
      try {
        const svRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secret: secKey, response: cfToken, remoteip: clientIp })
        });
        const parsed = await svRes.json().catch(() => null);
        if (parsed?.success === true) {
          svPassed = true;
          svData = parsed;
          break;
        }
      } catch {
        // Try next secret
      }
    }
  } else if (isNonProdHost) {
    svPassed = true;
  }

  if (!svPassed) {
    return hard404();
  }

  if (svData?.cdata) {
    const expectedCdata = `${appId}_${nid}_${hw}`;
    if (!timingSafeEqual(String(svData.cdata), expectedCdata)) {
      return hard404();
    }
  }

  // Gate G7: Pause/Maintenance Check + Late AES-256-GCM Decrypt
  const unavailMsg =
    sec.unavailableMessage ||
    'The package link is currently not available. It will be updated soon by the admin.';

  if (sec.isPaused || sec.isComingSoon) {
    return jsonResponse({
      status: 'unavailable',
      message: unavailMsg,
      helpline: {
        whatsapp: sec.helplineWhatsapp || '',
        telegram: sec.helplineTelegram || ''
      }
    });
  }

  const rawTarget =
    cleanEnvVal(sec.encryptedPrimaryUrl) ||
    cleanEnvVal(sec.primaryDownloadUrl) ||
    cleanEnvVal(env.ENCRYPTED_PRIMARY_URL) ||
    cleanEnvVal(env.PROTECTED_DOWNLOAD_URL) ||
    cleanEnvVal(env.PRIMARY_DOWNLOAD_URL) ||
    cleanEnvVal(env.APP_DOWNLOAD_URL);

  const decryptedUrl = await decryptVaultValueWeb(rawTarget, env);

  if (!isValidDestinationUrl(decryptedUrl)) {
    return jsonResponse({
      status: 'unavailable',
      message: unavailMsg,
      helpline: {
        whatsapp: sec.helplineWhatsapp || '',
        telegram: sec.helplineTelegram || ''
      }
    });
  }

  return jsonResponse(
    {
      status: 'available',
      url: decryptedUrl
    },
    200,
    {
      'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
      'Referrer-Policy': 'no-referrer'
    }
  );
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Device-Fingerprint, X-Session-Token'
    }
  });
}
