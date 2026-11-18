import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  optimizeCloudinaryUrl,
  optimizeImageUrl,
  buildResponsiveImageSrcSet,
  calculateTargetImageDimensions,
  generateSlug,
  stripHtmlToExcerpt,
  mergeSiteConfig,
  MASTER_DEFAULT_CONFIG,
  resolveRouteView,
  buildJsonLdSchema,
  buildPartialRoutePayload,
  renderHamburgerDrawerHtml,
  renderCompleteStaticPageHtml,
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
  TOKEN_V,
  EMPTY_ADMIN_CONFIG,
  SECRET_MASK,
  sanitizeConfigForClient,
  preserveSecretsOnSave,
  applyModulePatch,
  applyMultiModulePatch,
  extractConfigModule,
  appendSyncLogEntry,
  resolveAdminSecurityPolicy,
  validateAdminSessionClaims
} from './cms-engine';
import { routePathToStaticJsonName, compileStaticSiteBundle } from './static-compiler';
import { computeGitBlobSha1, diffGitTrees } from './github-publisher';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

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
  assert.ok(homePayload.renderedMainHtml.includes('class="table-scroll-wrapper"'));
  assert.ok(homePayload.renderedMainHtml.includes('class="faq-item"'));
  assert.ok(homePayload.renderedMainHtml.includes('class="toc-jump-bar"'));
  assert.ok(homePayload.renderedMainHtml.includes('class="copy-hash-btn"'));
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

test('compileStaticSiteBundle compiles 100% static HTML, manifest.webmanifest, and per-route JSON with zero Admin or Firebase files in public bundle', () => {
  assert.equal(routePathToStaticJsonName('/'), 'index.json');
  assert.equal(routePathToStaticJsonName('/news'), 'news.json');
  assert.equal(routePathToStaticJsonName('/news/my-post'), 'news--my-post.json');
  assert.equal(routePathToStaticJsonName('/privacy-policy'), 'privacy-policy.json');

  const bundle = compileStaticSiteBundle(MASTER_DEFAULT_CONFIG);
  assert.ok(bundle.totalFiles >= 16);

  // Strict Public vs Admin separation: no admin files in public static bundle
  assert.ok(!bundle.files.some((f) => f.path.includes('admin.html')));
  assert.ok(!bundle.files.some((f) => f.path.includes('admin.js')));
  assert.ok(!bundle.files.some((f) => f.path.includes('admin.css')));
  assert.ok(!bundle.files.some((f) => f.path.includes('firebase-config.js')));

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

test('buildJsonLdSchema generates Organization 512x512 Search Logo, WebPage, HowTo, BreadcrumbList, and route-specific schema', () => {
  const config = MASTER_DEFAULT_CONFIG;

  const homeSchema = buildJsonLdSchema(config, '/');
  const orgNode = homeSchema['@graph'].find((item: any) => item['@type'] === 'Organization') as any;
  assert.ok(orgNode);
  assert.equal(orgNode.logo['@type'], 'ImageObject');
  assert.equal(orgNode.logo.width, 512);
  assert.equal(orgNode.logo.height, 512);
  assert.ok(homeSchema['@graph'].some((item: any) => item['@type'] === 'WebPage'));
  assert.ok(homeSchema['@graph'].some((item: any) => item['@type'] === 'BreadcrumbList'));
  assert.ok(homeSchema['@graph'].some((item: any) => item['@type'] === 'FAQPage'));
  assert.ok(homeSchema['@graph'].some((item: any) => item['@type'] === 'SoftwareApplication'));
  assert.ok(homeSchema['@graph'].some((item: any) => item['@type'] === 'HowTo'));

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

test('auditSiteSeoHealth reports 0% and 0 sitemap URLs on EMPTY_ADMIN_CONFIG with zero false positives and actionable fixTab links', () => {
  const emptyAudit = auditSiteSeoHealth(EMPTY_ADMIN_CONFIG);
  assert.equal(emptyAudit.score, 0);
  assert.equal(emptyAudit.totalUrlsInSitemap, 0);
  assert.equal(emptyAudit.checks.length, 9);
  for (const chk of emptyAudit.checks) {
    assert.equal(chk.passed, false, `Expected check "${chk.id}" to fail on EMPTY_ADMIN_CONFIG`);
    assert.ok(chk.fixTab && chk.fixTab.length > 0, `Expected check "${chk.id}" to expose fixTab`);
    assert.ok(!/is ready/i.test(chk.detail), `Unexpected misleading "ready" claim on empty check "${chk.id}"`);
  }

  // Partial configuration only passes what is genuinely configured
  const partialConfig = mergeSiteConfig(
    {
      brand: {
        name: 'NovaPlayer',
        logoUrl: 'https://cdn.example.com/logo.png',
        faviconUrl: 'https://cdn.example.com/favicon.png',
        accentColor: '#EF4444',
        themeColor: '#EF4444'
      },
      hero: {
        h1: 'NovaPlayer Official Release',
        showBanner: false
      },
      domainConfig: {
        enableSitemapXml: false,
        enableRssFeed: false,
        enableWebManifest: false
      }
    },
    EMPTY_ADMIN_CONFIG
  );

  const partialAudit = auditSiteSeoHealth(partialConfig);
  assert.ok(partialAudit.score > 0 && partialAudit.score < 100);
  assert.equal(partialAudit.totalUrlsInSitemap, 0);

  // Disabled flags produce clean empty/disabled output consistently
  assert.equal(generateSitemapXml(partialConfig), '');
  assert.equal(generateRssFeedXml(partialConfig), '');
  assert.equal(generateWebManifestJson(partialConfig), '{}');
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

test('resolveVaultSecret supports VAULT_ENCRYPTION_SECRET & parseFirebaseConfigSnippet parses JS/JSON snippets cleanly', async () => {
  const {
    resolveVaultSecret,
    parseFirebaseConfigSnippet,
    isValidFirebaseClientConfig
  } = await import('./cms-engine');

  assert.equal(
    resolveVaultSecret({ VAULT_ENCRYPTION_SECRET: 'custom-vault-32-char-secret-2026' }),
    'custom-vault-32-char-secret-2026'
  );
  assert.equal(
    resolveVaultSecret({ LINK_VAULT_MASTER_SECRET: 'master-link-vault-secret-2026' }),
    'master-link-vault-secret-2026'
  );

  // Encrypt with VAULT_ENCRYPTION_SECRET via env object and decrypt cleanly
  const cipher = await encryptVaultValue('https://cdn.test.dev/app.apk', {
    VAULT_ENCRYPTION_SECRET: 'custom-vault-32-char-secret-2026'
  });
  assert.ok(cipher.startsWith('v2.'));
  const plain = await decryptVaultValue(cipher, {
    VAULT_ENCRYPTION_SECRET: 'custom-vault-32-char-secret-2026'
  });
  assert.equal(plain, 'https://cdn.test.dev/app.apk');

  // Parse pasted JS Firebase snippet
  const jsSnippet = `
    // For Firebase JS SDK v7.20.0 and later
    const firebaseConfig = {
      apiKey: "AIzaSyD-ExampleRealKey1234567890",
      authDomain: "prod-app-123.firebaseapp.com",
      projectId: "prod-app-123",
      storageBucket: "prod-app-123.appspot.com",
      messagingSenderId: "998877665544",
      appId: "1:998877665544:web:abcdef123456"
    };
  `;
  const parsed = parseFirebaseConfigSnippet(jsSnippet);
  assert.ok(parsed);
  assert.equal(parsed.apiKey, 'AIzaSyD-ExampleRealKey1234567890');
  assert.equal(parsed.projectId, 'prod-app-123');
  assert.equal(parsed.storageBucket, 'prod-app-123.appspot.com');
  assert.equal(parsed.databaseId, '(default)');
  assert.equal(isValidFirebaseClientConfig(parsed), true);

  // Reject dummy placeholders
  assert.equal(
    isValidFirebaseClientConfig({
      apiKey: 'DummyKey1234567890123456',
      projectId: 'my-single-domain-cms'
    }),
    false
  );
});

test('UI showTocJumpBar, hero CTA relSponsored, SEO priceCurrency, and rawJsonLd render accurately', () => {
  const cfg = mergeSiteConfig({
    uiConfig: {
      ...MASTER_DEFAULT_CONFIG.uiConfig,
      showTocJumpBar: false
    },
    securityGate: {
      ...MASTER_DEFAULT_CONFIG.securityGate,
      enabled: false
    },
    hero: {
      ...MASTER_DEFAULT_CONFIG.hero,
      primaryCta: {
        label: 'Partner Mirror',
        url: 'https://partner.example.com/pkg',
        relSponsored: true
      },
      secondaryCta: {
        label: 'Sponsored Guide',
        url: 'https://guide.example.com',
        relSponsored: true
      }
    },
    seo: {
      ...MASTER_DEFAULT_CONFIG.seo,
      softwareDetails: {
        ...MASTER_DEFAULT_CONFIG.seo.softwareDetails,
        priceCurrency: 'EUR'
      },
      rawJsonLd: JSON.stringify({
        "@type": "SpecialAnnouncement",
        "name": "Version 5.0 Mirror Ready"
      })
    }
  });

  const homePayload = buildPartialRoutePayload('/', cfg);
  assert.ok(!homePayload.renderedMainHtml.includes('class="toc-jump-bar"'));

  const schema = buildJsonLdSchema(cfg, '/');
  const swNode = schema['@graph'].find((n: any) => n['@type'] === 'SoftwareApplication');
  assert.ok(swNode);
  assert.equal(swNode.offers.priceCurrency, 'EUR');
  const customNode = schema['@graph'].find((n: any) => n['@type'] === 'SpecialAnnouncement');
  assert.ok(customNode);
  assert.equal(customNode.name, 'Version 5.0 Mirror Ready');

  const templateStub = `<!DOCTYPE html><html lang="en"><head><title>x</title><meta name="description" content="x"/><link rel="canonical" href="x"/><link rel="icon" href="x"/><meta property="og:title" content="x"/><meta property="og:description" content="x"/><meta property="og:url" content="x"/><meta property="og:image" content="x"/><meta name="twitter:title" content="x"/><meta name="twitter:description" content="x"/><meta name="twitter:image" content="x"/><script id="dynamic-json-ld" type="application/ld+json"></script></head><body><header class="sticky-header"><img id="navbar-logo-img" src="x"/><span id="navbar-logo-text" class="brand-logo-text">x</span><a href="/news" id="header-news-btn" class="header-news-link" data-spa-link>News</a><ul class="nav-drawer-list" id="drawer-links-list"></ul></header><div id="standalone-back-bar" class="back-home-bar hidden"><div></div></div><section id="hero-section" class="hero-container"><h1 id="hero-heading" class="hero-title">x</h1><div id="hero-cta-grid" class="hero-action-grid"><a id="hero-cta-secondary" class="btn-secondary" href="#">x</a><a id="hero-cta-primary" class="btn-primary" href="#">x</a></div></section><main id="dynamic-content" class="content-container prose-container"></main><footer class="site-footer"><div id="footer-brand-summary-block" class="footer-brand-summary-box"><div id="footer-brand-title" class="footer-brand-title">x</div><p id="footer-summary-text" class="footer-summary-text">x</p><a id="footer-contact-email-link" class="footer-contact-pill" href="x">x</a></div><div id="footer-disclaimer-block"><div id="footer-disclaimer-heading" class="footer-heading">x</div><p id="footer-disclaimer" class="footer-disclaimer-text">x</p></div><div id="footer-links-heading" class="footer-heading">x</div><div id="footer-links-list" class="footer-links-stack"></div><div id="footer-copyright" class="footer-copy">x</div></footer><script id="ssr-initial-state" type="application/json"></script></body></html>`;
  const renderedHtml = renderCompleteStaticPageHtml(templateStub, cfg, '/');
  assert.ok(renderedHtml.includes('id="hero-cta-secondary" class="btn-secondary" href="https://guide.example.com" rel="sponsored noopener"'));
  assert.ok(renderedHtml.includes('id="hero-cta-primary" class="btn-primary" href="https://partner.example.com/pkg" rel="sponsored noopener"'));
});

test('EMPTY_ADMIN_CONFIG has zero static demo articles, sections, FAQs, or pages', () => {
  assert.equal(EMPTY_ADMIN_CONFIG.brand.name, '');
  assert.equal(EMPTY_ADMIN_CONFIG.hero.h1, '');
  assert.equal(EMPTY_ADMIN_CONFIG.sections.length, 0);
  assert.equal(EMPTY_ADMIN_CONFIG.newsSection.articles.length, 0);
  assert.equal(EMPTY_ADMIN_CONFIG.faqsSection.items.length, 0);
  assert.equal(EMPTY_ADMIN_CONFIG.pages.length, 0);
  assert.equal(EMPTY_ADMIN_CONFIG.githubConfig.fineGrainedToken, '');
  assert.equal(EMPTY_ADMIN_CONFIG.securityGate.turnstileSecretKey, '');
});

test('sanitizeConfigForClient strips write-only secrets and sets boolean availability flags', () => {
  const raw = JSON.parse(JSON.stringify(EMPTY_ADMIN_CONFIG));
  raw.githubConfig.fineGrainedToken = 'github_pat_11ABCDEF_SECRET_VALUE';
  raw.securityGate.turnstileSecretKey = '0x4AAAAAA_REAL_TS_SECRET';

  const sanitized = sanitizeConfigForClient(raw);
  assert.equal(sanitized.githubConfig.fineGrainedToken, '');
  assert.equal(sanitized.githubConfig.hasFineGrainedToken, true);
  assert.equal(sanitized.securityGate.turnstileSecretKey, '');
  assert.equal(sanitized.securityGate.hasTurnstileSecretKey, true);

  // Environment fallback flags also surface boolean availability without revealing secrets
  const envOnly = sanitizeConfigForClient(EMPTY_ADMIN_CONFIG, {
    hasEnvGithubToken: true,
    hasEnvTurnstileSecret: true
  });
  assert.equal(envOnly.githubConfig.fineGrainedToken, '');
  assert.equal(envOnly.githubConfig.hasFineGrainedToken, true);
  assert.equal(envOnly.securityGate.turnstileSecretKey, '');
  assert.equal(envOnly.securityGate.hasTurnstileSecretKey, true);
});

test('preserveSecretsOnSave preserves stored secrets on empty/SECRET_MASK input and clears only when requested', () => {
  const existing = JSON.parse(JSON.stringify(EMPTY_ADMIN_CONFIG));
  existing.githubConfig.fineGrainedToken = 'github_pat_EXISTING';
  existing.securityGate.turnstileSecretKey = 'ts_EXISTING';

  // 1. Blank or SECRET_MASK preserves stored values
  const kept = preserveSecretsOnSave(
    {
      githubConfig: { ...existing.githubConfig, fineGrainedToken: SECRET_MASK },
      securityGate: { ...existing.securityGate, turnstileSecretKey: '' }
    },
    existing
  );
  assert.equal(kept.githubConfig.fineGrainedToken, 'github_pat_EXISTING');
  assert.equal(kept.githubConfig.hasFineGrainedToken, true);
  assert.equal(kept.securityGate.turnstileSecretKey, 'ts_EXISTING');
  assert.equal(kept.securityGate.hasTurnstileSecretKey, true);

  // 2. Explicit overwrite updates secret
  const updated = preserveSecretsOnSave(
    {
      githubConfig: { ...existing.githubConfig, fineGrainedToken: 'github_pat_NEW_VALUE' },
      securityGate: { ...existing.securityGate, turnstileSecretKey: 'ts_NEW' }
    },
    existing
  );
  assert.equal(updated.githubConfig.fineGrainedToken, 'github_pat_NEW_VALUE');
  assert.equal(updated.securityGate.turnstileSecretKey, 'ts_NEW');

  // 3. Explicit clear wipes stored secrets
  const cleared = preserveSecretsOnSave(
    {
      githubConfig: { ...existing.githubConfig, fineGrainedToken: '', clearFineGrainedToken: true },
      securityGate: { ...existing.securityGate, turnstileSecretKey: '', clearTurnstileSecretKey: true }
    },
    existing
  );
  assert.equal(cleared.githubConfig.fineGrainedToken, '');
  assert.equal(cleared.githubConfig.hasFineGrainedToken, false);
  assert.equal(cleared.securityGate.turnstileSecretKey, '');
  assert.equal(cleared.securityGate.hasTurnstileSecretKey, false);
});

test('applyModulePatch mutates only targeted module, preserves sibling modules & secrets, and tracks dirtyModulesSinceSync', () => {
  const base = JSON.parse(JSON.stringify(EMPTY_ADMIN_CONFIG));
  base.brand.name = 'InitialBrand';
  base.githubConfig.fineGrainedToken = 'github_pat_KEEP_ME';
  base.faqsSection = {
    enabled: true,
    heading: 'Old FAQs',
    items: [{ id: 'faq-1', question: 'Old Q?', answerHtml: '<p>Old A</p>' }]
  };

  const patched = applyModulePatch(
    base,
    'faqsSection',
    {
      enabled: true,
      heading: 'Updated FAQs',
      items: [
        { id: 'faq-1', question: 'Old Q?', answerHtml: '<p>Old A</p>' },
        { id: 'faq-2', question: 'New Q?', answerHtml: '<p>New A</p>' }
      ]
    },
    EMPTY_ADMIN_CONFIG
  );

  assert.equal(patched.savedModule, 'faqsSection');
  assert.equal(patched.config.brand.name, 'InitialBrand');
  assert.equal(patched.config.githubConfig.fineGrainedToken, 'github_pat_KEEP_ME');
  assert.equal(patched.config.faqsSection.heading, 'Updated FAQs');
  assert.equal(patched.config.faqsSection.items.length, 2);
  assert.ok(patched.dirtyModulesSinceSync.includes('faqsSection'));

  const extracted = extractConfigModule(patched.config, 'faqsSection');
  assert.equal(extracted.items.length, 2);
});

test('appendSyncLogEntry records structured push telemetry and clears dirtyModulesSinceSync on success', () => {
  const base = JSON.parse(JSON.stringify(EMPTY_ADMIN_CONFIG));
  base.dirtyModulesSinceSync = ['brand', 'faqsSection'];

  // Failed push keeps dirtyModulesSinceSync intact
  const afterError = appendSyncLogEntry(base, {
    trigger: 'manual-push',
    status: 'error',
    modulesChanged: ['brand', 'faqsSection'],
    filesCount: 12,
    changedPaths: ['index.html'],
    branch: 'main',
    repo: 'owner/repo',
    durationMs: 120,
    message: 'Push failed: 401',
    errorDetail: 'Bad credentials'
  });
  assert.equal(afterError.syncLogs?.length, 1);
  assert.equal(afterError.dirtyModulesSinceSync?.length, 2);

  // Successful push clears dirtyModulesSinceSync and mirrors deployHistory
  const afterSuccess = appendSyncLogEntry(afterError, {
    trigger: 'manual-push',
    status: 'success',
    modulesChanged: ['brand', 'faqsSection'],
    filesCount: 16,
    changedPaths: ['index.html', 'static-routes/index.json'],
    branch: 'main',
    repo: 'owner/repo',
    commitSha: 'abc1234567890',
    commitUrl: 'https://github.com/owner/repo/commit/abc1234567890',
    durationMs: 420,
    steps: ['Compiled static bundle', 'Pushed commit'],
    message: 'Synced 16 static files'
  });
  assert.equal(afterSuccess.syncLogs?.length, 2);
  assert.equal(afterSuccess.syncLogs?.[0].commitSha, 'abc1234567890');
  assert.equal(afterSuccess.dirtyModulesSinceSync?.length, 0);
  assert.equal(afterSuccess.githubConfig.lastCommitSha, 'abc1234567890');
  assert.equal(afterSuccess.githubConfig.deployHistory?.length, 2);
});

test('resolveAdminSecurityPolicy enforces zero hardcoded credentials, accepts strong Email+Password directly, and rejects weak passwords/secrets', () => {
  // Missing env vars FAILS CLOSED even on localhost (zero hardcoded defaults)
  const localUnset = resolveAdminSecurityPolicy({}, 'localhost:3000');
  assert.equal(localUnset.isProduction, false);
  assert.equal(localUnset.allowDefaultDevCreds, false);
  assert.equal(localUnset.credentialsReady, false);
  assert.ok(localUnset.setupError);

  // Production with missing secrets FAILS CLOSED
  const prodMissing = resolveAdminSecurityPolicy({ NODE_ENV: 'production' }, 'cms.example.com');
  assert.equal(prodMissing.isProduction, true);
  assert.equal(prodMissing.allowDefaultDevCreds, false);
  assert.equal(prodMissing.credentialsReady, false);
  assert.ok(prodMissing.setupError);

  // Untouched template placeholder passwords FAIL CLOSED
  for (const badPass of ['replace-with-password', 'your_password', 'your-password', 'changeme', 'example_pass']) {
    const placeholderCreds = resolveAdminSecurityPolicy(
      {
        NODE_ENV: 'production',
        ADMIN_EMAIL: 'owner@example.com',
        ADMIN_PASSWORD: badPass
      },
      'cms.example.com'
    );
    assert.equal(placeholderCreds.credentialsReady, false, `Expected placeholder "${badPass}" to fail closed`);
  }

  // Real configured 6-character password SUCCEEDS (no unexpected 503 lockout for owners)
  const sixCharCreds = resolveAdminSecurityPolicy(
    {
      NODE_ENV: 'production',
      ADMIN_EMAIL: 'login@officialdaman.com',
      ADMIN_PASSWORD: 'Dm9x!2'
    },
    'officialdaman.com'
  );
  assert.equal(sixCharCreds.credentialsReady, true);
  assert.equal(sixCharCreds.hasDerivedSecret, true);
  assert.equal(sixCharCreds.setupError, null);

  // Common email/password env aliases (ADMIN_EMAIL_ID + ADMIN_PWD) SUCCEED cleanly
  const aliasCreds = resolveAdminSecurityPolicy(
    {
      NODE_ENV: 'production',
      ADMIN_EMAIL_ID: 'owner@example.com',
      ADMIN_PWD: '123456'
    },
    'cms.example.com'
  );
  assert.equal(aliasCreds.credentialsReady, true);

  // Invalid email format FAILS CLOSED
  const badEmail = resolveAdminSecurityPolicy(
    {
      NODE_ENV: 'production',
      ADMIN_EMAIL: 'not-an-email',
      ADMIN_PASSWORD: 'Strong!Unique#Password2026'
    },
    'cms.example.com'
  );
  assert.equal(badEmail.credentialsReady, false);

  // Strong Email + Password WITHOUT ADMIN_SESSION_SECRET SUCCEEDS via derived secret
  const emailPassOnly = resolveAdminSecurityPolicy(
    {
      NODE_ENV: 'production',
      ADMIN_EMAIL: 'owner@example.com',
      ADMIN_PASSWORD: 'Strong!Unique#Password2026'
    },
    'cms.example.com'
  );
  assert.equal(emailPassOnly.credentialsReady, true);
  assert.equal(emailPassOnly.hasDerivedSecret, true);
  assert.equal(emailPassOnly.hasCustomSecret, true);
  assert.equal(emailPassOnly.allowDefaultDevCreds, false);
  assert.equal(emailPassOnly.setupError, null);

  // Custom non-placeholder ADMIN_SESSION_SECRET (even short) stretches via HMAC-SHA256 cleanly
  const customShortSecret = resolveAdminSecurityPolicy(
    {
      NODE_ENV: 'production',
      ADMIN_EMAIL: 'owner@example.com',
      ADMIN_PASSWORD: 'Strong!Unique#Password2026',
      ADMIN_SESSION_SECRET: 'customKey99'
    },
    'cms.example.com'
  );
  assert.equal(customShortSecret.credentialsReady, true);
  assert.equal(customShortSecret.hasDerivedSecret, false);

  // Placeholder ADMIN_SESSION_SECRET FAILS CLOSED
  const placeholderSecret = resolveAdminSecurityPolicy(
    {
      NODE_ENV: 'production',
      ADMIN_EMAIL: 'owner@example.com',
      ADMIN_PASSWORD: 'Strong!Unique#Password2026',
      ADMIN_SESSION_SECRET: 'replace-with-secret'
    },
    'cms.example.com'
  );
  assert.equal(placeholderSecret.credentialsReady, false);

  // Strong Email + Password + Session Secret SUCCEEDS
  const prodStrong = resolveAdminSecurityPolicy(
    {
      NODE_ENV: 'production',
      ADMIN_EMAIL: 'owner@example.com',
      ADMIN_PASSWORD: 'Strong!Unique#Password2026',
      ADMIN_SESSION_SECRET: 'super-long-production-hmac-secret-999'
    },
    'cms.example.com'
  );
  assert.equal(prodStrong.credentialsReady, true);
  assert.equal(prodStrong.hasDerivedSecret, false);
  assert.equal(prodStrong.allowDefaultDevCreds, false);
  assert.equal(prodStrong.setupError, null);

  // Strong ADMIN_API_KEY SUCCEEDS without email/password
  const apiKeyOnly = resolveAdminSecurityPolicy(
    {
      ADMIN_API_KEY: 'live-api-key-9876543210abcdef'
    },
    'localhost:3000'
  );
  assert.equal(apiKeyOnly.credentialsReady, true);
  assert.equal(apiKeyOnly.hasApiKey, true);
  assert.equal(apiKeyOnly.hasDerivedSecret, true);
});

test('Edge login.js + [[catchall]].js handle 6-char secret passwords, issue session cookie, and serve /api/admin/workspace in parity', async () => {
  const edgeLogin = await import('../../functions/api/admin/login.js');
  const edgeCatchall = await import('../../functions/api/[[catchall]].js');
  const edgeWorkspaceHtml = await import('../../functions/_shared/admin-workspace-html.js');
  const nodeWorkspaceHtml = await import('./admin-workspace-html');

  assert.equal(edgeWorkspaceHtml.getAdminWorkspaceShellHtml(), nodeWorkspaceHtml.getAdminWorkspaceShellHtml());

  const env = {
    CF_PAGES: '1',
    ADMIN_EMAIL: 'login@officialdaman.com',
    ADMIN_PASSWORD: 'Dm9x!2'
  };

  // 1. Login succeeds with 200 and HttpOnly __Host-cms_admin_session cookie
  const loginReq = new Request('https://officialdaman.com/api/admin/login', {
    method: 'POST',
    headers: {
      host: 'officialdaman.com',
      origin: 'https://officialdaman.com',
      'content-type': 'application/json',
      'x-admin-csrf': '1'
    },
    body: JSON.stringify({ email: 'login@officialdaman.com', password: 'Dm9x!2' })
  });
  const loginRes = await edgeLogin.onRequestPost({ request: loginReq, env });
  assert.equal(loginRes.status, 200);
  const loginData = await loginRes.json();
  assert.equal(loginData.success, true);
  assert.equal(loginData.user.email, 'login@officialdaman.com');
  const setCookie = loginRes.headers.get('set-cookie') || '';
  assert.ok(setCookie.includes('__Host-cms_admin_session='));
  const cookiePair = setCookie.split(';')[0];

  // 2. Unauthenticated GET /api/admin/workspace returns 401
  const unauthWsReq = new Request('https://officialdaman.com/api/admin/workspace', {
    method: 'GET',
    headers: { host: 'officialdaman.com' }
  });
  const unauthWsRes = await edgeCatchall.onRequest({
    request: unauthWsReq,
    env,
    params: { catchall: ['admin', 'workspace'] }
  });
  assert.equal(unauthWsRes.status, 401);

  // 3. Authenticated GET /api/admin/workspace returns 200 with full workspace HTML
  const authWsReq = new Request('https://officialdaman.com/api/admin/workspace', {
    method: 'GET',
    headers: { host: 'officialdaman.com', cookie: cookiePair }
  });
  const authWsRes = await edgeCatchall.onRequest({
    request: authWsReq,
    env,
    params: { catchall: ['admin', 'workspace'] }
  });
  assert.equal(authWsRes.status, 200);
  const authWsData = await authWsRes.json();
  assert.equal(authWsData.success, true);
  assert.ok(authWsData.html.includes('id="panel-overview"'));
  assert.ok(authWsData.html.includes('id="seo-audit-checklist"'));
});

test('validateAdminSessionClaims enforces strict issuer, type, jti, iat, and non-optional exp claims and preserves credVersion', () => {
  const now = Date.now();
  assert.equal(validateAdminSessionClaims(null, now).valid, false);
  assert.equal(
    validateAdminSessionClaims({ email: 'a@b.com', jti: '1234567890abcdef', exp: now + 60000 }, now).valid,
    false
  );
  // Token missing exp must fail closed
  assert.equal(
    validateAdminSessionClaims(
      { iss: 'master-cms-admin', typ: 'admin-session', email: 'a@b.com', jti: '1234567890abcdef', iat: now },
      now
    ).valid,
    false
  );
  // Valid claim set passes
  const ok = validateAdminSessionClaims(
    {
      iss: 'master-cms-admin',
      typ: 'admin-session',
      ver: 2,
      cv: 'abc123epoch45678',
      email: 'owner@example.com',
      jti: '1234567890abcdef',
      iat: now,
      exp: now + 60000
    },
    now
  );
  assert.equal(ok.valid, true);
  assert.equal(ok.claims?.email, 'owner@example.com');
  assert.equal(ok.claims?.ver, 2);
  assert.equal(ok.claims?.cv, 'abc123epoch45678');
});

test('Edge auth module stays in strict parity: Email+Password derived HMAC, cookie channel isolation, and credential-rotation revocation', async () => {
  const edgeAuth = await import('../../functions/_shared/auth.js');
  const env = {
    NODE_ENV: 'production',
    ADMIN_EMAIL: 'admin@example.org',
    ADMIN_PASSWORD: 'Ultra#Secure!Password99',
    ADMIN_API_KEY: 'edge-api-key-0123456789abcdef'
  };
  const creds = edgeAuth.getAdminCredentials(env, 'cms.example.org');
  assert.equal(creds.policy.credentialsReady, true);
  assert.equal(creds.hasDerivedSecret, true);

  const { signingSecret, credVersion } = await edgeAuth.deriveEdgeAdminAuthSecrets(creds, env);
  assert.ok(signingSecret.length >= 32);
  assert.ok(credVersion.length >= 12);

  const token = await edgeAuth.createAdminToken(creds.email, signingSecret, credVersion);
  const validRes = await edgeAuth.verifyAdminToken(token, signingSecret, creds.apiKey, false, credVersion, true);
  assert.equal(validRes.valid, true);
  assert.equal(validRes.email, 'admin@example.org');

  // Raw API key MUST NEVER be accepted inside session cookie channel (fromCookie = true)
  const cookieApiKeyAttempt = await edgeAuth.verifyAdminToken(
    creds.apiKey,
    signingSecret,
    creds.apiKey,
    false,
    credVersion,
    true
  );
  assert.equal(cookieApiKeyAttempt.valid, false);

  // Rotating ADMIN_PASSWORD changes credVersion & signingSecret, invalidating old tokens immediately
  const rotatedEnv = { ...env, ADMIN_PASSWORD: 'New!Rotated#Password2027' };
  const rotatedCreds = edgeAuth.getAdminCredentials(rotatedEnv, 'cms.example.org');
  const rotatedSecrets = await edgeAuth.deriveEdgeAdminAuthSecrets(rotatedCreds, rotatedEnv);
  const staleRes = await edgeAuth.verifyAdminToken(
    token,
    rotatedSecrets.signingSecret,
    rotatedCreds.apiKey,
    false,
    rotatedSecrets.credVersion,
    true
  );
  assert.equal(staleRes.valid, false);
});

test('Public static bundle outputs zero Firebase SDKs, zero Admin files, and zero Admin secrets', () => {
  const secretCfg = mergeSiteConfig({
    githubConfig: {
      ...MASTER_DEFAULT_CONFIG.githubConfig,
      fineGrainedToken: 'github_pat_MUST_NEVER_LEAK_TO_PUBLIC'
    },
    securityGate: {
      ...MASTER_DEFAULT_CONFIG.securityGate,
      primaryDownloadUrl: 'https://private-origin.example.com/signed.apk',
      turnstileSecretKey: '0x4AAAAAA_MUST_NEVER_LEAK'
    }
  });
  const bundle = compileStaticSiteBundle(secretCfg);
  for (const file of bundle.files) {
    assert.ok(!file.path.startsWith('admin'), `Unexpected admin file in bundle: ${file.path}`);
    assert.ok(!file.content.includes('github_pat_MUST_NEVER_LEAK_TO_PUBLIC'), `GitHub token leaked in ${file.path}`);
    assert.ok(!file.content.includes('0x4AAAAAA_MUST_NEVER_LEAK'), `Turnstile secret leaked in ${file.path}`);
    assert.ok(!file.content.includes('private-origin.example.com/signed.apk'), `Primary download URL leaked in ${file.path}`);
    assert.ok(!file.content.includes('firebase-app.js'), `Firebase SDK leaked in ${file.path}`);
    assert.ok(!file.content.includes('firebase-firestore.js'), `Firebase Firestore leaked in ${file.path}`);
  }
});

test('applyMultiModulePatch updates multiple modules atomically and preserves untouched secrets & modules', () => {
  const base = JSON.parse(JSON.stringify(EMPTY_ADMIN_CONFIG));
  base.brand.name = 'InitialBrand';
  base.githubConfig.fineGrainedToken = 'github_pat_KEEP_ATOMIC';
  base.securityGate.turnstileSecretKey = '0x4KEEP_TS';
  base.faqsSection = { enabled: true, heading: 'Existing FAQs', items: [] };

  const res = applyMultiModulePatch(
    base,
    {
      brand: { ...base.brand, name: 'UpdatedBrand', shortName: 'UB' },
      hero: { ...base.hero, h1: 'UpdatedBrand Hero Headline' }
    },
    EMPTY_ADMIN_CONFIG
  );

  assert.deepEqual(res.savedModules.sort(), ['brand', 'hero']);
  assert.equal(res.config.brand.name, 'UpdatedBrand');
  assert.equal(res.config.hero.h1, 'UpdatedBrand Hero Headline');
  assert.equal(res.config.githubConfig.fineGrainedToken, 'github_pat_KEEP_ATOMIC');
  assert.equal(res.config.securityGate.turnstileSecretKey, '0x4KEEP_TS');
  assert.equal(res.config.faqsSection.heading, 'Existing FAQs');
  assert.ok(res.dirtyModulesSinceSync.includes('brand'));
  assert.ok(res.dirtyModulesSinceSync.includes('hero'));
});

test('computeGitBlobSha1 & diffGitTrees match Git blob SHA-1, detect zero changes, and prune only orphaned CMS routes', () => {
  const sampleText = 'hello static cms\n';
  const expectedGitSha = createHash('sha1')
    .update(`blob ${Buffer.byteLength(sampleText, 'utf-8')}\0${sampleText}`, 'utf-8')
    .digest('hex');
  assert.equal(computeGitBlobSha1(sampleText, 'utf-8'), expectedGitSha);

  const b64Bytes = Buffer.from([1, 2, 3, 4, 5]);
  const expectedBinSha = createHash('sha1')
    .update(Buffer.concat([Buffer.from(`blob ${b64Bytes.length}\0`), b64Bytes]))
    .digest('hex');
  assert.equal(computeGitBlobSha1(b64Bytes.toString('base64'), 'base64'), expectedBinSha);

  const localFiles = [
    { path: 'index.html', content: '<html>v2</html>', description: 'Home', encoding: 'utf-8' as const },
    { path: 'news/index.html', content: '<html>news</html>', description: 'News Hub', encoding: 'utf-8' as const },
    { path: 'news/keep-post/index.html', content: '<html>keep</html>', description: 'Post', encoding: 'utf-8' as const },
    { path: 'privacy-policy/index.html', content: '<html>privacy</html>', description: 'Privacy', encoding: 'utf-8' as const },
    { path: 'static-routes/index.json', content: '{}', description: 'Home JSON', encoding: 'utf-8' as const },
    { path: 'static-routes/privacy-policy.json', content: '{}', description: 'Privacy JSON', encoding: 'utf-8' as const }
  ];

  // 1. Identical remote tree yields zero changes
  const identicalTree = localFiles.map((f) => ({
    path: `dist-public/${f.path}`,
    sha: computeGitBlobSha1(f.content, f.encoding),
    type: 'blob'
  }));
  const zeroDiff = diffGitTrees(localFiles, identicalTree, 'dist-public');
  assert.equal(zeroDiff.changedPaths.length, 0);
  assert.equal(zeroDiff.added.length, 0);
  assert.equal(zeroDiff.updated.length, 0);
  assert.equal(zeroDiff.deletedPaths.length, 0);
  assert.equal(zeroDiff.unchanged.length, localFiles.length);

  // 2. Modified, added, orphaned CMS routes vs protected custom repo files
  const staleTree = [
    { path: 'dist-public/index.html', sha: '0000000000000000000000000000000000000000', type: 'blob' },
    { path: 'dist-public/privacy-policy/index.html', sha: computeGitBlobSha1('<html>privacy</html>', 'utf-8'), type: 'blob' },
    { path: 'dist-public/static-routes/index.json', sha: computeGitBlobSha1('{}', 'utf-8'), type: 'blob' },
    // Orphaned CMS route & news article that should be pruned
    { path: 'dist-public/static-routes/old-removed-page.json', sha: '1111', type: 'blob' },
    { path: 'dist-public/old-removed-page/index.html', sha: '2222', type: 'blob' },
    { path: 'dist-public/news/deleted-post/index.html', sha: '3333', type: 'blob' },
    // Non-CMS repo files inside or outside targetDir MUST NOT be pruned
    { path: 'dist-public/README.md', sha: '4444', type: 'blob' },
    { path: 'dist-public/custom/handcrafted.html', sha: '5555', type: 'blob' },
    { path: 'dist-public/package.json', sha: '6666', type: 'blob' },
    { path: 'functions/api/config.js', sha: '7777', type: 'blob' }
  ];

  const diff = diffGitTrees(localFiles, staleTree, 'dist-public');
  assert.ok(diff.changedPaths.length > 0);
  assert.equal(diff.updated.length, 1);
  assert.equal(diff.updated[0].path, 'index.html');
  assert.equal(diff.added.length, 3); // news/index.html, news/keep-post/index.html, static-routes/privacy-policy.json
  assert.ok(diff.deletedPaths.includes('dist-public/static-routes/old-removed-page.json'));
  assert.ok(diff.deletedPaths.includes('dist-public/old-removed-page/index.html'));
  assert.ok(diff.deletedPaths.includes('dist-public/news/deleted-post/index.html'));
  assert.ok(!diff.deletedPaths.includes('dist-public/README.md'));
  assert.ok(!diff.deletedPaths.includes('dist-public/custom/handcrafted.html'));
  assert.ok(!diff.deletedPaths.includes('dist-public/package.json'));
  assert.ok(!diff.deletedPaths.includes('functions/api/config.js'));
});

test('compileStaticSiteBundle bundles public SVG/media assets and validates Google Analytics ID safely', () => {
  const validGaCfg = mergeSiteConfig({
    ...MASTER_DEFAULT_CONFIG,
    domainConfig: {
      ...MASTER_DEFAULT_CONFIG.domainConfig,
      googleAnalyticsId: 'G-TEST123456'
    }
  });
  const bundle = compileStaticSiteBundle(validGaCfg);
  const indexFile = bundle.files.find((f) => f.path === 'index.html');
  assert.ok(indexFile);
  assert.ok(indexFile.content.includes('https://www.googletagmanager.com/gtag/js?id=G-TEST123456'));
  assert.ok(bundle.files.some((f) => f.path === 'assets/app-icon.svg'));

  // Reject unsafe script injection in googleAnalyticsId
  const unsafeGaCfg = mergeSiteConfig({
    ...MASTER_DEFAULT_CONFIG,
    domainConfig: {
      ...MASTER_DEFAULT_CONFIG.domainConfig,
      googleAnalyticsId: 'G-123"><script>alert(1)</script>'
    }
  });
  const unsafeBundle = compileStaticSiteBundle(unsafeGaCfg);
  const unsafeIndex = unsafeBundle.files.find((f) => f.path === 'index.html');
  assert.ok(unsafeIndex);
  assert.ok(!unsafeIndex.content.includes('alert(1)'));
});

test('Edge static compiler and GitHub diff helpers stay in parity with Node engine', async () => {
  const edgeCompiler = await import('../../functions/_shared/static-compiler.js');
  const edgeGh = await import('../../functions/_shared/github.js');

  const cfg = mergeSiteConfig({
    ...MASTER_DEFAULT_CONFIG,
    domainConfig: {
      ...MASTER_DEFAULT_CONFIG.domainConfig,
      googleAnalyticsId: 'G-EDGE998877'
    }
  });
  const edgeFiles = edgeCompiler.compileEdgeStaticSiteBundle(cfg);
  assert.ok(Array.isArray(edgeFiles) && edgeFiles.length >= 12);
  const edgeIndex = edgeFiles.find((f: any) => f.path === 'index.html');
  assert.ok(edgeIndex);
  assert.ok(edgeIndex.content.includes('G-EDGE998877'));
  assert.ok(!edgeIndex.content.includes('firebase-app.js'));
  assert.ok(edgeFiles.some((f: any) => f.path === 'sitemap.xml'));
  assert.ok(edgeFiles.some((f: any) => f.path === 'robots.txt'));
  assert.ok(edgeFiles.some((f: any) => f.path === 'manifest.webmanifest'));

  const edgeSha = await edgeGh.computeGitBlobSha1Edge('hello edge\n', 'utf-8');
  assert.equal(edgeSha, computeGitBlobSha1('hello edge\n', 'utf-8'));

  const edgeTree = edgeFiles.map((f: any) => ({
    path: `dist-public/${f.path}`,
    sha: edgeSha,
    type: 'blob'
  }));
  // Mismatched SHAs mean updates
  const edgeDiff = await edgeGh.diffEdgeGitTrees(edgeFiles, edgeTree, 'dist-public');
  assert.ok(edgeDiff.changedPaths.length > 0);
});

test('Admin UI, client Firebase module, and server contain zero starter-template demo endpoints', () => {
  const filesToCheck = ['admin.html', 'admin.js', 'firebase-config.js', 'server.ts'];
  for (const rel of filesToCheck) {
    const content = fs.readFileSync(path.join(process.cwd(), rel), 'utf-8');
    assert.ok(!content.includes('starter-template'), `Unexpected starter-template reference in ${rel}`);
    assert.ok(!content.includes('loadStarterTemplate'), `Unexpected loadStarterTemplate reference in ${rel}`);
  }
});

test('Raw /admin.html contains zero internal workspace markup and zero environment variable names while authenticated workspace shell provides full DOM', async () => {
  const rawAdminHtml = fs.readFileSync(path.join(process.cwd(), 'admin.html'), 'utf-8');
  assert.ok(rawAdminHtml.includes('id="auth-overlay"'));
  assert.ok(rawAdminHtml.includes('<div id="cms-shell" class="cms-shell" hidden></div>'));
  assert.ok(!rawAdminHtml.includes('id="panel-overview"'));
  assert.ok(!rawAdminHtml.includes('id="panel-domain"'));
  assert.ok(!rawAdminHtml.includes('ADMIN_EMAIL'));
  assert.ok(!rawAdminHtml.includes('ADMIN_PASSWORD'));
  assert.ok(!rawAdminHtml.includes('ADMIN_API_KEY'));
  assert.ok(!rawAdminHtml.includes('ADMIN_SESSION_SECRET'));
  assert.ok(!rawAdminHtml.includes('FIREBASE_API_KEY'));

  const { getAdminWorkspaceShellHtml } = await import('./admin-workspace-html');
  const workspaceHtml = getAdminWorkspaceShellHtml();
  assert.ok(workspaceHtml.includes('id="panel-overview"'));
  assert.ok(workspaceHtml.includes('id="panel-domain"'));
  assert.ok(workspaceHtml.includes('id="btn-clear-sync-logs"'));
  assert.ok(workspaceHtml.includes('id="btn-quick-add-news"'));
  assert.ok(workspaceHtml.includes('class="mobile-quick-tabs"'));
});

test('sanitizeFirebaseConfigForClient strips apiKey and sets hasEnvApiKey boolean flag, and appendSyncLogEntry preserves diff counts', async () => {
  const { sanitizeFirebaseConfigForClient } = await import('./cms-engine');
  const sanitizedFb = sanitizeFirebaseConfigForClient({
    apiKey: 'AIzaSySecretEnvKey1234567890',
    projectId: 'live-prod-cms',
    authDomain: 'live-prod-cms.firebaseapp.com',
    databaseId: '(default)'
  });
  assert.ok(sanitizedFb);
  assert.equal(sanitizedFb.apiKey, '');
  assert.equal(sanitizedFb.projectId, 'live-prod-cms');
  assert.equal(sanitizedFb.hasEnvApiKey, true);

  const withDiff = appendSyncLogEntry(EMPTY_ADMIN_CONFIG, {
    trigger: 'manual-push',
    status: 'success',
    modulesChanged: ['newsSection'],
    filesCount: 3,
    addedCount: 1,
    updatedCount: 2,
    deletedCount: 0,
    unchangedCount: 14,
    skipped: false,
    changedPaths: ['index.html', 'news/index.html', 'news/new-post/index.html'],
    branch: 'main',
    repo: 'acme/portal',
    durationMs: 310,
    steps: ['Step 1: Compiled 17 files', 'Step 2: Pushed 3 changed blobs'],
    message: 'Synced 3 changed files (+1 added, ~2 updated, =14 unchanged)'
  });
  const latestLog = withDiff.syncLogs?.[0];
  assert.ok(latestLog);
  assert.equal(latestLog.addedCount, 1);
  assert.equal(latestLog.updatedCount, 2);
  assert.equal(latestLog.deletedCount, 0);
  assert.equal(latestLog.unchangedCount, 14);
  assert.equal(latestLog.steps?.length, 2);

  // Verify on-disk site-config.json has zero static demo content
  const diskConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'site-config.json'), 'utf-8'));
  assert.equal(diskConfig.brand.name, '');
  assert.equal(diskConfig.sections.length, 0);
  assert.equal(diskConfig.newsSection.articles.length, 0);
  assert.equal(diskConfig.faqsSection.items.length, 0);
  assert.equal(diskConfig.pages.length, 0);
});

test('Master clone isolation: empty EMPTY_ADMIN_CONFIG compiled against real index.html contains zero dummy/admin copy, sets noindex, and omits unreferenced demo assets', async () => {
  const realIndexHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf-8');
  const realMoreinfoHtml = fs.readFileSync(path.join(process.cwd(), 'moreinfo.html'), 'utf-8');
  const emptyBundle = compileStaticSiteBundle(EMPTY_ADMIN_CONFIG, realIndexHtml, {
    moreinfoHtmlTemplate: realMoreinfoHtml
  });

  const homeHtml = emptyBundle.files.find((f) => f.path === 'index.html')?.content || '';
  assert.ok(homeHtml.length > 0);
  assert.ok(homeHtml.includes('<meta name="robots" content="noindex, nofollow" />'));
  assert.ok(homeHtml.includes('class="site-coming-soon"'));
  for (const forbidden of ['Admin Studio', 'ready to publish', 'ApexMobile', 'Official Portal', 'support@your-domain.com', 'app-icon.svg', 'hero-banner.svg']) {
    assert.ok(!homeHtml.includes(forbidden), `Forbidden dummy/admin string "${forbidden}" leaked into empty public index.html`);
  }

  // Must not bundle unreferenced demo SVGs when config does not reference them
  assert.ok(!emptyBundle.files.some((f) => f.path === 'assets/app-icon.svg'));
  assert.ok(!emptyBundle.files.some((f) => f.path === 'assets/hero-banner.svg'));

  // Manifest on empty config has zero dummy name or icon URLs
  const emptyManifestFile = emptyBundle.files.find((f) => f.path === 'manifest.webmanifest');
  assert.ok(emptyManifestFile);
  const emptyManifest = JSON.parse(emptyManifestFile.content);
  assert.deepEqual(emptyManifest.icons, []);
  assert.ok(!JSON.stringify(emptyManifest).includes('Official Portal'));
  assert.ok(!JSON.stringify(emptyManifest).includes('app-icon.svg'));

  // Moreinfo HTML on empty config must also contain zero ApexMobile / dummy specs
  const emptyMoreinfo = emptyBundle.files.find((f) => f.path === 'moreinfo.html')?.content || '';
  assert.ok(!emptyMoreinfo.includes('ApexMobile'));
  assert.ok(!emptyMoreinfo.includes('app-icon.svg'));

  // Edge compiler stays in strict parity on EMPTY_ADMIN_CONFIG
  const edgeCompiler = await import('../../functions/_shared/static-compiler.js');
  const edgeEmptyFiles = edgeCompiler.compileEdgeStaticSiteBundle(EMPTY_ADMIN_CONFIG);
  const edgeHome = edgeEmptyFiles.find((f: any) => f.path === 'index.html')?.content || '';
  assert.ok(edgeHome.includes('noindex, nofollow'));
  assert.ok(!edgeHome.includes('Official Portal'));
  assert.ok(!edgeHome.includes('app-icon.svg'));
  const edgeManifest = JSON.parse(edgeEmptyFiles.find((f: any) => f.path === 'manifest.webmanifest')?.content || '{}');
  assert.deepEqual(edgeManifest.icons, []);
});

test('Real index.html SSR injects configured content cleanly, unhides email/logo/CTAs when configured, and emits complete webmanifest icons', () => {
  const realIndexHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf-8');
  const customCfg = mergeSiteConfig({
    brand: {
      name: 'KestrelEdge',
      shortName: 'Kestrel',
      tagline: 'Edge Utility Suite',
      logoUrl: 'https://cdn.example.org/kestrel-logo.png',
      faviconUrl: 'https://cdn.example.org/kestrel-favicon.png',
      searchLogoUrl: 'https://cdn.example.org/kestrel-512.png',
      appleTouchIconUrl: 'https://cdn.example.org/kestrel-180.png',
      contactEmail: 'hello@kestreledge.example',
      accentColor: '#2563EB',
      themeColor: '#2563EB'
    },
    hero: {
      h1: 'KestrelEdge v2.0 Stable',
      secondaryCta: { label: 'Read Docs', url: '#overview', relSponsored: false },
      primaryCta: { label: 'Get Package', url: '/moreinfo', relSponsored: false },
      introHtml: '<p>Verified static distribution for KestrelEdge.</p>',
      showBanner: false
    },
    navigation: {
      footerBrandSummary: 'Official KestrelEdge release hub.',
      showFooterBrandSummary: true,
      showFooterContactEmail: true
    },
    sections: [
      {
        id: 'sec-overview',
        heading: 'Core Architecture',
        slug: 'overview',
        visible: true,
        badgeText: 'Overview',
        htmlContent: '<p>Built for pure static edge speed.</p>'
      }
    ]
  }, EMPTY_ADMIN_CONFIG);

  const rendered = renderCompleteStaticPageHtml(realIndexHtml, customCfg, '/');
  assert.ok(rendered.includes('<meta name="robots" content="index, follow" />'));
  assert.ok(rendered.includes('<title>KestrelEdge — KestrelEdge v2.0 Stable</title>') || rendered.includes('KestrelEdge'));
  assert.ok(rendered.includes('src="https://cdn.example.org/kestrel-logo.png"'));
  assert.ok(rendered.includes('href="mailto:hello@kestreledge.example"'));
  assert.ok(!rendered.includes('id="footer-contact-email-link" class="footer-contact-pill hidden"'));
  assert.ok(rendered.includes('Core Architecture'));
  assert.ok(rendered.includes('Read Docs'));
  assert.ok(rendered.includes('Get Package'));

  const manifest = JSON.parse(generateWebManifestJson(customCfg));
  assert.equal(manifest.name, 'KestrelEdge — Edge Utility Suite');
  assert.equal(manifest.short_name, 'Kestrel');
  assert.ok(manifest.icons.length >= 2);
  assert.ok(manifest.icons.some((ic: any) => ic.src === 'https://cdn.example.org/kestrel-512.png'));
});

test('Admin workspace shell exposes all 12 dedicated panels, visual color dots without visible hex text inputs, and matches Edge shell byte-for-byte', async () => {
  const { getAdminWorkspaceShellHtml } = await import('./admin-workspace-html');
  const edgeWorkspaceHtml = await import('../../functions/_shared/admin-workspace-html.js');
  const html = getAdminWorkspaceShellHtml();

  assert.equal(html, edgeWorkspaceHtml.getAdminWorkspaceShellHtml());

  const expectedPanels = [
    'panel-overview',
    'panel-brand',
    'panel-hero',
    'panel-specs',
    'panel-sections',
    'panel-news',
    'panel-faqs',
    'panel-pages',
    'panel-security',
    'panel-links',
    'panel-domain',
    'panel-deploy'
  ];
  for (const panelId of expectedPanels) {
    assert.ok(html.includes(`id="${panelId}"`), `Missing workspace panel ${panelId}`);
  }

  assert.ok(html.includes('id="btn-toggle-custom-colors"'));
  assert.ok(html.includes('id="ui-custom-colors-panel"'));
  assert.ok(html.includes('data-color-choice-for="brand-color"'));

  const colorFieldIds = [
    'qc-accent-color',
    'brand-color',
    'brand-theme-color',
    'ui-bg-page',
    'ui-bg-surface',
    'ui-header-bg',
    'ui-header-text',
    'ui-footer-bg',
    'ui-footer-text',
    'ui-border-color',
    'ui-text-color',
    'ui-heading-color',
    'ui-btn-text-color'
  ];
  for (const fieldId of colorFieldIds) {
    assert.ok(
      html.includes(`type="hidden" id="${fieldId}"`),
      `Color field "${fieldId}" must use hidden backing input instead of visible hex text input`
    );
    assert.ok(
      !html.includes(`type="text" id="${fieldId}"`),
      `Visible type="text" hex input must not exist for "${fieldId}"`
    );
    assert.ok(
      html.includes(`data-color-sync="${fieldId}"`),
      `Missing native color picker sync control for "${fieldId}"`
    );
  }
});

test('Edge /api/config handler fails closed with 503 when Firebase env is missing and batches cmsModules writes when configured', async () => {
  const edgeConfig = await import('../../functions/api/config.js');
  const edgeAuth = await import('../../functions/_shared/auth.js');
  const edgeLogin = await import('../../functions/api/admin/login.js');

  const unconfiguredEnv = {
    CF_PAGES: '1',
    ADMIN_EMAIL: 'owner@test.example',
    ADMIN_PASSWORD: 'StrongPassword#2026'
  };

  // Sign in to obtain valid admin session cookie
  const loginRes = await edgeLogin.onRequestPost({
    request: new Request('https://cms.test.example/api/admin/login', {
      method: 'POST',
      headers: {
        host: 'cms.test.example',
        origin: 'https://cms.test.example',
        'content-type': 'application/json',
        'x-admin-csrf': '1'
      },
      body: JSON.stringify({ email: 'owner@test.example', password: 'StrongPassword#2026' })
    }),
    env: unconfiguredEnv
  });
  assert.equal(loginRes.status, 200);
  const cookiePair = (loginRes.headers.get('set-cookie') || '').split(';')[0];

  // PATCH without Firebase env vars must fail closed with 503
  const failClosedPatch = await edgeConfig.onRequestPatch({
    request: new Request('https://cms.test.example/api/config', {
      method: 'PATCH',
      headers: {
        host: 'cms.test.example',
        origin: 'https://cms.test.example',
        cookie: cookiePair,
        'content-type': 'application/json',
        'x-admin-csrf': '1'
      },
      body: JSON.stringify({ moduleKey: 'brand', data: { ...EMPTY_ADMIN_CONFIG.brand, name: 'DemoBrand' } })
    }),
    env: unconfiguredEnv
  });
  assert.equal(failClosedPatch.status, 503);
  const failBody = await failClosedPatch.json();
  assert.equal(failBody.success, false);
  assert.equal(failBody.firestoreSaved, false);

  // writeSiteConfigToFirestoreRest syncs both siteConfig/main and cmsModules/* batch commit
  const fetchCalls: Array<{ url: string; method: string; body: string }> = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({
      url: String(input),
      method: String(init?.method || 'GET'),
      body: String(init?.body || '')
    });
    return new Response(JSON.stringify({ writeResults: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }) as typeof fetch;

  try {
    const fbCfg = { projectId: 'real-prod-proj', apiKey: 'AIzaRealKey1234567890', databaseId: '(default)' };
    const writeRes = await edgeAuth.writeSiteConfigToFirestoreRest(fbCfg, {
      ...EMPTY_ADMIN_CONFIG,
      brand: { ...EMPTY_ADMIN_CONFIG.brand, name: 'SyncedBrand' }
    });
    assert.equal(writeRes.ok, true);
    assert.ok(fetchCalls.some((c) => c.url.includes('/documents/siteConfig/main')));
    const commitCall = fetchCalls.find((c) => c.url.includes('/documents:commit'));
    assert.ok(commitCall, 'Expected Firestore documents:commit batch write');
    assert.ok(commitCall.body.includes('/cmsModules/brand'));
    assert.ok(commitCall.body.includes('/cmsModules/securityGate'));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('Edge catch-all router fails closed on Firestore read errors, persists syncLogs atomically on module saves, and handles masked API keys in /api/firebase/test', async () => {
  const edgeCatchall = await import('../../functions/api/[[catchall]].js');
  const edgeLogin = await import('../../functions/api/admin/login.js');
  const edgeGithub = await import('../../functions/_shared/github.js');
  const { verifyGitHubRepoAccess } = await import('./github-publisher.js');

  const configuredEnv = {
    CF_PAGES: '1',
    ADMIN_EMAIL: 'owner@test.example',
    ADMIN_PASSWORD: 'StrongPassword#2026',
    FIREBASE_API_KEY: 'AIzaRealServerEnvKey999999999',
    FIREBASE_PROJECT_ID: 'live-prod-cms'
  };

  const loginRes = await edgeLogin.onRequestPost({
    request: new Request('https://cms.test.example/api/admin/login', {
      method: 'POST',
      headers: {
        host: 'cms.test.example',
        origin: 'https://cms.test.example',
        'content-type': 'application/json',
        'x-admin-csrf': '1'
      },
      body: JSON.stringify({ email: 'owner@test.example', password: 'StrongPassword#2026' })
    }),
    env: configuredEnv
  });
  assert.equal(loginRes.status, 200);
  const cookiePair = (loginRes.headers.get('set-cookie') || '').split(';')[0];

  const origFetch = globalThis.fetch;
  try {
    // 1. Simulate Firestore 403 PERMISSION_DENIED on cmsModules while siteConfig/main is 404:
    // PATCH /api/config/module MUST return 502 and NEVER overwrite Firestore with EMPTY_ADMIN_CONFIG!
    let commitCalledOnReadError = false;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/documents:commit')) {
        commitCalledOnReadError = true;
      }
      if (url.includes('/documents/siteConfig/main')) {
        return new Response(JSON.stringify({ error: { code: 404, message: 'Not found' } }), { status: 404 });
      }
      return new Response(
        JSON.stringify({ error: { code: 403, status: 'PERMISSION_DENIED', message: 'Missing permissions' } }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    const failReadRes = await edgeCatchall.onRequest({
      request: new Request('https://cms.test.example/api/config/module', {
        method: 'PATCH',
        headers: {
          host: 'cms.test.example',
          origin: 'https://cms.test.example',
          cookie: cookiePair,
          'content-type': 'application/json',
          'x-admin-csrf': '1'
        },
        body: JSON.stringify({ moduleKey: 'brand', data: { ...EMPTY_ADMIN_CONFIG.brand, name: 'SafeBrand' } })
      }),
      env: configuredEnv,
      params: { catchall: ['config', 'module'] }
    });
    assert.equal(failReadRes.status, 502);
    assert.equal(commitCalledOnReadError, false, 'Must not commit to Firestore when pre-save read fails');

    // 2. Simulate healthy Firestore (404 empty initially, 200 on commit):
    // PATCH /api/config/module must atomically commit brand + syncLogs + githubConfig in 1 batch request
    const commitPayloads: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/documents:commit')) {
        commitPayloads.push(String(init?.body || ''));
        return new Response(JSON.stringify({ writeResults: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ error: { code: 404, message: 'Not found' } }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }) as typeof fetch;

    const okPatchRes = await edgeCatchall.onRequest({
      request: new Request('https://cms.test.example/api/config/module', {
        method: 'PATCH',
        headers: {
          host: 'cms.test.example',
          origin: 'https://cms.test.example',
          cookie: cookiePair,
          'content-type': 'application/json',
          'x-admin-csrf': '1'
        },
        body: JSON.stringify({ moduleKey: 'brand', data: { ...EMPTY_ADMIN_CONFIG.brand, name: 'AtomicBrand' } })
      }),
      env: configuredEnv,
      params: { catchall: ['config', 'module'] }
    });
    assert.equal(okPatchRes.status, 200);
    const okPatchJson = await okPatchRes.json();
    assert.equal(okPatchJson.success, true);
    assert.equal(okPatchJson.firestoreSaved, true);
    assert.equal(okPatchJson.config.brand.name, 'AtomicBrand');
    assert.equal(okPatchJson.config.syncLogs.length, 1);
    assert.equal(okPatchJson.config.syncLogs[0].trigger, 'firebase-save');
    assert.equal(commitPayloads.length, 1, 'Expected exactly 1 atomic Firestore commit');
    assert.ok(commitPayloads[0].includes('/cmsModules/brand'));
    assert.ok(commitPayloads[0].includes('/cmsModules/syncLogs'));
    assert.ok(commitPayloads[0].includes('/cmsModules/githubConfig'));

    // 3. POST /api/firebase/test with masked '__SECRET_CONFIGURED__' apiKey falls back to server env key
    let testedFirestoreUrl = '';
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      testedFirestoreUrl = String(input);
      return new Response(JSON.stringify({ fields: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }) as typeof fetch;

    const fbTestRes = await edgeCatchall.onRequest({
      request: new Request('https://cms.test.example/api/firebase/test', {
        method: 'POST',
        headers: {
          host: 'cms.test.example',
          origin: 'https://cms.test.example',
          cookie: cookiePair,
          'content-type': 'application/json',
          'x-admin-csrf': '1'
        },
        body: JSON.stringify({
          firebaseConfig: {
            apiKey: '__SECRET_CONFIGURED__',
            projectId: 'live-prod-cms'
          }
        })
      }),
      env: configuredEnv,
      params: { catchall: ['firebase', 'test'] }
    });
    assert.equal(fbTestRes.status, 200);
    assert.ok(
      testedFirestoreUrl.includes('key=AIzaRealServerEnvKey999999999'),
      'Must substitute server env key instead of sending __SECRET_CONFIGURED__'
    );

    // 4. Verify GitHub repo access normalized schema on both Node and Edge
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          full_name: 'acme/public-site',
          default_branch: 'main',
          private: true,
          size: 12,
          permissions: { push: true, admin: false }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    const nodeVerify = await verifyGitHubRepoAccess({
      repoOwner: 'acme',
      repoName: 'public-site',
      branch: 'main',
      fineGrainedToken: 'github_pat_test123'
    });
    const edgeVerify = await edgeGithub.verifyGitHubRepoAccessEdge({
      repoOwner: 'acme',
      repoName: 'public-site',
      branch: 'main',
      fineGrainedToken: 'github_pat_test123'
    });
    for (const v of [nodeVerify, edgeVerify] as any[]) {
      assert.equal(v.success, true);
      assert.equal(v.ok, true);
      assert.equal(v.fullName, 'acme/public-site');
      assert.equal(v.repoFullName, 'acme/public-site');
      assert.equal(v.private, true);
      assert.equal(v.privateRepo, true);
      assert.equal(v.canPush, true);
    }

    // 5. Verify Firestore AES-256-GCM secret encryption at rest & Step 1 (batch save) -> Step 2 (GitHub publish)
    const firestoreDocs = new Map<string, any>();
    let capturedGithubAuthHeader = '';

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method || 'GET').toUpperCase();

      if (url.includes('firestore.googleapis.com') && url.includes('/documents:commit')) {
        const bodyObj = JSON.parse(String(init?.body || '{}'));
        for (const w of bodyObj.writes || []) {
          if (w.update?.name && w.update?.fields) {
            const docKey = String(w.update.name).split('/documents/')[1];
            firestoreDocs.set(docKey, { name: w.update.name, fields: w.update.fields });
          }
        }
        return new Response(JSON.stringify({ writeResults: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (url.includes('firestore.googleapis.com') && url.includes('/documents/cmsModules')) {
        const docs = Array.from(firestoreDocs.entries())
          .filter(([k]) => k.startsWith('cmsModules/'))
          .map(([, v]) => v);
        return new Response(JSON.stringify({ documents: docs }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (url.includes('firestore.googleapis.com') && url.includes('/documents/siteConfig/main')) {
        const mainDoc = firestoreDocs.get('siteConfig/main');
        if (!mainDoc) {
          return new Response(JSON.stringify({ error: { code: 404, message: 'Not found' } }), { status: 404 });
        }
        return new Response(JSON.stringify(mainDoc), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (url.includes('api.github.com/repos/acme/daman-portal')) {
        const headersObj = new Headers(init?.headers);
        capturedGithubAuthHeader = headersObj.get('Authorization') || '';
        if (url.endsWith('/git/ref/heads/main')) {
          return new Response(JSON.stringify({ object: { sha: '1111111111111111111111111111111111111111' } }), { status: 200 });
        }
        if (url.includes('/git/commits/1111111111111111111111111111111111111111')) {
          return new Response(JSON.stringify({ tree: { sha: '2222222222222222222222222222222222222222' } }), { status: 200 });
        }
        if (url.includes('/git/trees/2222222222222222222222222222222222222222')) {
          return new Response(JSON.stringify({ tree: [], truncated: false }), { status: 200 });
        }
        if (url.endsWith('/git/trees') && method === 'POST') {
          return new Response(JSON.stringify({ sha: '3333333333333333333333333333333333333333' }), { status: 201 });
        }
        if (url.endsWith('/git/commits') && method === 'POST') {
          return new Response(JSON.stringify({ sha: '4444444444444444444444444444444444444444' }), { status: 201 });
        }
        if (url.endsWith('/git/refs/heads/main') && method === 'PATCH') {
          return new Response(JSON.stringify({ object: { sha: '4444444444444444444444444444444444444444' } }), { status: 200 });
        }
      }

      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch;

    // Step 1: Batch-save githubConfig with a Fine-Grained Token via PATCH /api/config/modules
    const step1Res = await edgeCatchall.onRequest({
      request: new Request('https://cms.test.example/api/config/modules', {
        method: 'PATCH',
        headers: {
          host: 'cms.test.example',
          origin: 'https://cms.test.example',
          cookie: cookiePair,
          'content-type': 'application/json',
          'x-admin-csrf': '1'
        },
        body: JSON.stringify({
          modules: {
            brand: { ...EMPTY_ADMIN_CONFIG.brand, name: 'Daman Game' },
            githubConfig: {
              ...EMPTY_ADMIN_CONFIG.githubConfig,
              repoOwner: 'acme',
              repoName: 'daman-portal',
              branch: 'main',
              targetDirectory: 'dist-public',
              fineGrainedToken: 'github_pat_LIVE_SECRET_TOKEN_999'
            }
          }
        })
      }),
      env: configuredEnv,
      params: { catchall: ['config', 'modules'] }
    });
    assert.equal(step1Res.status, 200);
    const step1Data = await step1Res.json();
    assert.equal(step1Data.success, true);
    assert.equal(step1Data.config.githubConfig.fineGrainedToken, '', 'Client response must mask token');
    assert.equal(step1Data.config.githubConfig.hasFineGrainedToken, true);

    // Confirm Firestore stored AES-256-GCM ciphertext (`v2.*`), NOT plaintext or empty string!
    const rawStoredGhDoc = JSON.stringify(firestoreDocs.get('cmsModules/githubConfig') || {});
    assert.ok(!rawStoredGhDoc.includes('github_pat_LIVE_SECRET_TOKEN_999'), 'Plaintext token must not be stored in Firestore');
    assert.ok(rawStoredGhDoc.includes('v2.'), 'Token must be encrypted with AES-256-GCM (v2.*) in Firestore');

    // Step 2: Call POST /api/github/publish WITH masked/empty client token — server must decrypt token from Firestore and push!
    const step2Res = await edgeCatchall.onRequest({
      request: new Request('https://cms.test.example/api/github/publish', {
        method: 'POST',
        headers: {
          host: 'cms.test.example',
          origin: 'https://cms.test.example',
          cookie: cookiePair,
          'content-type': 'application/json',
          'x-admin-csrf': '1'
        },
        body: JSON.stringify({
          config: step1Data.config,
          githubConfig: step1Data.config.githubConfig,
          modulesChanged: ['brand', 'githubConfig']
        })
      }),
      env: configuredEnv,
      params: { catchall: ['github', 'publish'] }
    });
    assert.equal(step2Res.status, 200);
    const step2Data = await step2Res.json();
    assert.equal(step2Data.success, true, `Expected GitHub publish to succeed, got: ${step2Data.error || step2Data.message}`);
    assert.equal(capturedGithubAuthHeader, 'Bearer github_pat_LIVE_SECRET_TOKEN_999');
    assert.equal(step2Data.commitSha, '4444444444444444444444444444444444444444');
    assert.equal(step2Data.config.dirtyModulesSinceSync.length, 0);
    assert.equal(step2Data.config.githubConfig.hasFineGrainedToken, true);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('Image optimization helpers generate responsive URLs, srcsets, and proportional dimensions', () => {
  const cloudBanner = 'https://res.cloudinary.com/demo/image/upload/v123/hero.png';
  assert.equal(
    optimizeImageUrl(cloudBanner, 768),
    'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_768,c_limit/v123/hero.png'
  );
  const srcSet = buildResponsiveImageSrcSet(cloudBanner, [480, 768]);
  assert.ok(srcSet.includes('w_480,c_limit/v123/hero.png 480w'));
  assert.ok(srcSet.includes('w_768,c_limit/v123/hero.png 768w'));

  // SVG, local uploads, and data URLs must remain untouched
  assert.equal(optimizeImageUrl('/assets/logo.svg', 768), '/assets/logo.svg');
  assert.equal(buildResponsiveImageSrcSet('/uploads/photo.webp'), '');
  assert.equal(optimizeImageUrl('data:image/webp;base64,AAAA', 400), 'data:image/webp;base64,AAAA');

  // ImageKit, Unsplash, and Imgix CDNs get width/format query optimization
  assert.ok(
    decodeURIComponent(optimizeImageUrl('https://ik.imagekit.io/demo/cover.jpg', 768)).includes(
      'tr=f-auto,q-82,w-768'
    )
  );
  assert.ok(
    optimizeImageUrl('https://images.unsplash.com/photo-123?auto=format', 480).includes('w=480')
  );

  // Proportional downscale without upscaling small images
  const scaled = calculateTargetImageDimensions(2800, 1575, 1400, 1400);
  assert.deepEqual(scaled, { width: 1400, height: 788, resized: true });
  const unscaled = calculateTargetImageDimensions(400, 300, 1400, 1400);
  assert.deepEqual(unscaled, { width: 400, height: 300, resized: false });
});

test('renderCompleteStaticPageHtml emits compact idempotent bootstrap and strict LCP vs lazy image attributes', () => {
  const cfg = mergeSiteConfig({
    brand: { name: 'SpeedPortal', accentColor: '#EF4444' },
    hero: {
      h1: 'SpeedPortal Official',
      showBanner: true,
      bannerImageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/hero-banner.png',
      bannerAlt: 'SpeedPortal Hero'
    },
    sections: [
      {
        id: 'sec-1',
        heading: 'Features Overview',
        slug: 'features-overview',
        visible: true,
        imageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/sec-photo.png',
        imagePosition: 'top',
        htmlContent: '<p>Fast feature copy.</p>'
      }
    ],
    newsSection: {
      articles: [
        {
          id: 'n1',
          title: 'Latest Release v2',
          slug: 'latest-release-v2',
          coverImageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/news-thumb.png',
          summary: 'Summary copy',
          htmlContent: '<p>Full news story.</p>'
        }
      ]
    }
  });

  const baseTpl = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
  const renderedHome = renderCompleteStaticPageHtml(baseTpl, cfg, '/');

  // Strict LCP hero vs lazy below-the-fold images
  assert.ok(renderedHome.includes('hero-banner.png"'));
  assert.ok(renderedHome.includes('loading="eager" fetchpriority="high" decoding="async"'));
  assert.ok(renderedHome.includes('loading="lazy" fetchpriority="low" decoding="async"'));

  // Bootstrap placed cleanly before </body>, not blocking <head>, with empty renderedMainHtml
  const headSection = renderedHome.split('</head>')[0];
  assert.ok(!headSection.includes('window.__INITIAL_ROUTE_PAYLOAD__'), 'Head must not contain bloated initial payload script');
  const bodyBootstrapMatch = renderedHome.match(/<script>window\.__INITIAL_ROUTE_PAYLOAD__=([\s\S]*?);<\/script>\s*<\/body>/);
  assert.ok(bodyBootstrapMatch, 'Expected compact bootstrap script before </body>');
  const parsedBootstrap = JSON.parse(bodyBootstrapMatch![1].replace(/<\\\//g, '</'));
  assert.equal(parsedBootstrap.canonicalPath, '/');
  assert.equal(parsedBootstrap.renderedMainHtml, '');

  // Re-rendering an already compiled HTML template must stay idempotent
  const reRenderedHome = renderCompleteStaticPageHtml(renderedHome, cfg, '/');
  assert.equal(
    (reRenderedHome.match(/window\.__INITIAL_ROUTE_PAYLOAD__=/g) || []).length,
    1,
    'Re-compiling template must not duplicate bootstrap scripts'
  );
  assert.equal(
    (reRenderedHome.match(/rel="manifest"/g) || []).length,
    1,
    'Re-compiling template must not duplicate manifest link tags'
  );

  // Non-home route clears Hero CTAs and isolates route DOM
  const renderedNews = renderCompleteStaticPageHtml(baseTpl, cfg, '/news');
  assert.ok(!renderedNews.includes('id="features-overview"'), '/news must not load homepage sections');
  assert.ok(renderedNews.includes('id="hero-cta-primary" class="btn-primary hidden" href="#"'));

  // Zero Admin Studio contamination on public HTML
  assert.ok(!renderedHome.includes('admin.js'));
  assert.ok(!renderedHome.includes('firebase-config.js'));
});

test('mergeSiteConfig migrates legacy newsSection.posts fields into canonical articles', () => {
  const migrated = mergeSiteConfig({
    newsSection: {
      heading: 'Updates',
      posts: [
        {
          id: 'legacy-1',
          title: 'Legacy Post Title',
          slug: 'legacy-post-title',
          excerpt: 'Short legacy excerpt',
          imageUrl: '/uploads/legacy-cover.webp',
          bodyHtml: '<p>Legacy article HTML</p>'
        }
      ]
    }
  });
  assert.equal(migrated.newsSection.articles.length, 1);
  assert.equal(migrated.newsSection.articles[0].summary, 'Short legacy excerpt');
  assert.equal(migrated.newsSection.articles[0].coverImageUrl, '/uploads/legacy-cover.webp');
  assert.equal(migrated.newsSection.articles[0].htmlContent, '<p>Legacy article HTML</p>');
});

test('Cloudflare Edge /api/route & _middleware dynamic fallbacks resolve per-URL routes cleanly from Firestore', async () => {
  const edgeCatchall = await import('../../functions/api/[[catchall]].js');
  const edgeMiddleware = await import('../../functions/_middleware.js');
  const origFetch = globalThis.fetch;

  const liveCfg = mergeSiteConfig({
    brand: { name: 'EdgePortal', accentColor: '#2563EB' },
    hero: { h1: 'EdgePortal Home' },
    newsSection: {
      articles: [
        {
          id: 'art-edge-1',
          title: 'Launch Announcement',
          slug: 'launch-announcement',
          summary: 'Release summary',
          htmlContent: '<p>Edge article body</p>'
        }
      ]
    },
    pages: [
      {
        id: 'pg-privacy',
        label: 'Privacy Policy',
        slug: 'privacy-policy',
        h1: 'Privacy Policy',
        htmlContent: '<p>Privacy terms here.</p>'
      }
    ]
  });

  const encodeFs = (val: any): any => {
    if (val === null || val === undefined) return { nullValue: null };
    if (typeof val === 'string') return { stringValue: val };
    if (typeof val === 'boolean') return { booleanValue: val };
    if (typeof val === 'number') return { integerValue: String(Math.floor(val)) };
    if (Array.isArray(val)) return { arrayValue: { values: val.map(encodeFs) } };
    if (typeof val === 'object') {
      const fields: Record<string, any> = {};
      for (const [k, v] of Object.entries(val)) {
        if (v !== undefined) fields[k] = encodeFs(v);
      }
      return { mapValue: { fields } };
    }
    return { stringValue: String(val) };
  };

  const firestoreModules: Record<string, any> = {
    brand: liveCfg.brand,
    hero: liveCfg.hero,
    newsSection: liveCfg.newsSection,
    pages: liveCfg.pages,
    domainConfig: liveCfg.domainConfig,
    seo: liveCfg.seo,
    uiConfig: liveCfg.uiConfig
  };

  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/documents/cmsModules')) {
        const docs = Object.entries(firestoreModules).map(([id, val]) => ({
          name: `projects/test-proj/databases/(default)/documents/cmsModules/${id}`,
          fields: {
            data: encodeFs(val)
          }
        }));
        return new Response(JSON.stringify({ documents: docs }), { status: 200 });
      }
      if (url.includes('/documents/siteConfig/main')) {
        return new Response(JSON.stringify({ fields: { updatedAt: { integerValue: '1762265000000' } } }), {
          status: 200
        });
      }
      return new Response('{}', { status: 404 });
    }) as typeof fetch;

    const env = {
      FIREBASE_API_KEY: 'AIzaTestFirebaseKey1234567890',
      FIREBASE_PROJECT_ID: 'test-proj'
    };

    // 1. Direct GET /api/route?path=/news/launch-announcement
    const apiRouteRes = await edgeCatchall.onRequest({
      request: new Request('https://edgeportal.test/api/route?path=%2Fnews%2Flaunch-announcement'),
      env,
      params: { catchall: ['route'] }
    });
    assert.equal(apiRouteRes.status, 200);
    const apiRouteJson = await apiRouteRes.json();
    assert.equal(apiRouteJson.success, true);
    assert.equal(apiRouteJson.payload.viewType, 'news-article');
    assert.equal(apiRouteJson.payload.canonicalPath, '/news/launch-announcement');
    assert.ok(apiRouteJson.payload.renderedMainHtml.includes('Edge article body'));

    // 2. Missing /static-routes/news--launch-announcement.json returning Cloudflare HTML SPA fallback gets resolved to live JSON!
    const mwJsonRes = await edgeMiddleware.onRequest({
      request: new Request('https://edgeportal.test/static-routes/news--launch-announcement.json'),
      env,
      next: async () => new Response('<!doctype html><html><body>SPA fallback</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    });
    assert.equal(mwJsonRes.status, 200);
    assert.ok((mwJsonRes.headers.get('content-type') || '').includes('application/json'));
    const mwJsonPayload = await mwJsonRes.json();
    assert.equal(mwJsonPayload.viewType, 'news-article');
    assert.equal(mwJsonPayload.canonicalPath, '/news/launch-announcement');

    // 3. Stale SPA fallback HTML for /news/launch-announcement gets dynamically rendered for /news/launch-announcement
    const baseTpl = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
    const homeSsrHtml = baseTpl.replace('<main id="dynamic-content"', '<main id="dynamic-content" data-ssr-path="/"');
    const mwHtmlRes = await edgeMiddleware.onRequest({
      request: new Request('https://edgeportal.test/news/launch-announcement'),
      env,
      next: async () => new Response(homeSsrHtml, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    });
    assert.equal(mwHtmlRes.status, 200);
    const mwHtmlText = await mwHtmlRes.text();
    assert.ok(mwHtmlText.includes('data-ssr-path="/news/launch-announcement"'));
    assert.ok(mwHtmlText.includes('Edge article body'));

    // 4. Unknown slug returns 404 HTML
    const mwNotFoundRes = await edgeMiddleware.onRequest({
      request: new Request('https://edgeportal.test/this-slug-does-not-exist'),
      env,
      next: async () => new Response(homeSsrHtml, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    });
    assert.equal(mwNotFoundRes.status, 404);
  } finally {
    globalThis.fetch = origFetch;
  }
});




