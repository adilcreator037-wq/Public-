/**
 * ============================================================================
 * EDGE STATIC PUBLIC WEBSITE COMPILER (_shared/static-compiler.js)
 * Zero-Node-dependency compiler for Cloudflare Pages Functions.
 * Generates the complete static public site bundle (`index.html`, `news/index.html`,
 * `news/:slug/index.html`, `:pageSlug/index.html`, `moreinfo/index.html`,
 * `download/index.html`, `static-routes/*.json`, `sitemap.xml`, `robots.txt`,
 * `feed.xml`, `manifest.webmanifest`, `_headers`) without any Firebase SDK.
 * Also powers live Edge `/api/route` and dynamic Edge SSR fallback!
 * ============================================================================
 */

import { cleanEnvVal, EMPTY_ADMIN_CONFIG } from './auth.js';

export function escapeHtmlEdge(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
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

export function sanitizeSafeUrlEdge(rawUrl = '', options = {}) {
  const { allowHash = true, allowMailto = true, allowDataImage = false } = options || {};
  const trimmed = String(rawUrl || '')
    .replace(/[\u0000-\u001F\u007F]+/g, '')
    .trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('//')) return '';
  if (trimmed.startsWith('/')) return trimmed;
  if (trimmed.startsWith('#')) return allowHash ? trimmed : '';

  const lower = trimmed.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    return trimmed;
  }
  if (allowMailto && (lower.startsWith('mailto:') || lower.startsWith('tel:'))) {
    return trimmed;
  }
  if (
    allowDataImage &&
    /^data:image\/(png|jpeg|jpg|webp|gif|avif);base64,[a-z0-9+/=\s]+$/i.test(trimmed)
  ) {
    return trimmed;
  }
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return trimmed;
  }
  return '';
}

export function sanitizeEditorialHtmlEdge(rawHtml = '', fallbackAlt = 'Editorial Illustration') {
  if (!rawHtml || !String(rawHtml).trim()) return '';
  let html = String(rawHtml);

  const dangerousBlockTags =
    'script|iframe|object|embed|applet|style|svg|math|noscript|template|textarea|title|xmp|form';
  html = html.replace(
    new RegExp(`<(${dangerousBlockTags})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, 'gi'),
    ''
  );
  html = html.replace(
    new RegExp(`<\\/?(${dangerousBlockTags}|base|meta|link|frame|frameset|input|button|select|option)\\b[^>]*>`, 'gi'),
    ''
  );
  html = html.replace(/<!--[\s\S]*?-->/g, '');

  html = html.replace(/<([a-zA-Z][a-zA-Z0-9:-]*)(\s[^>]*?)?(\/?)>/g, (_full, tagName, rawAttrs = '', selfClose = '') => {
    let attrs = String(rawAttrs || '');
    attrs = attrs.replace(/\s+on[a-z0-9_-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    attrs = attrs.replace(/\s+on[a-z0-9_-]*(?=\s|$|\/)/gi, '');
    attrs = attrs.replace(/\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

    attrs = attrs.replace(
      /\s+(href|src|action|formaction|poster|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
      (_m, attrName, dq, sq, uq) => {
        const rawVal = dq ?? sq ?? uq ?? '';
        const decodedVal = rawVal
          .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
          .replace(/&#(\d+);?/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
          .replace(/&colon;/gi, ':')
          .replace(/&tab;/gi, '')
          .replace(/&newline;/gi, '');
        const lowerAttr = String(attrName).toLowerCase();
        const isImgSrc = lowerAttr === 'src' && String(tagName).toLowerCase() === 'img';
        const safeUrl = sanitizeSafeUrlEdge(decodedVal, {
          allowHash: lowerAttr === 'href',
          allowMailto: lowerAttr === 'href',
          allowDataImage: isImgSrc
        });
        if (!safeUrl) {
          return lowerAttr === 'href' ? ' href="#"' : '';
        }
        return ` ${lowerAttr}="${escapeHtmlEdge(safeUrl)}"`;
      }
    );

    attrs = attrs.replace(
      /\s+style\s*=\s*(?:"([^"]*)"|'([^']*)')/gi,
      (_m, dq, sq) => {
        const styleVal = String(dq ?? sq ?? '');
        if (/expression\s*\(|javascript:|vbscript:|@import|behavior\s*:/i.test(styleVal)) {
          return '';
        }
        return ` style="${escapeHtmlEdge(styleVal)}"`;
      }
    );

    return `<${tagName}${attrs}${selfClose}>`;
  });

  const usedIds = new Set();
  html = html.replace(/<(h[23])([^>]*)>([\s\S]*?)<\/\1>/gi, (full, tag, attrs, inner) => {
    if (/\bid\s*=/i.test(attrs)) {
      const idMatch = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i);
      if (idMatch?.[1]) usedIds.add(idMatch[1]);
      return full;
    }
    const plainText = String(inner).replace(/<[^>]+>/g, '').trim();
    const baseSlug = generateSlugEdge(plainText) || 'section';
    let slug = baseSlug;
    let counter = 2;
    while (usedIds.has(slug)) {
      slug = `${baseSlug}-${counter++}`;
    }
    usedIds.add(slug);
    return `<${tag}${attrs} id="${slug}">${inner}</${tag}>`;
  });

  html = html.replace(/<img\b([^>]*?)\/?>/gi, (_full, rawAttrs) => {
    let attrs = String(rawAttrs || '');
    if (!/\balt\s*=/i.test(attrs)) {
      attrs += ` alt="${escapeHtmlEdge(fallbackAlt)}"`;
    } else {
      attrs = attrs.replace(/\balt\s*=\s*""/i, `alt="${escapeHtmlEdge(fallbackAlt)}"`);
    }
    if (!/\bloading\s*=/i.test(attrs)) {
      attrs += ' loading="lazy"';
    }
    if (!/\bdecoding\s*=/i.test(attrs)) {
      attrs += ' decoding="async"';
    }
    return `<img${attrs} />`;
  });

  return html;
}

export function normalizeDomainUrlEdge(rawDomain, forceHttps = true) {
  let clean = String(rawDomain || '').trim();
  if (!clean) return 'https://example.com';
  clean = clean.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(clean)) {
    clean = `${forceHttps ? 'https' : 'http'}://${clean}`;
  } else if (forceHttps && clean.startsWith('http://') && !clean.includes('localhost')) {
    clean = clean.replace(/^http:\/\//i, 'https://');
  }
  return clean;
}

export function optimizeCloudinaryUrlEdge(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed.includes('res.cloudinary.com') || !trimmed.includes('/image/upload/')) return trimmed;
  if (trimmed.includes('/f_auto,q_auto')) return trimmed;
  return trimmed.replace('/image/upload/', '/image/upload/f_auto,q_auto/');
}

export function optimizeImageUrlEdge(url, widthHint = 0) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.toLowerCase().includes('.svg')) {
    return trimmed;
  }
  const w = typeof widthHint === 'number' && Number.isFinite(widthHint) && widthHint > 0 ? Math.round(widthHint) : 0;

  if (trimmed.includes('res.cloudinary.com') && trimmed.includes('/image/upload/')) {
    const uploadToken = '/image/upload/';
    const uploadIndex = trimmed.indexOf(uploadToken);
    const prefix = trimmed.substring(0, uploadIndex + uploadToken.length);
    const suffix = trimmed.substring(uploadIndex + uploadToken.length);
    if (trimmed.includes('/f_auto,q_auto')) {
      if (w > 0 && !trimmed.includes(',w_')) {
        return trimmed.replace('/f_auto,q_auto', `/f_auto,q_auto,w_${w},c_limit`);
      }
      return trimmed;
    }
    const transform = w > 0 ? `f_auto,q_auto,w_${w},c_limit/` : 'f_auto,q_auto/';
    return `${prefix}${transform}${suffix}`;
  }

  if (trimmed.includes('ik.imagekit.io')) {
    try {
      const u = new URL(trimmed);
      if (!u.searchParams.has('tr')) {
        u.searchParams.set('tr', w > 0 ? `f-auto,q-82,w-${w}` : 'f-auto,q-82');
      }
      return u.toString();
    } catch {
      return trimmed;
    }
  }

  if (trimmed.includes('images.unsplash.com')) {
    try {
      const u = new URL(trimmed);
      if (!u.searchParams.has('auto')) u.searchParams.set('auto', 'format');
      if (!u.searchParams.has('q')) u.searchParams.set('q', '80');
      if (w > 0 && !u.searchParams.has('w')) u.searchParams.set('w', String(w));
      return u.toString();
    } catch {
      return trimmed;
    }
  }

  if (trimmed.includes('.imgix.net')) {
    try {
      const u = new URL(trimmed);
      if (!u.searchParams.has('auto')) u.searchParams.set('auto', 'format,compress');
      if (!u.searchParams.has('q')) u.searchParams.set('q', '80');
      if (w > 0 && !u.searchParams.has('w')) u.searchParams.set('w', String(w));
      return u.toString();
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

export function buildResponsiveImageSrcSetEdge(url, widths = [480, 768, 1200]) {
  const clean = String(url || '').trim();
  if (!clean || clean.startsWith('data:') || clean.toLowerCase().includes('.svg')) return '';
  const supportsWidths =
    (clean.includes('res.cloudinary.com') && clean.includes('/image/upload/')) ||
    clean.includes('ik.imagekit.io') ||
    clean.includes('images.unsplash.com') ||
    clean.includes('.imgix.net');
  if (!supportsWidths) return '';
  return widths.map((w) => `${optimizeImageUrlEdge(clean, w)} ${w}w`).join(', ');
}

function buildResponsiveImgTagEdge(rawUrl, alt, opts = {}) {
  const safeRawUrl = sanitizeSafeUrlEdge(rawUrl, { allowHash: false, allowMailto: false, allowDataImage: true });
  if (!safeRawUrl) return '';
  const isHigh = opts.priority === 'high';
  const maxWidth = opts.maxWidth || (isHigh ? 1200 : 768);
  const src = optimizeImageUrlEdge(safeRawUrl, maxWidth);
  const srcSet = buildResponsiveImageSrcSetEdge(safeRawUrl, isHigh ? [480, 768, 1200] : [400, 768]);
  const sizes = opts.sizes || '(max-width: 768px) 100vw, 720px';
  const classAttr = opts.className ? ` class="${escapeHtmlEdge(opts.className)}"` : '';
  const srcSetAttrs = srcSet ? ` srcset="${escapeHtmlEdge(srcSet)}" sizes="${escapeHtmlEdge(sizes)}"` : '';
  return `<img src="${escapeHtmlEdge(src)}"${srcSetAttrs} alt="${escapeHtmlEdge(alt)}" width="1200" height="675" loading="${isHigh ? 'eager' : 'lazy'}" fetchpriority="${isHigh ? 'high' : 'low'}" decoding="async" referrerpolicy="no-referrer"${classAttr} />`;
}

function resolveFontStackCssEdge(fontFamily) {
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

function getNewsArticlesEdge(config) {
  if (Array.isArray(config?.newsSection?.articles) && config.newsSection.articles.length > 0) {
    return config.newsSection.articles;
  }
  if (Array.isArray(config?.newsSection?.posts) && config.newsSection.posts.length > 0) {
    return config.newsSection.posts.map((p) => ({
      ...p,
      summary: p.summary || p.excerpt || '',
      htmlContent: p.htmlContent || p.bodyHtml || '',
      coverImageUrl: p.coverImageUrl || p.coverImage || ''
    }));
  }
  return [];
}

export function generateSitemapXmlEdge(config) {
  const baseUrl = normalizeBaseUrlEdge(config);
  const nowIso = new Date().toISOString().split('T')[0];
  const homeImages = [];
  if (config?.hero?.showBanner !== false && config?.hero?.bannerImageUrl) {
    homeImages.push({
      loc: toAbsoluteAssetUrlEdge(config.hero.bannerImageUrl, baseUrl),
      title: config?.hero?.bannerAlt || config?.hero?.h1 || config?.brand?.name || 'Banner'
    });
  }
  for (const sec of config?.sections || []) {
    if (sec && sec.visible !== false && sec.imageUrl) {
      homeImages.push({
        loc: toAbsoluteAssetUrlEdge(sec.imageUrl, baseUrl),
        title: sec.imageAlt || sec.heading || 'Illustration'
      });
    }
  }
  const urls = [
    {
      loc: `${baseUrl}/`,
      priority: '1.0',
      changefreq: 'daily',
      images: homeImages
    },
    {
      loc: `${baseUrl}/news`,
      priority: '0.9',
      changefreq: 'daily',
      images: []
    }
  ];

  const articles = getNewsArticlesEdge(config);
  for (const art of articles) {
    const slug = generateSlugEdge(art.slug || art.title);
    if (slug) {
      const cov = art.coverImageUrl ? toAbsoluteAssetUrlEdge(art.coverImageUrl, baseUrl) : '';
      urls.push({
        loc: `${baseUrl}/news/${slug}`,
        priority: '0.8',
        changefreq: 'weekly',
        images: cov ? [{ loc: cov, title: art.coverImageAlt || art.title || slug }] : []
      });
    }
  }

  for (const pg of config?.pages || []) {
    const slug = generateSlugEdge(pg.slug || pg.label);
    if (slug) {
      const pgImg = pg.bannerImageUrl ? toAbsoluteAssetUrlEdge(pg.bannerImageUrl, baseUrl) : '';
      urls.push({
        loc: `${baseUrl}/${slug}`,
        priority: '0.6',
        changefreq: 'monthly',
        images: pgImg ? [{ loc: pgImg, title: pg.bannerImageAlt || pg.h1 || pg.label || slug }] : []
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

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${nodes}\n</urlset>`;
}

export function generateRobotsTxtEdge(config) {
  const baseUrl = normalizeBaseUrlEdge(config);
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /moreinfo',
    'Disallow: /moreinfo/',
    'Disallow: /download',
    'Disallow: /download/',
    'Disallow: /api/v1/app/',
    '',
    `Sitemap: ${baseUrl}/sitemap.xml`,
    ''
  ].join('\n');
}

export function generateRssFeedXmlEdge(config) {
  const baseUrl = normalizeBaseUrlEdge(config);
  const brand = (config?.brand?.name || 'Site').trim();
  const desc = config?.seo?.metaDescription || config?.brand?.tagline || '';
  const items = getNewsArticlesEdge(config)
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
  const rawIcons = [
    { src: config?.brand?.searchLogoUrl, sizes: '512x512' },
    { src: config?.brand?.appleTouchIconUrl, sizes: '180x180' },
    { src: config?.brand?.faviconUrl, sizes: '192x192' },
    { src: config?.brand?.logoUrl, sizes: '512x512' }
  ];
  const seen = new Set();
  const icons = [];
  for (const cand of rawIcons) {
    const clean = optimizeCloudinaryUrlEdge(cand.src || '');
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    const isSvg = clean.toLowerCase().endsWith('.svg');
    icons.push({
      src: clean,
      sizes: isSvg ? 'any' : cand.sizes,
      type: isSvg ? 'image/svg+xml' : clean.startsWith('data:image/webp') ? 'image/webp' : 'image/png',
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
  const hasNews = getNewsArticlesEdge(config).length > 0;
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

export function resolveRouteEdge(pathname, config) {
  const cleanPath = String(pathname || '/').split('?')[0].replace(/\/+$/, '') || '/';
  const brandName = (config?.brand?.name || '').trim();
  const brandSuffix = brandName ? ` | ${brandName}` : '';
  const articles = getNewsArticlesEdge(config);

  if (cleanPath === '/' || cleanPath === '/index.html') {
    return {
      matched: true,
      viewType: 'home',
      metaTitle: config?.seo?.metaTitle || config?.hero?.metaTitle || config?.hero?.h1 || brandName || 'Coming Soon',
      metaDescription: config?.seo?.metaDescription || config?.hero?.metaDescription || '',
      canonicalPath: '/',
      ogImage: config?.seo?.ogImageUrl || config?.hero?.bannerImageUrl || ''
    };
  }

  if (cleanPath === '/news') {
    return {
      matched: true,
      viewType: 'news-hub',
      metaTitle: config?.newsSection?.metaTitle || `Daily News & Updates${brandSuffix}`,
      metaDescription:
        config?.newsSection?.metaDescription ||
        (brandName
          ? `Browse all daily news updates, release changelogs, and announcements for ${brandName}.`
          : 'Browse published news updates and announcements.'),
      canonicalPath: '/news',
      ogImage: config?.seo?.ogImageUrl || config?.hero?.bannerImageUrl || ''
    };
  }

  if (cleanPath.startsWith('/news/')) {
    const slug = cleanPath.slice('/news/'.length).trim().toLowerCase();
    const article = articles.find((a) => generateSlugEdge(a.slug || a.title) === slug);
    if (article) {
      return {
        matched: true,
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
        matched: true,
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
    matched: false,
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

function wrapEditorialTablesEdge(html) {
  if (!html || !html.includes('<table')) return html;
  if (html.includes('table-scroll-wrapper')) return html;
  return html.replace(/<table\b[\s\S]*?<\/table>/gi, (tbl) => `<div class="table-scroll-wrapper">${tbl}</div>`);
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
  if (specs.securityStatus) {
    rows.push(
      `<tr><th>Security Scan Status</th><td><span class="spec-verified-badge">${escapeHtmlEdge(
        specs.securityStatus.replace(/^✓\s*/, '')
      )}</span></td></tr>`
    );
  }
  if (specs.lastUpdated) rows.push(`<tr><th>Last Updated</th><td>${escapeHtmlEdge(specs.lastUpdated)}</td></tr>`);
  if (specs.sha256) {
    rows.push(
      `<tr><th>SHA-256 Checksum</th><td><div class="hash-cell-wrap"><code>${escapeHtmlEdge(
        specs.sha256
      )}</code><button type="button" class="copy-hash-btn" data-copy-text="${escapeHtmlEdge(
        specs.sha256
      )}" aria-label="Copy SHA-256 checksum">Copy</button></div></td></tr>`
    );
  }
  if (Array.isArray(specs.customRows)) {
    for (const r of specs.customRows) {
      if (r?.label || r?.value) {
        rows.push(`<tr><th>${escapeHtmlEdge(r.label)}</th><td>${escapeHtmlEdge(r.value)}</td></tr>`);
      }
    }
  }
  return `
    <section id="technical-specifications">
      <h2 id="package-specs-heading">${escapeHtmlEdge(specs.heading || 'Technical Package Specifications')}</h2>
      <div class="table-scroll-wrapper">
        <table>
          <tbody>
            ${rows.join('\n            ')}
          </tbody>
        </table>
      </div>
    </section>`;
}

function renderNewsHubHtmlEdge(config, selectedCategory = 'ALL') {
  const articles = getNewsArticlesEdge(config);
  const ui = config?.uiConfig || EMPTY_ADMIN_CONFIG.uiConfig;
  const categories = ['ALL', ...Array.from(new Set(articles.map((a) => a.category || 'Daily Update')))];
  const filtered =
    selectedCategory === 'ALL'
      ? articles
      : articles.filter((a) => (a.category || 'Daily Update') === selectedCategory);

  const filterButtonsHtml = categories
    .map(
      (cat) => `
      <button type="button" class="news-filter-btn ${selectedCategory === cat ? 'active' : ''}" data-news-cat="${escapeHtmlEdge(cat)}">
        ${cat === 'ALL' ? `All News (${articles.length})` : escapeHtmlEdge(cat)}
      </button>
    `
    )
    .join('');

  const listHtml =
    filtered.length > 0
      ? filtered
          .map((art) => {
            const artSlug = generateSlugEdge(art.slug || art.title);
            const articleUrl = `/news/${artSlug}`;
            const coverHtml = art.coverImageUrl
              ? `<a href="${articleUrl}" data-spa-link class="news-card-media-link">
                  ${buildResponsiveImgTagEdge(art.coverImageUrl, art.coverImageAlt || art.title, {
                    priority: 'low',
                    maxWidth: 768,
                    className: 'news-card-cover-img'
                  })}
                </a>`
              : '';
            return `
              <article class="news-item-block">
                ${coverHtml}
                <div class="news-meta-line">
                  <span class="news-category-tag">${escapeHtmlEdge(art.category || 'Daily News')}</span>
                  ${art.featured ? `<span aria-hidden="true">·</span><span class="news-featured-tag">Featured</span>` : ''}
                  ${art.date ? `<span aria-hidden="true">·</span><span>${escapeHtmlEdge(art.date)}</span>` : ''}
                  ${art.author ? `<span aria-hidden="true">·</span><span>By ${escapeHtmlEdge(art.author)}</span>` : ''}
                  ${art.readTime ? `<span aria-hidden="true">·</span><span>${escapeHtmlEdge(art.readTime)}</span>` : ''}
                </div>
                <h3>
                  <a href="${articleUrl}" data-spa-link class="news-title-link">${escapeHtmlEdge(art.title || '')}</a>
                </h3>
                <p class="news-summary-text">${escapeHtmlEdge(art.summary || '')}</p>
                <a href="${articleUrl}" data-spa-link class="news-read-more">${escapeHtmlEdge(ui.newsReadMoreLabel || 'Read Full Article →')}</a>
              </article>
            `;
          })
          .join('\n')
      : '<p>No news articles found in this category.</p>';

  return `
    <p class="news-summary-text">
      ${escapeHtmlEdge(
        config?.newsSection?.metaDescription ||
          `Official daily news updates, software changelogs, and announcements from ${config?.brand?.name || 'our team'}.`
      )}
    </p>
    <div class="news-filter-bar">${filterButtonsHtml}</div>
    <div id="news-hub-articles-container">${listHtml}</div>
  `;
}

function ensureCleanHtmlParagraphsEdge(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/<(p|div|h[1-6]|ul|ol|li|table|blockquote|pre|section|article|figure|hr)\b/i.test(trimmed)) {
    return trimmed;
  }
  return trimmed
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${block.replace(/\n/g, '<br />')}</p>`)
    .join('\n');
}

function renderMainContentEdge(route, config, selectedCategory = 'ALL') {
  const ui = config?.uiConfig || EMPTY_ADMIN_CONFIG.uiConfig;
  const articles = getNewsArticlesEdge(config);

  if (route.viewType === 'news-article' && route.article) {
    const a = route.article;
    const otherArticles = articles.filter(
      (item) => generateSlugEdge(item.slug || item.title) !== generateSlugEdge(a.slug || a.title)
    );
    const coverHtml = a.coverImageUrl
      ? `<figure class="media-figure">
          ${buildResponsiveImgTagEdge(a.coverImageUrl, a.coverImageAlt || a.title, {
            priority: 'high',
            maxWidth: 1200
          })}
          ${a.coverImageCaption ? `<figcaption class="media-caption">${escapeHtmlEdge(a.coverImageCaption)}</figcaption>` : ''}
        </figure>`
      : '';
    const safeArticleCtaUrl = sanitizeSafeUrlEdge(a.ctaUrl || '', { allowHash: true, allowMailto: true });
    const articleCtaHtml =
      a.ctaLabel && safeArticleCtaUrl
        ? `<div style="margin: 24px 0;">
            <a href="${escapeHtmlEdge(safeArticleCtaUrl)}" data-spa-link class="section-inline-cta">${escapeHtmlEdge(a.ctaLabel)}</a>
          </div>`
        : '';
    const relatedHtml =
      otherArticles.length > 0
        ? `
          <hr style="border:none; border-top:1px solid #E5E7EB; margin:32px 0 20px 0;" />
          <h2>More Daily News &amp; Updates</h2>
          ${otherArticles
            .slice(0, 6)
            .map((art) => {
              const s = generateSlugEdge(art.slug || art.title);
              return `
                <div class="news-item-block">
                  <div class="news-meta-line">
                    <span class="news-category-tag">${escapeHtmlEdge(art.category || 'News')}</span>
                    <span>${escapeHtmlEdge(art.date || '')}</span>
                  </div>
                  <a href="/news/${s}" data-spa-link class="news-title-link" style="font-size:16.5px;">${escapeHtmlEdge(art.title)}</a>
                </div>
              `;
            })
            .join('')}
        `
        : '';

    return `
      <div class="news-meta-line" style="margin-bottom:18px; padding-bottom:14px; border-bottom:1px solid var(--border-color);">
        <span class="news-category-tag">${escapeHtmlEdge(a.category || 'Daily Update')}</span>
        <span aria-hidden="true">·</span>
        <span>Published: <strong>${escapeHtmlEdge(a.date || '')}</strong></span>
        ${a.author ? `<span aria-hidden="true">·</span><span>By <strong>${escapeHtmlEdge(a.author)}</strong></span>` : ''}
        ${a.readTime ? `<span aria-hidden="true">·</span><span>${escapeHtmlEdge(a.readTime)}</span>` : ''}
      </div>
      ${coverHtml}
      ${wrapEditorialTablesEdge(sanitizeEditorialHtmlEdge(ensureCleanHtmlParagraphsEdge(a.htmlContent) || `<p>${escapeHtmlEdge(a.summary || '')}</p>`, a.title || 'News Illustration'))}
      ${articleCtaHtml}
      ${relatedHtml}
    `;
  }

  if (route.viewType === 'news-hub') {
    return renderNewsHubHtmlEdge(config, selectedCategory);
  }

  if (route.viewType === 'standalone-page' && route.page) {
    const pg = route.page;
    const banner = pg.bannerImageUrl
      ? `<figure class="media-figure">
          ${buildResponsiveImgTagEdge(pg.bannerImageUrl, pg.bannerImageAlt || pg.h1 || pg.label, {
            priority: 'high',
            maxWidth: 1200
          })}
        </figure>`
      : '';
    return `
      <p class="news-meta-line" style="margin-bottom:20px; padding-bottom:14px; border-bottom:1px solid var(--border-color);">
        ${escapeHtmlEdge(pg.subtitle || 'Official Document')} · Last Updated: <strong>${escapeHtmlEdge(pg.lastUpdated || '')}</strong>
      </p>
      ${banner}
      ${wrapEditorialTablesEdge(sanitizeEditorialHtmlEdge(ensureCleanHtmlParagraphsEdge(pg.htmlContent || ''), pg.h1 || pg.label || 'Official Document'))}
    `;
  }

  // Homepage
  const introParts = [];
  if (config?.hero?.introHtml) {
    const safeIntro = sanitizeEditorialHtmlEdge(
      ensureCleanHtmlParagraphsEdge(config.hero.introHtml),
      config?.brand?.name || 'Official Guide'
    );
    if (safeIntro) {
      introParts.push(`<div class="hero-intro-block">${safeIntro}</div>`);
    }
  }
  if (config?.hero?.showBanner !== false && config?.hero?.bannerImageUrl) {
    const bannerAlt = config.hero.bannerAlt || config?.brand?.name || 'Banner';
    const captionHtml = config.hero.bannerCaption
      ? `<figcaption class="media-caption">${escapeHtmlEdge(config.hero.bannerCaption)}</figcaption>`
      : '';
    introParts.push(`
      <figure class="media-figure">
        ${buildResponsiveImgTagEdge(config.hero.bannerImageUrl, bannerAlt, { priority: 'high', maxWidth: 1200 })}
        ${captionHtml}
      </figure>
    `);
  }

  const sections = Array.isArray(config?.sections) ? config.sections : [];
  const showSpecs = hasPackageSpecsDataEdge(config?.packageSpecs);
  const tocLinks = [];
  if (showSpecs) tocLinks.push({ href: '#technical-specifications', label: 'Specifications' });
  for (const sec of sections) {
    if (sec && sec.visible !== false && sec.heading) {
      tocLinks.push({ href: `#${generateSlugEdge(sec.slug || sec.heading)}`, label: sec.badgeText || sec.heading });
    }
  }
  if (config?.newsSection?.enabled !== false && articles.length > 0) {
    tocLinks.push({ href: '#latest-news', label: `Daily News (${articles.length})` });
  }
  if (config?.faqsSection?.enabled !== false && Array.isArray(config?.faqsSection?.items) && config.faqsSection.items.length > 0) {
    tocLinks.push({ href: '#frequently-asked-questions', label: 'FAQs' });
  }
  if (ui.showTocJumpBar !== false && tocLinks.length >= 2) {
    introParts.push(`
      <nav class="toc-jump-bar" aria-label="On-page table of contents">
        <span class="toc-jump-label">On this page</span>
        <div class="toc-jump-links">
          ${tocLinks.map((t) => `<a href="${escapeHtmlEdge(t.href)}" class="toc-jump-chip">${escapeHtmlEdge(t.label)}</a>`).join('')}
        </div>
      </nav>
    `);
  }

  const blockMap = {
    specs: renderSpecsHtmlEdge(config),
    sections: sections
      .filter((s) => s && s.visible !== false)
      .map((s) => {
        const slug = generateSlugEdge(s.slug || s.anchorId || s.heading);
        const badgeHtml = s.badgeText ? `<div class="section-eyebrow-badge">${escapeHtmlEdge(s.badgeText)}</div>` : '';
        const effImgPos = s.imageUrl ? (s.imagePosition && s.imagePosition !== 'none' ? s.imagePosition : 'top') : 'none';
        const hasImg = Boolean(s.imageUrl && effImgPos !== 'none');
        const imgMarkup = hasImg
          ? `<figure class="media-figure">
              ${buildResponsiveImgTagEdge(s.imageUrl, s.imageAlt || s.heading, { priority: 'low', maxWidth: 800 })}
              ${s.imageCaption ? `<figcaption class="media-caption">${escapeHtmlEdge(s.imageCaption)}</figcaption>` : ''}
            </figure>`
          : '';
        const safeSectionCtaUrl = sanitizeSafeUrlEdge(s.ctaUrl || '', { allowHash: true, allowMailto: true });
        const ctaMarkup =
          s.ctaLabel && safeSectionCtaUrl
            ? `<div style="margin: 16px 0 8px 0;">
                <a href="${escapeHtmlEdge(safeSectionCtaUrl)}" data-spa-link class="section-inline-cta">${escapeHtmlEdge(s.ctaLabel)}</a>
              </div>`
            : '';
        return `
          <section id="${escapeHtmlEdge(slug)}">
            ${badgeHtml}
            <h2 id="${escapeHtmlEdge(slug)}-heading">${escapeHtmlEdge(s.heading || '')}</h2>
            ${effImgPos === 'top' ? imgMarkup : ''}
            ${wrapEditorialTablesEdge(sanitizeEditorialHtmlEdge(ensureCleanHtmlParagraphsEdge(s.htmlContent || ''), s.heading || 'Editorial Illustration'))}
            ${effImgPos === 'bottom' ? imgMarkup : ''}
            ${ctaMarkup}
          </section>
        `;
      })
      .join('\n'),
    rawHtml: config?.content?.rawHtml
      ? wrapEditorialTablesEdge(sanitizeEditorialHtmlEdge(config.content.rawHtml, config?.brand?.name || 'Editorial Content'))
      : '',
    news:
      config?.newsSection?.enabled !== false && articles.length > 0
        ? `<section id="latest-news" class="cv-auto-section">
            <div class="section-header-row">
              <h2 id="news">${escapeHtmlEdge(config.newsSection.heading || 'Daily News & Release Updates')}</h2>
              <a href="/news" data-spa-link class="news-read-more">${escapeHtmlEdge(ui.newsViewAllLabel || 'View All Daily News →')} (${articles.length})</a>
            </div>
            ${articles
              .slice(0, Math.max(1, Number(ui.homepageNewsLimit) || 5))
              .map((art) => {
                const artSlug = generateSlugEdge(art.slug || art.title);
                const articleUrl = `/news/${artSlug}`;
                const coverHtml = art.coverImageUrl
                  ? `<a href="${articleUrl}" data-spa-link class="news-card-media-link">
                      ${buildResponsiveImgTagEdge(art.coverImageUrl, art.coverImageAlt || art.title, {
                        priority: 'low',
                        maxWidth: 768,
                        className: 'news-card-cover-img'
                      })}
                    </a>`
                  : '';
                return `
                  <article class="news-item-block">
                    ${coverHtml}
                    <div class="news-meta-line">
                      <span class="news-category-tag">${escapeHtmlEdge(art.category || 'Daily News')}</span>
                      ${art.featured ? `<span aria-hidden="true">·</span><span class="news-featured-tag">Featured</span>` : ''}
                      ${art.date ? `<span aria-hidden="true">·</span><span>${escapeHtmlEdge(art.date)}</span>` : ''}
                      ${art.author ? `<span aria-hidden="true">·</span><span>By ${escapeHtmlEdge(art.author)}</span>` : ''}
                      ${art.readTime ? `<span aria-hidden="true">·</span><span>${escapeHtmlEdge(art.readTime)}</span>` : ''}
                    </div>
                    <h3><a href="${articleUrl}" data-spa-link class="news-title-link">${escapeHtmlEdge(art.title || '')}</a></h3>
                    <p class="news-summary-text">${escapeHtmlEdge(art.summary || '')}</p>
                    <a href="${articleUrl}" data-spa-link class="news-read-more">${escapeHtmlEdge(ui.newsReadMoreLabel || 'Read Full News Article →')}</a>
                  </article>
                `;
              })
              .join('\n')}
          </section>`
        : '',
    faqs:
      config?.faqsSection?.enabled !== false && Array.isArray(config?.faqsSection?.items) && config.faqsSection.items.length > 0
        ? `<section id="frequently-asked-questions">
            <h2 id="faqs">${escapeHtmlEdge(config.faqsSection.heading || 'Frequently Asked Questions')}</h2>
            ${config.faqsSection.items
              .map((f) =>
                ui.enableFaqAccordion !== false
                  ? `<details class="faq-item"><summary>${escapeHtmlEdge(f.question || '')}</summary><div class="faq-answer"><p>${escapeHtmlEdge(f.answer || '')}</p></div></details>`
                  : `<div class="faq-static-item"><h3>${escapeHtmlEdge(f.question || '')}</h3>\n<p>${escapeHtmlEdge(f.answer || '')}</p></div>`
              )
              .join('\n')}
          </section>`
        : ''
  };

  const order =
    Array.isArray(ui.homepageSectionOrder) && ui.homepageSectionOrder.length > 0
      ? ui.homepageSectionOrder
      : ['specs', 'sections', 'rawHtml', 'news', 'faqs'];
  const orderedHtml = order.map((k) => blockMap[k] || '').filter(Boolean);
  const combined = [...introParts, ...orderedHtml];

  if (combined.length === 0) {
    if ((config?.hero?.h1 || '').trim() || (config?.brand?.name || '').trim()) {
      return '';
    }
    return '<section class="site-coming-soon"><h1>Coming Soon</h1><p>This website is currently being prepared.</p></section>';
  }
  return combined.join('\n\n');
}

function renderHamburgerDrawerHtmlEdge(shell, activeCanonicalPath = '/') {
  const ui = shell.uiConfig || EMPTY_ADMIN_CONFIG.uiConfig;
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
  for (const link of shell.headerLinks || []) {
    if (!link.label || !link.url) continue;
    const rawUrl = sanitizeSafeUrlEdge(link.url.trim(), { allowHash: true, allowMailto: true });
    if (!rawUrl) continue;
    const href = rawUrl.startsWith('#') ? `/${rawUrl}` : rawUrl;
    seenUrls.add(rawUrl.toLowerCase());
    seenUrls.add(href.toLowerCase());
    items.push(`
      <li>
        <a href="${escapeHtmlEdge(href)}" data-spa-link class="nav-drawer-link ${activeCanonicalPath === href ? 'active-nav-link' : ''}" title="${escapeHtmlEdge(link.metaTitle || link.label)}">
          <span>${escapeHtmlEdge(link.label)}</span>
          <span class="drawer-link-arrow">→</span>
        </a>
      </li>
    `);
  }

  if (ui.autoIncludeSectionsInDrawer !== false && Array.isArray(shell.autoSectionLinks)) {
    for (const sec of shell.autoSectionLinks) {
      const anchor = `#${sec.url.replace(/^#+/, '')}`;
      const fullHref = `/${anchor}`;
      if (seenUrls.has(anchor.toLowerCase()) || seenUrls.has(fullHref.toLowerCase())) continue;
      seenUrls.add(anchor.toLowerCase());
      items.push(`
        <li>
          <a href="${escapeHtmlEdge(fullHref)}" data-spa-link class="nav-drawer-link" title="${escapeHtmlEdge(sec.metaTitle || sec.label)}">
            <span>${escapeHtmlEdge(sec.label)}</span>
            <span class="drawer-link-arrow">↘</span>
          </a>
        </li>
      `);
    }
  }

  if (ui.showNewsInDrawer !== false && shell.newsCount > 0) {
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
      items.push(`
        <li>
          <a href="${escapeHtmlEdge(artHref)}" data-spa-link class="nav-drawer-link drawer-news-sublink ${activeCanonicalPath === artHref ? 'active-nav-link' : ''}">
            <div>
              <span class="drawer-news-cat">${escapeHtmlEdge(art.category)}</span>
              <div class="drawer-news-title">${escapeHtmlEdge(art.title)}</div>
            </div>
          </a>
        </li>
      `);
    }
  }

  const allDrawerPages = [
    ...(shell.headerPages || []),
    ...(ui.showLegalLinksInDrawer !== false ? shell.footerPages || [] : [])
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
              return `<a href="${escapeHtmlEdge(pgHref)}" data-spa-link class="drawer-legal-chip ${
                activeCanonicalPath === pgHref ? 'active' : ''
              }" title="${escapeHtmlEdge(pg.metaTitle || pg.label)}">${escapeHtmlEdge(pg.label)}</a>`;
            })
            .join('')}
        </div>
      </li>
    `);
  }

  if (ui.showCtaInDrawer !== false && shell.heroCtas?.primaryCta?.label) {
    const rawPrimaryUrl =
      sanitizeSafeUrlEdge(shell.heroCtas.primaryCta.url || '#technical-specifications', {
        allowHash: true,
        allowMailto: true
      }) || '#technical-specifications';
    const primaryHref = rawPrimaryUrl.startsWith('#') ? `/${rawPrimaryUrl}` : rawPrimaryUrl;
    items.push(`
      <li class="drawer-cta-footer">
        <a href="${escapeHtmlEdge(primaryHref)}" data-spa-link class="drawer-cta-btn">
          <span>${escapeHtmlEdge(shell.heroCtas.primaryCta.label)}</span>
          ${shell.packageVersion ? `<span class="drawer-cta-ver">${escapeHtmlEdge(shell.packageVersion)}</span>` : ''}
        </a>
      </li>
    `);
  }

  return items.join('\n');
}

export function buildPartialRoutePayloadEdge(pathname, config, newsCategory = 'ALL') {
  const safe = config || EMPTY_ADMIN_CONFIG;
  const route = resolveRouteEdge(pathname, safe);
  const configured = isSiteConfiguredEdge(safe);
  const ui = safe?.uiConfig || EMPTY_ADMIN_CONFIG.uiConfig;
  const baseCanonical = normalizeBaseUrlEdge(safe);
  const canonicalUrl = route.canonicalPath === '/' ? `${baseCanonical}/` : `${baseCanonical}${route.canonicalPath}`;
  const mainHtml = renderMainContentEdge(route, safe, newsCategory);
  const jsonLd = buildJsonLdEdge(safe, route);

  const rawSecCta = safe?.hero?.secondaryCta || EMPTY_ADMIN_CONFIG.hero.secondaryCta;
  const secCta = {
    ...rawSecCta,
    url: sanitizeSafeUrlEdge(rawSecCta?.url || '', { allowHash: true, allowMailto: true })
  };
  const rawPriCta = safe?.hero?.primaryCta || EMPTY_ADMIN_CONFIG.hero.primaryCta;
  const rawFlCta = safe?.hero?.floatingCta || EMPTY_ADMIN_CONFIG.hero.floatingCta;
  const priUrl = rawPriCta?.url
    ? safe?.securityGate?.enabled !== false
      ? '/moreinfo'
      : sanitizeSafeUrlEdge(rawPriCta.url, { allowHash: true, allowMailto: true })
    : '';
  const flUrl = rawFlCta?.url
    ? safe?.securityGate?.enabled !== false
      ? '/moreinfo'
      : sanitizeSafeUrlEdge(rawFlCta.url, { allowHash: true, allowMailto: true })
    : '';

  const hasSecCta = Boolean(secCta?.label && secCta?.url);
  const hasPriCta = Boolean(rawPriCta?.label && priUrl);

  let heroH1 = safe?.hero?.h1 || safe?.brand?.name || '';
  let showHeroCtaGrid = route.viewType === 'home' && ui.showHeroCtaButtons !== false && (hasSecCta || hasPriCta);
  let showHeroSection = true;
  if (route.viewType === 'news-hub') {
    heroH1 = safe?.newsSection?.heading || 'Daily News & Updates';
    showHeroCtaGrid = false;
  } else if (route.viewType === 'news-article' && route.article) {
    heroH1 = route.article.title;
    showHeroCtaGrid = false;
  } else if (route.viewType === 'standalone-page' && route.page) {
    heroH1 = route.page.h1 || route.page.label;
    showHeroCtaGrid = false;
  } else {
    showHeroSection = ui.showHeroSection !== false && Boolean(heroH1 || showHeroCtaGrid);
  }

  const pages = Array.isArray(safe?.pages) ? safe.pages : [];
  const footerPages = pages
    .filter((p) => p && p.showInFooter !== false)
    .map((pg) => ({
      label: pg.label || pg.h1,
      slug: generateSlugEdge(pg.slug || pg.label),
      metaTitle: pg.metaTitle || pg.h1 || ''
    }));
  const headerPages = pages
    .filter((p) => p && Boolean(p.showInHeader))
    .map((pg) => ({
      label: pg.label || pg.h1,
      slug: generateSlugEdge(pg.slug || pg.label),
      metaTitle: pg.metaTitle || pg.h1 || ''
    }));
  const autoSectionLinks = (safe?.sections || [])
    .filter((sec) => sec && sec.visible !== false && sec.heading)
    .map((sec) => ({
      label: sec.heading,
      url: `#${generateSlugEdge(sec.slug || sec.heading)}`,
      metaTitle: sec.metaTitle || sec.heading
    }));
  const articles = getNewsArticlesEdge(safe);
  const newsCount = articles.length;
  const recentNewsDrawerItems = articles.slice(0, 3).map((art) => ({
    title: art.title,
    slug: generateSlugEdge(art.slug || art.title),
    category: art.category || 'Daily Update',
    date: art.date || ''
  }));
  const allSubpagePills = [
    ...(safe?.newsSection?.enabled !== false && (newsCount > 0 || configured)
      ? [{ label: ui.headerNewsButtonLabel || 'News', href: '/news' }]
      : []),
    ...footerPages.map((pg) => ({ label: pg.label, href: `/${pg.slug}` }))
  ];

  const brandClean = {
    ...(safe?.brand || EMPTY_ADMIN_CONFIG.brand),
    logoUrl: optimizeCloudinaryUrlEdge(safe?.brand?.logoUrl || ''),
    faviconUrl: optimizeCloudinaryUrlEdge(safe?.brand?.faviconUrl || safe?.brand?.logoUrl || '')
  };

  return {
    path: pathname,
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
      brand: brandClean,
      brandName: (safe?.brand?.name || '').trim(),
      logoUrl: brandClean.logoUrl,
      faviconUrl: brandClean.faviconUrl,
      accentColor: safe?.brand?.accentColor || '#EF4444',
      buttonTextColor: ui.buttonTextColor || '#FFFFFF',
      uiConfig: ui,
      heroCtas: {
        secondaryCta: secCta,
        primaryCta: { ...rawPriCta, url: priUrl },
        floatingCta: { ...rawFlCta, url: flUrl }
      },
      packageVersion: safe?.packageSpecs?.version || '',
      headerLinks: safe?.navigation?.headerLinks || [],
      autoSectionLinks,
      recentNewsDrawerItems,
      headerPages,
      footerPages,
      allSubpagePills,
      newsCount,
      navigation: {
        footerSummary: safe?.navigation?.footerSummary || '',
        showFooterBrandSummary: safe?.navigation?.showFooterBrandSummary !== false,
        showFooterContactEmail: safe?.navigation?.showFooterContactEmail !== false,
        footerQuickLinks: safe?.navigation?.footerQuickLinks || [],
        disclaimerHeading: safe?.navigation?.disclaimerHeading || '',
        disclaimer: safe?.navigation?.disclaimer || '',
        siteLinksHeading: safe?.navigation?.siteLinksHeading || '',
        copyright: safe?.navigation?.copyright || ''
      }
    },
    updatedAt: safe?.updatedAt || Date.now()
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
    <header id="site-sticky-header" class="sticky-header">
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
    <nav id="nav-drawer" class="nav-drawer hidden" aria-label="Site Navigation">
      <ul class="nav-drawer-list" id="drawer-links-list"></ul>
    </nav>
    <div class="page-content-shell">
      <div id="standalone-back-bar" class="back-home-bar hidden">
        <div class="back-home-row">
          <a href="/" id="back-home-anchor" class="back-home-link" data-spa-link>← Back to Home</a>
          <a href="/news" id="back-news-anchor" class="back-home-link hidden" data-spa-link>All News →</a>
        </div>
        <div id="subpage-switcher-pills" class="subpage-tabs-row"></div>
      </div>
      <section id="hero-section" class="hero-container">
        <h1 id="hero-heading" class="hero-title"></h1>
        <div id="hero-cta-grid" class="hero-action-grid">
          <a id="hero-cta-secondary" class="btn-secondary hidden" href="#"></a>
          <a id="hero-cta-primary" class="btn-primary hidden" href="#"></a>
        </div>
      </section>
      <main id="dynamic-content" class="content-container prose-container"></main>
    </div>
    <footer id="site-footer" class="site-footer">
      <div class="footer-inner">
        <div id="footer-brand-summary-block" class="footer-brand-summary-box hidden">
          <div id="footer-brand-title" class="footer-brand-title"></div>
          <p id="footer-summary-text" class="footer-summary-text"></p>
          <a id="footer-contact-email-link" class="footer-contact-pill hidden" href="#"></a>
        </div>
        <div id="footer-disclaimer-block" class="hidden">
          <div id="footer-disclaimer-heading" class="footer-heading"></div>
          <p id="footer-disclaimer" class="footer-disclaimer-text"></p>
        </div>
        <div id="footer-links-heading" class="footer-heading hidden"></div>
        <div id="footer-links-list" class="footer-links-stack"></div>
        <hr id="footer-divider" class="footer-divider hidden" />
        <p id="footer-copyright" class="footer-copyright-text"></p>
      </div>
    </footer>
    <div id="floating-bottom-cta" class="floating-cta-wrapper hidden">
      <a id="floating-cta-btn" class="floating-cta-button" href="#"></a>
    </div>
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
  const jsonLdStr = JSON.stringify(payload.jsonLd).replace(/</g, '\\u003c');
  const ui = payload.shell.uiConfig || EMPTY_ADMIN_CONFIG.uiConfig;

  let html = indexHtmlTemplate || FALLBACK_EDGE_HTML_TEMPLATE;

  // Idempotently strip prior injected dynamic tags/scripts
  html = html
    .replace(/<meta\s+name="(?:robots|theme-color|application-name|apple-mobile-web-app-title|google-site-verification|msvalidate\.01)"[^>]*>\s*/gi, '')
    .replace(/<meta\s+property="og:(?:site_name|locale|image:width|image:height)"[^>]*>\s*/gi, '')
    .replace(/<link\s+rel="(?:apple-touch-icon|manifest|sitemap|alternate)"[^>]*>\s*/gi, '')
    .replace(/<link\s+rel="preload"\s+as="image"[^>]*>\s*/gi, '')
    .replace(/<script\s+async\s+src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=[^"]*"[^>]*><\/script>\s*<script>window\.dataLayer[\s\S]*?<\/script>\s*/gi, '')
    .replace(/<script>\s*window\.__INITIAL_ROUTE_PAYLOAD__\s*=[\s\S]*?<\/script>\s*/gi, '');

  const inlineRootVars = [
    `--accent-color:${safe?.brand?.accentColor || '#EF4444'}`,
    `--button-text-color:${ui.buttonTextColor || '#FFFFFF'}`,
    `--max-container-width:${ui.maxContainerWidth || '768px'}`,
    `--bg-page:${ui.pageBackgroundColor || '#F8FAFC'}`,
    `--bg-surface:${ui.surfaceBackgroundColor || '#FFFFFF'}`,
    `--bg-header:${ui.headerBackgroundColor || '#FFFFFF'}`,
    `--text-header:${ui.headerTextColor || '#111827'}`,
    `--bg-footer:${ui.footerBackgroundColor || '#0F172A'}`,
    `--text-footer:${ui.footerTextColor || '#F8FAFC'}`,
    `--border-color:${ui.borderColor || '#E2E8F0'}`,
    `--card-radius:${ui.cardBorderRadius || '12px'}`,
    `--text-main:${ui.textColor || '#1F2937'}`,
    `--heading-color:${ui.headingColor || '#111827'}`,
    `--base-font-size:${ui.baseFontSize || '16px'}`,
    `--font-stack:${resolveFontStackCssEdge(ui.fontFamily).replace(/"/g, "'")}`
  ].join(';');
  html = html.replace(/<html\s+lang="en"(?:\s+style="[^"]*")?>/i, `<html lang="en" style="${escapeHtmlEdge(inlineRootVars)}">`);

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
  const stickyPosStyle = ui.stickyHeader === false ? ' style="position:relative;"' : '';
  const hideEmptyHeader = !payload.isConfigured && (safe?.navigation?.headerLinks || []).length === 0;
  html = html.replace(
    /<header(?:\s+id="site-sticky-header")?\s+class="sticky-header(?:\s+hidden)?"[^>]*>/i,
    `<header id="site-sticky-header" class="sticky-header${hideEmptyHeader ? ' hidden' : ''}"${stickyPosStyle}>`
  );

  const hasNewsOrConfigured = payload.shell.newsCount > 0 || payload.isConfigured;
  const newsBtnLabel = ui.showNewsCountInHeader !== false
    ? `${ui.headerNewsButtonLabel || 'News'} (${payload.shell.newsCount})`
    : `${ui.headerNewsButtonLabel || 'News'}`;
  const isNewsActive = payload.viewType === 'news-hub' || payload.viewType === 'news-article';
  html = html.replace(
    /<a href="\/news" id="header-news-btn" class="header-news-link[^"]*" data-spa-link>[\s\S]*?<\/a>/i,
    `<a href="/news" id="header-news-btn" class="header-news-link${isNewsActive ? ' is-active' : ''}${
      ui.showHeaderNewsButton === false || !hasNewsOrConfigured ? ' hidden' : ''
    }" data-spa-link><span>${escapeHtmlEdge(newsBtnLabel)}</span></a>`
  );

  const drawerHtml = renderHamburgerDrawerHtmlEdge(payload.shell, payload.canonicalPath);
  html = html.replace(
    /<ul class="nav-drawer-list" id="drawer-links-list">[\s\S]*?<\/ul>/i,
    `<ul class="nav-drawer-list" id="drawer-links-list">${drawerHtml}</ul>`
  );

  const showBackBar = payload.viewType !== 'home' && ui.showBreadcrumbs !== false;
  const backHomeLabel = escapeHtmlEdge(ui.backToHomeLabel || '← Back to Home');
  const allNewsLabel = escapeHtmlEdge(ui.allNewsBreadcrumbLabel || 'All News →');
  const showNewsBack = payload.viewType === 'news-article';
  const subpagePillsHtml =
    ui.showSubpageSwitcherPills !== false && Array.isArray(payload.shell.allSubpagePills)
      ? payload.shell.allSubpagePills
          .map((pill) => {
            const isActivePill =
              payload.canonicalPath === pill.href ||
              (pill.href === '/news' && payload.viewType === 'news-article');
            return `<a href="${escapeHtmlEdge(pill.href)}" data-spa-link class="subpage-pill${isActivePill ? ' active' : ''}">${escapeHtmlEdge(pill.label)}</a>`;
          })
          .join('')
      : '';
  const backBarHtml = `<div id="standalone-back-bar" class="back-home-bar${showBackBar ? '' : ' hidden'}">
      <div class="back-home-row">
        <a href="/" id="back-home-anchor" class="back-home-link" data-spa-link>${backHomeLabel}</a>
        <a href="/news" id="back-news-anchor" class="back-home-link${showNewsBack ? '' : ' hidden'}" data-spa-link>${allNewsLabel}</a>
      </div>
      <div id="subpage-switcher-pills" class="subpage-tabs-row${
        ui.showSubpageSwitcherPills === false ? ' hidden' : ''
      }">${subpagePillsHtml}</div>
    </div>`;
  html = html.replace(
    /<div id="standalone-back-bar" class="back-home-bar(?:\s+hidden)?">(?:<div><\/div>|[\s\S]*?<div id="subpage-switcher-pills"[^>]*>[\s\S]*?<\/div>\s*)<\/div>/i,
    backBarHtml
  );

  html = html.replace(/<h1 id="hero-heading" class="hero-title">[\s\S]*?<\/h1>/i, `<h1 id="hero-heading" class="hero-title">${escapeHtmlEdge(payload.heroH1)}</h1>`);
  html = html.replace(/<section id="hero-section" class="hero-container(?:\s+hidden)?">/i, `<section id="hero-section" class="hero-container${payload.showHeroSection ? '' : ' hidden'}">`);
  html = html.replace(/<div id="hero-cta-grid" class="hero-action-grid(?:\s+hidden)?">/i, `<div id="hero-cta-grid" class="hero-action-grid${payload.showHeroCtaGrid ? '' : ' hidden'}">`);

  const secCta = payload.shell.heroCtas?.secondaryCta;
  const priCta = payload.shell.heroCtas?.primaryCta;
  const isHomeRoute = payload.viewType === 'home';
  const hasSecCta = isHomeRoute && Boolean(secCta?.label && secCta?.url);
  const hasPriCta = isHomeRoute && Boolean(priCta?.label && priCta?.url);
  html = html.replace(
    /<a id="hero-cta-secondary"[^>]*>[\s\S]*?<\/a>/i,
    `<a id="hero-cta-secondary" class="btn-secondary${hasSecCta ? '' : ' hidden'}" href="${escapeHtmlEdge(hasSecCta ? secCta?.url || '#' : '#')}"${
      hasSecCta && secCta?.relSponsored ? ' rel="sponsored noopener"' : ''
    }${hasSecCta ? ' data-spa-link' : ''}>${escapeHtmlEdge(hasSecCta ? secCta?.label || '' : '')}</a>`
  );
  const primaryHref = hasPriCta ? priCta?.url || '#' : '#';
  const primaryRel =
    hasPriCta && (primaryHref === '/moreinfo' || primaryHref === '/download')
      ? ' rel="nofollow noopener"'
      : hasPriCta && priCta?.relSponsored
      ? ' rel="sponsored noopener"'
      : '';
  html = html.replace(
    /<a id="hero-cta-primary"[^>]*>[\s\S]*?<\/a>/i,
    `<a id="hero-cta-primary" class="btn-primary${hasPriCta ? '' : ' hidden'}" href="${escapeHtmlEdge(primaryHref)}"${primaryRel}${
      hasPriCta ? ' data-spa-link' : ''
    }>${escapeHtmlEdge(hasPriCta ? priCta?.label || '' : '')}</a>`
  );

  html = html.replace(
    /<main\b[^>]*\bid="dynamic-content"[^>]*>[\s\S]*?<\/main>/i,
    `<main id="dynamic-content" class="content-container prose-container" tabindex="-1" data-ssr-path="${escapeHtmlEdge(payload.canonicalPath)}">${payload.renderedMainHtml}</main>`
  );

  const quickLinksHtml = (safe?.navigation?.footerQuickLinks || [])
    .map((ql) => {
      const safeQlUrl = sanitizeSafeUrlEdge(ql.url || '', { allowHash: true, allowMailto: true });
      if (!safeQlUrl) return '';
      const targetAttr = ql.openInNewTab ? ' target="_blank" rel="noopener noreferrer"' : ' data-spa-link';
      return `<a href="${escapeHtmlEdge(safeQlUrl)}"${targetAttr} class="footer-link">${escapeHtmlEdge(ql.label)}</a>`;
    })
    .filter(Boolean)
    .join('');
  const legalLinksHtml = (payload.shell.footerPages || [])
    .map((pg) => `<a href="/${escapeHtmlEdge(pg.slug)}" data-spa-link class="footer-link" title="${escapeHtmlEdge(pg.metaTitle)}">${escapeHtmlEdge(pg.label)}</a>`)
    .join('');
  const footerLinksHtml = [quickLinksHtml, legalLinksHtml].filter(Boolean).join('');
  const footerSummaryText = safe?.navigation?.footerSummary || safe?.brand?.tagline || '';
  const contactEmailText = (safe?.brand?.contactEmail || '').trim();
  const hasBrandSummaryContent = Boolean(rawBrand || footerSummaryText || contactEmailText);

  html = html.replace(
    /<div id="footer-brand-summary-block" class="footer-brand-summary-box(?:\s+hidden)?">/i,
    `<div id="footer-brand-summary-block" class="footer-brand-summary-box${
      safe?.navigation?.showFooterBrandSummary === false || !hasBrandSummaryContent ? ' hidden' : ''
    }">`
  );
  html = html.replace(/<div id="footer-brand-title" class="footer-brand-title">[\s\S]*?<\/div>/i, `<div id="footer-brand-title" class="footer-brand-title">${brandName}</div>`);
  html = html.replace(/<p id="footer-summary-text" class="footer-summary-text">[\s\S]*?<\/p>/i, `<p id="footer-summary-text" class="footer-summary-text">${escapeHtmlEdge(footerSummaryText)}</p>`);
  const showContactEmail = safe?.navigation?.showFooterContactEmail !== false && Boolean(contactEmailText);
  html = html.replace(
    /<a id="footer-contact-email-link" class="footer-contact-pill(?:\s+hidden)?"[^>]*>[\s\S]*?<\/a>/i,
    showContactEmail
      ? `<a id="footer-contact-email-link" class="footer-contact-pill" href="mailto:${escapeHtmlEdge(contactEmailText)}">${escapeHtmlEdge(contactEmailText)}</a>`
      : `<a id="footer-contact-email-link" class="footer-contact-pill hidden" href="#"></a>`
  );

  const disclaimerText = (safe?.navigation?.disclaimer || '').trim();
  const showDisclaimerBlock = ui.showFooterDisclaimer !== false && Boolean(disclaimerText);
  html = html.replace(
    /<div id="footer-disclaimer-block"(?:\s+class="hidden")?>/i,
    `<div id="footer-disclaimer-block"${showDisclaimerBlock ? '' : ' class="hidden"'}>`
  );
  html = html.replace(/<div id="footer-disclaimer-heading" class="footer-heading">[\s\S]*?<\/div>/i, `<div id="footer-disclaimer-heading" class="footer-heading">${escapeHtmlEdge(safe?.navigation?.disclaimerHeading || '')}</div>`);
  html = html.replace(/<p id="footer-disclaimer" class="footer-disclaimer-text">[\s\S]*?<\/p>/i, `<p id="footer-disclaimer" class="footer-disclaimer-text">${escapeHtmlEdge(disclaimerText)}</p>`);
  const showLinksHeading = ui.showFooterLinksHeading !== false && Boolean(footerLinksHtml && safe?.navigation?.siteLinksHeading);
  html = html.replace(
    /<div id="footer-links-heading" class="footer-heading(?:\s+hidden)?">[\s\S]*?<\/div>/i,
    `<div id="footer-links-heading" class="footer-heading${showLinksHeading ? '' : ' hidden'}">${escapeHtmlEdge(safe?.navigation?.siteLinksHeading || '')}</div>`
  );
  html = html.replace(/<div id="footer-links-list" class="footer-links-stack">[\s\S]*?<\/div>/i, `<div id="footer-links-list" class="footer-links-stack">${footerLinksHtml}</div>`);
  const copyrightStr = String(safe?.navigation?.copyright || '').trim();
  const hasFooterContent = Boolean(
    (safe?.navigation?.showFooterBrandSummary !== false && hasBrandSummaryContent) ||
      showDisclaimerBlock ||
      footerLinksHtml ||
      copyrightStr
  );
  html = html.replace(
    /<footer(?:\s+id="site-footer")?\s+class="site-footer(?:\s+hidden)?">/i,
    `<footer id="site-footer" class="site-footer${hasFooterContent ? '' : ' hidden'}">`
  );
  html = html.replace(
    /<hr id="footer-divider" class="footer-divider(?:\s+hidden)?"\s*\/?>/i,
    `<hr id="footer-divider" class="footer-divider${hasFooterContent ? '' : ' hidden'}" />`
  );
  html = html.replace(/<p id="footer-copyright" class="footer-copyright-text">[\s\S]*?<\/p>/i, `<p id="footer-copyright" class="footer-copyright-text">${escapeHtmlEdge(copyrightStr)}</p>`);

  const fl = payload.shell.heroCtas?.floatingCta;
  const showFloating = Boolean(fl?.enabled && fl?.label && fl?.url && isHomeRoute);
  const flHref = showFloating ? fl?.url || '#' : '#';
  const flRel = showFloating && (flHref === '/moreinfo' || flHref === '/download') ? ' rel="nofollow noopener"' : '';
  const flLabel = showFloating ? escapeHtmlEdge(fl?.label || '') : '';
  html = html.replace(
    /<div id="floating-bottom-cta" class="floating-cta-wrapper[^"]*">[\s\S]*?<\/div>/i,
    `<div id="floating-bottom-cta" class="floating-cta-wrapper${showFloating ? '' : ' hidden'}">\n      <a id="floating-cta-btn" class="floating-cta-button" href="${escapeHtmlEdge(flHref)}"${flRel}>${flLabel}</a>\n    </div>`
  );

  const extraHeadTags = [];
  const themeColor = escapeHtmlEdge(safe?.brand?.themeColor || safe?.brand?.accentColor || '#EF4444');
  const appleIconHref = escapeHtmlEdge(
    optimizeCloudinaryUrlEdge(safe?.brand?.appleTouchIconUrl || safe?.brand?.searchLogoUrl || safe?.brand?.logoUrl || '')
  );

  extraHeadTags.push(`<meta name="robots" content="${payload.isConfigured ? 'index, follow' : 'noindex, nofollow'}" />`);
  extraHeadTags.push(`<meta name="theme-color" content="${themeColor}" />`);
  if (brandName) {
    extraHeadTags.push(`<meta name="application-name" content="${brandName}" />`);
    extraHeadTags.push(`<meta property="og:site_name" content="${brandName}" />`);
  }
  if (appleIconHref) {
    extraHeadTags.push(`<link rel="apple-touch-icon" sizes="180x180" href="${appleIconHref}" />`);
  }
  if (safe?.domainConfig?.enableWebManifest !== false) {
    extraHeadTags.push('<link rel="manifest" href="/manifest.webmanifest" />');
  }
  if (safe?.domainConfig?.enableSitemapXml !== false) {
    extraHeadTags.push('<link rel="sitemap" type="application/xml" title="Sitemap" href="/sitemap.xml" />');
  }

  if (payload.viewType === 'home' && safe?.hero?.showBanner !== false && safe?.hero?.bannerImageUrl) {
    extraHeadTags.push(
      `<link rel="preload" as="image" href="${escapeHtmlEdge(optimizeImageUrlEdge(safe.hero.bannerImageUrl, 1200))}" fetchpriority="high" />`
    );
  } else if (payload.viewType === 'news-article' && payload.ogImage) {
    extraHeadTags.push(
      `<link rel="preload" as="image" href="${escapeHtmlEdge(optimizeImageUrlEdge(payload.ogImage, 1200))}" fetchpriority="high" />`
    );
  }

  const gaRaw = String(safe?.domainConfig?.googleAnalyticsId || '').trim();
  if (/^(G|GT|AW|DC)-[A-Z0-9]{4,24}$/i.test(gaRaw) || /^UA-\d{4,12}-\d{1,4}$/i.test(gaRaw)) {
    const safeGa = escapeHtmlEdge(gaRaw);
    extraHeadTags.push(
      `<script async src="https://www.googletagmanager.com/gtag/js?id=${safeGa}"></script>\n  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${safeGa}');</script>`
    );
  }

  if (/<script\s+id="dynamic-jsonld-schema"[^>]*>[\s\S]*?<\/script>/i.test(html)) {
    html = html.replace(
      /<script\s+id="dynamic-jsonld-schema"[^>]*>[\s\S]*?<\/script>/i,
      `<script id="dynamic-jsonld-schema" type="application/ld+json">${jsonLdStr}</script>`
    );
  }

  const lightweightBootstrap = {
    path: payload.path,
    canonicalPath: payload.canonicalPath,
    viewType: payload.viewType,
    isConfigured: payload.isConfigured,
    metaTitle: payload.metaTitle,
    metaDescription: payload.metaDescription,
    ogImage: payload.ogImage,
    heroH1: payload.heroH1,
    showHeroSection: payload.showHeroSection,
    showHeroCtaGrid: payload.showHeroCtaGrid,
    renderedMainHtml: '',
    shell: payload.shell,
    updatedAt: payload.updatedAt
  };

  html = html.replace('</head>', `  ${extraHeadTags.join('\n  ')}\n</head>`);
  const bootstrapTag = `<script>window.__INITIAL_ROUTE_PAYLOAD__=${JSON.stringify(lightweightBootstrap).replace(/<\//g, '<\\/')};</script>`;
  if (/<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, `  ${bootstrapTag}\n</body>`);
  } else {
    html = html.replace('</head>', `${bootstrapTag}\n</head>`);
  }
  return html;
}

const RESERVED_PUBLIC_SLUGS_EDGE = new Set([
  'news',
  'moreinfo',
  'download',
  'admin',
  'api',
  'assets',
  'uploads',
  'static-routes',
  'public',
  'functions'
]);

/**
 * Normalize Vite-bundled `<script type="module" src="/assets/main-*.js">` (or `moreinfo-*.js`)
 * back to stable `/app.js` (or `/moreinfo.js`) when compiling portable static public HTML on Edge.
 */
export function normalizeStaticPublicHtmlScriptsEdge(html, targetScriptPath) {
  if (!html) return html;
  const chunkPrefix = targetScriptPath === '/moreinfo.js' ? 'moreinfo' : 'main';
  let out = String(html).replace(
    new RegExp(
      `<script\\s+[^>]*src=["']\\/?assets\\/${chunkPrefix}-[a-zA-Z0-9_-]+\\.js["'][^>]*>\\s*<\\/script>`,
      'gi'
    ),
    `<script type="module" src="${targetScriptPath}"></script>`
  );
  out = out.replace(
    /<link\s+[^>]*rel=["']modulepreload["'][^>]*href=["']\/?assets\/[^"']+\.js["'][^>]*\/?>\s*/gi,
    ''
  );
  return out;
}

/**
 * Render the isolated Protected Security & Download Gateway HTML (`/moreinfo` & `/download`)
 * on Cloudflare Edge with 100% parity to Node `renderGatewayPageHtml`.
 */
export function renderGatewayPageHtmlEdge(moreinfoHtmlTemplate, config) {
  const safe = config || EMPTY_ADMIN_CONFIG;
  const brand = safe.brand || EMPTY_ADMIN_CONFIG.brand;
  const specs = safe.packageSpecs || EMPTY_ADMIN_CONFIG.packageSpecs;
  const sec = safe.securityGate || EMPTY_ADMIN_CONFIG.securityGate;

  const rawBrandName = String(brand.name || '').trim();
  const displayTitle = String(sec.customHeading || specs.appName || rawBrandName || '').trim();
  const logoUrlClean = optimizeImageUrlEdge(brand.logoUrl || '', 256);
  const faviconUrlClean = optimizeImageUrlEdge(brand.faviconUrl || brand.logoUrl || '', 128);

  const safeCustomNoteHtml = sanitizeEditorialHtmlEdge(
    String(sec.customNoteHtml || '').trim(),
    displayTitle || 'Official Notice'
  );
  const safeWhatsapp = sanitizeSafeUrlEdge(sec.helplineWhatsapp || '', {
    allowHash: false,
    allowMailto: false
  });
  const safeTelegram = sanitizeSafeUrlEdge(sec.helplineTelegram || '', {
    allowHash: false,
    allowMailto: false
  });

  const publicGatewayMeta = {
    brandName: rawBrandName,
    logoUrl: logoUrlClean,
    accentColor: brand.accentColor || '#EF4444',
    appSlug: sec.appSlug || generateSlugEdge(brand.shortName || rawBrandName || 'package') || 'package',
    appSerialId: sec.appSerialId || 'PKG-001',
    proceedButtonLabel: sec.proceedButtonLabel || 'PROCEED',
    unavailableMessage: sec.unavailableMessage || '',
    helplineWhatsapp: safeWhatsapp,
    helplineTelegram: safeTelegram,
    customHeading: sec.customHeading || '',
    customNoteHtml: safeCustomNoteHtml,
    showSpecsOnGateway: Boolean(sec.showSpecsOnGateway),
    appName: displayTitle,
    version: specs.version || '',
    fileSize: specs.fileSize || '',
    operatingSystem: specs.operatingSystem || '',
    securityStatus: specs.securityStatus || '',
    sha256: specs.sha256 || ''
  };

  let html = String(moreinfoHtmlTemplate || '');
  const faviconHref = escapeHtmlEdge(faviconUrlClean);
  const logoHref = escapeHtmlEdge(logoUrlClean);
  html = html.replace(
    /<link\s+rel="icon"\s+id="gateway-favicon"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="icon" id="gateway-favicon" href="${faviconHref}" />`
  );
  html = html.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeHtmlEdge(displayTitle || 'Verification')}</title>`
  );
  html = html.replace(
    /<span\s+id="gw-brand-name">[\s\S]*?<\/span>/i,
    `<span id="gw-brand-name">${escapeHtmlEdge(rawBrandName)}</span>`
  );
  html = html.replace(
    /<img\b[^>]*id="gw-brand-logo"[^>]*>/i,
    `<img id="gw-brand-logo" class="gateway-brand-logo${logoHref ? '' : ' hidden'}" src="${logoHref}" alt="${escapeHtmlEdge(rawBrandName ? `${rawBrandName} Logo` : '')}" width="30" height="30" />`
  );
  html = html.replace(
    /<img\b[^>]*id="gw-app-icon"[^>]*>/i,
    `<img id="gw-app-icon" class="app-summary-icon${logoHref ? '' : ' hidden'}" src="${logoHref}" alt="${escapeHtmlEdge(displayTitle)}" width="64" height="64" />`
  );
  html = html.replace(
    /<h1\s+class="app-summary-title"\s+id="gw-app-title">[\s\S]*?<\/h1>/i,
    `<h1 class="app-summary-title" id="gw-app-title">${escapeHtmlEdge(displayTitle)}</h1>`
  );
  html = html.replace(
    /<span\s+id="gw-app-version">[\s\S]*?<\/span>/i,
    `<span id="gw-app-version">${escapeHtmlEdge(specs.version || '')}</span>`
  );
  html = html.replace(
    /<span\s+id="gw-app-meta-dot"[^>]*>[\s\S]*?<\/span>/i,
    `<span id="gw-app-meta-dot"${specs.version && specs.fileSize ? '' : ' class="hidden"'}>·</span>`
  );
  html = html.replace(
    /<span\s+id="gw-app-size">[\s\S]*?<\/span>/i,
    `<span id="gw-app-size">${escapeHtmlEdge(specs.fileSize || '')}</span>`
  );
  html = html.replace(
    /<span\s+id="gw-footer-copyright">[\s\S]*?<\/span>/i,
    `<span id="gw-footer-copyright">${rawBrandName ? `© ${new Date().getFullYear()} ${escapeHtmlEdge(rawBrandName)}. All rights reserved.` : ''}</span>`
  );

  if (safeCustomNoteHtml) {
    html = html.replace(
      /<div\s+id="gw-custom-note"\s+class="custom-note-box\s+hidden">[\s\S]*?<\/div>/i,
      `<div id="gw-custom-note" class="custom-note-box">${safeCustomNoteHtml}</div>`
    );
  }

  if (sec.showSpecsOnGateway) {
    html = html.replace(
      /<section\s+class="specs-card\s+hidden"\s+id="gw-specs-card">/i,
      '<section class="specs-card" id="gw-specs-card">'
    );
    html = html.replace(
      /<td\s+id="gw-spec-name">[\s\S]*?<\/td>/i,
      `<td id="gw-spec-name">${escapeHtmlEdge(displayTitle || '—')}</td>`
    );
    html = html.replace(
      /<td\s+id="gw-spec-ver-size">[\s\S]*?<\/td>/i,
      `<td id="gw-spec-ver-size">${escapeHtmlEdge([specs.version, specs.fileSize].filter(Boolean).join(' · ') || '—')}</td>`
    );
    html = html.replace(
      /<td\s+id="gw-spec-os">[\s\S]*?<\/td>/i,
      `<td id="gw-spec-os">${escapeHtmlEdge(specs.operatingSystem || '—')}</td>`
    );
    html = html.replace(
      /<code\s+id="gw-spec-sha256">[\s\S]*?<\/code>/i,
      `<code id="gw-spec-sha256">${escapeHtmlEdge(specs.sha256 || '')}</code>`
    );
  }

  const metaScript = `
  <script>
    window.__GATEWAY_PUBLIC_META__ = ${JSON.stringify(publicGatewayMeta).replace(/<\//g, '<\\/')};
  </script>
</head>`;
  html = html.replace('</head>', metaScript);
  return html;
}

/**
 * Compile the full static public website bundle on Cloudflare Edge.
 */
export function compileEdgeStaticSiteBundle(config, options = {}) {
  const safe = config || EMPTY_ADMIN_CONFIG;
  const rawTemplate = options.indexHtmlTemplate || FALLBACK_EDGE_HTML_TEMPLATE;
  const template = normalizeStaticPublicHtmlScriptsEdge(rawTemplate, '/app.js');
  const files = [];
  const seenFilePaths = new Set();

  const pushUniqueFile = (file) => {
    const clean = String(file?.path || '').replace(/^\/+/, '');
    if (!clean || seenFilePaths.has(clean)) return;
    seenFilePaths.add(clean);
    files.push({ ...file, path: clean });
  };

  const registerRoute = (routePath, htmlPath, label) => {
    const cleanHtmlPath = String(htmlPath || '').replace(/^\/+/, '');
    if (!cleanHtmlPath || seenFilePaths.has(cleanHtmlPath)) return;
    pushUniqueFile({
      path: cleanHtmlPath,
      content: renderCompleteStaticPageHtmlEdge(template, safe, routePath),
      encoding: 'utf-8',
      description: `Static HTML page for ${label} (${routePath})`
    });
    const payload = buildPartialRoutePayloadEdge(routePath, safe);
    pushUniqueFile({
      path: `static-routes/${routePathToStaticJsonNameEdge(routePath)}`,
      content: JSON.stringify(payload, null, 2),
      encoding: 'utf-8',
      description: `Static route payload for ${routePath}`
    });
  };

  registerRoute('/', 'index.html', 'Homepage');
  registerRoute('/news', 'news/index.html', 'Daily News Hub');

  for (const article of getNewsArticlesEdge(safe)) {
    const slug = generateSlugEdge(article.slug || article.title);
    if (slug) {
      registerRoute(`/news/${slug}`, `news/${slug}/index.html`, `News Article: ${article.title}`);
    }
  }

  for (const pg of safe.pages || []) {
    const slug = generateSlugEdge(pg.slug || pg.label);
    if (slug && !RESERVED_PUBLIC_SLUGS_EDGE.has(slug)) {
      registerRoute(`/${slug}`, `${slug}/index.html`, `Standalone Page: ${pg.label}`);
    }
  }

  if (safe.securityGate?.enabled !== false && options.moreinfoHtmlTemplate) {
    const normalizedMoreinfoTpl = normalizeStaticPublicHtmlScriptsEdge(options.moreinfoHtmlTemplate, '/moreinfo.js');
    const renderedGatewayHtml = renderGatewayPageHtmlEdge(normalizedMoreinfoTpl, safe);
    pushUniqueFile({
      path: 'moreinfo/index.html',
      content: renderedGatewayHtml,
      encoding: 'utf-8',
      description: 'Isolated Security & Download Gateway (/moreinfo)'
    });
    pushUniqueFile({
      path: 'download/index.html',
      content: renderedGatewayHtml,
      encoding: 'utf-8',
      description: 'Isolated Security & Download Gateway Alias (/download)'
    });
  }

  if (options.appJsContent) {
    pushUniqueFile({ path: 'app.js', content: options.appJsContent, encoding: 'utf-8', description: 'Zero-Firebase static public router script' });
  }
  if (options.moreinfoJsContent) {
    pushUniqueFile({ path: 'moreinfo.js', content: options.moreinfoJsContent, encoding: 'utf-8', description: 'Client-side Security Gateway script' });
  }

  if (Array.isArray(options.extraAssetFiles)) {
    for (const assetFile of options.extraAssetFiles) {
      if (assetFile && assetFile.path && assetFile.content !== undefined) {
        pushUniqueFile(assetFile);
      }
    }
  }

  pushUniqueFile({
    path: '_headers',
    content: [
      '/*',
      '  X-Content-Type-Options: nosniff',
      '  Referrer-Policy: strict-origin-when-cross-origin',
      '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
      '/assets/*',
      '  Cache-Control: public, max-age=31536000, immutable',
      '/uploads/*',
      '  Content-Security-Policy: default-src \'none\'; sandbox',
      '  X-Content-Type-Options: nosniff',
      '  Cache-Control: public, max-age=31536000, immutable',
      '/static-routes/*',
      '  Cache-Control: public, max-age=60, stale-while-revalidate=300',
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
    description: 'Cloudflare Pages edge security, caching, and gateway isolation headers'
  });

  if (safe.domainConfig?.enableSitemapXml !== false) {
    pushUniqueFile({ path: 'sitemap.xml', content: generateSitemapXmlEdge(safe), encoding: 'utf-8', description: 'Search Engine XML Sitemap' });
  }
  pushUniqueFile({ path: 'robots.txt', content: generateRobotsTxtEdge(safe), encoding: 'utf-8', description: 'Robots Rules' });
  if (safe.domainConfig?.enableRssFeed !== false) {
    pushUniqueFile({ path: 'feed.xml', content: generateRssFeedXmlEdge(safe), encoding: 'utf-8', description: 'RSS 2.0 News Feed' });
  }
  if (safe.domainConfig?.enableWebManifest !== false) {
    pushUniqueFile({ path: 'manifest.webmanifest', content: generateWebManifestJsonEdge(safe), encoding: 'utf-8', description: 'W3C Web App Manifest' });
  }

  return files;
}
