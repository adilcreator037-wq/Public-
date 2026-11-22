const TURNSTILE_ACTION = 'session_clearance';
const CLIENT_TAP_HOLD_MS = 650;
const TOKEN_V = 12;

function bytesToBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function inspectClientGate(gpuRenderer = '', policyMode = 'universal_human') {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { wb: 0, hl: 0, dk: 0, failed: false };
  }
  const host = (window.location?.hostname || '').toLowerCase();
  const isLocalUniversal =
    (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.run.app')) &&
    policyMode === 'universal_human';

  const ua = navigator.userAgent || '';
  const wb = navigator.webdriver === true && !isLocalUniversal ? 1 : 0;

  const win = window;
  const hasAutomationGlobals = Boolean(
    win.__nightmare ||
      win._phantom ||
      win.callPhantom ||
      win.__selenium_unwrapped ||
      win.__webdriver_evaluate ||
      win.__driver_evaluate ||
      win.domAutomation ||
      win.domAutomationController ||
      (!isLocalUniversal && (win.__playwright__binding__ || win.__pwInitScripts))
  );

  const isHeadlessUa = !isLocalUniversal && /HeadlessChrome|PhantomJS|SlimerJS| Electron\//i.test(ua);
  const isBadGpu =
    !isLocalUniversal &&
    Boolean(gpuRenderer) &&
    /SwiftShader|llvmpipe|Mesa OffScreen|Software Rasterizer|VirtualBox/i.test(gpuRenderer);

  const hl = hasAutomationGlobals || isHeadlessUa || isBadGpu ? 1 : 0;

  let dk = 0;
  if (policyMode === 'strict_mobile_only') {
    const isIpadOs = /Macintosh/.test(ua) && Number(navigator.maxTouchPoints || 0) >= 2;
    const isMobileUa = /Android|iPhone|iPad|iPod/i.test(ua) || isIpadOs;
    const isDesktopPlatform =
      /^(Win32|Win64|Windows|MacIntel|Linux x86_64|Linux i686)$/i.test(navigator.platform || '') &&
      !isIpadOs &&
      !/Android/i.test(ua);
    const noTouch = Number(navigator.maxTouchPoints || 0) < 1;
    if (!isMobileUa || isDesktopPlatform || noTouch) {
      dk = 1;
    }
  }

  return {
    wb,
    hl,
    dk,
    failed: Boolean(wb || hl || dk)
  };
}

function probeWebGlGpu() {
  if (typeof document === 'undefined') return 'unknown-gpu';
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return 'no-webgl';
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      if (renderer) return String(renderer).trim();
    }
    const fallbackRenderer = gl.getParameter(gl.RENDERER);
    return fallbackRenderer ? String(fallbackRenderer).trim() : 'webgl-generic';
  } catch {
    return 'webgl-blocked';
  }
}

async function sha256HexTruncated16(input) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function collectEnv(policyMode = 'universal_human') {
  const sw = typeof screen !== 'undefined' ? Number(screen.width || 390) : 390;
  const sh = typeof screen !== 'undefined' ? Number(screen.height || 844) : 844;
  const dpr =
    typeof window !== 'undefined' ? Math.round(Number(window.devicePixelRatio || 2) * 100) / 100 : 2;
  const cores = typeof navigator !== 'undefined' ? Number(navigator.hardwareConcurrency || 4) : 4;
  const mem = typeof navigator !== 'undefined' ? Number(navigator.deviceMemory || 4) : 4;
  const touchPts = typeof navigator !== 'undefined' ? Number(navigator.maxTouchPoints || 0) : 0;
  const tz =
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      : 'UTC';
  const lang = typeof navigator !== 'undefined' ? String(navigator.language || 'en-US') : 'en-US';
  const gpu = probeWebGlGpu();

  const hardStr = [Math.min(sw, sh), Math.max(sw, sh), dpr, cores, touchPts].join('|');
  const softStr = [gpu, tz, lang, mem].join('|');
  const hw = await sha256HexTruncated16(hardStr);
  const gate = inspectClientGate(gpu, policyMode);

  return {
    hard: { sw, sh, dpr, cores, touchPts },
    soft: { gpu, tz, lang, mem },
    hardStr,
    softStr,
    hw,
    gate
  };
}

const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let gatewayConfig = {
  appSlug: 'official-package',
  appSerialId: 'PKG-001',
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

function sanitizeSafeUrlClient(rawUrl, httpOnly = false) {
  const trimmed = String(rawUrl || '')
    .replace(/[\u0000-\u001F\u007F]+/g, '')
    .trim();
  if (!trimmed || trimmed.startsWith('//')) return '';
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('https://') || lower.startsWith('http://')) return trimmed;
  if (!httpOnly && trimmed.startsWith('/')) return trimmed;
  if (
    !httpOnly &&
    /^data:image\/(png|jpeg|jpg|webp|gif|avif);base64,[a-z0-9+/=\s]+$/i.test(trimmed)
  ) {
    return trimmed;
  }
  return '';
}

function sanitizeGatewayNoteHtml(rawHtml) {
  if (!rawHtml || !String(rawHtml).trim()) return '';
  let html = String(rawHtml);
  const blocked = 'script|iframe|object|embed|applet|style|svg|math|noscript|template|textarea|title|xmp|form';
  html = html.replace(new RegExp(`<(${blocked})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, 'gi'), '');
  html = html.replace(new RegExp(`<\\/?(${blocked}|base|meta|link|frame|frameset|input|button|select|option)\\b[^>]*>`, 'gi'), '');
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  html = html.replace(/<([a-zA-Z][a-zA-Z0-9:-]*)(\s[^>]*?)?(\/?)>/g, (_full, tag, rawAttrs = '', selfClose = '') => {
    let attrs = String(rawAttrs || '');
    attrs = attrs.replace(/\s+on[a-z0-9_-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    attrs = attrs.replace(/\s+on[a-z0-9_-]*(?=\s|$|\/)/gi, '');
    attrs = attrs.replace(/\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    attrs = attrs.replace(
      /\s+(href|src|action|formaction|poster|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
      (_m, attrName, dq, sq, uq) => {
        const val = dq ?? sq ?? uq ?? '';
        const lowerAttr = String(attrName).toLowerCase();
        const safe = sanitizeSafeUrlClient(val, false);
        if (!safe) return lowerAttr === 'href' ? ' href="#"' : '';
        return ` ${lowerAttr}="${safe.replace(/"/g, '&quot;')}"`;
      }
    );
    return `<${tag}${attrs}${selfClose}>`;
  });
  return html;
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
    const wa = sanitizeSafeUrlClient(helpline?.whatsapp || gatewayConfig.helplineWhatsapp || '', true);
    const tg = sanitizeSafeUrlClient(helpline?.telegram || gatewayConfig.helplineTelegram || '', true);
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
  const appMetaDotEl = document.getElementById('gw-app-meta-dot');
  const customNoteEl = document.getElementById('gw-custom-note');
  const specsCard = document.getElementById('gw-specs-card');
  const specName = document.getElementById('gw-spec-name');
  const specVerSize = document.getElementById('gw-spec-ver-size');
  const specOs = document.getElementById('gw-spec-os');
  const specSha = document.getElementById('gw-spec-sha256');
  const footerCopy = document.getElementById('gw-footer-copyright');

  const displayTitle = meta.customHeading || meta.appName || meta.brandName || '';
  const safeLogoUrl = sanitizeSafeUrlClient(meta.logoUrl || '', false);
  if (brandNameEl) brandNameEl.textContent = meta.brandName || '';
  if (brandLogoEl) {
    if (safeLogoUrl) {
      brandLogoEl.src = safeLogoUrl;
      brandLogoEl.alt = meta.brandName ? `${meta.brandName} Logo` : 'Logo';
      brandLogoEl.classList.remove('hidden');
    } else {
      brandLogoEl.src = '';
      brandLogoEl.classList.add('hidden');
    }
  }
  if (appIconEl) {
    if (safeLogoUrl) {
      appIconEl.src = safeLogoUrl;
      appIconEl.alt = displayTitle || 'Icon';
      appIconEl.classList.remove('hidden');
    } else {
      appIconEl.src = '';
      appIconEl.classList.add('hidden');
    }
  }
  if (appTitleEl) appTitleEl.textContent = displayTitle;
  if (appVerEl) appVerEl.textContent = meta.version || '';
  if (appSizeEl) appSizeEl.textContent = meta.fileSize || '';
  if (appMetaDotEl) appMetaDotEl.classList.toggle('hidden', !(meta.version && meta.fileSize));

  if (customNoteEl) {
    const safeNote = sanitizeGatewayNoteHtml((meta.customNoteHtml || '').trim());
    if (safeNote) {
      customNoteEl.innerHTML = safeNote;
      customNoteEl.classList.remove('hidden');
    } else {
      customNoteEl.innerHTML = '';
      customNoteEl.classList.add('hidden');
    }
  }

  if (specsCard) {
    specsCard.classList.toggle('hidden', !meta.showSpecsOnGateway);
  }
  if (specName) specName.textContent = displayTitle || '—';
  if (specVerSize) {
    specVerSize.textContent = [meta.version, meta.fileSize].filter(Boolean).join(' · ') || '—';
  }
  if (specOs) specOs.textContent = meta.operatingSystem || '—';
  if (specSha) specSha.textContent = meta.sha256 || '';
  if (footerCopy) {
    footerCopy.textContent = meta.brandName
      ? `© ${new Date().getFullYear()} ${meta.brandName}. All rights reserved.`
      : '';
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
      sessionStorage.getItem('rd_nav_default') === '1'
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
    const appId = gatewayConfig.appSlug || 'official-package';
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
      const safeDestUrl = sanitizeSafeUrlClient(data.url, true);
      if (safeDestUrl) {
        window.location.replace(safeDestUrl);
        return;
      }
      isSubmitting = false;
      showGatewayNotice('Invalid destination link configured. Please contact support.', 'amber');
      updateClearanceButtonUi();
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

    const appId = gatewayConfig.appSlug || 'official-package';
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
