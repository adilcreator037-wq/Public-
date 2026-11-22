/**
 * ============================================================================
 * PUBLIC STATIC PORTAL RUNTIME (/app.js)
 * 100% Standalone, Zero-Dependency Client Hydration & Static Route Navigator
 * - Strictly standalone static runtime (zero Firebase SDKs or backend bundlers)
 * - Zero DOM re-writes on initial SSR/Static load (< 2ms hydration)
 * - Loads pre-compiled `/static-routes/<route>.json` on internal SPA link clicks
 * ============================================================================
 */

const navbarLogoLink = document.getElementById('navbar-logo-link');
const navbarLogoImg = document.getElementById('navbar-logo-img');
const navbarLogoText = document.getElementById('navbar-logo-text');
const headerNewsBtn = document.getElementById('header-news-btn');
const drawerLinksList = document.getElementById('drawer-links-list');
const hamburgerToggle = document.getElementById('hamburger-toggle');
const navDrawer = document.getElementById('nav-drawer');

const standaloneBackBar = document.getElementById('standalone-back-bar');
const backHomeAnchor = document.getElementById('back-home-anchor');
const backNewsAnchor = document.getElementById('back-news-anchor');
const subpageSwitcherPills = document.getElementById('subpage-switcher-pills');
const heroSectionEl = document.getElementById('hero-section');
const heroHeading = document.getElementById('hero-heading');
const heroCtaGrid = document.getElementById('hero-cta-grid');
const heroCtaSecondary = document.getElementById('hero-cta-secondary');
const heroCtaPrimary = document.getElementById('hero-cta-primary');
const floatingBottomCta = document.getElementById('floating-bottom-cta');
const floatingCtaBtn = document.getElementById('floating-cta-btn');

const dynamicContent = document.getElementById('dynamic-content');
const footerBrandSummaryBlock = document.getElementById('footer-brand-summary-block');
const footerBrandTitle = document.getElementById('footer-brand-title');
const footerSummaryText = document.getElementById('footer-summary-text');
const footerContactEmailLink = document.getElementById('footer-contact-email-link');
const footerDisclaimerBlock = document.getElementById('footer-disclaimer-block');
const footerDisclaimerHeading = document.getElementById('footer-disclaimer-heading');
const footerDisclaimer = document.getElementById('footer-disclaimer');
const footerLinksHeading = document.getElementById('footer-links-heading');
const footerLinksList = document.getElementById('footer-links-list');
const footerCopyright = document.getElementById('footer-copyright');
const jsonLdScript = document.getElementById('dynamic-jsonld-schema');

let currentPayload = null;
let currentNewsCategory = 'ALL';
let isDrawerOpen = false;
let activeNavAbortController = null;
const MAX_ROUTE_CACHE = 4;
const routeCache = new Map();

function cacheRoutePayload(key, payload) {
  if (!payload || !payload.renderedMainHtml) return;
  if (routeCache.has(key)) {
    routeCache.delete(key);
  } else if (routeCache.size >= MAX_ROUTE_CACHE) {
    const oldestKey = routeCache.keys().next().value;
    if (oldestKey !== undefined) routeCache.delete(oldestKey);
  }
  routeCache.set(key, payload);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeSafeUrlClient(rawUrl, options = {}) {
  const { allowHash = true, allowMailto = false, allowDataImage = false } = options;
  const trimmed = String(rawUrl || '')
    .replace(/[\u0000-\u001F\u007F]+/g, '')
    .trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('//')) return '';
  if (trimmed.startsWith('/')) return trimmed;
  if (allowHash && trimmed.startsWith('#')) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (allowMailto && (/^mailto:/i.test(trimmed) || /^tel:/i.test(trimmed))) return trimmed;
  if (allowDataImage && /^data:image\/(png|jpe?g|webp|gif|avif);base64,[a-z0-9+/=]+$/i.test(trimmed)) {
    return trimmed;
  }
  return '';
}

function generateSlug(input) {
  return String(input || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function routePathToStaticJsonName(pathname) {
  const clean = (pathname || '/').split('?')[0].replace(/^\/+|\/+$/g, '');
  if (!clean) return 'index.json';
  return `${clean.replace(/\//g, '--')}.json`;
}

function resolveFontStackCss(fontFamily) {
  switch (fontFamily) {
    case 'inter':
      return '"Inter", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
    case 'jakarta':
      return '"Plus Jakarta Sans", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
    case 'serif':
      return 'Georgia, Cambria, "Times New Roman", Times, serif';
    case 'mono':
      return '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    default:
      return 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "Helvetica Neue", Arial, sans-serif';
  }
}

function setDrawerState(open) {
  isDrawerOpen = Boolean(open);
  if (navDrawer) {
    navDrawer.classList.toggle('hidden', !isDrawerOpen);
  }
  if (hamburgerToggle) {
    hamburgerToggle.classList.toggle('is-active', isDrawerOpen);
    hamburgerToggle.setAttribute('aria-expanded', isDrawerOpen ? 'true' : 'false');
  }
}

if (hamburgerToggle) {
  hamburgerToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    setDrawerState(!isDrawerOpen);
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isDrawerOpen) {
    setDrawerState(false);
    if (hamburgerToggle) hamburgerToggle.focus();
  }
});

document.addEventListener('click', (e) => {
  if (
    isDrawerOpen &&
    navDrawer &&
    !navDrawer.contains(e.target) &&
    hamburgerToggle &&
    !hamburgerToggle.contains(e.target)
  ) {
    setDrawerState(false);
  }
});

function setOrCreateMeta(attrName, attrValue, content) {
  let el = document.head.querySelector(`meta[${attrName}="${attrValue}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attrName, attrValue);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content || '');
}

function applySeoAndHeadMeta(payload) {
  if (!payload) return;
  const brand = payload.shell?.brand || {};
  document.title = payload.metaTitle || brand.name || '';

  setOrCreateMeta('name', 'description', payload.metaDescription || '');
  setOrCreateMeta('name', 'robots', payload.isConfigured === false ? 'noindex, nofollow' : 'index, follow');

  const baseOrigin = window.location.origin;
  const fullCanonicalUrl =
    payload.canonicalPath === '/' ? `${baseOrigin}/` : `${baseOrigin}${payload.canonicalPath}`;

  let canonicalLink = document.head.querySelector('link[rel="canonical"]');
  if (!canonicalLink) {
    canonicalLink = document.createElement('link');
    canonicalLink.setAttribute('rel', 'canonical');
    document.head.appendChild(canonicalLink);
  }
  canonicalLink.setAttribute('href', fullCanonicalUrl);

  const favLink = document.head.querySelector('link[rel="icon"]');
  if (favLink) {
    const favHref = brand.faviconUrl || brand.logoUrl || '';
    favLink.setAttribute('href', favHref);
  }

  setOrCreateMeta('property', 'og:title', payload.metaTitle || '');
  setOrCreateMeta('property', 'og:description', payload.metaDescription || '');
  setOrCreateMeta('property', 'og:url', fullCanonicalUrl);
  setOrCreateMeta('property', 'og:type', payload.viewType === 'news-article' ? 'article' : 'website');
  setOrCreateMeta('property', 'og:image', payload.ogImage || '');
  setOrCreateMeta('name', 'twitter:image', payload.ogImage || '');
  setOrCreateMeta('name', 'twitter:title', payload.metaTitle || '');
  setOrCreateMeta('name', 'twitter:description', payload.metaDescription || '');

  if (jsonLdScript && payload.jsonLd) {
    jsonLdScript.textContent = JSON.stringify(payload.jsonLd);
  }
}

function applyUiThemeVariables(shell) {
  if (!shell) return;
  const root = document.documentElement;
  const brand = shell.brand || {};
  const ui = shell.uiConfig || {};

  root.style.setProperty('--accent-color', brand.accentColor || '#EF4444');
  root.style.setProperty('--button-text-color', ui.buttonTextColor || '#FFFFFF');
  root.style.setProperty('--max-container-width', ui.maxContainerWidth || '768px');
  root.style.setProperty('--bg-page', ui.pageBackgroundColor || '#F8FAFC');
  root.style.setProperty('--bg-surface', ui.surfaceBackgroundColor || '#FFFFFF');
  root.style.setProperty('--bg-header', ui.headerBackgroundColor || '#FFFFFF');
  root.style.setProperty('--text-header', ui.headerTextColor || '#111827');
  root.style.setProperty('--bg-footer', ui.footerBackgroundColor || '#0F172A');
  root.style.setProperty('--text-footer', ui.footerTextColor || '#F8FAFC');
  root.style.setProperty('--border-color', ui.borderColor || '#E2E8F0');
  root.style.setProperty('--card-radius', ui.cardBorderRadius || '12px');
  root.style.setProperty('--text-main', ui.textColor || '#1F2937');
  root.style.setProperty('--heading-color', ui.headingColor || '#111827');
  root.style.setProperty('--base-font-size', ui.baseFontSize || '16px');
  root.style.setProperty('--font-stack', resolveFontStackCss(ui.fontFamily));

  const headerEl = document.querySelector('.sticky-header');
  if (headerEl) {
    headerEl.style.position = ui.stickyHeader === false ? 'relative' : 'sticky';
  }
}

function buildDrawerHtmlClient(shell, activeCanonicalPath = '/') {
  const ui = shell?.uiConfig || {};
  const items = [];

  items.push(`<li class="drawer-section-header">Page &amp; Section Navigation</li>`);
  items.push(`
    <li>
      <a href="/" data-spa-link class="nav-drawer-link ${activeCanonicalPath === '/' ? 'active-nav-link' : ''}">
        <span>Home Overview</span>
        <span class="drawer-link-badge">Main</span>
      </a>
    </li>
  `);

  const seenUrls = new Set(['/']);

  for (const link of shell?.headerLinks || []) {
    if (!link.label || !link.url) continue;
    const rawUrl = link.url.trim();
    const candidateHref = rawUrl.startsWith('#') ? `/${rawUrl}` : rawUrl;
    const href = sanitizeSafeUrlClient(candidateHref, { allowHash: true });
    if (!href) continue;
    seenUrls.add(rawUrl.toLowerCase());
    seenUrls.add(href.toLowerCase());
    const isActive = activeCanonicalPath === href;
    items.push(`
      <li>
        <a href="${escapeHtml(href)}" data-spa-link class="nav-drawer-link ${isActive ? 'active-nav-link' : ''}" title="${escapeHtml(link.metaTitle || link.label)}">
          <span>${escapeHtml(link.label)}</span>
          <span class="drawer-link-arrow">→</span>
        </a>
      </li>
    `);
  }

  if (ui.autoIncludeSectionsInDrawer !== false && Array.isArray(shell?.autoSectionLinks)) {
    for (const sec of shell.autoSectionLinks) {
      const anchor = `#${sec.url.replace(/^#+/, '')}`;
      const fullHref = `/${anchor}`;
      if (seenUrls.has(anchor.toLowerCase()) || seenUrls.has(fullHref.toLowerCase())) continue;
      seenUrls.add(anchor.toLowerCase());
      items.push(`
        <li>
          <a href="${escapeHtml(fullHref)}" data-spa-link class="nav-drawer-link" title="${escapeHtml(sec.metaTitle || sec.label)}">
            <span>${escapeHtml(sec.label)}</span>
            <span class="drawer-link-arrow">↘</span>
          </a>
        </li>
      `);
    }
  }

  if (ui.showNewsInDrawer !== false && shell?.newsCount > 0) {
    items.push(`<li class="drawer-section-header">Daily News &amp; Changelogs (${shell.newsCount})</li>`);
    if (!seenUrls.has('/news')) {
      items.push(`
        <li>
          <a href="/news" data-spa-link class="nav-drawer-link ${activeCanonicalPath === '/news' ? 'active-nav-link' : ''}">
            <span>All Daily News &amp; Updates</span>
            <span class="drawer-link-badge">${shell.newsCount} Posts</span>
          </a>
        </li>
      `);
    }
    for (const art of (shell.recentNewsDrawerItems || []).slice(0, 2)) {
      const artHref = `/news/${art.slug}`;
      const isArtActive = activeCanonicalPath === artHref;
      items.push(`
        <li>
          <a href="${escapeHtml(artHref)}" data-spa-link class="nav-drawer-link drawer-news-sublink ${isArtActive ? 'active-nav-link' : ''}">
            <div>
              <span class="drawer-news-cat">${escapeHtml(art.category)}</span>
              <div class="drawer-news-title">${escapeHtml(art.title)}</div>
            </div>
          </a>
        </li>
      `);
    }
  }

  const allDrawerPages = [
    ...(shell?.headerPages || []),
    ...(ui.showLegalLinksInDrawer !== false ? shell?.footerPages || [] : [])
  ];
  const uniquePages = Array.from(new Map(allDrawerPages.map((p) => [p.slug, p])).values());

  if (uniquePages.length > 0) {
    items.push(`<li class="drawer-section-header">Official Legal &amp; Support Pages</li>`);
    items.push(`
      <li class="drawer-legal-grid-item">
        <div class="drawer-legal-grid">
          ${uniquePages
            .map((pg) => {
              const pgHref = `/${pg.slug}`;
              const isPgActive = activeCanonicalPath === pgHref;
              return `<a href="${escapeHtml(pgHref)}" data-spa-link class="drawer-legal-chip ${
                isPgActive ? 'active' : ''
              }" title="${escapeHtml(pg.metaTitle || pg.label)}">${escapeHtml(pg.label)}</a>`;
            })
            .join('')}
        </div>
      </li>
    `);
  }

  if (ui.showCtaInDrawer !== false && shell?.heroCtas?.primaryCta?.label) {
    const rawPrimaryUrl = shell.heroCtas.primaryCta.url || '#technical-specifications';
    const candidatePrimaryHref = rawPrimaryUrl.startsWith('#') ? `/${rawPrimaryUrl}` : rawPrimaryUrl;
    const primaryHref =
      sanitizeSafeUrlClient(candidatePrimaryHref, { allowHash: true }) || '/#technical-specifications';
    items.push(`
      <li class="drawer-cta-footer">
        <a href="${escapeHtml(primaryHref)}" data-spa-link class="drawer-cta-btn">
          <span>${escapeHtml(shell.heroCtas.primaryCta.label)}</span>
          ${shell.packageVersion ? `<span class="drawer-cta-ver">${escapeHtml(shell.packageVersion)}</span>` : ''}
        </a>
      </li>
    `);
  }

  return items.join('\n');
}

function enhanceContainerDom(container, ui = {}) {
  if (!container) return;

  // 1. Wrap standalone tables for clean horizontal scrolling on narrow screens
  const tables = container.querySelectorAll('table');
  tables.forEach((tbl) => {
    if (tbl.parentElement && tbl.parentElement.classList.contains('table-scroll-wrapper')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'table-scroll-wrapper';
    tbl.parentNode.insertBefore(wrapper, tbl);
    wrapper.appendChild(tbl);
  });

  // 2. Enhance SHA-256 Checksum cell with a 1-click Copy Checksum button
  const showCopiedState = (btn) => {
    btn.textContent = 'Copied';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = 'Copy';
      btn.classList.remove('copied');
    }, 1800);
  };

  const bindCopyBtn = (btn, text) => {
    if (!btn || btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          showCopiedState(btn);
          return;
        }
      } catch {
        // Fallback below
      }
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showCopiedState(btn);
      } catch {
        // Ignore clipboard denial
      }
    });
  };

  const codeCells = container.querySelectorAll('table code');
  codeCells.forEach((codeEl) => {
    const text = (codeEl.textContent || '').trim();
    if (text.length < 32) return;
    let btn = codeEl.parentElement.querySelector('.copy-hash-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-hash-btn';
      btn.textContent = 'Copy';
      btn.setAttribute('aria-label', 'Copy SHA-256 checksum');
      codeEl.parentElement.appendChild(btn);
    }
    bindCopyBtn(btn, btn.getAttribute('data-copy-text') || text);
  });

  // 3. Convert legacy raw FAQ <h3> + <p> pairs (only inside non-SSR rawHtml) into accessible <details class="faq-item">
  if (ui.enableFaqAccordion !== false) {
    const h3List = Array.from(container.querySelectorAll('h3'));
    h3List.forEach((h3) => {
      if (h3.closest('.news-item-block') || h3.closest('details') || h3.closest('.faq-static-item')) return;
      const text = (h3.textContent || '').trim();
      const nextEl = h3.nextElementSibling;
      if (nextEl && nextEl.tagName === 'P' && (/^q\d*[:.\s-]/i.test(text) || text.endsWith('?'))) {
        const details = document.createElement('details');
        details.className = 'faq-item';
        const summary = document.createElement('summary');
        summary.textContent = text;
        const answerDiv = document.createElement('div');
        answerDiv.className = 'faq-answer';
        const p = document.createElement('p');
        while (nextEl.firstChild) {
          p.appendChild(nextEl.firstChild);
        }
        answerDiv.appendChild(p);
        details.appendChild(summary);
        details.appendChild(answerDiv);
        h3.parentNode.replaceChild(details, h3);
        nextEl.remove();
      }
    });
  }

  // 4. Bind News Hub Category Filter Buttons
  const filterBtns = container.querySelectorAll('[data-news-cat]');
  filterBtns.forEach((btn) => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', async () => {
      const cat = btn.getAttribute('data-news-cat') || 'ALL';
      currentNewsCategory = cat;
      await navigateToUrl('/news', false, cat);
    });
  });

  // 5. Progressive image loading state & graceful fallback if a remote image fails
  const imgs = container.querySelectorAll('img');
  imgs.forEach((imgEl) => {
    if (imgEl.dataset.imgStateBound === '1') return;
    imgEl.dataset.imgStateBound = '1';

    if (imgEl.complete) {
      if (imgEl.naturalWidth > 0) {
        imgEl.dataset.imgState = 'loaded';
      } else if (imgEl.getAttribute('src')) {
        imgEl.dataset.imgState = 'error';
      }
      return;
    }

    imgEl.dataset.imgState = 'loading';
    imgEl.addEventListener(
      'load',
      () => {
        imgEl.dataset.imgState = 'loaded';
      },
      { once: true }
    );
    imgEl.addEventListener(
      'error',
      () => {
        imgEl.dataset.imgState = 'error';
        const figure = imgEl.closest('figure');
        if (figure) {
          figure.classList.add('hidden');
        } else {
          imgEl.classList.add('hidden');
        }
      },
      { once: true }
    );
  });
}

let floatingScrollInitialized = false;
let heroCtaOutOfView = false;

function refreshFloatingCtaVisibility() {
  if (!floatingBottomCta) return;
  if (floatingBottomCta.classList.contains('hidden')) {
    floatingBottomCta.classList.remove('is-visible');
    return;
  }
  const hasVisibleHeroCta =
    heroCtaGrid &&
    !heroCtaGrid.classList.contains('hidden') &&
    heroSectionEl &&
    !heroSectionEl.classList.contains('hidden');

  if (!hasVisibleHeroCta) {
    floatingBottomCta.classList.toggle('is-visible', window.scrollY > 180);
  } else {
    floatingBottomCta.classList.toggle('is-visible', heroCtaOutOfView);
  }
}

function setupFloatingCtaVisibility() {
  if (floatingScrollInitialized) {
    refreshFloatingCtaVisibility();
    return;
  }
  floatingScrollInitialized = true;

  if ('IntersectionObserver' in window && heroCtaGrid) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          heroCtaOutOfView = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        }
        refreshFloatingCtaVisibility();
      },
      { threshold: 0 }
    );
    observer.observe(heroCtaGrid);
  }

  window.addEventListener('scroll', refreshFloatingCtaVisibility, { passive: true });
  refreshFloatingCtaVisibility();
}

function cleanupInactiveRouteDom(payload) {
  if (dynamicContent) {
    // Abort any incomplete offscreen image requests from the outgoing view before replacing DOM
    dynamicContent.querySelectorAll('img').forEach((img) => {
      if (!img.complete) {
        img.removeAttribute('src');
        img.removeAttribute('srcset');
      }
    });
  }

  if (payload.viewType !== 'home') {
    if (heroCtaSecondary) {
      heroCtaSecondary.classList.add('hidden');
      heroCtaSecondary.textContent = '';
      heroCtaSecondary.setAttribute('href', '#');
      heroCtaSecondary.removeAttribute('rel');
    }
    if (heroCtaPrimary) {
      heroCtaPrimary.classList.add('hidden');
      heroCtaPrimary.textContent = '';
      heroCtaPrimary.setAttribute('href', '#');
      heroCtaPrimary.removeAttribute('rel');
    }
    if (heroCtaGrid) {
      heroCtaGrid.classList.add('hidden');
    }
    if (floatingBottomCta) {
      floatingBottomCta.classList.add('hidden');
      floatingBottomCta.classList.remove('is-visible');
    }
    if (floatingCtaBtn) {
      floatingCtaBtn.textContent = '';
      floatingCtaBtn.setAttribute('href', '#');
      floatingCtaBtn.removeAttribute('rel');
    }
  } else {
    if (standaloneBackBar) standaloneBackBar.classList.add('hidden');
    if (backNewsAnchor) backNewsAnchor.classList.add('hidden');
    if (subpageSwitcherPills) {
      subpageSwitcherPills.classList.add('hidden');
      subpageSwitcherPills.innerHTML = '';
    }
  }
}

function renderPartialRoutePayload(payload, options = { preserveSsrDom: false }) {
  if (!payload) return;
  currentPayload = payload;
  const shell = payload.shell || {};
  const ui = shell.uiConfig || {};
  const brand = shell.brand || {};

  applyUiThemeVariables(shell);
  applySeoAndHeadMeta(payload);

  // If SSR already rendered the exact DOM for this route, only enhance interactive widgets (< 2ms!)
  if (options.preserveSsrDom && dynamicContent) {
    enhanceContainerDom(dynamicContent, ui);
    setupFloatingCtaVisibility();
    return;
  }

  // Strictly tear down unused elements & unfinished downloads from the previous route
  cleanupInactiveRouteDom(payload);

  // Update Header Brand & News Link on SPA navigation
  if (navbarLogoText) navbarLogoText.textContent = brand.name || '';
  if (navbarLogoImg) {
    const safeLogoUrl = sanitizeSafeUrlClient(brand.logoUrl, {
      allowHash: false,
      allowDataImage: true
    });
    if (safeLogoUrl) {
      navbarLogoImg.src = safeLogoUrl;
      navbarLogoImg.alt = brand.name ? `${brand.name} Logo` : 'Logo';
      navbarLogoImg.classList.remove('hidden');
    } else {
      navbarLogoImg.src = '';
      navbarLogoImg.alt = '';
      navbarLogoImg.classList.add('hidden');
    }
  }
  if (navbarLogoLink) {
    navbarLogoLink.href = '/';
    navbarLogoLink.title = brand.name ? `${brand.name} Home` : 'Home';
  }

  const stickyHeaderEl = document.getElementById('site-sticky-header') || document.querySelector('.sticky-header');
  if (stickyHeaderEl) {
    const hideHeader = payload.isConfigured === false && (shell.headerLinks || []).length === 0;
    stickyHeaderEl.classList.toggle('hidden', hideHeader);
  }

  if (headerNewsBtn) {
    const isNewsActive = payload.viewType === 'news-hub' || payload.viewType === 'news-article';
    const hasNewsOrConfigured = (shell.newsCount || 0) > 0 || payload.isConfigured !== false;
    headerNewsBtn.classList.toggle('is-active', isNewsActive);
    if (ui.showHeaderNewsButton === false || !hasNewsOrConfigured) {
      headerNewsBtn.classList.add('hidden');
    } else {
      headerNewsBtn.classList.remove('hidden');
      const countSuffix = ui.showNewsCountInHeader !== false ? ` (${shell.newsCount || 0})` : '';
      const labelText = `${ui.headerNewsButtonLabel || 'News'}${countSuffix}`;
      headerNewsBtn.innerHTML = `<span>${escapeHtml(labelText)}</span>`;
    }
  }

  if (drawerLinksList) {
    drawerLinksList.innerHTML = buildDrawerHtmlClient(shell, payload.canonicalPath);
  }

  if (standaloneBackBar) {
    const showBack = payload.viewType !== 'home' && ui.showBreadcrumbs !== false;
    standaloneBackBar.classList.toggle('hidden', !showBack);
    if (showBack) {
      if (backHomeAnchor) {
        backHomeAnchor.textContent = ui.backToHomeLabel || '← Back to Home';
      }
      if (backNewsAnchor) {
        const showNewsBack = payload.viewType === 'news-article';
        backNewsAnchor.classList.toggle('hidden', !showNewsBack);
        backNewsAnchor.textContent = ui.allNewsBreadcrumbLabel || 'All News →';
      }
      if (subpageSwitcherPills) {
        if (ui.showSubpageSwitcherPills === false) {
          subpageSwitcherPills.classList.add('hidden');
          subpageSwitcherPills.innerHTML = '';
        } else {
          subpageSwitcherPills.classList.remove('hidden');
          subpageSwitcherPills.innerHTML = (shell.allSubpagePills || [])
            .map((pill) => {
              const isActivePill =
                payload.canonicalPath === pill.href ||
                (pill.href === '/news' && payload.viewType === 'news-article');
              return `<a href="${escapeHtml(pill.href)}" data-spa-link class="subpage-pill${
                isActivePill ? ' active' : ''
              }">${escapeHtml(pill.label)}</a>`;
            })
            .join('');
        }
      }
    }
  }

  if (heroSectionEl) {
    heroSectionEl.classList.toggle('hidden', payload.showHeroSection === false);
  }
  if (heroHeading) {
    heroHeading.textContent = payload.heroH1 || '';
  }
  if (heroCtaGrid) {
    heroCtaGrid.classList.toggle('hidden', !payload.showHeroCtaGrid);
  }

  if (heroCtaSecondary && shell.heroCtas?.secondaryCta) {
    const sec = shell.heroCtas.secondaryCta;
    const secHref = sanitizeSafeUrlClient(sec.url || '', { allowHash: true });
    const hasSec = Boolean(payload.showHeroCtaGrid && sec.label && secHref);
    heroCtaSecondary.classList.toggle('hidden', !hasSec);
    heroCtaSecondary.textContent = hasSec ? sec.label : '';
    heroCtaSecondary.setAttribute('href', hasSec ? secHref : '#');
    if (hasSec && sec.relSponsored) {
      heroCtaSecondary.setAttribute('rel', 'sponsored noopener');
    } else {
      heroCtaSecondary.removeAttribute('rel');
    }
  }
  if (heroCtaPrimary && shell.heroCtas?.primaryCta) {
    const pri = shell.heroCtas.primaryCta;
    const priHref = sanitizeSafeUrlClient(pri.url || '', { allowHash: true });
    const hasPri = Boolean(payload.showHeroCtaGrid && pri.label && priHref);
    heroCtaPrimary.classList.toggle('hidden', !hasPri);
    heroCtaPrimary.textContent = hasPri ? pri.label : '';
    heroCtaPrimary.setAttribute('href', hasPri ? priHref : '#');
    if (hasPri && (priHref === '/moreinfo' || priHref === '/download')) {
      heroCtaPrimary.setAttribute('rel', 'nofollow noopener');
    } else if (hasPri && pri.relSponsored) {
      heroCtaPrimary.setAttribute('rel', 'sponsored noopener');
    } else {
      heroCtaPrimary.removeAttribute('rel');
    }
  }

  if (floatingBottomCta && floatingCtaBtn && shell.heroCtas?.floatingCta) {
    const fl = shell.heroCtas.floatingCta;
    const flHref = sanitizeSafeUrlClient(fl.url || '', { allowHash: true });
    if (fl.enabled && fl.label && flHref && payload.viewType === 'home') {
      floatingCtaBtn.textContent = fl.label;
      floatingCtaBtn.setAttribute('href', flHref);
      if (flHref === '/moreinfo' || flHref === '/download') {
        floatingCtaBtn.setAttribute('rel', 'nofollow noopener');
      } else {
        floatingCtaBtn.removeAttribute('rel');
      }
      floatingBottomCta.classList.remove('hidden');
    } else {
      floatingCtaBtn.textContent = '';
      floatingCtaBtn.setAttribute('href', '#');
      floatingCtaBtn.removeAttribute('rel');
      floatingBottomCta.classList.add('hidden');
      floatingBottomCta.classList.remove('is-visible');
    }
  }

  if (dynamicContent) {
    dynamicContent.innerHTML = payload.renderedMainHtml || '';
    dynamicContent.setAttribute('data-ssr-path', payload.canonicalPath);
    enhanceContainerDom(dynamicContent, ui);
  }

  const summaryTextVal = shell.navigation?.footerSummary || brand.tagline || '';
  const hasBrandSummaryContent = Boolean(brand.name || summaryTextVal || brand.contactEmail);
  if (footerBrandSummaryBlock) {
    if (shell.navigation?.showFooterBrandSummary === false || !hasBrandSummaryContent) {
      footerBrandSummaryBlock.classList.add('hidden');
    } else {
      footerBrandSummaryBlock.classList.remove('hidden');
      if (footerBrandTitle) footerBrandTitle.textContent = brand.name || '';
      if (footerSummaryText) {
        footerSummaryText.textContent = summaryTextVal;
      }
      if (footerContactEmailLink) {
        if (shell.navigation?.showFooterContactEmail !== false && brand.contactEmail) {
          footerContactEmailLink.href = `mailto:${brand.contactEmail}`;
          footerContactEmailLink.textContent = brand.contactEmail;
          footerContactEmailLink.classList.remove('hidden');
        } else {
          footerContactEmailLink.classList.add('hidden');
        }
      }
    }
  }

  const disclaimerTextVal = shell.navigation?.disclaimer || '';
  if (footerDisclaimerBlock) {
    footerDisclaimerBlock.classList.toggle(
      'hidden',
      ui.showFooterDisclaimer === false || !disclaimerTextVal
    );
  }
  if (footerDisclaimerHeading) {
    footerDisclaimerHeading.textContent = shell.navigation?.disclaimerHeading || 'Legal Disclaimer';
  }
  if (footerDisclaimer) {
    footerDisclaimer.textContent = disclaimerTextVal;
  }

  let footerLinksHtmlStr = '';
  if (footerLinksList) {
    const quickLinksHtml = (shell.navigation?.footerQuickLinks || [])
      .map((ql) => {
        const safeQlUrl = sanitizeSafeUrlClient(ql.url || '', {
          allowHash: true,
          allowMailto: true
        });
        if (!safeQlUrl) return '';
        const targetAttr = ql.openInNewTab ? ' target="_blank" rel="noopener noreferrer"' : ' data-spa-link';
        return `<a href="${escapeHtml(safeQlUrl)}"${targetAttr} class="footer-link">${escapeHtml(ql.label)}</a>`;
      })
      .filter(Boolean)
      .join('');
    const legalLinksHtml = (shell.footerPages || [])
      .map(
        (pg) =>
          `<a href="/${escapeHtml(pg.slug)}" data-spa-link class="footer-link" title="${escapeHtml(pg.metaTitle)}">${escapeHtml(pg.label)}</a>`
      )
      .join('');
    footerLinksHtmlStr = [quickLinksHtml, legalLinksHtml].filter(Boolean).join('');
    footerLinksList.innerHTML = footerLinksHtmlStr;
  }
  if (footerLinksHeading) {
    footerLinksHeading.classList.toggle(
      'hidden',
      ui.showFooterLinksHeading === false || !footerLinksHtmlStr
    );
    footerLinksHeading.textContent = shell.navigation?.siteLinksHeading || '';
  }
  const footerDivider = document.getElementById('footer-divider');
  const copyrightVal = shell.navigation?.copyright || '';
  const showFooterSummaryVisible = shell.navigation?.showFooterBrandSummary !== false && hasBrandSummaryContent;
  const showDisclaimerVisible = ui.showFooterDisclaimer !== false && Boolean(disclaimerTextVal);
  const hasAnyFooterContent = Boolean(copyrightVal || showFooterSummaryVisible || showDisclaimerVisible || footerLinksHtmlStr);
  const siteFooterEl = document.getElementById('site-footer') || document.querySelector('.site-footer');
  if (siteFooterEl) {
    siteFooterEl.classList.toggle('hidden', !hasAnyFooterContent);
  }
  if (footerDivider) {
    footerDivider.classList.toggle('hidden', !hasAnyFooterContent);
  }
  if (footerCopyright) {
    footerCopyright.textContent = copyrightVal;
  }

  setupFloatingCtaVisibility();
}

async function fetchStaticRoutePayload(pathname, newsCat = 'ALL', signal = undefined) {
  const cleanPath = (pathname || '/').split('?')[0].replace(/\/+$/, '') || '/';
  const cacheKey = `${cleanPath}::${newsCat}`;

  if (routeCache.has(cacheKey)) {
    const cached = routeCache.get(cacheKey);
    cacheRoutePayload(cacheKey, cached);
    return cached;
  }

  if (newsCat === 'ALL') {
    const jsonFileName = routePathToStaticJsonName(cleanPath);
    try {
      const staticRes = await fetch(`/static-routes/${jsonFileName}`, {
        cache: 'no-cache',
        signal
      });
      const contentType = (staticRes.headers.get('content-type') || '').toLowerCase();
      if (staticRes.ok && contentType.includes('application/json')) {
        const staticPayload = await staticRes.json();
        if (staticPayload && staticPayload.canonicalPath && staticPayload.renderedMainHtml) {
          cacheRoutePayload(cacheKey, staticPayload);
          return staticPayload;
        }
      }
    } catch (err) {
      if (err && err.name === 'AbortError') throw err;
      // Fall back to /api/route if running dynamically
    }
  }

  const res = await fetch(
    `/api/route?path=${encodeURIComponent(cleanPath)}&cat=${encodeURIComponent(newsCat)}`,
    { signal }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (!ct.includes('application/json')) throw new Error('Non-JSON route payload');
  const data = await res.json();
  if (data?.success && data?.payload) {
    cacheRoutePayload(cacheKey, data.payload);
    return data.payload;
  }
  throw new Error('Invalid route payload');
}

async function navigateToUrl(targetHref, pushState = true, newsCat = 'ALL') {
  setDrawerState(false);

  let urlObj;
  try {
    urlObj = new URL(targetHref, window.location.origin);
  } catch {
    return;
  }
  if (
    (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') ||
    urlObj.origin !== window.location.origin
  ) {
    return;
  }
  const targetPath = urlObj.pathname || '/';
  const targetHash = urlObj.hash || '';

  if (
    targetPath === '/moreinfo' ||
    targetPath.startsWith('/moreinfo/') ||
    targetPath === '/download' ||
    targetPath.startsWith('/download/')
  ) {
    window.location.href = targetPath + urlObj.search + targetHash;
    return;
  }

  if (
    currentPayload &&
    targetPath === window.location.pathname &&
    targetHash &&
    newsCat === currentNewsCategory
  ) {
    if (pushState) window.history.pushState({}, '', `${targetPath}${targetHash}`);
    const anchorEl = document.getElementById(targetHash.slice(1));
    if (anchorEl) anchorEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  if (activeNavAbortController) {
    activeNavAbortController.abort();
  }
  const controller = new AbortController();
  activeNavAbortController = controller;

  try {
    currentNewsCategory = newsCat;
    const payload = await fetchStaticRoutePayload(targetPath, newsCat, controller.signal);
    if (activeNavAbortController !== controller) return;
    activeNavAbortController = null;

    if (pushState) {
      window.history.pushState({}, '', `${targetPath}${targetHash}`);
    }
    renderPartialRoutePayload(payload, { preserveSsrDom: false });

    if (targetHash) {
      setTimeout(() => {
        const el = document.getElementById(targetHash.slice(1));
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 30);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    window.location.href = targetPath + urlObj.search + targetHash;
  }
}

document.addEventListener('click', (e) => {
  const link = e.target.closest('a');
  if (!link) return;

  const href = link.getAttribute('href');
  if (!href) return;

  if (
    href.startsWith('http://') ||
    href.startsWith('https://') ||
    href.startsWith('mailto:') ||
    href.startsWith('tel:') ||
    link.getAttribute('target') === '_blank'
  ) {
    return;
  }

  if (
    href === '/moreinfo' ||
    href.startsWith('/moreinfo/') ||
    href === '/download' ||
    href.startsWith('/download/')
  ) {
    return;
  }

  if (href.startsWith('#')) {
    e.preventDefault();
    setDrawerState(false);
    const id = href.slice(1);
    if (!id) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (currentPayload && currentPayload.viewType !== 'home') {
      navigateToUrl(`/#${id}`, true);
      return;
    }
    const targetEl = document.getElementById(id);
    if (targetEl) {
      window.history.pushState({}, '', `/#${id}`);
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return;
  }

  if (href.startsWith('/') || link.hasAttribute('data-spa-link')) {
    e.preventDefault();
    navigateToUrl(href, true);
  }
});

window.addEventListener('popstate', () => {
  navigateToUrl(window.location.pathname + window.location.hash, false);
});

async function bootstrapPublicPortal() {
  const currentPathname = (window.location.pathname || '/').replace(/\/+$/, '') || '/';

  if (window.__INITIAL_ROUTE_PAYLOAD__) {
    const initialPayload = window.__INITIAL_ROUTE_PAYLOAD__;
    const ssrPath = dynamicContent ? dynamicContent.getAttribute('data-ssr-path') : null;
    const hasSsrHtml = Boolean(dynamicContent && dynamicContent.innerHTML.trim().length > 0);
    const isExactMatch =
      hasSsrHtml &&
      (ssrPath === currentPathname || initialPayload.canonicalPath === currentPathname);

    if (initialPayload.renderedMainHtml) {
      cacheRoutePayload(`${initialPayload.canonicalPath}::ALL`, initialPayload);
    }

    if (isExactMatch || initialPayload.renderedMainHtml) {
      renderPartialRoutePayload(initialPayload, { preserveSsrDom: isExactMatch });

      if (window.location.hash) {
        const id = window.location.hash.slice(1);
        const targetEl = document.getElementById(id);
        if (targetEl) {
          setTimeout(() => targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
        }
      }
      return;
    }
  }

  try {
    const payload = await fetchStaticRoutePayload(currentPathname, 'ALL');
    renderPartialRoutePayload(payload, { preserveSsrDom: false });
  } catch (err) {
    console.warn('Static route initialization fallback:', err);
  }
}

bootstrapPublicPortal();
