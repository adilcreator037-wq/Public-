/**
 * ============================================================================
 * CLIENT & ENVIRONMENT HARDWARE PROBE (device-probe.ts)
 * Measures WebGL GPU renderer, shader precision, compressed textures,
 * sub-pixel text physics, and automation/desktop signals.
 * ============================================================================
 */

import type { HardEnvObj, SoftEnvObj, DevicePolicyMode } from './gate-config';

/**
 * Deterministic canonical JSON serializer (sorted keys, no whitespace).
 */
export function canonical(o: unknown): string {
  if (Array.isArray(o)) {
    return '[' + o.map(canonical).join(',') + ']';
  }
  if (o && typeof o === 'object') {
    return (
      '{' +
      Object.keys(o as object)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical((o as Record<string, unknown>)[k]))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(o ?? null);
}

/**
 * Computes lowercase hex SHA-256 of an exact UTF-8 string via Web Crypto.
 */
export async function sha256hex(s: string): Promise<string> {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Measures sub-pixel text layout and font fallback physics in an off-screen container.
 */
export function textPhysics(): [number, number, number, number, number, number] {
  if (typeof document === 'undefined' || !document.body) {
    return [0, 0, 0, 0, 0, 0];
  }
  try {
    const wrap = document.createElement('div');
    wrap.setAttribute('lang', 'en');
    wrap.style.cssText =
      'position:fixed;left:-9999px;top:-9999px;width:120px;hyphens:auto;font-size:16px;line-height:1.25;visibility:hidden;pointer-events:none;z-index:-1;';
    wrap.textContent =
      'Electroencephalographically internationalization counterrevolutionaries disproportionateness';
    document.body.appendChild(wrap);
    const height = round2(wrap.getBoundingClientRect().height);

    const fonts = [
      'system-ui',
      'sans-serif',
      'monospace',
      '"Roboto", monospace',
      '"-apple-system", monospace',
    ];
    const widths: number[] = [];

    for (const font of fonts) {
      const span = document.createElement('span');
      span.style.cssText = `font-family:${font};font-size:16px;white-space:nowrap;display:inline-block;`;
      span.textContent = 'mmmmmmmmmmlliWW1234567890';
      wrap.appendChild(span);
      widths.push(round2(span.getBoundingClientRect().width));
    }

    document.body.removeChild(wrap);
    return [
      height,
      widths[0] ?? 0,
      widths[1] ?? 0,
      widths[2] ?? 0,
      widths[3] ?? 0,
      widths[4] ?? 0,
    ];
  } catch {
    return [0, 0, 0, 0, 0, 0];
  }
}

export interface ClientGateResult {
  failed: boolean;
  wb: 0 | 1;
  hl: 0 | 1;
  dk: 0 | 1;
}

/**
 * Client-side gate inspection:
 * - Always checks `wb` (webdriver) and `hl` (headless/automation/software GPU).
 * - Checks `dk` (desktop OS/viewport/GPU). When `policyMode === 'strict_mobile_only'`,
 *   `dk === 1` causes `failed = true` (immediate disguised 404). When `policyMode === 'universal_human'`,
 *   `dk` is recorded as `0` for valid human browsers so both mobile and desktop users can verify.
 */
export function inspectClientGate(
  gpuRenderer = '',
  policyMode: DevicePolicyMode = 'universal_human'
): ClientGateResult {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { failed: true, wb: 0, hl: 1, dk: 1 };
  }

  let wb: 0 | 1 = 0;
  let hl: 0 | 1 = 0;
  let dk: 0 | 1 = 0;

  const isLocalPreview =
    typeof window !== 'undefined' &&
    (window.location?.hostname === 'localhost' || window.location?.hostname === '127.0.0.1') &&
    policyMode === 'universal_human';

  if (!isLocalPreview) {
    try {
      if (navigator.webdriver === true) {
        wb = 1;
      }
      const ownDesc = Object.getOwnPropertyDescriptor(navigator, 'webdriver');
      if (ownDesc && ownDesc.value === true) {
        wb = 1;
      }
    } catch {
      // ignore descriptor exception
    }

    const w = window as unknown as Record<string, unknown>;
    if (
      w._phantom ||
      w.__nightmare ||
      w.callPhantom ||
      w.__playwright ||
      w.__pw_manual ||
      w.domAutomation ||
      w.domAutomationController
    ) {
      hl = 1;
    }

    const ua = navigator.userAgent || '';
    if (/HeadlessChrome|PhantomJS|Playwright|Puppeteer|Selenium|Cypress|Electron/i.test(ua)) {
      hl = 1;
    }
  }

  const ua = navigator.userAgent || '';

  if (
    policyMode === 'strict_mobile_only' &&
    gpuRenderer &&
    /SwiftShader|llvmpipe|softpipe|VirtualBox|VMware/i.test(gpuRenderer)
  ) {
    hl = 1;
  }

  if (policyMode === 'strict_mobile_only') {
    const plat = navigator.platform || '';
    const maxTouchPoints = Number(navigator.maxTouchPoints ?? 0);
    const isCoarse =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;
    const isAnyCoarse =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(any-pointer: coarse)').matches;
    const hasTouch =
      maxTouchPoints >= 1 ||
      isCoarse ||
      isAnyCoarse ||
      (typeof window !== 'undefined' && 'ontouchstart' in window) ||
      typeof TouchEvent !== 'undefined';

    const navData = (
      navigator as unknown as { userAgentData?: { platform?: string; mobile?: boolean } }
    ).userAgentData;

    const isMobileGpu = Boolean(
      gpuRenderer &&
        /Xclipse|Samsung|Adreno|Mali|Immortalis|Apple|PowerVR|RDNA|Qualcomm|Exynos|MediaTek|Vivante|Tegra/i.test(
          gpuRenderer
        ) &&
        !/Apple M[1-4]/i.test(gpuRenderer)
    );
    const isDesktopDedicatedOrIntelGpu = Boolean(
      gpuRenderer &&
        (/GeForce|RTX|GTX|Intel\(R\) (UHD|Iris|HD Graphics)|Apple M[1-4]/i.test(gpuRenderer) ||
          (!isMobileGpu && /Radeon/i.test(gpuRenderer)))
    );

    const isDesktopUaOrDesktopMode =
      /Windows NT|Win64|WOW64|CrOS|X11;\s*Linux\s+(x86_64|i[3-6]86)|Linux\s+(x86_64|i[3-6]86)|Ubuntu|Fedora|Debian|Macintosh/i.test(
        ua
      ) || !/Android|iPhone|iPad|iPod/i.test(ua);

    const isClientHintsDesktopMode =
      navData?.mobile === false ||
      Boolean(
        navData?.platform &&
          /^(Windows|macOS|Chrome OS|Chromium OS|Linux)$/i.test(navData.platform.trim())
      );

    const vw = Number(window.innerWidth || 0);
    const vh = Number(window.innerHeight || 0);
    const sw = Number(window.screen?.width || 0);
    const sh = Number(window.screen?.height || 0);
    const minScreen = Math.min(sw || vw, sh || vh);
    const isDesktopViewportMode = vw >= 768 && (minScreen < 650 || Math.min(vw, vh) >= 680);
    const isDesktopPlatform = /^(Win|CrOS|Mac|Linux x86|Linux i[3-6]86)/i.test(plat);

    if (
      isDesktopUaOrDesktopMode ||
      isClientHintsDesktopMode ||
      isDesktopViewportMode ||
      isDesktopPlatform ||
      isDesktopDedicatedOrIntelGpu ||
      !hasTouch ||
      maxTouchPoints < 1 ||
      (!isCoarse && !isAnyCoarse)
    ) {
      dk = 1;
    }
  }

  return {
    failed: wb === 1 || hl === 1 || dk === 1,
    wb,
    hl,
    dk,
  };
}

export interface FrozenEnvProbe {
  readonly hardStr: string;
  readonly softStr: string;
  readonly hw: string;
  readonly hard: Readonly<HardEnvObj>;
  readonly soft: Readonly<SoftEnvObj>;
  readonly gate: Readonly<ClientGateResult>;
}

/**
 * Collects HARD and SOFT device probes and computes `hw = sha256hex(hardStr).slice(0, 24)`.
 */
export async function collectEnv(
  policyMode: DevicePolicyMode = 'universal_human'
): Promise<FrozenEnvProbe> {
  const n = (typeof navigator !== 'undefined' ? navigator : {}) as Record<string, any>;
  const hi =
    n.userAgentData && typeof n.userAgentData.getHighEntropyValues === 'function'
      ? await n.userAgentData
          .getHighEntropyValues(['platform', 'architecture', 'model'])
          .catch(() => null)
      : null;

  let gl: WebGLRenderingContext | null = null;
  try {
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      gl =
        (canvas.getContext('webgl') as WebGLRenderingContext | null) ||
        (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    }
  } catch {
    gl = null;
  }

  const dbg = gl ? gl.getExtension('WEBGL_debug_renderer_info') : null;
  const mpFormat = gl
    ? gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.MEDIUM_FLOAT)
    : null;
  const ext = gl ? gl.getSupportedExtensions() ?? [] : [];
  const gpu = dbg && gl ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? '') : '';

  const hard: HardEnvObj = Object.freeze({
    plat: String(n.platform ?? ''),
    vend: String(n.vendor ?? ''),
    ud: n.userAgentData ? 1 : 0,
    udp: String(hi?.platform ?? ''),
    arch: String(hi?.architecture ?? ''),
    dm: 'deviceMemory' in n ? 1 : 0,
    sa: 'standalone' in n ? 1 : 0,
    wc: typeof window !== 'undefined' && (window as any).chrome ? 1 : 0,
  });

  const mpTuple: [number, number, number] | null = mpFormat
    ? [mpFormat.rangeMin, mpFormat.rangeMax, mpFormat.precision]
    : null;
  const txTuple: [0 | 1, 0 | 1] = [
    ext.includes('WEBGL_compressed_texture_astc') ? 1 : 0,
    ext.includes('WEBGL_compressed_texture_etc') ? 1 : 0,
  ];

  const soft: SoftEnvObj = Object.freeze({
    gl: (gl ? 1 : 0) as 0 | 1,
    mdl: (hi?.model ? 1 : 0) as 0 | 1,
    gpu,
    mp: mpTuple,
    tx: txTuple,
    tp: textPhysics(),
  });

  const hardStr = canonical(hard);
  const softStr = canonical(soft);
  const hw = (await sha256hex(hardStr)).slice(0, 24);
  const gate = Object.freeze(inspectClientGate(gpu, policyMode));

  return Object.freeze({
    hardStr,
    softStr,
    hw,
    hard,
    soft,
    gate,
  });
}
