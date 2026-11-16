# Master Codebase File Inventory & Change Log (`FILE_INVENTORY.md`)

## 1. Mandatory File Change & Deletion Log (Header Audit Trail)
> **Rule:** Every time any file is created, modified, or deleted in this repository, this header log and the file inventory table below must be updated immediately.

| Date / Turn | Action | File Path | Reason & Impact |
| :--- | :--- | :--- | :--- |
| **2026-11-15** | `DELETED` | `/src/App.tsx` | Removed unused React starter stub (`<div></div>`) not referenced by any entry point. |
| **2026-11-15** | `DELETED` | `/src/main.tsx` | Removed unused React starter mount file (`index.html` uses ultra-lightweight `/app.js`). |
| **2026-11-15** | `DELETED` | `/src/index.css` | Removed unused CSS stub (`index.html`, `admin.html`, and `moreinfo.html` inline critical CSS for 0ms FCP/LCP). |
| **2026-11-15** | `DELETED` | `/moreinfo-clean-mobile.png` | Removed temporary root screenshot artifact. |
| **2026-11-15** | `DELETED` | `/public/assets/aistudio/Screenshot_20261105-234250_70c2a830.png` | Removed temporary uploaded debugging screenshot. |
| **2026-11-15** | `UPDATED` | `/admin.html` | Added genuine 3-bar Hamburger Menu (`#admin-hamburger-btn`) + Slide-Out Drawer (`#admin-nav-drawer`), removed duplicate nav bars and duplicate inputs, consolidated 3-bar custom menu links into Workspace 2, and added 60fps `#live-theme-preview-card`. |
| **2026-11-15** | `UPDATED` | `/admin.js` | Bound Hamburger Menu drawer, updated sequential 1–8 workspace labels, added `requestAnimationFrame` 60fps color picker throttling + live preview card sync, and lazy-rendered HTML preview boxes. |
| **2026-11-15** | `CREATED` | `/functions/_shared/auth.js` | Shared Cloudflare Pages Functions Web Crypto HMAC-SHA256 & AES-256-GCM authentication and config helper. |
| **2026-11-15** | `CREATED` | `/functions/_middleware.js` | Cloudflare Pages edge middleware enforcing Gate G1 (Bot/ASN/Headless filter), `__did` device cookie, and `noindex, nofollow` headers on `/moreinfo`. |
| **2026-11-15** | `CREATED` | `/functions/api/admin/login.js` | Cloudflare Pages Function handling `POST /api/admin/login` via `ADMIN_EMAIL` and `ADMIN_PASSWORD` secrets. |
| **2026-11-15** | `CREATED` | `/functions/api/admin/verify.js` | Cloudflare Pages Function handling `GET /api/admin/verify` for session verification. |
| **2026-11-15** | `CREATED` | `/functions/api/config.js` | Cloudflare Pages Function handling `GET/POST /api/config` and syncing with Firebase Firestore (`siteConfig/main`). |
| **2026-11-15** | `CREATED` | `/functions/api/v1/app/session-init.js` | Cloudflare Pages Function handling `POST /api/v1/app/session-init` (Gates G2–G4: hardware probe + single-use nonce). |
| **2026-11-15** | `CREATED` | `/functions/api/v1/app/session-clearance.js` | Cloudflare Pages Function handling `POST /api/v1/app/session-clearance` (Gates G5–G7: Turnstile `siteverify` + `TokenV12` + AES-256-GCM RAM decryption). |
| **2026-11-15** | `CREATED` | `/functions/api/[[catchall]].js` | Cloudflare Pages catch-all API router for `/api/route`, `/api/admin/encrypt-url`, `/api/reset-config`, etc. |
| **2026-11-15** | `CREATED` | `/admin.css` | Extracted dedicated Admin Studio stylesheet (`Plus Jakarta Sans` + `JetBrains Mono` tabular numerals, 1px hairline borders, single-elevation cards, responsive drawer). |
| **2026-11-15** | `UPDATED` | `/admin.html` | Linked `/admin.css` (reducing `admin.html` from 3,437 lines to 775 lines), added 1-click News & Section quick templates, and added Static Bundle Inspector UI (`#btn-inspect-static-bundle`). |
| **2026-11-15** | `UPDATED` | `/admin.js` | Added 1-click News/Section template generators, Static Bundle Inspector handler (`handleInspectStaticBundle`), and normalized GitHub verify/publish handlers. |
| **2026-11-15** | `UPDATED` | `/app.js` | Rewrote as 100% standalone, zero-dependency ES module with `< 2ms` `preserveSsrDom` initial load hydration, responsive table wrappers, and 1-click SHA-256 copy button. |
| **2026-11-15** | `UPDATED` | `/index.html` | Added `.toc-jump-bar` and `.copy-hash-btn` styling, enforced `font-variant-numeric: tabular-nums` on specification tables, and removed thick `border-left` clichés. |
| **2026-11-15** | `UPDATED` | `/src/utils/static-compiler.ts` | Enforced 100% isolation of `/dist-public` by excluding `admin.html`, `admin.js`, `admin.css`, and `firebase-config.js` from compiled public bundles. |
| **2026-11-15** | `UPDATED` | `/src/utils/github-publisher.ts` | Added automatic empty-repository bootstrapping (`bootstrapEmptyGitHubRepoIfNeeded`) and automatic target branch creation for GitHub Fine-Grained Token pushes. |
| **2026-11-15** | `UPDATED` | `/src/utils/cms-seo.ts` | Added `WebPage`, `BreadcrumbList`, and automatic `HowTo` JSON-LD schema extraction on the homepage. |
| **2026-11-15** | `UPDATED` | `/src/utils/cms-renderer.ts` | Added On-Page Table of Contents jump bar (`<nav class="toc-jump-bar">`), 1-click SHA-256 copy button, and `og:site_name`/`og:locale`/`og:image:width`/`og:image:height` meta tags. |
| **2026-11-15** | `UPDATED` | `/server.ts` | Added `GET /api/static-bundle` inspector endpoint and `GITHUB_FINE_GRAINED_TOKEN`/`GITHUB_REPO_OWNER`/`GITHUB_REPO_NAME`/`GITHUB_BRANCH` environment variable fallbacks. |
| **2026-11-15** | `UPDATED` | `/server.ts`, `/src/utils/security/crypto-vault.ts`, `/src/utils/cms-types.ts` | Enforced `requireAdminAuth` on `/api/config`, `/api/firebase-config`, and `POST /api/firebase/test`; removed unauthenticated `window.__SERVER_FIREBASE_CONFIG__` injection; fixed Email+Password vs `ADMIN_API_KEY` login check; aligned `VAULT_ENCRYPTION_SECRET`; added pure Firebase SDK snippet parser. |
| **2026-11-15** | `UPDATED` | `/firebase-config.js`, `/admin.html`, `/admin.js` | Fixed stale `getApp()` Firebase caching via named app keys; added Bearer auth on `/api/config`; added safe JSON response parsing (preventing `"Unexpected end of JSON input"`); added 1-click SDK snippet parser, 7-field Firebase editor, live Firestore connection tester, and non-secret Environment & Security diagnostics panel. |
| **2026-11-15** | `UPDATED` | `/functions/*` | Upgraded all Cloudflare Pages Functions (`_shared/auth.js`, `_middleware.js`, `api/admin/*`, `api/config.js`, `api/v1/app/*`, `api/[[catchall]].js`) to full Web Crypto 7-Gate + AES-256-GCM vault + Firestore REST API parity with Node.js `server.ts`. |
| **2026-11-15** | `UPDATED` | `/index.html`, `/app.js`, `/src/utils/cms-renderer.ts`, `/src/utils/cms-types.ts`, `/src/utils/cms-engine.test.ts` | Eliminated homepage CLS & post-load DOM mutations by pre-rendering `.table-scroll-wrapper` and `.faq-item` in SSR, adding native FAQ accordion CSS, aligning all `/app.js` DOM selectors (`#hamburger-toggle`, `#nav-drawer`, `#navbar-logo-link`, `.sticky-header`, `#standalone-back-bar`, `#floating-cta-btn`, `#footer-links-list`, `--` route JSON), and synchronizing SSR vs SPA vs page-reload state 1:1. |
| **2026-11-15** | `UPDATED` | `/admin.html`, `/admin.css`, `/admin.js`, `/src/utils/cms-types.ts`, `/src/utils/cms-renderer.ts`, `/src/utils/cms-engine.test.ts` | Deep Admin Studio UX & 100% customization upgrade: added 1-Tap Master Clone & Brand Switcher, Live Mobile/Desktop Website Preview modal (`#site-preview-modal`), Visual Link Insertion modal (`#link-insert-modal`), Editor Undo stack, live brand/image thumbnails, URL quick-pickers across all CTAs/nav/links, Reorder/Clone/Search/Expand/Collapse controls across all 8 collections, 100% parity for `showTocJumpBar`, `relSponsored`, `priceCurrency`, `rawJsonLd`, `enableSitemapXml`, `enableRssFeed`, and fixed mobile header & slug label wrapping. |

---

## 2. Complete Repository File Classification (`WANTED` vs `DELETED`)

### A. Core Application & Public Entry Points (`WANTED`)
| File Path | Status | Architectural Role & Purpose |
| :--- | :--- | :--- |
| `/index.html` | **WANTED** | Ultra-lightweight mobile-first public HTML shell with inline CSS variables, sticky header, 3-bar hamburger drawer, hero section, `#dynamic-content`, and customizable footer. Zero external blocking fonts. |
| `/app.js` | **WANTED** | 100% standalone, zero-dependency static public router & hydration engine. Preserves pre-rendered SSR DOM in `< 2ms` (`preserveSsrDom: true`) and fetches pre-compiled `/static-routes/*.json` on SPA navigation. |
| `/admin.html` | **WANTED** | Clean, modular Master Admin CMS & SEO Studio UI featuring a genuine topbar Hamburger Menu (`#admin-hamburger-btn`), desktop sidebar, sequential 1–8 workspaces, 1-click Content Templates, and Static Bundle Inspector. |
| `/admin.css` | **WANTED** | Dedicated Admin Studio SaaS stylesheet (`Plus Jakarta Sans` + `JetBrains Mono` tabular numerals, 1px hairline borders, responsive layout). |
| `/admin.js` | **WANTED** | Admin Studio controller managing authentication, live Firebase Firestore sync, 60fps `requestAnimationFrame` theme customization, 1-click News/Section templates, Static Bundle Inspector, and GitHub static publishing. |
| `/moreinfo.html` | **WANTED** | 100% SEO-isolated (`noindex, nofollow`) minimal security clearance gateway page showing only App Icon, App Name, Cloudflare Turnstile widget, and `PROCEED` button. |
| `/moreinfo.js` | **WANTED** | Client-side v12 security gateway controller collecting hardware probe (`hw`), Turnstile token (`cData`), and physical pointer/touch telemetry (`TokenV12`). |
| `/firebase-config.js` | **WANTED** | Admin-only persistence & API client connecting Admin Studio to `/api/*` backend routes and Firebase Cloud Firestore (`siteConfig/main`). Strictly isolated from `/app.js` and `/dist-public`. |

### B. Backend Server & Static Compiler Engine (`WANTED`)
| File Path | Status | Architectural Role & Purpose |
| :--- | :--- | :--- |
| `/server.ts` | **WANTED** | Full-stack Express + Vite server providing SSR, `/api/admin/*` auth, `/api/v1/app/*` 7-gate security verification, `/api/static-bundle` inspector, and GitHub static compilation/publishing. |
| `/src/utils/cms-engine.ts` | **WANTED** | Unified CMS barrel module exporting types, default configuration, SEO engine, HTML renderer, static compiler, GitHub publisher, and v12 security gate. |
| `/src/utils/cms-seo.ts` | **WANTED** | Technical SEO engine generating `@graph` JSON-LD (`Organization`, `WebSite`, `WebPage`, `SoftwareApplication`, `HowTo`, `FAQPage`, `NewsArticle`, `BreadcrumbList`), Sitemap XML, RSS, Robots.txt, and 9-point SEO audit. |
| `/src/utils/cms-renderer.ts` | **WANTED** | Server-side & static HTML renderer injecting inline CSS theme variables, complete OpenGraph/Twitter `<head>` tags, JSON-LD schema, On-Page TOC jump bar, and pre-rendered body HTML. |
| `/src/utils/static-compiler.ts` | **WANTED** | Compiles the pure public static site (`index.html`, `/news/*`, legal pages, `/static-routes/*.json`, `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest`, `/moreinfo`, `/functions/`) into `/dist-public` with zero Admin files. |
| `/src/utils/github-publisher.ts` | **WANTED** | GitHub Fine-Grained Token Git Data API publisher with automatic empty-repo initialization (`bootstrapEmptyGitHubRepoIfNeeded`) and branch creation. |
| `/src/utils/cms-engine.test.ts` | **WANTED** | Node test suite (`node:test`) verifying CMS config merging, SEO health audit, `HowTo`/`WebPage` schema, strict Admin/Public bundle separation, and v12 7-Gate security verification. |

### C. Cloudflare Pages Serverless Functions (`WANTED`)
| File Path | Status | Architectural Role & Purpose |
| :--- | :--- | :--- |
| `/functions/_shared/auth.js` | **WANTED** | Edge-compatible Web Crypto (`crypto.subtle`) helper for Admin token signing, AES-256-GCM URL decryption, and Firebase REST config loading. |
| `/functions/_middleware.js` | **WANTED** | Edge middleware enforcing Gate G1 bot/ASN filtering, `__did` device cookie, and `X-Robots-Tag: noindex, nofollow` on `/moreinfo` and `/admin`. |
| `/functions/api/admin/login.js` | **WANTED** | Edge endpoint authenticating Admin credentials against `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_API_KEY` secrets. |
| `/functions/api/admin/verify.js` | **WANTED** | Edge endpoint verifying Admin Bearer tokens on `/admin` startup. |
| `/functions/api/config.js` | **WANTED** | Edge endpoint reading/saving `SiteConfig` to Firebase Firestore REST API and encrypting `primaryDownloadUrl` into `v2.<iv>.<cipher>`. |
| `/functions/api/v1/app/session-init.js` | **WANTED** | Edge endpoint issuing single-use cryptographic nonces after verifying hardware probe (`hw`). |
| `/functions/api/v1/app/session-clearance.js` | **WANTED** | Edge endpoint verifying Turnstile `siteverify` + `TokenV12` and decrypting the protected download link in RAM. |
| `/functions/api/[[catchall]].js` | **WANTED** | Catch-all edge router for `/api/route`, `/api/admin/encrypt-url`, and `/api/reset-config`. |

### D. Configuration, Data & Documentation (`WANTED`)
| File Path | Status | Architectural Role & Purpose |
| :--- | :--- | :--- |
| `/package.json` | **WANTED** | Project dependencies and scripts (`dev`, `build`, `start`, `lint`). |
| `/tsconfig.json` | **WANTED** | TypeScript compiler configuration. |
| `/vite.config.ts` | **WANTED** | Multi-page Vite bundler config (`index.html`, `admin.html`, `moreinfo.html`). |
| `/metadata.json` | **WANTED** | Application metadata manifest. |
| `/.env.example` | **WANTED** | Template documenting all environment variables (`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `FIREBASE_*`, `TURNSTILE_*`, `LINK_VAULT_MASTER_SECRET`). |
| `/FILE_INVENTORY.md` | **WANTED** | This authoritative file inventory and change log. |
| `/ARCHITECTURE.md` | **WANTED** | Complete system, Admin Studio, Static Compiler, and Cloudflare Pages architecture guide. |
| `/SECURITY_AND_DOWNLOAD_ARCHITECTURE.md` | **WANTED** | Detailed specification of the v12 7-Gate `/moreinfo` Security Gateway and AES-256-GCM Link Vault. |
| `/ENV_AND_CLONING_GUIDE.md` | **WANTED** | Step-by-step master cloning and deployment guide. |
| `/ENV_VARIABLES.md` | **WANTED** | Environment variable reference for Node.js and Cloudflare Pages. |

### E. Permanently Deleted Unwanted Files (`DELETED`)
| File Path | Status | Reason for Deletion |
| :--- | :--- | :--- |
| `/src/App.tsx` | **DELETED** | Unused React boilerplate stub. |
| `/src/main.tsx` | **DELETED** | Unused React entry stub. |
| `/src/index.css` | **DELETED** | Unused CSS stub. |
| `/moreinfo-clean-mobile.png` | **DELETED** | Temporary screenshot artifact. |
| `/public/assets/aistudio/Screenshot_20261105-234250_70c2a830.png` | **DELETED** | Temporary uploaded debugging screenshot. |
