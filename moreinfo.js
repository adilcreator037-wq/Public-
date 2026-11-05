import {
  TURNSTILE_ACTION,
  CLIENT_TAP_HOLD_MS,
  TOKEN_V,
  inspectClientGate,
  collectEnv,
  bytesToBase64Url
} from './src/utils/cms-engine';

const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let gatewayConfig = {
  appSlug: 'apexmobile',
  appSerialId: 'APM-482',
  devicePolicyMode: 'universal_human',
  proceedButtonLabel: 'PROCEED',
  turnstileSiteKey: '1x00000000000000000000AA'
};

let nonceData = null;
let envCache = null;
let cfToken = null;
let holdReady = false;
let isSubmitting = false;
let isBotBlocked = false;
let turnstileWidgetId = null;

const touchData = {
  pt: 'mouse',
  rx: 12.5,
  ry: 12.5,
  pr: 0.5,
  x: 180,
  y: 420,
  t0: 0,
  tUp: 0,
  d: 0,
  gap: 8,
  ev: [],
  tr: 1
};

function pushTapEvent(code) {
  if (touchData.ev[touchData.ev.length - 1] !== code) {
    touchData.ev.push(code);
    if (touchData.ev.length > 8) touchData.ev.shift();
  }
}

function showDisguised404() {
  isBotBlocked = true;
  const activeView = document.getElementById('gateway-active-view');
  const view404 = document.getElementById('gateway-disguised-404');
  if (activeView) activeView.classList.add('hidden');
  if (view404) view404.classList.remove('hidden');
  document.title = '404 — Page Not Found';
}

function updateClearanceButtonUi() {
  const btn = document.getElementById('gw-clearance-btn');
  const spinner = document.getElementById('gw-btn-spinner');
  const label = document.getElementById('gw-btn-label');
  if (!btn || !label || !spinner) return;

  btn.classList.remove('state-wait', 'state-ready', 'state-busy');

  if (isSubmitting) {
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.classList.add('state-busy');
    spinner.classList.remove('hidden');
    label.textContent = 'CONNECTING…';
    return;
  }

  const isReady = Boolean(cfToken && nonceData && holdReady);
  if (isReady) {
    btn.disabled = false;
    btn.setAttribute('aria-busy', 'false');
    btn.classList.add('state-ready');
    spinner.classList.add('hidden');
    label.textContent = gatewayConfig.proceedButtonLabel || 'PROCEED';
    return;
  }

  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  btn.classList.add('state-wait');
  spinner.classList.remove('hidden');
  label.textContent = nonceData ? 'VERIFYING…' : 'PLEASE WAIT…';
}

function showGatewayNotice(message, type = 'amber', helpline = null) {
  const box = document.getElementById('gw-notice-box');
  const textEl = document.getElementById('gw-notice-text');
  const helplineRow = document.getElementById('gw-helpline-row');
  if (!box || !textEl) return;

  box.classList.remove('hidden', 'amber', 'emerald');
  box.classList.add(type === 'emerald' ? 'emerald' : 'amber');
  textEl.textContent = message || '';

  if (helplineRow) {
    helplineRow.innerHTML = '';
    const wa = helpline?.whatsapp || gatewayConfig.helplineWhatsapp || '';
    const tg = helpline?.telegram || gatewayConfig.helplineTelegram || '';
    if (wa) {
      const a = document.createElement('a');
      a.href = wa;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'helpline-btn whatsapp';
      a.textContent = 'WhatsApp Support';
      helplineRow.appendChild(a);
    }
    if (tg) {
      const a = document.createElement('a');
      a.href = tg;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'helpline-btn telegram';
      a.textContent = 'Telegram Support';
      helplineRow.appendChild(a);
    }
    helplineRow.classList.toggle('hidden', !wa && !tg);
  }
}

function applyGatewayMetadata(meta) {
  if (!meta) return;
  gatewayConfig = {
    ...gatewayConfig,
    ...meta
  };

  if (meta.accentColor) {
    document.documentElement.style.setProperty('--accent-color', meta.accentColor);
  }

  const brandNameEl = document.getElementById('gw-brand-name');
  const brandLogoEl = document.getElementById('gw-brand-logo');
  const appIconEl = document.getElementById('gw-app-icon');
  const appTitleEl = document.getElementById('gw-app-title');
  const appVerEl = document.getElementById('gw-app-version');
  const appSizeEl = document.getElementById('gw-app-size');
  const customNoteEl = document.getElementById('gw-custom-note');
  const specsCard = document.getElementById('gw-specs-card');
  const specName = document.getElementById('gw-spec-name');
  const specVerSize = document.getElementById('gw-spec-ver-size');
  const specOs = document.getElementById('gw-spec-os');
  const specSha = document.getElementById('gw-spec-sha256');
  const footerCopy = document.getElementById('gw-footer-copyright');

  const displayTitle = meta.customHeading || meta.appName || meta.brandName || 'ApexMobile';
  if (brandNameEl && meta.brandName) brandNameEl.textContent = meta.brandName;
  if (brandLogoEl && meta.logoUrl) brandLogoEl.src = meta.logoUrl;
  if (appIconEl && meta.logoUrl) appIconEl.src = meta.logoUrl;
  if (appTitleEl) appTitleEl.textContent = displayTitle;
  if (appVerEl && meta.version) appVerEl.textContent = meta.version;
  if (appSizeEl && meta.fileSize) appSizeEl.textContent = meta.fileSize;

  if (customNoteEl) {
    const note = (meta.customNoteHtml || '').trim();
    if (note) {
      customNoteEl.innerHTML = note;
      customNoteEl.classList.remove('hidden');
    } else {
      customNoteEl.innerHTML = '';
      customNoteEl.classList.add('hidden');
    }
  }

  if (specsCard) {
    specsCard.classList.toggle('hidden', !meta.showSpecsOnGateway);
  }
  if (specName) specName.textContent = displayTitle;
  if (specVerSize) {
    specVerSize.textContent = `${meta.version || 'v4.8.2'} · ${meta.fileSize || '64.2 MB'}`;
  }
  if (specOs && meta.operatingSystem) specOs.textContent = meta.operatingSystem;
  if (specSha && meta.sha256) specSha.textContent = meta.sha256;
  if (footerCopy && meta.brandName) {
    footerCopy.textContent = `© 2026 ${meta.brandName}. All rights reserved.`;
  }
}

function mountTurnstileWidget(siteKey, cDataPayload) {
  const slot = document.getElementById('turnstile-widget-slot');
  if (!slot) return;

  const isLocalOrPreviewHost =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.endsWith('.run.app');

  let fallbackTimer = null;
  if (isLocalOrPreviewHost && siteKey.startsWith('1x0000')) {
    fallbackTimer = setTimeout(() => {
      if (!cfToken) {
        cfToken = 'XXXX.DUMMY.TOKEN.XXXX';
        updateClearanceButtonUi();
      }
    }, 1000);
  }

  const renderWidget = () => {
    if (!window.turnstile) return;
    try {
      if (turnstileWidgetId !== null) {
        window.turnstile.remove(turnstileWidgetId);
        turnstileWidgetId = null;
      }
    } catch {
      // Ignore cleanup error
    }

    try {
      turnstileWidgetId = window.turnstile.render(slot, {
        sitekey: siteKey,
        theme: 'light',
        action: TURNSTILE_ACTION,
        cData: cDataPayload,
        appearance: 'always',
        callback: (token) => {
          if (fallbackTimer) clearTimeout(fallbackTimer);
          cfToken = token;
          updateClearanceButtonUi();
        },
        'expired-callback': () => {
          cfToken = null;
          updateClearanceButtonUi();
        },
        'error-callback': () => {
          if (isLocalOrPreviewHost && siteKey.startsWith('1x0000')) {
            cfToken = 'XXXX.DUMMY.TOKEN.XXXX';
            updateClearanceButtonUi();
          }
        }
      });
    } catch {
      if (isLocalOrPreviewHost && siteKey.startsWith('1x0000')) {
        cfToken = 'XXXX.DUMMY.TOKEN.XXXX';
        updateClearanceButtonUi();
      }
    }
  };

  if (window.turnstile) {
    renderWidget();
    return;
  }

  let scriptEl = document.querySelector(`script[src="${TURNSTILE_SCRIPT_URL}"]`);
  if (!scriptEl) {
    scriptEl = document.createElement('script');
    scriptEl.src = TURNSTILE_SCRIPT_URL;
    scriptEl.async = true;
    scriptEl.defer = true;
    scriptEl.onload = renderWidget;
    scriptEl.onerror = () => {
      if (isLocalOrPreviewHost && siteKey.startsWith('1x0000')) {
        cfToken = 'XXXX.DUMMY.TOKEN.XXXX';
        updateClearanceButtonUi();
      }
    };
    document.head.appendChild(scriptEl);
  } else {
    scriptEl.addEventListener('load', renderWidget, { once: true });
  }
}

function attachClearanceButtonTelemetry() {
  const btn = document.getElementById('gw-clearance-btn');
  if (!btn) return;

  btn.addEventListener('pointerdown', (e) => {
    touchData.t0 = performance.now();
    touchData.ev = [];
    pushTapEvent('pd');
    touchData.pt = e.pointerType || 'mouse';
    touchData.rx = Math.round(((e.width || 24) / 2) * 100) / 100;
    touchData.ry = Math.round(((e.height || 24) / 2) * 100) / 100;
    touchData.pr = Math.round((e.pressure || 0.5) * 1000) / 1000;
    if (e.clientX > 0) touchData.x = Math.round(e.clientX);
    if (e.clientY > 0) touchData.y = Math.round(e.clientY);
    touchData.tr = e.isTrusted ? 1 : 0;
  });

  btn.addEventListener('pointerup', (e) => {
    pushTapEvent('pu');
    touchData.tUp = performance.now();
    if (touchData.t0 > 0) {
      touchData.d = Math.max(12, Math.round(touchData.tUp - touchData.t0));
    }
    if (e.clientX > 0) touchData.x = Math.round(e.clientX);
    if (e.clientY > 0) touchData.y = Math.round(e.clientY);
  });

  btn.addEventListener(
    'touchstart',
    (e) => {
      if (touchData.t0 === 0) touchData.t0 = performance.now();
      pushTapEvent('ts');
      touchData.pt = 'touch';
      const t = e.touches && e.touches[0];
      if (t) {
        touchData.rx = Math.round((t.radiusX || 12.5) * 100) / 100;
        touchData.ry = Math.round((t.radiusY || 12.5) * 100) / 100;
        touchData.pr = Math.round((t.force || 0.5) * 1000) / 1000;
        if (t.clientX > 0) touchData.x = Math.round(t.clientX);
        if (t.clientY > 0) touchData.y = Math.round(t.clientY);
      }
      touchData.tr = e.isTrusted ? 1 : 0;
    },
    { passive: true }
  );

  btn.addEventListener(
    'touchend',
    () => {
      pushTapEvent('te');
      touchData.tUp = performance.now();
      if (touchData.t0 > 0) {
        touchData.d = Math.max(12, Math.round(touchData.tUp - touchData.t0));
      }
    },
    { passive: true }
  );

  btn.addEventListener('click', (e) => {
    pushTapEvent('ck');
    if (touchData.tUp > 0) {
      touchData.gap = Math.max(1, Math.round(performance.now() - touchData.tUp));
    }
    if (e.clientX > 0) touchData.x = Math.round(e.clientX);
    if (e.clientY > 0) touchData.y = Math.round(e.clientY);
    handleClearanceSubmit(e);
  });
}

function resolveNavigationProof(appSlug) {
  let hasNav = false;
  try {
    if (
      sessionStorage.getItem(`rd_nav_${appSlug}`) === '1' ||
      sessionStorage.getItem('rd_nav_default') === '1' ||
      sessionStorage.getItem('rd_nav_apexmobile') === '1'
    ) {
      hasNav = true;
    }
  } catch {
    // Ignore storage error
  }

  if (!hasNav) {
    try {
      if (document.referrer && new URL(document.referrer).hostname === window.location.hostname) {
        hasNav = true;
      }
    } catch {
      // Ignore referrer parse error
    }
  }

  if (!hasNav) {
    try {
      const navEntries = performance.getEntriesByType('navigation');
      if (
        navEntries.length > 0 &&
        (navEntries[0].type === 'navigate' || navEntries[0].type === 'reload') &&
        window.history.length > 1
      ) {
        hasNav = true;
      }
    } catch {
      // Ignore performance entry error
    }
  }

  return hasNav ? 1 : 0;
}

async function handleClearanceSubmit(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  if (isSubmitting || isBotBlocked) return;
  if (!cfToken || !nonceData || !holdReady) return;

  isSubmitting = true;
  updateClearanceButtonUi();

  try {
    const policyMode = gatewayConfig.devicePolicyMode || 'universal_human';
    const env = envCache || (await collectEnv(policyMode));
    const appId = gatewayConfig.appSlug || 'apexmobile';
    const nv = resolveNavigationProof(appId);

    let evStr = touchData.ev.join(',');
    if (!evStr.includes('ck')) {
      evStr = touchData.pt === 'touch' ? 'ts,te,ck' : 'pd,pu,ck';
    } else if (!evStr.includes('pd') && !evStr.includes('ts')) {
      evStr = `pd,pu,${evStr}`;
    }

    const coarseMatch =
      typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
        ? 1
        : 0;

    const tokenV12 = {
      v: TOKEN_V,
      id: appId,
      nonce: nonceData.nonce,
      nv,
      hard: env.hardStr,
      soft: env.softStr,
      tap: {
        pt: touchData.pt || (coarseMatch ? 'touch' : 'mouse'),
        mtp: Number(navigator.maxTouchPoints || 0),
        coarse: coarseMatch,
        rx: touchData.rx || 12.5,
        ry: touchData.ry || 12.5,
        pr: touchData.pr || 0.5,
        x: touchData.x > 0 ? touchData.x : 180,
        y: touchData.y > 0 ? touchData.y : 420,
        d: touchData.d >= 1 ? touchData.d : 85,
        gap: touchData.gap >= 0 ? touchData.gap : 8,
        ev: evStr
      },
      f: {
        wb: env.gate.wb,
        hl: env.gate.hl,
        dk: env.gate.dk,
        cb: 0,
        tr: 1
      }
    };

    const encodedToken = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(tokenV12)));

    const res = await fetch('/api/v1/app/session-clearance', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        token: encodedToken,
        cf: cfToken
      })
    });

    if (res.status === 404) {
      showDisguised404();
      return;
    }

    const data = await res.json().catch(() => null);

    if (res.ok && data && (data.status === 'available' || data.status === 'ok') && data.url) {
      window.location.replace(data.url);
      return;
    }

    if (
      data &&
      (data.status === 'unavailable' ||
        data.status === 'paused' ||
        data.status === 'coming_soon' ||
        data.status === 'cap_reached')
    ) {
      isSubmitting = false;
      showGatewayNotice(
        data.message ||
          gatewayConfig.unavailableMessage ||
          'This link is temporarily unavailable.',
        'amber',
        data.helpline
      );
      updateClearanceButtonUi();
      return;
    }

    isSubmitting = false;
    await initGatewaySession();
  } catch {
    isSubmitting = false;
    showGatewayNotice('Connection interrupted. Please tap PROCEED again.', 'amber');
    updateClearanceButtonUi();
  }
}

async function initGatewaySession() {
  if (typeof window !== 'undefined' && window.__GATEWAY_PUBLIC_META__) {
    applyGatewayMetadata(window.__GATEWAY_PUBLIC_META__);
  }

  const policyMode = gatewayConfig.devicePolicyMode || 'universal_human';
  const preGate = inspectClientGate('', policyMode);
  if (preGate.failed) {
    showDisguised404();
    return;
  }

  holdReady = false;
  setTimeout(() => {
    holdReady = true;
    updateClearanceButtonUi();
  }, CLIENT_TAP_HOLD_MS);

  updateClearanceButtonUi();

  try {
    envCache = await collectEnv(policyMode);
    if (envCache.gate.failed) {
      showDisguised404();
      return;
    }

    const appId = gatewayConfig.appSlug || 'apexmobile';
    const res = await fetch('/api/v1/app/session-init', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        appId
      })
    });

    if (res.status === 404) {
      showDisguised404();
      return;
    }

    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.nonce) {
      showDisguised404();
      return;
    }

    if (data.appMeta) {
      applyGatewayMetadata(data.appMeta);
    }

    const resolvedPolicy =
      data.policyMode || data.appMeta?.devicePolicyMode || gatewayConfig.devicePolicyMode || 'universal_human';
    gatewayConfig.devicePolicyMode = resolvedPolicy;

    const recheck = inspectClientGate(envCache.soft?.gpu || '', resolvedPolicy);
    if (recheck.failed) {
      showDisguised404();
      return;
    }

    const nid = String(data.nonce).split('.')[0];
    nonceData = {
      nonce: data.nonce,
      nid
    };

    updateClearanceButtonUi();

    const siteKey =
      data.siteKey ||
      data.turnstileSiteKey ||
      gatewayConfig.turnstileSiteKey ||
      '1x00000000000000000000AA';
    const cData = `${appId}_${nid}_${envCache.hw}`;
    mountTurnstileWidget(siteKey, cData);
  } catch {
    showGatewayNotice('Please check your connection and try again.', 'amber');
  }
}

if (typeof document !== 'undefined') {
  attachClearanceButtonTelemetry();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGatewaySession);
  } else {
    initGatewaySession();
  }
}
