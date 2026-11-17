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

test('resolveAdminSecurityPolicy enforces zero hardcoded credentials and fails closed everywhere until configured', () => {
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

  // Placeholder / short secrets FAIL CLOSED
  const weakCreds = resolveAdminSecurityPolicy(
    {
      NODE_ENV: 'production',
      ADMIN_EMAIL: 'owner@example.com',
      ADMIN_PASSWORD: 'replace-with-password',
      ADMIN_SESSION_SECRET: 'short'
    },
    'cms.example.com'
  );
  assert.equal(weakCreds.credentialsReady, false);

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
  assert.equal(prodStrong.allowDefaultDevCreds, false);
  assert.equal(prodStrong.setupError, null);

  // Strong ADMIN_API_KEY + Session Secret SUCCEEDS without email/password
  const apiKeyOnly = resolveAdminSecurityPolicy(
    {
      ADMIN_API_KEY: 'live-api-key-9876543210abcdef',
      ADMIN_SESSION_SECRET: 'super-long-production-hmac-secret-999'
    },
    'localhost:3000'
  );
  assert.equal(apiKeyOnly.credentialsReady, true);
  assert.equal(apiKeyOnly.hasApiKey, true);
});

test('validateAdminSessionClaims enforces strict issuer, type, jti, iat, and non-optional exp claims', () => {
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
      email: 'owner@example.com',
      jti: '1234567890abcdef',
      iat: now,
      exp: now + 60000
    },
    now
  );
  assert.equal(ok.valid, true);
  assert.equal(ok.claims?.email, 'owner@example.com');
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




