/**
 * Cloudflare Pages Function: Universal Catch-All (/api/[[catchall]])
 * Ensures all API calls on Cloudflare Pages return clean JSON responses
 * with proper CORS headers, preventing "Unexpected end of JSON input".
 */

import { jsonResponse } from '../_shared/auth.js';

export async function onRequest(context) {
  const { request, params } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-api-key'
      }
    });
  }

  const path = Array.isArray(params.catchall)
    ? params.catchall.join('/')
    : params.catchall || '';

  return jsonResponse(
    {
      success: false,
      error: `API route not found: /api/${path}`,
      path: `/api/${path}`,
      method: request.method,
      runtime: 'Cloudflare Pages Functions'
    },
    404
  );
}
