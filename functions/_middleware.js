/**
 * Cloudflare Pages Functions Global Middleware
 * Enforces CORS, hardened security headers, Gate G1 edge bot blocking & noindex on /moreinfo and /admin.
 */

import { evaluateGateG1Edge } from './_shared/auth.js';

export async function onRequest(context) {
  const { request, env, next } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-api-key',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  const url = new URL(request.url);
  const path = url.pathname.toLowerCase();
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
  newHeaders.set('Access-Control-Allow-Origin', '*');
  newHeaders.set('X-Content-Type-Options', 'nosniff');

  if (isGateway || isAdmin) {
    newHeaders.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
    newHeaders.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    newHeaders.set('Referrer-Policy', isGateway ? 'no-referrer' : 'strict-origin-when-cross-origin');
  } else {
    newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}
