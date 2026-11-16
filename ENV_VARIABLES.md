# Environment Variables & Secrets Guide (`ENV_VARIABLES.md`)

All environment variables work identically in **Node.js (`.env`)** and **Cloudflare Pages Functions (`Settings -> Environment variables`)**.

> **Security Guarantee:** Public website pages (`index.html`, `/news/*`, legal pages) are **100% static** and contain **zero** secrets, **zero** Firebase credentials, and **zero** plaintext download links.

---

## 1. Admin Studio Authentication & Session Signing

| Variable Name | Required | Purpose |
| :--- | :--- | :--- |
| `ADMIN_EMAIL` | Production | Admin email address checked by `/api/admin/login` (`admin@domain.com` in dev if unset). |
| `ADMIN_PASSWORD` | Production | Admin password checked with constant-time comparison (`admin123` in dev if unset). |
| `ADMIN_SESSION_SECRET` | Production | Secret key used to HMAC-SHA256 sign 7-day Admin Bearer session tokens (alias: `ADMIN_SECRET`). |
| `ADMIN_API_KEY` | Optional | Optional API key enabling sign-in via the **Server API Key** login tab without disabling Email + Password login. |

---

## 2. 7-Gate `/moreinfo` Security & AES-256-GCM Link Vault

| Variable Name | Required | Purpose |
| :--- | :--- | :--- |
| `VAULT_ENCRYPTION_SECRET` | Recommended | 32+ character secret key for AES-256-GCM encryption (`v2.<iv>.<cipher>`) and nonce/device HMAC signing (aliases: `AES_SECRET`, `AES_KEY`, `VAULT_SECRET_KEY`). |
| `TURNSTILE_SITE_KEY` | Production | Cloudflare Turnstile public site key (`0x4...`) (also supports `VITE_TURNSTILE_SITE_KEY` or Admin Workspace 8 UI). |
| `TURNSTILE_SECRET_KEY` | Production | Server-side Cloudflare Turnstile `siteverify` secret (`0x4...`). Never exposed in client HTML. |
| `SECURITY_DEVICE_POLICY` | Optional | Set to `universal_human` (default) or `strict_mobile_only`. |
| `UPSTASH_REDIS_REST_URL` / `TOKEN` | Optional | Distributed single-use nonce replay burn & rate-limit store across serverless edge PoPs. |

---

## 3. Live Firebase Cloud Firestore Persistence (Admin Studio Only)

You can **either** paste your `const firebaseConfig = { ... }` snippet directly inside **Admin Workspace 8 -> Card 5** OR configure the variables below in `.env` / Cloudflare Pages:

| Variable Name | Notes |
| :--- | :--- |
| `FIREBASE_API_KEY` | Firebase Web API key (`AIza...`) (also reads `VITE_FIREBASE_API_KEY`). |
| `FIREBASE_PROJECT_ID` | Firebase Project ID (also reads `VITE_FIREBASE_PROJECT_ID`). |
| `FIREBASE_AUTH_DOMAIN` | Optional (defaults to `<projectId>.firebaseapp.com`). |
| `FIREBASE_STORAGE_BUCKET` | Optional (defaults to `<projectId>.appspot.com`). |
| `FIREBASE_MESSAGING_SENDER_ID` | Optional sender ID from Firebase Project Settings. |
| `FIREBASE_APP_ID` | Firebase Web App ID (`1:...:web:...`). |
| `FIREBASE_DATABASE_ID` | Optional Firestore database ID (defaults to `(default)`). |
| `FIREBASE_CONFIG_JSON` | Optional single-line JSON string containing all Firebase keys instead of separate vars. |

> **Cloudflare Pages Tip:** Setting `FIREBASE_API_KEY` and `FIREBASE_PROJECT_ID` in Cloudflare Pages Environment Variables enables `/api/config` and `/api/v1/app/session-init` + `session-clearance` at the Cloudflare Edge to read/write live `siteConfig/main` directly from Firestore REST API!

---

## 4. GitHub Static Website Publisher (Optional in `.env`, Configurable in Workspace 8)

| Variable Name | Notes |
| :--- | :--- |
| `GITHUB_FINE_GRAINED_TOKEN` | GitHub Fine-Grained Personal Access Token (`github_pat_...`) with `Contents: Read and write` (also reads `GITHUB_TOKEN`). |
| `GITHUB_REPO_OWNER` | Target GitHub username or organization. |
| `GITHUB_REPO_NAME` | Target GitHub repository name for compiled static output. |
| `GITHUB_BRANCH` | Target branch (defaults to `main`). |
