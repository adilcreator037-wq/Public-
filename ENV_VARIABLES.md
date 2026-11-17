# Complete Hosting Environment Variables Guide (`ENV_VARIABLES.md`)

This document lists **every environment variable** read by this application across **Node.js (`server.ts`)**, **Cloudflare Pages Functions (`functions/`)**, and **Vite (`vite.config.ts`)**. Use this as your master checklist when configuring variables on your hosting provider (**Cloudflare Pages**, **Cloud Run**, **Vercel**, **Render**, **Railway**, **VPS / Docker `.env`**).

---

## Quick Classification: Secrets vs. Non-Secrets

- **SECRET variables** contain passwords, signing keys, encryption keys, private API tokens, or protected origin URLs.
  - On **Cloudflare Pages**: Add these in **Settings -> Environment variables** with type **Secret (Encrypted)** — never in plaintext `wrangler.toml` or client code.
  - Never prefix true server secrets with `VITE_` or `NEXT_PUBLIC_` on static frontends.
- **NON-SECRET variables** are public identifiers, repository metadata, hostnames, runtime flags, or client Firebase Web SDK parameters (protected by Firestore Security Rules).
  - On **Cloudflare Pages / Node.js**: Store as standard **Plaintext** or **Environment Variables**.

> **Zero Hardcoded Credentials Guarantee:** There are **no** default admin passwords, default admin emails, or default session signing secrets in the login system. Until you configure strong Admin credentials and `ADMIN_SESSION_SECRET`, the Admin Studio fails closed (`HTTP 503` / Setup Required). Public website pages (`index.html`, `/news/*`, legal pages) are 100% static and never read Firebase or server secrets.

---

## 1. Admin Studio Login, Verification & Session Security

| Variable Name | Classification | Status | Aliases Accepted | Purpose & Exact Behavior |
| :--- | :--- | :--- | :--- | :--- |
| `ADMIN_EMAIL` | **SECRET / PRIVATE** | **Required** *(unless using `ADMIN_API_KEY`)* | `ADMIN_USER`, `ADMIN_USERNAME`, `CMS_ADMIN_EMAIL` | Admin sign-in email checked by `POST /api/admin/login` using SHA-256 constant-time comparison. Must contain `@` and not be a placeholder. |
| `ADMIN_PASSWORD` | **SECRET** | **Required** *(unless using `ADMIN_API_KEY`)* | `ADMIN_PASS`, `CMS_ADMIN_PASSWORD` | Admin sign-in password (minimum **8 characters**, must not equal `ADMIN_EMAIL` or placeholder text). Checked via SHA-256 constant-time comparison. |
| `ADMIN_SESSION_SECRET` | **SECRET** | **Required (Always)** | `ADMIN_SECRET`, `SESSION_SECRET` | High-entropy key (**minimum 16 chars, recommended 32+ random chars**) used to HMAC-SHA256 sign 7-day `HttpOnly` admin session cookies and validate `iss`/`typ`/`jti`/`exp` claims. |
| `ADMIN_API_KEY` | **SECRET** | **Optional** | `CMS_ADMIN_API_KEY` | Master API key (**minimum 16 chars**) enabling login via the **Server API Key** tab or `x-admin-api-key` header. Can be used alone or alongside `ADMIN_EMAIL` + `ADMIN_PASSWORD`. |

**Generate strong secrets locally before pasting into your host:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 2. Live Firebase Cloud Firestore (Admin Studio Only)

Admin Studio persists and edits modular configuration directly in Firebase Cloud Firestore (`cmsModules/{moduleKey}` and `siteConfig/main`). The public website **never loads Firebase SDKs**. You can configure these in your hosting environment variables **or** paste the JS SDK snippet directly inside **Admin Workspace 8 -> Card 5**.

| Variable Name | Classification | Status | Aliases Accepted | Purpose & Exact Behavior |
| :--- | :--- | :--- | :--- | :--- |
| `FIREBASE_API_KEY` | **NON-SECRET** *(Web Config)* | **Recommended** *(or set in Workspace 8)* | `VITE_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Web API Key (`AIza...`) passed only to **authenticated** Admin sessions via `/api/firebase-config` and `/api/config`, and used by Cloudflare Functions Firestore REST calls. |
| `FIREBASE_PROJECT_ID` | **NON-SECRET** *(Web Config)* | **Recommended** *(or set in Workspace 8)* | `VITE_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase Project ID used to connect Admin Studio & Edge REST handlers to Firestore. |
| `FIREBASE_APP_ID` | **NON-SECRET** *(Web Config)* | **Recommended** | `VITE_FIREBASE_APP_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase Web App ID (`1:...:web:...`) required when initializing the Web SDK cleanly. |
| `FIREBASE_AUTH_DOMAIN` | **NON-SECRET** *(Web Config)* | **Optional** | `VITE_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Defaults automatically to `<FIREBASE_PROJECT_ID>.firebaseapp.com` if omitted. |
| `FIREBASE_STORAGE_BUCKET` | **NON-SECRET** *(Web Config)* | **Optional** | `VITE_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Defaults automatically to `<FIREBASE_PROJECT_ID>.appspot.com` if omitted. |
| `FIREBASE_MESSAGING_SENDER_ID` | **NON-SECRET** *(Web Config)* | **Optional** | `VITE_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Numeric sender ID from Firebase Project Settings. |
| `FIREBASE_DATABASE_ID` | **NON-SECRET** *(Web Config)* | **Optional** | `VITE_FIREBASE_DATABASE_ID` | Target Firestore database name; defaults to `(default)`. |
| `FIREBASE_CONFIG_JSON` | **NON-SECRET** *(Web Config)* | **Optional** | `VITE_FIREBASE_CONFIG_JSON` | Single-line JSON string (or pasted `firebaseConfig` snippet) supplying all Firebase fields in one variable. |

---

## 3. GitHub Admin-to-Public Static Publisher

Used by **Admin Workspace 8** (`POST /api/github/verify` and `POST /api/github/publish`) to compile zero-Firebase static files and push an atomic commit to GitHub.

| Variable Name | Classification | Status | Aliases Accepted | Purpose & Exact Behavior |
| :--- | :--- | :--- | :--- | :--- |
| `GITHUB_FINE_GRAINED_TOKEN` | **SECRET** | **Recommended** *(or set write-only in Workspace 8)* | `GITHUB_TOKEN`, `GH_TOKEN` | GitHub Fine-Grained Personal Access Token (`github_pat_...`) scoped to your public repository with `Contents: Read and write` permission. Never echoed back to browser UI. |
| `GITHUB_REPO_OWNER` | **NON-SECRET** | **Recommended** *(or set in Workspace 8)* | `GITHUB_OWNER` | GitHub username or organization owning the target static public website repository. |
| `GITHUB_REPO_NAME` | **NON-SECRET** | **Recommended** *(or set in Workspace 8)* | `GITHUB_REPO` | Repository name receiving compiled static public HTML, JSON routes, sitemap, RSS, and `/functions`. |
| `GITHUB_BRANCH` | **NON-SECRET** | **Optional** | — | Target branch name for static commits. Defaults to `main` (auto-created if repo is empty). |

---

## 4. v12 7-Gate `/moreinfo` Security Gateway, Link Vault & Turnstile

Powers `/moreinfo`, `/api/v1/app/session-init`, `/api/v1/app/session-clearance`, and AES-256-GCM URL encryption (`/api/admin/encrypt-url`).

| Variable Name | Classification | Status | Aliases Accepted | Purpose & Exact Behavior |
| :--- | :--- | :--- | :--- | :--- |
| `VAULT_ENCRYPTION_SECRET` | **SECRET** | **Required in Production** | `LINK_VAULT_MASTER_SECRET`, `AES_KEY`, `AES_SECRET`, `VAULT_SECRET_KEY`, `VITE_AES_SECRET`, `HMAC_SECRET` | Master secret (**32+ random chars**) used with SHA-256 key derivation + AES-256-GCM to encrypt protected download URLs (`v2.<iv>.<cipher>`) and decrypt them strictly in server/edge RAM after all 7 gates pass. |
| `TURNSTILE_SITE_KEY` | **NON-SECRET** *(Public Widget Key)* | **Required in Production** *(or set in Workspace 8)* | `VITE_TURNSTILE_SITE_KEY`, `CF_TURNSTILE_SITE_KEY`, `CLOUDFLARE_TURNSTILE_SITE_KEY`, `PUBLIC_TURNSTILE_SITE_KEY` | Public Cloudflare Turnstile Site Key (`0x4...`) rendered in `/moreinfo.html`. |
| `TURNSTILE_SECRET_KEY` | **SECRET** | **Required in Production** *(or set write-only in Workspace 8)* | `VITE_TURNSTILE_SECRET_KEY`, `CF_TURNSTILE_SECRET_KEY`, `CLOUDFLARE_TURNSTILE_SECRET_KEY`, `TURNSTILE_SECRET` | Private Cloudflare Turnstile Secret Key used server-side against `siteverify` to validate human Turnstile responses. Never exposed in client HTML. |
| `DID_HMAC_SECRET` | **SECRET** | **Optional** | Falls back to `GATE_SIGNING_SECRET` / `NONCE_HMAC_SECRET` / `VAULT_ENCRYPTION_SECRET` | Dedicated HMAC key signing the `HttpOnly` `__Host-rd_did` / `rd_did` device fingerprint cookie across `/moreinfo` sessions. |
| `NONCE_HMAC_SECRET` | **SECRET** | **Optional** | Falls back to `GATE_SIGNING_SECRET` / `VAULT_ENCRYPTION_SECRET` | Dedicated HMAC key signing single-use cryptographic nonces issued by `/api/v1/app/session-init`. |
| `NONCE_HMAC_SECRET_PREVIOUS` | **SECRET** | **Optional** | — | Previous `NONCE_HMAC_SECRET` kept temporarily during zero-downtime secret rotation so in-flight nonces verify cleanly. |
| `GATE_SIGNING_SECRET` | **SECRET** | **Optional** | — | Unified HMAC fallback secret used by Gate DID & Nonce signing when separate `DID_HMAC_SECRET` / `NONCE_HMAC_SECRET` are unset. |
| `PROTECTED_DOWNLOAD_URL` | **SECRET** | **Optional** | — | Server/Edge fallback destination URL if no `securityGate.primaryDownloadUrl` / `encryptedPrimaryUrl` is stored in config. |
| `TURNSTILE_SITEVERIFY_URL` | **NON-SECRET** | **Optional** | — | Custom Turnstile verification endpoint URL (defaults to official `https://challenges.cloudflare.com/turnstile/v0/siteverify`). |
| `SECURITY_DEVICE_POLICY` | **NON-SECRET** | **Optional** | — | Sets Gate G1 device filtering mode: `universal_human` (default, allows real desktop & mobile humans while blocking bots/cloud ASNs) or `strict_mobile_only`. |
| `APP_DAILY_ISSUE_CAP` | **NON-SECRET** | **Optional** | — | Optional maximum download clearances issued per 24h window (`0` or unset = unlimited). |
| `ALLOWED_HOSTNAMES` | **NON-SECRET** | **Optional** | — | Comma-separated allowlist of valid hostnames (e.g., `example.com,www.example.com`) checked when `STRICT_HOST_CHECK=1`. |
| `PUBLIC_DOMAIN` | **NON-SECRET** | **Optional** | `VITE_PUBLIC_DOMAIN` | Public domain added automatically to allowed hostnames and security gate origin checks. |
| `STRICT_HOST_CHECK` | **NON-SECRET** | **Optional** | — | Set to `1` to block requests whose `Host` header does not match `ALLOWED_HOSTNAMES` / `PUBLIC_DOMAIN`. |
| `STRICT_ORIGIN_AUTH` | **NON-SECRET** | **Optional** | — | Set to `1` (alongside `X_CF_AUTH_SECRET`) to require the `X-CF-Auth` proxy authentication header from Cloudflare Workers/CDN to your origin server. |
| `X_CF_AUTH_SECRET` | **SECRET** | **Optional** | — | Shared secret header (`x-cf-auth`) validated when `STRICT_ORIGIN_AUTH=1` to stop direct-to-origin bypass attacks. |
| `UPSTASH_REDIS_REST_URL` | **NON-SECRET** *(Endpoint URL)* | **Optional** *(Recommended at scale)* | — | Upstash Redis REST URL enabling distributed multi-region single-use nonce replay burn & rate limiting across serverless edge PoPs. |
| `UPSTASH_REDIS_REST_TOKEN` | **SECRET** | **Optional** *(Required if Redis URL set)* | — | Upstash Redis Bearer authentication token paired with `UPSTASH_REDIS_REST_URL`. |

---

## 5. Site Identity Initial Seeds (Empty Workspace Defaults)

Read once by Node.js (`server.ts`) and Edge Functions when bootstrapping a brand-new empty workspace or running `POST /api/config/reset`.

| Variable Name | Classification | Status | Aliases Accepted | Purpose & Exact Behavior |
| :--- | :--- | :--- | :--- | :--- |
| `SITE_BRAND_NAME` | **NON-SECRET** | **Optional** | — | Initial Brand Name pre-filled into `brand.name`, `shortName`, copyright, and SoftwareApplication schema on initial empty boot. |
| `SITE_CANONICAL_URL` | **NON-SECRET** | **Optional** | — | Initial canonical base URL (e.g. `https://example.com`) pre-filled into `seo.canonicalUrl` and `domainConfig.primaryDomain`. |
| `SITE_CONTACT_EMAIL` | **NON-SECRET** | **Optional** | — | Initial public support email pre-filled into `brand.contactEmail` and legal templates. |

---

## 6. Hosting Server & Platform Runtime Controls

| Variable Name | Classification | Status | Default | Purpose & Exact Behavior |
| :--- | :--- | :--- | :--- | :--- |
| `PORT` | **NON-SECRET** | **Optional** | `3000` | HTTP port bound by Node.js Express server (`server.ts`). Keep `3000` in standard preview/containers unless your host injects `$PORT` (Cloud Run/Render). |
| `NODE_ENV` | **NON-SECRET** | **Recommended** | `development` | Set to `production` in deployed Node.js environments to serve built `/dist` assets cleanly with strict production checks. |
| `TRUST_PROXY` | **NON-SECRET** | **Optional** | `false` | Set to `true` **only** if Express sits behind a trusted reverse proxy that strips/overwrites `X-Forwarded-For` for login IP rate-limiting. Left `false` by default to prevent spoofed `X-Forwarded-For` bypasses. |
| `DISABLE_HMR` | **NON-SECRET** | **Optional** | `false` | Set to `true` to disable Vite Hot Module Replacement (`vite.config.ts`) in hosted preview containers. |
| `CF_PAGES` / `CF_PAGES_URL` | **NON-SECRET** | *Auto-injected* | — | Automatically set by **Cloudflare Pages** during deployments to identify the Cloudflare runtime environment. |

---

## Hosting Provider Quick-Setup Recipes

### A. Cloudflare Pages (Static Site + Serverless Functions)
1. Go to **Workers & Pages -> Your Project -> Settings -> Environment variables**.
2. Add **Production** (and optionally **Preview**) variables:
   - **Click "Encrypt" (Secret)** for:
     - `ADMIN_EMAIL`
     - `ADMIN_PASSWORD`
     - `ADMIN_SESSION_SECRET`
     - `VAULT_ENCRYPTION_SECRET`
     - `TURNSTILE_SECRET_KEY`
     - `GITHUB_FINE_GRAINED_TOKEN` *(if pushing from cloud env)*
     - `UPSTASH_REDIS_REST_TOKEN` *(if using Upstash)*
   - **Add as Plaintext (Non-Secret)** for:
     - `TURNSTILE_SITE_KEY`
     - `FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`, `FIREBASE_DATABASE_ID`
     - `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`, `GITHUB_BRANCH`
     - `PUBLIC_DOMAIN`, `SECURITY_DEVICE_POLICY`
3. Trigger **Retry deployment** (Cloudflare Pages applies updated environment variables on the next deployment).

### B. Node.js VPS / Docker / Cloud Run / Render / Railway
1. Copy `.env.example` to `.env` locally (never commit `.env` to Git) OR add each key/value in your provider's **Environment Variables / Secrets** dashboard.
2. Always include `NODE_ENV="production"` and the minimum required keys:
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
   - `ADMIN_SESSION_SECRET`
   - `VAULT_ENCRYPTION_SECRET`
3. Build and start:
   ```bash
   npm run build
   npm run start
   ```
