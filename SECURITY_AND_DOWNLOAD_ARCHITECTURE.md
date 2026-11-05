# Master Security & Isolated `/moreinfo` Download Gate Architecture (`SECURITY_AND_DOWNLOAD_ARCHITECTURE.md`)

> **Purpose of This Document:** This blueprint defines the production architecture of the **Isolated `/moreinfo` Page & Silent Backend Verification System** integrated into this **Master Cloneable Static CMS & Landing Page System** with **100% SEO protection**, **zero exposed frontend security telemetry**, and **full Live-Firebase Admin Studio control**.

---

## 1. Core Architectural Philosophy: Clean Minimal Frontend + Silent Backend Verification

Search engines (Googlebot, Bingbot) penalize landing pages that run anti-bot scripts or obfuscated redirects directly on `/`. At the same time, exposing security explanations, gate counters, or internal verification mechanics on the frontend gives scrapers, bots, and automated analyzers clues about how the verification works.

Therefore, this system enforces **three strict principles**:

1. **Public SEO Pages (`/`, `/news`, `/privacy-policy`, `/terms`) Stay 100% Pure & Static**:
   - Sub-50ms FCP/LCP, 0.000 CLS, 100/100 Technical SEO Score.
   - All Download CTAs (`#hero-cta-primary`, `#floating-cta-btn`, and the 3-Bar Drawer CTA) point exclusively to `/moreinfo` with `rel="nofollow noopener"`.
   - The real destination download URL is **never** rendered in the HTML or JSON of any public page.

2. **`/moreinfo` Uses a Clean, Minimal Interface With Zero Exposed Security Explanations**:
   - Displays **only** the Brand Header, App Icon + App Name (plus Version & Size badge), any optional custom heading or note added by the Admin in `/admin`, the Cloudflare Turnstile widget, and the **PROCEED** button.
   - **Zero** visible gate progress bars, **zero** technical security labels, and **zero** redundant specification tables by default.

3. **All 7 Verification Gates Run 100% Silently in the Background & Backend**:
   - **G1**: User-Agent, automated crawler/headless rejection, and optional Strict Mobile vs Universal Human policy (`src/utils/security/gate-core.ts`).
   - **G2**: Signed HTTP-only device cookie (`__Host-rd_did` / `rd_did`) bound to IP + User-Agent HMAC-SHA256.
   - **G3**: Silent client environment probe (`collectEnv` + `hw` hash) verified during `/api/v1/app/session-init`.
   - **G4**: Single-use ephemeral nonce (`nonce`) stored in server RAM / Cloudflare KV and burned upon `/api/v1/app/verify` consumption.
   - **G5**: Cloudflare Turnstile `siteverify` validation with cryptographic `cData = sha256(sessionId : nonce : deviceId)` binding.
   - **G6**: Silent `TokenV12` touch/pointer telemetry (`t_dur`, `t_rx`, `t_cnt`, `p_type`, `c_tsx`) captured naturally when the user taps **PROCEED**.
   - **G7**: Late RAM-only AES-256-GCM decryption (`v2.<iv>.<cipher>`) via `src/utils/security/crypto-vault.ts`. The plaintext URL is decrypted only in memory after Gates G1–G6 pass and returned for immediate `window.location.replace(data.url)`.

---

## 2. End-to-End Flow: Admin Link Entry $\rightarrow$ `/moreinfo` $\rightarrow$ Final Redirect

1. **Admin Enters the Protected Destination Link in `/admin`**:
   - The Admin can enter or paste the destination download URL in **either**:
     - **Workspace 3 (Brand, Hero & UI)** $\rightarrow$ *Hero 2-Column Download Buttons* $\rightarrow$ **Protected Redirect URL (Unlocked After `/moreinfo` Verification)** (`#cta-protected-redirect-url`), **OR**
     - **Workspace 8 (Domain, SEO & Gate)** $\rightarrow$ *🔒 Protected Link & `/moreinfo` Page* $\rightarrow$ **Protected Redirect URL** (`#sec-primary-url`).
   - Both inputs stay automatically synchronized in real time. Even if an Admin pastes an external `https://...` URL into the Hero Right CTA URL field while the `/moreinfo` gate is enabled, the system automatically captures that link as the Protected Redirect URL and keeps the public homepage button pointing to `/moreinfo`.

2. **Automatic AES-256-GCM Vault Encryption on Publish**:
   - Whenever the Admin clicks **Publish Changes** (`PUT /api/config`) or clicks **🔒 Encrypt URL with AES-256-GCM Now** (`POST /api/admin/encrypt-url`), the server encrypts `securityGate.primaryDownloadUrl` using `URL_ENCRYPTION_KEY` (PBKDF2-HMAC-SHA256 100,000 iterations + AES-256-GCM) into `securityGate.encryptedPrimaryUrl` (`v2.<iv>.<cipher>`).

3. **Visitor Flow**:
   - Visitor lands on `/` and clicks **Download Official Package** (`href="/moreinfo" rel="nofollow noopener"`).
   - Browser performs a full navigation to `/moreinfo`.
   - `/moreinfo.js` silently initializes `/api/v1/app/session-init`, renders the Turnstile widget, and enables the **PROCEED** button once Turnstile completes.
   - Visitor clicks **PROCEED** $\rightarrow$ `/moreinfo.js` dispatches `/api/v1/app/verify` $\rightarrow$ server verifies G1–G6, decrypts the Admin's protected URL at Gate G7, and `/moreinfo.js` immediately executes `window.location.replace(data.url)`.

---

## 3. SEO & Crawler Isolation (`robots.txt`, Meta & HTTP Headers)

- **`/robots.txt` (`src/utils/cms-seo.ts`)**:
  ```txt
  User-agent: *
  Allow: /
  Disallow: /admin
  Disallow: /admin.html
  Disallow: /moreinfo
  Disallow: /moreinfo/
  Disallow: /moreinfo.html
  Disallow: /download
  Disallow: /download/
  Disallow: /download.html
  Disallow: /api/v1/app/
  ```
- **HTML Meta & HTTP Response Headers**:
  - `<meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex" />`
  - `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex`
  - `Cache-Control: private, no-store, no-cache, must-revalidate`
  - Excluded from `/sitemap.xml`, `/feed.xml`, and Schema.org indexing.
