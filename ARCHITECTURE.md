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

## 5. Hardened Admin Authentication & Brute-Force Protection (`server.ts`)

1. **Constant-Time Credential Verification (`crypto.timingSafeEqual`)**:
   - Admin login (`/api/admin/login`) and session/Bearer token checks compare SHA-256 digests using `crypto.timingSafeEqual` (`safeTimingCompare`) to eliminate timing side-channel attacks.
2. **IP Rate Limiting & Security Headers**:
   - `/api/admin/login` enforces a strict rate limit (`15 failed attempts per 10-minute window` per IP, returning `HTTP 429 Too Many Requests` with `Retry-After` seconds).
   - Responses include hardened security headers (`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Cache-Control: no-store` on `/api/admin/*`).

---

## 6. Smartphone-First Admin Studio UX (`/admin.html` & `/admin.js`)

1. **Ultra-Compact Sticky Top Region (`88px` Total = `<11%` of Mobile Viewport)**:
   - Top bar (`.topbar-inner`) is a single `48px` row (`Logo + Brand Title + Live Site + Publish + Sign Out`).
   - Section switcher (`.mobile-nav-bar`) is a single `40px` horizontal touch-scrollable pill strip (`1. Overview`, `2. News`, `3. Brand & Colors`, `4. Specs`, `5. Sections`, `6. FAQs`, `7. Footer & Legal`, `8. SEO & Links`).
   - The detailed `"📍 Currently Editing"` context banner and dropdown selector scroll naturally with the workspace so they never crowd out form inputs when the smartphone keyboard opens.

---

## 7. Modular Codebase Organization

| File Path | Responsibility |
| :--- | :--- |
| `/src/utils/cms-types.ts` | TypeScript interfaces (`SiteConfig`, `InternalLinkRule`, `FooterQuickLink`, `UiCustomizationConfig`, `DomainSeoConfig`), `stripHtmlToExcerpt`, `MASTER_DEFAULT_CONFIG`, and `mergeSiteConfig()`. |
| `/src/utils/cms-seo.ts` | Route resolver (`resolveRouteView`), `sanitizeEditorialHtmlForSeo`, `applySmartInternalLinks`, `@graph` JSON-LD schema (`buildJsonLdSchema`), `generateSitemapXml`, `generateWebManifestJson`, `generateRobotsTxt`, `generateRssFeedXml`, and 9-point `auditSiteSeoHealth`. |
| `/src/utils/cms-renderer.ts` | Scoped HTML renderers (`renderHamburgerDrawerHtml`, `buildPartialRoutePayload`, `renderCompleteStaticPageHtml` with inline theme CSS vars, LCP preload & internal crawl hubs). |
| `/src/utils/static-compiler.ts` | Static site compiler (`compileStaticSiteBundle`) outputting all pre-rendered HTML pages, `/manifest.webmanifest`, `/sitemap.xml`, and `/static-routes/*.json` into `/dist-public`. |
| `/src/utils/github-publisher.ts` | GitHub REST API Git Data integration (`verifyGitHubRepoAccess`, `pushStaticFilesToGitHub`) using a GitHub Fine-Grained Personal Access Token (`github_pat_...`). |
| `/src/utils/cms-engine.ts` | Barrel index re-exporting all CMS modules. |
| `/app.js` | Lightweight **100% Static Public Website Router** (zero Firebase imports). |
| `/admin.html` & `/admin.js` | **Live-Firebase Admin Studio** with `88px` mobile sticky chrome, 1-Tap Color Theme Presets, Visual Color Pickers, Full Footer Customizer, Smart Internal Link Manager, and GitHub Static Publisher. |
| `/firebase-config.js` | Admin-only Live Firebase v10+ Firestore & API client. |
| `/server.ts` | Express server with hardened constant-time Admin Auth, rate limiting, content sanitization, static route serving, and GitHub publisher routes. |
| `/SECURITY_AND_DOWNLOAD_ARCHITECTURE.md` | Complete architectural blueprint for the **Isolated, Bot-Shielded Security & Download Gate (`/download` / `/more-info`)**, detailing `robots.txt` disallow rules, `noindex` headers, and Admin Studio integration. |

