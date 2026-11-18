/**
 * ============================================================================
 * MODULE 2: TECHNICAL SEO, SCHEMA.ORG JSON-LD, SITEMAP, MANIFEST, ROBOTS & RSS (cms-seo.ts)
 * Handles:
 * - Route Resolution (`resolveRouteView`) for `/`, `/news`, `/news/:slug`, `/:pageSlug`
 * - Schema.org JSON-LD `@graph` (`WebSite`, `Organization` with 512x512 Google Search Result Logo,
 *   `BreadcrumbList`, `SoftwareApplication`, `FAQPage`, `CollectionPage`, `NewsArticle`, `WebPage`)
 * - Dynamic `sitemap.xml` (with Google Image Sitemap `<image:image>` extension),
 *   `manifest.webmanifest`, `robots.txt`, `feed.xml`, and Technical SEO Health Audit
 * ============================================================================
 */

import {
  SiteConfig,
  NewsArticleItem,
  StandalonePageItem,
  generateSlug,
  escapeHtml,
  normalizeDomainUrl,
  optimizeCloudinaryUrl
} from './cms-types';

/**
 * Convert a relative path (e.g. `/assets/app-icon.svg`) into an absolute canonical URL
 * for Schema.org JSON-LD, OpenGraph, and Google Image Sitemaps.
 */
export function toAbsoluteAssetUrl(urlOrPath: string | undefined, baseCanonical: string): string {
  const raw = (urlOrPath || '').trim();
  if (!raw) return '';
  const optimized = optimizeCloudinaryUrl(raw);
  if (/^https?:\/\//i.test(optimized) || optimized.startsWith('data:')) {
    return optimized;
  }
  const cleanBase = baseCanonical.replace(/\/+$/, '');
  const cleanRel = optimized.startsWith('/') ? optimized : `/${optimized}`;
  return `${cleanBase}${cleanRel}`;
}

/**
 * Extract FAQ pairs from raw HTML <h3>Q...</h3> + <p>...</p> blocks
 */
export function extractFaqsFromRawHtml(
  rawHtml: string | undefined | null
): Array<{ question: string; answer: string }> {
  if (!rawHtml || typeof rawHtml !== 'string') return [];
  const results: Array<{ question: string; answer: string }> = [];

  const h3Regex = /<h3[^>]*>([\s\S]*?)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;
  while ((match = h3Regex.exec(rawHtml)) !== null) {
    const rawQ = match[1].replace(/<[^>]+>/g, '').trim();
    const rawA = match[2].replace(/<[^>]+>/g, '').trim();
    if (rawQ && rawA && (/^q\d*[:.\s-]/i.test(rawQ) || rawQ.endsWith('?'))) {
      results.push({
        question: rawQ.replace(/^q\d*[:.\s-]*/i, '').trim(),
        answer: rawA
      });
    }
  }
  return results;
}

/**
 * Resolve Route Context for Public URL:
 * - '/' -> Home Page
 * - '/news' -> Dedicated Daily News Hub Page (all news articles)
 * - '/news/:slug' -> Standalone News Article Page
 * - '/:pageSlug' or '/page/:pageSlug' -> Standalone Legal / Footer Page
 */
export interface ResolvedRouteView {
  viewType: 'home' | 'news-hub' | 'news-article' | 'standalone-page';
  metaTitle: string;
  metaDescription: string;
  canonicalPath: string;
  ogImage?: string;
  article?: NewsArticleItem;
  page?: StandalonePageItem;
}

export function resolveRouteView(pathname: string, config: SiteConfig): ResolvedRouteView {
  const cleanPath = (pathname || '/').split('?')[0].replace(/\/+$/, '') || '/';
  const brandName = (config.brand?.name || '').trim();
  const brandSuffix = brandName ? ` | ${brandName}` : '';

  // 1. Check /news Hub Page
  if (cleanPath === '/news') {
    return {
      viewType: 'news-hub',
      metaTitle: config.newsSection?.metaTitle || `Daily News & Updates${brandSuffix}`,
      metaDescription:
        config.newsSection?.metaDescription ||
        (brandName
          ? `Browse all daily news updates, release changelogs, and announcements for ${brandName}.`
          : 'Browse published news updates and announcements.'),
      canonicalPath: '/news',
      ogImage: config.seo?.ogImageUrl || config.hero?.bannerImageUrl || ''
    };
  }

  // 2. Check /news/:slug Single News Article Page
  if (cleanPath.startsWith('/news/')) {
    const slug = cleanPath.slice('/news/'.length).trim().toLowerCase();
    const article = (config.newsSection?.articles || []).find(
      (a) => generateSlug(a.slug || a.title) === slug
    );
    if (article) {
      return {
        viewType: 'news-article',
        metaTitle: article.metaTitle || `${article.title}${brandSuffix}`,
        metaDescription: article.metaDescription || article.summary || config.seo.metaDescription,
        canonicalPath: `/news/${generateSlug(article.slug || article.title)}`,
        ogImage: article.coverImageUrl || config.seo?.ogImageUrl || config.hero?.bannerImageUrl || '',
        article
      };
    }
  }

  // 3. Check Standalone Legal / Footer Pages (/:slug or /page/:slug)
  const potentialSlug = cleanPath.startsWith('/page/')
    ? cleanPath.slice('/page/'.length).trim().toLowerCase()
    : cleanPath.slice(1).trim().toLowerCase();

  if (potentialSlug) {
    const matchedPage = (config.pages || []).find(
      (pg) => generateSlug(pg.slug || pg.label) === potentialSlug
    );
    if (matchedPage) {
      const cleanSlug = generateSlug(matchedPage.slug || matchedPage.label);
      return {
        viewType: 'standalone-page',
        metaTitle: matchedPage.metaTitle || `${matchedPage.h1}${brandSuffix}`,
        metaDescription: matchedPage.metaDescription || config.seo.metaDescription,
        canonicalPath: `/${cleanSlug}`,
        ogImage: matchedPage.bannerImageUrl || config.seo?.ogImageUrl || config.hero?.bannerImageUrl || '',
        page: matchedPage
      };
    }
  }

  // 4. Default to Home Page
  return {
    viewType: 'home',
    metaTitle: config.seo?.metaTitle || config.hero?.metaTitle || config.hero?.h1 || brandName || 'Coming Soon',
    metaDescription: config.seo?.metaDescription || config.hero?.metaDescription || '',
    canonicalPath: '/',
    ogImage: config.seo?.ogImageUrl || config.hero?.bannerImageUrl || ''
  };
}

/**
 * Build Schema.org JSON-LD @graph for Home, News Hub, News Article, or Standalone Page.
 * Includes Google Search Result Site Name (`WebSite`) and Small Site Logo (`Organization.logo` 512x512).
 */
export function buildJsonLdSchema(config: SiteConfig, pathname = '/'): Record<string, any> {
  const baseCanonical = normalizeDomainUrl(
    config.domainConfig?.primaryDomain || config.seo?.canonicalUrl,
    config.domainConfig?.forceHttps !== false
  );
  const route = resolveRouteView(pathname, config);
  const fullUrl = route.canonicalPath === '/' ? baseCanonical : `${baseCanonical}${route.canonicalPath}`;
  const rawLogo = config.brand?.searchLogoUrl || config.brand?.logoUrl || config.brand?.faviconUrl || '';
  const searchLogoUrl = rawLogo ? toAbsoluteAssetUrl(rawLogo, baseCanonical) : '';

  const orgNode: Record<string, any> = {
    "@type": "Organization",
    "@id": `${baseCanonical}/#organization`,
    "name": config.brand?.name || 'Organization',
    "url": baseCanonical,
    "email": config.brand?.contactEmail || undefined
  };
  if (searchLogoUrl) {
    orgNode.logo = {
      "@type": "ImageObject",
      "@id": `${baseCanonical}/#logo`,
      "url": searchLogoUrl,
      "contentUrl": searchLogoUrl,
      "width": 512,
      "height": 512,
      "caption": config.brand?.name || 'Organization Logo'
    };
    orgNode.image = { "@id": `${baseCanonical}/#logo` };
  }

  const graph: Array<Record<string, any>> = [
    {
      "@type": "WebSite",
      "@id": `${baseCanonical}/#website`,
      "url": baseCanonical,
      "name": config.brand?.name || 'Website',
      "alternateName": config.brand?.shortName || config.brand?.name || 'Website',
      "description": config.seo?.metaDescription || '',
      "publisher": { "@id": `${baseCanonical}/#organization` },
      "inLanguage": "en-US"
    },
    orgNode
  ];

  if (route.viewType === 'news-hub') {
    graph.push(
      {
        "@type": "BreadcrumbList",
        "@id": `${fullUrl}/#breadcrumb`,
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": config.brand?.name || "Home", "item": baseCanonical },
          { "@type": "ListItem", "position": 2, "name": config.newsSection?.heading || "Daily News", "item": fullUrl }
        ]
      },
      {
        "@type": "CollectionPage",
        "@id": `${fullUrl}/#news-collection`,
        "url": fullUrl,
        "name": route.metaTitle,
        "description": route.metaDescription,
        "isPartOf": { "@id": `${baseCanonical}/#website` },
        "breadcrumb": { "@id": `${fullUrl}/#breadcrumb` },
        "mainEntity": {
          "@type": "ItemList",
          "itemListElement": (config.newsSection?.articles || []).map((art, idx) => ({
            "@type": "ListItem",
            "position": idx + 1,
            "url": `${baseCanonical}/news/${generateSlug(art.slug || art.title)}`,
            "name": art.title
          }))
        }
      }
    );
    return { "@context": "https://schema.org", "@graph": graph };
  }

  if (route.viewType === 'news-article' && route.article) {
    const articleImage = route.article.coverImageUrl
      ? toAbsoluteAssetUrl(route.article.coverImageUrl, baseCanonical)
      : searchLogoUrl;
    graph.push(
      {
        "@type": "BreadcrumbList",
        "@id": `${fullUrl}/#breadcrumb`,
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": config.brand?.name || "Home", "item": baseCanonical },
          { "@type": "ListItem", "position": 2, "name": "Daily News", "item": `${baseCanonical}/news` },
          { "@type": "ListItem", "position": 3, "name": route.article.title, "item": fullUrl }
        ]
      },
      {
        "@type": "NewsArticle",
        "@id": `${fullUrl}/#article`,
        "headline": route.article.title,
        "description": route.article.metaDescription || route.article.summary,
        "image": [articleImage],
        "datePublished": route.article.date,
        "articleSection": route.article.category || "News",
        "mainEntityOfPage": fullUrl,
        "author": {
          "@type": "Organization",
          "name": route.article.author || config.brand?.name || 'Editorial Team'
        },
        "publisher": {
          "@id": `${baseCanonical}/#organization`
        }
      }
    );
    return { "@context": "https://schema.org", "@graph": graph };
  }

  if (route.viewType === 'standalone-page' && route.page) {
    graph.push(
      {
        "@type": "BreadcrumbList",
        "@id": `${fullUrl}/#breadcrumb`,
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": config.brand?.name || "Home", "item": baseCanonical },
          { "@type": "ListItem", "position": 2, "name": route.page.label || route.page.h1, "item": fullUrl }
        ]
      },
      {
        "@type": "WebPage",
        "@id": `${fullUrl}/#webpage`,
        "url": fullUrl,
        "name": route.page.metaTitle || route.page.h1,
        "description": route.page.metaDescription,
        "dateModified": route.page.lastUpdated,
        "breadcrumb": { "@id": `${fullUrl}/#breadcrumb` },
        "isPartOf": { "@id": `${baseCanonical}/#website` }
      }
    );
    return { "@context": "https://schema.org", "@graph": graph };
  }

  // Home Page Schemas: WebPage + BreadcrumbList + SoftwareApplication + HowTo + FAQPage
  graph.push(
    {
      "@type": "WebPage",
      "@id": `${baseCanonical}/#webpage`,
      "url": baseCanonical,
      "name": route.metaTitle,
      "description": route.metaDescription,
      "isPartOf": { "@id": `${baseCanonical}/#website` },
      "about": { "@id": `${baseCanonical}/#organization` },
      "inLanguage": "en-US"
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${baseCanonical}/#breadcrumb`,
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": config.brand?.name || "Home", "item": baseCanonical }
      ]
    }
  );

  if (config.seo?.enableSoftwareSchema && config.seo?.softwareDetails) {
    const sw = config.seo.softwareDetails;
    const rawReviews = String(sw.reviewCount || '1000').replace(/[^\d]/g, '') || '1000';
    graph.push({
      "@type": "SoftwareApplication",
      "@id": `${baseCanonical}/#software`,
      "name": sw.name || config.brand?.name || 'Application',
      "operatingSystem": sw.operatingSystem || config.packageSpecs?.operatingSystem || 'Android, iOS',
      "applicationCategory": sw.applicationCategory || 'UtilitiesApplication',
      "softwareVersion": config.packageSpecs?.version || "1.0.0",
      ...(config.packageSpecs?.fileSize ? { "fileSize": config.packageSpecs.fileSize } : {}),
      "offers": {
        "@type": "Offer",
        "price": sw.price || "0.00",
        "priceCurrency": sw.priceCurrency || "USD",
        "availability": "https://schema.org/InStock"
      },
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": sw.ratingValue || "4.9",
        "ratingCount": rawReviews,
        "bestRating": "5",
        "worstRating": "1"
      }
    });
  }

  // Extract HowTo steps from either <ol><li>...</li></ol> or <h3>Step N...</h3><p>...</p>
  const installSec = (config.sections || []).find(
    (s) => s.visible !== false && /install|setup|guide|how\s+to/i.test(s.heading || '')
  );
  if (installSec && installSec.htmlContent) {
    const html = installSec.htmlContent;
    const liMatches = Array.from(html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)).map((m, idx) => ({
      name: `Step ${idx + 1}`,
      text: String(m[1]).replace(/<[^>]+>/g, '').trim()
    }));
    const h3StepMatches = Array.from(
      html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/gi)
    ).map((m, idx) => ({
      name: String(m[1]).replace(/<[^>]+>/g, '').trim() || `Step ${idx + 1}`,
      text: String(m[2]).replace(/<[^>]+>/g, '').trim()
    }));
    const steps = liMatches.length >= 2 ? liMatches : h3StepMatches;
    if (steps.length >= 2) {
      graph.push({
        "@type": "HowTo",
        "@id": `${baseCanonical}/#howto-install`,
        "name": installSec.heading,
        "description": installSec.metaDescription || route.metaDescription,
        "step": steps.map((st, idx) => ({
          "@type": "HowToStep",
          "position": idx + 1,
          "name": st.name,
          "text": st.text
        }))
      });
    }
  }

  const combinedFaqs: Array<{ question: string; answer: string }> = [];
  const seen = new Set<string>();

  if (config.faqsSection?.enabled && Array.isArray(config.faqsSection.items)) {
    for (const item of config.faqsSection.items) {
      if (item.question && item.answer) {
        const cleanQ = item.question.replace(/^Q\d*[:.\s-]*/i, '').trim();
        const key = cleanQ.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          combinedFaqs.push({ question: cleanQ, answer: item.answer.trim() });
        }
      }
    }
  }

  const htmlFaqs = extractFaqsFromRawHtml(config.content?.rawHtml || '');
  for (const item of htmlFaqs) {
    const key = item.question.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      combinedFaqs.push(item);
    }
  }

  if (combinedFaqs.length > 0) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${baseCanonical}/#faq`,
      "mainEntity": combinedFaqs.map((faq) => ({
        "@type": "Question",
        "name": faq.question,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": faq.answer
        }
      }))
    });
  }

  if (config.seo?.rawJsonLd && config.seo.rawJsonLd.trim()) {
    try {
      const custom = JSON.parse(config.seo.rawJsonLd);
      if (Array.isArray(custom)) {
        graph.push(...custom);
      } else if (custom && Array.isArray(custom['@graph'])) {
        graph.push(...custom['@graph']);
      } else if (custom && typeof custom === 'object') {
        graph.push(custom);
      }
    } catch {
      // Ignore malformed custom JSON-LD
    }
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph
  };
}

/**
 * Generate Dynamic W3C Web App Manifest (`/manifest.webmanifest`)
 * Powers Google Search Result Site Icon discovery, mobile home-screen installability, and theme color.
 */
export function generateWebManifestJson(config: SiteConfig): string {
  if (config.domainConfig?.enableWebManifest === false) return '{}';
  const brandName = (config.brand?.name || '').trim();
  const shortName = (config.brand?.shortName || brandName || '').trim();
  const iconUrl = optimizeCloudinaryUrl(
    config.brand?.searchLogoUrl || config.brand?.faviconUrl || config.brand?.logoUrl || ''
  );
  const appleIconUrl = optimizeCloudinaryUrl(
    config.brand?.appleTouchIconUrl || iconUrl || ''
  );

  const icons: Array<{ src: string; sizes: string; type: string; purpose: string }> = [];
  if (iconUrl) {
    const isSvg = iconUrl.toLowerCase().endsWith('.svg');
    const mimeType = isSvg ? 'image/svg+xml' : 'image/png';
    icons.push({
      src: iconUrl,
      sizes: isSvg ? 'any' : '48x48 96x96 192x192 512x512',
      type: mimeType,
      purpose: 'any maskable'
    });
  }
  if (appleIconUrl) {
    const isSvg = appleIconUrl.toLowerCase().endsWith('.svg');
    const mimeType = isSvg ? 'image/svg+xml' : 'image/png';
    icons.push({
      src: appleIconUrl,
      sizes: isSvg ? 'any' : '180x180',
      type: mimeType,
      purpose: 'any'
    });
  }

  const manifestName = config.brand?.tagline
    ? (brandName ? `${brandName} — ${config.brand.tagline}` : config.brand.tagline)
    : brandName;

  const manifest = {
    name: manifestName,
    short_name: shortName,
    description: config.seo?.metaDescription || config.hero?.metaDescription || '',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: config.uiConfig?.surfaceBackgroundColor || '#FFFFFF',
    theme_color: config.brand?.themeColor || config.brand?.accentColor || '#EF4444',
    icons
  };

  return JSON.stringify(manifest, null, 2);
}

/**
 * Generate Dynamic XML Sitemap (/sitemap.xml) covering Domain, Homepage, /news Hub,
 * all Daily News Articles (/news/:slug), all Standalone Legal Pages (/:slug),
 * AND Google Image Sitemap (`<image:image>`) entries for fast Google Images indexing.
 */
export function generateSitemapXml(config: SiteConfig): string {
  if (config.domainConfig?.enableSitemapXml === false) return '';
  const base = normalizeDomainUrl(
    config.domainConfig?.primaryDomain || config.seo?.canonicalUrl,
    config.domainConfig?.forceHttps !== false
  );
  const isoDate = new Date(config.updatedAt || Date.now()).toISOString().split('T')[0];
  const includeImages = config.domainConfig?.enableImageSitemap !== false;
  const escapeXml = (s: string) =>
    (s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  interface SitemapUrlEntry {
    loc: string;
    priority: string;
    changefreq: string;
    lastmod: string;
    images: Array<{ loc: string; title: string }>;
  }

  const homeImages: Array<{ loc: string; title: string }> = [];
  if (includeImages) {
    if (config.hero?.showBanner !== false && config.hero?.bannerImageUrl) {
      homeImages.push({
        loc: toAbsoluteAssetUrl(config.hero.bannerImageUrl, base),
        title: config.hero.bannerAlt || config.hero.h1 || config.brand.name
      });
    }
    for (const sec of config.sections || []) {
      if (sec.visible !== false && sec.imageUrl && sec.imagePosition !== 'none') {
        homeImages.push({
          loc: toAbsoluteAssetUrl(sec.imageUrl, base),
          title: sec.imageAlt || sec.heading
        });
      }
    }
  }

  const urls: SitemapUrlEntry[] = [
    { loc: `${base}/`, priority: '1.0', changefreq: 'daily', lastmod: isoDate, images: homeImages },
    { loc: `${base}/news`, priority: '0.9', changefreq: 'daily', lastmod: isoDate, images: [] }
  ];

  for (const art of config.newsSection?.articles || []) {
    const slug = generateSlug(art.slug || art.title);
    if (slug) {
      const artImages: Array<{ loc: string; title: string }> = [];
      if (includeImages && art.coverImageUrl) {
        artImages.push({
          loc: toAbsoluteAssetUrl(art.coverImageUrl, base),
          title: art.coverImageAlt || art.title
        });
      }
      urls.push({
        loc: `${base}/news/${slug}`,
        priority: '0.8',
        changefreq: 'weekly',
        lastmod: isoDate,
        images: artImages
      });
    }
  }

  for (const pg of config.pages || []) {
    const slug = generateSlug(pg.slug || pg.label);
    if (slug) {
      const pgImages: Array<{ loc: string; title: string }> = [];
      if (includeImages && pg.bannerImageUrl) {
        pgImages.push({
          loc: toAbsoluteAssetUrl(pg.bannerImageUrl, base),
          title: pg.bannerImageAlt || pg.h1
        });
      }
      urls.push({
        loc: `${base}/${slug}`,
        priority: '0.6',
        changefreq: 'monthly',
        lastmod: isoDate,
        images: pgImages
      });
    }
  }

  const xmlEntries = urls
    .map((u) => {
      const imgXml = u.images
        .map(
          (img) => `    <image:image>
      <image:loc>${escapeXml(img.loc)}</image:loc>
      <image:title>${escapeXml(img.title)}</image:title>
    </image:image>`
        )
        .join('\n');
      return `  <url>
    <loc>${escapeXml(u.loc)}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>${imgXml ? `\n${imgXml}` : ''}
  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${xmlEntries}
</urlset>`;
}

/**
 * Generate Dynamic robots.txt (/robots.txt) with Sitemap link
 */
export function generateRobotsTxt(config: SiteConfig): string {
  const base = normalizeDomainUrl(
    config.domainConfig?.primaryDomain || config.seo?.canonicalUrl,
    config.domainConfig?.forceHttps !== false
  );
  let customRules = (
    config.domainConfig?.customRobotsTxt ||
    'User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /admin.html'
  ).trim();

  const mandatoryDisallows = [
    'Disallow: /moreinfo',
    'Disallow: /moreinfo/',
    'Disallow: /download',
    'Disallow: /download/',
    'Disallow: /api/v1/app/'
  ];
  for (const rule of mandatoryDisallows) {
    if (!customRules.includes(rule)) {
      customRules += `\n${rule}`;
    }
  }

  return `${customRules}\n\nSitemap: ${base}/sitemap.xml\n`;
}

/**
 * Generate Dynamic RSS 2.0 XML Feed (/feed.xml) for Daily News Articles
 */
export function generateRssFeedXml(config: SiteConfig): string {
  if (config.domainConfig?.enableRssFeed === false) return '';
  const base = normalizeDomainUrl(
    config.domainConfig?.primaryDomain || config.seo?.canonicalUrl,
    config.domainConfig?.forceHttps !== false
  );
  const escapeXml = (s: string) =>
    (s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const itemsXml = (config.newsSection?.articles || [])
    .map((art) => {
      const slug = generateSlug(art.slug || art.title);
      const url = `${base}/news/${slug}`;
      return `    <item>
      <title>${escapeXml(art.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <category>${escapeXml(art.category || 'News')}</category>
      <description>${escapeXml(art.metaDescription || art.summary)}</description>
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(config.brand?.name || 'Site')} — Daily News &amp; Release Feed</title>
    <link>${base}/news</link>
    <description>${escapeXml(config.newsSection?.metaDescription || config.seo?.metaDescription || '')}</description>
    <language>en-us</language>
${itemsXml}
  </channel>
</rss>`;
}

/**
 * Audit Site Technical SEO & Content Completeness (Returns Score 0-100 + Checklist)
 */
export interface SeoAuditResult {
  score: number;
  totalUrlsInSitemap: number;
  checks: Array<{
    id: string;
    label: string;
    passed: boolean;
    detail: string;
    fixTab?: string;
    fixSubtab?: string;
  }>;
}

export function auditSiteSeoHealth(config: SiteConfig): SeoAuditResult {
  const checks: SeoAuditResult['checks'] = [];
  const articles = config.newsSection?.articles || [];
  const pages = config.pages || [];
  const sections = config.sections || [];

  const titleLen = (config.seo?.metaTitle || '').trim().length;
  const titleOk = titleLen >= 15 && titleLen <= 75;
  checks.push({
    id: 'home-meta-title',
    label: 'Homepage Meta Title Configured',
    passed: titleOk,
    detail:
      titleLen === 0
        ? 'Not set (Recommended: 30–65 chars for homepage <title>)'
        : `${titleLen} characters (Recommended: 30–65 chars)`,
    fixTab: 'domain',
    fixSubtab: 'serp'
  });

  const descLen = (config.seo?.metaDescription || '').trim().length;
  const descOk = descLen >= 50 && descLen <= 200;
  checks.push({
    id: 'home-meta-desc',
    label: 'Homepage Meta Description Configured',
    passed: descOk,
    detail:
      descLen === 0
        ? 'Not set (Recommended: 80–165 chars for search snippet)'
        : `${descLen} characters (Recommended: 80–165 chars)`,
    fixTab: 'domain',
    fixSubtab: 'serp'
  });

  const domain = (config.domainConfig?.primaryDomain || config.seo?.canonicalUrl || '').trim();
  checks.push({
    id: 'domain-https',
    label: 'Production Canonical Domain & HTTPS Active',
    passed: domain.startsWith('https://'),
    detail: domain || 'Not set — add your https:// production domain',
    fixTab: 'domain',
    fixSubtab: 'sitemap'
  });

  const hasFavicon = Boolean(config.brand?.faviconUrl?.trim());
  const hasLogo = Boolean(config.brand?.searchLogoUrl?.trim() || config.brand?.logoUrl?.trim());
  const manifestEnabled = config.domainConfig?.enableWebManifest !== false;
  const hasIconsAndManifest = hasFavicon && hasLogo && manifestEnabled;
  const missingIconParts: string[] = [];
  if (!hasFavicon) missingIconParts.push('Favicon URL');
  if (!hasLogo) missingIconParts.push('Logo / Search Logo URL');
  if (!manifestEnabled) missingIconParts.push('Web Manifest disabled');
  checks.push({
    id: 'search-logo-manifest',
    label: 'Search Logo, Favicon & Web Manifest Active',
    passed: hasIconsAndManifest,
    detail: hasIconsAndManifest
      ? 'Organization 512x512 logo, favicon & /manifest.webmanifest active'
      : `Needs setup: ${missingIconParts.join(', ')}`,
    fixTab: 'brand',
    fixSubtab: 'identity'
  });

  const hasHeroOrBrand = Boolean(config.hero?.h1?.trim() || config.brand?.name?.trim());
  const bannerShown = config.hero?.showBanner !== false;
  const hasBannerUrl = Boolean(config.hero?.bannerImageUrl?.trim());
  const hasBannerAlt = Boolean(config.hero?.bannerAlt?.trim());
  const lcpBannerOptimized = hasHeroOrBrand && (!bannerShown || (hasBannerUrl && hasBannerAlt));
  let lcpDetail = '';
  if (!hasHeroOrBrand) {
    lcpDetail = 'Configure Hero headline / Brand name and 16:9 showcase banner';
  } else if (!bannerShown) {
    lcpDetail = 'Hero banner disabled — text-only LCP active';
  } else if (hasBannerUrl && hasBannerAlt) {
    lcpDetail =
      config.domainConfig?.enableImageSitemap !== false
        ? 'fetchpriority="high" + <link rel="preload"> + Image Sitemap active'
        : 'fetchpriority="high" + <link rel="preload"> active';
  } else {
    const missingBanner: string[] = [];
    if (!hasBannerUrl) missingBanner.push('Banner Image URL');
    if (!hasBannerAlt) missingBanner.push('Banner Alt Text');
    lcpDetail = `Missing: ${missingBanner.join(', ')}`;
  }
  checks.push({
    id: 'lcp-image-seo',
    label: 'FCP/LCP Hero Headline, Banner & Alt Text Ready',
    passed: lcpBannerOptimized,
    detail: lcpDetail,
    fixTab: 'hero',
    fixSubtab: ''
  });

  const sectionsMissingMeta = sections.filter(
    (s) => !Boolean(s.metaTitle?.trim() && s.metaDescription?.trim())
  ).length;
  const sectionsWithMeta = sections.length > 0 && sectionsMissingMeta === 0;
  checks.push({
    id: 'sections-meta',
    label: 'Content Sections Have Meta Title & Description',
    passed: sectionsWithMeta,
    detail:
      sections.length === 0
        ? 'No homepage content sections added yet'
        : sectionsMissingMeta === 0
        ? `${sections.length} content section(s) verified`
        : `${sectionsMissingMeta} of ${sections.length} section(s) missing meta title or description`,
    fixTab: 'sections'
  });

  const newsMissingMeta = articles.filter(
    (a) => !Boolean(a.title?.trim() && a.slug?.trim() && a.metaTitle?.trim() && a.metaDescription?.trim())
  ).length;
  const newsWithMeta = articles.length > 0 && newsMissingMeta === 0;
  checks.push({
    id: 'news-meta',
    label: 'Daily News Articles Have Slugs & Meta Tags',
    passed: newsWithMeta,
    detail:
      articles.length === 0
        ? 'No daily news articles published yet'
        : newsMissingMeta === 0
        ? `${articles.length} daily news article(s) indexed under /news/:slug`
        : `${newsMissingMeta} of ${articles.length} article(s) missing slug or SEO meta tags`,
    fixTab: 'news'
  });

  const pagesMissingMeta = pages.filter(
    (p) => !Boolean(p.slug?.trim() && p.metaTitle?.trim() && p.metaDescription?.trim() && p.htmlContent?.trim())
  ).length;
  const pagesWithMeta = pages.length >= 3 && pagesMissingMeta === 0;
  checks.push({
    id: 'pages-meta',
    label: 'Legal & Footer Pages Have URLs & Meta Tags',
    passed: pagesWithMeta,
    detail:
      pages.length === 0
        ? 'No standalone legal pages added yet (recommend at least 3: Privacy, Terms, Contact)'
        : pagesMissingMeta > 0
        ? `${pagesMissingMeta} of ${pages.length} page(s) missing content or SEO meta tags`
        : pages.length < 3
        ? `${pages.length} page(s) configured — add at least 3 legal/support pages`
        : `${pages.length} standalone pages active (${pages.map((p) => '/' + p.slug).join(', ')})`,
    fixTab: 'pages'
  });

  const internalLinksCount = (config.domainConfig?.internalLinks || []).length;
  const autoInternalActive = config.domainConfig?.enableAutoInternalLinks !== false;
  const hasLinkTargets =
    internalLinksCount > 0 || pages.length > 0 || (sections.length > 0 && articles.length > 0);
  const internalLinkingPassed = autoInternalActive && hasLinkTargets;
  checks.push({
    id: 'internal-linking-seo',
    label: 'Contextual Internal Linking & Crawl Hub Active',
    passed: internalLinkingPassed,
    detail: !autoInternalActive
      ? 'Auto internal linking disabled in Internal Linking workspace'
      : !hasLinkTargets
      ? 'Enabled, waiting for keyword link rules or pages/sections to cross-link'
      : `${internalLinksCount} keyword link rule(s) + automatic cross-linking active`,
    fixTab: 'links',
    fixSubtab: ''
  });

  const passedCount = checks.filter((c) => c.passed).length;
  const score = Math.round((passedCount / checks.length) * 100);

  const isSiteConfigured = Boolean(
    config.brand?.name?.trim() || config.hero?.h1?.trim() || articles.length > 0 || pages.length > 0
  );
  const totalUrlsInSitemap =
    config.domainConfig?.enableSitemapXml === false || !isSiteConfigured
      ? 0
      : 2 + articles.length + pages.length;

  return {
    score,
    totalUrlsInSitemap,
    checks
  };
}

/**
 * Sanitize & SEO-Enhance Admin-Authored HTML:
 * - Auto-assigns URL-safe `id="..."` anchors to `<h2>` and `<h3>` headings without an id
 * - Ensures all `<img>` tags include `loading="lazy" decoding="async"` and non-empty `alt` text
 */
export function sanitizeEditorialHtmlForSeo(rawHtml = '', fallbackAlt = 'Editorial Illustration'): string {
  if (!rawHtml || !rawHtml.trim()) return '';
  let html = rawHtml;
  const usedIds = new Set<string>();

  // 1. Ensure <h2> and <h3> have id attributes for deep-linking & schema anchors
  html = html.replace(/<(h[23])([^>]*)>([\s\S]*?)<\/\1>/gi, (full, tag, attrs, inner) => {
    if (/\bid\s*=/i.test(attrs)) {
      const idMatch = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i);
      if (idMatch?.[1]) usedIds.add(idMatch[1]);
      return full;
    }
    const plainText = String(inner).replace(/<[^>]+>/g, '').trim();
    const baseSlug = generateSlug(plainText) || 'section';
    let slug = baseSlug;
    let counter = 2;
    while (usedIds.has(slug)) {
      slug = `${baseSlug}-${counter++}`;
    }
    usedIds.add(slug);
    return `<${tag}${attrs} id="${slug}">${inner}</${tag}>`;
  });

  // 2. Ensure <img> tags have alt, loading="lazy", and decoding="async"
  html = html.replace(/<img\b([^>]*?)\/?>/gi, (_full, rawAttrs) => {
    let attrs = String(rawAttrs || '');
    if (!/\balt\s*=/i.test(attrs)) {
      attrs += ` alt="${escapeHtml(fallbackAlt)}"`;
    } else {
      attrs = attrs.replace(/\balt\s*=\s*""/i, `alt="${escapeHtml(fallbackAlt)}"`);
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

/**
 * Contextual Smart Internal Linking Engine (`applySmartInternalLinks`):
 * Safely scans `<p>` blocks in editorial HTML and links the first occurrence of configured
 * keywords (plus section & legal page titles) to internal URLs without breaking existing
 * `<a>`, `<code>`, `<strong>` tags or HTML attributes.
 */
export function applySmartInternalLinks(
  rawHtml: string,
  config: SiteConfig,
  currentPath = '/'
): string {
  if (!rawHtml || !rawHtml.trim()) return '';
  const sanitized = sanitizeEditorialHtmlForSeo(rawHtml, config.brand?.name || 'Official Guide');
  if (config.domainConfig?.enableAutoInternalLinks === false) {
    return sanitized;
  }

  const cleanCurrent = (currentPath || '/').split('?')[0].replace(/\/+$/, '') || '/';

  // Build prioritized keyword -> URL map
  const rules: Array<{ keyword: string; targetUrl: string; title: string }> = [];
  const seenKeywords = new Set<string>();

  const addRule = (keyword: string, targetUrl: string, title?: string) => {
    const kw = (keyword || '').trim();
    const url = (targetUrl || '').trim();
    if (kw.length < 4 || !url) return;
    const lowerKw = kw.toLowerCase();
    if (seenKeywords.has(lowerKw)) return;
    // Avoid self-linking to the exact same page
    const normalizedTarget = url.replace(/\/+$/, '') || '/';
    if (normalizedTarget === cleanCurrent) return;
    seenKeywords.add(lowerKw);
    rules.push({
      keyword: kw,
      targetUrl: url,
      title: (title || kw).trim()
    });
  };

  for (const custom of config.domainConfig?.internalLinks || []) {
    addRule(custom.keyword, custom.targetUrl, custom.title);
  }

  for (const page of config.pages || []) {
    if (page.label && page.slug) {
      addRule(page.label, `/${generateSlug(page.slug)}`, page.metaTitle || page.h1);
    }
  }

  if (rules.length === 0) return sanitized;

  let totalInjected = 0;
  const maxLinksPerBlock = 4;
  const linkedTargets = new Set<string>();

  return sanitized.replace(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi, (fullP, pAttrs, pInner) => {
    if (totalInjected >= maxLinksPerBlock) return fullP;
    // Skip paragraphs that already contain links or code blocks to keep typography clean
    if (/<a\b|<code\b/i.test(pInner)) return fullP;

    // Split paragraph by HTML tags so we only replace inside plain text nodes
    const tokens = String(pInner).split(/(<[^>]+>)/g);
    let modified = false;

    for (const rule of rules) {
      if (totalInjected >= maxLinksPerBlock) break;
      if (linkedTargets.has(rule.targetUrl)) continue;

      const escapedKw = rule.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b(${escapedKw})\\b`, 'i');

      for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];
        if (!tok || tok.startsWith('<')) continue;
        if (regex.test(tok)) {
          tokens[i] = tok.replace(
            regex,
            `<a href="${escapeHtml(rule.targetUrl)}" data-spa-link class="internal-seo-link" title="${escapeHtml(rule.title)}">$1</a>`
          );
          linkedTargets.add(rule.targetUrl);
          totalInjected++;
          modified = true;
          break;
        }
      }
    }

    return modified ? `<p${pAttrs}>${tokens.join('')}</p>` : fullP;
  });
}
