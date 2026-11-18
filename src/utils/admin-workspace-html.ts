/**
 * Authenticated Admin Studio Workspace HTML Template
 * Served ONLY after administrator session verification via GET /api/admin/workspace.
 * Ensures zero internal CMS schema, field IDs, or admin controls appear in unauthenticated /admin HTML.
 */

type ColorChoice = { hex: string; name: string };

const ACCENT_COLOR_CHOICES: ColorChoice[] = [
  { hex: '#EF4444', name: 'Crimson Red' },
  { hex: '#2563EB', name: 'Royal Blue' },
  { hex: '#059669', name: 'Emerald Green' },
  { hex: '#7C3AED', name: 'Violet' },
  { hex: '#EA580C', name: 'Warm Orange' },
  { hex: '#0F172A', name: 'Slate Ink' }
];

const SURFACE_COLOR_CHOICES: ColorChoice[] = [
  { hex: '#FFFFFF', name: 'Pure White' },
  { hex: '#F8FAFC', name: 'Soft Slate' },
  { hex: '#EFF6FF', name: 'Ice Blue' },
  { hex: '#ECFDF5', name: 'Mint Tint' },
  { hex: '#FAF5FF', name: 'Soft Lavender' },
  { hex: '#0B0F19', name: 'Midnight Dark' }
];

const TEXT_COLOR_CHOICES: ColorChoice[] = [
  { hex: '#0F172A', name: 'Deep Slate' },
  { hex: '#111827', name: 'Charcoal Black' },
  { hex: '#1F2937', name: 'Body Gray' },
  { hex: '#475569', name: 'Muted Slate' },
  { hex: '#E2E8F0', name: 'Light Silver' },
  { hex: '#FFFFFF', name: 'Crisp White' }
];

const BORDER_COLOR_CHOICES: ColorChoice[] = [
  { hex: '#E2E8F0', name: 'Cool Hairline' },
  { hex: '#CBD5E1', name: 'Medium Slate' },
  { hex: '#BFDBFE', name: 'Soft Blue' },
  { hex: '#A7F3D0', name: 'Soft Green' },
  { hex: '#E9D5FF', name: 'Soft Purple' },
  { hex: '#1E293B', name: 'Dark Border' }
];

function renderVisualColorControl(id: string, label: string, defaultHex: string, choices: ColorChoice[]): string {
  const dots = choices
    .map(
      (c) =>
        `<button type="button" class="color-choice-dot" data-color-choice-for="${id}" data-color="${c.hex}" title="${c.name}" aria-label="${label}: ${c.name}" style="background:${c.hex}"></button>`
    )
    .join('');

  return `<div class="visual-color-control" data-color-control-for="${id}">
    <input type="hidden" id="${id}" value="${defaultHex}" />
    <div class="color-dots-row" role="group" aria-label="${label}">
      ${dots}
      <label class="color-custom-swatch" title="Pick a custom color">
        <input type="color" class="color-swatch-picker" data-color-sync="${id}" value="${defaultHex}" aria-label="Custom ${label}" />
        <span class="color-preview-chip" data-color-chip-for="${id}" style="background:${defaultHex}"></span>
        <span class="color-custom-swatch-label">Custom</span>
      </label>
    </div>
  </div>`;
}

export const ADMIN_WORKSPACE_SHELL_HTML: string = `<!-- Top Header Bar -->
      <header class="topbar">
        <div class="topbar-inner">
          <div class="topbar-left">
            <button
              type="button"
              id="admin-hamburger-btn"
              class="admin-hamburger-btn"
              aria-label="Open Navigation Menu"
              aria-expanded="false"
            >
              <span class="admin-hamburger-bar"></span>
              <span class="admin-hamburger-bar"></span>
              <span class="admin-hamburger-bar"></span>
            </button>
            <img id="topbar-logo" class="topbar-logo" alt="Logo" width="24" height="24" hidden />
            <div class="topbar-brand-stack">
              <div class="topbar-title" id="topbar-brand-title">Workspace Studio</div>
              <div class="topbar-status">
                <span class="status-dot" id="storage-dot" aria-hidden="true"></span>
                <span id="storage-status-text">Live Admin Workspace</span>
              </div>
            </div>
          </div>

          <div class="topbar-actions">
            <button type="button" id="btn-open-preview-modal" class="btn btn-sm">Preview</button>
            <a href="/" target="_blank" rel="noopener" class="btn btn-sm topbar-public-link">Public Site ↗</a>
            <button type="button" id="btn-top-save" class="btn btn-primary btn-sm">Publish</button>
            <button type="button" id="btn-logout" class="btn btn-sm">Sign Out</button>
          </div>
        </div>
      </header>

      <!-- Non-Sticky Horizontal Mobile Quick-Tab Strip (1-Tap Smartphone Switcher) -->
      <nav class="mobile-quick-tabs" aria-label="Workspace Switcher">
        <button type="button" class="nav-tab active" data-tab="overview">Overview</button>
        <button type="button" class="nav-tab" data-tab="brand">Brand &amp; Colors</button>
        <button type="button" class="nav-tab" data-tab="hero">Hero &amp; Buttons</button>
        <button type="button" class="nav-tab" data-tab="specs">Package Table</button>
        <button type="button" class="nav-tab" data-tab="sections">Page Sections</button>
        <button type="button" class="nav-tab" data-tab="news">Daily News</button>
        <button type="button" class="nav-tab" data-tab="faqs">FAQs</button>
        <button type="button" class="nav-tab" data-tab="pages">Menu &amp; Pages</button>
        <button type="button" class="nav-tab" data-tab="security">MoreInfo Gate</button>
        <button type="button" class="nav-tab" data-tab="links">Internal Links</button>
        <button type="button" class="nav-tab" data-tab="domain">Domain &amp; SEO</button>
        <button type="button" class="nav-tab" data-tab="deploy">GitHub &amp; Firebase</button>
      </nav>

      <!-- Mobile / Tablet Categorized Navigation Drawer -->
      <div id="admin-nav-backdrop" class="admin-nav-backdrop"></div>
      <nav id="admin-nav-drawer" class="admin-nav-drawer" aria-label="Admin Navigation Drawer">
        <div class="drawer-header-row">
          <span class="sidebar-group-label" style="padding:0;">Workspace Sections</span>
          <button type="button" id="admin-drawer-close" class="btn btn-sm" aria-label="Close menu">Close</button>
        </div>

        <div class="sidebar-group-label">Start</div>
        <button type="button" class="nav-tab active" data-tab="overview">
          <span>Overview &amp; Quick Setup</span>
          <span class="nav-count" id="drawer-count-seo">0%</span>
        </button>

        <div class="sidebar-group-label">Look &amp; First Screen</div>
        <button type="button" class="nav-tab" data-tab="brand">
          <span>Brand, Logos &amp; Colors</span>
        </button>
        <button type="button" class="nav-tab" data-tab="hero">
          <span>Hero &amp; Download Buttons</span>
        </button>

        <div class="sidebar-group-label">Homepage Blocks</div>
        <button type="button" class="nav-tab" data-tab="specs">
          <span>Package Info Table</span>
        </button>
        <button type="button" class="nav-tab" data-tab="sections">
          <span>Page Sections</span>
        </button>
        <button type="button" class="nav-tab" data-tab="news">
          <span>Daily News</span>
        </button>
        <button type="button" class="nav-tab" data-tab="faqs">
          <span>FAQs Manager</span>
        </button>

        <div class="sidebar-group-label">Pages &amp; Menus</div>
        <button type="button" class="nav-tab" data-tab="pages">
          <span>Menu &amp; Legal Pages</span>
        </button>

        <div class="sidebar-group-label">Protection &amp; Linking</div>
        <button type="button" class="nav-tab" data-tab="security">
          <span>MoreInfo Security Gate</span>
        </button>
        <button type="button" class="nav-tab" data-tab="links">
          <span>Internal Linking System</span>
        </button>

        <div class="sidebar-group-label">SEO &amp; Publishing</div>
        <button type="button" class="nav-tab" data-tab="domain">
          <span>Domain &amp; SEO Settings</span>
        </button>
        <button type="button" class="nav-tab" data-tab="deploy">
          <span>Firebase, GitHub &amp; Logs</span>
        </button>
      </nav>

      <div class="studio-body">
        <!-- Desktop Left Sidebar Navigation (12 Clear Dedicated Workspaces) -->
        <aside class="studio-sidebar" aria-label="Admin Workspaces">
          <div class="sidebar-group-label">Start</div>
          <button type="button" class="nav-tab active" data-tab="overview">
            <span>Overview &amp; Quick Setup</span>
            <span class="nav-count" id="count-seo-score">0%</span>
          </button>

          <div class="sidebar-group-label">Look &amp; First Screen</div>
          <button type="button" class="nav-tab" data-tab="brand">
            <span>Brand, Logos &amp; Colors</span>
          </button>
          <button type="button" class="nav-tab" data-tab="hero">
            <span>Hero &amp; Download Buttons</span>
          </button>

          <div class="sidebar-group-label">Homepage Blocks</div>
          <button type="button" class="nav-tab" data-tab="specs">
            <span>Package Info Table</span>
          </button>
          <button type="button" class="nav-tab" data-tab="sections">
            <span>Page Sections</span>
            <span class="nav-count" id="count-sections">0</span>
          </button>
          <button type="button" class="nav-tab" data-tab="news">
            <span>Daily News</span>
            <span class="nav-count" id="count-news">0</span>
          </button>
          <button type="button" class="nav-tab" data-tab="faqs">
            <span>FAQs Manager</span>
            <span class="nav-count" id="count-faqs">0</span>
          </button>

          <div class="sidebar-group-label">Pages &amp; Menus</div>
          <button type="button" class="nav-tab" data-tab="pages">
            <span>Menu &amp; Legal Pages</span>
            <span class="nav-count" id="count-pages">0</span>
          </button>

          <div class="sidebar-group-label">Protection &amp; Linking</div>
          <button type="button" class="nav-tab" data-tab="security">
            <span>MoreInfo Security Gate</span>
          </button>
          <button type="button" class="nav-tab" data-tab="links">
            <span>Internal Linking System</span>
          </button>

          <div class="sidebar-group-label">SEO &amp; Publishing</div>
          <button type="button" class="nav-tab" data-tab="domain">
            <span>Domain &amp; SEO Settings</span>
          </button>
          <button type="button" class="nav-tab" data-tab="deploy">
            <span>Firebase, GitHub &amp; Logs</span>
          </button>
        </aside>

        <!-- Main Workspace Content Area -->
        <main class="cms-main">
          <!-- Context Banner: Shows Current Workspace + Which Public Page Updates -->
          <div class="workspace-context-banner">
            <div class="editing-context-row">
              <span class="editing-context-title" id="editing-now-label">Overview &amp; Quick Setup</span>
              <span class="editing-context-sep" aria-hidden="true">/</span>
              <span class="editing-context-target" id="editing-now-target">Public Site Summary &amp; Readiness Check</span>
            </div>
          </div>

          <!-- ───────────────────────────────────────────────────────────────────
               1. OVERVIEW & QUICK SETUP
               ─────────────────────────────────────────────────────────────────── -->
          <section class="tab-panel active" id="panel-overview">
            <div class="panel-header">
              <div>
                <h2>Overview &amp; Quick Website Setup</h2>
                <p>Manage live content in Firebase and publish a fast static website to your domain without touching code.</p>
              </div>
              <div class="panel-header-actions">
                <button type="button" class="btn btn-dark" data-jump-tab="deploy">Publish to GitHub</button>
                <button type="button" class="btn btn-primary" data-jump-tab="news">+ Write News Post</button>
              </div>
            </div>

            <div class="quick-add-bar" aria-label="Quick Content Actions">
              <span class="quick-add-label">Quick Shortcuts:</span>
              <button type="button" id="btn-quick-add-news" class="btn btn-sm btn-primary">+ News Post</button>
              <button type="button" id="btn-quick-add-section" class="btn btn-sm">+ Page Section</button>
              <button type="button" id="btn-quick-add-faq" class="btn btn-sm">+ FAQ Item</button>
              <button type="button" id="btn-quick-add-page" class="btn btn-sm">+ Legal Page</button>
              <button type="button" id="btn-quick-jump-logs" class="btn btn-sm btn-dark" data-jump-tab="deploy">Sync Logs →</button>
            </div>

            <div id="empty-db-workspace-guide" class="empty-db-banner" hidden>
              <div>
                <strong style="font-size:0.88rem; color:var(--text-main);">Fresh Workspace Ready — No Content Added Yet</strong>
                <div style="font-size:0.78rem; color:var(--text-sub); margin-top:3px;">
                  Fill out Quick Setup below to brand your site in seconds, or open any section from the menu to start building.
                </div>
                <div class="empty-guide-steps">
                  <button type="button" class="btn btn-sm btn-primary" data-jump-tab="brand">1. Brand &amp; Colors</button>
                  <button type="button" class="btn btn-sm" data-jump-tab="hero">2. Hero &amp; Buttons</button>
                  <button type="button" class="btn btn-sm" data-jump-tab="specs">3. Package Table</button>
                  <button type="button" class="btn btn-sm btn-dark" data-jump-tab="deploy">4. Connect GitHub →</button>
                </div>
              </div>
            </div>

            <div class="card">
              <div class="card-title">
                <span>1-Tap Website Clone &amp; Brand Setup</span>
              </div>
              <div class="card-affects">Updates across the whole site: Header title, Hero headline, Package table name, Domain URL, Contact email, and Legal pages.</div>
              <div class="card-desc">
                Launching a new site? Fill in these details once and tap <strong>Apply to Entire Website</strong>. Existing articles and custom sections stay safe.
              </div>
              <div class="form-grid cols-2">
                <div class="field">
                  <label class="field-label" for="qc-brand-name">Website / App Name</label>
                  <input type="text" id="qc-brand-name" class="input" placeholder="e.g., NovaPlayer" />
                </div>
                <div class="field">
                  <label class="field-label" for="qc-version">Latest App Version</label>
                  <input type="text" id="qc-version" class="input" placeholder="e.g., v5.2.0" />
                </div>
                <div class="field">
                  <label class="field-label" for="qc-domain">Website Domain (HTTPS)</label>
                  <input type="url" id="qc-domain" class="input" placeholder="https://example.com" />
                </div>
                <div class="field">
                  <label class="field-label" for="qc-email">Support Email Address</label>
                  <input type="email" id="qc-email" class="input" placeholder="support@example.com" />
                </div>
                <div class="field span-full">
                  <label class="field-label" for="qc-download-url">Protected Download Link (Hidden behind /moreinfo gate)</label>
                  <input type="text" id="qc-download-url" class="input" placeholder="https://cdn.example.com/releases/app.apk" />
                </div>
                <div class="field span-full">
                  <label class="field-label">Pick Main Accent Color</label>
                  ${renderVisualColorControl('qc-accent-color', 'Brand Accent Color', '#EF4444', ACCENT_COLOR_CHOICES)}
                </div>
                <div class="field span-full quick-clone-footer">
                  <span class="field-help">Updates your draft fields right away. Tap <strong>Publish</strong> afterward to save to Firebase.</span>
                  <button type="button" id="btn-apply-quick-clone" class="btn btn-dark">Apply to Entire Website</button>
                </div>
              </div>
            </div>

            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-label">SEO Readiness</div>
                <div class="stat-value" id="stat-seo-score">0 / 100</div>
                <div class="stat-sub is-warn" id="stat-seo-sub">0 of 9 checks complete</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">News Posts</div>
                <div class="stat-value" id="stat-news-count">0</div>
                <div class="stat-sub is-muted" id="stat-news-sub">No posts yet</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Legal &amp; Info Pages</div>
                <div class="stat-value" id="stat-pages-count">0</div>
                <div class="stat-sub is-muted" id="stat-pages-sub">No pages yet</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Search Engine URLs</div>
                <div class="stat-value" id="stat-sitemap-count">0</div>
                <div class="stat-sub is-muted" id="stat-sitemap-sub">Waiting for setup</div>
              </div>
            </div>

            <div class="card">
              <div class="card-title">
                <span>Live SEO Setup Checklist</span>
                <span class="field-tag" id="seo-audit-summary-tag">0 / 9 passed</span>
              </div>
              <div class="card-desc">Checks your real configuration. Tap <strong>Configure →</strong> on any item to jump straight to its screen.</div>
              <div id="seo-audit-checklist" class="audit-list"></div>
            </div>

            <div class="card">
              <div class="card-title">
                <span>Public Website Structure Map</span>
              </div>
              <div class="card-desc">Every part of your public website listed from top to bottom. Tap any row to edit that area.</div>
              <div class="visual-map-list">
                <div class="visual-map-item">
                  <div>
                    <strong>1. Brand Name, Logos &amp; Website Colors</strong>
                    <span>Controls your site name, header logo, browser icon, and overall color theme.</span>
                  </div>
                  <button type="button" class="btn btn-sm" data-jump-tab="brand">Edit Brand &amp; Colors →</button>
                </div>
                <div class="visual-map-item">
                  <div>
                    <strong>2. Top Hero Section, Banner &amp; Download Buttons</strong>
                    <span>Controls the main headline, intro paragraph, 16:9 showcase banner, and download buttons.</span>
                  </div>
                  <button type="button" class="btn btn-sm" data-jump-tab="hero">Edit Hero &amp; Buttons →</button>
                </div>
                <div class="visual-map-item">
                  <div>
                    <strong>3. Package Specifications &amp; SHA-256 Table</strong>
                    <span>Displays version, file size, Android/iOS support, security scan badge, and checksum.</span>
                  </div>
                  <button type="button" class="btn btn-sm" data-jump-tab="specs">Edit Package Table →</button>
                </div>
                <div class="visual-map-item">
                  <div>
                    <strong>4. Homepage Guides &amp; Content Sections</strong>
                    <span>Add feature highlights, installation steps, changelogs, and reorder homepage blocks.</span>
                  </div>
                  <button type="button" class="btn btn-sm" data-jump-tab="sections">Edit Page Sections →</button>
                </div>
                <div class="visual-map-item">
                  <div>
                    <strong>5. Daily News Feed &amp; Article Publisher</strong>
                    <span>Publishes standalone news pages at <code>/news/:slug</code> with RSS and sitemap support.</span>
                  </div>
                  <button type="button" class="btn btn-sm btn-primary" data-jump-tab="news">Open Daily News →</button>
                </div>
                <div class="visual-map-item">
                  <div>
                    <strong>6. Frequently Asked Questions (FAQs)</strong>
                    <span>Answers common visitor questions and powers Google rich FAQ search snippets.</span>
                  </div>
                  <button type="button" class="btn btn-sm" data-jump-tab="faqs">Edit FAQs →</button>
                </div>
                <div class="visual-map-item">
                  <div>
                    <strong>7. Header Menu, Footer &amp; Legal Pages</strong>
                    <span>Manages top navigation menu links, footer text, Privacy Policy, Terms, and Contact pages.</span>
                  </div>
                  <button type="button" class="btn btn-sm" data-jump-tab="pages">Edit Menu &amp; Pages →</button>
                </div>
                <div class="visual-map-item">
                  <div>
                    <strong>8. MoreInfo Download Protection &amp; Internal Linking</strong>
                    <span>Protects download destinations behind <code>/moreinfo</code> and links keywords across pages.</span>
                  </div>
                  <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    <button type="button" class="btn btn-sm" data-jump-tab="security">Security Gate →</button>
                    <button type="button" class="btn btn-sm" data-jump-tab="links">Internal Links →</button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- ───────────────────────────────────────────────────────────────────
               2. BRAND, LOGOS & COLORS
               ─────────────────────────────────────────────────────────────────── -->
          <section class="tab-panel" id="panel-brand">
            <div class="panel-header">
              <div>
                <h2>Brand Identity, Logos &amp; Website Colors</h2>
                <p>Set your website name, upload icons, and pick a complete color look with one tap — no color codes needed.</p>
              </div>
            </div>

            <div class="card" data-section-anchor="identity">
              <div class="card-title">
                <span>1. Website Name, Support Email &amp; Icons</span>
              </div>
              <div class="card-affects">Updates: Header logo &amp; title, browser tab icon, mobile home screen icon, and Google Search brand logo.</div>
              <div class="form-grid cols-2">
                <div class="field">
                  <label class="field-label" for="brand-name">Brand / Application Name</label>
                  <input type="text" id="brand-name" class="input" placeholder="e.g., NovaPlayer" />
                </div>
                <div class="field">
                  <label class="field-label" for="brand-short-name">
                    <span>Short App Name</span>
                    <span class="field-tag">Mobile Shortcut</span>
                  </label>
                  <input type="text" id="brand-short-name" class="input" placeholder="e.g., NovaPlayer" />
                </div>
                <div class="field">
                  <label class="field-label" for="brand-tagline">Short Tagline</label>
                  <input type="text" id="brand-tagline" class="input" placeholder="Fast &amp; Verified Release Hub" />
                </div>
                <div class="field">
                  <label class="field-label" for="brand-email">Official Support Email</label>
                  <input type="email" id="brand-email" class="input" placeholder="support@domain.com" />
                </div>

                <div class="field">
                  <label class="field-label" for="brand-logo">
                    <span>Header App Logo (36x36)</span>
                    <button type="button" class="btn btn-sm" data-upload-target="brand-logo" data-preview-target="brand-logo-thumb">Upload</button>
                  </label>
                  <div class="brand-thumb-row">
                    <img id="brand-logo-thumb" class="brand-thumb-preview" alt="Header Logo Preview" hidden />
                    <input type="text" id="brand-logo" class="input" placeholder="Paste URL or tap Upload" />
                  </div>
                </div>

                <div class="field">
                  <label class="field-label" for="brand-favicon">
                    <span>Browser Tab Favicon</span>
                    <button type="button" class="btn btn-sm" data-upload-target="brand-favicon" data-preview-target="brand-favicon-thumb">Upload</button>
                  </label>
                  <div class="brand-thumb-row">
                    <img id="brand-favicon-thumb" class="brand-thumb-preview" alt="Favicon Preview" hidden />
                    <input type="text" id="brand-favicon" class="input" placeholder="Paste URL or tap Upload" />
                  </div>
                </div>

                <div class="field">
                  <label class="field-label" for="brand-search-logo">
                    <span>Google Search Logo (512x512)</span>
                    <button type="button" class="btn btn-sm" data-upload-target="brand-search-logo" data-preview-target="brand-search-logo-thumb">Upload</button>
                  </label>
                  <div class="brand-thumb-row">
                    <img id="brand-search-logo-thumb" class="brand-thumb-preview" alt="Search Logo Preview" hidden />
                    <input type="text" id="brand-search-logo" class="input" placeholder="Uses Header Logo if empty" />
                  </div>
                </div>

                <div class="field">
                  <label class="field-label" for="brand-apple-icon">
                    <span>iPhone / iPad Icon (180x180)</span>
                    <button type="button" class="btn btn-sm" data-upload-target="brand-apple-icon" data-preview-target="brand-apple-icon-thumb">Upload</button>
                  </label>
                  <div class="brand-thumb-row">
                    <img id="brand-apple-icon-thumb" class="brand-thumb-preview" alt="Apple Touch Icon Preview" hidden />
                    <input type="text" id="brand-apple-icon" class="input" placeholder="Uses Header Logo if empty" />
                  </div>
                </div>
              </div>
            </div>

            <div class="card" data-section-anchor="theme">
              <div class="card-title">
                <span>2. Website Color Theme (Visual Picker)</span>
              </div>
              <div class="card-affects">Updates: Page background, cards, primary action buttons, header bar, typography, and footer across all public pages.</div>

              <div id="live-theme-preview-card" class="live-theme-preview-card" style="background:#F8FAFC; padding:12px;">
                <div id="ltp-surface" style="background:#FFFFFF; border:1px solid #E2E8F0; border-radius:10px; overflow:hidden;">
                  <div id="ltp-header" style="background:#FFFFFF; color:#111827; padding:8px 12px; border-bottom:1px solid #E2E8F0; display:flex; align-items:center; justify-content:space-between; font-weight:800; font-size:0.82rem;">
                    <span id="ltp-brand">Your Brand</span>
                    <span id="ltp-accent-pill" style="font-size:0.68rem; padding:2px 8px; border-radius:6px; background:#FEF2F2; color:#EF4444;">Menu</span>
                  </div>
                  <div style="padding:12px;">
                    <div id="ltp-heading" style="color:#111827; font-weight:800; font-size:0.9rem; margin-bottom:4px;">Live Website Theme Preview</div>
                    <div id="ltp-text" style="color:#1F2937; font-size:0.76rem; margin-bottom:10px;">Tap any theme preset or color dot below to preview your public site colors instantly.</div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                      <span id="ltp-btn-secondary" style="border:1.5px solid #EF4444; color:#EF4444; padding:5px 10px; border-radius:8px; font-size:0.73rem; font-weight:700;">Install Guide</span>
                      <span id="ltp-btn-primary" style="background:#EF4444; color:#FFFFFF; padding:5px 12px; border-radius:8px; font-size:0.73rem; font-weight:700;">Download Build</span>
                    </div>
                  </div>
                  <div id="ltp-footer" style="background:#0F172A; color:#F8FAFC; padding:7px 12px; font-size:0.7rem; text-align:center;">
                    Your Brand — Official Site
                  </div>
                </div>
              </div>

              <div class="field-label" style="margin-bottom: 6px">
                <span>Choose a Full Website Theme (1-Tap Balanced Colors)</span>
                <span class="field-tag">High Contrast Ready</span>
              </div>
              <div class="theme-preset-grid">
                <button type="button" class="theme-preset-btn" data-theme-preset="clean-light">
                  <span class="theme-preset-swatches">
                    <span class="theme-preset-dot" style="background: #F8FAFC"></span>
                    <span class="theme-preset-dot" style="background: #EF4444"></span>
                    <span class="theme-preset-dot" style="background: #0F172A"></span>
                  </span>
                  <span>Clean Light</span>
                </button>
                <button type="button" class="theme-preset-btn" data-theme-preset="midnight-dark">
                  <span class="theme-preset-swatches">
                    <span class="theme-preset-dot" style="background: #0B1120"></span>
                    <span class="theme-preset-dot" style="background: #3B82F6"></span>
                    <span class="theme-preset-dot" style="background: #111827"></span>
                  </span>
                  <span>Midnight Dark</span>
                </button>
                <button type="button" class="theme-preset-btn" data-theme-preset="royal-blue">
                  <span class="theme-preset-swatches">
                    <span class="theme-preset-dot" style="background: #EFF6FF"></span>
                    <span class="theme-preset-dot" style="background: #2563EB"></span>
                    <span class="theme-preset-dot" style="background: #0F172A"></span>
                  </span>
                  <span>Royal Blue</span>
                </button>
                <button type="button" class="theme-preset-btn" data-theme-preset="emerald-tech">
                  <span class="theme-preset-swatches">
                    <span class="theme-preset-dot" style="background: #ECFDF5"></span>
                    <span class="theme-preset-dot" style="background: #059669"></span>
                    <span class="theme-preset-dot" style="background: #064E3B"></span>
                  </span>
                  <span>Emerald Tech</span>
                </button>
                <button type="button" class="theme-preset-btn" data-theme-preset="violet-modern">
                  <span class="theme-preset-swatches">
                    <span class="theme-preset-dot" style="background: #FAF5FF"></span>
                    <span class="theme-preset-dot" style="background: #7C3AED"></span>
                    <span class="theme-preset-dot" style="background: #1E1B4B"></span>
                  </span>
                  <span>Violet Studio</span>
                </button>
                <button type="button" class="theme-preset-btn" data-theme-preset="warm-editorial">
                  <span class="theme-preset-swatches">
                    <span class="theme-preset-dot" style="background: #FFFBEB"></span>
                    <span class="theme-preset-dot" style="background: #EA580C"></span>
                    <span class="theme-preset-dot" style="background: #1C1917"></span>
                  </span>
                  <span>Warm Editorial</span>
                </button>
              </div>

              <div class="form-grid cols-2">
                <div class="field">
                  <label class="field-label">Main Accent Color (Buttons &amp; Links)</label>
                  ${renderVisualColorControl('brand-color', 'Primary Accent Color', '#EF4444', ACCENT_COLOR_CHOICES)}
                </div>
                <div class="field">
                  <label class="field-label">Mobile Browser Status Bar Color</label>
                  ${renderVisualColorControl('brand-theme-color', 'Browser Theme Color', '#EF4444', ACCENT_COLOR_CHOICES)}
                </div>
              </div>

              <div class="custom-colors-toggle-row">
                <div>
                  <strong>Customize Individual Area Colors</strong>
                  <div class="field-help">Optional: fine-tune page background, cards, header, text, and footer colors separately.</div>
                </div>
                <button type="button" id="btn-toggle-custom-colors" class="btn btn-sm" aria-expanded="false">Customize Individual Colors ▾</button>
              </div>

              <div id="ui-custom-colors-panel" class="custom-colors-panel" hidden>
                <div class="form-grid cols-2">
                  <div class="field">
                    <label class="field-label">Outer Page Background</label>
                    ${renderVisualColorControl('ui-bg-page', 'Outer Page Background', '#F8FAFC', SURFACE_COLOR_CHOICES)}
                  </div>
                  <div class="field">
                    <label class="field-label">Card &amp; Content Surface</label>
                    ${renderVisualColorControl('ui-bg-surface', 'Content Surface', '#FFFFFF', SURFACE_COLOR_CHOICES)}
                  </div>
                  <div class="field">
                    <label class="field-label">Top Header Bar Background</label>
                    ${renderVisualColorControl('ui-header-bg', 'Header Background', '#FFFFFF', SURFACE_COLOR_CHOICES)}
                  </div>
                  <div class="field">
                    <label class="field-label">Top Header Title Text</label>
                    ${renderVisualColorControl('ui-header-text', 'Header Text', '#111827', TEXT_COLOR_CHOICES)}
                  </div>
                  <div class="field">
                    <label class="field-label">Primary Button Text</label>
                    ${renderVisualColorControl('ui-btn-text-color', 'Button Text', '#FFFFFF', TEXT_COLOR_CHOICES)}
                  </div>
                  <div class="field">
                    <label class="field-label">Headings (H1–H3) Color</label>
                    ${renderVisualColorControl('ui-heading-color', 'Headings Color', '#111827', TEXT_COLOR_CHOICES)}
                  </div>
                  <div class="field">
                    <label class="field-label">Body Paragraph Text</label>
                    ${renderVisualColorControl('ui-text-color', 'Body Text Color', '#1F2937', TEXT_COLOR_CHOICES)}
                  </div>
                  <div class="field">
                    <label class="field-label">Card Border Color</label>
                    ${renderVisualColorControl('ui-border-color', 'Border Color', '#E2E8F0', BORDER_COLOR_CHOICES)}
                  </div>
                  <div class="field">
                    <label class="field-label">Footer Background</label>
                    ${renderVisualColorControl('ui-footer-bg', 'Footer Background', '#0F172A', [
                      { hex: '#0F172A', name: 'Deep Slate' },
                      { hex: '#090D16', name: 'Obsidian' },
                      { hex: '#064E3B', name: 'Deep Emerald' },
                      { hex: '#1E1B4B', name: 'Deep Indigo' },
                      { hex: '#1C1917', name: 'Warm Charcoal' },
                      { hex: '#F8FAFC', name: 'Light Gray' }
                    ])}
                  </div>
                  <div class="field">
                    <label class="field-label">Footer Text Color</label>
                    ${renderVisualColorControl('ui-footer-text', 'Footer Text', '#F8FAFC', TEXT_COLOR_CHOICES)}
                  </div>
                </div>
              </div>
            </div>

            <div class="card">
              <div class="card-title">
                <span>3. Font Style, Page Width &amp; Layout Options</span>
              </div>
              <div class="card-affects">Updates: Text legibility, button roundness, container width, and homepage interactive controls.</div>
              <div class="form-grid cols-2">
                <div class="field">
                  <label class="field-label" for="ui-card-radius">Button &amp; Card Corner Style</label>
                  <select id="ui-card-radius" class="select">
                    <option value="6px">Sharp Corners (6px)</option>
                    <option value="8px">Clean Standard (8px)</option>
                    <option value="12px">Modern Rounded (12px)</option>
                    <option value="16px">Soft Rounded (16px)</option>
                  </select>
                </div>
                <div class="field">
                  <label class="field-label" for="ui-max-width">Page Content Width</label>
                  <select id="ui-max-width" class="select">
                    <option value="680px">680px (Compact Reading)</option>
                    <option value="768px">768px (Balanced Standard)</option>
                    <option value="860px">860px (Medium Wide)</option>
                    <option value="960px">960px (Wide Layout)</option>
                    <option value="1080px">1080px (Extra Wide)</option>
                  </select>
                </div>
                <div class="field">
                  <label class="field-label" for="ui-font-family">Website Font Style</label>
                  <select id="ui-font-family" class="select">
                    <option value="system">Native Device Font (Fastest)</option>
                    <option value="jakarta">Plus Jakarta Sans</option>
                    <option value="inter">Inter Clean Sans</option>
                    <option value="serif">Editorial Serif (Georgia)</option>
                  </select>
                </div>
                <div class="field">
                  <label class="field-label" for="ui-font-size">Reading Text Size</label>
                  <select id="ui-font-size" class="select">
                    <option value="15px">15px (Compact)</option>
                    <option value="16px">16px (Recommended)</option>
                    <option value="17px">17px (Large Reading)</option>
                  </select>
                </div>
                <div class="field">
                  <div class="toggle-box">
                    <div>
                      <strong>Show "On This Page" Jump Bar</strong>
                      <div class="field-help">Displays quick section jump links below the hero banner.</div>
                    </div>
                    <input type="checkbox" id="ui-show-toc-bar" />
                  </div>
                </div>
                <div class="field">
                  <div class="toggle-box">
                    <div>
                      <strong>Show Subpage Quick-Switch Bar</strong>
                      <div class="field-help">Displays quick links at the top of legal &amp; news pages.</div>
                    </div>
                    <input type="checkbox" id="ui-show-subpage-pills" />
                  </div>
                </div>
                <div class="field span-full">
                  <div class="toggle-box">
                    <div>
                      <strong>Expandable FAQ Accordions</strong>
                      <div class="field-help">Visitors tap to expand FAQ answers cleanly (turn off to show all answers open).</div>
                    </div>
                    <input type="checkbox" id="ui-enable-faq-accordion" />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- ───────────────────────────────────────────────────────────────────
               3. HERO & DOWNLOAD BUTTONS
               ─────────────────────────────────────────────────────────────────── -->
          <section class="tab-panel" id="panel-hero">
            <div class="panel-header">
              <div>
                <h2>Hero Headline, Showcase Banner &amp; Download Buttons</h2>
                <p>The first screen visitors see when they open your homepage (<code>/</code>).</p>
              </div>
            </div>

            <div class="card">
              <div class="card-title">
                <span>1. Main Headline, Intro Text &amp; 16:9 Showcase Banner</span>
              </div>
              <div class="card-affects">Updates: Above-the-fold Hero section of Homepage (<code>/</code>) and fast preloaded hero image.</div>
              <div class="form-grid cols-2">
                <div class="field span-full">
                  <div class="toggle-box">
                    <div>
                      <strong>Show Top Hero Section on Homepage</strong>
                      <div class="field-help">Displays your main H1 headline and buttons at the top of the homepage.</div>
                    </div>
                    <input type="checkbox" id="ui-show-hero-section" />
                  </div>
                </div>
                <div class="field span-full">
                  <label class="field-label" for="hero-h1">
                    <span>Main Page Headline (&lt;h1&gt;)</span>
                    <span class="field-tag">Primary H1</span>
                  </label>
                  <input type="text" id="hero-h1" class="input" placeholder="e.g., Official App v5.0 — Verified Download &amp; Updates" />
                </div>
                <div class="field">
                  <label class="field-label" for="hero-meta-title">Hero Section Title (Optional)</label>
                  <input type="text" id="hero-meta-title" class="input" placeholder="Defaults to Website Meta Title" />
                </div>
                <div class="field">
                  <label class="field-label" for="hero-meta-desc">Hero Section Summary (Optional)</label>
                  <input type="text" id="hero-meta-desc" class="input" placeholder="Short summary for search engines" />
                </div>
                <div class="field span-full">
                  <label class="field-label" for="hero-intro-html">
                    <span>Intro Paragraph (Appears Directly Below Hero Buttons)</span>
                    <button type="button" class="btn btn-sm" data-toggle-preview="hero-intro-preview">Preview</button>
                  </label>
                  <div class="html-toolbar">
                    <button type="button" class="btn btn-sm btn-primary" data-open-visual-block-modal="hero-intro-html">+ Visual Block</button>
                    <button type="button" class="btn btn-sm" data-open-image-modal="hero-intro-html">+ Image</button>
                    <button type="button" class="btn btn-sm" data-open-link-modal="hero-intro-html">+ Link</button>
                    <button type="button" class="btn btn-sm" data-scalar-snippet="b" data-target="hero-intro-html">Bold</button>
                    <button type="button" class="btn btn-sm" data-scalar-snippet="p" data-target="hero-intro-html">+ Paragraph</button>
                    <button type="button" class="btn btn-sm" data-undo-target="hero-intro-html">Undo</button>
                  </div>
                  <textarea id="hero-intro-html" class="textarea" rows="3" data-preview-target="hero-intro-preview"></textarea>
                  <div id="hero-intro-preview" class="live-preview-box"></div>
                </div>
                <div class="field span-full">
                  <div class="toggle-box">
                    <div>
                      <strong>Show 16:9 Hero Banner Image</strong>
                      <div class="field-help">Locked 16:9 size prevents layout shift and speeds up Largest Contentful Paint.</div>
                    </div>
                    <input type="checkbox" id="hero-show-banner" />
                  </div>
                </div>
                <div class="field span-full">
                  <label class="field-label" for="hero-banner-url">
                    <span>Hero Banner Image</span>
                    <button
                      type="button"
                      class="btn btn-sm"
                      data-upload-target="hero-banner-url"
                      data-preview-target="hero-banner-preview"
                    >
                      Upload Image
                    </button>
                  </label>
                  <input type="text" id="hero-banner-url" class="input" placeholder="Paste image link or tap Upload Image" />
                  <img id="hero-banner-preview" class="img-mini-preview" alt="Banner Preview" hidden />
                </div>
                <div class="field">
                  <label class="field-label" for="hero-banner-alt">Banner Image Description (Alt Text for SEO)</label>
                  <input type="text" id="hero-banner-alt" class="input" placeholder="Describe what is shown in the banner..." />
                </div>
                <div class="field">
                  <label class="field-label" for="hero-banner-caption">Banner Caption (Optional)</label>
                  <input type="text" id="hero-banner-caption" class="input" placeholder="Optional caption under banner..." />
                </div>
              </div>
            </div>

            <div class="card">
              <div class="card-title">
                <span>2. Hero Action Buttons &amp; Floating Download Button</span>
              </div>
              <div class="card-affects">Updates: Two main Hero buttons on Homepage (<code>/</code>) and optional bottom-left floating button.</div>
              <div class="form-grid cols-2">
                <div class="field span-full">
                  <div class="toggle-box">
                    <div>
                      <strong>Show 2-Button Hero Action Grid</strong>
                      <div class="field-help">Displays the Secondary &amp; Primary buttons directly below the headline.</div>
                    </div>
                    <input type="checkbox" id="ui-show-hero-ctas" />
                  </div>
                </div>
                <div class="field">
                  <label class="field-label" for="cta-left-text">Left Secondary Button Text</label>
                  <input type="text" id="cta-left-text" class="input" placeholder="e.g., Install Guide" />
                </div>
                <div class="field">
                  <label class="field-label" for="cta-left-url">Left Button Destination</label>
                  <div class="url-picker-row">
                    <input type="text" id="cta-left-url" class="input" placeholder="/#technical-specifications" />
                    <select class="select url-quick-select" data-url-picker-for="cta-left-url" aria-label="Quick select URL"></select>
                  </div>
                </div>
                <div class="field">
                  <label class="field-label" for="cta-right-text">Right Primary Button Text</label>
                  <input type="text" id="cta-right-text" class="input" placeholder="e.g., Download Official Build" />
                </div>
                <div class="field">
                  <label class="field-label" for="cta-right-url">
                    <span>Right Primary Button Destination</span>
                    <span class="field-tag">/moreinfo when protected</span>
                  </label>
                  <div class="url-picker-row">
                    <input type="text" id="cta-right-url" class="input" placeholder="/moreinfo" />
                    <select class="select url-quick-select" data-url-picker-for="cta-right-url" aria-label="Quick select URL"></select>
                  </div>
                </div>
                <div class="field">
                  <div class="toggle-box">
                    <div>
                      <strong>Mark Secondary Link as Sponsored</strong>
                      <div class="field-help">Adds <code>rel="sponsored"</code> for partner/affiliate links.</div>
                    </div>
                    <input type="checkbox" id="cta-left-sponsored" />
                  </div>
                </div>
                <div class="field">
                  <div class="toggle-box">
                    <div>
                      <strong>Mark Primary Link as Sponsored</strong>
                      <div class="field-help">Applies if Primary Button links outside <code>/moreinfo</code>.</div>
                    </div>
                    <input type="checkbox" id="cta-right-sponsored" />
                  </div>
                </div>

                <div class="field span-full inline-note-box">
                  <div class="inline-note-row">
                    <div>
                      <strong style="font-size:0.8rem; color:var(--text-main);">Secret Download Link &amp; Verification Gate (<code>/moreinfo</code>)</strong>
                      <div class="field-help">Manage your protected destination file URL and human verification settings in the dedicated Security Gate workspace.</div>
                    </div>
                    <button type="button" class="btn btn-sm btn-dark" data-jump-tab="security">Open Security Gate →</button>
                  </div>
                </div>

                <div class="field span-full">
                  <div class="toggle-box">
                    <div>
                      <strong>Show Floating Bottom-Left Download Button</strong>
                      <div class="field-help">Stays pinned neatly at bottom-left as visitors read the page.</div>
                    </div>
                    <input type="checkbox" id="floating-cta-enabled" />
                  </div>
                </div>
                <div class="field">
                  <label class="field-label" for="floating-cta-text">Floating Button Label</label>
                  <input type="text" id="floating-cta-text" class="input" placeholder="e.g., Download Latest Build" />
                </div>
                <div class="field">
                  <label class="field-label" for="floating-cta-url">Floating Button Destination</label>
                  <div class="url-picker-row">
                    <input type="text" id="floating-cta-url" class="input" placeholder="/moreinfo" />
                    <select class="select url-quick-select" data-url-picker-for="floating-cta-url" aria-label="Quick select URL"></select>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- ───────────────────────────────────────────────────────────────────
               4. PACKAGE INFO TABLE
               ─────────────────────────────────────────────────────────────────── -->
          <section class="tab-panel" id="panel-specs">
            <div class="panel-header">
              <div>
                <h2>Package Specifications &amp; Checksum Table</h2>
                <p>Shown on your Homepage at <code>/#technical-specifications</code> and feeds app details to search engines.</p>
              </div>
            </div>

            <div class="card">
              <div class="card-title">Main Package Details</div>
              <div class="card-affects">Updates: Package specifications table on Homepage (<code>/</code>) and optional details box on <code>/moreinfo</code>.</div>
              <div class="form-grid cols-2">
                <div class="field span-full">
                  <div class="toggle-box">
                    <div>
                      <strong>Show Specifications Table on Homepage</strong>
                      <div class="field-help">Displays file version, size, system support, and SHA-256 checksum.</div>
                    </div>
                    <input type="checkbox" id="specs-enabled" />
                  </div>
                </div>
                <div class="field">
                  <label class="field-label" for="specs-heading">Table Section Heading</label>
                  <input type="text" id="specs-heading" class="input" placeholder="Technical Package Specifications" />
                </div>
                <div class="field">
                  <label class="field-label" for="specs-app-name">Package / App Name</label>
                  <input type="text" id="specs-app-name" class="input" placeholder="e.g., NovaPlayer" />
                </div>
                <div class="field">
                  <label class="field-label" for="specs-version">Latest Version</label>
                  <input type="text" id="specs-version" class="input" placeholder="e.g., v1.0.0 (Stable)" />
                </div>
                <div class="field">
                  <label class="field-label" for="specs-size">File Size</label>
                  <input type="text" id="specs-size" class="input" placeholder="e.g., 25 MB" />
                </div>
                <div class="field">
                  <label class="field-label" for="specs-os">Supported Devices / OS</label>
                  <input type="text" id="specs-os" class="input" placeholder="Android 9.0+ / iOS 15.0+" />
                </div>
                <div class="field">
                  <label class="field-label" for="specs-format">File Format</label>
                  <input type="text" id="specs-format" class="input" placeholder="Signed APK / Universal Package" />
                </div>
                <div class="field">
                  <label class="field-label" for="specs-license">License / Price</label>
                  <input type="text" id="specs-license" class="input" placeholder="Freeware (Clean Release)" />
                </div>
                <div class="field">
                  <label class="field-label" for="specs-security">Security Verification Status</label>
                  <input type="text" id="specs-security" class="input" placeholder="Verified Clean (0/72 Engines)" />
                </div>
                <div class="field">
                  <label class="field-label" for="specs-updated">Last Updated Date</label>
                  <input type="text" id="specs-updated" class="input" placeholder="November 2026" />
                </div>
                <div class="field span-full">
                  <label class="field-label" for="specs-sha256">
                    <span>SHA-256 Checksum</span>
                    <button type="button" id="btn-gen-sha256" class="btn btn-sm">Generate SHA-256</button>
                  </label>
                  <input type="text" id="specs-sha256" class="input" placeholder="64-character SHA-256 hash" />
                </div>
                <div class="field">
                  <label class="field-label" for="specs-meta-title">Section Meta Title (Optional)</label>
                  <input type="text" id="specs-meta-title" class="input" />
                </div>
                <div class="field">
                  <label class="field-label" for="specs-meta-desc">Section Meta Description (Optional)</label>
                  <input type="text" id="specs-meta-desc" class="input" />
                </div>
              </div>
            </div>

            <div class="card">
              <div class="card-title">
                <span>Extra Custom Rows (Optional)</span>
                <button type="button" id="btn-add-spec-row" class="btn btn-sm btn-primary">+ Add Custom Row</button>
              </div>
              <div class="card-desc">Add extra rows like Developer Name, Architecture, or Minimum RAM.</div>
              <div class="template-bar">
                <span class="template-bar-label">Quick Add:</span>
                <button type="button" class="btn btn-sm" data-spec-preset="arch">+ Architecture</button>
                <button type="button" class="btn btn-sm" data-spec-preset="dev">+ Publisher</button>
                <button type="button" class="btn btn-sm" data-spec-preset="ram">+ Min RAM</button>
                <button type="button" class="btn btn-sm" data-spec-preset="channel">+ Release Channel</button>
              </div>
              <div id="custom-specs-list" class="item-list"></div>
            </div>
          </section>

          <!-- ───────────────────────────────────────────────────────────────────
               5. PAGE SECTIONS
               ─────────────────────────────────────────────────────────────────── -->
          <section class="tab-panel" id="panel-sections">
            <div class="panel-header">
              <div>
                <h2>Homepage Content Sections &amp; Block Order</h2>
                <p>Add guides, feature highlights, changelogs, or custom visual blocks on your homepage (<code>/</code>).</p>
              </div>
              <button type="button" id="btn-add-section" class="btn btn-primary">+ Add Blank Section</button>
            </div>

            <div class="template-bar">
              <span class="template-bar-label">1-Click Section Templates:</span>
              <button type="button" class="btn btn-sm" data-section-template="features">+ Feature Overview</button>
              <button type="button" class="btn btn-sm" data-section-template="install">+ Installation Steps</button>
              <button type="button" class="btn btn-sm" data-section-template="changelog">+ Version Changelog</button>
              <button type="button" class="btn btn-sm" data-section-template="proscons">+ Verification Highlights</button>
            </div>

            <div class="list-controls-bar">
              <input type="search" id="sections-search-input" class="input list-controls-search" placeholder="Search sections by title or #slug..." />
              <div class="list-controls-actions">
                <button type="button" id="btn-sections-expand-all" class="btn btn-sm">Expand All</button>
                <button type="button" id="btn-sections-collapse-all" class="btn btn-sm">Collapse All</button>
              </div>
            </div>

            <div id="sections-list" class="item-list"></div>

            <div class="card" style="margin-top: 14px">
              <div class="card-title">
                <span>Extra Custom HTML / Visual Block (Optional)</span>
                <button type="button" class="btn btn-sm" data-toggle-preview="global-raw-html-preview">Preview</button>
              </div>
              <div class="card-affects">Updates: Renders as its own block on Homepage (<code>/</code>) at the order chosen below.</div>
              <div class="html-toolbar">
                <button type="button" class="btn btn-sm btn-primary" data-open-visual-block-modal="global-raw-html">+ Visual Block Builder</button>
                <button type="button" class="btn btn-sm btn-dark" data-open-image-modal="global-raw-html">+ Image</button>
                <button type="button" class="btn btn-sm" data-open-link-modal="global-raw-html">+ Link</button>
                <button type="button" class="btn btn-sm" data-scalar-snippet="p" data-target="global-raw-html">+ P</button>
                <button type="button" class="btn btn-sm" data-scalar-snippet="callout" data-target="global-raw-html">+ Callout</button>
                <button type="button" class="btn btn-sm" data-scalar-snippet="grid" data-target="global-raw-html">+ 2-Col Grid</button>
                <button type="button" class="btn btn-sm" data-scalar-snippet="table" data-target="global-raw-html">+ Table</button>
                <button type="button" class="btn btn-sm" data-undo-target="global-raw-html">Undo</button>
              </div>
              <textarea
                id="global-raw-html"
                class="textarea code"
                rows="5"
                data-preview-target="global-raw-html-preview"
                placeholder="<!-- Tap '+ Visual Block Builder' above or write custom HTML -->"
              ></textarea>
              <div id="global-raw-html-preview" class="live-preview-box"></div>
            </div>

            <div class="card">
              <div class="card-title">
                <span>Homepage Vertical Section Order</span>
              </div>
              <div class="card-desc">Move major blocks up or down to choose what visitors see first on the homepage.</div>
              <div id="homepage-order-list"></div>
            </div>
          </section>

          <!-- ───────────────────────────────────────────────────────────────────
               6. DAILY NEWS PUBLISHER
               ─────────────────────────────────────────────────────────────────── -->
          <section class="tab-panel" id="panel-news">
            <div class="panel-header">
              <div>
                <h2>Daily News Publisher</h2>
                <p>Each post creates its own SEO page at <code>/news/:slug</code>, updates <code>/news</code>, and adds to your RSS feed.</p>
              </div>
            </div>

            <div class="card">
              <div class="card-title">
                <span id="news-composer-heading">Write a New Daily News Post</span>
                <button type="button" id="btn-news-autofill-seo" class="btn btn-sm">Auto-Fill Slug &amp; SEO</button>
              </div>
              <div class="card-desc">
                Use a 1-click starter template or fill in your headline and story, then tap <strong>Publish News Post Now</strong>.
              </div>

              <div class="template-bar">
                <span class="template-bar-label">1-Click Post Templates:</span>
                <button type="button" class="btn btn-sm" data-news-template="release">+ Release Update</button>
                <button type="button" class="btn btn-sm" data-news-template="security">+ Security Advisory</button>
                <button type="button" class="btn btn-sm" data-news-template="guide">+ Feature Walkthrough</button>
              </div>

              <input type="hidden" id="composer-news-id" value="" />

              <div class="form-grid cols-2">
                <div class="field span-full">
                  <label class="field-label" for="composer-news-title">
                    <span>Article Headline (&lt;h1&gt;)</span>
                    <span class="field-tag">Required</span>
                  </label>
                  <input
                    type="text"
                    id="composer-news-title"
                    class="input"
                    placeholder="e.g., Official Update v5.2: Faster Downloads & Security Fixes"
                  />
                </div>

                <div class="field">
                  <label class="field-label" for="composer-news-slug">
                    <span>Article Web URL (<code>/news/:slug</code>)</span>
                    <button type="button" id="btn-composer-autoslug" class="btn btn-sm">Auto-Slug</button>
                  </label>
                  <input type="text" id="composer-news-slug" class="input" placeholder="auto-generated-from-headline" />
                </div>

                <div class="field">
                  <label class="field-label" for="composer-news-category">
                    <span>Category Label</span>
                  </label>
                  <input type="text" id="composer-news-category" class="input" list="news-category-presets" placeholder="Daily Update" />
                </div>

                <div class="field">
                  <label class="field-label" for="composer-news-date">Publish Date</label>
                  <input type="text" id="composer-news-date" class="input" placeholder="November 17, 2026" />
                </div>

                <div class="field">
                  <label class="field-label" for="composer-news-author">Author / Team Name</label>
                  <input type="text" id="composer-news-author" class="input" placeholder="Editorial Team" />
                </div>

                <div class="field">
                  <label class="field-label" for="composer-news-readtime">Read Time Label</label>
                  <input type="text" id="composer-news-readtime" class="input" placeholder="2 min read" />
                </div>

                <div class="field">
                  <label class="field-label">Highlight Article</label>
                  <div class="toggle-box">
                    <span>Mark as Featured Article</span>
                    <input type="checkbox" id="composer-news-featured" />
                  </div>
                </div>

                <div class="field span-full">
                  <label class="field-label" for="composer-news-cover-url">
                    <span>Cover Image (Optional)</span>
                    <button
                      type="button"
                      class="btn btn-sm"
                      data-upload-target="composer-news-cover-url"
                      data-preview-target="composer-news-cover-preview"
                    >
                      Upload Image
                    </button>
                  </label>
                  <input type="text" id="composer-news-cover-url" class="input" placeholder="Paste image URL or tap Upload Image..." />
                  <img id="composer-news-cover-preview" class="img-mini-preview" alt="Cover Preview" hidden />
                </div>

                <div class="field">
                  <label class="field-label" for="composer-news-cover-alt">Cover Image Alt Text (SEO)</label>
                  <input type="text" id="composer-news-cover-alt" class="input" placeholder="Describe the cover image..." />
                </div>

                <div class="field">
                  <label class="field-label" for="composer-news-cover-caption">Cover Caption (Optional)</label>
                  <input type="text" id="composer-news-cover-caption" class="input" placeholder="Caption under cover image..." />
                </div>

                <div class="field">
                  <label class="field-label" for="composer-news-cta-label">In-Article Button Text (Optional)</label>
                  <input type="text" id="composer-news-cta-label" class="input" placeholder="e.g., Download Patched Build" />
                </div>

                <div class="field">
                  <label class="field-label" for="composer-news-cta-url">In-Article Button Link (Optional)</label>
                  <input type="text" id="composer-news-cta-url" class="input" placeholder="e.g., /#technical-specifications" />
                </div>

                <div class="field span-full">
                  <label class="field-label" for="composer-news-summary">Short Summary (Shown on News Feed Cards)</label>
                  <textarea id="composer-news-summary" class="textarea" rows="2" placeholder="Write a 1-2 sentence summary..."></textarea>
                </div>

                <div class="field span-full">
                  <label class="field-label" for="composer-news-html">
                    <span>Full Article Content (Visual Blocks or HTML)</span>
                    <button type="button" id="btn-toggle-composer-preview" class="btn btn-sm">Preview</button>
                  </label>
                  <div class="html-toolbar">
                    <button type="button" class="btn btn-sm btn-primary" data-open-visual-block-modal="composer-news-html">+ Visual Block Builder</button>
                    <button type="button" class="btn btn-sm btn-dark" data-open-image-modal="composer-news-html">+ Image</button>
                    <button type="button" class="btn btn-sm" data-open-link-modal="composer-news-html">+ Link</button>
                    <button type="button" class="btn btn-sm" data-composer-snippet="b">Bold</button>
                    <button type="button" class="btn btn-sm" data-composer-snippet="p">+ P</button>
                    <button type="button" class="btn btn-sm" data-composer-snippet="h3">+ H3</button>
                    <button type="button" class="btn btn-sm" data-composer-snippet="ul">+ List</button>
                    <button type="button" class="btn btn-sm" data-composer-snippet="steps">+ Steps</button>
                    <button type="button" class="btn btn-sm" data-composer-snippet="callout">+ Callout</button>
                    <button type="button" class="btn btn-sm" data-composer-snippet="grid">+ 2-Col</button>
                    <button type="button" class="btn btn-sm" data-composer-snippet="table">+ Table</button>
                    <button type="button" class="btn btn-sm" data-composer-snippet="cta">+ Button</button>
                    <button type="button" class="btn btn-sm" data-undo-target="composer-news-html">Undo</button>
                  </div>
                  <textarea
                    id="composer-news-html"
                    class="textarea code"
                    rows="6"
                    placeholder="<p>Write your news article here or tap '+ Visual Block Builder' above...</p>"
                  ></textarea>
                  <div id="composer-live-preview" class="live-preview-box"></div>
                </div>
              </div>

              <div class="seo-subbox">
                <div class="seo-subbox-title">
                  <span>Google Search Meta Tags for This Post</span>
                  <span class="field-tag">NewsArticle Schema</span>
                </div>
                <div class="form-grid cols-2">
                  <div class="field">
                    <label class="field-label" for="composer-news-meta-title">Article Meta Title</label>
                    <input type="text" id="composer-news-meta-title" class="input" placeholder="Search title for Google..." />
                  </div>
                  <div class="field">
                    <label class="field-label" for="composer-news-meta-desc">Article Meta Description</label>
                    <input type="text" id="composer-news-meta-desc" class="input" placeholder="Short description (120-160 chars)..." />
                  </div>
                </div>
              </div>

              <div style="display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap">
                <button type="button" id="btn-publish-single-news" class="btn btn-primary">Publish News Post Now</button>
                <button type="button" id="btn-clear-news-composer" class="btn">Clear / New Post</button>
              </div>
            </div>

            <div class="card">
              <div class="card-title">News Feed Display &amp; <code>/news</code> Archive Settings</div>
              <div class="form-grid cols-2">
                <div class="field span-full">
                  <div class="toggle-box">
                    <div>
                      <strong>Show Daily News on Public Website</strong>
                      <div class="field-help">Displays latest news on the homepage and turns on the <code>/news</code> archive page.</div>
                    </div>
                    <input type="checkbox" id="news-enabled" />
                  </div>
                </div>
                <div class="field">
                  <label class="field-label" for="news-heading">News Section Heading (&lt;h2&gt;)</label>
                  <input type="text" id="news-heading" class="input" placeholder="Latest News &amp; Updates" />
                </div>
                <div class="field">
                  <label class="field-label" for="ui-home-news-limit">Max Posts Shown on Homepage</label>
                  <input type="number" id="ui-home-news-limit" class="input" min="1" max="50" />
                </div>
                <div class="field">
                  <label class="field-label" for="ui-news-readmore">Post "Read More" Button Text</label>
                  <input type="text" id="ui-news-readmore" class="input" placeholder="Read Full Article →" />
                </div>
                <div class="field">
                  <label class="field-label" for="ui-news-viewall">"View All News" Link Text</label>
                  <input type="text" id="ui-news-viewall" class="input" placeholder="View All News →" />
                </div>
                <div class="field">
                  <label class="field-label" for="news-meta-title">News Archive (/news) Meta Title</label>
                  <input type="text" id="news-meta-title" class="input" placeholder="Daily News &amp; Changelogs..." />
                </div>
                <div class="field">
                  <label class="field-label" for="news-meta-desc">News Archive (/news) Meta Description</label>
                  <input type="text" id="news-meta-desc" class="input" placeholder="Official updates and changelogs..." />
                </div>
              </div>
            </div>

            <div class="card">
              <div class="card-title">
                <span>Published News Articles</span>
                <a href="/news" target="_blank" class="btn btn-sm">Open /news Hub ↗</a>
              </div>
              <div class="list-controls-bar" style="padding:0; border:none; margin-top:8px;">
                <input type="search" id="news-search-input" class="input list-controls-search" placeholder="Filter articles by headline or category..." />
                <div class="list-controls-actions">
                  <button type="button" id="btn-news-expand-all" class="btn btn-sm">Expand All</button>
                  <button type="button" id="btn-news-collapse-all" class="btn btn-sm">Collapse All</button>
                </div>
              </div>
              <div id="news-list" class="item-list"></div>
            </div>
          </section>

          <!-- ───────────────────────────────────────────────────────────────────
               7. FAQS MANAGER
               ─────────────────────────────────────────────────────────────────── -->
          <section class="tab-panel" id="panel-faqs">
            <div class="panel-header">
              <div>
                <h2>Frequently Asked Questions (FAQs)</h2>
                <p>Shown on Homepage at <code>/#frequently-asked-questions</code> and adds Google FAQ rich snippets automatically.</p>
              </div>
              <button type="button" id="btn-add-faq" class="btn btn-primary">+ Add FAQ Question</button>
            </div>

            <div class="card">
              <div class="card-title">FAQ Section Settings</div>
              <div class="form-grid cols-2">
                <div class="field span-full">
                  <div class="toggle-box">
                    <div>
                      <strong>Enable FAQ Section &amp; FAQ Schema</strong>
                      <div class="field-help">Displays Q&amp;A accordions on homepage and outputs <code>FAQPage</code> structured data.</div>
                    </div>
                    <input type="checkbox" id="faqs-enabled" />
                  </div>
                </div>
                <div class="field">
                  <label class="field-label" for="faqs-heading">FAQ Section Heading (&lt;h2&gt;)</label>
                  <input type="text" id="faqs-heading" class="input" placeholder="Frequently Asked Questions" />
                </div>
                <div class="field">
                  <label class="field-label" for="faqs-meta-title">FAQ Section Meta Title</label>
                  <input type="text" id="faqs-meta-title" class="input" />
                </div>
                <div class="field span-full">
                  <label class="field-label" for="faqs-meta-desc">FAQ Section Meta Description</label>
                  <input type="text" id="faqs-meta-desc" class="input" />
                </div>
              </div>
            </div>

            <div class="template-bar">
              <span class="template-bar-label">1-Click Quick FAQs:</span>
              <button type="button" class="btn btn-sm" data-faq-preset="free">+ Free License FAQ</button>
              <button type="button" class="btn btn-sm" data-faq-preset="safety">+ SHA-256 Check FAQ</button>
              <button type="button" class="btn btn-sm" data-faq-preset="update">+ Safe Upgrade FAQ</button>
              <button type="button" class="btn btn-sm" data-faq-preset="compat">+ Device Support FAQ</button>
            </div>

            <div class="list-controls-bar">
              <input type="search" id="faqs-search-input" class="input list-controls-search" placeholder="Search FAQ questions or answers..." />
              <div class="list-controls-actions">
                <button type="button" id="btn-faqs-expand-all" class="btn btn-sm">Expand All</button>
                <button type="button" id="btn-faqs-collapse-all" class="btn btn-sm">Collapse All</button>
              </div>
            </div>

            <div id="faqs-list" class="item-list"></div>
          </section>

          <!-- ───────────────────────────────────────────────────────────────────
               8. HEADER MENU, FOOTER & STANDALONE LEGAL PAGES
               ─────────────────────────────────────────────────────────────────── -->
          <section class="tab-panel" id="panel-pages">
            <div class="panel-header">
              <div>
                <h2>Navigation Menu, Footer &amp; Standalone Legal Pages</h2>
                <p>Manage standalone pages (<code>/:slug</code>), top 3-bar navigation drawer links, and your global site footer.</p>
              </div>
              <div class="panel-header-actions">
                <button type="button" id="btn-autogen-legal" class="btn">Auto-Fill Brand in All Legal Pages</button>
                <button type="button" id="btn-add-page" class="btn btn-primary">+ Add Legal / Info Page</button>
              </div>
            </div>

            <div class="subcard-filter-bar" role="tablist" aria-label="Menu &amp; Pages Areas">
              <button type="button" class="subcard-pill active" data-pages-subtab="all">All Areas</button>
              <button type="button" class="subcard-pill" data-pages-subtab="legal">1. Legal &amp; Info Pages</button>
              <button type="button" class="subcard-pill" data-pages-subtab="menu">2. Header &amp; 3-Bar Menu</button>
              <button type="button" class="subcard-pill" data-pages-subtab="footer">3. Footer &amp; Quick Links</button>
            </div>

            <div class="card" data-pages-card="legal">
              <div class="card-title">1. Standalone Legal &amp; Info Pages (<code>/privacy-policy</code>, <code>/terms</code>, etc.)</div>
              <div class="card-desc">Pick a template or tap any existing page tab below to edit its content, banner, URL slug, and SEO meta tags.</div>
              <div class="template-bar" style="margin-bottom:12px;">
                <span class="template-bar-label">1-Click Page Templates:</span>
                <button type="button" class="btn btn-sm" data-page-template="about">+ About Official Portal</button>
                <button type="button" class="btn btn-sm" data-page-template="disclosure">+ Editorial Disclosure</button>
                <button type="button" class="btn btn-sm" data-page-template="mirrors">+ Mirrors &amp; Checksums</button>
              </div>
              <div id="legal-page-selector" class="page-selector-bar"></div>
              <div id="pages-list"></div>
            </div>

            <div class="card" data-pages-card="menu">
              <div class="card-title">
                <span>2. Sticky Header &amp; 3-Bar Navigation Drawer</span>
              </div>
              <div class="card-affects">Updates: Top sticky header bar, slide-down 3-bar hamburger drawer, and subpage back link.</div>
              <div class="form-grid cols-2">
                <div class="field">
                  <label class="field-label" for="ui-header-news-label">Header News Button Label</label>
                  <input type="text" id="ui-header-news-label" class="input" placeholder="News" />
                </div>
                <div class="field">
                  <label class="field-label" for="ui-back-home-label">Subpage "Back to Home" Label</label>
                  <input type="text" id="ui-back-home-label" class="input" placeholder="← Back to Main Page" />
                </div>
                <div class="field">
                  <label class="field-label" for="ui-all-news-label">Article "All News" Link Label</label>
                  <input type="text" id="ui-all-news-label" class="input" placeholder="All Daily News →" />
                </div>
                <div class="field">
                  <div class="toggle-box">
                    <div>
                      <strong>Keep Top Header Pinned on Scroll</strong>
                      <div class="field-help">Keeps navigation bar fixed at the top while scrolling.</div>
                    </div>
                    <input type="checkbox" id="ui-sticky-header" />
                  </div>
                </div>
                <div class="field">
                  <div class="toggle-box">
                    <div>
                      <strong>Show Header News Button</strong>
                      <div class="field-help">Displays the News link next to the 3-bar menu button.</div>
                    </div>
                    <input type="checkbox" id="ui-show-header-news" />
                  </div>
                </div>
                <div class="field">
                  <div class="toggle-box">
                    <div>
                      <strong>Show News Post Count Badge</strong>
                      <div class="field-help">Shows e.g. "News (3)" when posts exist.</div>
                    </div>
                    <input type="checkbox" id="ui-show-news-count" />
                  </div>
                </div>
                <div class="field">
                  <div class="toggle-box">
                    <div>
                      <strong>List Homepage Sections in 3-Bar Menu</strong>
                      <div class="field-help">Adds visible homepage sections automatically to the drawer.</div>
                    </div>
                    <input type="checkbox" id="ui-drawer-auto-sections" />
                  </div>
                </div>
                <div class="field">
                  <div class="toggle-box">
                    <div>
                      <strong>Show Latest News in 3-Bar Menu</strong>
                      <div class="field-help">Displays recent articles inside the slide-down menu.</div>
                    </div>
                    <input type="checkbox" id="ui-drawer-show-news" />
                  </div>
                </div>
                <div class="field">
                  <div class="toggle-box">
                    <div>
                      <strong>Show Legal Pages in 3-Bar Menu</strong>
                      <div class="field-help">Lists Privacy Policy, Terms, and Contact links in the drawer.</div>
                    </div>
                    <input type="checkbox" id="ui-drawer-show-legal" />
                  </div>
                </div>
                <div class="field">
                  <div class="toggle-box">
                    <div>
                      <strong>Show Subpage Breadcrumb Back Bar</strong>
                      <div class="field-help">Shows "Back to Home" bar on <code>/news</code> and legal pages.</div>
                    </div>
                    <input type="checkbox" id="ui-show-breadcrumbs" />
                  </div>
                </div>
                <div class="field span-full">
                  <div class="toggle-box">
                    <div>
                      <strong>Show Download CTA Button at Bottom of 3-Bar Menu</strong>
                      <div class="field-help">Displays your main download button inside the navigation drawer.</div>
                    </div>
                    <input type="checkbox" id="ui-drawer-show-cta" />
                  </div>
                </div>
              </div>

              <div class="card-subsection">
                <div class="card-title">
                  <span>Custom Drawer Menu Links</span>
                  <button type="button" id="btn-add-menu-link" class="btn btn-sm btn-primary">+ Add Custom Menu Link</button>
                </div>
                <div class="card-desc">Add custom internal or external links inside the slide-down 3-bar menu.</div>
                <div id="menu-links-list" class="item-list"></div>
              </div>
            </div>

            <div class="card" data-pages-card="footer">
              <div class="card-title">
                <span>3. Website Footer Content, Disclaimer &amp; Quick Links</span>
              </div>
              <div class="card-affects">Updates: Global footer shown at the bottom of every public page.</div>
              <div class="form-grid cols-2">
                <div class="field">
                  <div class="toggle-box">
                    <div>
                      <strong>Show Brand Summary in Footer</strong>
                      <div class="field-help">Displays brand title and summary above footer links.</div>
                    </div>
                    <input type="checkbox" id="nav-show-footer-summary" />
                  </div>
                </div>
                <div class="field">
                  <div class="toggle-box">
                    <div>
                      <strong>Show Support Email in Footer</strong>
                      <div class="field-help">Displays clickable email inside the footer summary block.</div>
                    </div>
                    <input type="checkbox" id="nav-show-footer-email" />
                  </div>
                </div>
                <div class="field span-full">
                  <label class="field-label" for="nav-footer-summary">Footer Summary / About Text</label>
                  <textarea id="nav-footer-summary" class="textarea" rows="2" placeholder="Official release portal providing verified software packages..."></textarea>
                </div>
                <div class="field">
                  <div class="toggle-box">
                    <div>
                      <strong>Show Legal Disclaimer Text</strong>
                      <div class="field-help">Displays disclaimer notice above the footer links.</div>
                    </div>
                    <input type="checkbox" id="ui-show-footer-disclaimer" />
                  </div>
                </div>
                <div class="field">
                  <div class="toggle-box">
                    <div>
                      <strong>Show Footer Links Heading</strong>
                      <div class="field-help">Displays column heading above footer page links.</div>
                    </div>
                    <input type="checkbox" id="ui-show-footer-links-heading" />
                  </div>
                </div>
                <div class="field">
                  <label class="field-label" for="footer-disclaimer-heading">Disclaimer Heading</label>
                  <input type="text" id="footer-disclaimer-heading" class="input" />
                </div>
                <div class="field">
                  <label class="field-label" for="footer-links-heading">Footer Links Heading</label>
                  <input type="text" id="footer-links-heading" class="input" />
                </div>
                <div class="field">
                  <label class="field-label" for="footer-meta-title">Disclaimer Meta Title</label>
                  <input type="text" id="footer-meta-title" class="input" />
                </div>
                <div class="field">
                  <label class="field-label" for="footer-meta-desc">Disclaimer Meta Description</label>
                  <input type="text" id="footer-meta-desc" class="input" />
                </div>
                <div class="field span-full">
                  <label class="field-label" for="footer-disclaimer-text">Legal Disclaimer Paragraph</label>
                  <textarea id="footer-disclaimer-text" class="textarea" rows="3"></textarea>
                </div>
                <div class="field span-full">
                  <label class="field-label" for="footer-copyright-text">Copyright Notice Line</label>
                  <input type="text" id="footer-copyright-text" class="input" />
                </div>
              </div>

              <div class="card-subsection">
                <div class="card-title">
                  <span>Custom Footer Quick Links</span>
                  <button type="button" id="btn-add-footer-quick-link" class="btn btn-sm btn-primary">+ Add Footer Link</button>
                </div>
                <div class="card-desc">Add extra internal or external links alongside your Legal Pages in the footer.</div>
                <div id="footer-quick-links-list" class="item-list"></div>
              </div>
            </div>
          </section>

          <!-- ───────────────────────────────────────────────────────────────────
               9. MOREINFO SECURITY GATE & AES-256-GCM LINK VAULT
               ─────────────────────────────────────────────────────────────────── -->
          <section class="tab-panel" id="panel-security">
            <div class="panel-header">
              <div>
                <h2>MoreInfo Security Gate &amp; Download Protection</h2>
                <p>Keep your real download links private behind human &amp; Turnstile checks at <code>/moreinfo</code> (never exposed in HTML).</p>
              </div>
              <a href="/moreinfo" target="_blank" rel="noopener" class="btn btn-primary btn-sm">Open /moreinfo Page ↗</a>
            </div>

            <div class="card">
              <div class="card-title">
                <span>Protected Destination URL &amp; AES-256-GCM Link Vault</span>
                <span class="field-tag" id="sec-vault-status-tag">Not Set</span>
              </div>
              <div class="card-affects">Updates: <code>/moreinfo</code>, <code>/download</code>, and server-side verification checks (strictly <code>noindex, nofollow</code>).</div>
              <div class="form-grid cols-2">
                <div class="field">
                  <div class="toggle-box">
                    <div>
                      <strong>Enable Security Gate (<code>/moreinfo</code>)</strong>
                      <div class="field-help">Requires visitors to pass verification before receiving your download URL.</div>
                    </div>
                    <input type="checkbox" id="sec-enabled" />
                  </div>
                </div>
                <div class="field">
                  <div class="toggle-box">
                    <div>
                      <strong>Show SHA-256 &amp; Version Info on <code>/moreinfo</code></strong>
                      <div class="field-help">Displays file checksum details below the verification card.</div>
                    </div>
                    <input type="checkbox" id="sec-show-specs" />
                  </div>
                </div>
                <div class="field span-full">
                  <label class="field-label" for="sec-primary-url">
                    <span>Protected Destination Download URL</span>
                    <button type="button" id="btn-encrypt-vault-url" class="btn btn-sm btn-dark">Encrypt URL Now</button>
                  </label>
                  <input type="text" id="sec-primary-url" class="input" placeholder="https://cdn.example.com/releases/package.apk" />
                  <div class="field-help">Never written into public HTML. Decrypted strictly inside server RAM after verification passes.</div>
                </div>
                <div class="field span-full">
                  <label class="field-label" for="sec-encrypted-url">AES-256-GCM Encrypted Vault Value (<code>v2.&lt;iv&gt;.&lt;cipher&gt;</code>)</label>
                  <input type="text" id="sec-encrypted-url" class="input" placeholder="Auto-generated when you tap Encrypt URL Now or Publish" />
                </div>
                <div class="field">
                  <label class="field-label" for="sec-device-policy">Visitor Device Rule</label>
                  <select id="sec-device-policy" class="select">
                    <option value="universal_human">Allow Both Mobile &amp; Desktop Humans (Block Bots)</option>
                    <option value="strict_mobile_only">Touch Smartphones Only (Block Desktop Browsers)</option>
                  </select>
                </div>
                <div class="field">
                  <label class="field-label" for="sec-btn-label">Proceed Button Text</label>
                  <input type="text" id="sec-btn-label" class="input" placeholder="PROCEED" />
                </div>
              </div>
            </div>

            <div class="card">
              <div class="card-title">Cloudflare Turnstile, Page Text &amp; Availability Limits</div>
              <div class="form-grid cols-2">
                <div class="field">
                  <label class="field-label" for="sec-turnstile-site-key">
                    <span>Cloudflare Turnstile Site Key</span>
                    <span class="field-tag">Auto Test Key on Localhost</span>
                  </label>
                  <input type="text" id="sec-turnstile-site-key" class="input" placeholder="0x4AAAAAA... (Optional on localhost)" />
                </div>
                <div class="field">
                  <label class="field-label" for="sec-turnstile-secret-key">
                    <span>Cloudflare Turnstile Secret Key</span>
                    <span class="field-tag" id="sec-ts-secret-status-tag">Write-Only Secret</span>
                  </label>
                  <div class="input-upload-row">
                    <input type="password" id="sec-turnstile-secret-key" class="input" placeholder="0x4AAAAAA... (Leave blank to keep stored)" autocomplete="off" />
                    <button type="button" id="btn-clear-ts-secret" class="btn btn-sm btn-danger" style="display:none;">Clear</button>
                  </div>
                </div>
                <div class="field">
                  <label class="field-label" for="sec-app-slug">Gateway App Slug</label>
                  <input type="text" id="sec-app-slug" class="input" placeholder="e.g., novaplayer" />
                </div>
                <div class="field">
                  <label class="field-label" for="sec-serial-id">Gateway Serial Label (Optional)</label>
                  <input type="text" id="sec-serial-id" class="input" placeholder="e.g., PKG-001" />
                </div>
                <div class="field span-full">
                  <label class="field-label" for="sec-custom-heading">Custom Page Title on <code>/moreinfo</code> (Optional)</label>
                  <input type="text" id="sec-custom-heading" class="input" placeholder="Defaults to your Website / App Name" />
                </div>
                <div class="field span-full">
                  <label class="field-label" for="sec-custom-note">Custom Notice Box on <code>/moreinfo</code> (Optional)</label>
                  <div class="html-toolbar">
                    <button type="button" class="btn btn-sm" data-open-link-modal="sec-custom-note">+ Link</button>
                    <button type="button" class="btn btn-sm" data-scalar-snippet="b" data-target="sec-custom-note">Bold</button>
                    <button type="button" class="btn btn-sm" data-scalar-snippet="callout" data-target="sec-custom-note">+ Notice Box</button>
                    <button type="button" class="btn btn-sm" data-undo-target="sec-custom-note">Undo</button>
                  </div>
                  <textarea id="sec-custom-note" class="textarea" rows="2" placeholder="Leave blank for a minimal card with App Name, verification, and PROCEED button."></textarea>
                </div>
                <div class="field">
                  <div class="toggle-box">
                    <div>
                      <strong>Pause Downloads Temporarily</strong>
                      <div class="field-help">Shows maintenance notice &amp; helpline links instead of downloading.</div>
                    </div>
                    <input type="checkbox" id="sec-paused" />
                  </div>
                </div>
                <div class="field">
                  <div class="toggle-box">
                    <div>
                      <strong>Coming Soon Mode</strong>
                      <div class="field-help">Shows Coming Soon notice after visitor verification.</div>
                    </div>
                    <input type="checkbox" id="sec-coming-soon" />
                  </div>
                </div>
                <div class="field">
                  <label class="field-label" for="sec-daily-cap">Daily Download Cap (0 = Unlimited)</label>
                  <input type="number" id="sec-daily-cap" class="input" min="0" placeholder="0" />
                </div>
                <div class="field">
                  <label class="field-label" for="sec-unavailable-msg">Pause / Maintenance Message</label>
                  <input type="text" id="sec-unavailable-msg" class="input" placeholder="Official download mirror is undergoing maintenance." />
                </div>
                <div class="field">
                  <label class="field-label" for="sec-whatsapp">WhatsApp Support Link (Optional)</label>
                  <input type="text" id="sec-whatsapp" class="input" placeholder="https://wa.me/1234567890" />
                </div>
                <div class="field">
                  <label class="field-label" for="sec-telegram">Telegram Support Link (Optional)</label>
                  <input type="text" id="sec-telegram" class="input" placeholder="https://t.me/example" />
                </div>
              </div>
            </div>
          </section>

          <!-- ───────────────────────────────────────────────────────────────────
               10. INTERNAL LINKING SYSTEM
               ─────────────────────────────────────────────────────────────────── -->
          <section class="tab-panel" id="panel-links">
            <div class="panel-header">
              <div>
                <h2>Smart Internal Linking System</h2>
                <p>Automatically turn important keywords inside sections, news articles, and legal pages into helpful SEO internal links.</p>
              </div>
              <button type="button" id="btn-add-internal-link" class="btn btn-primary">+ Add Keyword Link Rule</button>
            </div>

            <div class="card">
              <div class="card-title">Automatic Cross-Linking Settings</div>
              <div class="card-affects">Updates: Safely adds internal links inside body paragraphs across Homepage sections, Daily News posts, and Legal pages without breaking headings or existing links.</div>
              <div class="field" style="margin-bottom: 12px">
                <div class="toggle-box">
                  <div>
                    <strong>Enable Automatic Contextual Internal Linking</strong>
                    <div class="field-help">Matches each keyword rule below once per paragraph and links related guides inside news articles.</div>
                  </div>
                  <input type="checkbox" id="domain-auto-internal-links" />
                </div>
              </div>
              <div id="internal-links-list" class="item-list"></div>
            </div>
          </section>

          <!-- ───────────────────────────────────────────────────────────────────
               11. DOMAIN & SEO SETTINGS
               ─────────────────────────────────────────────────────────────────── -->
          <section class="tab-panel" id="panel-domain">
            <div class="panel-header">
              <div>
                <h2>Domain, Google Search Preview &amp; Technical SEO</h2>
                <p>Configure your canonical domain, Search Console tags, Sitemap, RSS feed, homepage meta tags, and Schema markup.</p>
              </div>
            </div>

            <div class="card" data-section-anchor="sitemap">
              <div class="card-title">
                <span>1. Website Domain, Verification &amp; SEO Files</span>
                <div style="display: flex; gap: 5px; flex-wrap: wrap">
                  <a href="/sitemap.xml" target="_blank" class="btn btn-sm">Sitemap ↗</a>
                  <a href="/manifest.webmanifest" target="_blank" class="btn btn-sm">Manifest ↗</a>
                  <a href="/robots.txt" target="_blank" class="btn btn-sm">Robots.txt ↗</a>
                  <a href="/feed.xml" target="_blank" class="btn btn-sm">RSS ↗</a>
                </div>
              </div>
              <div class="card-affects">Updates: Canonical URLs, <code>/sitemap.xml</code>, <code>/manifest.webmanifest</code>, <code>/robots.txt</code>, <code>/feed.xml</code>, and analytics tags.</div>
              <div class="form-grid cols-2">
                <div class="field">
                  <label class="field-label" for="domain-primary">
                    <span>Primary Production Domain</span>
                    <span class="field-tag">Canonical Base</span>
                  </label>
                  <input type="url" id="domain-primary" class="input" placeholder="https://yourdomain.com" />
                </div>
                <div class="field">
                  <label class="field-label" for="domain-ga-id">Google Analytics ID (Optional)</label>
                  <input type="text" id="domain-ga-id" class="input" placeholder="G-XXXXXXXXXX" />
                </div>
                <div class="field">
                  <label class="field-label" for="domain-gsc">Google Search Console Token</label>
                  <input type="text" id="domain-gsc" class="input" placeholder="google-site-verification content value" />
                </div>
                <div class="field">
                  <label class="field-label" for="domain-bing">Bing Webmaster Verification Token</label>
                  <input type="text" id="domain-bing" class="input" placeholder="msvalidate.01 content value" />
                </div>
                <div class="field">
                  <div class="toggle-box">
                    <div>
                      <strong>Include Images in XML Sitemap</strong>
                      <div class="field-help">Adds Hero Banner, Section &amp; News images for Google Image Search.</div>
                    </div>
                    <input type="checkbox" id="domain-image-sitemap" />
                  </div>
                </div>
                <div class="field">
                  <div class="toggle-box">
                    <div>
                      <strong>Enable XML Sitemap (<code>/sitemap.xml</code>)</strong>
                      <div class="field-help">Lists homepage, news posts, and legal pages for search bots.</div>
                    </div>
                    <input type="checkbox" id="domain-enable-sitemap" />
                  </div>
                </div>
                <div class="field">
                  <div class="toggle-box">
                    <div>
                      <strong>Enable News RSS Feed (<code>/feed.xml</code>)</strong>
                      <div class="field-help">Generates a live RSS 2.0 feed of your published news posts.</div>
                    </div>
                    <input type="checkbox" id="domain-enable-rss" />
                  </div>
                </div>
                <div class="field">
                  <div class="toggle-box">
                    <div>
                      <strong>Enable Web App Manifest (<code>/manifest.webmanifest</code>)</strong>
                      <div class="field-help">Enables mobile install metadata with app name and icons.</div>
                    </div>
                    <input type="checkbox" id="domain-web-manifest" />
                  </div>
                </div>
                <div class="field span-full">
                  <div class="toggle-box">
                    <div>
                      <strong>Always Use HTTPS Canonical URLs</strong>
                      <div class="field-help">Upgrades http:// links cleanly to https:// in sitemaps and meta tags.</div>
                    </div>
                    <input type="checkbox" id="domain-force-https" />
                  </div>
                </div>
                <div class="field span-full">
                  <label class="field-label" for="domain-robots-txt">Custom /robots.txt Rules</label>
                  <textarea id="domain-robots-txt" class="textarea code" rows="4"></textarea>
                </div>
              </div>
            </div>

            <div class="card" data-section-anchor="serp">
              <div class="card-title">
                <span>2. Homepage Search Title, Description &amp; Live Google Preview</span>
              </div>
              <div class="card-affects">Updates: Homepage (<code>/</code>) <code>&lt;title&gt;</code>, meta description, OpenGraph, and social share cards.</div>
              <div class="form-grid cols-2">
                <div class="field span-full">
                  <label class="field-label" for="seo-meta-title">
                    <span>Homepage Meta Title (&lt;title&gt;)</span>
                    <span class="field-tag" id="seo-title-counter">0 / 60 chars</span>
                  </label>
                  <input type="text" id="seo-meta-title" class="input" placeholder="e.g., NovaPlayer v5.0 Official Release &amp; Verification Hub" />
                </div>
                <div class="field span-full">
                  <label class="field-label" for="seo-meta-desc">
                    <span>Homepage Meta Description</span>
                    <span class="field-tag" id="seo-desc-counter">0 / 160 chars</span>
                  </label>
                  <textarea id="seo-meta-desc" class="textarea" rows="3" placeholder="Write an 80-165 character search snippet description..."></textarea>
                </div>
                <div class="field">
                  <label class="field-label" for="seo-canonical">Homepage Canonical URL</label>
                  <input type="url" id="seo-canonical" class="input" placeholder="https://yourdomain.com" />
                </div>
                <div class="field">
                  <label class="field-label" for="seo-og-image">
                    <span>Social Share Image (OpenGraph)</span>
                    <button type="button" class="btn btn-sm" data-upload-target="seo-og-image">Upload</button>
                  </label>
                  <input type="text" id="seo-og-image" class="input" placeholder="Paste image URL or upload share banner" />
                </div>
                <div class="field span-full">
                  <label class="field-label">Live Google Search Result Preview</label>
                  <div class="serp-box">
                    <div class="serp-url" id="serp-preview-url">https://yourdomain.com/</div>
                    <div class="serp-title" id="serp-preview-title">Homepage Meta Title</div>
                    <div class="serp-desc" id="serp-preview-desc">Homepage meta description preview...</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="card" data-section-anchor="schema">
              <div class="card-title">
                <span>3. SoftwareApplication Rich Snippet Schema &amp; Custom JSON-LD</span>
              </div>
              <div class="card-affects">Updates: Homepage structured data JSON-LD <code>@graph</code> for Google Search rich snippets.</div>
              <div class="form-grid cols-3">
                <div class="field span-full">
                  <div class="toggle-box">
                    <div>
                      <strong>Include SoftwareApplication Star Rating Schema</strong>
                      <div class="field-help">Outputs app name, OS, free price, and rating count in structured data.</div>
                    </div>
                    <input type="checkbox" id="schema-app-enabled" />
                  </div>
                </div>
                <div class="field">
                  <label class="field-label" for="schema-app-name">App Name</label>
                  <input type="text" id="schema-app-name" class="input" />
                </div>
                <div class="field">
                  <label class="field-label" for="schema-app-os">Operating System</label>
                  <input type="text" id="schema-app-os" class="input" />
                </div>
                <div class="field">
                  <label class="field-label" for="schema-app-category">Category</label>
                  <input type="text" id="schema-app-category" class="input" />
                </div>
                <div class="field">
                  <label class="field-label" for="schema-app-price">Price (0.00 = Free)</label>
                  <input type="text" id="schema-app-price" class="input" />
                </div>
                <div class="field">
                  <label class="field-label" for="schema-app-currency">Currency Code</label>
                  <input type="text" id="schema-app-currency" class="input" placeholder="USD" />
                </div>
                <div class="field">
                  <label class="field-label" for="schema-app-rating">Star Rating (1-5)</label>
                  <input type="text" id="schema-app-rating" class="input" />
                </div>
                <div class="field">
                  <label class="field-label" for="schema-app-votes">Review Count</label>
                  <input type="text" id="schema-app-votes" class="input" />
                </div>
                <div class="field span-full">
                  <label class="field-label" for="seo-raw-jsonld">
                    <span>Extra Custom JSON-LD Node (Optional)</span>
                    <span class="field-tag" id="seo-jsonld-status">Optional Valid JSON</span>
                  </label>
                  <textarea id="seo-raw-jsonld" class="textarea code" rows="3" placeholder='{"@type":"Organization","sameAs":["https://github.com/yourorg"]}'></textarea>
                </div>
              </div>
            </div>
          </section>

          <!-- ───────────────────────────────────────────────────────────────────
               12. FIREBASE, GITHUB STATIC PUSH & SYNC LOGS
               ─────────────────────────────────────────────────────────────────── -->
          <section class="tab-panel" id="panel-deploy">
            <div class="panel-header">
              <div>
                <h2>Firebase Connection, GitHub Static Push &amp; Sync Logs</h2>
                <p>Manage live Firebase persistence, compile standalone static public files to GitHub, and review recent sync logs.</p>
              </div>
            </div>

            <div class="card">
              <div class="card-title">
                <span>1. GitHub Static Website Publisher</span>
                <span class="field-tag" id="gh-status-badge">Static Compiler Active</span>
              </div>
              <div class="card-affects">Compiles standalone public HTML, JSON routes, <code>sitemap.xml</code>, <code>robots.txt</code>, <code>feed.xml</code> and pushes changed files to your GitHub repository.</div>

              <div class="form-grid cols-2">
                <div class="field span-full">
                  <label class="field-label" for="gh-token">
                    <span>GitHub Fine-Grained Token (<code>github_pat_...</code>)</span>
                    <span class="field-tag" id="gh-token-status-tag">Not Configured</span>
                  </label>
                  <div class="input-upload-row">
                    <input
                      type="password"
                      id="gh-token"
                      class="input"
                      placeholder="github_pat_... (Requires Repository Contents: Read &amp; Write)"
                      autocomplete="off"
                    />
                    <button type="button" id="btn-clear-gh-token" class="btn btn-sm btn-danger" style="display:none;">Clear</button>
                  </div>
                  <div class="field-help">Stored write-only on the server — never sent back to browsers.</div>
                </div>

                <div class="field">
                  <label class="field-label" for="gh-owner">GitHub Username or Organization</label>
                  <input type="text" id="gh-owner" class="input" placeholder="e.g., my-org" />
                </div>

                <div class="field">
                  <label class="field-label" for="gh-repo">GitHub Repository Name</label>
                  <input type="text" id="gh-repo" class="input" placeholder="e.g., mybrand-public" />
                </div>

                <div class="field">
                  <label class="field-label" for="gh-branch">Target Branch</label>
                  <input type="text" id="gh-branch" class="input" placeholder="main" />
                </div>

                <div class="field">
                  <label class="field-label" for="gh-dir">
                    <span>Target Folder in Repo</span>
                    <span class="field-tag">dist-public or empty for root</span>
                  </label>
                  <input type="text" id="gh-dir" class="input" placeholder="dist-public" />
                </div>

                <div class="field span-full">
                  <label class="field-label" for="gh-commit-msg">Git Commit Message</label>
                  <input
                    type="text"
                    id="gh-commit-msg"
                    class="input"
                    placeholder="chore(static-publish): sync compiled static public site from Admin Studio"
                  />
                </div>

                <div class="field span-full">
                  <div class="toggle-box">
                    <div>
                      <strong>Auto-Push to GitHub Every Time You Tap Publish</strong>
                      <div class="field-help">Automatically commits changed static public files after saving to Firebase.</div>
                    </div>
                    <input type="checkbox" id="gh-auto-push" />
                  </div>
                </div>
              </div>

              <div class="deploy-actions-row">
                <button type="button" id="btn-verify-github" class="btn btn-dark">Verify GitHub Access</button>
                <button type="button" id="btn-publish-github" class="btn btn-primary">Compile &amp; Push Static Site to GitHub</button>
                <button type="button" id="btn-inspect-static-bundle" class="btn">Inspect Static Public Files</button>
              </div>

              <div id="gh-pending-sync-bar" class="gh-pending-sync-bar">
                <span><strong>Sync Queue:</strong> <span id="gh-pending-modules-text">Up to date</span></span>
                <span class="field-tag" id="gh-pending-count-tag">0 pending</span>
              </div>

              <div id="gh-sync-pipeline-log" class="gh-sync-pipeline-log" aria-live="polite"></div>
              <div id="gh-verify-feedback" style="margin-top: 10px; display: none" class="seo-subbox"></div>

              <div id="static-bundle-inspector-box" style="margin-top: 12px; display: none" class="seo-subbox">
                <div class="seo-subbox-title">
                  <span>Compiled Static Public Files (100% Isolated from Admin)</span>
                  <span class="field-tag" id="static-bundle-count-tag">0 files</span>
                </div>
                <div id="static-bundle-source-summary" style="margin-bottom:8px;font-size:0.78rem;padding:8px 10px;border:1px solid var(--border);border-radius:7px;background:#f8fafc;color:#334155;"></div>
                <div style="overflow-x: auto; max-height: 260px; overflow-y: auto; border: 1px solid var(--border); border-radius: 7px; background: #ffffff">
                  <table class="bundle-inspector-table">
                    <thead>
                      <tr>
                        <th>Static File Path</th>
                        <th>Size</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody id="static-bundle-tbody"></tbody>
                  </table>
                </div>
              </div>

              <div class="card-subsection">
                <div class="field-label" style="margin-bottom: 6px">
                  <span>Admin-to-Public Sync &amp; Publish Logs</span>
                  <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    <span class="field-tag" id="gh-last-commit-tag">No GitHub push yet</span>
                    <button type="button" id="btn-clear-sync-logs" class="btn btn-sm">Clear Logs</button>
                  </div>
                </div>
                <div id="gh-deploy-history-list" class="audit-list"></div>
              </div>
            </div>

            <div class="card">
              <div class="card-title">
                <span>2. Firebase Cloud Firestore &amp; Backups</span>
                <span class="field-tag" id="fb-env-badge">Checking...</span>
              </div>
              <div class="card-desc">
                Stores your live workspace data in Cloud Firestore (<code>siteConfig/main</code>). Use environment variables in production, or test/paste your Firebase SDK snippet below.
              </div>

              <div class="seo-subbox" style="margin-bottom: 12px">
                <div class="seo-subbox-title">
                  <span>Paste Firebase SDK Snippet to Auto-Fill</span>
                  <button type="button" id="btn-parse-fb-snippet" class="btn btn-sm btn-primary">Parse &amp; Auto-Fill</button>
                </div>
                <textarea
                  id="fb-snippet-input"
                  class="textarea code"
                  rows="3"
                  placeholder='Paste const firebaseConfig = { apiKey: "AIza...", authDomain: "...", projectId: "...", storageBucket: "...", messagingSenderId: "...", appId: "..." };'
                ></textarea>
              </div>

              <div class="form-grid cols-2">
                <div class="field">
                  <label class="field-label" for="fb-api-key">FIREBASE_API_KEY</label>
                  <div class="password-input-wrap">
                    <input type="password" id="fb-api-key" class="input" placeholder="Configured via server env or paste API key..." autocomplete="off" />
                    <button type="button" id="btn-toggle-fb-apikey" class="btn btn-sm password-toggle-btn" aria-label="Show or hide Firebase API Key">Show</button>
                  </div>
                </div>
                <div class="field">
                  <label class="field-label" for="fb-project-id">FIREBASE_PROJECT_ID</label>
                  <input type="text" id="fb-project-id" class="input" placeholder="your-project-id" autocomplete="off" />
                </div>
                <div class="field">
                  <label class="field-label" for="fb-auth-domain">FIREBASE_AUTH_DOMAIN</label>
                  <input type="text" id="fb-auth-domain" class="input" placeholder="your-project.firebaseapp.com" autocomplete="off" />
                </div>
                <div class="field">
                  <label class="field-label" for="fb-storage-bucket">FIREBASE_STORAGE_BUCKET</label>
                  <input type="text" id="fb-storage-bucket" class="input" placeholder="your-project.appspot.com" autocomplete="off" />
                </div>
                <div class="field">
                  <label class="field-label" for="fb-messaging-sender-id">FIREBASE_MESSAGING_SENDER_ID</label>
                  <input type="text" id="fb-messaging-sender-id" class="input" placeholder="123456789012" autocomplete="off" />
                </div>
                <div class="field">
                  <label class="field-label" for="fb-app-id">FIREBASE_APP_ID</label>
                  <input type="text" id="fb-app-id" class="input" placeholder="1:123456:web:abcdef" autocomplete="off" />
                </div>
                <div class="field span-full">
                  <label class="field-label" for="fb-database-id">
                    <span>FIREBASE_DATABASE_ID</span>
                    <span class="field-tag">Usually (default)</span>
                  </label>
                  <input type="text" id="fb-database-id" class="input" placeholder="(default)" autocomplete="off" />
                </div>

                <div class="field span-full deploy-actions-row">
                  <button type="button" id="btn-save-firebase" class="btn btn-dark">Save &amp; Connect Firebase</button>
                  <button type="button" id="btn-test-firebase" class="btn btn-primary">Test Firestore Connection</button>
                  <button type="button" id="btn-clear-firebase" class="btn">Revert to Env Defaults</button>
                  <button type="button" id="btn-export-json" class="btn">Export JSON Backup</button>
                  <label class="btn" style="cursor: pointer">
                    Import JSON
                    <input type="file" id="input-import-json" accept="application/json" style="display: none" />
                  </label>
                  <button type="button" id="btn-reset-defaults" class="btn btn-danger">Clear All Content</button>
                </div>
              </div>

              <div id="fb-test-feedback" class="seo-subbox" style="margin-top: 10px; display: none"></div>

              <div class="seo-subbox" style="margin-top: 12px">
                <div class="seo-subbox-title">
                  <span>Server Environment &amp; Security Check</span>
                  <span class="field-tag" id="env-runtime-tag">Checking...</span>
                </div>
                <div id="env-security-diagnostics-box" class="form-grid cols-2" style="gap: 8px; margin-top: 6px"></div>
              </div>
            </div>
          </section>
        </main>
      </div>

      <!-- Compact Single-Row Sticky Bottom Save Bar (Mobile height <= 52px) -->
      <div class="bottom-save-bar">
        <div class="bottom-save-inner">
          <div class="save-bar-status">
            <div class="save-feedback" id="save-feedback-text">All changes saved</div>
            <span id="dirty-modules-summary" class="dirty-modules-summary"></span>
          </div>
          <div class="save-bar-actions">
            <button type="button" id="btn-save-active-module" class="btn btn-dark btn-sm">Save Section</button>
            <button type="button" id="btn-bottom-save" class="btn btn-primary btn-sm">Publish Changes</button>
          </div>
        </div>
      </div>

    <!-- Image Insertion Modal -->
    <div id="image-insert-modal" class="cms-modal-backdrop" hidden>
      <div class="cms-modal-card">
        <div class="card-title">
          <span>Insert Image into Content</span>
          <button type="button" id="btn-close-image-modal" class="btn btn-sm">Close</button>
        </div>
        <div class="card-desc">
          Upload an image from your device or paste a URL to insert a responsive 16:9 image block.
        </div>
        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="modal-img-url">
              <span>Image URL</span>
              <button
                type="button"
                class="btn btn-sm btn-primary"
                data-upload-target="modal-img-url"
                data-preview-target="modal-img-preview"
              >
                Upload Image
              </button>
            </label>
            <input type="text" id="modal-img-url" class="input" placeholder="https://... or /uploads/..." />
            <img id="modal-img-preview" class="img-mini-preview" alt="Preview" hidden />
          </div>
          <div class="field">
            <label class="field-label" for="modal-img-alt">Image Alt Text (Google Image SEO)</label>
            <input type="text" id="modal-img-alt" class="input" placeholder="Describe the image..." />
          </div>
          <div class="field">
            <label class="field-label" for="modal-img-caption">Caption (Optional)</label>
            <input type="text" id="modal-img-caption" class="input" placeholder="Optional caption..." />
          </div>
          <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px">
            <button type="button" id="btn-confirm-insert-image" class="btn btn-primary">+ Insert Image</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Visual Block Builder Modal -->
    <div id="visual-block-modal" class="cms-modal-backdrop" hidden>
      <div class="cms-modal-card">
        <div class="card-title">
          <span>Visual Block Builder (No Coding Needed)</span>
          <button type="button" id="btn-close-visual-block-modal" class="btn btn-sm">Close</button>
        </div>
        <div class="card-desc">
          Pick a clean layout block, type your text in plain fields, and tap Insert Visual Block.
        </div>
        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="vb-type">Block Style</label>
            <select id="vb-type" class="select">
              <option value="callout">1. Highlight / Note Box</option>
              <option value="grid">2. Two-Column Feature Cards</option>
              <option value="steps">3. Numbered Step-by-Step Guide</option>
              <option value="checklist">4. Verified Bullet Checklist</option>
              <option value="table">5. Two-Column Comparison Table</option>
              <option value="cta">6. Inline Action / Download Button</option>
              <option value="accordion">7. Expandable Details Accordion</option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="vb-title-1" id="vb-label-title-1">Title</label>
            <input type="text" id="vb-title-1" class="input" value="Verified Technical Note" />
          </div>
          <div class="field">
            <label class="field-label" for="vb-text-1" id="vb-label-text-1">Description</label>
            <textarea id="vb-text-1" class="textarea" rows="2">All packages are cryptographically signed with SHA-256 checksums.</textarea>
          </div>
          <div class="field" id="vb-group-2" style="display: none">
            <label class="field-label" for="vb-title-2" id="vb-label-title-2">Second Item Title</label>
            <input type="text" id="vb-title-2" class="input" value="Fast Static Delivery" />
          </div>
          <div class="field" id="vb-group-2-text" style="display: none">
            <label class="field-label" for="vb-text-2" id="vb-label-text-2">Second Item Description</label>
            <textarea id="vb-text-2" class="textarea" rows="2">Pre-compiled static pages load fast with zero bloat.</textarea>
          </div>
          <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px">
            <button type="button" id="btn-confirm-visual-block" class="btn btn-primary">+ Insert Visual Block</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Link Insertion Modal -->
    <div id="link-insert-modal" class="cms-modal-backdrop" hidden>
      <div class="cms-modal-card">
        <div class="card-title">
          <span>Insert Link</span>
          <button type="button" id="btn-close-link-modal" class="btn btn-sm">Close</button>
        </div>
        <div class="card-desc">Choose an existing page or section, or paste any external link.</div>
        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="modal-link-text">Link Label Text</label>
            <input type="text" id="modal-link-text" class="input" placeholder="e.g., View Specifications" />
          </div>
          <div class="field">
            <label class="field-label" for="modal-link-preset">Quick Pick Existing Page</label>
            <select id="modal-link-preset" class="select"></select>
          </div>
          <div class="field">
            <label class="field-label" for="modal-link-url">Target URL</label>
            <input type="text" id="modal-link-url" class="input" placeholder="/#technical-specifications or https://..." />
          </div>
          <div class="field">
            <div class="toggle-box">
              <div>
                <strong>Open Link in New Tab</strong>
                <div class="field-help">Recommended when linking to outside websites.</div>
              </div>
              <input type="checkbox" id="modal-link-newtab" />
            </div>
          </div>
          <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px">
            <button type="button" id="btn-confirm-insert-link" class="btn btn-primary">+ Insert Link</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Live Website Preview Modal -->
    <div id="site-preview-modal" class="cms-modal-backdrop" hidden>
      <div class="site-preview-modal-card">
        <div class="site-preview-toolbar">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <strong style="font-size:0.9rem;">Live Website Preview</strong>
            <select id="preview-route-select" class="select" style="width:auto; min-width:155px; min-height:36px; padding:4px 8px;">
              <option value="/">Homepage (/)</option>
              <option value="/news">Daily News Hub (/news)</option>
              <option value="/privacy-policy">Privacy Policy</option>
              <option value="/moreinfo">Security Gateway (/moreinfo)</option>
            </select>
          </div>
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <button type="button" id="btn-preview-mobile" class="btn btn-sm btn-dark">Mobile 390px</button>
            <button type="button" id="btn-preview-desktop" class="btn btn-sm">Desktop</button>
            <button type="button" id="btn-preview-save-reload" class="btn btn-sm btn-primary">Publish &amp; Refresh</button>
            <button type="button" id="btn-close-preview-modal" class="btn btn-sm">Close</button>
          </div>
        </div>
        <div class="site-preview-frame-wrap">
          <iframe id="site-preview-iframe" class="site-preview-iframe mobile-mode" title="Public Website Preview"></iframe>
        </div>
      </div>
    </div>`;

export function getAdminWorkspaceShellHtml(): string {
  return ADMIN_WORKSPACE_SHELL_HTML;
}
