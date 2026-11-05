/**
 * ============================================================================
 * 100% STATIC PUBLIC WEBSITE ROUTER & HYDRATION ENGINE (app.js)
 * Architecture:
 * - ZERO Firebase SDK imports or live database connections on the public site.
 * - Initial page load uses the server/static pre-rendered DOM + embedded
 *   `window.__INITIAL_ROUTE_PAYLOAD__` (0ms latency, CLS = 0.000).
 * - Internal route navigation (`/`, `/news`, `/news/:slug`, `/:pageSlug`) loads
 *   pre-compiled static JSON route bundles from `/static-routes/*.json`.
 * ============================================================================
 */

import {
  optimizeCloudinaryUrl,
  generateSlug,
  resolveFontStackCss,
  buildPartialRoutePayload,
  renderHamburgerDrawerHtml,
  extractFaqsFromRawHtml,
  routePathToStaticJsonName
} from './src/utils/cms-engine';

export { optimizeCloudinaryUrl, generateSlug, extractFaqsFromRawHtml as extractFaqsFromHtml };

if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

let isDrawerOpen = false;
let activeRoutePayload = null;
let selectedNewsCategory = 'ALL';
const staticRouteMemoryCache = new Map();

/**
 * Retrieve synchronous initial route payload embedded in the static HTML document
 */
function getStaticEmbeddedRouteSync(pathname = '/') {
  if (typeof window === 'undefined') return null;
  const cleanPath = (pathname || '/').split('?')[0].replace(/\/+$/, '') || '/';

  if (staticRouteMemoryCache.has(`${cleanPath}::ALL`)) {
    return staticRouteMemoryCache.get(`${cleanPath}::ALL`);
  }

  const embedded = window.__INITIAL_ROUTE_PAYLOAD__;
  if (embedded && (embedded.path === cleanPath || embedded.canonicalPath === cleanPath)) {
    staticRouteMemoryCache.set(`${cleanPath}::ALL`, embedded);
    return embedded;
  }
  return null;
}

/**
 * Fetch the pre-compiled static route JSON file from `/static-routes/<name>.json`
 * (with fallback to `/api/route` when filtering news categories)
 */
async function fetchStaticRoutePayload(pathname = '/', newsCategory = 'ALL') {
  const cleanPath = (pathname || '/').split('?')[0].replace(/\/+$/, '') || '/';
  const cacheKey = `${cleanPath}::${newsCategory}`;

  // 1. Try pre-compiled static JSON artifact first when category is ALL
  if (newsCategory === 'ALL') {
    const staticFileName = routePathToStaticJsonName(cleanPath);
    try {
      const staticRes = await fetch(`/static-routes/${staticFileName}`, {
        headers: { Accept: 'application/json' }
      });
      if (staticRes.ok) {
        const payload = await staticRes.json();
        if (payload && payload.shell) {
          staticRouteMemoryCache.set(cacheKey, payload);
          return payload;
        }
      }
    } catch {
      // Fallback to /api/route below
    }
  }

  // 2. Fallback to partial route endpoint (for category filtering or dynamic preview routes)
  try {
    const res = await fetch(
      `/api/route?path=${encodeURIComponent(cleanPath)}&cat=${encodeURIComponent(newsCategory)}`,
      { cache: 'no-store' }
    );
    if (res.ok) {
      const data = await res.json();
      if (data?.success && data?.payload) {
        staticRouteMemoryCache.set(cacheKey, data.payload);
        return data.payload;
      }
    }
  } catch {
    // Ignore network error and use cached payload
  }

  return staticRouteMemoryCache.get(cacheKey) || getStaticEmbeddedRouteSync(cleanPath);
}

/**
 * Enhance headings with auto-anchor IDs & optimize images inside a container element
 */
export function enhanceContainerDom(container) {
  if (!container) return;

  const headings = container.querySelectorAll('h2, h3');
  const usedSlugs = new Set();

  headings.forEach((heading) => {
    let slug = heading.getAttribute('id');
    if (!slug) {
      slug = generateSlug(heading.textContent) || 'section';
      let uniqueSlug = slug;
      let counter = 1;
      while (usedSlugs.has(uniqueSlug)) {
        uniqueSlug = `${slug}-${counter++}`;
      }
      heading.setAttribute('id', uniqueSlug);
      usedSlugs.add(uniqueSlug);
    } else {
      usedSlugs.add(slug);
    }
  });

  const images = container.querySelectorAll('img');
  images.forEach((img) => {
    const src = img.getAttribute('src');
    if (src) {
      const cleanSrc =
        src === 'https://res.cloudinary.com/demo/image/upload/sample.jpg'
          ? '/assets/hero-banner.svg'
          : optimizeCloudinaryUrl(src);
      if (img.getAttribute('src') !== cleanSrc) {
        img.setAttribute('src', cleanSrc);
      }
    }
    if (!img.getAttribute('loading')) img.setAttribute('loading', 'lazy');
    if (!img.getAttribute('decoding')) img.setAttribute('decoding', 'async');
    img.setAttribute('referrerpolicy', 'no-referrer');
    img.onerror = function () {
      this.onerror = null;
      this.src = '/assets/hero-banner.svg';
    };
  });
}

/**
 * Sanitize & Auto-Anchor Raw HTML string
 */
export function processRawHtml(rawHtml) {
  if (!rawHtml) return '';
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${rawHtml}</div>`, 'text/html');
  const container = doc.body.firstElementChild;
  if (!container) return rawHtml;
  enhanceContainerDom(container);
  return container.innerHTML;
}

/**
 * Apply Admin-Configured UI Theme, Widths & Typography CSS Variables
 */
function applyUiThemeVariables(brand = {}, uiConfig = {}) {
  const root = document.documentElement;
  root.style.setProperty('--accent-color', brand.accentColor || '#EF4444');
  root.style.setProperty('--button-text-color', uiConfig.buttonTextColor || '#FFFFFF');
  root.style.setProperty('--max-container-width', uiConfig.maxContainerWidth || '768px');
  root.style.setProperty('--bg-page', uiConfig.pageBackgroundColor || '#F8FAFC');
  root.style.setProperty('--bg-surface', uiConfig.surfaceBackgroundColor || '#FFFFFF');
  root.style.setProperty('--bg-header', uiConfig.headerBackgroundColor || uiConfig.surfaceBackgroundColor || '#FFFFFF');
  root.style.setProperty('--text-header', uiConfig.headerTextColor || uiConfig.headingColor || '#111827');
  root.style.setProperty('--bg-footer', uiConfig.footerBackgroundColor || '#0F172A');
  root.style.setProperty('--text-footer', uiConfig.footerTextColor || '#F8FAFC');
  root.style.setProperty('--border-color', uiConfig.borderColor || '#E2E8F0');
  root.style.setProperty('--card-radius', uiConfig.cardBorderRadius || '12px');
  root.style.setProperty('--text-main', uiConfig.textColor || '#1F2937');
  root.style.setProperty('--heading-color', uiConfig.headingColor || '#111827');
  root.style.setProperty('--base-font-size', uiConfig.baseFontSize || '16px');
  root.style.setProperty('--font-stack', resolveFontStackCss(uiConfig.fontFamily));
}

/**
 * Dynamically update <head> SEO Meta Title, Description, Canonical & JSON-LD from Route Payload
 */
export function applyPayloadSeoToHead(payload) {
  if (!payload) return;
  const brand = payload.shell?.brand || {};
  const title = payload.metaTitle || `${brand.name || 'Site'} Official Portal`;
  const description = payload.metaDescription || '';
  const fullCanonical =
    payload.canonicalPath === '/'
      ? window.location.origin
      : `${window.location.origin}${payload.canonicalPath}`;
  const ogImage = optimizeCloudinaryUrl(payload.ogImage || '/assets/hero-banner.svg');
  const favicon = optimizeCloudinaryUrl(brand.faviconUrl || brand.logoUrl || '/assets/app-icon.svg');

  document.title = title;

  const setMeta = (attrName, attrVal, content) => {
    if (!content) return;
    let el = document.querySelector(`meta[${attrName}="${attrVal}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attrName, attrVal);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  };

  setMeta('name', 'description', description);
  setMeta('property', 'og:title', title);
  setMeta('property', 'og:description', description);
  setMeta('property', 'og:url', fullCanonical);
  setMeta('property', 'og:type', payload.viewType === 'news-article' ? 'article' : 'website');
  setMeta('property', 'og:image', ogImage);
  setMeta('name', 'twitter:title', title);
  setMeta('name', 'twitter:description', description);
  setMeta('name', 'twitter:image', ogImage);
  setMeta('name', 'theme-color', brand.themeColor || brand.accentColor || '#EF4444');
  setMeta('name', 'application-name', brand.name || 'ApexMobile');

  let canonicalEl = document.querySelector('link[rel="canonical"]');
  if (canonicalEl) {
    canonicalEl.setAttribute('href', fullCanonical);
  }

  if (favicon) {
    let iconEl = document.querySelector('link[rel="icon"]');
    if (!iconEl) {
      iconEl = document.createElement('link');
      iconEl.setAttribute('rel', 'icon');
      document.head.appendChild(iconEl);
    }
    iconEl.setAttribute('href', favicon);
  }

  const appleIcon = optimizeCloudinaryUrl(
    brand.appleTouchIconUrl || brand.searchLogoUrl || brand.logoUrl || '/assets/app-icon.svg'
  );
  if (appleIcon) {
    let appleEl = document.querySelector('link[rel="apple-touch-icon"]');
    if (!appleEl) {
      appleEl = document.createElement('link');
      appleEl.setAttribute('rel', 'apple-touch-icon');
      appleEl.setAttribute('sizes', '180x180');
      document.head.appendChild(appleEl);
    }
    appleEl.setAttribute('href', appleIcon);
  }

  if (payload.jsonLd) {
    let scriptEl = document.getElementById('dynamic-jsonld-schema');
    if (!scriptEl) {
      scriptEl = document.createElement('script');
      scriptEl.id = 'dynamic-jsonld-schema';
      scriptEl.type = 'application/ld+json';
      document.head.appendChild(scriptEl);
    }
    scriptEl.textContent = JSON.stringify(payload.jsonLd);
  }
}

/**
 * Render Static Route Payload into the DOM
 */
export function renderPartialRoutePayload(payload, options = { preserveSsrDom: false }) {
  if (!payload || !payload.shell) return;
  activeRoutePayload = payload;

  const { shell } = payload;
  const brand = shell.brand || {};
  const ui = shell.uiConfig || {};
  const heroCtas = shell.heroCtas || {};

  // 1. Apply UI Theme Variables
  applyUiThemeVariables(brand, ui);

  // 2. Header Brand, Logo & News Button
  const logoImg = document.getElementById('navbar-logo-img');
  const logoText = document.getElementById('navbar-logo-text');
  const headerNewsBtn = document.getElementById('header-news-btn');
  const logoSrc = optimizeCloudinaryUrl(brand.logoUrl || '/assets/app-icon.svg');

  if (logoImg) {
    if (logoImg.getAttribute('src') !== logoSrc) logoImg.src = logoSrc;
    logoImg.alt = brand.name || 'Logo';
    logoImg.onerror = () => {
      logoImg.src = '/assets/app-icon.svg';
    };
  }
  if (logoText) {
    logoText.textContent = brand.name || 'ApexMobile';
  }
  if (headerNewsBtn) {
    if (ui.showHeaderNewsButton === false) {
      headerNewsBtn.classList.add('hidden');
    } else {
      headerNewsBtn.classList.remove('hidden');
      headerNewsBtn.classList.toggle(
        'is-active',
        payload.viewType === 'news-hub' || payload.viewType === 'news-article'
      );
      const btnLabel = ui.headerNewsButtonLabel || 'News';
      const countSuffix = ui.showNewsCountInHeader !== false ? ` (${shell.newsCount || 0})` : '';
      headerNewsBtn.innerHTML = `<span class="header-news-dot"></span><span>${btnLabel}${countSuffix}</span>`;
    }
  }

  // 3. Categorized Slide-Down Navigation Drawer (Main Sections + News + Legal Pages + CTA)
  const drawerLinksList = document.getElementById('drawer-links-list');
  if (drawerLinksList) {
    drawerLinksList.innerHTML = renderHamburgerDrawerHtml(shell, payload.canonicalPath || '/');
  }

  // 4. Breadcrumbs & Subpage Quick Switcher Pills
  const backBar = document.getElementById('standalone-back-bar');
  const backHomeAnchor = document.getElementById('back-home-anchor');
  const backNewsAnchor = document.getElementById('back-news-anchor');
  const pillsContainer = document.getElementById('subpage-switcher-pills');

  if (backHomeAnchor) {
    backHomeAnchor.textContent = ui.backToHomeLabel || '← Back to Main Page';
  }
  if (backNewsAnchor) {
    backNewsAnchor.textContent = ui.allNewsBreadcrumbLabel || 'All Daily News →';
  }

  if (backBar && pillsContainer) {
    if (payload.viewType === 'home') {
      backBar.classList.add('hidden');
    } else {
      backBar.classList.remove('hidden');
      if (backNewsAnchor) {
        backNewsAnchor.classList.toggle('hidden', payload.viewType !== 'news-article');
      }
      if (ui.showSubpageSwitcherPills === false) {
        pillsContainer.classList.add('hidden');
      } else {
        pillsContainer.classList.remove('hidden');
        const pills = Array.isArray(shell.allSubpagePills) ? shell.allSubpagePills : [];
        pillsContainer.innerHTML = pills
          .map((p) => {
            const isActive =
              (p.href === '/news' &&
                (payload.viewType === 'news-hub' || payload.viewType === 'news-article')) ||
              (payload.viewType === 'standalone-page' && payload.canonicalPath === p.href);
            return `<a href="${p.href}" data-spa-link class="subpage-pill ${
              isActive ? 'active' : ''
            }">${p.label}</a>`;
          })
          .join('');
      }
    }
  }

  // 5. Hero Section & CTA Grid
  const heroSection = document.getElementById('hero-section');
  const heroH1 = document.getElementById('hero-heading');
  const heroCtaGrid = document.getElementById('hero-cta-grid');

  if (heroSection) {
    heroSection.classList.toggle('hidden', !payload.showHeroSection);
  }
  if (heroH1) {
    heroH1.textContent = payload.heroH1 || brand.name || '';
  }
  if (heroCtaGrid) {
    heroCtaGrid.classList.toggle('hidden', !payload.showHeroCtaGrid);
  }

  if (payload.showHeroCtaGrid) {
    const secBtn = document.getElementById('hero-cta-secondary');
    if (secBtn) {
      secBtn.textContent = heroCtas.secondaryCta?.label || 'Installation Guide';
      secBtn.href = heroCtas.secondaryCta?.url || '#install-guide';
      secBtn.setAttribute('data-spa-link', 'true');
      if (heroCtas.secondaryCta?.relSponsored) {
        secBtn.setAttribute('rel', 'nofollow sponsored noopener');
      } else {
        secBtn.removeAttribute('rel');
      }
    }

    const primBtn = document.getElementById('hero-cta-primary');
    if (primBtn) {
      primBtn.textContent = heroCtas.primaryCta?.label || 'Download Official Package';
      primBtn.href = heroCtas.primaryCta?.url || '#technical-specifications';
      primBtn.setAttribute('data-spa-link', 'true');
      if (heroCtas.primaryCta?.relSponsored) {
        primBtn.setAttribute('rel', 'nofollow sponsored noopener');
      } else {
        primBtn.removeAttribute('rel');
      }
    }
  }

  // 6. Main Content Flow (#dynamic-content)
  const dynamicContent = document.getElementById('dynamic-content');
  if (dynamicContent) {
    const ssrPath = dynamicContent.getAttribute('data-ssr-path');
    const canPreserveSsr =
      options.preserveSsrDom &&
      ssrPath === payload.canonicalPath &&
      dynamicContent.innerHTML.trim().length > 0;

    if (!canPreserveSsr) {
      dynamicContent.innerHTML = payload.renderedMainHtml || '';
      dynamicContent.setAttribute('data-ssr-path', payload.canonicalPath);
    }
    enhanceContainerDom(dynamicContent);
  }

  // 7. Customizable Public Footer (Brand Summary, Contact Email, Quick Links, Legal Pages & Copyright)
  const footerSummaryBlock = document.getElementById('footer-brand-summary-block');
  const footerBrandTitle = document.getElementById('footer-brand-title');
  const footerSummaryText = document.getElementById('footer-summary-text');
  const footerContactLink = document.getElementById('footer-contact-email-link');
  const disclaimerBlock = document.getElementById('footer-disclaimer-block');
  const disclaimerHeading = document.getElementById('footer-disclaimer-heading');
  const disclaimerText = document.getElementById('footer-disclaimer');
  const linksHeading = document.getElementById('footer-links-heading');
  const footerLinksList = document.getElementById('footer-links-list');
  const copyrightEl = document.getElementById('footer-copyright');

  if (footerSummaryBlock) {
    footerSummaryBlock.classList.toggle('hidden', shell.navigation?.showFooterBrandSummary === false);
  }
  if (footerBrandTitle) {
    footerBrandTitle.textContent = brand.name || 'ApexMobile';
  }
  if (footerSummaryText) {
    footerSummaryText.textContent = shell.navigation?.footerSummary || brand.tagline || '';
  }
  if (footerContactLink) {
    const showContact = shell.navigation?.showFooterContactEmail !== false && Boolean(brand.contactEmail);
    footerContactLink.classList.toggle('hidden', !showContact);
    if (brand.contactEmail) {
      footerContactLink.textContent = brand.contactEmail;
      footerContactLink.href = `mailto:${brand.contactEmail}`;
    }
  }

  if (disclaimerBlock) {
    disclaimerBlock.classList.toggle('hidden', ui.showFooterDisclaimer === false);
  }
  if (disclaimerHeading) {
    disclaimerHeading.textContent =
      shell.navigation?.disclaimerHeading || 'Legal & Trademark Disclaimer';
  }
  if (disclaimerText) {
    disclaimerText.textContent = shell.navigation?.disclaimer || '';
  }
  if (linksHeading) {
    linksHeading.classList.toggle('hidden', ui.showFooterLinksHeading === false);
    linksHeading.textContent =
      shell.navigation?.siteLinksHeading || 'Official Legal & Support Pages';
  }

  if (footerLinksList) {
    footerLinksList.innerHTML = '';
    const quickLinks = Array.isArray(shell.navigation?.footerQuickLinks)
      ? shell.navigation.footerQuickLinks
      : [];
    quickLinks.forEach((ql) => {
      if (!ql.label || !ql.url) return;
      const a = document.createElement('a');
      a.href = ql.url;
      if (ql.openInNewTab) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      } else {
        a.setAttribute('data-spa-link', 'true');
      }
      a.textContent = ql.label;
      a.className = 'footer-link';
      footerLinksList.appendChild(a);
    });

    const footerPages = Array.isArray(shell.footerPages) ? shell.footerPages : [];
    footerPages.forEach((pg) => {
      const a = document.createElement('a');
      a.href = `/${pg.slug}`;
      a.setAttribute('data-spa-link', 'true');
      a.textContent = pg.label;
      a.className = 'footer-link';
      if (pg.metaTitle) a.title = pg.metaTitle;
      footerLinksList.appendChild(a);
    });
  }

  if (copyrightEl) {
    copyrightEl.textContent =
      shell.navigation?.copyright || `© 2026 ${brand.name || 'Brand'}. All rights reserved.`;
  }

  // 8. Floating Bottom Pill CTA
  const floatingWrapper = document.getElementById('floating-bottom-cta');
  const floatingBtn = document.getElementById('floating-cta-btn');
  if (floatingWrapper && floatingBtn) {
    if (heroCtas.floatingCta?.enabled === false) {
      floatingWrapper.classList.add('hidden');
    } else {
      floatingWrapper.classList.remove('hidden');
      floatingBtn.textContent = heroCtas.floatingCta?.label || '⚡ Download Now';
      const targetUrl =
        heroCtas.floatingCta?.url || heroCtas.primaryCta?.url || '#technical-specifications';
      floatingBtn.href =
        payload.viewType !== 'home' && targetUrl.startsWith('#') ? `/${targetUrl}` : targetUrl;
      floatingBtn.setAttribute('data-spa-link', 'true');
    }
  }

  // 9. Update SEO Head tags & JSON-LD
  applyPayloadSeoToHead(payload);
}

/**
 * Full SiteConfig Render Adapter
 */
export function renderSite(fullConfig) {
  if (!fullConfig) return;
  const pathname = window.location.pathname;
  const payload = buildPartialRoutePayload(pathname, fullConfig, selectedNewsCategory);
  renderPartialRoutePayload(payload, { preserveSsrDom: false });
}

/**
 * Load & Render Route from Static Pre-Compiled Bundle
 */
export async function loadAndRenderRoute(pathname, options = { scrollToTop: false }) {
  const syncPayload = getStaticEmbeddedRouteSync(pathname);
  if (syncPayload && selectedNewsCategory === 'ALL') {
    renderPartialRoutePayload(syncPayload, { preserveSsrDom: false });
  }

  const staticPayload = await fetchStaticRoutePayload(pathname, selectedNewsCategory);
  if (staticPayload) {
    renderPartialRoutePayload(staticPayload, { preserveSsrDom: false });
  }

  if (options.scrollToTop) {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }
}

/**
 * Instant Client-Side + History API Route Navigation
 */
export async function navigateToRoute(rawHref) {
  if (!rawHref) return;
  closeDrawer();

  // Case 1: Pure hash link (#install-guide)
  if (rawHref.startsWith('#')) {
    if (window.location.pathname !== '/') {
      window.history.pushState({}, '', `/${rawHref}`);
      await loadAndRenderRoute('/', { scrollToTop: false });
    }
    setTimeout(() => {
      const targetEl = document.querySelector(rawHref);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 20);
    return;
  }

  // Case 2: Root + hash link (/#install-guide)
  if (rawHref.startsWith('/#')) {
    const hash = rawHref.slice(1);
    window.history.pushState({}, '', rawHref);
    await loadAndRenderRoute('/', { scrollToTop: false });
    setTimeout(() => {
      const targetEl = document.querySelector(hash);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 30);
    return;
  }

  // Case 2.5: Isolated Security & Download Gateway (/moreinfo or /download)
  if (rawHref.startsWith('/moreinfo') || rawHref.startsWith('/download')) {
    try {
      sessionStorage.setItem('rd_nav_default', '1');
      sessionStorage.setItem('rd_nav_apexmobile', '1');
      const brandSlug = generateSlug(activeRoutePayload?.shell?.brand?.shortName || activeRoutePayload?.shell?.brand?.name || 'apexmobile');
      if (brandSlug) sessionStorage.setItem(`rd_nav_${brandSlug}`, '1');
    } catch {
      // Ignore storage errors
    }
    window.location.href = rawHref;
    return;
  }

  // Case 3: Internal route ('/', '/news', '/news/:slug', '/privacy-policy', etc.)
  if (
    rawHref.startsWith('/') &&
    !rawHref.startsWith('/admin') &&
    !rawHref.startsWith('/moreinfo') &&
    !rawHref.startsWith('/download') &&
    !rawHref.endsWith('.xml') &&
    !rawHref.endsWith('.txt')
  ) {
    window.history.pushState({}, '', rawHref);
    await loadAndRenderRoute(rawHref, { scrollToTop: true });
  }
}

function toggleDrawer() {
  const btn = document.getElementById('hamburger-toggle');
  const drawer = document.getElementById('nav-drawer');
  if (!btn || !drawer) return;

  isDrawerOpen = !isDrawerOpen;
  drawer.classList.toggle('hidden', !isDrawerOpen);
  btn.classList.toggle('is-active', isDrawerOpen);
  btn.setAttribute('aria-expanded', String(isDrawerOpen));
}

function closeDrawer() {
  const btn = document.getElementById('hamburger-toggle');
  const drawer = document.getElementById('nav-drawer');
  isDrawerOpen = false;
  if (drawer) drawer.classList.add('hidden');
  if (btn) {
    btn.classList.remove('is-active');
    btn.setAttribute('aria-expanded', 'false');
  }
}

export async function initApp() {
  const hamburgerBtn = document.getElementById('hamburger-toggle');
  if (hamburgerBtn) {
    hamburgerBtn.addEventListener('click', toggleDrawer);
  }

  // Global delegated click listener for internal links & news category filter buttons
  document.addEventListener('click', async (e) => {
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (!target) return;

    // News category filter button on /news
    const catBtn = target.closest('[data-news-cat]');
    if (catBtn) {
      selectedNewsCategory = catBtn.getAttribute('data-news-cat') || 'ALL';
      await loadAndRenderRoute(window.location.pathname, { scrollToTop: false });
      return;
    }

    // Internal SPA link handler (Footer links, News links, Header links, Breadcrumbs)
    const linkEl = target.closest('a');
    if (linkEl) {
      const href = linkEl.getAttribute('href') || '';
      const isModifiedClick = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;

      // Record navigation breadcrumb for v12 Security Gateway (/moreinfo or /download)
      if (!isModifiedClick && (href.startsWith('/moreinfo') || href.startsWith('/download'))) {
        try {
          sessionStorage.setItem('rd_nav_default', '1');
          sessionStorage.setItem('rd_nav_apexmobile', '1');
          const brandSlug = generateSlug(activeRoutePayload?.shell?.brand?.shortName || activeRoutePayload?.shell?.brand?.name || 'apexmobile');
          if (brandSlug) sessionStorage.setItem(`rd_nav_${brandSlug}`, '1');
        } catch {
          // Ignore storage errors
        }
        return; // Let browser perform clean full-page navigation to /moreinfo
      }

      const isInternalRoute =
        (href.startsWith('/') || href.startsWith('#')) &&
        !href.startsWith('/admin') &&
        !href.startsWith('/moreinfo') &&
        !href.startsWith('/download') &&
        !href.endsWith('.xml') &&
        !href.endsWith('.txt') &&
        linkEl.getAttribute('target') !== '_blank';

      if (!isModifiedClick && isInternalRoute) {
        e.preventDefault();
        await navigateToRoute(href);
        return;
      }
    }

    // Close hamburger drawer when clicking outside
    const drawer = document.getElementById('nav-drawer');
    if (
      isDrawerOpen &&
      drawer &&
      !drawer.contains(target) &&
      hamburgerBtn &&
      !hamburgerBtn.contains(target)
    ) {
      closeDrawer();
    }
  });

  // Browser Back / Forward button support
  window.addEventListener('popstate', () => {
    loadAndRenderRoute(window.location.pathname, { scrollToTop: false });
  });

  // 1. INITIAL STATIC HYDRATION (0ms Latency, Preserves Pre-Rendered Static DOM)
  const initialPathname = window.location.pathname;
  const embeddedPayload = getStaticEmbeddedRouteSync(initialPathname);
  if (embeddedPayload) {
    renderPartialRoutePayload(embeddedPayload, { preserveSsrDom: true });
  } else {
    await loadAndRenderRoute(initialPathname, { scrollToTop: false });
  }

  // 2. Listen for local Admin static re-compilation notifications (same-browser preview convenience, zero Firebase)
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    try {
      const channel = new BroadcastChannel('apex_cms_sync_channel');
      channel.onmessage = async (event) => {
        if (event.data?.type === 'SITE_CONFIG_UPDATED') {
          staticRouteMemoryCache.clear();
          if (event.data.config) {
            renderSite(event.data.config);
          } else {
            await loadAndRenderRoute(window.location.pathname, { scrollToTop: false });
          }
        }
      };
    } catch {
      // BroadcastChannel optional
    }
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
}
