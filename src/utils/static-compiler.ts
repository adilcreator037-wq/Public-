/**
 * ============================================================================
 * MODULE 4: STATIC PUBLIC WEBSITE COMPILER (static-compiler.ts)
 * Compiles live Admin state (`SiteConfig`) into a 100% static, hardcoded
 * public website bundle with ZERO Firebase runtime dependencies:
 * - `index.html` (Home page pre-rendered HTML + static JSON payload)
 * - `news/index.html` (Daily News Hub pre-rendered HTML + static JSON payload)
 * - `news/<slug>/index.html` (Every single News Article pre-rendered HTML)
 * - `<pageSlug>/index.html` (Every Legal/Standalone page pre-rendered HTML)
 * - `static-routes/*.json` (Static per-route JSON files for instant SPA navigation)
 * - `sitemap.xml`, `robots.txt`, `feed.xml`
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';
import { SiteConfig, generateSlug } from './cms-types';
import {
  generateSitemapXml,
  generateRobotsTxt,
  generateRssFeedXml,
  generateWebManifestJson
} from './cms-seo';
import {
  buildPartialRoutePayload,
  renderCompleteStaticPageHtml,
  renderGatewayPageHtml
} from './cms-renderer';

export interface CompiledStaticFile {
  /** Relative path inside the static public output bundle, e.g. `index.html` or `news/index.html` */
  path: string;
  /** UTF-8 string or Base64 string (when encoding === 'base64') */
  content: string;
  /** Content encoding (`utf-8` default for HTML/JSON/XML/SVG/JS; `base64` for binary raster assets) */
  encoding?: 'utf-8' | 'base64';
  /** Description of the generated static artifact */
  description: string;
}

export interface StaticBundleCompilationResult {
  compiledAt: number;
  totalFiles: number;
  routesCompiled: string[];
  files: CompiledStaticFile[];
}

const BINARY_ASSET_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.avif', '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip', '.apk'
]);

function isBinaryAssetPath(filePath: string): boolean {
  const ext = path.extname(filePath || '').toLowerCase();
  return BINARY_ASSET_EXTENSIONS.has(ext);
}

/**
 * Convert a route pathname (`/`, `/news`, `/news/my-slug`, `/privacy-policy`)
 * into a deterministic static JSON filename under `/static-routes/`.
 */
export function routePathToStaticJsonName(pathname: string): string {
  const clean = (pathname || '/').split('?')[0].replace(/^\/+|\/+$/g, '');
  if (!clean) return 'index.json';
  return `${clean.replace(/\//g, '--')}.json`;
}

/**
 * Collect local `/assets/*` files and any `/uploads/*` files referenced inside `config`
 * so exported GitHub static bundles never suffer 404 images or broken favicons.
 */
function collectPublicAssetFiles(config: SiteConfig): CompiledStaticFile[] {
  const out: CompiledStaticFile[] = [];
  const seenPaths = new Set<string>();
  const cwd = process.cwd();

  const tryReadAsset = (relUrlPath: string, description: string) => {
    const cleanRel = String(relUrlPath || '').replace(/^\/+/, '').replace(/\.\./g, '');
    if (!cleanRel || seenPaths.has(cleanRel)) return;
    const candidates = [
      path.join(cwd, 'public', cleanRel),
      path.join(cwd, cleanRel)
    ];
    for (const fullPath of candidates) {
      if (fs.existsSync(fullPath)) {
        try {
          const stat = fs.statSync(fullPath);
          if (!stat.isFile()) continue;
          const binary = isBinaryAssetPath(fullPath);
          const content = binary
            ? fs.readFileSync(fullPath).toString('base64')
            : fs.readFileSync(fullPath, 'utf-8');
          seenPaths.add(cleanRel);
          out.push({
            path: cleanRel,
            content,
            encoding: binary ? 'base64' : 'utf-8',
            description
          });
          return;
        } catch {
          // Skip unreadable files
        }
      }
    }
  };

  // 1. Package /assets/* and /uploads/* media files explicitly referenced in active SiteConfig
  try {
    const serialized = JSON.stringify(config || {});
    const assetMatches = serialized.match(/\/assets\/[a-zA-Z0-9._-]+/g) || [];
    for (const match of assetMatches) {
      tryReadAsset(match.slice(1), `Referenced brand/UI asset (${match})`);
    }
    const uploadMatches = serialized.match(/\/uploads\/[a-zA-Z0-9._-]+/g) || [];
    for (const match of uploadMatches) {
      tryReadAsset(match.slice(1), `Referenced uploaded media (${match})`);
    }
  } catch {
    // ignore
  }

  return out;
}

/**
 * Compile the entire public website into an in-memory array of static files
 * and optionally write them to `distPublicDir` and `publicStaticRoutesDir`.
 */
const DEFAULT_STATIC_HTML_TEMPLATE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="robots" content="index, follow" />
    <title></title>
    <meta name="description" id="meta-description" content="" />
    <link rel="canonical" id="canonical-link" href="" />
    <meta property="og:title" id="og-title" content="" />
    <meta property="og:description" id="og-description" content="" />
    <meta property="og:url" id="og-url" content="" />
    <meta property="og:image" id="og-image" content="" />
    <meta name="twitter:title" id="twitter-title" content="" />
    <meta name="twitter:description" id="twitter-description" content="" />
    <meta name="twitter:image" id="twitter-image" content="" />
    <link rel="icon" id="dynamic-favicon" href="" />
    <script type="application/ld+json" id="schema-json-ld">{}</script>
  </head>
  <body>
    <img id="navbar-logo-img" src="" alt="" hidden />
    <span id="navbar-logo-text"></span>
    <a id="header-news-btn" href="/news"><span id="header-news-label">News</span></a>
    <ul id="drawer-links-list"></ul>
    <section id="hero-section" class="hero-section">
      <h1 id="hero-h1"></h1>
      <div id="hero-cta-grid"><a id="hero-cta-secondary" href="#" hidden></a><a id="hero-cta-primary" href="#" hidden></a></div>
      <div id="hero-intro"></div>
      <div id="hero-banner-wrapper"><img id="hero-banner-img" src="" alt="" /></div>
    </section>
    <main id="dynamic-content"></main>
    <div id="footer-disclaimer-heading"></div>
    <p id="footer-disclaimer"></p>
    <div id="footer-links-heading"></div>
    <nav id="footer-links-list"></nav>
    <p id="footer-copyright"></p>
    <a id="floating-bottom-cta" href="#" hidden><span id="floating-cta-text"></span></a>
  </body>
</html>`;

export function compileStaticSiteBundle(
  config: SiteConfig,
  indexHtmlTemplate: string = DEFAULT_STATIC_HTML_TEMPLATE,
  options?: {
    writeToDisk?: boolean;
    distPublicDir?: string;
    publicStaticRoutesDir?: string;
    appJsContent?: string;
    moreinfoHtmlTemplate?: string;
    moreinfoJsContent?: string;
    includeAssets?: boolean;
  }
): StaticBundleCompilationResult {
  const files: CompiledStaticFile[] = [];
  const routesCompiled: string[] = [];

  const registerRoute = (routePath: string, htmlOutputPath: string, label: string) => {
    routesCompiled.push(routePath);

    // 1. Pre-compiled standalone HTML file for this route
    const fullHtml = renderCompleteStaticPageHtml(indexHtmlTemplate, config, routePath);
    files.push({
      path: htmlOutputPath,
      content: fullHtml,
      encoding: 'utf-8',
      description: `Static HTML page for ${label} (${routePath})`
    });

    // 2. Pre-compiled static JSON route payload for zero-Firebase client navigation
    const payload = buildPartialRoutePayload(routePath, config);
    const jsonFileName = routePathToStaticJsonName(routePath);
    files.push({
      path: `static-routes/${jsonFileName}`,
      content: JSON.stringify(payload, null, 2),
      encoding: 'utf-8',
      description: `Static route payload for ${routePath}`
    });
  };

  // 1. Homepage (`/`)
  registerRoute('/', 'index.html', 'Homepage');

  // 2. Dedicated Daily News Hub (`/news`)
  registerRoute('/news', 'news/index.html', 'Daily News Hub');

  // 3. Individual News Article Pages (`/news/:slug`)
  for (const article of config.newsSection?.articles || []) {
    const slug = generateSlug(article.slug || article.title);
    if (slug) {
      registerRoute(`/news/${slug}`, `news/${slug}/index.html`, `News Article: ${article.title}`);
    }
  }

  // 4. Standalone Legal & Support Pages (`/:pageSlug`)
  for (const page of config.pages || []) {
    const slug = generateSlug(page.slug || page.label);
    if (slug) {
      registerRoute(`/${slug}`, `${slug}/index.html`, `Standalone Page: ${page.label}`);
    }
  }

  // 5. Isolated Protected Security & Download Gateway (`/moreinfo` & `/download`)
  // Note: Never registered in routesCompiled for sitemap.xml! Strictly isolated with noindex, nofollow.
  if (config.securityGate?.enabled !== false && options?.moreinfoHtmlTemplate) {
    const gatewayHtml = renderGatewayPageHtml(options.moreinfoHtmlTemplate, config);
    files.push({
      path: 'moreinfo/index.html',
      content: gatewayHtml,
      encoding: 'utf-8',
      description: 'Isolated v12 7-Gate Security & Download Gateway (/moreinfo)'
    });
    files.push({
      path: 'download/index.html',
      content: gatewayHtml,
      encoding: 'utf-8',
      description: 'Isolated v12 7-Gate Security & Download Gateway Alias (/download)'
    });
  }
  if (options?.moreinfoJsContent) {
    files.push({
      path: 'moreinfo.js',
      content: options.moreinfoJsContent,
      encoding: 'utf-8',
      description: 'Client-side 7-Gate hardware probe & Turnstile clearance engine'
    });
  }

  // 6. Cloudflare Pages `_headers` enforcing strict X-Robots-Tag & Cache-Control on /moreinfo and /download
  const cloudflareHeaders = [
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
  ].join('\n');

  files.push({
    path: '_headers',
    content: `${cloudflareHeaders}\n`,
    encoding: 'utf-8',
    description: 'Cloudflare Pages edge headers isolating /moreinfo & /download from crawlers'
  });

  // 7. Technical SEO Artifacts (`sitemap.xml`, `robots.txt`, `feed.xml`, `manifest.webmanifest`)
  if (config.domainConfig?.enableSitemapXml !== false) {
    files.push({
      path: 'sitemap.xml',
      content: generateSitemapXml(config),
      encoding: 'utf-8',
      description: 'Search Engine XML Sitemap'
    });
  }

  files.push({
    path: 'robots.txt',
    content: generateRobotsTxt(config),
    encoding: 'utf-8',
    description: 'Crawler directives & Sitemap pointer'
  });

  if (config.domainConfig?.enableRssFeed !== false) {
    files.push({
      path: 'feed.xml',
      content: generateRssFeedXml(config),
      encoding: 'utf-8',
      description: 'RSS 2.0 Syndication Feed'
    });
  }

  if (config.domainConfig?.enableWebManifest !== false) {
    files.push({
      path: 'manifest.webmanifest',
      content: generateWebManifestJson(config),
      encoding: 'utf-8',
      description: 'W3C Web App Manifest for Google Search Result Logo & PWA'
    });
  }

  // 8. Include pure-static `app.js` in the bundle if provided
  if (options?.appJsContent) {
    files.push({
      path: 'app.js',
      content: options.appJsContent,
      encoding: 'utf-8',
      description: 'Zero-Firebase static public router script'
    });
  }

  // 9. Include public static assets (/assets/* & referenced /uploads/*)
  if (options?.includeAssets !== false) {
    const assetFiles = collectPublicAssetFiles(config);
    for (const af of assetFiles) {
      files.push(af);
    }
  }

  // 10. Include Cloudflare Pages Functions (/functions) in the bundle
  const functionsDir = path.resolve(process.cwd(), 'functions');
  if (fs.existsSync(functionsDir)) {
    const collectFuncs = (baseDir: string, relSub: string = ''): Array<{ rel: string; full: string }> => {
      const cur = path.join(baseDir, relSub);
      if (!fs.existsSync(cur)) return [];
      let out: Array<{ rel: string; full: string }> = [];
      const entries = fs.readdirSync(cur, { withFileTypes: true });
      for (const ent of entries) {
        const itemRel = relSub ? `${relSub}/${ent.name}` : ent.name;
        const itemFull = path.join(baseDir, itemRel);
        if (ent.isDirectory()) {
          out = out.concat(collectFuncs(baseDir, itemRel));
        } else if (ent.isFile()) {
          out.push({ rel: itemRel, full: itemFull });
        }
      }
      return out;
    };

    const funcList = collectFuncs(functionsDir);
    for (const item of funcList) {
      try {
        const content = fs.readFileSync(item.full, 'utf-8');
        files.push({
          path: `functions/${item.rel}`,
          content,
          encoding: 'utf-8',
          description: `Cloudflare Pages Edge Function (${item.rel})`
        });
      } catch {
        // Skip unreadable files
      }
    }
  }

  // NOTE: Admin Studio files (`admin.html`, `admin.js`, `admin.css`, `firebase-config.js`) are
  // strictly excluded from the compiled public static website bundle so the public portal and
  // the Admin CMS remain 100% isolated in separate worlds with zero interconnection.

  // 11. Write to disk if requested (populates `/public/static-routes` and `/dist-public`)
  if (options?.writeToDisk) {
    if (options.publicStaticRoutesDir) {
      // Remove stale static-route JSON files first so deleted pages/articles don't linger locally
      if (fs.existsSync(options.publicStaticRoutesDir)) {
        try {
          const existingJson = fs.readdirSync(options.publicStaticRoutesDir);
          for (const fname of existingJson) {
            if (fname.endsWith('.json')) {
              fs.unlinkSync(path.join(options.publicStaticRoutesDir, fname));
            }
          }
        } catch {
          // ignore
        }
      }
      fs.mkdirSync(options.publicStaticRoutesDir, { recursive: true });
      for (const file of files) {
        if (file.path.startsWith('static-routes/')) {
          const targetPath = path.join(
            options.publicStaticRoutesDir,
            path.basename(file.path)
          );
          fs.writeFileSync(targetPath, file.content, 'utf-8');
        }
      }
    }

    if (options.distPublicDir) {
      if (fs.existsSync(options.distPublicDir)) {
        try {
          const existingEntries = fs.readdirSync(options.distPublicDir);
          for (const entry of existingEntries) {
            fs.rmSync(path.join(options.distPublicDir, entry), { recursive: true, force: true });
          }
        } catch {
          // ignore cleanup failure
        }
      }
      fs.mkdirSync(options.distPublicDir, { recursive: true });
      for (const file of files) {
        const destPath = path.join(options.distPublicDir, file.path);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        if (file.encoding === 'base64') {
          fs.writeFileSync(destPath, Buffer.from(file.content, 'base64'));
        } else {
          fs.writeFileSync(destPath, file.content, 'utf-8');
        }
      }
    }
  }

  return {
    compiledAt: Date.now(),
    totalFiles: files.length,
    routesCompiled,
    files
  };
}
