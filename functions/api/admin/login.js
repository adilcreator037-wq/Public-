/**
 * Cloudflare Pages Function: POST /api/admin/login
 * Authenticates admin users using Cloudflare Pages environment variables / secrets
 * (ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_API_KEY, ADMIN_SECRET).
 */

import {
  getAdminCredentials,
  timingSafeEqual,
  createAdminToken,
  jsonResponse,
  cleanEnvVal
} from '../../_shared/auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const email = cleanEnvVal(body.email);
  const password = cleanEnvVal(body.password);
  const apiKey = cleanEnvVal(body.apiKey);

  const adminCreds = getAdminCredentials(env);

  const emailMatches = timingSafeEqual(
    email.toLowerCase(),
    adminCreds.email.toLowerCase()
  );
  const passMatches = timingSafeEqual(password, adminCreds.password);
  const apiKeyMatches =
    !adminCreds.requiresApiKey ||
    (Boolean(apiKey) && timingSafeEqual(apiKey, adminCreds.apiKey));

  // Allow login if apiKey matches OR if email and password match
  const isAuthenticated =
    (adminCreds.requiresApiKey && apiKey && apiKeyMatches) ||
    (emailMatches && passMatches && apiKeyMatches);

  if (!isAuthenticated) {
    return jsonResponse(
      {
        success: false,
        error:
          adminCreds.requiresApiKey && !apiKeyMatches
            ? 'Invalid Admin API Key, Email, or Password. Verify your Cloudflare environment variables.'
            : 'Invalid Admin Email or Password. Verify ADMIN_EMAIL and ADMIN_PASSWORD in your Cloudflare Pages environment variables.'
      },
      401
    );
  }

  const token = await createAdminToken(adminCreds.email, adminCreds.secret);

  return jsonResponse({
    success: true,
    token,
    user: {
      email: adminCreds.email,
      role: 'Master Administrator'
    },
    envDiagnostics: {
      adminEmailConfigured: adminCreds.isCustomEmail,
      adminPasswordConfigured: adminCreds.isCustomPassword,
      adminApiKeyRequired: adminCreds.requiresApiKey,
      runtime: 'Cloudflare Pages Functions'
    }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-api-key'
    }
  });
}
