/**
 * Cloudflare Pages Functions Global Middleware
 * Enforces scoped CORS, hardened security headers (X-Frame-Options: DENY on Admin),
 * Gate G1 edge bot blocking & noindex on /moreinfo and /admin.
 */

import { evaluateGateG1Edge } from './_shared/auth.js';

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

  const response = await next();
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
