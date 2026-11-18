/**
 * Cloudflare Pages Function: POST /api/v1/app/session-init
 * Handles v12 7-Gate Security Gate Session Initialization at the Edge.
 */

import {
  jsonResponse,
  cleanEnvVal,
  getFirebaseEnvFromEnv,
  readSiteConfigFromFirestoreRest,
  evaluateGateG1Edge,
  verifyOrMintDidCookieEdge,
  issueStatelessNonceEdge
} from '../../../_shared/auth.js';

function hard404() {
  return jsonResponse({ error: 'Not Found' }, 404, {
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

  const appId = typeof body?.appId === 'string' ? body.appId.trim() : '';
  if (!/^[a-zA-Z0-9\-_]{1,64}$/.test(appId)) {
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

  const g1 = evaluateGateG1Edge(request, env, policyMode);
  if (!g1.pass) {
    return hard404();
  }

  const { setCookie } = await verifyOrMintDidCookieEdge(request, env);
  const nonce = await issueStatelessNonceEdge(appId, env);

  const siteKey =
    cleanEnvVal(sec.turnstileSiteKey) ||
    cleanEnvVal(env.VITE_TURNSTILE_SITE_KEY) ||
    cleanEnvVal(env.TURNSTILE_SITE_KEY) ||
    cleanEnvVal(env.CF_TURNSTILE_SITE_KEY) ||
    '1x00000000000000000000AA';

  const extraHeaders = {
    'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
    'Referrer-Policy': 'no-referrer'
  };
  if (setCookie) {
    extraHeaders['Set-Cookie'] = setCookie;
  }

  return jsonResponse(
    {
      nonce,
      siteKey,
      policyMode,
      appMeta: {
        brandName: siteConfig?.brand?.name || cleanEnvVal(env.SITE_BRAND_NAME) || '',
        logoUrl: siteConfig?.brand?.logoUrl || '',
        accentColor: siteConfig?.brand?.accentColor || '#EF4444',
        appSlug: sec.appSlug || appId || 'gateway',
        appSerialId: sec.appSerialId || 'PKG-001',
        devicePolicyMode: policyMode,
        proceedButtonLabel: sec.proceedButtonLabel || 'PROCEED',
        unavailableMessage: sec.unavailableMessage || '',
        helplineWhatsapp: sec.helplineWhatsapp || '',
        helplineTelegram: sec.helplineTelegram || '',
        customHeading: sec.customHeading || '',
        customNoteHtml: sec.customNoteHtml || '',
        showSpecsOnGateway: Boolean(sec.showSpecsOnGateway),
        appName: sec.customHeading || siteConfig?.packageSpecs?.appName || siteConfig?.brand?.name || '',
        version: siteConfig?.packageSpecs?.version || '',
        fileSize: siteConfig?.packageSpecs?.fileSize || '',
        operatingSystem: siteConfig?.packageSpecs?.operatingSystem || '',
        securityStatus: siteConfig?.packageSpecs?.securityStatus || '',
        sha256: siteConfig?.packageSpecs?.sha256 || ''
      }
    },
    200,
    extraHeaders
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
