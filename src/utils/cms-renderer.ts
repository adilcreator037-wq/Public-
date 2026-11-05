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
  generateSlug,
  escapeHtml,
  normalizeDomainUrl,
  resolveFontStackCss
} from './cms-types';
import { resolveRouteView, buildJsonLdSchema, applySmartInternalLinks } from './cms-seo';

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
    introParts.push(`<div class="hero-intro-block">${hero.introHtml}</div>`);
  }

  // 2. Hero 16:9 Showcase Banner (LCP Priority Image: eager + fetchpriority="high")
  if (hero.showBanner !== false && hero.bannerImageUrl) {
    const bannerSrc = optimizeCloudinaryUrl(hero.bannerImageUrl);
    const bannerAlt = escapeHtml(hero.bannerAlt || config.brand?.name || 'Banner');
    const captionHtml = hero.bannerCaption
      ? `<figcaption class="media-caption">${escapeHtml(hero.bannerCaption)}</figcaption>`
      : '';
    introParts.push(`
      <figure class="media-figure">
        <img src="${escapeHtml(bannerSrc)}" alt="${bannerAlt}" width="1200" height="675" loading="eager" fetchpriority="high" decoding="async" />
        ${captionHtml}
      </figure>
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

  // Block: Technical Package Specifications Table
  if (specs.enabled !== false) {
    const customRowsHtml = Array.isArray(specs.customRows)
      ? specs.customRows
          .map(
            (r) => `
            <tr>
              <th>${escapeHtml(r.label)}</th>
              <td>${escapeHtml(r.value)}</td>
            </tr>`
          )
          .join('')
      : '';

    blockMap.specs = `
      <section id="technical-specifications" data-meta-title="${escapeHtml(specs.metaTitle)}" data-meta-description="${escapeHtml(specs.metaDescription)}">
        <h2 id="package-specs-heading">${escapeHtml(specs.heading || 'Technical Package Specifications')}</h2>
        <table>
          <tbody>
            <tr>
              <th>Application Name</th>
              <td><strong>${escapeHtml(specs.appName || config.brand?.name || 'ApexMobile')}</strong></td>
            </tr>
            <tr>
              <th>Latest Version</th>
              <td><code>${escapeHtml(specs.version || 'v4.8.2')}</code></td>
            </tr>
            <tr>
              <th>Package Size</th>
              <td>${escapeHtml(specs.fileSize || '64.2 MB')}</td>
            </tr>
            <tr>
              <th>System Requirements</th>
              <td>${escapeHtml(specs.operatingSystem || 'Android 9.0+ / iOS 15.0+')}</td>
            </tr>
            <tr>
              <th>Package Format</th>
              <td>${escapeHtml(specs.packageFormat || 'Signed Package')}</td>
            </tr>
            <tr>
              <th>License &amp; Cost</th>
              <td>${escapeHtml(specs.license || 'Freeware')}</td>
            </tr>
            <tr>
              <th>Security Scan Status</th>
              <td><strong style="color:#059669;">✓ ${escapeHtml(specs.securityStatus || 'Verified Clean')}</strong></td>
            </tr>
            <tr>
              <th>Last Updated</th>
              <td>${escapeHtml(specs.lastUpdated || 'November 2026')}</td>
            </tr>
            <tr>
              <th>SHA-256 Checksum</th>
              <td><code>${escapeHtml(specs.sha256 || '')}</code></td>
            </tr>
            ${customRowsHtml}
          </tbody>
        </table>
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
        const hasImg = Boolean(sec.imageUrl && sec.imagePosition !== 'none');
        const imgSrc = hasImg ? optimizeCloudinaryUrl(sec.imageUrl!) : '';
        const imgMarkup = hasImg
          ? `<figure class="media-figure">
              <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(sec.imageAlt || sec.heading)}" width="1200" height="675" loading="lazy" decoding="async" />
              ${sec.imageCaption ? `<figcaption class="media-caption">${escapeHtml(sec.imageCaption)}</figcaption>` : ''}
            </figure>`
          : '';
        const ctaMarkup =
          sec.ctaLabel && sec.ctaUrl
            ? `<div style="margin: 16px 0 8px 0;">
                <a href="${escapeHtml(sec.ctaUrl)}" data-spa-link class="section-inline-cta">${escapeHtml(sec.ctaLabel)}</a>
              </div>`
            : '';

        const enhancedSectionHtml = applySmartInternalLinks(sec.htmlContent || '', config, '/');
        return `
          <section id="${slug}" data-meta-title="${escapeHtml(sec.metaTitle)}" data-meta-description="${escapeHtml(sec.metaDescription)}">
            ${badgeHtml}
            <h2 id="${slug}-heading">${escapeHtml(sec.heading || '')}</h2>
            ${sec.imagePosition === 'top' ? imgMarkup : ''}
            ${enhancedSectionHtml}
            ${sec.imagePosition === 'bottom' ? imgMarkup : ''}
            ${ctaMarkup}
          </section>
        `;
      })
      .join('\n');
  }

  // Block: Raw HTML
  if (rawHtml && rawHtml.trim()) {
    blockMap.rawHtml = applySmartInternalLinks(rawHtml, config, '/');
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
              <img src="${escapeHtml(optimizeCloudinaryUrl(art.coverImageUrl))}" alt="${escapeHtml(art.coverImageAlt || art.title)}" width="1200" height="675" loading="lazy" decoding="async" class="news-card-cover-img" />
            </a>`
          : '';

        return `
          <article class="news-item-block">
            ${coverHtml}
            <div class="news-meta-line">
              <span class="news-category-tag">${escapeHtml(art.category || 'Daily News')}</span>
              ${art.featured ? `<span class="news-featured-tag">★ Featured</span>` : ''}
              <span>${escapeHtml(art.date || '')}</span>
              ${art.author ? `<span>· By ${escapeHtml(art.author)}</span>` : ''}
              ${art.readTime ? `<span>· ${escapeHtml(art.readTime)}</span>` : ''}
            </div>
            <h3 style="margin-top:4px; border-bottom:none; padding-bottom:0;">
              <a href="${articleUrl}" data-spa-link class="news-title-link">${escapeHtml(art.title || '')}</a>
            </h3>
            <p style="margin-bottom:8px;">${escapeHtml(art.summary || '')}</p>
            <a href="${articleUrl}" data-spa-link class="news-read-more">${escapeHtml(readMoreText)}</a>
          </article>
        `;
      })
      .join('\n');

    blockMap.news = `
      <section id="latest-news" class="cv-auto-section" data-meta-title="${escapeHtml(news.metaTitle)}" data-meta-description="${escapeHtml(news.metaDescription)}">
        <div style="display:flex; align-items:baseline; justify-content:space-between; flex-wrap:wrap; gap:8px;">
          <h2 id="news" style="margin-bottom:6px;">${escapeHtml(news.heading || 'Daily News & Release Updates')}</h2>
          <a href="/news" data-spa-link class="news-read-more">${escapeHtml(viewAllText)} (${news.articles.length})</a>
        </div>
        ${newsItemsHtml}
      </section>
    `;
  }

  // Block: Frequently Asked Questions Section
  if (faqs.enabled !== false && Array.isArray(faqs.items) && faqs.items.length > 0) {
    const faqItemsHtml = faqs.items
      .map((f) => `<h3>${escapeHtml(f.question || '')}</h3>\n<p>${escapeHtml(f.answer || '')}</p>`)
      .join('\n');

    blockMap.faqs = `
      <section id="frequently-asked-questions" class="cv-auto-section" data-meta-title="${escapeHtml(faqs.metaTitle)}" data-meta-description="${escapeHtml(faqs.metaDescription)}">
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
  return [...introParts, ...orderedHtml].join('\n\n');
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
                  <img src="${escapeHtml(optimizeCloudinaryUrl(art.coverImageUrl))}" alt="${escapeHtml(art.coverImageAlt || art.title)}" width="1200" height="675" loading="lazy" decoding="async" class="news-card-cover-img" />
                </a>`
              : '';

            return `
              <article class="news-item-block">
                ${coverHtml}
                <div class="news-meta-line">
                  <span class="news-category-tag">${escapeHtml(art.category || 'Daily News')}</span>
                  ${art.featured ? `<span class="news-featured-tag">★ Featured</span>` : ''}
                  <span>${escapeHtml(art.date || '')}</span>
                  ${art.author ? `<span>· By ${escapeHtml(art.author)}</span>` : ''}
                  ${art.readTime ? `<span>· ${escapeHtml(art.readTime)}</span>` : ''}
                </div>
                <h3 style="margin-top:6px; border-bottom:none; padding-bottom:0;">
                  <a href="${articleUrl}" data-spa-link class="news-title-link">${escapeHtml(art.title || '')}</a>
                </h3>
                <p style="margin-bottom:10px;">${escapeHtml(art.summary || '')}</p>
                <a href="${articleUrl}" data-spa-link class="news-read-more">${escapeHtml(ui.newsReadMoreLabel || 'Read Full Article →')}</a>
              </article>
            `;
          })
          .join('\n')
      : `<p>No news articles found in this category.</p>`;

  return `
    <p style="color:#4B5563; margin-bottom:12px;">
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
        <img src="${escapeHtml(optimizeCloudinaryUrl(article.coverImageUrl))}" alt="${escapeHtml(article.coverImageAlt || article.title)}" width="1200" height="675" loading="eager" fetchpriority="high" decoding="async" />
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
        <div class="internal-crawl-hub" style="margin-top:24px; padding:14px 16px; border:1px solid var(--border-color, #E2E8F0); border-radius:10px; background:var(--bg-page, #F8FAFC);">
          <div style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:#64748B; margin-bottom:8px;">Official Portal Guides &amp; Resources</div>
          <div style="display:flex; flex-wrap:wrap; gap:8px;">
            <a href="/" data-spa-link class="footer-link">🏠 ${escapeHtml(config.brand?.name || 'Home')} Overview</a>
            ${visibleSections
              .map(
                (sec) =>
                  `<a href="/#${escapeHtml(generateSlug(sec.slug || sec.heading))}" data-spa-link class="footer-link">§ ${escapeHtml(sec.heading)}</a>`
              )
              .join('')}
          </div>
        </div>
      `
      : '';

  const enhancedArticleBody = applySmartInternalLinks(
    article.htmlContent || `<p>${escapeHtml(article.summary || '')}</p>`,
    config,
    `/news/${generateSlug(article.slug || article.title)}`
  );

  return `
    <div class="news-meta-line" style="margin-bottom:18px; padding-bottom:12px; border-bottom:1px solid var(--border-color, #E5E7EB);">
      <span class="news-category-tag">${escapeHtml(article.category || 'Daily Update')}</span>
      <span>Published: <strong>${escapeHtml(article.date || 'November 2026')}</strong></span>
      ${article.author ? `<span>· By <strong>${escapeHtml(article.author)}</strong></span>` : ''}
      ${article.readTime ? `<span>· ${escapeHtml(article.readTime)}</span>` : ''}
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
        <img src="${escapeHtml(optimizeCloudinaryUrl(page.bannerImageUrl))}" alt="${escapeHtml(page.bannerImageAlt || page.h1)}" width="1200" height="675" loading="eager" fetchpriority="high" decoding="async" />
      </figure>`
    : '';

  const subtitleText = page.subtitle || 'Official Document';
  const enhancedHtml = config
    ? applySmartInternalLinks(page.htmlContent || '', config, `/${generateSlug(page.slug || page.label)}`)
    : page.htmlContent || '';

  return `
    <p style="font-size:13.5px; color:#6B7280; margin-bottom:20px; padding-bottom:12px; border-bottom:1px solid var(--border-color, #E5E7EB);">
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
        <span>🏠 Home Overview</span>
        <span class="drawer-link-badge">Main</span>
      </a>
    </li>
  `);

  const seenUrls = new Set<string>(['/']);

  for (const link of shell.headerLinks || []) {
    if (!link.label || !link.url) continue;
    const rawUrl = link.url.trim();
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
            <span>§ ${escapeHtml(sec.label)}</span>
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
            <span>📰 All Daily News &amp; Updates</span>
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
    const rawPrimaryUrl = shell.heroCtas.primaryCta.url || '#technical-specifications';
    const primaryHref = rawPrimaryUrl.startsWith('#') ? `/${rawPrimaryUrl}` : rawPrimaryUrl;
    items.push(`
      <li class="drawer-cta-footer">
        <a href="${escapeHtml(primaryHref)}" data-spa-link class="drawer-cta-btn">
          <span>⚡ ${escapeHtml(shell.heroCtas.primaryCta.label)}</span>
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

  let heroH1 = config.hero?.h1 || config.brand?.name || '';
  let showHeroSection = ui.showHeroSection !== false;
  let showHeroCtaGrid = route.viewType === 'home' && ui.showHeroCtaButtons !== false;
  let renderedMainHtml = '';

  if (route.viewType === 'news-hub') {
    heroH1 = config.newsSection?.heading || 'Daily News & Release Updates';
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
    showHeroSection = ui.showHeroSection !== false;
    showHeroCtaGrid = ui.showHeroCtaButtons !== false;
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

  const allSubpagePills = [
    ...(config.newsSection?.enabled !== false
      ? [{ label: `📰 ${ui.headerNewsButtonLabel || 'Daily News'}`, href: '/news' }]
      : []),
    ...footerPages.map((pg) => ({
      label: pg.label,
      href: `/${pg.slug}`
    }))
  ];

  return {
    path: pathname,
    canonicalPath: route.canonicalPath,
    viewType: route.viewType,
    metaTitle: route.metaTitle,
    metaDescription: route.metaDescription,
    ogImage: optimizeCloudinaryUrl(
      route.ogImage || config.seo?.ogImageUrl || config.hero?.bannerImageUrl || '/assets/hero-banner.svg'
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
        secondaryCta: config.hero.secondaryCta,
        primaryCta: {
          ...config.hero.primaryCta,
          url: config.securityGate?.enabled !== false ? '/moreinfo' : config.hero.primaryCta.url
        },
        floatingCta: {
          ...config.hero.floatingCta,
          url: config.securityGate?.enabled !== false ? '/moreinfo' : config.hero.floatingCta.url
        }
      },
      packageVersion: config.packageSpecs?.version || '',
      headerLinks: config.navigation.headerLinks || [],
      autoSectionLinks,
      recentNewsDrawerItems,
      headerPages,
      footerPages,
      allSubpagePills,
      newsCount: (config.newsSection?.articles || []).length,
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
  const jsonLd = JSON.stringify(payload.jsonLd);
  const ui = payload.shell.uiConfig || MASTER_DEFAULT_CONFIG.uiConfig;

  let html = indexHtmlTemplate;

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

  html = html.replace(/<html\s+lang="en">/i, `<html lang="en" style="${escapeHtml(inlineRootVars)}">`);

  // 2. Replace <head> SEO tags
  const faviconHref = escapeHtml(
    optimizeCloudinaryUrl(config.brand?.faviconUrl || config.brand?.logoUrl || '/assets/app-icon.svg')
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
    `<link rel="icon" href="${faviconHref}" />`
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
  const logoSrc = escapeHtml(optimizeCloudinaryUrl(config.brand?.logoUrl || '/assets/app-icon.svg'));
  const brandName = escapeHtml(config.brand?.name || 'ApexMobile');
  html = html.replace(
    /id="navbar-logo-img"([^>]*)src="[^"]*"/i,
    `id="navbar-logo-img"$1src="${logoSrc}"`
  );
  html = html.replace(
    /<span id="navbar-logo-text" class="brand-logo-text">[\s\S]*?<\/span>/i,
    `<span id="navbar-logo-text" class="brand-logo-text">${brandName}</span>`
  );

  // Pre-render Header News Button count
  const newsBtnLabel = ui.showNewsCountInHeader !== false
    ? `${ui.headerNewsButtonLabel || 'News'} (${payload.shell.newsCount})`
    : `${ui.headerNewsButtonLabel || 'News'}`;
  html = html.replace(
    /<a href="\/news" id="header-news-btn" class="header-news-link" data-spa-link>[\s\S]*?<\/a>/i,
    `<a href="/news" id="header-news-btn" class="header-news-link ${
      ui.showHeaderNewsButton === false ? 'hidden' : ''
    }" data-spa-link><span class="header-news-dot"></span><span>${escapeHtml(newsBtnLabel)}</span></a>`
  );

  // Pre-render Rich Hamburger Navigation Drawer (`#drawer-links-list`)
  const drawerHtml = renderHamburgerDrawerHtml(payload.shell, payload.canonicalPath);
  html = html.replace(
    /<ul class="nav-drawer-list" id="drawer-links-list"><\/ul>/i,
    `<ul class="nav-drawer-list" id="drawer-links-list">${drawerHtml}</ul>`
  );

  // Pre-render Hero H1 & CTA Grid visibility
  html = html.replace(
    /<h1 id="hero-heading" class="hero-title">[\s\S]*?<\/h1>/i,
    `<h1 id="hero-heading" class="hero-title">${escapeHtml(payload.heroH1)}</h1>`
  );
  if (!payload.showHeroCtaGrid) {
    html = html.replace(
      /<div id="hero-cta-grid" class="hero-action-grid">/i,
      `<div id="hero-cta-grid" class="hero-action-grid hidden">`
    );
  } else {
    html = html.replace(
      /<a id="hero-cta-secondary" class="btn-secondary" href="[^"]*">[\s\S]*?<\/a>/i,
      `<a id="hero-cta-secondary" class="btn-secondary" href="${escapeHtml(config.hero?.secondaryCta?.url || '#')}" data-spa-link>${escapeHtml(config.hero?.secondaryCta?.label || 'Installation Guide')}</a>`
    );
    const primaryHref =
      config.securityGate?.enabled !== false ? '/moreinfo' : config.hero?.primaryCta?.url || '#';
    const primaryRel =
      primaryHref === '/moreinfo' || primaryHref === '/download' ? ' rel="nofollow noopener"' : '';
    html = html.replace(
      /<a id="hero-cta-primary" class="btn-primary" href="[^"]*">[\s\S]*?<\/a>/i,
      `<a id="hero-cta-primary" class="btn-primary" href="${escapeHtml(primaryHref)}"${primaryRel} data-spa-link>${escapeHtml(config.hero?.primaryCta?.label || 'Download Official Package')}</a>`
    );
  }

  // Pre-render <main id="dynamic-content"> with exact route HTML so initial load has zero height jump
  html = html.replace(
    /<main id="dynamic-content" class="content-container prose-container"><\/main>/i,
    `<main id="dynamic-content" class="content-container prose-container" data-ssr-path="${escapeHtml(payload.canonicalPath)}">${payload.renderedMainHtml}</main>`
  );

  // Pre-render Footer links (Quick Links + Legal Pages) & text
  const quickLinksHtml = (config.navigation?.footerQuickLinks || [])
    .map((ql) => {
      const targetAttr = ql.openInNewTab ? ' target="_blank" rel="noopener noreferrer"' : ' data-spa-link';
      return `<a href="${escapeHtml(ql.url)}"${targetAttr} class="footer-link">${escapeHtml(ql.label)}</a>`;
    })
    .join('');

  const legalLinksHtml = payload.shell.footerPages
    .map(
      (pg) =>
        `<a href="/${escapeHtml(pg.slug)}" data-spa-link class="footer-link" title="${escapeHtml(pg.metaTitle)}">${escapeHtml(pg.label)}</a>`
    )
    .join('');

  const footerLinksHtml = [quickLinksHtml, legalLinksHtml].filter(Boolean).join('');

  if (config.navigation?.showFooterBrandSummary === false) {
    html = html.replace(
      /<div id="footer-brand-summary-block" class="footer-brand-summary-box">/i,
      `<div id="footer-brand-summary-block" class="footer-brand-summary-box hidden">`
    );
  }
  html = html.replace(
    /<div id="footer-brand-title" class="footer-brand-title">[\s\S]*?<\/div>/i,
    `<div id="footer-brand-title" class="footer-brand-title">${brandName}</div>`
  );
  html = html.replace(
    /<p id="footer-summary-text" class="footer-summary-text">[\s\S]*?<\/p>/i,
    `<p id="footer-summary-text" class="footer-summary-text">${escapeHtml(config.navigation?.footerSummary || config.brand?.tagline || '')}</p>`
  );
  if (config.navigation?.showFooterContactEmail === false || !config.brand?.contactEmail) {
    html = html.replace(
      /<a id="footer-contact-email-link" class="footer-contact-pill"/i,
      `<a id="footer-contact-email-link" class="footer-contact-pill hidden"`
    );
  } else {
    html = html.replace(
      /<a id="footer-contact-email-link" class="footer-contact-pill" href="[^"]*">[\s\S]*?<\/a>/i,
      `<a id="footer-contact-email-link" class="footer-contact-pill" href="mailto:${escapeHtml(config.brand.contactEmail)}">${escapeHtml(config.brand.contactEmail)}</a>`
    );
  }

  html = html.replace(
    /<p id="footer-disclaimer" class="footer-disclaimer-text"><\/p>/i,
    `<p id="footer-disclaimer" class="footer-disclaimer-text">${escapeHtml(config.navigation?.disclaimer || '')}</p>`
  );
  html = html.replace(
    /<div id="footer-links-list" class="footer-links-stack"><\/div>/i,
    `<div id="footer-links-list" class="footer-links-stack">${footerLinksHtml}</div>`
  );
  html = html.replace(
    /<p id="footer-copyright" class="footer-copyright-text"><\/p>/i,
    `<p id="footer-copyright" class="footer-copyright-text">${escapeHtml(config.navigation?.copyright || '')}</p>`
  );

  // 4. Inject LCP Preload Hints, Web App Manifest, Apple Touch Icon, Sitemap Link, Webmaster Verification, RSS, JSON-LD, and Static Initial Route Payload (ZERO Firebase!)
  const extraHeadTags: string[] = [];
  const themeColor = escapeHtml(config.brand?.themeColor || config.brand?.accentColor || '#EF4444');
  const appleIconHref = escapeHtml(
    optimizeCloudinaryUrl(config.brand?.appleTouchIconUrl || config.brand?.searchLogoUrl || config.brand?.logoUrl || '/assets/app-icon.svg')
  );

  extraHeadTags.push(`<meta name="theme-color" content="${themeColor}" />`);
  extraHeadTags.push(`<meta name="application-name" content="${brandName}" />`);
  extraHeadTags.push(`<meta name="apple-mobile-web-app-title" content="${escapeHtml(config.brand?.shortName || config.brand?.name || 'ApexMobile')}" />`);
  extraHeadTags.push(`<link rel="apple-touch-icon" sizes="180x180" href="${appleIconHref}" />`);

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
  if (config.domainConfig?.enableRssFeed !== false) {
    extraHeadTags.push(
      `<link rel="alternate" type="application/rss+xml" title="${brandName} News RSS" href="/feed.xml" />`
    );
  }

  const preloadScript = `
  ${extraHeadTags.join('\n  ')}
  <script id="dynamic-jsonld-schema" type="application/ld+json">${jsonLd}</script>
  <script>
    window.__INITIAL_ROUTE_PAYLOAD__ = ${JSON.stringify(payload).replace(/<\//g, '<\\/')};
  </script>
</head>`;
  html = html.replace('</head>', preloadScript);
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

  const displayTitle = sec.customHeading || specs.appName || brand.name || 'ApexMobile';
  const publicGatewayMeta = {
    brandName: brand.name || 'ApexMobile',
    logoUrl: optimizeCloudinaryUrl(brand.logoUrl || '/assets/app-icon.svg'),
    accentColor: brand.accentColor || '#EF4444',
    appSlug: sec.appSlug || generateSlug(brand.shortName || brand.name || 'apexmobile') || 'apexmobile',
    appSerialId: sec.appSerialId || 'APM-482',
    proceedButtonLabel: sec.proceedButtonLabel || 'PROCEED',
    unavailableMessage: sec.unavailableMessage || '',
    helplineWhatsapp: sec.helplineWhatsapp || '',
    helplineTelegram: sec.helplineTelegram || '',
    customHeading: sec.customHeading || '',
    customNoteHtml: sec.customNoteHtml || '',
    showSpecsOnGateway: Boolean(sec.showSpecsOnGateway),
    appName: displayTitle,
    version: specs.version || 'v4.8.2',
    fileSize: specs.fileSize || '64.2 MB',
    operatingSystem: specs.operatingSystem || 'Android 9.0+ / iOS 15.0+',
    securityStatus: specs.securityStatus || 'Verified Clean',
    sha256: specs.sha256 || ''
  };

  let html = moreinfoHtmlTemplate;
  const faviconHref = escapeHtml(
    optimizeCloudinaryUrl(brand.faviconUrl || brand.logoUrl || '/assets/app-icon.svg')
  );
  const logoHref = escapeHtml(
    optimizeCloudinaryUrl(brand.logoUrl || '/assets/app-icon.svg')
  );
  html = html.replace(
    /<link\s+rel="icon"\s+id="gateway-favicon"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="icon" id="gateway-favicon" href="${faviconHref}" />`
  );
  html = html.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeHtml(displayTitle)}</title>`
  );

  // SSR Pre-fill Header Brand, Logo, and Title
  html = html.replace(
    /<span\s+id="gw-brand-name">[\s\S]*?<\/span>/i,
    `<span id="gw-brand-name">${escapeHtml(brand.name || 'ApexMobile')}</span>`
  );
  html = html.replace(
    /id="gw-brand-logo"([^>]*)src="[^"]*"/i,
    `id="gw-brand-logo"$1src="${logoHref}"`
  );
  html = html.replace(
    /id="gw-app-icon"([^>]*)src="[^"]*"/i,
    `id="gw-app-icon"$1src="${logoHref}"`
  );
  html = html.replace(
    /<h1\s+class="app-summary-title"\s+id="gw-app-title">[\s\S]*?<\/h1>/i,
    `<h1 class="app-summary-title" id="gw-app-title">${escapeHtml(displayTitle)}</h1>`
  );
  html = html.replace(
    /<span\s+id="gw-app-version">[\s\S]*?<\/span>/i,
    `<span id="gw-app-version">${escapeHtml(specs.version || 'v4.8.2')}</span>`
  );
  html = html.replace(
    /<span\s+id="gw-app-size">[\s\S]*?<\/span>/i,
    `<span id="gw-app-size">${escapeHtml(specs.fileSize || '64.2 MB')}</span>`
  );
  html = html.replace(
    /<span\s+id="gw-footer-copyright">[\s\S]*?<\/span>/i,
    `<span id="gw-footer-copyright">© ${new Date().getFullYear()} ${escapeHtml(brand.name || 'ApexMobile')}. All rights reserved.</span>`
  );

  // Pre-render custom note if provided by admin
  const customNote = (sec.customNoteHtml || '').trim();
  if (customNote) {
    html = html.replace(
      /<div\s+id="gw-custom-note"\s+class="custom-note-box\s+hidden">[\s\S]*?<\/div>/i,
      `<div id="gw-custom-note" class="custom-note-box">${customNote}</div>`
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
      `<td id="gw-spec-name">${escapeHtml(displayTitle)}</td>`
    );
    html = html.replace(
      /<td\s+id="gw-spec-ver-size">[\s\S]*?<\/td>/i,
      `<td id="gw-spec-ver-size">${escapeHtml(specs.version || 'v4.8.2')} · ${escapeHtml(specs.fileSize || '64.2 MB')}</td>`
    );
    html = html.replace(
      /<td\s+id="gw-spec-os">[\s\S]*?<\/td>/i,
      `<td id="gw-spec-os">${escapeHtml(specs.operatingSystem || 'Android 9.0+ / iOS 15.0+')}</td>`
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

