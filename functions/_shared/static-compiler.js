/**
 * ============================================================================
 * EDGE STATIC PUBLIC WEBSITE COMPILER (_shared/static-compiler.js)
 * Zero-Node-dependency compiler for Cloudflare Pages Functions.
 * Generates the complete static public site bundle (`index.html`, `news/index.html`,
 * `news/:slug/index.html`, `:pageSlug/index.html`, `moreinfo/index.html`,
 * `download/index.html`, `static-routes/*.json`, `sitemap.xml`, `robots.txt`,
 * `feed.xml`, `manifest.webmanifest`, `_headers`) without any Firebase SDK.
 * ============================================================================
 */

import { cleanEnvVal, EMPTY_ADMIN_CONFIG } from './auth.js';

export function escapeHtmlEdge(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function escapeXmlEdge(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateSlugEdge(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function normalizeDomainUrlEdge(rawDomain, forceHttps = true) {
  let clean = String(rawDomain || '').trim();
  if (!clean) return 'https://example.com';
  clean = clean.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(clean)) {
    clean = `${forceHttps ? 'https' : 'http'}://${clean}`;
  } else if (forceHttps && clean.startsWith('http://')) {
    clean = clean.replace(/^http:\/\//i, 'https://');
  }
  return clean;
}

export function optimizeCloudinaryUrlEdge(url) {
  if (!url || typeof url !== 'string') return '';
  if (!url.includes('res.cloudinary.com') || !url.includes('/image/upload/')) return url;
  if (url.includes('f_auto') || url.includes('q_auto')) return url;
  return url.replace('/image/upload/', '/image/upload/f_auto,q_auto/');
}

export function toAbsoluteAssetUrlEdge(urlOrPath, baseCanonical) {
  const raw = String(urlOrPath || '').trim();
  if (!raw) return '';
  const optimized = optimizeCloudinaryUrlEdge(raw);
  if (/^https?:\/\//i.test(optimized) || optimized.startsWith('data:')) {
    return optimized;
  }
  const cleanBase = String(baseCanonical || '').replace(/\/+$/, '');
  const cleanRel = optimized.startsWith('/') ? optimized : `/${optimized}`;
  return `${cleanBase}${cleanRel}`;
}

export function routePathToStaticJsonNameEdge(pathname) {
  const clean = String(pathname || '/').split('?')[0].replace(/^\/+|\/+$/g, '');
  if (!clean) return 'index.json';
  return `${clean.replace(/\//g, '--')}.json`;
}

export function normalizeBaseUrlEdge(config) {
  const forceHttps = config?.domainConfig?.forceHttps !== false;
  const raw = config?.seo?.canonicalUrl || config?.domainConfig?.primaryDomain || 'https://example.com';
  return normalizeDomainUrlEdge(raw, forceHttps);
}

export function generateSitemapXmlEdge(config) {
  const baseUrl = normalizeBaseUrlEdge(config);
  const nowIso = new Date().toISOString().split('T')[0];
  const heroImg = config?.hero?.bannerImageUrl
    ? toAbsoluteAssetUrlEdge(config.hero.bannerImageUrl, baseUrl)
    : '';
  const urls = [
    {
      loc: `${baseUrl}/`,
      priority: '1.0',
      changefreq: 'daily',
      images: heroImg
        ? [{ loc: heroImg, title: config?.hero?.bannerAlt || config?.brand?.name || 'Banner' }]
        : []
    }
  ];

  const articles = config?.newsSection?.articles || [];
  if (config?.newsSection?.enabled !== false && articles.length > 0) {
    urls.push({ loc: `${baseUrl}/news`, priority: '0.8', changefreq: 'daily', images: [] });
    for (const art of articles) {
      const slug = generateSlugEdge(art.slug || art.title);
      if (slug) {
        const cov = art.coverImageUrl ? toAbsoluteAssetUrlEdge(art.coverImageUrl, baseUrl) : '';
        urls.push({
          loc: `${baseUrl}/news/${slug}`,
          priority: '0.7',
          changefreq: 'weekly',
          images: cov ? [{ loc: cov, title: art.title || slug }] : []
        });
      }
    }
  }

  for (const pg of config?.pages || []) {
    const slug = generateSlugEdge(pg.slug || pg.label);
    if (pg.showInFooter !== false && slug) {
      const pgImg = pg.bannerImageUrl ? toAbsoluteAssetUrlEdge(pg.bannerImageUrl, baseUrl) : '';
      urls.push({
        loc: `${baseUrl}/${slug}`,
        priority: '0.5',
        changefreq: 'monthly',
        images: pgImg ? [{ loc: pgImg, title: pg.h1 || pg.label || slug }] : []
      });
    }
  }

  const nodes = urls
    .map((u) => {
      const imgTags = (u.images || [])
        .map(
          (img) =>
            `    <image:image>\n      <image:loc>${escapeXmlEdge(img.loc)}</image:loc>\n      <image:title>${escapeXmlEdge(img.title)}</image:title>\n    </image:image>`
        )
        .join('\n');
      return `  <url>\n    <loc>${escapeXmlEdge(u.loc)}</loc>\n    <lastmod>${nowIso}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>${imgTags ? `\n${imgTags}` : ''}\n  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${nodes}\n</urlset>`;
}

export function generateRobotsTxtEdge(config) {
  const baseUrl = normalizeBaseUrlEdge(config);
  const custom = cleanEnvVal(config?.domainConfig?.customRobotsTxt);
  const baseRules =
    custom ||
    'User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /moreinfo\nDisallow: /download\nDisallow: /api/';
  const lines = baseRules
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => !/^sitemap:/i.test(l));
  if (config?.domainConfig?.enableSitemapXml !== false) {
    lines.push('', `Sitemap: ${baseUrl}/sitemap.xml`);
  }
  return lines.join('\n');
}

export function generateRssFeedXmlEdge(config) {
  const baseUrl = normalizeBaseUrlEdge(config);
  const brand = (config?.brand?.name || 'Site').trim();
  const desc = config?.seo?.metaDescription || config?.brand?.tagline || '';
  const items = (config?.newsSection?.articles || [])
    .slice(0, 20)
    .map((art) => {
      const slug = generateSlugEdge(art.slug || art.title);
      const link = `${baseUrl}/news/${slug}`;
      return `    <item>\n      <title>${escapeXmlEdge(art.title)}</title>\n      <link>${escapeXmlEdge(link)}</link>\n      <guid isPermaLink="true">${escapeXmlEdge(link)}</guid>\n      <description>${escapeXmlEdge(art.summary || '')}</description>\n    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n    <title>${escapeXmlEdge(brand)} News</title>\n    <link>${escapeXmlEdge(baseUrl)}</link>\n    <description>${escapeXmlEdge(desc)}</description>\n${items}\n  </channel>\n</rss>`;
}

export function generateWebManifestJsonEdge(config) {
  const brand = (config?.brand?.name || '').trim();
  const icon = optimizeCloudinaryUrlEdge(
    config?.brand?.searchLogoUrl || config?.brand?.faviconUrl || config?.brand?.logoUrl || ''
  );
  const icons = [];
  if (icon) {
    const isSvg = icon.toLowerCase().endsWith('.svg');
    icons.push({
      src: icon,
      sizes: isSvg ? 'any' : '512x512',
      type: isSvg ? 'image/svg+xml' : 'image/png',
      purpose: 'any'
    });
  }
  const manifestName = config?.brand?.tagline
    ? (brand ? `${brand} — ${config.brand.tagline}` : config.brand.tagline)
    : brand;
  return JSON.stringify(
    {
      name: manifestName,
      short_name: config?.brand?.shortName || brand,
      description: config?.seo?.metaDescription || config?.hero?.metaDescription || '',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: config?.uiConfig?.surfaceBackgroundColor || '#FFFFFF',
      theme_color: config?.brand?.themeColor || config?.brand?.accentColor || '#EF4444',
      icons
    },
    null,
    2
  );
}

function hasPackageSpecsDataEdge(specs) {
  if (!specs || specs.enabled === false) return false;
  return Boolean(
    specs.appName ||
      specs.version ||
      specs.fileSize ||
      specs.operatingSystem ||
      specs.packageFormat ||
      specs.sha256 ||
      specs.license ||
      specs.lastUpdated ||
      specs.securityStatus ||
      (Array.isArray(specs.customRows) && specs.customRows.length > 0)
  );
}

function isSiteConfiguredEdge(config) {
  const brandName = String(config?.brand?.name || '').trim();
  const heroH1 = String(config?.hero?.h1 || '').trim();
  const heroIntro = String(config?.hero?.introHtml || '').trim();
  const heroBanner = config?.hero?.showBanner !== false && Boolean(String(config?.hero?.bannerImageUrl || '').trim());
  const hasVisibleSection = Array.isArray(config?.sections) && config.sections.some((s) => s && s.visible !== false);
  const hasNews = Array.isArray(config?.newsSection?.articles) && config.newsSection.articles.length > 0;
  const hasFaqs = Array.isArray(config?.faqsSection?.items) && config.faqsSection.items.length > 0;
  const hasRaw = Boolean(String(config?.content?.rawHtml || '').trim());
  const hasPages = Array.isArray(config?.pages) && config.pages.length > 0;
  const hasSpecs = hasPackageSpecsDataEdge(config?.packageSpecs);
  return Boolean(
    brandName ||
      heroH1 ||
      heroIntro ||
      heroBanner ||
      hasVisibleSection ||
      hasNews ||
      hasFaqs ||
      hasRaw ||
      hasPages ||
      hasSpecs
  );
}

function resolveRouteEdge(pathname, config) {
  const cleanPath = String(pathname || '/').split('?')[0].replace(/\/+$/, '') || '/';
  const brandName = (config?.brand?.name || '').trim();
  const brandSuffix = brandName ? ` | ${brandName}` : '';

  if (cleanPath === '/news') {
    return {
      viewType: 'news-hub',
      metaTitle: config?.newsSection?.metaTitle || `Daily News & Updates${brandSuffix}`,
      metaDescription: config?.newsSection?.metaDescription || config?.seo?.metaDescription || '',
      canonicalPath: '/news',
      ogImage: config?.seo?.ogImageUrl || config?.hero?.bannerImageUrl || ''
    };
  }

  if (cleanPath.startsWith('/news/')) {
    const slug = cleanPath.slice('/news/'.length).trim().toLowerCase();
    const article = (config?.newsSection?.articles || []).find(
      (a) => generateSlugEdge(a.slug || a.title) === slug
    );
    if (article) {
      return {
        viewType: 'news-article',
        metaTitle: article.metaTitle || `${article.title}${brandSuffix}`,
        metaDescription: article.metaDescription || article.summary || config?.seo?.metaDescription || '',
        canonicalPath: `/news/${generateSlugEdge(article.slug || article.title)}`,
        ogImage: article.coverImageUrl || config?.seo?.ogImageUrl || config?.hero?.bannerImageUrl || '',
        article
      };
    }
  }

  const pageSlug = cleanPath.startsWith('/page/') ? cleanPath.slice(6).toLowerCase() : cleanPath.slice(1).toLowerCase();
  if (pageSlug) {
    const page = (config?.pages || []).find((pg) => generateSlugEdge(pg.slug || pg.label) === pageSlug);
    if (page) {
      const s = generateSlugEdge(page.slug || page.label);
      return {
        viewType: 'standalone-page',
        metaTitle: page.metaTitle || `${page.h1 || page.label}${brandSuffix}`,
        metaDescription: page.metaDescription || config?.seo?.metaDescription || '',
        canonicalPath: `/${s}`,
        ogImage: page.bannerImageUrl || config?.seo?.ogImageUrl || config?.hero?.bannerImageUrl || '',
        page
      };
    }
  }

  return {
    viewType: 'home',
    metaTitle: config?.seo?.metaTitle || config?.hero?.metaTitle || config?.hero?.h1 || brandName || 'Coming Soon',
    metaDescription: config?.seo?.metaDescription || config?.hero?.metaDescription || '',
    canonicalPath: '/',
    ogImage: config?.seo?.ogImageUrl || config?.hero?.bannerImageUrl || ''
  };
}

function buildJsonLdEdge(config, route) {
  const baseCanonical = normalizeBaseUrlEdge(config);
  const fullUrl = route.canonicalPath === '/' ? `${baseCanonical}/` : `${baseCanonical}${route.canonicalPath}`;
  const brandName = (config?.brand?.name || '').trim();
  const rawLogo = config?.brand?.searchLogoUrl || config?.brand?.logoUrl || config?.brand?.faviconUrl || '';
  const orgLogoUrl = rawLogo ? toAbsoluteAssetUrlEdge(rawLogo, baseCanonical) : '';

  const orgNode = {
    '@type': 'Organization',
    '@id': `${baseCanonical}/#organization`,
    name: brandName || 'Organization',
    url: `${baseCanonical}/`
  };
  if (orgLogoUrl) {
    orgNode.logo = { '@type': 'ImageObject', url: orgLogoUrl, width: 512, height: 512 };
    orgNode.image = orgLogoUrl;
  }

  const graph = [
    {
      '@type': 'WebSite',
      '@id': `${baseCanonical}/#website`,
      url: `${baseCanonical}/`,
      name: brandName || 'Website',
      alternateName: config?.brand?.shortName || brandName || 'Website',
      publisher: { '@id': `${baseCanonical}/#organization` }
    },
    orgNode,
    {
      '@type': route.viewType === 'news-article' ? 'NewsArticle' : route.viewType === 'news-hub' ? 'CollectionPage' : 'WebPage',
      '@id': `${fullUrl}#webpage`,
      url: fullUrl,
      name: route.metaTitle,
      description: route.metaDescription,
      isPartOf: { '@id': `${baseCanonical}/#website` }
    }
  ];

  return { '@context': 'https://schema.org', '@graph': graph };
}

function renderSpecsHtmlEdge(config) {
  const specs = config?.packageSpecs;
  if (!hasPackageSpecsDataEdge(specs)) return '';
  const rows = [];
  const appTitle = specs.appName || config?.brand?.name || '';
  if (appTitle) rows.push(`<tr><th>Application Name</th><td><strong>${escapeHtmlEdge(appTitle)}</strong></td></tr>`);
  if (specs.version) rows.push(`<tr><th>Latest Version</th><td><code>${escapeHtmlEdge(specs.version)}</code></td></tr>`);
  if (specs.fileSize) rows.push(`<tr><th>Package Size</th><td>${escapeHtmlEdge(specs.fileSize)}</td></tr>`);
  if (specs.operatingSystem) rows.push(`<tr><th>System Requirements</th><td>${escapeHtmlEdge(specs.operatingSystem)}</td></tr>`);
  if (specs.packageFormat) rows.push(`<tr><th>Package Format</th><td>${escapeHtmlEdge(specs.packageFormat)}</td></tr>`);
  if (specs.license) rows.push(`<tr><th>License &amp; Cost</th><td>${escapeHtmlEdge(specs.license)}</td></tr>`);
  if (specs.securityStatus) rows.push(`<tr><th>Security Scan Status</th><td><span class="spec-verified-badge">${escapeHtmlEdge(specs.securityStatus.replace(/^✓\s*/, ''))}</span></td></tr>`);
  if (specs.lastUpdated) rows.push(`<tr><th>Last Updated</th><td>${escapeHtmlEdge(specs.lastUpdated)}</td></tr>`);
  if (specs.sha256) rows.push(`<tr><th>SHA-256 Checksum</th><td><div class="hash-cell-wrap"><code>${escapeHtmlEdge(specs.sha256)}</code></div></td></tr>`);
  if (Array.isArray(specs.customRows)) {
    for (const r of specs.customRows) {
      if (r?.label || r?.value) {
        rows.push(`<tr><th>${escapeHtmlEdge(r.label)}</th><td>${escapeHtmlEdge(r.value)}</td></tr>`);
      }
    }
  }
  return `
    <section id="technical-specifications">
      <h2>${escapeHtmlEdge(specs.heading || 'Technical Package Specifications')}</h2>
      <div class="table-scroll-wrapper">
        <table>
          <tbody>
            ${rows.join('\n            ')}
          </tbody>
        </table>
      </div>
    </section>`;
}

function renderMainContentEdge(route, config) {
  if (route.viewType === 'news-article' && route.article) {
    const a = route.article;
    const cover = a.coverImageUrl
      ? `<figure class="media-figure"><img src="${escapeHtmlEdge(optimizeCloudinaryUrlEdge(a.coverImageUrl))}" alt="${escapeHtmlEdge(a.title)}" loading="eager" referrerpolicy="no-referrer" /></figure>`
      : '';
    return `<article><h1>${escapeHtmlEdge(a.title)}</h1><p class="news-meta-line">${escapeHtmlEdge(a.category || 'Update')} · ${escapeHtmlEdge(a.publishedDate || '')} · ${escapeHtmlEdge(a.author || config?.brand?.name || '')}</p>${cover}${a.htmlContent || `<p>${escapeHtmlEdge(a.summary || '')}</p>`}</article>`;
  }

  if (route.viewType === 'news-hub') {
    const articles = config?.newsSection?.articles || [];
    const cards = articles
      .map((art) => {
        const slug = generateSlugEdge(art.slug || art.title);
        return `<article class="news-item-block"><div class="news-meta-line"><span class="news-category-tag">${escapeHtmlEdge(art.category || 'Update')}</span><span>·</span><span>${escapeHtmlEdge(art.publishedDate || '')}</span></div><h3><a class="news-title-link" href="/news/${escapeHtmlEdge(slug)}" data-spa-link>${escapeHtmlEdge(art.title)}</a></h3><p class="news-summary-text">${escapeHtmlEdge(art.summary || '')}</p><a class="news-read-more" href="/news/${escapeHtmlEdge(slug)}" data-spa-link>Read full update →</a></article>`;
      })
      .join('');
    return `<section><h1>${escapeHtmlEdge(config?.newsSection?.heading || 'Daily News & Updates')}</h1>${cards || '<p>No news updates published yet.</p>'}</section>`;
  }

  if (route.viewType === 'standalone-page' && route.page) {
    const pg = route.page;
    const banner = pg.bannerImageUrl
      ? `<figure class="media-figure"><img src="${escapeHtmlEdge(optimizeCloudinaryUrlEdge(pg.bannerImageUrl))}" alt="${escapeHtmlEdge(pg.h1 || pg.label)}" loading="eager" referrerpolicy="no-referrer" /></figure>`
      : '';
    return `<article><h1>${escapeHtmlEdge(pg.h1 || pg.label)}</h1>${banner}${pg.htmlContent || ''}</article>`;
  }

  // Homepage
  const intro = config?.hero?.introHtml ? `<div class="hero-intro-block">${config.hero.introHtml}</div>` : '';
  const banner =
    config?.hero?.showBanner !== false && config?.hero?.bannerImageUrl
      ? `<figure class="media-figure"><img src="${escapeHtmlEdge(optimizeCloudinaryUrlEdge(config.hero.bannerImageUrl))}" alt="${escapeHtmlEdge(config.hero.bannerAlt || config?.brand?.name || 'Banner')}" loading="eager" fetchpriority="high" referrerpolicy="no-referrer" /></figure>`
      : '';
  const specsHtml = renderSpecsHtmlEdge(config);
  const sectionsHtml = (config?.sections || [])
    .filter((s) => s && s.visible !== false)
    .map(
      (s) =>
        `<section id="${escapeHtmlEdge(s.anchorId || generateSlugEdge(s.heading))}"><h2>${escapeHtmlEdge(s.heading)}</h2>${s.htmlContent || ''}</section>`
    )
    .join('');
  const rawHtml = config?.content?.rawHtml ? `<section id="additional-details">${config.content.rawHtml}</section>` : '';
  const faqsHtml =
    config?.faqsSection?.enabled !== false && Array.isArray(config?.faqsSection?.items) && config.faqsSection.items.length > 0
      ? `<section id="faqs"><h2>${escapeHtmlEdge(config.faqsSection.heading || 'Frequently Asked Questions')}</h2>${config.faqsSection.items
          .map(
            (f) =>
              `<details class="faq-item"><summary>${escapeHtmlEdge(f.question)}</summary><div class="faq-answer"><p>${escapeHtmlEdge(f.answer)}</p></div></details>`
          )
          .join('')}</section>`
      : '';

  const combined = `${intro}${banner}${specsHtml}${sectionsHtml}${rawHtml}${faqsHtml}`;
  if (!combined) {
    if ((config?.hero?.h1 || '').trim() || (config?.brand?.name || '').trim()) {
      return '';
    }
    return '<section class="site-coming-soon"><h1>Coming Soon</h1><p>This website is currently being prepared.</p></section>';
  }
  return combined;
}

export function buildPartialRoutePayloadEdge(pathname, config) {
  const safe = config || EMPTY_ADMIN_CONFIG;
  const route = resolveRouteEdge(pathname, safe);
  const configured = isSiteConfiguredEdge(safe);
  const baseCanonical = normalizeBaseUrlEdge(safe);
  const canonicalUrl = route.canonicalPath === '/' ? `${baseCanonical}/` : `${baseCanonical}${route.canonicalPath}`;
  const mainHtml = renderMainContentEdge(route, safe);
  const jsonLd = buildJsonLdEdge(safe, route);
  const heroH1 = safe?.hero?.h1 || safe?.brand?.name || '';
  const secCta = safe?.hero?.secondaryCta || EMPTY_ADMIN_CONFIG.hero.secondaryCta;
  const priCta = safe?.hero?.primaryCta || EMPTY_ADMIN_CONFIG.hero.primaryCta;
  const hasSecCta = Boolean(secCta?.label && secCta?.url);
  const hasPriCta = Boolean(priCta?.label && priCta?.url);
  const showHeroCtaGrid = route.viewType === 'home' && safe?.uiConfig?.showHeroCtaButtons !== false && (hasSecCta || hasPriCta);
  const showHeroSection = route.viewType === 'home'
    ? (safe?.uiConfig?.showHeroSection !== false && Boolean(heroH1 || showHeroCtaGrid))
    : true;

  return {
    viewType: route.viewType,
    isConfigured: configured,
    canonicalPath: route.canonicalPath,
    canonicalUrl,
    metaTitle: route.metaTitle,
    metaDescription: route.metaDescription,
    ogImage: route.ogImage ? toAbsoluteAssetUrlEdge(route.ogImage, baseCanonical) : '',
    heroH1,
    showHeroSection,
    showHeroCtaGrid,
    renderedMainHtml: mainHtml,
    jsonLd,
    shell: {
      brand: safe?.brand || EMPTY_ADMIN_CONFIG.brand,
      brandName: (safe?.brand?.name || '').trim(),
      logoUrl: optimizeCloudinaryUrlEdge(safe?.brand?.logoUrl || ''),
      faviconUrl: optimizeCloudinaryUrlEdge(safe?.brand?.faviconUrl || safe?.brand?.logoUrl || ''),
      accentColor: safe?.brand?.accentColor || '#EF4444',
      buttonTextColor: safe?.uiConfig?.buttonTextColor || '#FFFFFF',
      uiConfig: safe?.uiConfig || EMPTY_ADMIN_CONFIG.uiConfig,
      heroCtas: {
        primaryCta: priCta,
        secondaryCta: secCta,
        floatingCta: safe?.hero?.floatingCta || EMPTY_ADMIN_CONFIG.hero.floatingCta
      },
      footerPages: (safe?.pages || []).filter((p) => p && p.showInFooter !== false),
      newsCount: (safe?.newsSection?.articles || []).length,
      navigation: safe?.navigation || EMPTY_ADMIN_CONFIG.navigation
    },
    compiledAt: Date.now()
  };
}

const FALLBACK_EDGE_HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Site</title>
  <meta name="description" content="" />
  <link rel="canonical" href="" />
  <link rel="icon" href="" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="" />
  <meta property="og:description" content="" />
  <meta property="og:url" content="" />
  <meta property="og:image" content="" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="" />
  <meta name="twitter:description" content="" />
  <meta name="twitter:image" content="" />
  <script id="dynamic-jsonld-schema" type="application/ld+json">{}</script>
</head>
<body>
  <div class="app-viewport">
    <header class="sticky-header">
      <div class="header-inner">
        <a href="/" class="brand-logo-container" id="navbar-logo-link" data-spa-link>
          <img id="navbar-logo-img" class="brand-logo-img hidden" src="" alt="" width="30" height="30" />
          <span id="navbar-logo-text" class="brand-logo-text"></span>
        </a>
        <div class="header-right-actions">
          <a href="/news" id="header-news-btn" class="header-news-link" data-spa-link>News</a>
        </div>
      </div>
    </header>
    <div class="page-content-shell">
      <section id="hero-section" class="hero-container">
        <h1 id="hero-heading" class="hero-title"></h1>
        <div id="hero-cta-grid" class="hero-action-grid">
          <a id="hero-cta-secondary" class="btn-secondary hidden" href="#"></a>
          <a id="hero-cta-primary" class="btn-primary hidden" href="#"></a>
        </div>
      </section>
      <main id="dynamic-content" class="content-container prose-container"></main>
    </div>
    <footer class="site-footer">
      <div class="footer-inner">
        <div id="footer-brand-title" class="footer-brand-title"></div>
        <div id="footer-links-list" class="footer-links-stack"></div>
        <p id="footer-copyright" class="footer-copyright-text"></p>
      </div>
    </footer>
    <script type="module" src="/app.js"></script>
  </div>
</body>
</html>`;

export function renderCompleteStaticPageHtmlEdge(indexHtmlTemplate, config, pathname = '/') {
  const safe = config || EMPTY_ADMIN_CONFIG;
  const payload = buildPartialRoutePayloadEdge(pathname, safe);
  const title = escapeHtmlEdge(payload.metaTitle);
  const desc = escapeHtmlEdge(payload.metaDescription);
  const canonical = escapeHtmlEdge(payload.canonicalUrl);
  const ogImg = escapeHtmlEdge(payload.ogImage);
  const rawBrand = (safe?.brand?.name || '').trim();
  const brandName = escapeHtmlEdge(rawBrand);
  const logoSrc = escapeHtmlEdge(optimizeCloudinaryUrlEdge(safe?.brand?.logoUrl || ''));
  const jsonLdStr = JSON.stringify(payload.jsonLd).replace(/<\/script/gi, '<\\/script');

  let html = indexHtmlTemplate || FALLBACK_EDGE_HTML_TEMPLATE;
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  html = html.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i, `<meta name="description" content="${desc}" />`);
  html = html.replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i, `<link rel="canonical" href="${canonical}" />`);
  html = html.replace(/<link\s+rel="icon"\s+href="[^"]*"\s*\/?>/i, `<link rel="icon" href="${escapeHtmlEdge(payload.shell.faviconUrl)}" />`);
  html = html.replace(/<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:title" content="${title}" />`);
  html = html.replace(/<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:description" content="${desc}" />`);
  html = html.replace(/<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:url" content="${canonical}" />`);
  html = html.replace(/<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:image" content="${ogImg}" />`);
  html = html.replace(/<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:title" content="${title}" />`);
  html = html.replace(/<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:description" content="${desc}" />`);
  html = html.replace(/<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:image" content="${ogImg}" />`);

  html = html.replace(
    /<img\b[^>]*id="navbar-logo-img"[^>]*>/i,
    `<img id="navbar-logo-img" class="brand-logo-img${logoSrc ? '' : ' hidden'}" src="${logoSrc}" alt="${escapeHtmlEdge(rawBrand ? `${rawBrand} Logo` : '')}" width="30" height="30" loading="eager" referrerpolicy="no-referrer" />`
  );
  html = html.replace(/<span id="navbar-logo-text" class="brand-logo-text">[\s\S]*?<\/span>/i, `<span id="navbar-logo-text" class="brand-logo-text">${brandName}</span>`);
  const hideEmptyHeader = !payload.isConfigured && (safe?.navigation?.headerLinks || []).length === 0;
  html = html.replace(
    /<header(?:\s+id="site-sticky-header")?\s+class="sticky-header(?:\s+hidden)?"[^>]*>/i,
    `<header id="site-sticky-header" class="sticky-header${hideEmptyHeader ? ' hidden' : ''}">`
  );
  html = html.replace(/<h1 id="hero-heading" class="hero-title">[\s\S]*?<\/h1>/i, `<h1 id="hero-heading" class="hero-title">${escapeHtmlEdge(payload.heroH1)}</h1>`);
  html = html.replace(/<section id="hero-section" class="hero-container(?:\s+hidden)?">/i, `<section id="hero-section" class="hero-container${payload.showHeroSection ? '' : ' hidden'}">`);
  html = html.replace(/<div id="hero-cta-grid" class="hero-action-grid(?:\s+hidden)?">/i, `<div id="hero-cta-grid" class="hero-action-grid${payload.showHeroCtaGrid ? '' : ' hidden'}">`);
  html = html.replace(
    /<main id="dynamic-content" class="content-container prose-container"[^>]*>[\s\S]*?<\/main>/i,
    `<main id="dynamic-content" class="content-container prose-container" tabindex="-1" data-ssr-path="${escapeHtmlEdge(payload.canonicalPath)}">${payload.renderedMainHtml}</main>`
  );
  html = html.replace(/<div id="footer-brand-title" class="footer-brand-title">[\s\S]*?<\/div>/i, `<div id="footer-brand-title" class="footer-brand-title">${brandName}</div>`);
  const copyrightStr = String(safe?.navigation?.copyright || '').trim();
  html = html.replace(/<p id="footer-copyright" class="footer-copyright-text">[\s\S]*?<\/p>/i, `<p id="footer-copyright" class="footer-copyright-text">${escapeHtmlEdge(copyrightStr)}</p>`);

  const footerLinks = (payload.shell.footerPages || [])
    .map((pg) => `<a href="/${escapeHtmlEdge(generateSlugEdge(pg.slug || pg.label))}" data-spa-link class="footer-link">${escapeHtmlEdge(pg.label)}</a>`)
    .join('');
  html = html.replace(/<div id="footer-links-list" class="footer-links-stack">[\s\S]*?<\/div>/i, `<div id="footer-links-list" class="footer-links-stack">${footerLinks}</div>`);

  const hasFooterContent = Boolean(
    rawBrand ||
      safe?.brand?.tagline ||
      safe?.brand?.contactEmail ||
      safe?.navigation?.footerBrandSummary ||
      safe?.navigation?.disclaimer ||
      footerLinks ||
      copyrightStr
  );
  html = html.replace(
    /<footer(?:\s+id="site-footer")?\s+class="site-footer(?:\s+hidden)?">/i,
    `<footer id="site-footer" class="site-footer${hasFooterContent ? '' : ' hidden'}">`
  );

  const gaRaw = String(safe?.domainConfig?.googleAnalyticsId || '').trim();
  const gaSnippet =
    /^(G|GT|AW|DC)-[A-Z0-9]{4,24}$/i.test(gaRaw) || /^UA-\d{4,12}-\d{1,4}$/i.test(gaRaw)
      ? `\n  <script async src="https://www.googletagmanager.com/gtag/js?id=${escapeHtmlEdge(gaRaw)}"></script>\n  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${escapeHtmlEdge(gaRaw)}');</script>`
      : '';

  if (/<script\s+id="dynamic-jsonld-schema"[^>]*>[\s\S]*?<\/script>/i.test(html)) {
    html = html.replace(
      /<script\s+id="dynamic-jsonld-schema"[^>]*>[\s\S]*?<\/script>/i,
      `<script id="dynamic-jsonld-schema" type="application/ld+json">${jsonLdStr}</script>`
    );
  }

  const robotsMeta = `<meta name="robots" content="${payload.isConfigured ? 'index, follow' : 'noindex, nofollow'}" />`;
  const headInject = `${robotsMeta}${gaSnippet}\n  <script>window.__INITIAL_ROUTE_PAYLOAD__=${JSON.stringify(payload).replace(/<\//g, '<\\/')};</script>\n</head>`;
  return html.replace('</head>', headInject);
}

/**
 * Compile the full static public website bundle on Cloudflare Edge.
 */
export function compileEdgeStaticSiteBundle(config, options = {}) {
  const safe = config || EMPTY_ADMIN_CONFIG;
  const template = options.indexHtmlTemplate || FALLBACK_EDGE_HTML_TEMPLATE;
  const files = [];

  const registerRoute = (routePath, htmlPath, label) => {
    files.push({
      path: htmlPath,
      content: renderCompleteStaticPageHtmlEdge(template, safe, routePath),
      encoding: 'utf-8',
      description: `Static HTML page for ${label} (${routePath})`
    });
    const payload = buildPartialRoutePayloadEdge(routePath, safe);
    files.push({
      path: `static-routes/${routePathToStaticJsonNameEdge(routePath)}`,
      content: JSON.stringify(payload, null, 2),
      encoding: 'utf-8',
      description: `Static route payload for ${routePath}`
    });
  };

  registerRoute('/', 'index.html', 'Homepage');
  registerRoute('/news', 'news/index.html', 'Daily News Hub');

  for (const article of safe.newsSection?.articles || []) {
    const slug = generateSlugEdge(article.slug || article.title);
    if (slug) {
      registerRoute(`/news/${slug}`, `news/${slug}/index.html`, `News Article: ${article.title}`);
    }
  }

  for (const pg of safe.pages || []) {
    const slug = generateSlugEdge(pg.slug || pg.label);
    if (slug) {
      registerRoute(`/${slug}`, `${slug}/index.html`, `Standalone Page: ${pg.label}`);
    }
  }

  if (safe.securityGate?.enabled !== false && options.moreinfoHtmlTemplate) {
    files.push({
      path: 'moreinfo/index.html',
      content: options.moreinfoHtmlTemplate,
      encoding: 'utf-8',
      description: 'Isolated Security & Download Gateway (/moreinfo)'
    });
    files.push({
      path: 'download/index.html',
      content: options.moreinfoHtmlTemplate,
      encoding: 'utf-8',
      description: 'Isolated Security & Download Gateway Alias (/download)'
    });
  }

  if (options.appJsContent) {
    files.push({ path: 'app.js', content: options.appJsContent, encoding: 'utf-8', description: 'Zero-Firebase static public router script' });
  }
  if (options.moreinfoJsContent) {
    files.push({ path: 'moreinfo.js', content: options.moreinfoJsContent, encoding: 'utf-8', description: 'Client-side Security Gateway script' });
  }

  files.push({
    path: '_headers',
    content: [
      '/moreinfo*',
      '  X-Robots-Tag: noindex, nofollow, noarchive, nosnippet',
      '  Cache-Control: private, no-store, no-cache, must-revalidate',
      '  Referrer-Policy: no-referrer',
      '/download*',
      '  X-Robots-Tag: noindex, nofollow, noarchive, nosnippet',
      '  Cache-Control: private, no-store, no-cache, must-revalidate',
      '  Referrer-Policy: no-referrer',
      '/api/v1/app/*',
      '  X-Robots-Tag: noindex, nofollow',
      '  Cache-Control: private, no-store, no-cache, must-revalidate'
    ].join('\n') + '\n',
    encoding: 'utf-8',
    description: 'Cloudflare Pages isolation & cache headers'
  });

  if (safe.domainConfig?.enableSitemapXml !== false) {
    files.push({ path: 'sitemap.xml', content: generateSitemapXmlEdge(safe), encoding: 'utf-8', description: 'Search Engine XML Sitemap' });
  }
  files.push({ path: 'robots.txt', content: generateRobotsTxtEdge(safe), encoding: 'utf-8', description: 'Robots Rules' });
  if (safe.domainConfig?.enableRssFeed !== false) {
    files.push({ path: 'feed.xml', content: generateRssFeedXmlEdge(safe), encoding: 'utf-8', description: 'RSS 2.0 News Feed' });
  }
  if (safe.domainConfig?.enableWebManifest !== false) {
    files.push({ path: 'manifest.webmanifest', content: generateWebManifestJsonEdge(safe), encoding: 'utf-8', description: 'W3C Web App Manifest' });
  }

  return files;
}
