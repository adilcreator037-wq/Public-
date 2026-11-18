/**
 * Cloudflare Pages Functions Global Middleware
 * Enforces scoped CORS, hardened security headers (X-Frame-Options: DENY on Admin),
 * Gate G1 edge bot blocking & noindex on /moreinfo and /admin,
 * and dynamic per-URL fallback resolution from Firestore when a static route
 * or SEO artifact is requested before GitHub re-build completes.
 */

import {
  evaluateGateG1Edge,
  getFirebaseEnvFromEnv,
  readSiteConfigWithStatusEdge,
  EMPTY_ADMIN_CONFIG,
  jsonResponse
} from './_shared/auth.js';
import {
  resolveRouteEdge,
  buildPartialRoutePayloadEdge,
  renderCompleteStaticPageHtmlEdge,
  generateSitemapXmlEdge,
  generateRobotsTxtEdge,
  generateRssFeedXmlEdge,
  generateWebManifestJsonEdge
} from './_shared/static-compiler.js';

function isSensitiveAdminPath(pathname) {
  const p = pathname.toLowerCase();
  return (
    p.startsWith('/admin') ||
    p.startsWith('/api/admin') ||
    p.startsWith('/api/config') ||
    p.startsWith('/api/github') ||
    p.startsWith('/api/firebase') ||
    p === '/api/static-bundle' ||
    p === '/api/upload-image' ||
    p === '/api/news'
  );
}

const STATIC_ASSET_EXT_RE = /\.(?:js|mjs|css|png|jpe?g|webp|gif|svg|ico|avif|woff2?|ttf|eot|map|txt|xml|json|webmanifest|pdf|zip|apk)$/i;

function isDynamicPublicPageCandidate(pathname) {
  const lower = pathname.toLowerCase();
  if (
    lower.startsWith('/api/') ||
    lower.startsWith('/admin') ||
    lower.startsWith('/moreinfo') ||
    lower.startsWith('/download') ||
    lower.startsWith('/assets/') ||
    lower.startsWith('/uploads/') ||
    lower.startsWith('/static-routes/')
  ) {
    return false;
  }
  if (lower.endsWith('.html')) return true;
  return !STATIC_ASSET_EXT_RE.test(lower);
}

function staticJsonNameToRoutePath(fileName) {
  const clean = String(fileName || '').replace(/\.json$/i, '');
  if (!clean || clean === 'index') return '/';
  return `/${clean.replace(/--/g, '/')}`;
}

async function resolveDynamicFallback(request, env, url, initialResponse) {
  if (request.method !== 'GET') return initialResponse;

  const pathname = url.pathname || '/';
  const lower = pathname.toLowerCase();
  const cleanPath = (lower.endsWith('/index.html') ? lower.slice(0, -'/index.html'.length) : lower).replace(/\/+$/, '') || '/';
  const contentType = (initialResponse.headers.get('content-type') || '').toLowerCase();

  // 1. Dynamic `/static-routes/<route>.json` fallback if static JSON file wasn't pre-built or fell through to HTML SPA fallback
  if (lower.startsWith('/static-routes/') && lower.endsWith('.json')) {
    if (initialResponse.ok && contentType.includes('application/json')) {
      return initialResponse;
    }
    const fbEnv = getFirebaseEnvFromEnv(env);
    if (!fbEnv.isConfigured) return initialResponse;

    const jsonName = pathname.slice('/static-routes/'.length);
    const targetRoute = staticJsonNameToRoutePath(jsonName);
    const readRes = await readSiteConfigWithStatusEdge(fbEnv.config, env);
    const cfg = readRes.status === 'ok' && readRes.config ? readRes.config : EMPTY_ADMIN_CONFIG;
    const route = resolveRouteEdge(targetRoute, cfg);
    if (!route.matched) {
      return jsonResponse({ success: false, error: 'Route not found' }, 404, {}, request, false);
    }
    const payload = buildPartialRoutePayloadEdge(targetRoute, cfg);
    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=120'
      }
    });
  }

  // 2. Dynamic SEO artifacts fallback (`/sitemap.xml`, `/robots.txt`, `/feed.xml`, `/manifest.webmanifest`)
  const isSeoArtifact =
    lower === '/sitemap.xml' ||
    lower === '/robots.txt' ||
    lower === '/feed.xml' ||
    lower === '/manifest.webmanifest';
  if (isSeoArtifact) {
    const expectedOk =
      initialResponse.ok &&
      !contentType.includes('text/html');
    if (expectedOk) return initialResponse;

    const fbEnv = getFirebaseEnvFromEnv(env);
    if (!fbEnv.isConfigured) return initialResponse;

    const readRes = await readSiteConfigWithStatusEdge(fbEnv.config, env);
    const cfg = readRes.status === 'ok' && readRes.config ? readRes.config : EMPTY_ADMIN_CONFIG;
    if (lower === '/sitemap.xml') {
      const xml = generateSitemapXmlEdge(cfg);
      if (!xml) return new Response('XML Sitemap disabled', { status: 404 });
      return new Response(xml, { status: 200, headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
    }
    if (lower === '/robots.txt') {
      return new Response(generateRobotsTxtEdge(cfg), {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
    if (lower === '/feed.xml') {
      const rss = generateRssFeedXmlEdge(cfg);
      if (!rss) return new Response('RSS Feed disabled', { status: 404 });
      return new Response(rss, { status: 200, headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
    }
    if (lower === '/manifest.webmanifest') {
      return new Response(generateWebManifestJsonEdge(cfg), {
        status: 200,
        headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' }
      });
    }
  }

  // 3. Dynamic Public HTML Page Fallback for `/`, `/news`, `/news/:slug`, `/:pageSlug`
  if (!isDynamicPublicPageCandidate(pathname)) {
    return initialResponse;
  }

  let htmlBody = '';
  if (initialResponse.ok && contentType.includes('text/html')) {
    htmlBody = await initialResponse.text();
    const ssrMatch = htmlBody.match(/<main[^>]*\bdata-ssr-path="([^"]*)"/i);
    if (ssrMatch && ssrMatch[1] === cleanPath) {
      // Pre-built static CDN HTML matches requested URL -> return immediately at CDN speed
      return new Response(htmlBody, {
        status: initialResponse.status,
        statusText: initialResponse.statusText,
        headers: initialResponse.headers
      });
    }
  }

  const fbEnv = getFirebaseEnvFromEnv(env);
  if (!fbEnv.isConfigured) {
    return htmlBody
      ? new Response(htmlBody, {
          status: initialResponse.status,
          statusText: initialResponse.statusText,
          headers: initialResponse.headers
        })
      : initialResponse;
  }

  const readRes = await readSiteConfigWithStatusEdge(fbEnv.config, env);
  const cfg = readRes.status === 'ok' && readRes.config ? readRes.config : EMPTY_ADMIN_CONFIG;
  const route = resolveRouteEdge(cleanPath, cfg);

  if (!route.matched) {
    return new Response('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>404 Not Found</title><meta name="robots" content="noindex, nofollow"></head><body style="font-family:system-ui,sans-serif;padding:48px 20px;text-align:center;"><h1>Page Not Found</h1><p><a href="/">Return Home</a></p></body></html>', {
      status: 404,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow'
      }
    });
  }

  let templateHtml = htmlBody;
  if (!templateHtml && env?.ASSETS?.fetch) {
    try {
      const tplRes = await env.ASSETS.fetch(new Request(new URL('/index.html', url).toString()));
      if (tplRes && tplRes.ok) templateHtml = await tplRes.text();
    } catch {
      // use fallback internal template
    }
  }

  const renderedHtml = renderCompleteStaticPageHtmlEdge(templateHtml || undefined, cfg, cleanPath);
  return new Response(renderedHtml, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=30, stale-while-revalidate=120'
    }
  });
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname.toLowerCase();
  const sensitive = isSensitiveAdminPath(path);

  if (request.method === 'OPTIONS') {
    const reqOrigin = request.headers.get('origin') || '';
    const reqHost = (request.headers.get('host') || url.host || '').toLowerCase();
    const headers = {
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-api-key, x-admin-csrf, x-requested-with',
      'Access-Control-Max-Age': '86400'
    };
    if (!sensitive) {
      headers['Access-Control-Allow-Origin'] = '*';
    } else if (reqOrigin) {
      try {
        if (new URL(reqOrigin).host.toLowerCase() === reqHost) {
          headers['Access-Control-Allow-Origin'] = reqOrigin;
          headers['Access-Control-Allow-Credentials'] = 'true';
          headers['Vary'] = 'Origin';
        }
      } catch {
        // Ignore invalid origin
      }
    }
    return new Response(null, { status: 204, headers });
  }

  const isGateway = path.startsWith('/moreinfo') || path.startsWith('/download');
  const isAdmin = path.startsWith('/admin');

  if (isGateway && request.method === 'GET') {
    const g1 = evaluateGateG1Edge(request, env, 'universal_human');
    if (!g1.pass) {
      return new Response('404 Not Found', {
        status: 404,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
          'Cache-Control': 'private, no-store, no-cache, must-revalidate',
          'Referrer-Policy': 'no-referrer'
        }
      });
    }
  }

  const rawResponse = await next();
  const response = await resolveDynamicFallback(request, env, url, rawResponse);

  const newHeaders = new Headers(response.headers);
  newHeaders.set('X-Content-Type-Options', 'nosniff');

  if (!sensitive) {
    newHeaders.set('Access-Control-Allow-Origin', '*');
  } else {
    newHeaders.delete('Access-Control-Allow-Origin');
    const reqOrigin = request.headers.get('origin') || '';
    const reqHost = (request.headers.get('host') || url.host || '').toLowerCase();
    if (reqOrigin) {
      try {
        if (new URL(reqOrigin).host.toLowerCase() === reqHost) {
          newHeaders.set('Access-Control-Allow-Origin', reqOrigin);
          newHeaders.set('Access-Control-Allow-Credentials', 'true');
          newHeaders.set('Vary', 'Origin');
        }
      } catch {
        // Ignore
      }
    }
  }

  if (isGateway || isAdmin || sensitive) {
    newHeaders.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
    newHeaders.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    newHeaders.set('Referrer-Policy', isGateway ? 'no-referrer' : 'strict-origin-when-cross-origin');
    if (isAdmin || sensitive) {
      newHeaders.set('X-Frame-Options', 'DENY');
      newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
      newHeaders.set(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https://firestore.googleapis.com https://api.github.com; frame-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'"
      );
    }
  } else {
    newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}
