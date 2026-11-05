import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  optimizeCloudinaryUrl,
  generateSlug,
  stripHtmlToExcerpt,
  mergeSiteConfig,
  MASTER_DEFAULT_CONFIG,
  resolveRouteView,
  buildJsonLdSchema,
  buildPartialRoutePayload,
  renderHamburgerDrawerHtml,
  renderCompleteStaticPageHtml,
  routePathToStaticJsonName,
  compileStaticSiteBundle,
  extractFaqsFromRawHtml,
  generateSmartLegalHtml,
  generateSitemapXml,
  generateWebManifestJson,
  generateRobotsTxt,
  generateRssFeedXml,
  auditSiteSeoHealth,
  sanitizeEditorialHtmlForSeo,
  applySmartInternalLinks,
  encryptVaultValue,
  decryptVaultValue,
  evaluateGateG1,
  handleSessionInit,
  handleSessionClearance,
  TOKEN_V
} from './cms-engine';

test('optimizeCloudinaryUrl injects f_auto,q_auto into Cloudinary URLs', () => {
  const input = 'https://res.cloudinary.com/demo/image/upload/v1234/banner.png';
  const expected = 'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1234/banner.png';
  assert.equal(optimizeCloudinaryUrl(input), expected);
});

test('generateSlug produces clean URL-safe anchor slugs', () => {
  assert.equal(generateSlug('What is New in v4.8.2?'), 'what-is-new-in-v482');
  assert.equal(generateSlug('  Privacy Policy & Terms  '), 'privacy-policy-terms');
});

test('mergeSiteConfig deep-merges partial state and preserves Domain, GitHub Config, UI Config, Specs, News, Sections, and Standalone Pages', () => {
  const merged = mergeSiteConfig({
    brand: {
      name: 'CustomApp',
      logoUrl: '/logo.svg',
      faviconUrl: '/fav.svg',
      accentColor: '#2563EB',
      contactEmail: 'hi@custom.com'
    },
    domainConfig: {
      ...MASTER_DEFAULT_CONFIG.domainConfig,
      primaryDomain: 'customapp.io'
    },
    githubConfig: {
      ...MASTER_DEFAULT_CONFIG.githubConfig,
      repoOwner: 'acme-org',
      repoName: 'customapp-static'
    }
  });
  assert.equal(merged.brand.name, 'CustomApp');
  assert.equal(merged.brand.shortName, 'CustomApp');
  assert.equal(merged.domainConfig.primaryDomain, 'https://customapp.io');
  assert.equal(merged.seo.canonicalUrl, 'https://customapp.io');
  assert.equal(merged.githubConfig.repoOwner, 'acme-org');
  assert.equal(merged.githubConfig.repoName, 'customapp-static');
  assert.ok(merged.packageSpecs.enabled);
  assert.ok(merged.uiConfig.maxContainerWidth === '768px');
  assert.ok(merged.uiConfig.headerBackgroundColor === '#FFFFFF');
  assert.ok(merged.navigation.showFooterBrandSummary);
  assert.ok(merged.domainConfig.enableAutoInternalLinks);
  assert.ok(merged.sections.length >= 2);
  assert.ok(merged.newsSection.articles.length >= 2);
  assert.ok(merged.pages.some((p) => p.slug === 'privacy-policy'));
});

test('resolveRouteView resolves Home (/), News Hub (/news), News Article (/news/:slug), and Legal Pages (/privacy-policy)', () => {
  const config = MASTER_DEFAULT_CONFIG;

  const homeView = resolveRouteView('/', config);
  assert.equal(homeView.viewType, 'home');
  assert.equal(homeView.canonicalPath, '/');

  const newsHubView = resolveRouteView('/news', config);
  assert.equal(newsHubView.viewType, 'news-hub');
  assert.equal(newsHubView.canonicalPath, '/news');

  const privacyView = resolveRouteView('/privacy-policy', config);
  assert.equal(privacyView.viewType, 'standalone-page');
  assert.equal(privacyView.canonicalPath, '/privacy-policy');
  assert.ok(privacyView.metaTitle.includes('Privacy Policy'));

  const newsView = resolveRouteView('/news/apexmobile-v4-8-2-release-notes', config);
  assert.equal(newsView.viewType, 'news-article');
  assert.equal(newsView.canonicalPath, '/news/apexmobile-v4-8-2-release-notes');
  assert.ok(newsView.metaTitle.includes('v4.8.2'));
});

test('buildPartialRoutePayload and renderHamburgerDrawerHtml generate scoped SSR HTML and categorized 3-bar drawer', () => {
  const config = MASTER_DEFAULT_CONFIG;

  const homePayload = buildPartialRoutePayload('/', config);
  assert.equal(homePayload.viewType, 'home');
  assert.ok(homePayload.showHeroCtaGrid);
  assert.ok(homePayload.renderedMainHtml.includes('id="technical-specifications"'));
  assert.ok(!homePayload.renderedMainHtml.includes('GDPR/CCPA compliance'));

  const drawerHtml = renderHamburgerDrawerHtml(homePayload.shell, '/');
  assert.ok(drawerHtml.includes('Page &amp; Section Navigation'));
  assert.ok(drawerHtml.includes('Daily News &amp; Changelogs'));
  assert.ok(drawerHtml.includes('Official Legal &amp; Support Pages'));
  assert.ok(drawerHtml.includes('drawer-cta-btn'));

  const privacyPayload = buildPartialRoutePayload('/privacy-policy', config);
  assert.equal(privacyPayload.viewType, 'standalone-page');
  assert.equal(privacyPayload.showHeroCtaGrid, false);
  assert.ok(privacyPayload.renderedMainHtml.includes('GDPR/CCPA compliance'));
  assert.ok(!privacyPayload.renderedMainHtml.includes('id="technical-specifications"'));

  const newsPayload = buildPartialRoutePayload('/news/apexmobile-v4-8-2-release-notes', config);
  assert.equal(newsPayload.viewType, 'news-article');
  assert.ok(newsPayload.renderedMainHtml.includes('Sub-180ms Cold Start'));
  assert.ok(newsPayload.renderedMainHtml.includes('Official Portal Guides &amp; Resources'));
});

test('sanitizeEditorialHtmlForSeo and applySmartInternalLinks automatically enhance admin-posted HTML and inject contextual internal links', () => {
  const rawHtml = '<h2>Verify Package Integrity</h2><p>Always check the SHA-256 cryptographic checksum and read the installation guide before running.</p><img src="/test.png">';
  const sanitized = sanitizeEditorialHtmlForSeo(rawHtml, 'ApexMobile');
  assert.ok(sanitized.includes('id="verify-package-integrity"'));
  assert.ok(sanitized.includes('loading="lazy"'));
  assert.ok(sanitized.includes('decoding="async"'));
  assert.ok(sanitized.includes('alt="ApexMobile"'));

  const linked = applySmartInternalLinks(sanitized, MASTER_DEFAULT_CONFIG, '/news/sample-post');
  assert.ok(linked.includes('href="/#technical-specifications"'));
  assert.ok(linked.includes('class="internal-seo-link"'));

  const excerpt = stripHtmlToExcerpt('<p>Hello <strong>World</strong> from mobile editor!</p>', 50);
  assert.equal(excerpt, 'Hello World from mobile editor!');
});

test('compileStaticSiteBundle compiles 100% static HTML, manifest.webmanifest, and per-route JSON with zero Firebase references on public pages', () => {
  assert.equal(routePathToStaticJsonName('/'), 'index.json');
  assert.equal(routePathToStaticJsonName('/news'), 'news.json');
  assert.equal(routePathToStaticJsonName('/news/my-post'), 'news--my-post.json');
  assert.equal(routePathToStaticJsonName('/privacy-policy'), 'privacy-policy.json');

  const bundle = compileStaticSiteBundle(MASTER_DEFAULT_CONFIG);
  assert.ok(bundle.totalFiles >= 16);

  const indexFile = bundle.files.find((f) => f.path === 'index.html');
  assert.ok(indexFile);
  assert.ok(indexFile.content.includes('window.__INITIAL_ROUTE_PAYLOAD__'));
  assert.ok(indexFile.content.includes('rel="preload" as="image"'));
  assert.ok(indexFile.content.includes('rel="manifest" href="/manifest.webmanifest"'));
  assert.ok(indexFile.content.includes('--bg-header:#FFFFFF'));
  assert.ok(indexFile.content.includes('--bg-footer:#0F172A'));
  assert.ok(!indexFile.content.includes('firebase-app.js'));
  assert.ok(!indexFile.content.includes('firebase-firestore.js'));

  const manifestFile = bundle.files.find((f) => f.path === 'manifest.webmanifest');
  assert.ok(manifestFile);
  const parsedManifest = JSON.parse(manifestFile.content);
  assert.equal(parsedManifest.short_name, 'ApexMobile');
  assert.ok(Array.isArray(parsedManifest.icons));

  const newsHubFile = bundle.files.find((f) => f.path === 'news/index.html');
  assert.ok(newsHubFile);

  const privacyJsonFile = bundle.files.find((f) => f.path === 'static-routes/privacy-policy.json');
  assert.ok(privacyJsonFile);
});

test('buildJsonLdSchema generates Organization 512x512 Search Logo, BreadcrumbList, and route-specific schema', () => {
  const config = MASTER_DEFAULT_CONFIG;

  const homeSchema = buildJsonLdSchema(config, '/');
  const orgNode = homeSchema['@graph'].find((item: any) => item['@type'] === 'Organization') as any;
  assert.ok(orgNode);
  assert.equal(orgNode.logo['@type'], 'ImageObject');
  assert.equal(orgNode.logo.width, 512);
  assert.equal(orgNode.logo.height, 512);
  assert.ok(homeSchema['@graph'].some((item: any) => item['@type'] === 'FAQPage'));
  assert.ok(homeSchema['@graph'].some((item: any) => item['@type'] === 'SoftwareApplication'));

  const hubSchema = buildJsonLdSchema(config, '/news');
  assert.ok(hubSchema['@graph'].some((item: any) => item['@type'] === 'CollectionPage'));

  const newsSchema = buildJsonLdSchema(config, '/news/apexmobile-v4-8-2-release-notes');
  assert.ok(newsSchema['@graph'].some((item: any) => item['@type'] === 'NewsArticle'));

  const privacySchema = buildJsonLdSchema(config, '/privacy-policy');
  assert.ok(privacySchema['@graph'].some((item: any) => item['@type'] === 'WebPage'));
});

test('generateSitemapXml (with Google Image Sitemap), generateWebManifestJson, generateRobotsTxt, generateRssFeedXml, and auditSiteSeoHealth work accurately', () => {
  const sitemap = generateSitemapXml(MASTER_DEFAULT_CONFIG);
  assert.ok(sitemap.includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'));
  assert.ok(sitemap.includes('<image:image>'));
  assert.ok(sitemap.includes('<loc>https://apexmobile.example.com/</loc>'));
  assert.ok(sitemap.includes('<loc>https://apexmobile.example.com/news</loc>'));
  assert.ok(sitemap.includes('<loc>https://apexmobile.example.com/privacy-policy</loc>'));

  const manifestJson = generateWebManifestJson(MASTER_DEFAULT_CONFIG);
  assert.ok(manifestJson.includes('"display": "standalone"'));

  const robots = generateRobotsTxt(MASTER_DEFAULT_CONFIG);
  assert.ok(robots.includes('Sitemap: https://apexmobile.example.com/sitemap.xml'));

  const rss = generateRssFeedXml(MASTER_DEFAULT_CONFIG);
  assert.ok(rss.includes('<rss version="2.0">'));

  const audit = auditSiteSeoHealth(MASTER_DEFAULT_CONFIG);
  assert.equal(audit.score, 100);
  assert.equal(audit.checks.length, 9);
  assert.ok(audit.totalUrlsInSitemap >= 8);

  const faqs = extractFaqsFromRawHtml('<h3>Q1: Is it fast?</h3><p>Yes, sub-second.</p>');
  assert.equal(faqs.length, 1);

  const legal = generateSmartLegalHtml('privacy', 'BrandX', 'https://brandx.io', 'help@brandx.io');
  assert.ok(legal.includes('BrandX'));

  const templateHtml =
    '<!doctype html><html><head><title>T</title><script type="application/ld+json" id="schema-json-ld">{}</script></head><body><h1 id="hero-h1"></h1><div id="hero-cta-grid"></div><div id="hero-intro"></div><div id="hero-banner-wrapper"></div><main id="article-body"></main><nav id="footer-links-list"></nav></body></html>';
  const renderedHtml = renderCompleteStaticPageHtml(templateHtml, MASTER_DEFAULT_CONFIG, '/');
  assert.ok(renderedHtml.includes('ApexMobile'));
});

test('v12 7-Gate Security Engine & AES-256-GCM Link Vault: encrypts/decrypts URLs, blocks bots with 404, verifies hardware cData & TokenV12, and burns single-use nonces', async () => {
  const secret = 'unit-test-master-vault-secret-2026';
  const targetUrl = 'https://cdn.apexmobile.example.com/releases/v4.8.2/ApexMobile-Signed.apk';

  // 1. AES-256-GCM Encryption & RAM Decryption
  const encrypted = await encryptVaultValue(targetUrl, undefined, secret);
  assert.ok(encrypted.startsWith('v2.'));
  assert.ok(!encrypted.includes('apexmobile.example.com'));
  const decrypted = await decryptVaultValue(encrypted, undefined, secret);
  assert.equal(decrypted, targetUrl);

  // 2. SEO Crawler & Bot Isolation on /moreinfo and /download
  const sitemap = generateSitemapXml(MASTER_DEFAULT_CONFIG);
  assert.ok(!sitemap.includes('/moreinfo'));
  assert.ok(!sitemap.includes('/download'));
  const robots = generateRobotsTxt(MASTER_DEFAULT_CONFIG);
  assert.ok(robots.includes('Disallow: /moreinfo'));
  assert.ok(robots.includes('Disallow: /download'));
  assert.ok(robots.includes('Disallow: /api/v1/app/'));

  const envMap = {
    AES_SECRET: secret,
    NONCE_HMAC_SECRET: secret,
    DID_HMAC_SECRET: secret,
    SECURITY_DEVICE_POLICY: 'universal_human'
  };

  // 3. Gate G1 blocks Googlebot / Headless / Cloud ASN with disguised 404
  const botCheck = evaluateGateG1({
    method: 'POST',
    path: '/api/v1/app/session-init',
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'accept-language': 'en-US,en;q=0.9'
    },
    rawBody: '{"appId":"apexmobile"}',
    ip: '66.249.66.1',
    adapter: 'express',
    env: envMap
  });
  assert.equal(botCheck.pass, false);

  // 4. Gate G1–G2 Session Init for valid human browser
  const humanUa =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
  const hardStr =
    '{"arch":"arm","dm":8,"plat":"Linux armv8l","sa":0,"ud":1,"udp":"Android","vend":"Google Inc.","wc":8}';
  const softStr =
    '{"gl":"WebGL 2.0","gpu":"Adreno (TM) 740","mdl":"Pixel 8 Pro","mp":[1,1,0,1,0],"tp":[112.45,18.2,94.1,16.0],"tx":16384}';

  const testSiteConfig = JSON.parse(JSON.stringify(MASTER_DEFAULT_CONFIG));
  testSiteConfig.securityGate.encryptedPrimaryUrl = encrypted;
  testSiteConfig.securityGate.devicePolicyMode = 'universal_human';

  const initRes = await handleSessionInit({
    method: 'POST',
    path: '/api/v1/app/session-init',
    headers: {
      host: 'localhost:3000',
      'user-agent': humanUa,
      'accept-language': 'en-US,en;q=0.9',
      'sec-ch-ua-mobile': '?1',
      'sec-fetch-site': 'same-origin',
      'sec-fetch-mode': 'cors'
    },
    rawBody: JSON.stringify({ appId: 'apexmobile' }),
    ip: '198.51.100.42',
    adapter: 'express',
    env: envMap,
    siteConfig: testSiteConfig
  });

  assert.equal(initRes.status, 200);
  const initBody = JSON.parse(initRes.body);
  assert.ok(initBody.nonce);
  const setCookieHeader = initRes.headers['Set-Cookie'];
  assert.ok(setCookieHeader);
  const cookiePair = setCookieHeader.split(';')[0];

  // Wait 550ms to satisfy Gate G3 server-measured dwell check (MIN_SERVER_DWELL_MS = 500ms)
  await new Promise((resolve) => setTimeout(resolve, 550));

  // 5. Gate G3–G7 Session Clearance with valid TokenV12 & hardware commitment
  const tokenV12 = {
    v: TOKEN_V,
    id: 'apexmobile',
    nonce: initBody.nonce,
    nv: 1 as const,
    hard: hardStr,
    soft: softStr,
    tap: {
      pt: 'touch',
      mtp: 5,
      coarse: 1 as const,
      rx: 14.2,
      ry: 14.2,
      pr: 0.5,
      x: 185,
      y: 420,
      d: 88,
      gap: 10,
      ev: 'ts,te,ck'
    },
    f: {
      wb: 0,
      hl: 0,
      dk: 0,
      cb: 0,
      tr: 1
    }
  };
  const encodedToken = Buffer.from(JSON.stringify(tokenV12), 'utf-8').toString('base64url');

  const clearanceCtx = {
    method: 'POST',
    path: '/api/v1/app/session-clearance',
    headers: {
      host: 'localhost:3000',
      cookie: cookiePair,
      'user-agent': humanUa,
      'accept-language': 'en-US,en;q=0.9',
      'sec-ch-ua-mobile': '?1',
      'sec-fetch-site': 'same-origin',
      'sec-fetch-mode': 'cors'
    },
    rawBody: JSON.stringify({
      token: encodedToken,
      cf: 'XXXX.DUMMY.TOKEN.XXXX'
    }),
    ip: '198.51.100.42',
    adapter: 'express' as const,
    env: envMap,
    siteConfig: testSiteConfig
  };

  const clearanceRes = await handleSessionClearance(clearanceCtx);
  assert.equal(clearanceRes.status, 200);
  const clearanceBody = JSON.parse(clearanceRes.body);
  assert.equal(clearanceBody.status, 'available');
  assert.equal(clearanceBody.url, targetUrl);

  // 6. Replay Attack Check: Re-using the exact same single-use nonce a second time MUST return HTTP 404!
  const replayRes = await handleSessionClearance(clearanceCtx);
  assert.equal(replayRes.status, 404);

  // 7. Automatic CTA -> /moreinfo routing & zero exposed security explanations on /moreinfo HTML
  const adminUpdated = mergeSiteConfig(
    {
      hero: {
        ...MASTER_DEFAULT_CONFIG.hero,
        primaryCta: { label: 'Download APK Now', url: 'https://mirror.example.com/secret-build.apk' }
      },
      securityGate: {
        ...MASTER_DEFAULT_CONFIG.securityGate,
        enabled: true,
        customHeading: 'Official Package Access'
      }
    },
    MASTER_DEFAULT_CONFIG
  );
  assert.equal(adminUpdated.hero.primaryCta.url, '/moreinfo');
  assert.equal(adminUpdated.securityGate.primaryDownloadUrl, 'https://mirror.example.com/secret-build.apk');
  assert.equal(adminUpdated.securityGate.showSpecsOnGateway, false);

  const staticBundle = compileStaticSiteBundle(
    adminUpdated,
    '<!doctype html><html><head><title>T</title><script id="schema-json-ld"></script></head><body><h1 id="hero-h1"></h1><div id="hero-cta-grid"></div><div id="hero-intro"></div><div id="hero-banner-wrapper"></div><main id="article-body"></main><nav id="footer-links-list"></nav></body></html>',
    {
      moreinfoHtmlTemplate:
        '<!doctype html><html><head><meta name="robots" content="noindex, nofollow" /><title id="gw-doc-title"></title></head><body data-turnstile-site-key=""><h1 id="gw-app-title"></h1><div id="gw-custom-note" hidden></div><button id="gw-clearance-btn"><span id="gw-btn-text"></span></button></body></html>'
    }
  );
  const moreinfoFile = staticBundle.files.find((f) => f.path === 'moreinfo/index.html');
  assert.ok(moreinfoFile);
  assert.ok(moreinfoFile.content.includes('noindex, nofollow'));
  assert.ok(moreinfoFile.content.includes('Official Package Access'));
  assert.ok(!moreinfoFile.content.includes('7-Gate'));
  assert.ok(!moreinfoFile.content.includes('AES-256-GCM'));
  assert.ok(!moreinfoFile.content.includes('secret-build.apk'));
});



