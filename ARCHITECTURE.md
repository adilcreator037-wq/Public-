# Master Single-Domain CMS & Static Public Website Architecture (`ARCHITECTURE.md`)

> **Living Architectural Specification:** Whenever deep work, new SEO/Core Web Vitals enhancements, public layout updates, or Admin Studio improvements are implemented, this file is updated as the single source of truth for the entire website architecture.

This project is engineered as a **Master Cloneable CMS & Static Website Generator** with a strict separation between the **Live-Firebase Admin Studio** and the **100% Compiled Static Public Website**.

---

## 1. High-Level Data Flow: Live-Firebase Admin $\rightarrow$ GitHub Fine-Grained Token $\rightarrow$ 100% Static Public Site

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ 1. ADMIN STUDIO (/admin.html + /admin.js + /firebase-config.js)            │
│    • Runs 100% on LIVE dynamic data from Firebase Cloud Firestore          │
│      (collection: siteConfig, document: main) + Server State (/api/config) │
│    • Smartphone-First Compact UI (88px total sticky height = <11% screen)  │
│    • 1-Tap Color Theme Presets, Visual Color Pickers, Full Footer Editor,  │
│      Smart Internal Link Manager, and No-Code Visual Block Builder         │
└───────────────────────────────────────┬────────────────────────────────────┘
                                        │
                  Click "Publish" or "Compile & Push to GitHub"
                                        ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ 2. BACKEND CONTENT SANITIZER & STATIC COMPILER (/src/utils/*)              │
│    • Auto-sanitizes admin-posted HTML (auto H2/H3 anchor IDs, lazy/async   │
│      image attributes, fallback alt text, auto meta excerpts)              │
│    • Injects Smart Contextual Internal Links across body & news content    │
│    • Compiles every route into 100% hardcoded static HTML + JSON:          │
│      - /dist-public/index.html (with inline <html style="..."> theme vars) │
│      - /dist-public/news/index.html & /dist-public/news/<slug>/index.html  │
│      - /dist-public/<legal-page-slug>/index.html                           │
│      - /dist-public/static-routes/*.json (Per-route partial SPA payloads)  │
│      - /dist-public/sitemap.xml (With Google <image:image> extension)      │
│      - /dist-public/manifest.webmanifest, /robots.txt & /feed.xml         │
└───────────────────────────────────────┬────────────────────────────────────┘
                                        │
          Pushes Commit via GitHub Fine-Grained Token (/api/github/publish)
                                        ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ 3. PUBLIC WEBSITE (/index.html + /app.js)                                  │
│    • 100% Static Compiled HTML & Per-Route Static JSON                     │
│    • ZERO Firebase SDK imports, ZERO database connections on public site   │
│    • Sub-50ms edge response time on Cloudflare Pages / GitHub Pages        │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Full Website Color & Theme Designer (Zero FCP/LCP/CLS Penalty)

1. **Inline `<html style="...">` CSS Variable Compilation**:
   - Admin Workspace 3 (`🎨 Colors & Layout`) gives the admin 100% control over:
     - Primary Brand / Button Color (`--accent-color`) & Button Text Color (`--button-text-color`)
     - Browser Address Bar / PWA Theme Color (`<meta name="theme-color">`)
     - Page Background (`--bg-page`) & Content Card Surface Background (`--bg-surface`)
     - Sticky Header Background (`--bg-header`) & Sticky Header Text Color (`--text-header`)
     - Footer Background (`--bg-footer`) & Footer Text Color (`--text-footer`)
     - Card Border / Divider Color (`--border-color`), Card Corner Radius (`--card-radius`), Body Text (`--text-primary`), and Headings (`--heading-color`).
   - Includes **6 1-Tap Instant Color Theme Presets** (*Clean Light*, *Midnight Dark*, *Royal Blue*, *Emerald Tech*, *Violet Studio*, *Warm Editorial*) plus synchronized `<input type="color">` pickers and hex inputs.
   - Because `renderCompleteStaticPageHtml` compiles these CSS custom properties directly onto `<html lang="en" style="...">` at build time, the browser paints the exact custom theme on the **very first frame** with **0ms extra network requests** and **0.000 Cumulative Layout Shift (CLS)**.

---

## 3. Automated Backend Content Pipeline & Smart Contextual Internal Linking Engine

1. **Automated Mobile Post Normalization & HTML Sanitizer (`sanitizeEditorialHtmlForSeo`)**:
   - Whenever an admin posts or edits a News Article, Content Section, or Legal Page from a smartphone:
     - `stripHtmlToExcerpt()` automatically generates clean plain-text summaries and SEO `metaDescription` / `metaTitle` fallbacks if left blank.
     - `sanitizeEditorialHtmlForSeo()` automatically assigns clean `id="..."` anchor slugs to `<h2>` and `<h3>` headings (enabling deep-link jump anchors) and ensures every embedded `<img>` tag includes `loading="lazy" decoding="async"` and non-empty `alt` text.
2. **Smart Contextual Internal Linking (`applySmartInternalLinks`)**:
   - Configured in Admin Workspace 8 (`🔗 Internal Links` sub-tab) via `domainConfig.enableAutoInternalLinks` and `domainConfig.internalLinks`, plus automatic rules derived from visible Homepage Sections, Standalone Pages, and News Articles.
   - Safely scans HTML text nodes (skipping existing `<a>`, `<h1>`–`<h4>`, `<code>`, `<pre>`, `<script>`, and `<style>` blocks) and wraps the first occurrence of each target keyword phrase in a crawlable internal `<a href="..." class="internal-seo-link">` link (up to 5 contextual links per block, never self-linking to the current route).
   - Every News Article also renders an **"Official Portal Guides & Resources"** internal crawl hub linking directly to Homepage Specification & Feature anchors, the News Archive, and Related News Updates.

---

## 4. Complete Footer Customization (Workspace 7)

1. **Every Element of the Public Footer is Editable**:
   - **Footer Brand Summary Block**: Toggleable (`navigation.showFooterBrandSummary`), displaying the brand name, custom summary paragraph (`navigation.footerSummary`), and optional support email link (`navigation.showFooterContactEmail`).
   - **Legal & Trademark Disclaimer**: Toggleable (`uiConfig.showFooterDisclaimer`), with editable heading (`navigation.disclaimerHeading`) and body text (`navigation.disclaimer`).
   - **Official Legal Pages + Custom Footer Quick Links**: Editable section heading (`navigation.siteLinksHeading`), standalone legal pages (`pages` with `showInFooter: true`), and custom footer quick links (`navigation.footerQuickLinks`).
   - **Copyright Notice**: Fully editable (`navigation.copyright`).

---

## 5. Hardened Admin Authentication & Dual-Runtime Backend (`server.ts` + `/functions/`)

1. **Constant-Time Credential Verification (`crypto.timingSafeEqual` / Web Crypto HMAC-SHA256)**:
   - Admin login (`/api/admin/login`) and session/Bearer token checks (`/api/admin/verify`) validate `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_API_KEY` on both Node.js (`server.ts`) and Cloudflare Pages Serverless Functions (`/functions/api/admin/login.js` & `/functions/api/admin/verify.js`).
2. **IP Rate Limiting & Security Headers**:
   - `/api/admin/login` enforces brute-force protection and hardened security headers (`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Cache-Control: no-store`).
3. **Cloudflare Pages Edge Functions (`/functions/`)**:
   - Compiled and bundled automatically into `/dist-public/functions/` by `compileStaticSiteBundle()` so deploying to Cloudflare Pages supports `/api/admin/login`, `/api/admin/verify`, `/api/config`, `/api/v1/app/session-init`, and `/api/v1/app/session-clearance` out of the box.

---

## 6. Smartphone-First Admin Studio UX (`/admin.html` & `/admin.js`)

1. **Genuine Topbar Hamburger Menu (`#admin-hamburger-btn`) & Zero Duplication**:
   - Top bar (`.topbar-inner`) is a single `48px` sticky row featuring a genuine 3-bar **Hamburger Menu button (`#admin-hamburger-btn`)** on mobile/tablet (`< 1024px`) that opens a slide-out navigation drawer (`#admin-nav-drawer`), paired with a single sticky left sidebar (`.studio-sidebar`) on desktop (`>= 1024px`).
   - All duplicate horizontal tab strips, duplicate dropdowns, and duplicated inputs across workspaces have been eliminated. Every setting exists in **one single sequential workspace (1 to 8)** matching the top-to-bottom layout of the public website:
     - `1. Website Map & Audit` (`overview`)
     - `2. Brand, Hero & Colors` (`brand` — includes Header & 3-Bar Hamburger Menu custom links + 60fps Live Theme Mini-Preview Card)
     - `3. Package Specs Table` (`specs`)
     - `4. Content Sections` (`sections`)
     - `5. Daily News Publisher` (`news`)
     - `6. FAQs Manager` (`faqs`)
     - `7. Footer & Legal Pages` (`pages`)
     - `8. Security, SEO & Deploy` (`domain` — single authoritative `/moreinfo` 7-Gate Security & AES-256-GCM Link Vault, Smart Internal Links, Sitemap/Manifest, SERP Simulator, Firebase, and GitHub Publisher)
2. **Lag-Free 60fps Color & Theme Customizer**:
   - Color picker `input` events are throttled with `requestAnimationFrame` and immediately update `#live-theme-preview-card` without full-DOM layout thrashing.
   - Rich HTML preview boxes (`.live-preview-box`) are lazy-populated only when toggled open.

---

## 7. Modular Codebase Organization (See `/FILE_INVENTORY.md` for Full Audit Log)

| File Path | Responsibility |
| :--- | :--- |
| `/FILE_INVENTORY.md` | Authoritative file inventory table (`WANTED` vs `DELETED`) and mandatory header change log. |
| `/src/utils/cms-engine.ts` & `/src/utils/cms-seo.ts` | TypeScript interfaces (`SiteConfig`), `MASTER_DEFAULT_CONFIG`, `mergeSiteConfig()`, JSON-LD `@graph` schema (`Organization`, `WebSite`, `WebPage`, `SoftwareApplication`, `HowTo`, `FAQPage`, `NewsArticle`, `BreadcrumbList`), sitemap/manifest/robots generators, and 9-point `auditSiteSeoHealth()`. |
| `/src/utils/cms-renderer.ts` | Server-side & static HTML renderer (`renderHamburgerDrawerHtml`, `buildPartialRoutePayload` with auto-generated `<nav class="toc-jump-bar">` and 1-click SHA-256 copy button, `renderCompleteStaticPageHtml` with inline theme CSS vars). |
| `/src/utils/static-compiler.ts` | Static site compiler (`compileStaticSiteBundle`) outputting all pre-rendered public HTML pages, `/static-routes/*.json`, `/moreinfo`, and `/functions/` into `/dist-public` while strictly excluding all Admin files (`admin.html`, `admin.js`, `admin.css`, `firebase-config.js`). |
| `/src/utils/github-publisher.ts` | GitHub Fine-Grained Token Git Data API publisher with automatic empty-repository initialization (`bootstrapEmptyGitHubRepoIfNeeded`) and automatic target branch creation. |
| `/functions/*` | Cloudflare Pages Serverless Functions (`_middleware.js`, `_shared/auth.js`, `api/admin/*`, `api/config.js`, `api/v1/app/*`, `api/[[catchall]].js`). |
| `/index.html` & `/app.js` | Ultra-lightweight **100% Standalone Static Public Website** (zero imports from Admin/CMS engine, `< 2ms` `preserveSsrDom` initial hydration, zero Firebase imports). |
| `/admin.html`, `/admin.css` & `/admin.js` | **Live-Firebase Admin Studio** with dedicated `Plus Jakarta Sans` + `JetBrains Mono` SaaS stylesheet, Hamburger Menu drawer, sequential 1–8 workspaces, 1-click News/Section templates, Static Bundle Inspector, and GitHub Static Publisher. |
| `/moreinfo.html` & `/moreinfo.js` | **100% SEO-Isolated (`noindex, nofollow`) v12 7-Gate Security Gateway** with Cloudflare Turnstile and AES-256-GCM RAM link decryption. |
| `/firebase-config.js` | Admin-only Live Firebase Firestore (`siteConfig/main`) & API client. |
| `/server.ts` | Express server with hardened Admin Auth, v12 7-Gate security routes, AES-256-GCM link vault, `/api/static-bundle` inspector, and static compiler. |
| `/SECURITY_AND_DOWNLOAD_ARCHITECTURE.md` | Detailed specification of the v12 7-Gate `/moreinfo` Security Gateway and AES-256-GCM Link Vault. |


