/**
 * Authenticated Admin Studio Workspace HTML Template
 * Served ONLY after administrator session verification via GET /api/admin/workspace.
 * Streamlined, content-only workspace designed for non-technical editors:
 * - Zero technical SEO editors (robots.txt, sitemap.xml, feed.xml, manifest, Schema.org JSON-LD,
 *   HTTPS canonicals, slugs, and responsive public design are 100% inbuilt and automatic).
 * - Editors only manage content, images, HTML body, basic site identity, download link, and publishing.
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
              <div class="topbar-title" id="topbar-brand-title">Content Studio</div>
              <div class="topbar-status">
                <span class="status-dot" id="storage-dot" aria-hidden="true"></span>
                <span id="storage-status-text">Connected to Firebase</span>
              </div>
            </div>
          </div>

          <div class="topbar-actions">
            <button type="button" id="btn-open-preview-modal" class="btn btn-sm">Preview</button>
            <a href="/" target="_blank" rel="noopener" class="btn btn-sm topbar-public-link">View Site ↗</a>
            <button type="button" id="btn-top-save" class="btn btn-primary btn-sm">Save &amp; Publish</button>
            <button type="button" id="btn-logout" class="btn btn-sm">Sign Out</button>
          </div>
        </div>
      </header>

      <!-- Non-Sticky Horizontal Mobile Quick-Tab Strip -->
      <nav class="mobile-quick-tabs" aria-label="Content Sections">
        <button type="button" class="nav-tab active" data-tab="overview">Dashboard</button>
        <button type="button" class="nav-tab" data-tab="brand">Site Identity</button>
        <button type="button" class="nav-tab" data-tab="hero">Hero &amp; Download</button>
        <button type="button" class="nav-tab" data-tab="specs">Package Info</button>
        <button type="button" class="nav-tab" data-tab="sections">Page Sections</button>
        <button type="button" class="nav-tab" data-tab="news">Daily News</button>
        <button type="button" class="nav-tab" data-tab="faqs">FAQs</button>
        <button type="button" class="nav-tab" data-tab="pages">Pages &amp; Footer</button>
        <button type="button" class="nav-tab" data-tab="deploy">Publish</button>
      </nav>

      <!-- Mobile / Tablet Navigation Drawer -->
      <div id="admin-nav-backdrop" class="admin-nav-backdrop"></div>
      <nav id="admin-nav-drawer" class="admin-nav-drawer" aria-label="Navigation Menu">
        <div class="drawer-header-row">
          <span class="sidebar-group-label" style="padding:0;">Content Menu</span>
          <button type="button" id="admin-drawer-close" class="btn btn-sm" aria-label="Close menu">Close</button>
        </div>

        <div class="sidebar-group-label">Overview</div>
        <button type="button" class="nav-tab active" data-tab="overview">
          <span>Dashboard</span>
        </button>

        <div class="sidebar-group-label">Site Basics</div>
        <button type="button" class="nav-tab" data-tab="brand">
          <span>Site Identity</span>
        </button>
        <button type="button" class="nav-tab" data-tab="hero">
          <span>Hero &amp; Download</span>
        </button>

        <div class="sidebar-group-label">Content &amp; HTML Body</div>
        <button type="button" class="nav-tab" data-tab="specs">
          <span>Package Info</span>
        </button>
        <button type="button" class="nav-tab" data-tab="sections">
          <span>Page Sections</span>
        </button>
        <button type="button" class="nav-tab" data-tab="news">
          <span>Daily News</span>
        </button>
        <button type="button" class="nav-tab" data-tab="faqs">
          <span>FAQs</span>
        </button>
        <button type="button" class="nav-tab" data-tab="pages">
          <span>Pages &amp; Footer</span>
        </button>

        <div class="sidebar-group-label">Go Live</div>
        <button type="button" class="nav-tab" data-tab="deploy">
          <span>Publish Website</span>
        </button>
      </nav>

      <div class="studio-body">
        <!-- Desktop Left Sidebar Navigation (9 Simple Content Workspaces) -->
        <aside class="studio-sidebar" aria-label="Content Workspaces">
          <div class="sidebar-group-label">Overview</div>
          <button type="button" class="nav-tab active" data-tab="overview">
            <span>Dashboard</span>
          </button>

          <div class="sidebar-group-label">Site Basics</div>
          <button type="button" class="nav-tab" data-tab="brand">
            <span>Site Identity</span>
          </button>
          <button type="button" class="nav-tab" data-tab="hero">
            <span>Hero &amp; Download</span>
          </button>

          <div class="sidebar-group-label">Content &amp; HTML Body</div>
          <button type="button" class="nav-tab" data-tab="specs">
            <span>Package Info</span>
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
            <span>FAQs</span>
            <span class="nav-count" id="count-faqs">0</span>
          </button>
          <button type="button" class="nav-tab" data-tab="pages">
            <span>Pages &amp; Footer</span>
            <span class="nav-count" id="count-pages">0</span>
          </button>

          <div class="sidebar-group-label">Go Live</div>
          <button type="button" class="nav-tab" data-tab="deploy">
            <span>Publish Website</span>
          </button>
        </aside>

        <!-- Main Workspace Content Area -->
        <main class="cms-main">
          <!-- Context Banner -->
          <div class="workspace-context-banner">
            <div class="editing-context-row">
              <span class="editing-context-title" id="editing-now-label">Dashboard</span>
              <span class="editing-context-sep" aria-hidden="true">/</span>
              <span class="editing-context-target" id="editing-now-target">Add and update your website content</span>
            </div>
          </div>

          <!-- ───────────────────────────────────────────────────────────────────
               1. DASHBOARD
               ─────────────────────────────────────────────────────────────────── -->
          <section class="tab-panel active" id="panel-overview">
            <div class="panel-header">
              <div>
                <h2>Dashboard</h2>
                <p>Add your pages, news posts, and HTML content. SEO, sitemaps, and responsive layout are built in automatically.</p>
              </div>
              <div class="panel-header-actions">
                <button type="button" class="btn btn-dark" data-jump-tab="deploy">Publish Website</button>
                <button type="button" class="btn btn-primary" data-jump-tab="news">+ Write News Post</button>
              </div>
            </div>

            <div class="quick-add-bar" aria-label="Quick Content Actions">
              <span class="quick-add-label">Quick Add:</span>
              <button type="button" id="btn-quick-add-news" class="btn btn-sm btn-primary">+ News Post</button>
              <button type="button" id="btn-quick-add-section" class="btn btn-sm">+ Page Section</button>
              <button type="button" id="btn-quick-add-faq" class="btn btn-sm">+ FAQ</button>
              <button type="button" id="btn-quick-add-page" class="btn btn-sm">+ Page</button>
            </div>

            <div id="empty-db-workspace-guide" class="empty-db-banner" hidden>
              <div>
                <strong style="font-size:0.88rem; color:var(--text-main);">Ready for Your Content</strong>
                <div style="font-size:0.78rem; color:var(--text-sub); margin-top:3px;">
                  Fill out Quick Site Setup below to name your website, or jump straight into Page Sections or Daily News.
                </div>
                <div class="empty-guide-steps">
                  <button type="button" class="btn btn-sm btn-primary" data-jump-tab="brand">1. Site Identity</button>
                  <button type="button" class="btn btn-sm" data-jump-tab="hero">2. Hero &amp; Download</button>
                  <button type="button" class="btn btn-sm" data-jump-tab="sections">3. Page Sections</button>
                  <button type="button" class="btn btn-sm btn-dark" data-jump-tab="deploy">4. Publish →</button>
                </div>
              </div>
            </div>

            <div class="stats-grid">
              <div class="stat-box">
                <div class="stat-label">Page Sections</div>
                <div class="stat-value" id="stat-sections">0</div>
              </div>
              <div class="stat-box">
                <div class="stat-label">Daily News Posts</div>
                <div class="stat-value" id="stat-news">0</div>
              </div>
              <div class="stat-box">
                <div class="stat-label">FAQs</div>
                <div class="stat-value" id="stat-faqs">0</div>
              </div>
              <div class="stat-box">
                <div class="stat-label">Standalone Pages</div>
                <div class="stat-value" id="stat-pages">0</div>
              </div>
            </div>

            <!-- Simple Quick Setup Card -->
            <div class="card">
              <div class="card-title">
                <span>Quick Site Setup</span>
                <button type="button" id="btn-apply-quick-clone" class="btn btn-primary btn-sm">Apply to Site</button>
              </div>
              <div class="card-desc">
                Set your brand name, domain, version, and download link in one step. Everything else stays aligned automatically.
              </div>
              <div class="form-grid cols-2">
                <div class="field">
                  <label class="field-label" for="qc-brand-name">Website / App Name</label>
                  <input type="text" id="qc-brand-name" class="input" placeholder="e.g., My App Portal" />
                </div>
                <div class="field">
                  <label class="field-label" for="qc-version">Current Version</label>
                  <input type="text" id="qc-version" class="input" placeholder="e.g., v1.0.0" />
                </div>
                <div class="field">
                  <label class="field-label" for="qc-domain">Website Domain (HTTPS)</label>
                  <input type="url" id="qc-domain" class="input" placeholder="https://example.com" />
                </div>
                <div class="field">
                  <label class="field-label" for="qc-email">Support Email</label>
                  <input type="email" id="qc-email" class="input" placeholder="support@example.com" />
                </div>
                <div class="field">
                  <label class="field-label" for="qc-download-url">Protected Download Link</label>
                  <input type="url" id="qc-download-url" class="input" placeholder="https://cdn.example.com/app.apk" />
                </div>
                <div class="field">
                  <label class="field-label">Brand Color</label>
                  ${renderVisualColorControl('qc-accent-color', 'Brand Color', '#EF4444', ACCENT_COLOR_CHOICES)}
                </div>
              </div>
            </div>
          </section>

          <!-- ───────────────────────────────────────────────────────────────────
               2. SITE IDENTITY
               ─────────────────────────────────────────────────────────────────── -->
          <section class="tab-panel" id="panel-brand">
            <div class="panel-header">
              <div>
                <h2>Site Identity</h2>
                <p>Update your site name, domain, logo, and color theme. Fonts, spacing, and mobile layout are handled automatically.</p>
              </div>
              <div class="panel-header-actions">
                <button type="button" class="btn btn-primary" data-inline-save-module="brand">Save Site Identity to Firebase</button>
              </div>
            </div>

            <div class="card">
              <div class="card-title"><span>1. Brand Details &amp; Domain</span></div>
              <div class="form-grid cols-2">
                <div class="field">
                  <label class="field-label" for="brand-name">Website / Brand Name</label>
                  <input type="text" id="brand-name" class="input" placeholder="e.g., My App Portal" />
                </div>
                <div class="field">
                  <label class="field-label" for="brand-tagline">Short Tagline</label>
                  <input type="text" id="brand-tagline" class="input" placeholder="e.g., Official Guide &amp; Downloads" />
                </div>
                <div class="field">
                  <label class="field-label" for="domain-primary">Website Domain (HTTPS)</label>
                  <input type="url" id="domain-primary" class="input" placeholder="https://example.com" />
                </div>
                <div class="field">
                  <label class="field-label" for="brand-email">Support Email</label>
                  <input type="email" id="brand-email" class="input" placeholder="support@example.com" />
                </div>
              </div>
            </div>

            <div class="card">
              <div class="card-title"><span>2. Logo &amp; Browser Icon</span></div>
              <div class="card-desc">
                Upload your logo and icon once. Search icons and mobile app icons are automatically derived from them.
              </div>
              <div class="form-grid cols-2">
                <div class="field">
                  <label class="field-label" for="brand-logo">
                    <span>Site Logo</span>
                    <button type="button" class="btn btn-sm" data-upload-target="brand-logo" data-preview-target="brand-logo-preview">Upload Logo</button>
                  </label>
                  <input type="text" id="brand-logo" class="input" placeholder="Paste image URL or click Upload Logo..." />
                  <img id="brand-logo-preview" class="img-mini-preview" alt="Logo Preview" hidden />
                </div>
                <div class="field">
                  <label class="field-label" for="brand-favicon">
                    <span>Browser Tab Icon (Favicon)</span>
                    <button type="button" class="btn btn-sm" data-upload-target="brand-favicon" data-preview-target="brand-favicon-preview">Upload Icon</button>
                  </label>
                  <input type="text" id="brand-favicon" class="input" placeholder="Paste icon URL or click Upload Icon..." />
                  <img id="brand-favicon-preview" class="img-mini-preview" alt="Favicon Preview" hidden />
                </div>
              </div>
            </div>

            <div class="card">
              <div class="card-title"><span>3. Color Theme</span></div>
              <div class="card-desc">Choose a ready-made theme preset or pick a single main accent color.</div>
              <div class="preset-bar" style="margin-bottom:14px;">
                <span class="preset-label">Presets:</span>
                <button type="button" id="preset-theme-clean" class="btn btn-sm">Clean Light</button>
                <button type="button" id="preset-theme-crimson" class="btn btn-sm">Crimson Pro</button>
                <button type="button" id="preset-theme-royal" class="btn btn-sm">Royal Blue</button>
                <button type="button" id="preset-theme-emerald" class="btn btn-sm">Emerald Mint</button>
                <button type="button" id="preset-theme-dark" class="btn btn-sm btn-dark">Midnight Dark</button>
              </div>
              <div class="field">
                <label class="field-label">Main Accent Color (Buttons &amp; Links)</label>
                ${renderVisualColorControl('brand-color', 'Main Accent Color', '#EF4444', ACCENT_COLOR_CHOICES)}
              </div>
            </div>
          </section>

          <!-- ───────────────────────────────────────────────────────────────────
               3. HERO & DOWNLOAD
               ─────────────────────────────────────────────────────────────────── -->
          <section class="tab-panel" id="panel-hero">
            <div class="panel-header">
              <div>
                <h2>Hero &amp; Download</h2>
                <p>Edit the top section of your homepage: main headline, intro content, banner image, and download link.</p>
              </div>
              <div class="panel-header-actions">
                <button type="button" class="btn btn-primary" data-inline-save-module="hero">Save Hero to Firebase</button>
              </div>
            </div>

            <div class="card">
              <div class="card-title"><span>1. Headline &amp; Intro Content</span></div>
              <div class="form-grid">
                <div class="field">
                  <label class="field-label" for="hero-h1">Main Homepage Headline</label>
                  <input type="text" id="hero-h1" class="input" placeholder="e.g., Official App — Fast, Secure &amp; Updated" />
                </div>

                <div class="field">
                  <div class="field-label">
                    <span>Intro Content / HTML Body</span>
                    <button type="button" class="btn btn-sm" data-toggle-preview="hero-intro-preview">Preview</button>
                  </div>
                  <div class="html-toolbar">
                    <button type="button" class="btn btn-sm btn-primary" data-open-visual-modal="hero-intro-html" data-preview="hero-intro-preview">+ Visual Block</button>
                    <button type="button" class="btn btn-sm btn-dark" data-open-image-modal="hero-intro-html" data-preview="hero-intro-preview">+ Image</button>
                    <button type="button" class="btn btn-sm" data-open-link-modal="hero-intro-html" data-preview="hero-intro-preview">+ Link</button>
                    <button type="button" class="btn btn-sm" data-insert-snippet="b" data-target="hero-intro-html"><b>B</b></button>
                    <button type="button" class="btn btn-sm" data-insert-snippet="p" data-target="hero-intro-html">+ P</button>
                    <button type="button" class="btn btn-sm" data-insert-snippet="ul" data-target="hero-intro-html">+ List</button>
                    <button type="button" class="btn btn-sm" data-undo-target="hero-intro-html">Undo</button>
                  </div>
                  <textarea id="hero-intro-html" class="textarea code" rows="4" data-preview-target="hero-intro-preview" placeholder="Write a short introduction or paste HTML..."></textarea>
                  <div id="hero-intro-preview" class="live-preview-box"></div>
                </div>
              </div>
            </div>

            <div class="card">
              <div class="card-title"><span>2. Hero Banner Image</span></div>
              <div class="form-grid">
                <div class="field">
                  <div class="toggle-box">
                    <div>
                      <strong>Show Hero Banner Image</strong>
                      <div class="field-help">Displays your showcase image right below the intro.</div>
                    </div>
                    <input type="checkbox" id="hero-show-banner" checked />
                  </div>
                </div>
                <div class="field">
                  <label class="field-label" for="hero-banner-url">
                    <span>Banner Image</span>
                    <button type="button" class="btn btn-sm" data-upload-target="hero-banner-url" data-preview-target="hero-banner-preview">Upload Image</button>
                  </label>
                  <input type="text" id="hero-banner-url" class="input" placeholder="Paste image URL or click Upload Image..." />
                  <img id="hero-banner-preview" class="img-mini-preview" alt="Hero Banner Preview" hidden />
                </div>
              </div>
            </div>

            <div class="card">
              <div class="card-title"><span>3. Action Buttons &amp; Protected Download Link</span></div>
              <div class="card-desc">
                Any link placed in "Protected Download Destination" is automatically encrypted and served through the built-in download protection gate.
              </div>
              <div class="form-grid cols-2">
                <div class="field">
                  <label class="field-label" for="cta-left-text">Secondary Button Text</label>
                  <input type="text" id="cta-left-text" class="input" placeholder="e.g., View Specifications" />
                </div>
                <div class="field">
                  <label class="field-label" for="cta-left-url">Secondary Button Link</label>
                  <input type="text" id="cta-left-url" class="input" placeholder="e.g., /#technical-specifications" />
                </div>
                <div class="field">
                  <label class="field-label" for="cta-right-text">Primary Download Button Text</label>
                  <input type="text" id="cta-right-text" class="input" placeholder="e.g., Download Now" />
                </div>
                <div class="field">
                  <label class="field-label" for="cta-right-url">Primary Button Link</label>
                  <input type="text" id="cta-right-url" class="input" placeholder="/moreinfo" />
                </div>
                <div class="field span-full">
                  <label class="field-label" for="sec-primary-url">Protected Download Destination URL (APK / App Link)</label>
                  <input type="url" id="sec-primary-url" class="input" placeholder="https://cdn.example.com/official-release.apk" />
                </div>
                <div class="field span-full">
                  <div class="toggle-box">
                    <div>
                      <strong>Temporarily Pause Downloads</strong>
                      <div class="field-help">Turn on during maintenance to pause the download button without deleting your link.</div>
                    </div>
                    <input type="checkbox" id="sec-paused" />
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
                <h2>Package Info Table</h2>
                <p>Fill in only the fields you want to show. Empty rows are hidden automatically.</p>
              </div>
              <div class="panel-header-actions">
                <button type="button" class="btn btn-primary" data-inline-save-module="packageSpecs">Save Package Info to Firebase</button>
              </div>
            </div>

            <div class="card">
              <div class="form-grid cols-2">
                <div class="field span-full">
                  <div class="toggle-box">
                    <div>
                      <strong>Show Package Info Table on Homepage</strong>
                      <div class="field-help">Displays the specifications table on your homepage.</div>
                    </div>
                    <input type="checkbox" id="specs-enabled" checked />
                  </div>
                </div>
                <div class="field span-full">
                  <label class="field-label" for="specs-heading">Table Heading</label>
                  <input type="text" id="specs-heading" class="input" placeholder="Technical Package Specifications" />
                </div>
                <div class="field">
                  <label class="field-label" for="specs-app-name">Application Name</label>
                  <input type="text" id="specs-app-name" class="input" />
                </div>
                <div class="field">
                  <label class="field-label" for="specs-version">Latest Version</label>
                  <input type="text" id="specs-version" class="input" placeholder="e.g., v1.0.0" />
                </div>
                <div class="field">
                  <label class="field-label" for="specs-size">File Size</label>
                  <input type="text" id="specs-size" class="input" placeholder="e.g., 42 MB" />
                </div>
                <div class="field">
                  <label class="field-label" for="specs-os">System Requirements</label>
                  <input type="text" id="specs-os" class="input" placeholder="e.g., Android 8.0+" />
                </div>
                <div class="field">
                  <label class="field-label" for="specs-format">Package Format</label>
                  <input type="text" id="specs-format" class="input" placeholder="e.g., Signed APK" />
                </div>
                <div class="field">
                  <label class="field-label" for="specs-license">License / Price</label>
                  <input type="text" id="specs-license" class="input" placeholder="e.g., Free" />
                </div>
                <div class="field">
                  <label class="field-label" for="specs-security">Security Scan Status</label>
                  <input type="text" id="specs-security" class="input" placeholder="e.g., Verified Clean" />
                </div>
                <div class="field">
                  <label class="field-label" for="specs-updated">Last Updated</label>
                  <input type="text" id="specs-updated" class="input" placeholder="e.g., November 2026" />
                </div>
                <div class="field span-full">
                  <label class="field-label" for="specs-sha256">
                    <span>SHA-256 Checksum (Optional)</span>
                    <button type="button" id="btn-gen-sha256" class="btn btn-sm">Generate</button>
                  </label>
                  <input type="text" id="specs-sha256" class="input" style="font-family:monospace;" placeholder="Optional verification hash..." />
                </div>
              </div>

              <div class="card-title" style="margin-top:16px;">
                <span>Custom Rows (Optional)</span>
                <button type="button" id="btn-add-custom-spec" class="btn btn-sm">+ Add Row</button>
              </div>
              <div id="custom-specs-list"></div>
            </div>
          </section>

          <!-- ───────────────────────────────────────────────────────────────────
               5. PAGE SECTIONS & HTML BODY
               ─────────────────────────────────────────────────────────────────── -->
          <section class="tab-panel" id="panel-sections">
            <div class="panel-header">
              <div>
                <h2>Page Sections &amp; HTML Body</h2>
                <p>Add content sections and write or paste HTML body. Headings, links, and images are formatted cleanly automatically.</p>
              </div>
              <div class="panel-header-actions">
                <button type="button" id="btn-add-section" class="btn btn-primary">+ Add Blank Section</button>
              </div>
            </div>

            <div class="card">
              <div class="card-title">
                <span>Homepage Sections</span>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                  <button type="button" class="btn btn-sm" data-add-section-template="guide">+ Guide</button>
                  <button type="button" class="btn btn-sm" data-add-section-template="features">+ Features</button>
                  <button type="button" class="btn btn-sm" data-add-section-template="changelog">+ Changelog</button>
                </div>
              </div>
              <div class="list-filter-bar" style="margin-bottom:12px;">
                <input type="search" id="sections-search-input" class="input list-search-input" placeholder="Search sections..." />
                <button type="button" id="btn-sections-expand-all" class="btn btn-sm">Expand All</button>
                <button type="button" id="btn-sections-collapse-all" class="btn btn-sm">Collapse All</button>
              </div>
              <div id="sections-list"></div>
            </div>

            <div class="card">
              <div class="card-title">
                <span>Extra Custom HTML Body (Homepage)</span>
                <button type="button" class="btn btn-sm" data-toggle-preview="global-raw-preview">Preview</button>
              </div>
              <div class="card-desc">
                Paste any full custom HTML body block here to display directly on the homepage.
              </div>
              <div class="html-toolbar">
                <button type="button" class="btn btn-sm btn-primary" data-open-visual-modal="global-raw-html" data-preview="global-raw-preview">+ Visual Block</button>
                <button type="button" class="btn btn-sm btn-dark" data-open-image-modal="global-raw-html" data-preview="global-raw-preview">+ Image</button>
                <button type="button" class="btn btn-sm" data-open-link-modal="global-raw-html" data-preview="global-raw-preview">+ Link</button>
                <button type="button" class="btn btn-sm" data-insert-snippet="p" data-target="global-raw-html">+ P</button>
                <button type="button" class="btn btn-sm" data-insert-snippet="h2" data-target="global-raw-html">+ H2</button>
                <button type="button" class="btn btn-sm" data-insert-snippet="h3" data-target="global-raw-html">+ H3</button>
                <button type="button" class="btn btn-sm" data-insert-snippet="ul" data-target="global-raw-html">+ List</button>
                <button type="button" class="btn btn-sm" data-insert-snippet="table" data-target="global-raw-html">+ Table</button>
                <button type="button" class="btn btn-sm" data-undo-target="global-raw-html">Undo</button>
              </div>
              <textarea id="global-raw-html" class="textarea code" rows="6" data-preview-target="global-raw-preview" placeholder="Paste custom HTML content here (optional)..."></textarea>
              <div id="global-raw-preview" class="live-preview-box"></div>
              <div style="display:flex; justify-content:flex-end; margin-top:10px;">
                <button type="button" class="btn btn-primary btn-sm" data-inline-save-module="content">Save HTML Body to Firebase</button>
              </div>
            </div>

            <div class="card">
              <div class="card-title"><span>Homepage Section Order</span></div>
              <div class="card-desc">Move blocks up or down to arrange your homepage top-to-bottom.</div>
              <div id="homepage-order-list"></div>
            </div>
          </section>

          <!-- ───────────────────────────────────────────────────────────────────
               6. DAILY NEWS
               ─────────────────────────────────────────────────────────────────── -->
          <section class="tab-panel" id="panel-news">
            <div class="panel-header">
              <div>
                <h2>Daily News</h2>
                <p>Write a headline, add your content or HTML body, and publish directly to Firebase. URLs, RSS feed, and sitemap update automatically.</p>
              </div>
              <div class="panel-header-actions">
                <a href="/news" target="_blank" class="btn">View /news ↗</a>
              </div>
            </div>

            <!-- Simple News Composer -->
            <div class="card">
              <div class="card-title">
                <span id="news-composer-heading">Write a News Post</span>
                <span class="field-tag" id="news-composer-mode-badge">New Post</span>
              </div>
              <div class="form-grid">
                <div class="field">
                  <label class="field-label" for="composer-news-title">Headline</label>
                  <input type="text" id="composer-news-title" class="input" placeholder="e.g., New Update Released With Faster Performance" />
                </div>

                <div class="field">
                  <label class="field-label" for="composer-news-summary">Short Summary (1–2 sentences)</label>
                  <textarea id="composer-news-summary" class="textarea" rows="2" placeholder="Brief summary shown on the news list..."></textarea>
                </div>

                <div class="field">
                  <label class="field-label" for="composer-news-cover-url">
                    <span>Cover Image (Optional)</span>
                    <button type="button" class="btn btn-sm" data-upload-target="composer-news-cover-url" data-preview-target="composer-news-cover-preview">Upload Image</button>
                  </label>
                  <input type="text" id="composer-news-cover-url" class="input" placeholder="Paste image URL or click Upload Image..." />
                  <img id="composer-news-cover-preview" class="img-mini-preview" alt="Cover Preview" hidden />
                </div>

                <div class="field">
                  <div class="field-label">
                    <span>Full Article Content / HTML Body</span>
                    <button type="button" class="btn btn-sm" data-toggle-preview="composer-news-preview">Preview</button>
                  </div>
                  <div class="html-toolbar">
                    <button type="button" class="btn btn-sm btn-primary" data-open-visual-modal="composer-news-html" data-preview="composer-news-preview">+ Visual Block</button>
                    <button type="button" class="btn btn-sm btn-dark" data-open-image-modal="composer-news-html" data-preview="composer-news-preview">+ Image</button>
                    <button type="button" class="btn btn-sm" data-open-link-modal="composer-news-html" data-preview="composer-news-preview">+ Link</button>
                    <button type="button" class="btn btn-sm" data-insert-snippet="b" data-target="composer-news-html"><b>B</b></button>
                    <button type="button" class="btn btn-sm" data-insert-snippet="p" data-target="composer-news-html">+ P</button>
                    <button type="button" class="btn btn-sm" data-insert-snippet="h3" data-target="composer-news-html">+ H3</button>
                    <button type="button" class="btn btn-sm" data-insert-snippet="ul" data-target="composer-news-html">+ List</button>
                    <button type="button" class="btn btn-sm" data-insert-snippet="callout" data-target="composer-news-html">+ Callout</button>
                    <button type="button" class="btn btn-sm" data-undo-target="composer-news-html">Undo</button>
                  </div>
                  <textarea id="composer-news-html" class="textarea code" rows="6" data-preview-target="composer-news-preview" placeholder="Write your article text or paste HTML body here..."></textarea>
                  <div id="composer-news-preview" class="live-preview-box"></div>
                </div>

                <div style="display:flex; flex-direction:row; gap:8px; flex-wrap:wrap; align-items:center; margin-top:4px;">
                  <button type="button" id="btn-publish-single-news" class="btn btn-primary">Save News Post to Firebase</button>
                  <button type="button" id="btn-clear-news-composer" class="btn">Clear</button>
                </div>
              </div>
            </div>

            <!-- Published News List -->
            <div class="card">
              <div class="card-title">
                <span>Published News Posts</span>
                <div class="toggle-box" style="padding:4px 10px; min-height:34px; gap:8px;">
                  <span style="font-size:0.78rem;">Show on Homepage</span>
                  <input type="checkbox" id="news-enabled" checked />
                </div>
              </div>
              <div class="list-filter-bar" style="margin-bottom:12px;">
                <input type="search" id="news-search-input" class="input list-search-input" placeholder="Search news posts..." />
                <button type="button" id="btn-news-expand-all" class="btn btn-sm">Expand All</button>
                <button type="button" id="btn-news-collapse-all" class="btn btn-sm">Collapse All</button>
              </div>
              <div id="news-list"></div>
            </div>
          </section>

          <!-- ───────────────────────────────────────────────────────────────────
               7. FAQS
               ─────────────────────────────────────────────────────────────────── -->
          <section class="tab-panel" id="panel-faqs">
            <div class="panel-header">
              <div>
                <h2>Frequently Asked Questions</h2>
                <p>Add helpful questions and answers for your visitors.</p>
              </div>
              <div class="panel-header-actions">
                <button type="button" id="btn-add-faq" class="btn btn-primary">+ Add FAQ</button>
              </div>
            </div>

            <div class="card">
              <div class="form-grid">
                <div class="field">
                  <div class="toggle-box">
                    <div>
                      <strong>Show FAQs Section on Homepage</strong>
                      <div class="field-help">Displays your questions and answers in a clean accordion.</div>
                    </div>
                    <input type="checkbox" id="faqs-enabled" checked />
                  </div>
                </div>
                <div class="field">
                  <label class="field-label" for="faqs-heading">FAQs Section Heading</label>
                  <input type="text" id="faqs-heading" class="input" placeholder="Frequently Asked Questions" />
                </div>
              </div>
            </div>

            <div class="card">
              <div class="card-title">
                <span>Questions &amp; Answers</span>
                <button type="button" class="btn btn-primary btn-sm" data-inline-save-module="faqsSection">Save FAQs to Firebase</button>
              </div>
              <div id="faqs-list"></div>
            </div>
          </section>

          <!-- ───────────────────────────────────────────────────────────────────
               8. PAGES & FOOTER
               ─────────────────────────────────────────────────────────────────── -->
          <section class="tab-panel" id="panel-pages">
            <div class="panel-header">
              <div>
                <h2>Pages &amp; Footer</h2>
                <p>Manage your standalone pages (Privacy Policy, Terms, Contact, etc.) and bottom footer text.</p>
              </div>
              <div class="panel-header-actions">
                <button type="button" id="btn-generate-legal-pack" class="btn btn-dark">+ Starter Legal Pages</button>
                <button type="button" id="btn-add-page" class="btn btn-primary">+ Add Page</button>
              </div>
            </div>

            <div class="card">
              <div class="card-title"><span>1. Standalone Pages</span></div>
              <div class="card-desc">Pick a page below to edit its title and HTML content. Footer links and page URLs are managed automatically.</div>
              <div id="legal-page-selector" class="page-selector-bar" style="margin-bottom:14px;"></div>
              <div id="pages-list"></div>
            </div>

            <div class="card">
              <div class="card-title">
                <span>2. Footer Text</span>
                <button type="button" class="btn btn-primary btn-sm" data-inline-save-module="navigation">Save Footer to Firebase</button>
              </div>
              <div class="form-grid">
                <div class="field">
                  <label class="field-label" for="nav-footer-summary">Short Brand Summary (Footer)</label>
                  <textarea id="nav-footer-summary" class="textarea" rows="2" placeholder="One-sentence summary of your website..."></textarea>
                </div>
                <div class="field">
                  <label class="field-label" for="footer-disclaimer-text">Footer Disclaimer Text</label>
                  <textarea id="footer-disclaimer-text" class="textarea" rows="3" placeholder="Optional legal notice or disclaimer..."></textarea>
                </div>
                <div class="field">
                  <label class="field-label" for="footer-copyright-text">Copyright Line</label>
                  <input type="text" id="footer-copyright-text" class="input" placeholder="© 2026 Your Brand. All Rights Reserved." />
                </div>
              </div>
            </div>
          </section>

          <!-- ───────────────────────────────────────────────────────────────────
               9. PUBLISH WEBSITE
               ─────────────────────────────────────────────────────────────────── -->
          <section class="tab-panel" id="panel-deploy">
            <div class="panel-header">
              <div>
                <h2>Publish Website</h2>
                <p>Your content saves directly to Firebase. Click Publish below whenever you want to push fresh static pages to GitHub.</p>
              </div>
              <div class="panel-header-actions">
                <button type="button" id="btn-github-push" class="btn btn-primary">Publish Website to GitHub</button>
              </div>
            </div>

            <div class="card">
              <div class="card-title">
                <span>Publish Status &amp; Sync Queue</span>
                <span class="field-tag" id="gh-status-badge">Ready</span>
              </div>

              <div id="pending-sync-summary" class="sync-queue-banner">
                <div class="sync-queue-left">
                  <strong>Pending Changes:</strong>
                  <div id="pending-sync-badges" class="sync-queue-badges">
                    <span class="sync-pill clean">All changes synced</span>
                  </div>
                </div>
                <span class="field-tag" id="pending-sync-count">0 pending</span>
              </div>

              <div class="deploy-actions-row" style="margin-top:12px;">
                <button type="button" id="btn-compile-static-bundle" class="btn btn-dark">Rebuild Preview Bundle</button>
                <button type="button" id="btn-clear-deploy-logs" class="btn btn-sm">Clear Log</button>
              </div>

              <div id="deploy-terminal-log" class="deploy-terminal-log" style="margin-top:12px;" role="log" aria-live="polite">
                [Ready] Content saves directly to Firebase. Click "Publish Website to GitHub" when ready to deploy.
              </div>

              <div id="gh-push-feedback" class="seo-subbox" style="margin-top:12px; display:none;"></div>
            </div>

            <!-- Collapsed One-Time Connection Settings & Backups -->
            <details class="advanced-settings-box" style="margin-top:14px;">
              <summary class="advanced-settings-summary">
                <span>One-Time Connection Settings &amp; Backups (GitHub / Firebase)</span>
                <span style="font-size:0.72rem; color:var(--text-muted); font-weight:400;">Click to expand</span>
              </summary>
              <div class="advanced-settings-content">
                <div class="card" style="margin-bottom:14px;">
                  <div class="card-title"><span>GitHub Repository Connection</span></div>
                  <div class="form-grid cols-2">
                    <div class="field">
                      <label class="field-label" for="gh-owner">GitHub Username / Org</label>
                      <input type="text" id="gh-owner" class="input" placeholder="e.g., my-org" autocomplete="off" />
                    </div>
                    <div class="field">
                      <label class="field-label" for="gh-repo">Repository Name</label>
                      <input type="text" id="gh-repo" class="input" placeholder="e.g., my-website" autocomplete="off" />
                    </div>
                    <div class="field">
                      <label class="field-label" for="gh-branch">Branch</label>
                      <input type="text" id="gh-branch" class="input" value="main" placeholder="main" autocomplete="off" />
                    </div>
                    <div class="field">
                      <label class="field-label" for="gh-dir">Output Folder</label>
                      <input type="text" id="gh-dir" class="input" value="dist-public" placeholder="dist-public" autocomplete="off" />
                    </div>
                    <div class="field span-full">
                      <label class="field-label" for="gh-token">
                        <span>GitHub Fine-Grained Token</span>
                        <button type="button" id="btn-clear-gh-token" class="btn btn-sm">Clear Token</button>
                      </label>
                      <div class="password-input-wrap">
                        <input type="password" id="gh-token" class="input" placeholder="github_pat_..." autocomplete="off" />
                        <button type="button" id="btn-toggle-gh-token" class="btn btn-sm password-toggle-btn" aria-label="Show or hide GitHub Token">Show</button>
                      </div>
                    </div>
                    <div class="field span-full">
                      <label class="field-label" for="gh-commit-msg">Commit Message</label>
                      <input type="text" id="gh-commit-msg" class="input" value="chore(static-publish): sync compiled static public site" />
                    </div>
                    <div class="field span-full">
                      <div class="toggle-box">
                        <div>
                          <strong>Auto-Push to GitHub on Every Save</strong>
                          <div class="field-help">Automatically deploy to GitHub whenever you click Save &amp; Publish.</div>
                        </div>
                        <input type="checkbox" id="gh-auto-push" />
                      </div>
                    </div>
                    <div class="field span-full deploy-actions-row">
                      <button type="button" id="btn-github-test" class="btn btn-dark">Test GitHub Connection</button>
                      <button type="button" class="btn btn-primary" data-inline-save-module="githubConfig">Save GitHub Settings</button>
                    </div>
                  </div>
                </div>

                <div class="card" style="margin-bottom:14px;">
                  <div class="card-title">
                    <span>Firebase Cloud Firestore Connection &amp; Backups</span>
                    <span class="field-tag" id="fb-env-badge">Checking...</span>
                  </div>
                  <div class="seo-subbox" style="margin-bottom:12px;">
                    <div class="seo-subbox-title">
                      <span>Paste Firebase Config Snippet</span>
                      <button type="button" id="btn-parse-fb-snippet" class="btn btn-sm btn-primary">Parse &amp; Auto-Fill</button>
                    </div>
                    <textarea id="fb-snippet-input" class="textarea code" rows="3" placeholder='Paste const firebaseConfig = { apiKey: "...", projectId: "...", ... };'></textarea>
                  </div>
                  <div class="form-grid cols-2">
                    <div class="field">
                      <label class="field-label" for="fb-api-key">API Key</label>
                      <div class="password-input-wrap">
                        <input type="password" id="fb-api-key" class="input" placeholder="Configured via env or paste key..." autocomplete="off" />
                        <button type="button" id="btn-toggle-fb-apikey" class="btn btn-sm password-toggle-btn" aria-label="Show or hide Firebase API Key">Show</button>
                      </div>
                    </div>
                    <div class="field">
                      <label class="field-label" for="fb-project-id">Project ID</label>
                      <input type="text" id="fb-project-id" class="input" placeholder="your-project-id" autocomplete="off" />
                    </div>
                    <div class="field">
                      <label class="field-label" for="fb-auth-domain">Auth Domain</label>
                      <input type="text" id="fb-auth-domain" class="input" placeholder="your-project.firebaseapp.com" autocomplete="off" />
                    </div>
                    <div class="field">
                      <label class="field-label" for="fb-storage-bucket">Storage Bucket</label>
                      <input type="text" id="fb-storage-bucket" class="input" placeholder="your-project.appspot.com" autocomplete="off" />
                    </div>
                    <div class="field">
                      <label class="field-label" for="fb-messaging-sender-id">Messaging Sender ID</label>
                      <input type="text" id="fb-messaging-sender-id" class="input" placeholder="123456789012" autocomplete="off" />
                    </div>
                    <div class="field">
                      <label class="field-label" for="fb-app-id">App ID</label>
                      <input type="text" id="fb-app-id" class="input" placeholder="1:123456:web:abcdef" autocomplete="off" />
                    </div>
                    <div class="field span-full">
                      <label class="field-label" for="fb-database-id">Database ID</label>
                      <input type="text" id="fb-database-id" class="input" placeholder="(default)" autocomplete="off" />
                    </div>
                    <div class="field span-full deploy-actions-row">
                      <button type="button" id="btn-save-firebase" class="btn btn-dark">Save &amp; Connect Firebase</button>
                      <button type="button" id="btn-test-firebase" class="btn btn-primary">Test Connection</button>
                      <button type="button" id="btn-clear-firebase" class="btn">Use Env Defaults</button>
                      <button type="button" id="btn-export-json" class="btn">Export Backup</button>
                      <label class="btn" style="cursor:pointer;">
                        Import Backup
                        <input type="file" id="input-import-json" accept="application/json" style="display:none;" />
                      </label>
                      <button type="button" id="btn-reset-defaults" class="btn btn-danger">Clear All Content</button>
                    </div>
                  </div>
                  <div id="fb-test-feedback" class="seo-subbox" style="margin-top:10px; display:none;"></div>
                </div>

                <div class="card">
                  <div class="card-title">
                    <span>Compiled Public Files &amp; Deploy History</span>
                    <span class="field-tag" id="static-bundle-count">0 files</span>
                  </div>
                  <div id="static-bundle-summary" class="seo-subbox" style="margin-bottom:10px;"></div>
                  <div class="table-scroll-wrapper" style="max-height:240px; overflow:auto;">
                    <table class="data-table">
                      <thead>
                        <tr><th>Static File Path</th><th>Size</th><th>Description</th></tr>
                      </thead>
                      <tbody id="static-files-tbody"></tbody>
                    </table>
                  </div>
                  <div id="github-deploy-history-list" style="margin-top:12px;"></div>
                </div>
              </div>
            </details>
          </section>
        </main>
      </div>

      <!-- Compact Single-Row Sticky Bottom Save Bar -->
      <div class="bottom-save-bar">
        <div class="bottom-save-inner">
          <div class="save-bar-status">
            <div class="save-feedback" id="save-feedback-text">All changes saved</div>
            <span id="dirty-modules-summary" class="dirty-modules-summary"></span>
          </div>
          <div class="save-bar-actions">
            <button type="button" id="btn-save-active-module" class="btn btn-dark btn-sm">Save to Firebase</button>
            <button type="button" id="btn-bottom-save" class="btn btn-primary btn-sm">Save &amp; Publish</button>
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
          Upload an image from your device or paste an image link to insert it into your content.
        </div>
        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="modal-img-url">
              <span>Image URL</span>
              <button type="button" class="btn btn-sm btn-primary" data-upload-target="modal-img-url" data-preview-target="modal-img-preview">Upload Image</button>
            </label>
            <input type="text" id="modal-img-url" class="input" placeholder="https://... or /uploads/..." />
            <img id="modal-img-preview" class="img-mini-preview" alt="Preview" hidden />
          </div>
          <div class="field">
            <label class="field-label" for="modal-img-alt">Short Description (Optional)</label>
            <input type="text" id="modal-img-alt" class="input" placeholder="What does this image show?" />
          </div>
          <div class="field">
            <label class="field-label" for="modal-img-caption">Caption (Optional)</label>
            <input type="text" id="modal-img-caption" class="input" placeholder="Optional caption under image..." />
          </div>
          <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:8px;">
            <button type="button" id="btn-confirm-insert-image" class="btn btn-primary">+ Insert Image</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Visual Block Builder Modal -->
    <div id="visual-block-modal" class="cms-modal-backdrop" hidden>
      <div class="cms-modal-card">
        <div class="card-title">
          <span>Visual Block Builder</span>
          <button type="button" id="btn-close-visual-block-modal" class="btn btn-sm">Close</button>
        </div>
        <div class="card-desc">
          Pick a clean layout block, type your text, and click Insert.
        </div>
        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="vb-type">Block Style</label>
            <select id="vb-type" class="select">
              <option value="callout">1. Highlight / Note Box</option>
              <option value="grid">2. Two-Column Feature Cards</option>
              <option value="steps">3. Numbered Step-by-Step Guide</option>
              <option value="checklist">4. Bullet Checklist</option>
              <option value="table">5. Two-Column Comparison Table</option>
              <option value="cta">6. Inline Action Button</option>
              <option value="accordion">7. Expandable Details Box</option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="vb-title-1" id="vb-label-title-1">Title</label>
            <input type="text" id="vb-title-1" class="input" value="Important Note" />
          </div>
          <div class="field">
            <label class="field-label" for="vb-text-1" id="vb-label-text-1">Description</label>
            <textarea id="vb-text-1" class="textarea" rows="2">Add your details here.</textarea>
          </div>
          <div class="field" id="vb-group-2" style="display:none;">
            <label class="field-label" for="vb-title-2" id="vb-label-title-2">Second Item Title</label>
            <input type="text" id="vb-title-2" class="input" value="Fast &amp; Lightweight" />
          </div>
          <div class="field" id="vb-group-2-text" style="display:none;">
            <label class="field-label" for="vb-text-2" id="vb-label-text-2">Second Item Description</label>
            <textarea id="vb-text-2" class="textarea" rows="2">Pages load fast on every device.</textarea>
          </div>
          <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:8px;">
            <button type="button" id="btn-confirm-visual-block" class="btn btn-primary">+ Insert Block</button>
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
        <div class="card-desc">Pick an existing page or paste any external link.</div>
        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="modal-link-text">Link Text</label>
            <input type="text" id="modal-link-text" class="input" placeholder="e.g., View Specifications" />
          </div>
          <div class="field">
            <label class="field-label" for="modal-link-preset">Quick Pick Page</label>
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
                <div class="field-help">Best when linking to external websites.</div>
              </div>
              <input type="checkbox" id="modal-link-newtab" />
            </div>
          </div>
          <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:8px;">
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
              <option value="/news">Daily News (/news)</option>
              <option value="/privacy-policy">Privacy Policy</option>
              <option value="/moreinfo">Download Gate (/moreinfo)</option>
            </select>
          </div>
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <button type="button" id="btn-preview-mobile" class="btn btn-sm btn-dark">Mobile 390px</button>
            <button type="button" id="btn-preview-desktop" class="btn btn-sm">Desktop</button>
            <button type="button" id="btn-preview-save-reload" class="btn btn-sm btn-primary">Save &amp; Refresh</button>
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
