/**
 * ============================================================================
 * MODULE 3: PURE ISOMORPHIC & STATIC HTML RENDERERS (cms-renderer.ts)
 * Generates:
 * - Inner `<main id="dynamic-content">` HTML for Home, News Hub, News Article, and Legal Pages
 * - Rich Categorized Hamburger Drawer HTML (`renderHamburgerDrawerHtml`)
 * - Lightweight per-route JSON payload (`PartialRoutePayload`) for static route transitions
 * - Complete, standalone pre-compiled HTML documents (`renderCompleteStaticPageHtml`)
 *   with LCP image preloading, Web App Manifest, Apple Touch Icon, and zero Firebase SDK dependencies
 * ============================================================================
 */

import {
  SiteConfig,
  NewsArticleItem,
  StandalonePageItem,
  UiCustomizationConfig,
  HeaderNavLink,
  HomepageBlockKey,
  MASTER_DEFAULT_CONFIG,
  optimizeCloudinaryUrl,
  optimizeImageUrl,
  buildResponsiveImageSrcSet,
  generateSlug,
  escapeHtml,
  ensureCleanHtmlParagraphs,
  normalizeDomainUrl,
  resolveFontStackCss
} from './cms-types';
import {
  resolveRouteView,
  buildJsonLdSchema,
  applySmartInternalLinks,
  sanitizeEditorialHtmlForSeo,
  sanitizeSafeUrl
} from './cms-seo';

function buildResponsiveImgTag(
  rawUrl: string,
  alt: string,
  opts: {
    priority?: 'high' | 'low';
    maxWidth?: number;
    className?: string;
    sizes?: string;
  } = {}
): string {
  const safeRawUrl = sanitizeSafeUrl(rawUrl, { allowHash: false, allowMailto: false, allowDataImage: true });
  if (!safeRawUrl) return '';
  const isHigh = opts.priority === 'high';
  const maxWidth = opts.maxWidth || (isHigh ? 1200 : 768);
  const src = optimizeImageUrl(safeRawUrl, maxWidth);
  const srcSet = buildResponsiveImageSrcSet(safeRawUrl, isHigh ? [480, 768, 1200] : [400, 768]);
  const sizes = opts.sizes || '(max-width: 768px) 100vw, 720px';
  const classAttr = opts.className ? ` class="${escapeHtml(opts.className)}"` : '';
  const srcSetAttrs = srcSet ? ` srcset="${escapeHtml(srcSet)}" sizes="${escapeHtml(sizes)}"` : '';
  return `<img src="${escapeHtml(src)}"${srcSetAttrs} alt="${escapeHtml(alt)}" width="1200" height="675" loading="${isHigh ? 'eager' : 'lazy'}" fetchpriority="${isHigh ? 'high' : 'low'}" decoding="async" referrerpolicy="no-referrer"${classAttr} />`;
}

function wrapEditorialTables(html: string): string {
  if (!html || !html.includes('<table')) return html;
  if (html.includes('table-scroll-wrapper')) return html;
  return html.replace(/<table\b[\s\S]*?<\/table>/gi, (tbl) => `<div class="table-scroll-wrapper">${tbl}</div>`);
}

export function hasPackageSpecsData(specs: SiteConfig['packageSpecs'] | undefined): boolean {
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

export function isSiteConfigured(config: SiteConfig): boolean {
  const brandName = (config.brand?.name || '').trim();
  const heroH1 = (config.hero?.h1 || '').trim();
  const heroIntro = (config.hero?.introHtml || '').trim();
  const heroBanner = config.hero?.showBanner !== false && Boolean((config.hero?.bannerImageUrl || '').trim());
  const hasVisibleSection = Array.isArray(config.sections) && config.sections.some((s) => s.visible !== false);
  const hasNews = Array.isArray(config.newsSection?.articles) && config.newsSection.articles.length > 0;
  const hasFaqs = Array.isArray(config.faqsSection?.items) && config.faqsSection.items.length > 0;
  const hasRaw = Boolean((config.content?.rawHtml || '').trim());
  const hasPages = Array.isArray(config.pages) && config.pages.length > 0;
  const hasSpecs = hasPackageSpecsData(config.packageSpecs);

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

/**
 * Pure Isomorphic HTML Renderer for Homepage (`renderHomeContentHtml`)
 */
export function renderHomeContentHtml(config: SiteConfig): string {
  const hero = config.hero || {};
  const specs = config.packageSpecs || {};
  const sections = Array.isArray(config.sections) ? config.sections : [];
  const news = config.newsSection || {};
  const faqs = config.faqsSection || {};
  const ui = config.uiConfig || MASTER_DEFAULT_CONFIG.uiConfig;
  const rawHtml = config.content?.rawHtml || '';

  const introParts: string[] = [];

  // 1. Hero Intro HTML
  if (hero.introHtml) {
    const safeIntro = sanitizeEditorialHtmlForSeo(
      ensureCleanHtmlParagraphs(hero.introHtml),
      config.brand?.name || 'Official Guide'
    );
    if (safeIntro) {
      introParts.push(`<div class="hero-intro-block">${safeIntro}</div>`);
    }
  }

  // 2. Hero 16:9 Showcase Banner (LCP Priority Image: eager + fetchpriority="high")
  if (hero.showBanner !== false && hero.bannerImageUrl) {
    const bannerAlt = hero.bannerAlt || config.brand?.name || 'Banner';
    const captionHtml = hero.bannerCaption
      ? `<figcaption class="media-caption">${escapeHtml(hero.bannerCaption)}</figcaption>`
      : '';
    introParts.push(`
      <figure class="media-figure">
        ${buildResponsiveImgTag(hero.bannerImageUrl, bannerAlt, { priority: 'high', maxWidth: 1200 })}
        ${captionHtml}
      </figure>
    `);
  }

  // 2b. On-Page Quick Jump Table of Contents (Boosts SEO sitelinks & reader scannability)
  const showSpecs = hasPackageSpecsData(specs);
  const tocLinks: Array<{ href: string; label: string }> = [];
  if (showSpecs) {
    tocLinks.push({ href: '#technical-specifications', label: 'Specifications' });
  }
  for (const sec of sections) {
    if (sec.visible !== false && sec.heading) {
      const slug = generateSlug(sec.slug || sec.heading || 'section');
      tocLinks.push({ href: `#${slug}`, label: sec.badgeText || sec.heading });
    }
  }
  if (news.enabled !== false && Array.isArray(news.articles) && news.articles.length > 0) {
    tocLinks.push({ href: '#latest-news', label: `Daily News (${news.articles.length})` });
  }
  if (faqs.enabled !== false && Array.isArray(faqs.items) && faqs.items.length > 0) {
    tocLinks.push({ href: '#frequently-asked-questions', label: 'FAQs' });
  }
  if (ui.showTocJumpBar !== false && tocLinks.length >= 2) {
    introParts.push(`
      <nav class="toc-jump-bar" aria-label="On-page table of contents">
        <span class="toc-jump-label">On this page</span>
        <div class="toc-jump-links">
          ${tocLinks
            .map((t) => `<a href="${escapeHtml(t.href)}" class="toc-jump-chip">${escapeHtml(t.label)}</a>`)
            .join('')}
        </div>
      </nav>
    `);
  }

  // Build ordered blocks according to uiConfig.homepageSectionOrder
  const blockMap: Record<HomepageBlockKey, string> = {
    specs: '',
    sections: '',
    rawHtml: '',
    news: '',
    faqs: ''
  };

  // Block: Technical Package Specifications Table (render only configured rows)
  if (showSpecs) {
    const specRows: string[] = [];
    const appTitle = specs.appName || config.brand?.name || '';
    if (appTitle) {
      specRows.push(`<tr><th>Application Name</th><td><strong>${escapeHtml(appTitle)}</strong></td></tr>`);
    }
    if (specs.version) {
      specRows.push(`<tr><th>Latest Version</th><td><code>${escapeHtml(specs.version)}</code></td></tr>`);
    }
    if (specs.fileSize) {
      specRows.push(`<tr><th>Package Size</th><td>${escapeHtml(specs.fileSize)}</td></tr>`);
    }
    if (specs.operatingSystem) {
      specRows.push(`<tr><th>System Requirements</th><td>${escapeHtml(specs.operatingSystem)}</td></tr>`);
    }
    if (specs.packageFormat) {
      specRows.push(`<tr><th>Package Format</th><td>${escapeHtml(specs.packageFormat)}</td></tr>`);
    }
    if (specs.license) {
      specRows.push(`<tr><th>License &amp; Cost</th><td>${escapeHtml(specs.license)}</td></tr>`);
    }
    if (specs.securityStatus) {
      specRows.push(
        `<tr><th>Security Scan Status</th><td><span class="spec-verified-badge">${escapeHtml(specs.securityStatus.replace(/^✓\s*/, ''))}</span></td></tr>`
      );
    }
    if (specs.lastUpdated) {
      specRows.push(`<tr><th>Last Updated</th><td>${escapeHtml(specs.lastUpdated)}</td></tr>`);
    }
    if (specs.sha256) {
      specRows.push(`<tr><th>SHA-256 Checksum</th><td><div class="hash-cell-wrap"><code>${escapeHtml(specs.sha256)}</code><button type="button" class="copy-hash-btn" data-copy-text="${escapeHtml(specs.sha256)}" aria-label="Copy SHA-256 checksum">Copy</button></div></td></tr>`);
    }
    if (Array.isArray(specs.customRows)) {
      for (const r of specs.customRows) {
        if (r?.label || r?.value) {
          specRows.push(`<tr><th>${escapeHtml(r.label)}</th><td>${escapeHtml(r.value)}</td></tr>`);
        }
      }
    }

    blockMap.specs = `
      <section id="technical-specifications" data-meta-title="${escapeHtml(specs.metaTitle)}" data-meta-description="${escapeHtml(specs.metaDescription)}">
        <h2 id="package-specs-heading">${escapeHtml(specs.heading || 'Technical Package Specifications')}</h2>
        <div class="table-scroll-wrapper">
          <table>
            <tbody>
              ${specRows.join('\n              ')}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  // Block: Content Sections (with optional Badge, Top/Bottom Image, Caption, and Section CTA Button)
  const visibleSections = sections.filter((sec) => sec.visible !== false);
  if (visibleSections.length > 0) {
    blockMap.sections = visibleSections
      .map((sec) => {
        const slug = generateSlug(sec.slug || sec.heading || 'section');
        const badgeHtml = sec.badgeText
          ? `<div class="section-eyebrow-badge">${escapeHtml(sec.badgeText)}</div>`
          : '';
        const effImgPos = sec.imageUrl ? (sec.imagePosition && sec.imagePosition !== 'none' ? sec.imagePosition : 'top') : 'none';
        const hasImg = Boolean(sec.imageUrl && effImgPos !== 'none');
        const imgMarkup = hasImg
          ? `<figure class="media-figure">
              ${buildResponsiveImgTag(sec.imageUrl!, sec.imageAlt || sec.heading, { priority: 'low', maxWidth: 800 })}
              ${sec.imageCaption ? `<figcaption class="media-caption">${escapeHtml(sec.imageCaption)}</figcaption>` : ''}
            </figure>`
          : '';
        const ctaMarkup =
          sec.ctaLabel && sec.ctaUrl
            ? `<div style="margin: 16px 0 8px 0;">
                <a href="${escapeHtml(sec.ctaUrl)}" data-spa-link class="section-inline-cta">${escapeHtml(sec.ctaLabel)}</a>
              </div>`
            : '';

        const enhancedSectionHtml = wrapEditorialTables(
          applySmartInternalLinks(ensureCleanHtmlParagraphs(sec.htmlContent || ''), config, '/')
        );
        return `
          <section id="${slug}" data-meta-title="${escapeHtml(sec.metaTitle)}" data-meta-description="${escapeHtml(sec.metaDescription)}">
            ${badgeHtml}
            <h2 id="${slug}-heading">${escapeHtml(sec.heading || '')}</h2>
            ${effImgPos === 'top' ? imgMarkup : ''}
            ${enhancedSectionHtml}
            ${effImgPos === 'bottom' ? imgMarkup : ''}
            ${ctaMarkup}
          </section>
        `;
      })
      .join('\n');
  }

  // Block: Raw HTML
  if (rawHtml && rawHtml.trim()) {
    blockMap.rawHtml = wrapEditorialTables(applySmartInternalLinks(rawHtml, config, '/'));
  }

  // Block: Dedicated Daily News Section
  if (news.enabled !== false && Array.isArray(news.articles) && news.articles.length > 0) {
    const limit = Math.max(1, Number(ui.homepageNewsLimit) || 5);
    const displayedArticles = news.articles.slice(0, limit);
    const readMoreText = ui.newsReadMoreLabel || 'Read Full News Article →';
    const viewAllText = ui.newsViewAllLabel || 'View All Daily News →';

    const newsItemsHtml = displayedArticles
      .map((art) => {
        const artSlug = generateSlug(art.slug || art.title);
        const articleUrl = `/news/${artSlug}`;
        const coverHtml = art.coverImageUrl
          ? `<a href="${articleUrl}" data-spa-link class="news-card-media-link">
              ${buildResponsiveImgTag(art.coverImageUrl, art.coverImageAlt || art.title, {
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
              <span class="news-category-tag">${escapeHtml(art.category || 'Daily News')}</span>
              ${art.featured ? `<span aria-hidden="true">·</span><span class="news-featured-tag">Featured</span>` : ''}
              ${art.date ? `<span aria-hidden="true">·</span><span>${escapeHtml(art.date)}</span>` : ''}
              ${art.author ? `<span aria-hidden="true">·</span><span>By ${escapeHtml(art.author)}</span>` : ''}
              ${art.readTime ? `<span aria-hidden="true">·</span><span>${escapeHtml(art.readTime)}</span>` : ''}
            </div>
            <h3>
              <a href="${articleUrl}" data-spa-link class="news-title-link">${escapeHtml(art.title || '')}</a>
            </h3>
            <p class="news-summary-text">${escapeHtml(art.summary || '')}</p>
            <a href="${articleUrl}" data-spa-link class="news-read-more">${escapeHtml(readMoreText)}</a>
          </article>
        `;
      })
      .join('\n');

    blockMap.news = `
      <section id="latest-news" class="cv-auto-section" data-meta-title="${escapeHtml(news.metaTitle)}" data-meta-description="${escapeHtml(news.metaDescription)}">
        <div class="section-header-row">
          <h2 id="news">${escapeHtml(news.heading || 'Daily News & Release Updates')}</h2>
          <a href="/news" data-spa-link class="news-read-more">${escapeHtml(viewAllText)} (${news.articles.length})</a>
        </div>
        ${newsItemsHtml}
      </section>
    `;
  }

  // Block: Frequently Asked Questions Section (Pre-rendered cleanly as native <details> accordion when enabled for zero CLS)
  if (faqs.enabled !== false && Array.isArray(faqs.items) && faqs.items.length > 0) {
    const useAccordion = ui.enableFaqAccordion !== false;
    const faqItemsHtml = faqs.items
      .map((f) =>
        useAccordion
          ? `<details class="faq-item"><summary>${escapeHtml(f.question || '')}</summary><div class="faq-answer"><p>${escapeHtml(f.answer || '')}</p></div></details>`
          : `<div class="faq-static-item"><h3>${escapeHtml(f.question || '')}</h3>\n<p>${escapeHtml(f.answer || '')}</p></div>`
      )
      .join('\n');

    blockMap.faqs = `
      <section id="frequently-asked-questions" data-meta-title="${escapeHtml(faqs.metaTitle)}" data-meta-description="${escapeHtml(faqs.metaDescription)}">
        <h2 id="faqs">${escapeHtml(faqs.heading || 'Frequently Asked Questions')}</h2>
        ${faqItemsHtml}
      </section>
    `;
  }

  const order =
    Array.isArray(ui.homepageSectionOrder) && ui.homepageSectionOrder.length > 0
      ? ui.homepageSectionOrder
      : (['specs', 'sections', 'rawHtml', 'news', 'faqs'] as HomepageBlockKey[]);

  const orderedHtml = order.map((key) => blockMap[key] || '').filter(Boolean);
  const combined = [...introParts, ...orderedHtml];
  if (combined.length === 0) {
    if ((config.hero?.h1 || '').trim() || (config.brand?.name || '').trim()) {
      return '';
    }
    return `<section class="site-coming-soon"><h1>Coming Soon</h1><p>This website is currently being prepared.</p></section>`;
  }
  return combined.join('\n\n');
}

/**
 * Render News Hub ('/news') HTML
 */
export function renderNewsHubContentHtml(config: SiteConfig, selectedCategory = 'ALL'): string {
  const articles = Array.isArray(config.newsSection?.articles) ? config.newsSection.articles : [];
  const ui = config.uiConfig || MASTER_DEFAULT_CONFIG.uiConfig;
  const categories = ['ALL', ...Array.from(new Set(articles.map((a) => a.category || 'Daily Update')))];

  const filtered =
    selectedCategory === 'ALL'
      ? articles
      : articles.filter((a) => (a.category || 'Daily Update') === selectedCategory);

  const filterButtonsHtml = categories
    .map(
      (cat) => `
      <button type="button" class="news-filter-btn ${selectedCategory === cat ? 'active' : ''}" data-news-cat="${escapeHtml(cat)}">
        ${cat === 'ALL' ? `All News (${articles.length})` : escapeHtml(cat)}
      </button>
    `
    )
    .join('');

  const listHtml =
    filtered.length > 0
      ? filtered
          .map((art) => {
            const artSlug = generateSlug(art.slug || art.title);
            const articleUrl = `/news/${artSlug}`;
            const coverHtml = art.coverImageUrl
              ? `<a href="${articleUrl}" data-spa-link class="news-card-media-link">
                  ${buildResponsiveImgTag(art.coverImageUrl, art.coverImageAlt || art.title, {
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
                  <span class="news-category-tag">${escapeHtml(art.category || 'Daily News')}</span>
                  ${art.featured ? `<span aria-hidden="true">·</span><span class="news-featured-tag">Featured</span>` : ''}
                  ${art.date ? `<span aria-hidden="true">·</span><span>${escapeHtml(art.date)}</span>` : ''}
                  ${art.author ? `<span aria-hidden="true">·</span><span>By ${escapeHtml(art.author)}</span>` : ''}
                  ${art.readTime ? `<span aria-hidden="true">·</span><span>${escapeHtml(art.readTime)}</span>` : ''}
                </div>
                <h3>
                  <a href="${articleUrl}" data-spa-link class="news-title-link">${escapeHtml(art.title || '')}</a>
                </h3>
                <p class="news-summary-text">${escapeHtml(art.summary || '')}</p>
                <a href="${articleUrl}" data-spa-link class="news-read-more">${escapeHtml(ui.newsReadMoreLabel || 'Read Full Article →')}</a>
              </article>
            `;
          })
          .join('\n')
      : `<p>No news articles found in this category.</p>`;

  return `
    <p class="news-summary-text">
      ${escapeHtml(config.newsSection?.metaDescription || `Official daily news updates, software changelogs, and announcements from ${config.brand?.name || 'our team'}.`)}
    </p>
    <div class="news-filter-bar">${filterButtonsHtml}</div>
    <div id="news-hub-articles-container">${listHtml}</div>
  `;
}

/**
 * Render Single News Article ('/news/:slug') HTML
 */
export function renderNewsArticleContentHtml(article: NewsArticleItem, config: SiteConfig): string {
  const otherArticles = (config.newsSection?.articles || []).filter(
    (a) => generateSlug(a.slug || a.title) !== generateSlug(article.slug || article.title)
  );

  const coverHtml = article.coverImageUrl
    ? `<figure class="media-figure">
        ${buildResponsiveImgTag(article.coverImageUrl, article.coverImageAlt || article.title, {
          priority: 'high',
          maxWidth: 1200
        })}
        ${article.coverImageCaption ? `<figcaption class="media-caption">${escapeHtml(article.coverImageCaption)}</figcaption>` : ''}
      </figure>`
    : '';

  const articleCtaHtml =
    article.ctaLabel && article.ctaUrl
      ? `<div style="margin: 24px 0;">
          <a href="${escapeHtml(article.ctaUrl)}" data-spa-link class="section-inline-cta">${escapeHtml(article.ctaLabel)}</a>
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
            const s = generateSlug(art.slug || art.title);
            return `
              <div class="news-item-block">
                <div class="news-meta-line">
                  <span class="news-category-tag">${escapeHtml(art.category || 'News')}</span>
                  <span>${escapeHtml(art.date || '')}</span>
                </div>
                <a href="/news/${s}" data-spa-link class="news-title-link" style="font-size:16.5px;">${escapeHtml(art.title)}</a>
              </div>
            `;
          })
          .join('')}
      `
      : '';

  const visibleSections = (config.sections || []).filter((s) => s.visible !== false && s.heading).slice(0, 4);
  const internalResourcesHtml =
    config.domainConfig?.enableAutoInternalLinks !== false && visibleSections.length > 0
      ? `
        <div class="internal-crawl-hub cms-callout-box" style="margin-top:28px;">
          <div style="font-size:11.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-muted); margin-bottom:10px;">Official Portal Guides &amp; Resources</div>
          <div style="display:flex; flex-wrap:wrap; gap:8px 16px;">
            <a href="/" data-spa-link class="toc-jump-chip">${escapeHtml(config.brand?.name || 'Home')} Overview</a>
            ${visibleSections
              .map(
                (sec) =>
                  `<a href="/#${escapeHtml(generateSlug(sec.slug || sec.heading))}" data-spa-link class="toc-jump-chip">${escapeHtml(sec.heading)}</a>`
              )
              .join('')}
          </div>
        </div>
      `
      : '';

  const enhancedArticleBody = wrapEditorialTables(
    applySmartInternalLinks(
      ensureCleanHtmlParagraphs(article.htmlContent || `<p>${escapeHtml(article.summary || '')}</p>`),
      config,
      `/news/${generateSlug(article.slug || article.title)}`
    )
  );

  return `
    <div class="news-meta-line" style="margin-bottom:18px; padding-bottom:14px; border-bottom:1px solid var(--border-color);">
      <span class="news-category-tag">${escapeHtml(article.category || 'Daily Update')}</span>
      <span aria-hidden="true">·</span>
      <span>Published: <strong>${escapeHtml(article.date || 'November 2026')}</strong></span>
      ${article.author ? `<span aria-hidden="true">·</span><span>By <strong>${escapeHtml(article.author)}</strong></span>` : ''}
      ${article.readTime ? `<span aria-hidden="true">·</span><span>${escapeHtml(article.readTime)}</span>` : ''}
    </div>
    ${coverHtml}
    ${enhancedArticleBody}
    ${articleCtaHtml}
    ${internalResourcesHtml}
    ${relatedHtml}
  `;
}

/**
 * Render Standalone Legal / Info Page ('/:pageSlug') HTML
 */
export function renderStandalonePageContentHtml(page: StandalonePageItem, config?: SiteConfig): string {
  const bannerHtml = page.bannerImageUrl
    ? `<figure class="media-figure">
        ${buildResponsiveImgTag(page.bannerImageUrl, page.bannerImageAlt || page.h1, {
          priority: 'high',
          maxWidth: 1200
        })}
      </figure>`
    : '';

  const subtitleText = page.subtitle || 'Official Document';
  const rawPageHtml = ensureCleanHtmlParagraphs(page.htmlContent || '');
  const enhancedHtml = wrapEditorialTables(
    config
      ? applySmartInternalLinks(rawPageHtml, config, `/${generateSlug(page.slug || page.label)}`)
      : sanitizeEditorialHtmlForSeo(rawPageHtml, page.h1 || page.label || 'Official Document')
  );

  return `
    <p class="news-meta-line" style="margin-bottom:20px; padding-bottom:14px; border-bottom:1px solid var(--border-color);">
      ${escapeHtml(subtitleText)} · Last Updated: <strong>${escapeHtml(page.lastUpdated || 'November 2026')}</strong>
    </p>
    ${bannerHtml}
    ${enhancedHtml}
  `;
}

/**
 * Build Partial Route Payload for Static & Dynamic Per-URL Loading
 * Only sends the shell + the active URL's required content, keeping payloads tiny and fast!
 */
export interface PartialRoutePayload {
  path: string;
  canonicalPath: string;
  viewType: 'home' | 'news-hub' | 'news-article' | 'standalone-page';
  isConfigured: boolean;
  metaTitle: string;
  metaDescription: string;
  ogImage: string;
  heroH1: string;
  showHeroSection: boolean;
  showHeroCtaGrid: boolean;
  renderedMainHtml: string;
  jsonLd: Record<string, any>;
  shell: {
    brand: SiteConfig['brand'];
    uiConfig: UiCustomizationConfig;
    heroCtas: {
      secondaryCta: SiteConfig['hero']['secondaryCta'];
      primaryCta: SiteConfig['hero']['primaryCta'];
      floatingCta: SiteConfig['hero']['floatingCta'];
    };
    packageVersion: string;
    headerLinks: HeaderNavLink[];
    autoSectionLinks: Array<{ label: string; url: string; metaTitle: string }>;
    recentNewsDrawerItems: Array<{ title: string; slug: string; category: string; date: string }>;
    headerPages: Array<{ label: string; slug: string; metaTitle: string }>;
    footerPages: Array<{ label: string; slug: string; metaTitle: string }>;
    allSubpagePills: Array<{ label: string; href: string }>;
    newsCount: number;
    navigation: {
      footerSummary?: string;
      showFooterBrandSummary?: boolean;
      showFooterContactEmail?: boolean;
      footerQuickLinks?: Array<{ id: string; label: string; url: string; openInNewTab?: boolean }>;
      disclaimerHeading: string;
      disclaimer: string;
      siteLinksHeading: string;
      copyright: string;
    };
  };
  updatedAt: number;
}

/**
 * Render the complete, categorized Hamburger Menu Drawer (`#drawer-links-list`) HTML
 * so the 3-bar menu contains Main Navigation, Auto-Synced Homepage Sections, Latest News,
 * Official Legal/Support Pages, and the Primary Download Action CTA.
 */
export function renderHamburgerDrawerHtml(
  shell: PartialRoutePayload['shell'],
  activeCanonicalPath = '/'
): string {
  const ui = shell.uiConfig || MASTER_DEFAULT_CONFIG.uiConfig;
  const items: string[] = [];

  // 1. Group Label: Main Page & Section Navigation
  items.push(`<li class="drawer-section-header">Page &amp; Section Navigation</li>`);

  // Always include Home link at the top of the drawer
  items.push(`
    <li>
      <a href="/" data-spa-link class="nav-drawer-link ${activeCanonicalPath === '/' ? 'active-nav-link' : ''}">
        <span>Home Overview</span>
        <span class="drawer-link-badge">Main</span>
      </a>
    </li>
  `);

  const seenUrls = new Set<string>(['/']);

  for (const link of shell.headerLinks || []) {
    if (!link.label || !link.url) continue;
    const rawUrl = sanitizeSafeUrl(link.url.trim(), { allowHash: true, allowMailto: true });
    if (!rawUrl) continue;
    const href = rawUrl.startsWith('#') ? `/${rawUrl}` : rawUrl;
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

  // Auto-include any visible Homepage Content Sections not already listed in headerLinks
  if (ui.autoIncludeSectionsInDrawer !== false && Array.isArray(shell.autoSectionLinks)) {
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

  // 2. Group Label: Daily News & Release Updates
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

  // 3. Group Label: Official Legal & Support Pages
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

  // 4. Bottom Action CTA inside Drawer
  if (ui.showCtaInDrawer !== false && shell.heroCtas?.primaryCta?.label) {
    const rawPrimaryUrl =
      sanitizeSafeUrl(shell.heroCtas.primaryCta.url || '#technical-specifications', {
        allowHash: true,
        allowMailto: true
      }) || '#technical-specifications';
    const primaryHref = rawPrimaryUrl.startsWith('#') ? `/${rawPrimaryUrl}` : rawPrimaryUrl;
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

export function buildPartialRoutePayload(
  pathname: string,
  config: SiteConfig,
  newsCategory = 'ALL'
): PartialRoutePayload {
  const route = resolveRouteView(pathname, config);
  const ui = config.uiConfig || MASTER_DEFAULT_CONFIG.uiConfig;
  const configured = isSiteConfigured(config);

  let heroH1 = config.hero?.h1 || config.brand?.name || '';
  const hasSecondaryCta = Boolean(config.hero?.secondaryCta?.label && config.hero?.secondaryCta?.url);
  const hasPrimaryCta = Boolean(config.hero?.primaryCta?.label && config.hero?.primaryCta?.url);
  let showHeroSection = ui.showHeroSection !== false;
  let showHeroCtaGrid = route.viewType === 'home' && ui.showHeroCtaButtons !== false && (hasSecondaryCta || hasPrimaryCta);
  let renderedMainHtml = '';

  if (route.viewType === 'news-hub') {
    heroH1 = config.newsSection?.heading || 'Daily News & Updates';
    showHeroSection = true;
    showHeroCtaGrid = false;
    renderedMainHtml = renderNewsHubContentHtml(config, newsCategory);
  } else if (route.viewType === 'news-article' && route.article) {
    heroH1 = route.article.title;
    showHeroSection = true;
    showHeroCtaGrid = false;
    renderedMainHtml = renderNewsArticleContentHtml(route.article, config);
  } else if (route.viewType === 'standalone-page' && route.page) {
    heroH1 = route.page.h1 || route.page.label;
    showHeroSection = true;
    showHeroCtaGrid = false;
    renderedMainHtml = renderStandalonePageContentHtml(route.page, config);
  } else {
    heroH1 = config.hero?.h1 || config.brand?.name || '';
    showHeroCtaGrid = ui.showHeroCtaButtons !== false && (hasSecondaryCta || hasPrimaryCta);
    showHeroSection = ui.showHeroSection !== false && Boolean(heroH1 || showHeroCtaGrid);
    renderedMainHtml = renderHomeContentHtml(config);
  }

  const pages = Array.isArray(config.pages) ? config.pages : [];
  const footerPages = pages
    .filter((pg) => pg.showInFooter !== false)
    .map((pg) => ({
      label: pg.label || pg.h1,
      slug: generateSlug(pg.slug || pg.label),
      metaTitle: pg.metaTitle || pg.h1
    }));

  const headerPages = pages
    .filter((pg) => Boolean(pg.showInHeader))
    .map((pg) => ({
      label: pg.label || pg.h1,
      slug: generateSlug(pg.slug || pg.label),
      metaTitle: pg.metaTitle || pg.h1
    }));

  const autoSectionLinks = (config.sections || [])
    .filter((sec) => sec.visible !== false && sec.heading)
    .map((sec) => ({
      label: sec.heading,
      url: `#${generateSlug(sec.slug || sec.heading)}`,
      metaTitle: sec.metaTitle || sec.heading
    }));

  const recentNewsDrawerItems = (config.newsSection?.articles || []).slice(0, 3).map((art) => ({
    title: art.title,
    slug: generateSlug(art.slug || art.title),
    category: art.category || 'Daily Update',
    date: art.date || ''
  }));

  const newsCount = (config.newsSection?.articles || []).length;
  const allSubpagePills = [
    ...(config.newsSection?.enabled !== false && (newsCount > 0 || configured)
      ? [{ label: ui.headerNewsButtonLabel || 'News', href: '/news' }]
      : []),
    ...footerPages.map((pg) => ({
      label: pg.label,
      href: `/${pg.slug}`
    }))
  ];

  const secondaryCtaUrl = sanitizeSafeUrl(config.hero?.secondaryCta?.url || '', {
    allowHash: true,
    allowMailto: true
  });
  const primaryCtaUrl = config.hero?.primaryCta?.url
    ? config.securityGate?.enabled !== false
      ? '/moreinfo'
      : sanitizeSafeUrl(config.hero.primaryCta.url, { allowHash: true, allowMailto: true })
    : '';
  const floatingCtaUrl = config.hero?.floatingCta?.url
    ? config.securityGate?.enabled !== false
      ? '/moreinfo'
      : sanitizeSafeUrl(config.hero.floatingCta.url, { allowHash: true, allowMailto: true })
    : '';

  return {
    path: pathname,
    canonicalPath: route.canonicalPath,
    viewType: route.viewType,
    isConfigured: configured,
    metaTitle: route.metaTitle,
    metaDescription: route.metaDescription,
    ogImage: optimizeCloudinaryUrl(
      route.ogImage || config.seo?.ogImageUrl || config.hero?.bannerImageUrl || ''
    ),
    heroH1,
    showHeroSection,
    showHeroCtaGrid,
    renderedMainHtml,
    jsonLd: buildJsonLdSchema(config, pathname),
    shell: {
      brand: config.brand,
      uiConfig: ui,
      heroCtas: {
        secondaryCta: {
          ...config.hero.secondaryCta,
          url: secondaryCtaUrl
        },
        primaryCta: {
          ...config.hero.primaryCta,
          url: primaryCtaUrl
        },
        floatingCta: {
          ...config.hero.floatingCta,
          url: floatingCtaUrl
        }
      },
      packageVersion: config.packageSpecs?.version || '',
      headerLinks: config.navigation.headerLinks || [],
      autoSectionLinks,
      recentNewsDrawerItems,
      headerPages,
      footerPages,
      allSubpagePills,
      newsCount,
      navigation: {
        footerSummary: config.navigation.footerSummary || '',
        showFooterBrandSummary: config.navigation.showFooterBrandSummary !== false,
        showFooterContactEmail: config.navigation.showFooterContactEmail !== false,
        footerQuickLinks: config.navigation.footerQuickLinks || [],
        disclaimerHeading: config.navigation.disclaimerHeading,
        disclaimer: config.navigation.disclaimer,
        siteLinksHeading: config.navigation.siteLinksHeading,
        copyright: config.navigation.copyright
      }
    },
    updatedAt: config.updatedAt
  };
}

/**
 * Compile a complete, 100% static HTML document for a specific route path (`pathname`)
 * using the `index.html` shell template.
 * Embeds pre-rendered `<main id="dynamic-content">`, Hamburger Drawer, LCP Preload Hints,
 * Web App Manifest, Apple Touch Icon, SEO meta tags, Schema.org JSON-LD,
 * and `window.__INITIAL_ROUTE_PAYLOAD__` (with ZERO Firebase imports).
 */
export function renderCompleteStaticPageHtml(
  indexHtmlTemplate: string,
  config: SiteConfig,
  pathname: string
): string {
  const payload = buildPartialRoutePayload(pathname, config);
  const baseCanonical = normalizeDomainUrl(
    config.domainConfig?.primaryDomain || config.seo?.canonicalUrl,
    config.domainConfig?.forceHttps !== false
  ).replace(/\/$/, '');
  const fullCanonical =
    payload.canonicalPath === '/'
      ? baseCanonical
      : `${baseCanonical}${payload.canonicalPath}`;
  const title = escapeHtml(payload.metaTitle);
  const desc = escapeHtml(payload.metaDescription);
  const jsonLd = JSON.stringify(payload.jsonLd).replace(/</g, '\\u003c');
  const ui = payload.shell.uiConfig || MASTER_DEFAULT_CONFIG.uiConfig;

  let html = indexHtmlTemplate;

  // 0. Strip any previously injected dynamic head/bootstrap blocks so recompiling is 100% idempotent
  html = html
    .replace(/<meta\s+name="(?:robots|theme-color|application-name|apple-mobile-web-app-title|google-site-verification|msvalidate\.01)"[^>]*>\s*/gi, '')
    .replace(/<meta\s+property="og:(?:site_name|locale|image:width|image:height)"[^>]*>\s*/gi, '')
    .replace(/<link\s+rel="(?:apple-touch-icon|manifest|sitemap|alternate)"[^>]*>\s*/gi, '')
    .replace(/<link\s+rel="preload"\s+as="image"[^>]*>\s*/gi, '')
    .replace(/<script\s+async\s+src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=[^"]*"[^>]*><\/script>\s*<script>window\.dataLayer[\s\S]*?<\/script>\s*/gi, '')
    .replace(/<script>\s*window\.__INITIAL_ROUTE_PAYLOAD__\s*=[\s\S]*?<\/script>\s*/gi, '');

  // 1. Inject inline CSS variables onto <html> tag for 0ms visual stability (FCP/CLS = 0)
  const inlineRootVars = [
    `--accent-color:${config.brand?.accentColor || '#EF4444'}`,
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
    `--font-stack:${resolveFontStackCss(ui.fontFamily).replace(/"/g, "'")}`
  ].join(';');

  html = html.replace(/<html\s+lang="en"(?:\s+style="[^"]*")?>/i, `<html lang="en" style="${escapeHtml(inlineRootVars)}">`);

  // 2. Replace <head> SEO tags
  const faviconHref = escapeHtml(
    optimizeCloudinaryUrl(config.brand?.faviconUrl || config.brand?.logoUrl || '')
  );
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  html = html.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${desc}" />`
  );
  html = html.replace(
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="canonical" href="${escapeHtml(fullCanonical)}" />`
  );
  html = html.replace(
    /<link\s+rel="icon"\s+href="[^"]*"\s*\/?>/i,
    faviconHref ? `<link rel="icon" href="${faviconHref}" />` : `<link rel="icon" href="" />`
  );
  html = html.replace(
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:title" content="${title}" />`
  );
  html = html.replace(
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:description" content="${desc}" />`
  );
  html = html.replace(
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:url" content="${escapeHtml(fullCanonical)}" />`
  );
  html = html.replace(
    /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:image" content="${escapeHtml(payload.ogImage)}" />`
  );
  html = html.replace(
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:title" content="${title}" />`
  );
  html = html.replace(
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:description" content="${desc}" />`
  );
  html = html.replace(
    /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:image" content="${escapeHtml(payload.ogImage)}" />`
  );

  // 3. Pre-render Header Brand, Hamburger Drawer, Hero H1, Main Content, and Footer directly into HTML
  const logoSrc = escapeHtml(optimizeCloudinaryUrl(config.brand?.logoUrl || ''));
  const rawBrandName = (config.brand?.name || '').trim();
  const brandName = escapeHtml(rawBrandName);
  const logoAlt = escapeHtml(rawBrandName ? `${rawBrandName} Logo` : '');
  html = html.replace(
    /<img\b[^>]*id="navbar-logo-img"[^>]*>/i,
    `<img id="navbar-logo-img" class="brand-logo-img${logoSrc ? '' : ' hidden'}" src="${logoSrc}" alt="${logoAlt}" width="30" height="30" loading="eager" referrerpolicy="no-referrer" />`
  );
  html = html.replace(
    /<span id="navbar-logo-text" class="brand-logo-text">[\s\S]*?<\/span>/i,
    `<span id="navbar-logo-text" class="brand-logo-text">${brandName}</span>`
  );

  // Pre-render Header Sticky Mode, Unconfigured Isolation & News Button state
  const stickyPosStyle = ui.stickyHeader === false ? ' style="position:relative;"' : '';
  const hideEmptyHeader = !payload.isConfigured && (config.navigation?.headerLinks || []).length === 0;
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
    }" data-spa-link><span>${escapeHtml(newsBtnLabel)}</span></a>`
  );

  // Pre-render Rich Hamburger Navigation Drawer (`#drawer-links-list`)
  const drawerHtml = renderHamburgerDrawerHtml(payload.shell, payload.canonicalPath);
  html = html.replace(
    /<ul class="nav-drawer-list" id="drawer-links-list">[\s\S]*?<\/ul>/i,
    `<ul class="nav-drawer-list" id="drawer-links-list">${drawerHtml}</ul>`
  );

  // Pre-render Standalone Page Breadcrumb & Subpage Switcher Bar (`#standalone-back-bar`)
  const showBackBar = payload.viewType !== 'home' && ui.showBreadcrumbs !== false;
  const backHomeLabel = escapeHtml(ui.backToHomeLabel || '← Back to Home');
  const allNewsLabel = escapeHtml(ui.allNewsBreadcrumbLabel || 'All News →');
  const showNewsBack = payload.viewType === 'news-article';
  const subpagePillsHtml =
    ui.showSubpageSwitcherPills !== false && Array.isArray(payload.shell.allSubpagePills)
      ? payload.shell.allSubpagePills
          .map((pill) => {
            const isActivePill =
              payload.canonicalPath === pill.href ||
              (pill.href === '/news' && payload.viewType === 'news-article');
            return `<a href="${escapeHtml(pill.href)}" data-spa-link class="subpage-pill${
              isActivePill ? ' active' : ''
            }">${escapeHtml(pill.label)}</a>`;
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

  // Pre-render Hero Section visibility, H1 & CTA Grid
  html = html.replace(
    /<section id="hero-section" class="hero-container(?:\s+hidden)?">/i,
    `<section id="hero-section" class="hero-container${payload.showHeroSection ? '' : ' hidden'}">`
  );
  html = html.replace(
    /<h1 id="hero-heading" class="hero-title">[\s\S]*?<\/h1>/i,
    `<h1 id="hero-heading" class="hero-title">${escapeHtml(payload.heroH1)}</h1>`
  );
  html = html.replace(
    /<div id="hero-cta-grid" class="hero-action-grid(?:\s+hidden)?">/i,
    `<div id="hero-cta-grid" class="hero-action-grid${payload.showHeroCtaGrid ? '' : ' hidden'}">`
  );
  const secCta = payload.shell.heroCtas?.secondaryCta;
  const priCta = payload.shell.heroCtas?.primaryCta;
  const isHomeRoute = payload.viewType === 'home';
  const hasSecCta = isHomeRoute && Boolean(secCta?.label && secCta?.url);
  const hasPriCta = isHomeRoute && Boolean(priCta?.label && priCta?.url);

  html = html.replace(
    /<a id="hero-cta-secondary"[^>]*>[\s\S]*?<\/a>/i,
    `<a id="hero-cta-secondary" class="btn-secondary${hasSecCta ? '' : ' hidden'}" href="${escapeHtml(hasSecCta ? secCta?.url || '#' : '#')}"${
      hasSecCta && secCta?.relSponsored ? ' rel="sponsored noopener"' : ''
    }${hasSecCta ? ' data-spa-link' : ''}>${escapeHtml(hasSecCta ? secCta?.label || '' : '')}</a>`
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
    `<a id="hero-cta-primary" class="btn-primary${hasPriCta ? '' : ' hidden'}" href="${escapeHtml(primaryHref)}"${primaryRel}${
      hasPriCta ? ' data-spa-link' : ''
    }>${escapeHtml(hasPriCta ? priCta?.label || '' : '')}</a>`
  );

  // Pre-render <main id="dynamic-content"> with exact route HTML so initial load has zero height jump
  html = html.replace(
    /<main\b[^>]*\bid="dynamic-content"[^>]*>[\s\S]*?<\/main>/i,
    `<main id="dynamic-content" class="content-container prose-container" tabindex="-1" data-ssr-path="${escapeHtml(payload.canonicalPath)}">${payload.renderedMainHtml}</main>`
  );

  // Pre-render Footer links (Quick Links + Legal Pages) & text
  const quickLinksHtml = (config.navigation?.footerQuickLinks || [])
    .map((ql) => {
      const safeQlUrl = sanitizeSafeUrl(ql.url || '', { allowHash: true, allowMailto: true });
      if (!safeQlUrl) return '';
      const targetAttr = ql.openInNewTab ? ' target="_blank" rel="noopener noreferrer"' : ' data-spa-link';
      return `<a href="${escapeHtml(safeQlUrl)}"${targetAttr} class="footer-link">${escapeHtml(ql.label)}</a>`;
    })
    .filter(Boolean)
    .join('');

  const legalLinksHtml = payload.shell.footerPages
    .map(
      (pg) =>
        `<a href="/${escapeHtml(pg.slug)}" data-spa-link class="footer-link" title="${escapeHtml(pg.metaTitle)}">${escapeHtml(pg.label)}</a>`
    )
    .join('');

  const footerLinksHtml = [quickLinksHtml, legalLinksHtml].filter(Boolean).join('');
  const footerSummaryText = config.navigation?.footerSummary || config.brand?.tagline || '';
  const contactEmailText = (config.brand?.contactEmail || '').trim();
  const hasBrandSummaryContent = Boolean(rawBrandName || footerSummaryText || contactEmailText);

  html = html.replace(
    /<div id="footer-brand-summary-block" class="footer-brand-summary-box(?:\s+hidden)?">/i,
    `<div id="footer-brand-summary-block" class="footer-brand-summary-box${
      config.navigation?.showFooterBrandSummary === false || !hasBrandSummaryContent ? ' hidden' : ''
    }">`
  );
  html = html.replace(
    /<div id="footer-brand-title" class="footer-brand-title">[\s\S]*?<\/div>/i,
    `<div id="footer-brand-title" class="footer-brand-title">${brandName}</div>`
  );
  html = html.replace(
    /<p id="footer-summary-text" class="footer-summary-text">[\s\S]*?<\/p>/i,
    `<p id="footer-summary-text" class="footer-summary-text">${escapeHtml(footerSummaryText)}</p>`
  );
  const showContactEmail = config.navigation?.showFooterContactEmail !== false && Boolean(contactEmailText);
  html = html.replace(
    /<a id="footer-contact-email-link" class="footer-contact-pill(?:\s+hidden)?"[^>]*>[\s\S]*?<\/a>/i,
    showContactEmail
      ? `<a id="footer-contact-email-link" class="footer-contact-pill" href="mailto:${escapeHtml(contactEmailText)}">${escapeHtml(contactEmailText)}</a>`
      : `<a id="footer-contact-email-link" class="footer-contact-pill hidden" href="#"></a>`
  );

  const disclaimerText = (config.navigation?.disclaimer || '').trim();
  const showDisclaimerBlock = ui.showFooterDisclaimer !== false && Boolean(disclaimerText);
  html = html.replace(
    /<div id="footer-disclaimer-block"(?:\s+class="hidden")?>/i,
    `<div id="footer-disclaimer-block"${showDisclaimerBlock ? '' : ' class="hidden"'}>`
  );
  html = html.replace(
    /<div id="footer-disclaimer-heading" class="footer-heading">[\s\S]*?<\/div>/i,
    `<div id="footer-disclaimer-heading" class="footer-heading">${escapeHtml(config.navigation?.disclaimerHeading || '')}</div>`
  );
  html = html.replace(
    /<p id="footer-disclaimer" class="footer-disclaimer-text">[\s\S]*?<\/p>/i,
    `<p id="footer-disclaimer" class="footer-disclaimer-text">${escapeHtml(disclaimerText)}</p>`
  );
  const showLinksHeading = ui.showFooterLinksHeading !== false && Boolean(footerLinksHtml && config.navigation?.siteLinksHeading);
  html = html.replace(
    /<div id="footer-links-heading" class="footer-heading(?:\s+hidden)?">[\s\S]*?<\/div>/i,
    `<div id="footer-links-heading" class="footer-heading${showLinksHeading ? '' : ' hidden'}">${escapeHtml(config.navigation?.siteLinksHeading || '')}</div>`
  );
  html = html.replace(
    /<div id="footer-links-list" class="footer-links-stack">[\s\S]*?<\/div>/i,
    `<div id="footer-links-list" class="footer-links-stack">${footerLinksHtml}</div>`
  );
  const copyrightText = (config.navigation?.copyright || '').trim();
  const hasFooterContent = Boolean(
    (config.navigation?.showFooterBrandSummary !== false && hasBrandSummaryContent) ||
      showDisclaimerBlock ||
      footerLinksHtml ||
      copyrightText
  );
  html = html.replace(
    /<footer(?:\s+id="site-footer")?\s+class="site-footer(?:\s+hidden)?">/i,
    `<footer id="site-footer" class="site-footer${hasFooterContent ? '' : ' hidden'}">`
  );
  html = html.replace(
    /<hr id="footer-divider" class="footer-divider(?:\s+hidden)?"\s*\/?>/i,
    `<hr id="footer-divider" class="footer-divider${hasFooterContent ? '' : ' hidden'}" />`
  );
  html = html.replace(
    /<p id="footer-copyright" class="footer-copyright-text">[\s\S]*?<\/p>/i,
    `<p id="footer-copyright" class="footer-copyright-text">${escapeHtml(copyrightText)}</p>`
  );

  // Pre-render Floating Bottom Pill CTA (`#floating-bottom-cta` + `#floating-cta-btn`)
  const fl = payload.shell.heroCtas?.floatingCta;
  const showFloating = Boolean(fl?.enabled && fl?.label && fl?.url && payload.viewType === 'home');
  const flHref = fl?.url || '#';
  const flRel = flHref === '/moreinfo' || flHref === '/download' ? ' rel="nofollow noopener"' : '';
  const flLabel = escapeHtml(fl?.label || '');
  html = html.replace(
    /<div id="floating-bottom-cta" class="floating-cta-wrapper[^"]*">[\s\S]*?<\/div>/i,
    `<div id="floating-bottom-cta" class="floating-cta-wrapper${showFloating ? '' : ' hidden'}">\n      <a id="floating-cta-btn" class="floating-cta-button" href="${escapeHtml(flHref)}"${flRel}>${flLabel}</a>\n    </div>`
  );

  // 4. Inject LCP Preload Hints, Web App Manifest, Apple Touch Icon, Sitemap Link, Webmaster Verification, RSS, JSON-LD, and Static Initial Route Payload (ZERO Firebase!)
  const extraHeadTags: string[] = [];
  const themeColor = escapeHtml(config.brand?.themeColor || config.brand?.accentColor || '#EF4444');
  const appleIconHref = escapeHtml(
    optimizeCloudinaryUrl(config.brand?.appleTouchIconUrl || config.brand?.searchLogoUrl || config.brand?.logoUrl || '')
  );

  extraHeadTags.push(`<meta name="robots" content="${payload.isConfigured ? 'index, follow' : 'noindex, nofollow'}" />`);
  extraHeadTags.push(`<meta name="theme-color" content="${themeColor}" />`);
  if (brandName) {
    extraHeadTags.push(`<meta name="application-name" content="${brandName}" />`);
    extraHeadTags.push(`<meta property="og:site_name" content="${brandName}" />`);
  }
  extraHeadTags.push(`<meta property="og:locale" content="en_US" />`);
  extraHeadTags.push(`<meta property="og:image:width" content="1200" />`);
  extraHeadTags.push(`<meta property="og:image:height" content="630" />`);
  if (config.brand?.shortName || rawBrandName) {
    extraHeadTags.push(`<meta name="apple-mobile-web-app-title" content="${escapeHtml(config.brand?.shortName || rawBrandName)}" />`);
  }
  if (appleIconHref) {
    extraHeadTags.push(`<link rel="apple-touch-icon" sizes="180x180" href="${appleIconHref}" />`);
  }

  if (config.domainConfig?.enableWebManifest !== false) {
    extraHeadTags.push(`<link rel="manifest" href="/manifest.webmanifest" />`);
  }
  if (config.domainConfig?.enableSitemapXml !== false) {
    extraHeadTags.push(`<link rel="sitemap" type="application/xml" title="Sitemap" href="/sitemap.xml" />`);
  }

  // Preload Above-the-Fold LCP Hero Image for instant Largest Contentful Paint
  if (payload.viewType === 'home' && config.hero?.showBanner !== false && config.hero?.bannerImageUrl) {
    const lcpBannerUrl = escapeHtml(optimizeCloudinaryUrl(config.hero.bannerImageUrl));
    extraHeadTags.push(`<link rel="preload" as="image" href="${lcpBannerUrl}" fetchpriority="high" />`);
  } else if (payload.viewType === 'news-article' && payload.ogImage) {
    extraHeadTags.push(`<link rel="preload" as="image" href="${escapeHtml(payload.ogImage)}" fetchpriority="high" />`);
  }

  if (config.domainConfig?.googleSiteVerification) {
    extraHeadTags.push(
      `<meta name="google-site-verification" content="${escapeHtml(config.domainConfig.googleSiteVerification)}" />`
    );
  }
  if (config.domainConfig?.bingSiteVerification) {
    extraHeadTags.push(
      `<meta name="msvalidate.01" content="${escapeHtml(config.domainConfig.bingSiteVerification)}" />`
    );
  }
  if (config.domainConfig?.enableRssFeed !== false && brandName) {
    extraHeadTags.push(
      `<link rel="alternate" type="application/rss+xml" title="${brandName} News RSS" href="/feed.xml" />`
    );
  }

  const gaRaw = (config.domainConfig?.googleAnalyticsId || '').trim();
  if (/^(G|GT|AW|DC)-[A-Z0-9]{4,24}$/i.test(gaRaw) || /^UA-\d{4,12}-\d{1,4}$/i.test(gaRaw)) {
    const safeGa = escapeHtml(gaRaw);
    extraHeadTags.push(
      `<script async src="https://www.googletagmanager.com/gtag/js?id=${safeGa}"></script>\n  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${safeGa}');</script>`
    );
  }

  const hasExistingJsonLd = /<script\s+id="dynamic-jsonld-schema"[^>]*>[\s\S]*?<\/script>/i.test(html);
  if (hasExistingJsonLd) {
    html = html.replace(
      /<script\s+id="dynamic-jsonld-schema"[^>]*>[\s\S]*?<\/script>/i,
      `<script id="dynamic-jsonld-schema" type="application/ld+json">${jsonLd}</script>`
    );
  }

  // Compact non-blocking bootstrap metadata (never duplicates <main> HTML or <head> JSON-LD)
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

  const headInject = `
  ${extraHeadTags.join('\n  ')}
  ${hasExistingJsonLd ? '' : `<script id="dynamic-jsonld-schema" type="application/ld+json">${jsonLd}</script>`}
</head>`;
  html = html.replace('</head>', headInject);

  const bootstrapScriptTag = `<script>window.__INITIAL_ROUTE_PAYLOAD__=${JSON.stringify(lightweightBootstrap).replace(/<\//g, '<\\/')};</script>`;
  if (/<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, `  ${bootstrapScriptTag}\n</body>`);
  } else {
    html = html.replace('</head>', `${bootstrapScriptTag}\n</head>`);
  }
  return html;
}

/**
 * Render the isolated Protected Security & Download Gateway HTML (`/moreinfo` & `/download`)
 * with public brand/package metadata while NEVER exposing plaintext destination URLs or secret keys.
 */
export function renderGatewayPageHtml(
  moreinfoHtmlTemplate: string,
  config: SiteConfig
): string {
  const brand = config.brand || MASTER_DEFAULT_CONFIG.brand;
  const specs = config.packageSpecs || MASTER_DEFAULT_CONFIG.packageSpecs;
  const sec = config.securityGate || MASTER_DEFAULT_CONFIG.securityGate;

  const rawBrandName = (brand.name || '').trim();
  const displayTitle = (sec.customHeading || specs.appName || rawBrandName || '').trim();
  const logoUrlClean = optimizeCloudinaryUrl(brand.logoUrl || '');
  const faviconUrlClean = optimizeCloudinaryUrl(brand.faviconUrl || brand.logoUrl || '');

  const safeCustomNoteHtml = sanitizeEditorialHtmlForSeo(
    (sec.customNoteHtml || '').trim(),
    displayTitle || 'Official Notice'
  );
  const safeWhatsapp = sanitizeSafeUrl(sec.helplineWhatsapp || '', {
    allowHash: false,
    allowMailto: false
  });
  const safeTelegram = sanitizeSafeUrl(sec.helplineTelegram || '', {
    allowHash: false,
    allowMailto: false
  });

  const publicGatewayMeta = {
    brandName: rawBrandName,
    logoUrl: logoUrlClean,
    accentColor: brand.accentColor || '#EF4444',
    appSlug: sec.appSlug || generateSlug(brand.shortName || rawBrandName || 'package') || 'package',
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

  let html = moreinfoHtmlTemplate;
  const faviconHref = escapeHtml(faviconUrlClean);
  const logoHref = escapeHtml(logoUrlClean);
  html = html.replace(
    /<link\s+rel="icon"\s+id="gateway-favicon"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="icon" id="gateway-favicon" href="${faviconHref}" />`
  );
  html = html.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeHtml(displayTitle || 'Verification')}</title>`
  );

  // SSR Pre-fill Header Brand, Logo, and Title
  html = html.replace(
    /<span\s+id="gw-brand-name">[\s\S]*?<\/span>/i,
    `<span id="gw-brand-name">${escapeHtml(rawBrandName)}</span>`
  );
  html = html.replace(
    /<img\b[^>]*id="gw-brand-logo"[^>]*>/i,
    `<img id="gw-brand-logo" class="gateway-brand-logo${logoHref ? '' : ' hidden'}" src="${logoHref}" alt="${escapeHtml(rawBrandName ? `${rawBrandName} Logo` : '')}" width="30" height="30" />`
  );
  html = html.replace(
    /<img\b[^>]*id="gw-app-icon"[^>]*>/i,
    `<img id="gw-app-icon" class="app-summary-icon${logoHref ? '' : ' hidden'}" src="${logoHref}" alt="${escapeHtml(displayTitle)}" width="64" height="64" />`
  );
  html = html.replace(
    /<h1\s+class="app-summary-title"\s+id="gw-app-title">[\s\S]*?<\/h1>/i,
    `<h1 class="app-summary-title" id="gw-app-title">${escapeHtml(displayTitle)}</h1>`
  );
  html = html.replace(
    /<span\s+id="gw-app-version">[\s\S]*?<\/span>/i,
    `<span id="gw-app-version">${escapeHtml(specs.version || '')}</span>`
  );
  html = html.replace(
    /<span\s+id="gw-app-meta-dot"[^>]*>[\s\S]*?<\/span>/i,
    `<span id="gw-app-meta-dot"${specs.version && specs.fileSize ? '' : ' class="hidden"'}>·</span>`
  );
  html = html.replace(
    /<span\s+id="gw-app-size">[\s\S]*?<\/span>/i,
    `<span id="gw-app-size">${escapeHtml(specs.fileSize || '')}</span>`
  );
  html = html.replace(
    /<span\s+id="gw-footer-copyright">[\s\S]*?<\/span>/i,
    `<span id="gw-footer-copyright">${rawBrandName ? `© ${new Date().getFullYear()} ${escapeHtml(rawBrandName)}. All rights reserved.` : ''}</span>`
  );

  // Pre-render custom note if provided by admin (sanitized)
  if (safeCustomNoteHtml) {
    html = html.replace(
      /<div\s+id="gw-custom-note"\s+class="custom-note-box\s+hidden">[\s\S]*?<\/div>/i,
      `<div id="gw-custom-note" class="custom-note-box">${safeCustomNoteHtml}</div>`
    );
  }

  // Pre-render specs table if enabled
  if (sec.showSpecsOnGateway) {
    html = html.replace(
      /<section\s+class="specs-card\s+hidden"\s+id="gw-specs-card">/i,
      '<section class="specs-card" id="gw-specs-card">'
    );
    html = html.replace(
      /<td\s+id="gw-spec-name">[\s\S]*?<\/td>/i,
      `<td id="gw-spec-name">${escapeHtml(displayTitle || '—')}</td>`
    );
    html = html.replace(
      /<td\s+id="gw-spec-ver-size">[\s\S]*?<\/td>/i,
      `<td id="gw-spec-ver-size">${escapeHtml([specs.version, specs.fileSize].filter(Boolean).join(' · ') || '—')}</td>`
    );
    html = html.replace(
      /<td\s+id="gw-spec-os">[\s\S]*?<\/td>/i,
      `<td id="gw-spec-os">${escapeHtml(specs.operatingSystem || '—')}</td>`
    );
    html = html.replace(
      /<code\s+id="gw-spec-sha256">[\s\S]*?<\/code>/i,
      `<code id="gw-spec-sha256">${escapeHtml(specs.sha256 || '')}</code>`
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

