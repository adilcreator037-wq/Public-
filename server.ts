import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import {
  MASTER_DEFAULT_CONFIG,
  mergeSiteConfig,
  generateSmartLegalHtml,
  generateSlug,
  buildPartialRoutePayload,
  renderCompleteStaticPageHtml,
  compileStaticSiteBundle,
  verifyGitHubRepoAccess,
  pushStaticFilesToGitHub,
  generateSitemapXml,
  generateRobotsTxt,
  generateRssFeedXml,
  generateWebManifestJson,
  auditSiteSeoHealth,
  renderGatewayPageHtml,
  encryptVaultValue,
  evaluateGateG1,
  handleSessionInit,
  handleSessionClearance,
  GateRequestContext,
  SiteConfig,
  GitHubDeployLogItem
} from './src/utils/cms-engine';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const UPLOADS_DIR = path.resolve(process.cwd(), 'public', 'uploads');
const PUBLIC_STATIC_ROUTES_DIR = path.resolve(process.cwd(), 'public', 'static-routes');
const DIST_PUBLIC_DIR = path.resolve(process.cwd(), 'dist-public');
const CONFIG_FILE_PATH = path.join(DATA_DIR, 'site-config.json');

for (const dir of [DATA_DIR, UPLOADS_DIR, PUBLIC_STATIC_ROUTES_DIR, DIST_PUBLIC_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getAdminAuthEnv() {
  const email = (process.env.ADMIN_EMAIL || 'admin@domain.com').trim();
  const password = (process.env.ADMIN_PASSWORD || 'admin123').trim();
  const apiKey = (process.env.ADMIN_API_KEY || '').trim();
  const secret = (process.env.ADMIN_SESSION_SECRET || 'master-cms-hmac-secret-2026').trim();

  return {
    email,
    password,
    apiKey,
    secret,
    isCustomEmail: Boolean(process.env.ADMIN_EMAIL),
    isCustomPassword: Boolean(process.env.ADMIN_PASSWORD),
    requiresApiKey: Boolean(apiKey)
  };
}

/**
 * Optional Bootstrap Firebase Environment Variable Reader (Used ONLY by Admin Studio)
 */
function getFirebaseEnvConfig() {
  let jsonEnv: Record<string, string> = {};
  const rawJsonEnv = (process.env.FIREBASE_CONFIG_JSON || process.env.VITE_FIREBASE_CONFIG_JSON || '').trim();
  if (rawJsonEnv) {
    try {
      jsonEnv = JSON.parse(rawJsonEnv);
    } catch {
      // Ignore malformed JSON string and fall back to individual keys
    }
  }

  const apiKey = (
    jsonEnv.apiKey ||
    process.env.FIREBASE_API_KEY ||
    process.env.VITE_FIREBASE_API_KEY ||
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    ''
  ).trim();

  const projectId = (
    jsonEnv.projectId ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    ''
  ).trim();

  const authDomain = (
    jsonEnv.authDomain ||
    process.env.FIREBASE_AUTH_DOMAIN ||
    process.env.VITE_FIREBASE_AUTH_DOMAIN ||
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    (projectId ? `${projectId}.firebaseapp.com` : '')
  ).trim();

  const storageBucket = (
    jsonEnv.storageBucket ||
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.VITE_FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    (projectId ? `${projectId}.appspot.com` : '')
  ).trim();

  const messagingSenderId = (
    jsonEnv.messagingSenderId ||
    process.env.FIREBASE_MESSAGING_SENDER_ID ||
    process.env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
    ''
  ).trim();

  const appId = (
    jsonEnv.appId ||
    process.env.FIREBASE_APP_ID ||
    process.env.VITE_FIREBASE_APP_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
    ''
  ).trim();

  const databaseId = (
    jsonEnv.databaseId ||
    process.env.FIREBASE_DATABASE_ID ||
    process.env.VITE_FIREBASE_DATABASE_ID ||
    '(default)'
  ).trim();

  const isConfigured = Boolean(
    apiKey &&
    projectId &&
    !apiKey.includes('DummyKey') &&
    !apiKey.includes('YOUR_') &&
    !projectId.includes('my-single-domain-cms')
  );

  return {
    isConfigured,
    config: isConfigured
      ? { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId, databaseId }
      : null
  };
}

function getEnvSeededDefaultConfig(): SiteConfig {
  const base = JSON.parse(JSON.stringify(MASTER_DEFAULT_CONFIG)) as SiteConfig;
  const envBrand = (process.env.SITE_BRAND_NAME || '').trim();
  const envCanonical = (process.env.SITE_CANONICAL_URL || '').trim();
  const envEmail = (process.env.SITE_CONTACT_EMAIL || '').trim();

  if (envBrand) {
    base.brand.name = envBrand;
    base.seo.softwareDetails.name = envBrand;
    base.navigation.copyright = `© 2026 ${envBrand}. All rights reserved.`;
  }
  if (envCanonical) {
    base.seo.canonicalUrl = envCanonical;
    base.domainConfig.primaryDomain = envCanonical;
  }
  if (envEmail) {
    base.brand.contactEmail = envEmail;
  }
  if (envBrand || envCanonical || envEmail) {
    const b = base.brand.name;
    const c = base.seo.canonicalUrl;
    const e = base.brand.contactEmail;
    base.pages = base.pages.map((pg) => {
      if (pg.slug === 'privacy-policy') {
        return { ...pg, metaTitle: `Privacy Policy | ${b}`, htmlContent: generateSmartLegalHtml('privacy', b, c, e) };
      }
      if (pg.slug === 'terms-and-conditions') {
        return { ...pg, metaTitle: `Terms and Conditions | ${b}`, htmlContent: generateSmartLegalHtml('terms', b, c, e) };
      }
      if (pg.slug === 'dmca-disclaimer') {
        return { ...pg, metaTitle: `DMCA Disclaimer | ${b}`, htmlContent: generateSmartLegalHtml('dmca', b, c, e) };
      }
      if (pg.slug === 'contact-support') {
        return { ...pg, metaTitle: `Contact Support | ${b}`, htmlContent: generateSmartLegalHtml('contact', b, c, e) };
      }
      return pg;
    });
  }
  return base;
}

let cachedServerConfig: SiteConfig | null = null;

/**
 * Compile the 100% static public website files to `/public/static-routes` and `/dist-public`
 */
function buildStaticPublicFilesOnDisk(config: SiteConfig) {
  try {
    const indexHtmlPath = path.resolve(process.cwd(), 'index.html');
    const appJsPath = path.resolve(process.cwd(), 'app.js');
    const moreinfoHtmlPath = path.resolve(process.cwd(), 'moreinfo.html');
    const moreinfoJsPath = path.resolve(process.cwd(), 'moreinfo.js');
    if (!fs.existsSync(indexHtmlPath)) return null;
    const indexTemplate = fs.readFileSync(indexHtmlPath, 'utf-8');
    const appJsContent = fs.existsSync(appJsPath) ? fs.readFileSync(appJsPath, 'utf-8') : undefined;
    const moreinfoHtmlTemplate = fs.existsSync(moreinfoHtmlPath)
      ? fs.readFileSync(moreinfoHtmlPath, 'utf-8')
      : undefined;
    const moreinfoJsContent = fs.existsSync(moreinfoJsPath)
      ? fs.readFileSync(moreinfoJsPath, 'utf-8')
      : undefined;

    return compileStaticSiteBundle(config, indexTemplate, {
      writeToDisk: true,
      distPublicDir: DIST_PUBLIC_DIR,
      publicStaticRoutesDir: PUBLIC_STATIC_ROUTES_DIR,
      appJsContent,
      moreinfoHtmlTemplate,
      moreinfoJsContent
    });
  } catch (err) {
    console.warn('Warning compiling static public bundle:', err);
    return null;
  }
}

function loadPersistedSiteConfig(): SiteConfig {
  if (cachedServerConfig) return cachedServerConfig;

  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      const raw = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      cachedServerConfig = mergeSiteConfig(parsed, getEnvSeededDefaultConfig());
      buildStaticPublicFilesOnDisk(cachedServerConfig);
      return cachedServerConfig;
    }
  } catch (err) {
    console.warn('Warning reading site-config.json, initializing fresh default:', err);
  }

  const seeded = getEnvSeededDefaultConfig();
  savePersistedSiteConfig(seeded);
  return seeded;
}

function savePersistedSiteConfig(newConfig: Partial<SiteConfig>): SiteConfig {
  const normalized = mergeSiteConfig(newConfig, getEnvSeededDefaultConfig());
  normalized.updatedAt = Date.now();
  cachedServerConfig = normalized;

  try {
    const tempPath = `${CONFIG_FILE_PATH}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(normalized, null, 2), 'utf-8');
    fs.renameSync(tempPath, CONFIG_FILE_PATH);
  } catch (err) {
    console.error('Failed writing site-config.json:', err);
  }

  // Always re-compile the static public website bundle whenever Admin saves!
  buildStaticPublicFilesOnDisk(normalized);

  return normalized;
}

function safeTimingCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(String(a || ''), 'utf-8');
  const bufB = Buffer.from(String(b || ''), 'utf-8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

const loginAttemptTracker = new Map<string, { count: number; resetAt: number }>();

function checkLoginRateLimit(ip: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const entry = loginAttemptTracker.get(ip);
  if (!entry || now > entry.resetAt) {
    return { allowed: true };
  }
  if (entry.count >= 15) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true };
}

function recordFailedLoginAttempt(ip: string) {
  const now = Date.now();
  const entry = loginAttemptTracker.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttemptTracker.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 });
  } else {
    entry.count += 1;
  }
}

function clearLoginAttempts(ip: string) {
  loginAttemptTracker.delete(ip);
}

function createAdminToken(email: string): string {
  const { secret } = getAdminAuthEnv();
  const payload = JSON.stringify({
    email,
    iat: Date.now(),
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7
  });
  const base64Payload = Buffer.from(payload).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(base64Payload)
    .digest('base64url');
  return `${base64Payload}.${signature}`;
}

function verifyAdminToken(token: string | undefined): { valid: boolean; email?: string } {
  if (!token) return { valid: false };
  const { secret, apiKey } = getAdminAuthEnv();

  if (apiKey && safeTimingCompare(token, apiKey)) {
    return { valid: true, email: 'api-key-admin' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) return { valid: false };
  const [base64Payload, signature] = parts;

  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(base64Payload)
    .digest('base64url');

  if (!safeTimingCompare(signature, expectedSig)) return { valid: false };

  try {
    const decoded = JSON.parse(Buffer.from(base64Payload, 'base64url').toString('utf-8'));
    if (decoded.exp && Date.now() > decoded.exp) {
      return { valid: false };
    }
    return { valid: true, email: decoded.email };
  } catch {
    return { valid: false };
  }
}

function requireAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const headerApiKey = ((req.headers['x-admin-api-key'] as string) || '').trim();

  const verification = verifyAdminToken(bearerToken || headerApiKey);
  if (!verification.valid) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized. Please sign in with your configured Admin Email & Password.'
    });
    return;
  }
  (req as any).adminEmail = verification.email;
  next();
}

async function startServer() {
  const app = express();
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  app.use(express.json({ limit: '15mb' }));
  app.use('/uploads', express.static(UPLOADS_DIR));
  app.use('/static-routes', express.static(PUBLIC_STATIC_ROUTES_DIR));

  // Ensure initial static bundle is compiled on startup
  loadPersistedSiteConfig();

  // 1. Static / Partial Route Payload Endpoint (Used when filtering news categories or fallback)
  app.get('/api/route', (req, res) => {
    const rawPath = String(req.query.path || '/').trim();
    const newsCategory = String(req.query.cat || 'ALL').trim();
    const config = loadPersistedSiteConfig();
    const payload = buildPartialRoutePayload(rawPath, config, newsCategory);

    res.setHeader('Cache-Control', 'no-cache');
    res.json({
      success: true,
      payload
    });
  });

  // 2. Environment Firebase Config Endpoint (Used ONLY by Admin Studio)
  app.get('/api/firebase-config', (_req, res) => {
    const fbEnv = getFirebaseEnvConfig();
    res.json({
      success: true,
      ...fbEnv
    });
  });

  // 3. Live Admin Configuration Endpoint (Used by Admin Studio — Never cached)
  app.get('/api/config', (_req, res) => {
    const config = loadPersistedSiteConfig();
    const fbEnv = getFirebaseEnvConfig();
    const seoAudit = auditSiteSeoHealth(config);

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      success: true,
      config,
      firebaseEnv: fbEnv,
      seoAudit
    });
  });

  // 4. Device Image Upload Endpoint
  app.post('/api/upload-image', requireAdminAuth, (req, res) => {
    try {
      const { fileName = 'image.png', dataUrl = '' } = req.body || {};
      if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
        res.status(400).json({ success: false, error: 'Valid image dataUrl is required.' });
        return;
      }

      const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        res.status(400).json({ success: false, error: 'Invalid base64 image format.' });
        return;
      }

      let ext = matches[1].toLowerCase();
      if (ext === 'svg+xml') ext = 'svg';
      if (ext === 'jpeg') ext = 'jpg';
      const allowedExts = ['png', 'jpg', 'webp', 'svg', 'gif', 'avif'];
      if (!allowedExts.includes(ext)) {
        ext = 'png';
      }

      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, 'base64');
      const cleanBaseName = generateSlug(fileName.replace(/\.[^/.]+$/, '')) || 'asset';
      const finalFileName = `${cleanBaseName}-${Date.now().toString(36)}.${ext}`;
      const filePath = path.join(UPLOADS_DIR, finalFileName);

      fs.writeFileSync(filePath, buffer);

      res.json({
        success: true,
        url: `/uploads/${finalFileName}`,
        fileName: finalFileName,
        sizeBytes: buffer.length
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: `Image upload failed: ${err?.message || 'Unknown error'}`
      });
    }
  });

  // 5. Live Technical SEO Health Audit Endpoint
  app.get('/api/seo-health', (_req, res) => {
    const config = loadPersistedSiteConfig();
    res.json({
      success: true,
      audit: auditSiteSeoHealth(config)
    });
  });

  // 6. Dynamic XML Sitemap (/sitemap.xml)
  app.get('/sitemap.xml', (_req, res) => {
    const config = loadPersistedSiteConfig();
    res.status(200).set('Content-Type', 'application/xml; charset=utf-8').send(generateSitemapXml(config));
  });

  // 7. Dynamic Robots.txt (/robots.txt)
  app.get('/robots.txt', (_req, res) => {
    const config = loadPersistedSiteConfig();
    res.status(200).set('Content-Type', 'text/plain; charset=utf-8').send(generateRobotsTxt(config));
  });

  // 8. Dynamic RSS 2.0 Feed for Daily News (/feed.xml)
  app.get('/feed.xml', (_req, res) => {
    const config = loadPersistedSiteConfig();
    res.status(200).set('Content-Type', 'application/rss+xml; charset=utf-8').send(generateRssFeedXml(config));
  });

  // 8b. Dynamic W3C Web App Manifest (/manifest.webmanifest & /manifest.json)
  app.get(['/manifest.webmanifest', '/manifest.json', '/site.webmanifest'], (_req, res) => {
    const config = loadPersistedSiteConfig();
    res
      .status(200)
      .set('Content-Type', 'application/manifest+json; charset=utf-8')
      .send(generateWebManifestJson(config));
  });

  // 9. Server-Side Admin Login (Hardened with Rate-Limiting & Timing-Safe Verification)
  app.post('/api/admin/login', (req, res) => {
    const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local').split(',')[0].trim();
    const rateCheck = checkLoginRateLimit(clientIp);
    if (!rateCheck.allowed) {
      res.status(429).json({
        success: false,
        error: `Too many failed login attempts. Please wait ${rateCheck.retryAfterSec || 60} seconds before trying again.`
      });
      return;
    }

    const { email = '', password = '', apiKey = '' } = req.body || {};
    const adminEnv = getAdminAuthEnv();

    const emailMatches = safeTimingCompare(email.trim().toLowerCase(), adminEnv.email.toLowerCase());
    const passMatches = safeTimingCompare(password.trim(), adminEnv.password);
    const apiKeyMatches = !adminEnv.requiresApiKey || safeTimingCompare(apiKey.trim(), adminEnv.apiKey);

    if (
      !(adminEnv.requiresApiKey && apiKey.trim() && apiKeyMatches) &&
      (!emailMatches || !passMatches || !apiKeyMatches)
    ) {
      recordFailedLoginAttempt(clientIp);
      res.status(401).json({
        success: false,
        error:
          adminEnv.requiresApiKey && !apiKeyMatches
            ? 'Invalid Admin API Key, Email, or Password. Check your .env configuration.'
            : 'Invalid Admin Email or Password. Check ADMIN_EMAIL and ADMIN_PASSWORD in your environment variables.'
      });
      return;
    }

    clearLoginAttempts(clientIp);
    const token = createAdminToken(adminEnv.email);
    const fbEnv = getFirebaseEnvConfig();

    res.json({
      success: true,
      token,
      user: {
        email: adminEnv.email,
        role: 'Master Administrator'
      },
      envDiagnostics: {
        adminEmailConfigured: adminEnv.isCustomEmail,
        adminPasswordConfigured: adminEnv.isCustomPassword,
        adminApiKeyRequired: adminEnv.requiresApiKey,
        firebaseEnvConfigured: fbEnv.isConfigured,
        firebaseProjectId: fbEnv.config?.projectId || null
      }
    });
  });

  // 10. Admin Session & Environment Diagnostics Verification
  app.get('/api/admin/verify', (req, res) => {
    const authHeader = req.headers.authorization || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const verification = verifyAdminToken(bearerToken);
    const adminEnv = getAdminAuthEnv();
    const fbEnv = getFirebaseEnvConfig();

    res.json({
      authenticated: verification.valid,
      user: verification.valid ? { email: verification.email } : null,
      loginHints: {
        requiresApiKey: adminEnv.requiresApiKey,
        usingDefaultDevCredentials: !adminEnv.isCustomEmail && !adminEnv.isCustomPassword,
        defaultEmailHint: !adminEnv.isCustomEmail ? adminEnv.email : undefined
      },
      envDiagnostics: {
        adminEmailConfigured: adminEnv.isCustomEmail,
        adminPasswordConfigured: adminEnv.isCustomPassword,
        adminApiKeyRequired: adminEnv.requiresApiKey,
        firebaseEnvConfigured: fbEnv.isConfigured,
        firebaseProjectId: fbEnv.config?.projectId || null,
        firebaseConfig: fbEnv.config
      }
    });
  });

  // 11. Save Live Admin Configuration + Compile Static Public Website (+ Optional Auto-Push to GitHub)
  app.put('/api/config', requireAdminAuth, async (req, res) => {
    const incomingConfig = req.body?.config || req.body;
    if (!incomingConfig || typeof incomingConfig !== 'object') {
      res.status(400).json({ success: false, error: 'Invalid configuration payload.' });
      return;
    }

    const mergedIncoming = mergeSiteConfig(incomingConfig, getEnvSeededDefaultConfig());
    if (mergedIncoming.securityGate?.primaryDownloadUrl) {
      try {
        mergedIncoming.securityGate.encryptedPrimaryUrl = await encryptVaultValue(
          mergedIncoming.securityGate.primaryDownloadUrl,
          undefined,
          getVaultMasterSecret()
        );
      } catch {
        // Fallback handled at clearance
      }
    }

    let saved = savePersistedSiteConfig(mergedIncoming);
    let githubPush = null;

    if (
      saved.githubConfig?.autoPushOnPublish &&
      saved.githubConfig?.fineGrainedToken &&
      saved.githubConfig?.repoOwner &&
      saved.githubConfig?.repoName
    ) {
      const bundle = buildStaticPublicFilesOnDisk(saved);
      if (bundle) {
        githubPush = await pushStaticFilesToGitHub(saved.githubConfig, bundle.files);
        const logEntry: GitHubDeployLogItem = {
          id: `deploy-${Date.now()}`,
          timestamp: Date.now(),
          status: githubPush.status,
          commitSha: githubPush.commitSha,
          commitUrl: githubPush.commitUrl,
          filesCount: bundle.totalFiles,
          message: githubPush.message
        };
        saved.githubConfig.lastPublishedAt = Date.now();
        if (githubPush.commitSha) saved.githubConfig.lastCommitSha = githubPush.commitSha;
        if (githubPush.commitUrl) saved.githubConfig.lastCommitUrl = githubPush.commitUrl;
        saved.githubConfig.deployHistory = [
          logEntry,
          ...(saved.githubConfig.deployHistory || []).slice(0, 14)
        ];
        saved = savePersistedSiteConfig(saved);
      }
    }

    res.json({
      success: true,
      config: saved,
      githubPush,
      seoAudit: auditSiteSeoHealth(saved),
      savedAt: saved.updatedAt
    });
  });

  // 12. Verify GitHub Fine-Grained Token & Repository Write Access (`POST /api/github/verify`)
  app.post('/api/github/verify', requireAdminAuth, async (req, res) => {
    const ghCfg = req.body?.githubConfig || req.body || {};
    const result = await verifyGitHubRepoAccess({
      repoOwner: ghCfg.repoOwner || '',
      repoName: ghCfg.repoName || '',
      branch: ghCfg.branch || 'main',
      fineGrainedToken: ghCfg.fineGrainedToken || ''
    });
    res.json(result);
  });

  // 13. Compile Static Public Website & Push Atomic Commit to GitHub (`POST /api/github/publish`)
  app.post('/api/github/publish', requireAdminAuth, async (req, res) => {
    const incomingConfig = req.body?.config || loadPersistedSiteConfig();
    const customCommitMessage = String(req.body?.commitMessage || '').trim();

    let saved = savePersistedSiteConfig(incomingConfig);
    const bundle = buildStaticPublicFilesOnDisk(saved);

    if (!bundle) {
      res.status(500).json({
        success: false,
        error: 'Failed to compile static public website bundle.'
      });
      return;
    }

    const pushResult = await pushStaticFilesToGitHub(
      saved.githubConfig,
      bundle.files,
      customCommitMessage
    );

    const logEntry: GitHubDeployLogItem = {
      id: `deploy-${Date.now()}`,
      timestamp: Date.now(),
      status: pushResult.status,
      commitSha: pushResult.commitSha,
      commitUrl: pushResult.commitUrl,
      filesCount: bundle.totalFiles,
      message: pushResult.message
    };

    saved.githubConfig.lastPublishedAt = Date.now();
    if (pushResult.commitSha) saved.githubConfig.lastCommitSha = pushResult.commitSha;
    if (pushResult.commitUrl) saved.githubConfig.lastCommitUrl = pushResult.commitUrl;
    saved.githubConfig.deployHistory = [
      logEntry,
      ...(saved.githubConfig.deployHistory || []).slice(0, 14)
    ];

    saved = savePersistedSiteConfig(saved);

    res.json({
      success: pushResult.ok,
      publishResult: pushResult,
      compiledBundle: {
        compiledAt: bundle.compiledAt,
        totalFiles: bundle.totalFiles,
        routesCompiled: bundle.routesCompiled,
        filesList: bundle.files.map((f) => ({
          path: f.path,
          sizeBytes: Buffer.byteLength(f.content, 'utf-8'),
          description: f.description
        }))
      },
      config: saved
    });
  });

  // 14. Fast Single-Click Daily News Publish Endpoint
  app.post('/api/news', requireAdminAuth, (req, res) => {
    const current = loadPersistedSiteConfig();
    const article = req.body?.article || req.body;
    if (!article || !article.title) {
      res.status(400).json({ success: false, error: 'News headline is required.' });
      return;
    }

    const brandName = current.brand?.name || 'ApexMobile';
    const slug = generateSlug(article.slug || article.title || `news-${Date.now()}`);
    const newArticle = {
      id: article.id || `news-${Date.now()}`,
      title: String(article.title).trim(),
      slug,
      date:
        article.date ||
        new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      category: article.category || 'Daily Update',
      author: article.author || `${brandName} Editorial`,
      readTime: article.readTime || '2 min read',
      featured: Boolean(article.featured),
      summary: article.summary || '',
      coverImageUrl: article.coverImageUrl || '',
      coverImageAlt: article.coverImageAlt || article.title || '',
      coverImageCaption: article.coverImageCaption || '',
      ctaLabel: article.ctaLabel || '',
      ctaUrl: article.ctaUrl || '',
      metaTitle: article.metaTitle || `${article.title} | ${brandName}`,
      metaDescription: article.metaDescription || article.summary || '',
      htmlContent: article.htmlContent || `<p>${article.summary || ''}</p>`
    };

    const existingIdx = current.newsSection.articles.findIndex(
      (a) => a.id === newArticle.id || a.slug === newArticle.slug
    );
    if (existingIdx >= 0) {
      current.newsSection.articles[existingIdx] = newArticle;
    } else {
      current.newsSection.articles.unshift(newArticle);
    }

    const saved = savePersistedSiteConfig(current);
    res.json({
      success: true,
      article: newArticle,
      config: saved,
      seoAudit: auditSiteSeoHealth(saved)
    });
  });

  // 15. Reset to Master Default Configuration
  app.post('/api/config/reset', requireAdminAuth, (_req, res) => {
    const fresh = savePersistedSiteConfig(getEnvSeededDefaultConfig());
    res.json({
      success: true,
      config: fresh,
      seoAudit: auditSiteSeoHealth(fresh)
    });
  });

  // --------------------------------------------------------------------------
  // 16. v12 7-GATE SECURITY & AES-256-GCM LINK VAULT ENDPOINTS
  // --------------------------------------------------------------------------
  const getVaultMasterSecret = () =>
    (
      process.env.VAULT_ENCRYPTION_SECRET ||
      process.env.AES_SECRET ||
      process.env.HMAC_SECRET ||
      getAdminAuthEnv().secret ||
      'master-cms-v12-aes-256-gcm-vault-secret-key-2026'
    ).trim();

  const buildGateRequestContext = (
    req: express.Request,
    config: SiteConfig
  ): GateRequestContext => {
    const headers: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
    }
    if (!headers.host) {
      headers.host = 'localhost';
    }
    const clientIp = String(
      req.headers['cf-connecting-ip'] ||
        req.headers['x-forwarded-for'] ||
        req.socket.remoteAddress ||
        '127.0.0.1'
    )
      .split(',')[0]
      .trim();

    const masterSecret = getVaultMasterSecret();
    const envMap: Record<string, string | undefined> = {
      ...(process.env as Record<string, string | undefined>),
      AES_SECRET: masterSecret,
      NONCE_HMAC_SECRET: masterSecret,
      DID_HMAC_SECRET: masterSecret
    };

    const rawBody =
      req.body && typeof req.body === 'object'
        ? JSON.stringify(req.body)
        : typeof req.body === 'string'
        ? req.body
        : '';

    return {
      method: req.method,
      path: req.path,
      headers,
      rawBody,
      ip: clientIp,
      adapter: 'express',
      env: envMap,
      siteConfig: config
    };
  };

  // 16a. Admin 1-Click AES-256-GCM URL Encryption (`POST /api/admin/encrypt-url`)
  app.post('/api/admin/encrypt-url', requireAdminAuth, async (req, res) => {
    try {
      const rawUrl = String(req.body?.url || '').trim();
      if (!rawUrl) {
        res
          .status(400)
          .json({ success: false, error: 'Please enter a valid download destination URL to encrypt.' });
        return;
      }
      const encrypted = await encryptVaultValue(rawUrl, undefined, getVaultMasterSecret());
      res.json({
        success: true,
        encryptedUrl: encrypted
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: `Encryption failed: ${err?.message || 'Unknown error'}`
      });
    }
  });

  // 16b. Gate G1–G2 Session Init (`POST /api/v1/app/session-init`)
  app.post('/api/v1/app/session-init', async (req, res) => {
    const config = loadPersistedSiteConfig();
    const sec = config.securityGate || MASTER_DEFAULT_CONFIG.securityGate;
    const ctx = buildGateRequestContext(req, config);
    const initResult = await handleSessionInit(ctx);

    for (const [hk, hv] of Object.entries(initResult.headers)) {
      res.setHeader(hk, hv);
    }

    if (initResult.status !== 200) {
      res.status(initResult.status).type('application/json').send(initResult.body);
      return;
    }

    let parsedBody: Record<string, any> = {};
    try {
      parsedBody = JSON.parse(initResult.body);
    } catch {
      parsedBody = {};
    }

    res.status(200).json({
      ...parsedBody,
      siteKey:
        parsedBody.siteKey ||
        sec.turnstileSiteKey ||
        '1x00000000000000000000AA',
      appMeta: {
        brandName: config.brand?.name || 'ApexMobile',
        logoUrl: config.brand?.logoUrl || '/assets/app-icon.svg',
        accentColor: config.brand?.accentColor || '#EF4444',
        appSlug: sec.appSlug || 'apexmobile',
        appSerialId: sec.appSerialId || 'APM-482',
        devicePolicyMode: sec.devicePolicyMode || 'universal_human',
        proceedButtonLabel: sec.proceedButtonLabel || 'PROCEED',
        unavailableMessage: sec.unavailableMessage || '',
        helplineWhatsapp: sec.helplineWhatsapp || '',
        helplineTelegram: sec.helplineTelegram || '',
        customHeading: sec.customHeading || '',
        customNoteHtml: sec.customNoteHtml || '',
        showSpecsOnGateway: Boolean(sec.showSpecsOnGateway),
        appName: sec.customHeading || config.packageSpecs?.appName || config.brand?.name || 'ApexMobile',
        version: config.packageSpecs?.version || 'v4.8.2',
        fileSize: config.packageSpecs?.fileSize || '64.2 MB',
        operatingSystem: config.packageSpecs?.operatingSystem || 'Android 9.0+ / iOS 15.0+',
        securityStatus: config.packageSpecs?.securityStatus || 'Verified Clean',
        sha256: config.packageSpecs?.sha256 || ''
      }
    });
  });

  // 16c. Gate G1–G7 Session Clearance & Ephemeral AES-256-GCM Decrypt (`POST /api/v1/app/session-clearance`)
  app.post('/api/v1/app/session-clearance', async (req, res) => {
    const config = loadPersistedSiteConfig();
    const sec = config.securityGate || MASTER_DEFAULT_CONFIG.securityGate;

    // Ensure encryptedPrimaryUrl is populated if Admin configured plaintext primaryDownloadUrl
    if (!sec.encryptedPrimaryUrl && sec.primaryDownloadUrl) {
      try {
        sec.encryptedPrimaryUrl = await encryptVaultValue(
          sec.primaryDownloadUrl,
          undefined,
          getVaultMasterSecret()
        );
      } catch {
        // Fallback handled by decryptVaultValue
      }
    }

    const ctx = buildGateRequestContext(req, config);
    const clearance = await handleSessionClearance(ctx);

    for (const [hk, hv] of Object.entries(clearance.headers)) {
      res.setHeader(hk, hv);
    }

    // Attach helpline details if status is unavailable
    if (clearance.status === 200) {
      try {
        const parsed = JSON.parse(clearance.body);
        if (parsed.status === 'unavailable') {
          parsed.helpline = {
            whatsapp: sec.helplineWhatsapp || '',
            telegram: sec.helplineTelegram || ''
          };
          res.status(200).json(parsed);
          return;
        }
      } catch {
        // Fall through
      }
    }

    res.status(clearance.status).type('application/json').send(clearance.body);
  });

  // --------------------------------------------------------------------------
  // ROUTE HANDLING FOR PUBLIC STATIC PAGES vs. ISOLATED GATEWAY vs. LIVE ADMIN
  // --------------------------------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom'
    });

    // Serve Admin HTML with injected Firebase env config (Admin runs 100% on Live Firebase)
    app.get(['/admin', '/admin/', '/admin.html'], async (_req, res, next) => {
      try {
        const adminHtmlPath = path.resolve(process.cwd(), 'admin.html');
        let template = fs.readFileSync(adminHtmlPath, 'utf-8');
        template = await vite.transformIndexHtml('/admin.html', template);
        const fbEnv = getFirebaseEnvConfig();
        template = template.replace(
          '</head>',
          `  <script>window.__SERVER_FIREBASE_CONFIG__ = ${JSON.stringify(fbEnv.config).replace(/<\//g, '<\\/')};</script>\n</head>`
        );
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        next(e);
      }
    });

    // Serve Isolated Protected Security & Download Gateway ('/moreinfo', '/moreinfo/:slug', '/download')
    app.get(['/moreinfo', '/moreinfo/', '/moreinfo/:slug', '/download', '/download/'], async (req, res, next) => {
      try {
        res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
        res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
        res.setHeader('Referrer-Policy', 'no-referrer');

        const config = loadPersistedSiteConfig();
        const g1 = evaluateGateG1(buildGateRequestContext(req, config));

        const moreinfoHtmlPath = path.resolve(process.cwd(), 'moreinfo.html');
        let template = fs.readFileSync(moreinfoHtmlPath, 'utf-8');
        template = await vite.transformIndexHtml('/moreinfo.html', template);
        const gatewayHtml = renderGatewayPageHtml(template, config);

        // If a known crawler/headless bot hits /moreinfo directly, return HTTP 404
        res.status(g1.pass ? 200 : 404).set({ 'Content-Type': 'text/html' }).end(gatewayHtml);
      } catch (e) {
        next(e);
      }
    });

    // Serve 100% Static Pre-Compiled HTML for '/' and '/index.html' (Zero Firebase!)
    app.get(['/', '/index.html'], async (req, res, next) => {
      try {
        const indexHtmlPath = path.resolve(process.cwd(), 'index.html');
        let template = fs.readFileSync(indexHtmlPath, 'utf-8');
        template = await vite.transformIndexHtml('/', template);
        const config = loadPersistedSiteConfig();
        const staticHtml = renderCompleteStaticPageHtml(template, config, req.path);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(staticHtml);
      } catch (e) {
        next(e);
      }
    });

    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      const url = req.originalUrl.split('?')[0];
      if (url.startsWith('/api/') || url.includes('.')) {
        next();
        return;
      }

      try {
        const indexHtmlPath = path.resolve(process.cwd(), 'index.html');
        let template = fs.readFileSync(indexHtmlPath, 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        const config = loadPersistedSiteConfig();
        const staticHtml = renderCompleteStaticPageHtml(template, config, url);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(staticHtml);
      } catch (e) {
        next(e);
      }
    });
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath, { index: false }));

    app.get(['/admin', '/admin/', '/admin.html'], (_req, res) => {
      const adminHtmlPath = path.join(distPath, 'admin.html');
      let rawHtml = fs.readFileSync(adminHtmlPath, 'utf-8');
      const fbEnv = getFirebaseEnvConfig();
      rawHtml = rawHtml.replace(
        '</head>',
        `  <script>window.__SERVER_FIREBASE_CONFIG__ = ${JSON.stringify(fbEnv.config).replace(/<\//g, '<\\/')};</script>\n</head>`
      );
      res.status(200).set({ 'Content-Type': 'text/html' }).end(rawHtml);
    });

    app.get(['/moreinfo', '/moreinfo/', '/moreinfo/:slug', '/download', '/download/'], (req, res) => {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
      res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
      res.setHeader('Referrer-Policy', 'no-referrer');

      const config = loadPersistedSiteConfig();
      const g1 = evaluateGateG1(buildGateRequestContext(req, config));

      const moreinfoPath = path.join(distPath, 'moreinfo.html');
      const fallbackPath = path.resolve(process.cwd(), 'moreinfo.html');
      const rawHtml = fs.readFileSync(fs.existsSync(moreinfoPath) ? moreinfoPath : fallbackPath, 'utf-8');
      const gatewayHtml = renderGatewayPageHtml(rawHtml, config);
      res.status(g1.pass ? 200 : 404).set({ 'Content-Type': 'text/html' }).end(gatewayHtml);
    });

    app.get('*', (req, res) => {
      const url = req.originalUrl.split('?')[0];
      const indexHtmlPath = path.join(distPath, 'index.html');
      const rawHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
      const config = loadPersistedSiteConfig();
      const staticHtml = renderCompleteStaticPageHtml(rawHtml, config, url);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(staticHtml);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`⚡ Master Live-Firebase Admin + Static Public Compiler running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
