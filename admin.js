import {
  EMPTY_ADMIN_CONFIG,
  isCmsModuleKey,
  extractConfigModule,
  mergeSiteConfig,
  generateSlug,
  generateSmartLegalHtml,
  auditSiteSeoHealth
} from './src/utils/cms-engine.ts';

import {
  getCachedSiteConfigSync,
  getSiteConfigRemote,
  saveSiteConfigRemote,
  saveSiteConfigModuleRemote,
  saveSiteConfigModulesBatchRemote,
  resetSiteConfigRemote,
  uploadImageRemote,
  verifyGitHubRepoRemote,
  publishStaticSiteToGitHubRemote,
  getActiveFirebaseConfig,
  saveActiveFirebaseConfig,
  clearActiveFirebaseConfig,
  isRealFirebaseConfig,
  testFirebaseConnectionRemote,
  getLastEnvDiagnostics,
  parseFirebaseConfigSnippet,
  normalizeFirebaseClientConfig,
  loginAdminUser,
  verifyAdminSession,
  logoutAdminUser,
  onAdminUnauthorized,
  notifyAdminUnauthorized
} from './firebase-config.js';

let currentConfig = mergeSiteConfig(getCachedSiteConfigSync(), EMPTY_ADMIN_CONFIG);
let activeTab = 'overview';
let activeLegalPageIndex = 0;
let authMode = 'credentials';
let isDirty = false;
const dirtyModules = new Set();
let pendingClearGithubToken = false;
let pendingClearTurnstileSecret = false;

// State for Global Image Upload, Insert Image Modal, Link Modal & Visual Block Builder Modal
let pendingUploadCallback = null;
let activeImageModalTarget = null;
let activeVisualBlockTarget = null;
let activeLinkModalTarget = null;
let sectionSearchQuery = '';
let newsSearchQuery = '';
let faqSearchQuery = '';
let openSectionIndex = 0;
let openNewsIndex = 0;
let openFaqIndex = 0;
const editorUndoHistory = new Map();

const $ = (id) => document.getElementById(id);

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(message, type = 'default') {
  const toast = $('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast visible ${type}`;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.remove('visible');
  }, 3400);
}

const TAB_MODULES_MAP = {
  overview: ['brand', 'packageSpecs', 'domainConfig', 'seo', 'hero', 'navigation', 'pages', 'securityGate'],
  brand: ['brand', 'uiConfig'],
  hero: ['hero', 'uiConfig'],
  specs: ['packageSpecs'],
  sections: ['sections', 'content', 'uiConfig'],
  news: ['newsSection', 'uiConfig'],
  faqs: ['faqsSection', 'uiConfig'],
  pages: ['pages', 'navigation', 'uiConfig'],
  security: ['securityGate'],
  links: ['domainConfig'],
  domain: ['domainConfig', 'seo'],
  deploy: ['githubConfig']
};

function getPrimaryModuleForActiveTab(tabId = activeTab) {
  const map = {
    overview: 'brand',
    brand: 'brand',
    hero: 'hero',
    specs: 'packageSpecs',
    sections: 'sections',
    news: 'newsSection',
    faqs: 'faqsSection',
    pages: 'pages',
    security: 'securityGate',
    links: 'domainConfig',
    domain: 'domainConfig',
    deploy: 'githubConfig'
  };
  return map[tabId] || 'brand';
}

function inferModuleKeyFromElement(el) {
  if (!el) return getPrimaryModuleForActiveTab();
  const col = el.dataset?.collection || el.getAttribute?.('data-collection') || '';
  if (col === 'sections') return 'sections';
  if (col === 'news') return 'newsSection';
  if (col === 'faqs') return 'faqsSection';
  if (col === 'pages') return 'pages';
  if (col === 'menu' || col === 'footerQuickLinks') return 'navigation';
  if (col === 'customSpecs') return 'packageSpecs';
  if (col === 'internalLinks') return 'domainConfig';

  const id = String(el.id || '');
  if (id.startsWith('fb-') || id.startsWith('qc-')) return null;
  if (id.startsWith('brand-')) return 'brand';
  if (id.startsWith('hero-') || id.startsWith('cta-') || id.startsWith('floating-cta-')) return 'hero';
  if (id.startsWith('ui-')) return 'uiConfig';
  if (id.startsWith('specs-') || id === 'btn-gen-sha256') return 'packageSpecs';
  if (id.startsWith('news-')) return 'newsSection';
  if (id.startsWith('faqs-')) return 'faqsSection';
  if (id === 'global-raw-html') return 'content';
  if (id.startsWith('nav-') || id.startsWith('footer-')) return 'navigation';
  if (id.startsWith('domain-')) return 'domainConfig';
  if (id.startsWith('seo-') || id.startsWith('schema-')) return 'seo';
  if (id.startsWith('sec-')) return 'securityGate';
  if (id.startsWith('gh-')) return 'githubConfig';
  return getPrimaryModuleForActiveTab();
}

function renderDirtyModulesSummary() {
  const summaryEl = $('dirty-modules-summary');
  const edited = Array.from(dirtyModules);
  if (summaryEl) {
    if (edited.length === 0) {
      summaryEl.innerHTML = '';
    } else {
      summaryEl.innerHTML = edited
        .map((m) => `<span class="sync-module-chip">${escapeHtml(m)}</span>`)
        .join('');
    }
  }

  const pendingSyncSet = new Set([
    ...(Array.isArray(currentConfig?.dirtyModulesSinceSync) ? currentConfig.dirtyModulesSinceSync : []),
    ...edited
  ]);
  const pendingArr = Array.from(pendingSyncSet);
  const pendingTextEl = $('gh-pending-modules-text');
  const pendingTagEl = $('gh-pending-count-tag');
  if (pendingTextEl) {
    pendingTextEl.innerHTML =
      pendingArr.length === 0
        ? '<span style="color:#059669;font-weight:700;">All modules synced to Public</span>'
        : pendingArr.map((m) => `<span class="sync-module-chip">${escapeHtml(m)}</span>`).join(' ');
  }
  if (pendingTagEl) {
    pendingTagEl.textContent = `${pendingArr.length} pending`;
  }
}

function markDirty(message = 'Unsaved edits — click "Publish Edited Modules" to go live', moduleKey = null) {
  isDirty = true;
  if (moduleKey && isCmsModuleKey(moduleKey)) {
    dirtyModules.add(moduleKey);
  } else {
    dirtyModules.add(getPrimaryModuleForActiveTab());
  }
  renderDirtyModulesSummary();
  const fb = $('save-feedback-text');
  if (fb) {
    fb.textContent = message;
    fb.style.color = '#d97706';
  }
}

function markClean(message = 'All changes published and compiled to static public site') {
  isDirty = false;
  dirtyModules.clear();
  renderDirtyModulesSummary();
  const fb = $('save-feedback-text');
  if (fb) {
    fb.textContent = message;
    fb.style.color = '#059669';
  }
}

/**
 * Trigger Device Image File Picker & Upload to `/api/upload-image`
 */
function triggerDeviceImageUpload(onUploadedUrl) {
  const fileInput = $('global-image-file-picker');
  if (!fileInput) return;
  pendingUploadCallback = onUploadedUrl;
  fileInput.value = '';
  fileInput.click();
}

function pushUndoHistory(textareaId, prevVal) {
  if (!textareaId) return;
  const stack = editorUndoHistory.get(textareaId) || [];
  if (stack[stack.length - 1] !== prevVal) {
    stack.push(prevVal ?? '');
    if (stack.length > 15) stack.shift();
    editorUndoHistory.set(textareaId, stack);
  }
}

function undoTextareaEdit(textareaId) {
  const ta = $(textareaId);
  const stack = editorUndoHistory.get(textareaId);
  if (!ta || !stack || stack.length === 0) {
    showToast('Nothing to undo for this editor yet.');
    return;
  }
  const previous = stack.pop();
  ta.value = previous;
  const col = ta.getAttribute('data-collection');
  const idx = Number(ta.getAttribute('data-index'));
  const key = ta.getAttribute('data-key');
  if (col && !Number.isNaN(idx) && key) {
    const list = getCollectionRef(col);
    if (list && list[idx]) list[idx][key] = previous;
  }
  const previewId = ta.getAttribute('data-preview-target') || (textareaId === 'composer-news-html' ? 'composer-live-preview' : '');
  if (previewId && $(previewId)) $(previewId).innerHTML = previous;
  markDirty('Restored previous editor snapshot', inferModuleKeyFromElement(ta));
  showToast('Restored previous editor snapshot', 'success');
}

function getAvailableRouteTargets() {
  const targets = [
    { group: 'Homepage Sections', label: 'Package Specifications (#technical-specifications)', url: '/#technical-specifications' },
    { group: 'Homepage Sections', label: 'Daily News Feed (#latest-news)', url: '/#latest-news' },
    { group: 'Homepage Sections', label: 'FAQs Section (#frequently-asked-questions)', url: '/#frequently-asked-questions' }
  ];
  (currentConfig.sections || []).forEach((s) => {
    if (s.slug) {
      targets.push({ group: 'Homepage Sections', label: `${s.heading || s.slug} (#${s.slug})`, url: `/#${s.slug}` });
    }
  });
  targets.push({ group: 'Hubs & Gateway', label: 'All Daily News Hub (/news)', url: '/news' });
  targets.push({ group: 'Hubs & Gateway', label: 'Protected Download Gateway (/moreinfo)', url: '/moreinfo' });
  (currentConfig.pages || []).forEach((p) => {
    if (p.slug) {
      targets.push({ group: 'Legal & Standalone Pages', label: `${p.label || p.h1 || p.slug} (/${p.slug})`, url: `/${p.slug}` });
    }
  });
  (currentConfig.newsSection?.articles || []).slice(0, 12).forEach((a) => {
    if (a.slug) {
      targets.push({ group: 'Recent News Articles', label: `${a.title || a.slug} (/news/${a.slug})`, url: `/news/${a.slug}` });
    }
  });
  return targets;
}

function buildUrlPickerOptionsHtml(placeholder = 'Quick Pick Route…') {
  const targets = getAvailableRouteTargets();
  return [`<option value="">${escapeHtml(placeholder)}</option>`]
    .concat(targets.map((t) => `<option value="${escapeHtml(t.url)}">${escapeHtml(t.label)}</option>`))
    .join('');
}

function syncUrlQuickPickers() {
  const html = buildUrlPickerOptionsHtml('Quick Pick Route…');
  document.querySelectorAll('[data-url-picker-for]').forEach((sel) => {
    sel.innerHTML = html;
    sel.value = '';
  });
}

function setImagePreview(imgEl, rawUrl, displayStyle = 'block') {
  if (!imgEl) return;
  const val = String(rawUrl || '').trim();
  if (val) {
    imgEl.src = val;
    imgEl.removeAttribute('hidden');
    imgEl.style.display = displayStyle;
  } else {
    imgEl.removeAttribute('src');
    imgEl.setAttribute('hidden', '');
    imgEl.style.display = 'none';
  }
}

function updateVaultStatusIndicator() {
  const tag = $('sec-vault-status-tag');
  if (!tag) return;
  const raw = ($('sec-primary-url')?.value || currentConfig?.securityGate?.primaryDownloadUrl || '').trim();
  const enc = ($('sec-encrypted-url')?.value || currentConfig?.securityGate?.encryptedPrimaryUrl || '').trim();

  if (enc.startsWith('v2.') && enc.split('.').length >= 3) {
    tag.textContent = 'v2 Encrypted Ready';
    tag.style.background = '#ecfdf5';
    tag.style.color = '#065f46';
  } else if (raw && !enc) {
    tag.textContent = 'Pending Encryption (Encrypt or Save)';
    tag.style.background = '#fffbeb';
    tag.style.color = '#92400e';
  } else if (enc && !enc.startsWith('v2.')) {
    tag.textContent = 'Legacy / Invalid Vault Format';
    tag.style.background = '#fef2f2';
    tag.style.color = '#b91c1c';
  } else {
    tag.textContent = 'Not Set';
    tag.style.background = '#f1f5f9';
    tag.style.color = '#64748b';
  }
}

function refreshBrandThumbs() {
  const pairs = [
    ['brand-logo', 'brand-logo-thumb'],
    ['brand-favicon', 'brand-favicon-thumb'],
    ['brand-search-logo', 'brand-search-logo-thumb'],
    ['brand-apple-icon', 'brand-apple-icon-thumb']
  ];
  pairs.forEach(([inputId, imgId]) => {
    const inp = $(inputId);
    const img = $(imgId);
    if (inp && img) {
      setImagePreview(img, inp.value, 'inline-block');
    }
  });
}

function updateJsonLdStatusIndicator(rawVal) {
  const tag = $('seo-jsonld-status');
  if (!tag) return;
  const trimmed = (rawVal || '').trim();
  if (!trimmed) {
    tag.textContent = 'Optional Valid JSON Object or Array';
    tag.className = 'field-tag';
    return;
  }
  try {
    JSON.parse(trimmed);
    tag.textContent = 'Valid JSON-LD Ready';
    tag.className = 'field-tag char-ok';
  } catch {
    tag.textContent = 'Invalid JSON syntax';
    tag.className = 'field-tag char-warn';
  }
}

/**
 * Rich HTML Component Snippets for News, Content Sections & Legal Pages
 */
function getHtmlComponentSnippet(type) {
  switch (type) {
    case 'b':
      return ' <strong>Important Highlight</strong>';
    case 'p':
      return '\n<p>Enter your paragraph text here with clear, helpful details for your visitors.</p>';
    case 'h3':
      return '\n<h3>Subheading Title</h3>\n<p>Supporting explanation under this subheading.</p>';
    case 'ul':
      return '\n<ul>\n  <li><strong>Key Feature One:</strong> Explanation of this highlight.</li>\n  <li><strong>Key Feature Two:</strong> Explanation of this highlight.</li>\n</ul>';
    case 'steps':
      return '\n<ol>\n  <li><strong>Step 1:</strong> Download and verify the package checksum from our specifications table.</li>\n  <li><strong>Step 2:</strong> Open the verified installer and allow system installation prompts.</li>\n  <li><strong>Step 3:</strong> Launch the application—all previous preferences stay intact.</li>\n</ol>';
    case 'checklist':
      return '\n<ul>\n  <li><strong>Verified Checksum:</strong> Cryptographic SHA-256 signature verified.</li>\n  <li><strong>Zero Telemetry:</strong> Clean runtime with zero unwanted background scripts.</li>\n</ul>';
    case 'quote':
    case 'callout':
      return '\n<div class="cms-callout-box">\n  <strong>Verified Technical Note:</strong> Highlight an important tip, security verification note, or update notice here.\n</div>';
    case 'grid':
      return '\n<div class="cms-feature-grid">\n  <div class="cms-feature-item">\n    <strong>High-Speed Performance</strong>\n    <p style="margin:6px 0 0 0;">Optimized for sub-second response times on mobile and desktop.</p>\n  </div>\n  <div class="cms-feature-item">\n    <strong>Verified Integrity</strong>\n    <p style="margin:6px 0 0 0;">Every package is signed and verified with SHA-256 checksums.</p>\n  </div>\n</div>';
    case 'table':
      return '\n<table>\n  <tbody>\n    <tr><th>Parameter</th><td>Specification Value</td></tr>\n    <tr><th>Compatibility</th><td>Android 9.0+ / iOS 15.0+</td></tr>\n  </tbody>\n</table>';
    case 'cta':
      return '\n<div style="margin:18px 0;">\n  <a href="/#technical-specifications" data-spa-link class="section-inline-cta">Download Latest Build</a>\n</div>';
    case 'accordion':
      return '\n<details class="cms-accordion">\n  <summary>Click to expand technical details</summary>\n  <p style="margin-top:8px;">Detailed expandable explanation goes here.</p>\n</details>';
    case 'code':
      return '\n<p><code>SHA-256: 8f94e2c1a7b3d6f09e12c4a8b5d7e3f19a02c4b6d8e1f3a5c7b9d0e2f4a6b8c1</code></p>';
    default:
      return '';
  }
}

/**
 * Helper to append generated HTML into either a scalar textarea or a collection item's HTML field
 */
function insertHtmlIntoTarget(targetDescriptor, snippetHtml) {
  if (!targetDescriptor || !snippetHtml) return;
  if (targetDescriptor.type === 'id') {
    const textarea = $(targetDescriptor.id);
    if (textarea) {
      pushUndoHistory(targetDescriptor.id, textarea.value);
      textarea.value = `${textarea.value}${snippetHtml}`;
      const previewId =
        targetDescriptor.id === 'composer-news-html'
          ? 'composer-live-preview'
          : textarea.getAttribute('data-preview-target');
      if (previewId && $(previewId)) {
        $(previewId).innerHTML = textarea.value;
      }
      if (targetDescriptor.id !== 'composer-news-html') {
        const modKey = inferModuleKeyFromElement(textarea);
        markDirty('Inserted content block — click Save or Publish to persist', modKey);
      }
    }
  } else if (targetDescriptor.type === 'collection') {
    const { collection, index, key, textareaId, previewId } = targetDescriptor;
    const list = getCollectionRef(collection);
    if (list && list[index]) {
      const ta = $(textareaId);
      pushUndoHistory(textareaId, ta ? ta.value : list[index][key] || '');
      list[index][key] = `${list[index][key] || ''}${snippetHtml}`;
      if (ta) ta.value = list[index][key];
      const pv = previewId ? $(previewId) : null;
      if (pv) pv.innerHTML = list[index][key];
      const modKey = inferModuleKeyFromElement({ dataset: { collection } });
      markDirty('Inserted content block — click Save or Publish to persist', modKey);
    }
  }
}

/**
 * Open Interactive Insert Image Modal for any HTML Editor
 */
function openInsertImageModal(targetDescriptor) {
  activeImageModalTarget = targetDescriptor;
  const modal = $('image-insert-modal');
  if (!modal) return;
  if ($('modal-img-url')) $('modal-img-url').value = '';
  if ($('modal-img-alt')) $('modal-img-alt').value = '';
  if ($('modal-img-caption')) $('modal-img-caption').value = '';
  setImagePreview($('modal-img-preview'), '');
  modal.hidden = false;
}

function closeInsertImageModal() {
  const modal = $('image-insert-modal');
  if (modal) modal.hidden = true;
  activeImageModalTarget = null;
}

function confirmInsertImageFromModal() {
  const url = ($('modal-img-url')?.value || '').trim();
  const alt = ($('modal-img-alt')?.value || 'Article Image').trim();
  const caption = ($('modal-img-caption')?.value || '').trim();

  if (!url) {
    showToast('Please upload an image or enter an image URL first.', 'error');
    return;
  }

  const figureHtml = `\n<figure class="media-figure">\n  <img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" width="1200" height="675" loading="lazy" />\n${
    caption ? `  <figcaption class="media-caption">${escapeHtml(caption)}</figcaption>\n` : ''
  }</figure>`;

  insertHtmlIntoTarget(activeImageModalTarget, figureHtml);
  closeInsertImageModal();
  showToast('Image inserted into content!', 'success');
}

/**
 * Interactive Internal / External Link Insertion Modal (#link-insert-modal)
 */
function openInsertLinkModal(targetDescriptor) {
  activeLinkModalTarget = targetDescriptor;
  const modal = $('link-insert-modal');
  if (!modal) return;
  const presetSelect = $('modal-link-preset');
  if (presetSelect) {
    presetSelect.innerHTML = buildUrlPickerOptionsHtml('— Choose an existing site route or type below —');
    presetSelect.value = '';
  }
  setVal('modal-link-text', '');
  setVal('modal-link-url', '');
  setChecked('modal-link-newtab', false);
  modal.hidden = false;
}

function closeInsertLinkModal() {
  const modal = $('link-insert-modal');
  if (modal) modal.hidden = true;
  activeLinkModalTarget = null;
}

function confirmInsertLinkFromModal() {
  const text = ($('modal-link-text')?.value || '').trim();
  const url = ($('modal-link-url')?.value || '').trim();
  const newTab = Boolean($('modal-link-newtab')?.checked);

  if (!text || !url) {
    showToast('Enter both Link Anchor Text and Target URL.', 'error');
    return;
  }

  const isInternal = url.startsWith('/') || url.startsWith('#');
  const attrs = newTab
    ? ' target="_blank" rel="noopener noreferrer"'
    : isInternal
    ? ' data-spa-link'
    : '';
  const linkHtml = ` <a href="${escapeHtml(url)}"${attrs}>${escapeHtml(text)}</a>`;

  insertHtmlIntoTarget(activeLinkModalTarget, linkHtml);
  closeInsertLinkModal();
  showToast('Link inserted cleanly!', 'success');
}

/**
 * Live Public Website Preview Modal (#site-preview-modal)
 */
function loadPreviewIframe() {
  const iframe = $('site-preview-iframe');
  const route = $('preview-route-select')?.value || '/';
  if (!iframe) return;
  const sep = route.includes('?') ? '&' : '?';
  iframe.src = `${route}${sep}_preview=${Date.now()}`;
}

function openSitePreviewModal() {
  const modal = $('site-preview-modal');
  const sel = $('preview-route-select');
  if (!modal) return;
  if (sel) {
    const pages = (currentConfig.pages || [])
      .filter((p) => p.slug)
      .map((p) => `<option value="/${escapeHtml(p.slug)}">${escapeHtml(p.label || p.slug)} (/${escapeHtml(p.slug)})</option>`)
      .join('');
    sel.innerHTML = `
      <option value="/">Homepage (/)</option>
      <option value="/news">Daily News Hub (/news)</option>
      ${pages}
      <option value="/moreinfo">Security Gateway (/moreinfo)</option>
    `;
  }
  modal.hidden = false;
  loadPreviewIframe();
}

function closeSitePreviewModal() {
  const modal = $('site-preview-modal');
  if (modal) modal.hidden = true;
}

/**
 * Interactive No-Code Visual Block Builder Modal (#visual-block-modal)
 */
function syncVisualBlockModalFields() {
  const type = $('vb-type')?.value || 'callout';
  const lbl1 = $('vb-label-title-1');
  const txt1 = $('vb-label-text-1');
  const grp2 = $('vb-group-2');
  const grp2Txt = $('vb-group-2-text');
  const lbl2 = $('vb-label-title-2');
  const txt2 = $('vb-label-text-2');

  if (type === 'callout') {
    if (lbl1) lbl1.textContent = 'Callout Title / Badge';
    if (txt1) txt1.textContent = 'Callout Message Text';
    if ($('vb-title-1')) $('vb-title-1').value = 'Verified Security & Integrity Note';
    if ($('vb-text-1')) $('vb-text-1').value = 'Every release is cryptographically signed with SHA-256 and verified clean across 72 security engines.';
    if (grp2) grp2.style.display = 'none';
    if (grp2Txt) grp2Txt.style.display = 'none';
  } else if (type === 'grid') {
    if (lbl1) lbl1.textContent = 'Left Feature Card Title';
    if (txt1) txt1.textContent = 'Left Feature Card Description';
    if (lbl2) lbl2.textContent = 'Right Feature Card Title';
    if (txt2) txt2.textContent = 'Right Feature Card Description';
    if ($('vb-title-1')) $('vb-title-1').value = 'Sub-Second Edge Speed';
    if ($('vb-text-1')) $('vb-text-1').value = 'Pre-compiled static pages load in under 50ms globally with zero runtime database overhead.';
    if ($('vb-title-2')) $('vb-title-2').value = 'Verified SHA-256 Signature';
    if ($('vb-text-2')) $('vb-text-2').value = 'Hardware-backed signature verification guarantees 100% package authenticity.';
    if (grp2) grp2.style.display = 'grid';
    if (grp2Txt) grp2Txt.style.display = 'grid';
  } else if (type === 'steps') {
    if (lbl1) lbl1.textContent = 'Step 1 Heading';
    if (txt1) txt1.textContent = 'Step 1 Instructions';
    if (lbl2) lbl2.textContent = 'Step 2 Heading';
    if (txt2) txt2.textContent = 'Step 2 Instructions';
    if ($('vb-title-1')) $('vb-title-1').value = 'Step 1: Download & Verify Checksum';
    if ($('vb-text-1')) $('vb-text-1').value = 'Click the primary download button and verify the SHA-256 signature in the specifications table.';
    if ($('vb-title-2')) $('vb-title-2').value = 'Step 2: Launch & Configure';
    if ($('vb-text-2')) $('vb-text-2').value = 'Open the signed installer package; your existing workspace settings are preserved automatically.';
    if (grp2) grp2.style.display = 'grid';
    if (grp2Txt) grp2Txt.style.display = 'grid';
  } else if (type === 'checklist') {
    if (lbl1) lbl1.textContent = 'Checklist Item 1 Title';
    if (txt1) txt1.textContent = 'Checklist Item 1 Summary';
    if (lbl2) lbl2.textContent = 'Checklist Item 2 Title';
    if (txt2) txt2.textContent = 'Checklist Item 2 Summary';
    if ($('vb-title-1')) $('vb-title-1').value = 'Official Signed Package';
    if ($('vb-text-1')) $('vb-text-1').value = 'Cryptographically verified SHA-256 checksum matches official release manifest.';
    if ($('vb-title-2')) $('vb-title-2').value = 'Zero Bloatware or Adware';
    if ($('vb-text-2')) $('vb-text-2').value = 'Independently scanned clean across 72 security engines with zero background trackers.';
    if (grp2) grp2.style.display = 'grid';
    if (grp2Txt) grp2Txt.style.display = 'grid';
  } else if (type === 'table') {
    if (lbl1) lbl1.textContent = 'Row 1 Parameter Name (Left Column)';
    if (txt1) txt1.textContent = 'Row 1 Specification Value (Right Column)';
    if (lbl2) lbl2.textContent = 'Row 2 Parameter Name (Left Column)';
    if (txt2) txt2.textContent = 'Row 2 Specification Value (Right Column)';
    if ($('vb-title-1')) $('vb-title-1').value = 'Target Architecture';
    if ($('vb-text-1')) $('vb-text-1').value = 'Universal ARM64-v8a + x86_64';
    if ($('vb-title-2')) $('vb-title-2').value = 'Minimum OS Version';
    if ($('vb-text-2')) $('vb-text-2').value = 'Android 9.0+ / iOS 15.0+';
    if (grp2) grp2.style.display = 'grid';
    if (grp2Txt) grp2Txt.style.display = 'grid';
  } else if (type === 'cta') {
    if (lbl1) lbl1.textContent = 'Action Button Label';
    if (txt1) txt1.textContent = 'Target URL or Section Anchor (e.g., /#technical-specifications)';
    if ($('vb-title-1')) $('vb-title-1').value = 'Download Official Signed Build';
    if ($('vb-text-1')) $('vb-text-1').value = '/#technical-specifications';
    if (grp2) grp2.style.display = 'none';
    if (grp2Txt) grp2Txt.style.display = 'none';
  } else if (type === 'accordion') {
    if (lbl1) lbl1.textContent = 'Expandable Question / Summary Heading';
    if (txt1) txt1.textContent = 'Hidden Answer / Detailed Explanation';
    if ($('vb-title-1')) $('vb-title-1').value = 'How do I verify the SHA-256 package checksum?';
    if ($('vb-text-1')) $('vb-text-1').value = 'Run shasum -a 256 on the downloaded file and compare the output against our published hash.';
    if (grp2) grp2.style.display = 'none';
    if (grp2Txt) grp2Txt.style.display = 'none';
  }
}

function openVisualBlockModal(targetDescriptor) {
  activeVisualBlockTarget = targetDescriptor;
  const modal = $('visual-block-modal');
  if (!modal) return;
  syncVisualBlockModalFields();
  modal.hidden = false;
}

function closeVisualBlockModal() {
  const modal = $('visual-block-modal');
  if (modal) modal.hidden = true;
  activeVisualBlockTarget = null;
}

function confirmInsertVisualBlockFromModal() {
  const type = $('vb-type')?.value || 'callout';
  const t1 = escapeHtml(($('vb-title-1')?.value || '').trim());
  const d1 = escapeHtml(($('vb-text-1')?.value || '').trim());
  const t2 = escapeHtml(($('vb-title-2')?.value || '').trim());
  const d2 = escapeHtml(($('vb-text-2')?.value || '').trim());

  let generatedHtml = '';
  if (type === 'callout') {
    generatedHtml = `\n<div class="cms-callout-box">\n  <strong>${t1 || 'Important Note'}:</strong> ${d1}\n</div>`;
  } else if (type === 'grid') {
    generatedHtml = `\n<div class="cms-feature-grid">\n  <div class="cms-feature-item">\n    <strong>${t1}</strong>\n    <p style="margin:6px 0 0 0;">${d1}</p>\n  </div>\n  <div class="cms-feature-item">\n    <strong>${t2}</strong>\n    <p style="margin:6px 0 0 0;">${d2}</p>\n  </div>\n</div>`;
  } else if (type === 'steps') {
    generatedHtml = `\n<ol>\n  <li><strong>${t1}:</strong> ${d1}</li>\n  <li><strong>${t2}:</strong> ${d2}</li>\n</ol>`;
  } else if (type === 'checklist') {
    generatedHtml = `\n<ul>\n  <li><strong>${t1}:</strong> ${d1}</li>\n  <li><strong>${t2}:</strong> ${d2}</li>\n</ul>`;
  } else if (type === 'table') {
    generatedHtml = `\n<table>\n  <tbody>\n    <tr><th>${t1}</th><td>${d1}</td></tr>\n    <tr><th>${t2}</th><td>${d2}</td></tr>\n  </tbody>\n</table>`;
  } else if (type === 'cta') {
    generatedHtml = `\n<div style="margin:18px 0;">\n  <a href="${d1 || '/#technical-specifications'}" data-spa-link class="section-inline-cta">${t1 || 'Download Now'}</a>\n</div>`;
  } else if (type === 'accordion') {
    generatedHtml = `\n<details class="cms-accordion">\n  <summary>${t1}</summary>\n  <p style="margin-top:8px;">${d1}</p>\n</details>`;
  }

  insertHtmlIntoTarget(activeVisualBlockTarget, generatedHtml);
  closeVisualBlockModal();
  showToast('Visual block inserted into editor!', 'success');
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. AUTHENTICATION FLOW & DYNAMIC WORKSPACE MOUNTING
   ═══════════════════════════════════════════════════════════════════════════ */
let authCooldownTimer = null;

function clearAuthValidation() {
  ['login-email', 'login-password', 'login-apikey'].forEach((id) => {
    const el = $(id);
    if (el) el.removeAttribute('aria-invalid');
  });
}

function setAuthError(message = '') {
  const errBox = $('auth-error');
  if (!errBox) return;
  if (!message) {
    errBox.textContent = '';
    errBox.classList.remove('visible');
    return;
  }
  errBox.textContent = message;
  errBox.classList.add('visible');
}

function stopAuthCooldown() {
  if (authCooldownTimer) {
    clearInterval(authCooldownTimer);
    authCooldownTimer = null;
  }
}

function startAuthCooldown(seconds = 60) {
  stopAuthCooldown();
  let remaining = Math.max(1, Math.min(3600, Math.ceil(Number(seconds) || 60)));
  const btn = $('btn-login-submit');
  const updateUi = () => {
    setAuthError(`Too many sign-in attempts. Please wait ${remaining}s before trying again.`);
    if (btn) {
      btn.disabled = true;
      btn.textContent = `Locked (${remaining}s)`;
    }
  };
  updateUi();
  authCooldownTimer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      stopAuthCooldown();
      setAuthError('');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Sign In to Workspace';
      }
      return;
    }
    updateUi();
  }, 1000);
}

function resetPasswordInputMasks() {
  const passInp = $('login-password');
  const passBtn = $('btn-toggle-login-pass');
  if (passInp) passInp.type = 'password';
  if (passBtn) {
    passBtn.textContent = 'Show';
    passBtn.setAttribute('aria-pressed', 'false');
  }
  const keyInp = $('login-apikey');
  const keyBtn = $('btn-toggle-login-apikey');
  if (keyInp) keyInp.type = 'password';
  if (keyBtn) {
    keyBtn.textContent = 'Show';
    keyBtn.setAttribute('aria-pressed', 'false');
  }
}

function lockAdminStudio(reasonMessage = '') {
  if (typeof closeAdminNavDrawer === 'function') {
    closeAdminNavDrawer();
  }
  currentConfig = mergeSiteConfig({}, EMPTY_ADMIN_CONFIG);
  dirtyModules.clear();
  editorUndoHistory.clear();
  isDirty = false;
  pendingClearGithubToken = false;
  pendingClearTurnstileSecret = false;

  if ($('login-email')) $('login-email').value = '';
  if ($('login-password')) $('login-password').value = '';
  if ($('login-apikey')) $('login-apikey').value = '';
  clearAuthValidation();
  resetPasswordInputMasks();

  const shell = $('cms-shell');
  if (shell) {
    shell.innerHTML = '';
    shell.hidden = true;
  }

  const overlay = $('auth-overlay');
  if (overlay) {
    overlay.removeAttribute('data-checking');
    overlay.hidden = false;
  }

  setAuthError(reasonMessage);
  $('login-email')?.focus();
}

function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll('.auth-tab[data-auth-mode]').forEach((btn) => {
    const isMatch = btn.getAttribute('data-auth-mode') === mode;
    btn.classList.toggle('active', isMatch);
    btn.setAttribute('aria-selected', isMatch ? 'true' : 'false');
  });
  const groupCreds = $('auth-credentials-group') || $('auth-credentials-fields');
  const groupKey = $('auth-apikey-group') || $('auth-apikey-fields');

  clearAuthValidation();
  if (!authCooldownTimer) {
    setAuthError('');
  }

  if (mode === 'apikey') {
    if (groupCreds) groupCreds.hidden = true;
    if (groupKey) groupKey.hidden = false;
  } else {
    if (groupCreds) groupCreds.hidden = false;
    if (groupKey) groupKey.hidden = true;
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  if (authCooldownTimer) return;

  const btn = $('btn-login-submit');
  const emailEl = $('login-email');
  const passEl = $('login-password');
  const keyEl = $('login-apikey');

  clearAuthValidation();
  setAuthError('');

  const email = authMode === 'credentials' ? (emailEl?.value.trim() || '') : '';
  const password = authMode === 'credentials' ? (passEl?.value || '') : '';
  const apiKey = authMode === 'apikey' ? (keyEl?.value.trim() || '') : '';

  if (authMode === 'apikey' && !apiKey) {
    keyEl?.setAttribute('aria-invalid', 'true');
    setAuthError('Please enter your administrator access key.');
    keyEl?.focus();
    return;
  }
  if (authMode === 'credentials') {
    if (!email || !password) {
      if (!email) emailEl?.setAttribute('aria-invalid', 'true');
      if (!password) passEl?.setAttribute('aria-invalid', 'true');
      setAuthError('Please enter both administrator email and password.');
      (!email ? emailEl : passEl)?.focus();
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      emailEl?.setAttribute('aria-invalid', 'true');
      setAuthError('Please enter a valid administrator email address.');
      emailEl?.focus();
      return;
    }
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Verifying...';
  }
  [emailEl, passEl, keyEl].forEach((el) => {
    if (el) el.disabled = true;
  });

  let rateLimited = false;
  try {
    const result = await loginAdminUser(email, password, apiKey);
    if (!result.success) {
      if (result.status === 429 && result.retryAfterSec > 0) {
        rateLimited = true;
        startAuthCooldown(result.retryAfterSec);
        return;
      }
      if (authMode === 'credentials') {
        passEl?.setAttribute('aria-invalid', 'true');
      } else {
        keyEl?.setAttribute('aria-invalid', 'true');
      }
      setAuthError(result.error || 'Invalid administrator credentials.');
      return;
    }

    stopAuthCooldown();
    if (passEl) passEl.value = '';
    if (keyEl) keyEl.value = '';
    resetPasswordInputMasks();
    await unlockAdminStudio();
    showToast('Signed in to Admin Studio', 'success');
  } catch (err) {
    setAuthError(err?.message || 'Authentication failed.');
  } finally {
    [emailEl, passEl, keyEl].forEach((el) => {
      if (el) el.disabled = false;
    });
    if (btn && !rateLimited) {
      btn.disabled = false;
      btn.textContent = 'Sign In to Workspace';
    }
  }
}

async function mountAuthenticatedWorkspaceDom() {
  const shell = $('cms-shell');
  if (!shell) return false;
  if (shell.children.length > 0) return true;

  try {
    const res = await fetch('/api/admin/workspace', {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'X-Admin-CSRF': '1'
      }
    });
    if (res.status === 401) {
      notifyAdminUnauthorized('Session expired or unauthorized. Please sign in again.');
      return false;
    }
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    if (!data?.success || typeof data.html !== 'string') return false;
    shell.innerHTML = data.html;
    bindWorkspaceDomEvents();
    return true;
  } catch {
    return false;
  }
}

async function unlockAdminStudio() {
  const mounted = await mountAuthenticatedWorkspaceDom();
  const overlay = $('auth-overlay');
  if (!mounted) {
    if (overlay) {
      overlay.removeAttribute('data-checking');
      overlay.hidden = false;
    }
    setAuthError('Session expired or unauthorized. Please sign in again.');
    return;
  }

  const shell = $('cms-shell');
  if (overlay) {
    overlay.removeAttribute('data-checking');
    overlay.hidden = true;
  }
  if (shell) shell.hidden = false;

  try {
    const remote = await getSiteConfigRemote();
    if (remote) {
      currentConfig = mergeSiteConfig(remote, EMPTY_ADMIN_CONFIG);
    }
  } catch {
    currentConfig = mergeSiteConfig(getCachedSiteConfigSync(), EMPTY_ADMIN_CONFIG);
  }

  pendingClearGithubToken = false;
  pendingClearTurnstileSecret = false;
  populateAllFields();
  resetNewsComposer();
  markClean('Connected to live Firebase Admin workspace');
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. WORKSPACE TAB SWITCHING (DESKTOP SIDEBAR + MOBILE HAMBURGER DRAWER)
   ═══════════════════════════════════════════════════════════════════════════ */
const WORKSPACE_CONTEXT_MAP = {
  overview: {
    label: 'Overview & Quick Setup',
    target: 'Public Site Summary & SEO Readiness Audit'
  },
  brand: {
    label: 'Brand, Logos & Colors',
    target: 'Header Brand, Icons, Fonts & Website Color Theme'
  },
  hero: {
    label: 'Hero & Download Buttons',
    target: 'Homepage Top Screen, 16:9 Showcase Banner & CTAs'
  },
  specs: {
    label: 'Package Info Table',
    target: 'Homepage #technical-specifications & SHA-256 Checksum'
  },
  sections: {
    label: 'Page Sections',
    target: 'Homepage Editorial Sections & Vertical Layout Order'
  },
  news: {
    label: 'Daily News',
    target: 'Homepage Feed, /news Archive & /news/:slug Articles'
  },
  faqs: {
    label: 'FAQs Manager',
    target: 'Homepage Q&A Accordions & Google FAQPage Schema'
  },
  pages: {
    label: 'Menu & Legal Pages',
    target: '3-Bar Navigation Drawer, Footer & Standalone Pages'
  },
  security: {
    label: 'MoreInfo Security Gate',
    target: '/moreinfo AES-256-GCM Download Protection & Turnstile'
  },
  links: {
    label: 'Internal Linking System',
    target: 'Automatic Keyword Cross-Linking Across Pages & Articles'
  },
  domain: {
    label: 'Domain & SEO Settings',
    target: 'Canonical Domain, Search Preview, Sitemap & Schema'
  },
  deploy: {
    label: 'Firebase, GitHub & Logs',
    target: 'Live Cloud Firestore, GitHub Static Push & Sync History'
  }
};

function closeAdminNavDrawer() {
  const btn = $('admin-hamburger-btn');
  const drawer = $('admin-nav-drawer');
  const backdrop = $('admin-nav-backdrop');
  btn?.classList.remove('is-open');
  btn?.setAttribute('aria-expanded', 'false');
  drawer?.classList.remove('is-open');
  backdrop?.classList.remove('is-open');
}

function toggleAdminNavDrawer() {
  const btn = $('admin-hamburger-btn');
  const drawer = $('admin-nav-drawer');
  const backdrop = $('admin-nav-backdrop');
  if (!drawer) return;
  const willOpen = !drawer.classList.contains('is-open');
  btn?.classList.toggle('is-open', willOpen);
  btn?.setAttribute('aria-expanded', String(willOpen));
  drawer.classList.toggle('is-open', willOpen);
  backdrop?.classList.toggle('is-open', willOpen);
}

function filterPagesSubcards(subKey) {
  document.querySelectorAll('[data-pages-subtab]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-pages-subtab') === subKey);
  });
  document.querySelectorAll('[data-pages-card]').forEach((card) => {
    const key = card.getAttribute('data-pages-card');
    card.style.display = subKey === 'all' || key === subKey ? 'block' : 'none';
  });
  const subLabels = {
    all: '3-Bar Navigation Drawer, Footer & Standalone Pages',
    legal: 'Standalone Legal & Info Pages (/privacy-policy, /terms, etc.)',
    menu: 'Sticky Header Bar & 3-Bar Slide-Down Menu',
    footer: 'Global Website Footer, Disclaimer & Quick Links'
  };
  if ($('editing-now-target') && subLabels[subKey]) {
    $('editing-now-target').textContent = subLabels[subKey];
  }
}

function switchTab(rawTabId, anchorKey = '') {
  let tabId = rawTabId;
  let resolvedAnchor = anchorKey;

  if (tabId === 'domain' && anchorKey === 'security') {
    tabId = 'security';
    resolvedAnchor = '';
  } else if (tabId === 'domain' && anchorKey === 'internallinks') {
    tabId = 'links';
    resolvedAnchor = '';
  } else if (tabId === 'domain' && (anchorKey === 'github' || anchorKey === 'firebase')) {
    tabId = 'deploy';
    resolvedAnchor = '';
  } else if (tabId === 'brand' && (anchorKey === 'hero' || anchorKey === 'ctas')) {
    tabId = 'hero';
    resolvedAnchor = '';
  } else if (tabId === 'brand' && anchorKey === 'drawer') {
    tabId = 'pages';
    resolvedAnchor = 'menu';
  }

  activeTab = WORKSPACE_CONTEXT_MAP[tabId] ? tabId : 'overview';
  closeAdminNavDrawer();
  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === activeTab);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `panel-${activeTab}`);
  });

  if (activeTab === 'pages') {
    filterPagesSubcards(['legal', 'menu', 'footer'].includes(resolvedAnchor) ? resolvedAnchor : 'all');
  }

  const ctx = WORKSPACE_CONTEXT_MAP[activeTab] || WORKSPACE_CONTEXT_MAP.overview;
  if ($('editing-now-label')) {
    $('editing-now-label').textContent = ctx.label;
  }
  if ($('editing-now-target')) {
    $('editing-now-target').textContent = ctx.target;
  }
  const btnMod = $('btn-save-active-module');
  if (btnMod && !btnMod.disabled) {
    btnMod.textContent = 'Save Section';
  }

  if (resolvedAnchor) {
    const activePanel = $(`panel-${activeTab}`);
    const anchorCard = activePanel?.querySelector(`[data-section-anchor="${resolvedAnchor}"]`);
    if (anchorCard) {
      setTimeout(() => anchorCard.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
      return;
    }
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Expose globally for quick tests or console helpers
if (typeof window !== 'undefined') {
  window.switchAdminTab = (rawId) => {
    const cleaned = String(rawId || '').replace(/^tab-/, '').replace(/^panel-/, '');
    switchTab(cleaned);
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. POPULATE & BIND ALL ADMIN WORKSPACES
   ═══════════════════════════════════════════════════════════════════════════ */
function populateAllFields() {
  const c = currentConfig;
  const ui = c.uiConfig || EMPTY_ADMIN_CONFIG.uiConfig;

  // Topbar Brand & Live Firebase Storage Status
  const topbarLogo = $('topbar-logo');
  if (topbarLogo) {
    const logoUrl = String(c.brand?.logoUrl || '').trim();
    if (logoUrl) {
      topbarLogo.src = logoUrl;
      topbarLogo.removeAttribute('hidden');
      topbarLogo.style.display = 'block';
    } else {
      topbarLogo.removeAttribute('src');
      topbarLogo.setAttribute('hidden', '');
      topbarLogo.style.display = 'none';
    }
  }
  if ($('topbar-brand-title')) $('topbar-brand-title').textContent = `${c.brand.name || 'Workspace'} — Master CMS Studio`;

  const fbConfig = getActiveFirebaseConfig();
  const fbActive = isRealFirebaseConfig(fbConfig);
  if ($('storage-status-text')) {
    $('storage-status-text').textContent = fbActive
      ? `Live Firebase (${fbConfig.projectId}) + Static Compiler Ready`
      : 'Live Admin Store + Static Compiler Ready';
  }
  if ($('fb-env-badge')) {
    const srcLabel =
      fbConfig?.source === 'admin-override' || fbConfig?.source === 'localStorage'
        ? 'Runtime Keys'
        : fbConfig?.source === 'server-env' || fbConfig?.source === 'vite-env' || fbConfig?.source === 'env'
        ? '.env / Server Secret'
        : 'Local';
    $('fb-env-badge').textContent = fbActive
      ? `✓ Live Firebase Connected (${fbConfig.projectId} · ${srcLabel})`
      : 'Local Live Store Active (Add Firebase Keys Below or in .env)';
  }

  // Quick 1-Tap Master Clone Fields in Overview
  setVal('qc-brand-name', c.brand.name);
  setVal('qc-version', c.packageSpecs?.version || '');
  setVal('qc-domain', c.domainConfig?.primaryDomain || c.seo.canonicalUrl);
  setVal('qc-email', c.brand.contactEmail);
  setVal('qc-download-url', c.securityGate?.primaryDownloadUrl || '');
  setVal('qc-accent-color', c.brand.accentColor || '#EF4444');

  // Workspace 3: Brand, Search Logo, Hero, CTAs, Hamburger Drawer & Full UI Customizer
  setVal('brand-name', c.brand.name);
  setVal('brand-short-name', c.brand.shortName || c.brand.name);
  setVal('brand-tagline', c.brand.tagline || '');
  setVal('brand-email', c.brand.contactEmail);
  setVal('brand-logo', c.brand.logoUrl);
  setVal('brand-favicon', c.brand.faviconUrl);
  setVal('brand-search-logo', c.brand.searchLogoUrl || '');
  setVal('brand-apple-icon', c.brand.appleTouchIconUrl || '');
  refreshBrandThumbs();
  setVal('brand-color', c.brand.accentColor);
  setVal('brand-theme-color', c.brand.themeColor || c.brand.accentColor);

  setChecked('ui-show-hero-section', ui.showHeroSection !== false);
  setVal('hero-h1', c.hero.h1);
  setVal('hero-meta-title', c.hero.metaTitle);
  setVal('hero-meta-desc', c.hero.metaDescription);
  setVal('hero-intro-html', c.hero.introHtml);
  setChecked('hero-show-banner', c.hero.showBanner !== false);
  setVal('hero-banner-url', c.hero.bannerImageUrl);
  setImagePreview($('hero-banner-preview'), c.hero.bannerImageUrl || '');
  setVal('hero-banner-alt', c.hero.bannerAlt);
  setVal('hero-banner-caption', c.hero.bannerCaption || '');

  setChecked('ui-show-hero-ctas', ui.showHeroCtaButtons !== false);
  setVal('cta-left-text', c.hero.secondaryCta.label);
  setVal('cta-left-url', c.hero.secondaryCta.url);
  setChecked('cta-left-sponsored', Boolean(c.hero.secondaryCta.relSponsored));
  setVal('cta-right-text', c.hero.primaryCta.label);
  setVal('cta-right-url', c.hero.primaryCta.url);
  setChecked('cta-right-sponsored', Boolean(c.hero.primaryCta.relSponsored));
  setChecked('floating-cta-enabled', c.hero.floatingCta.enabled !== false);
  setVal('floating-cta-text', c.hero.floatingCta.label);
  setVal('floating-cta-url', c.hero.floatingCta.url);

  // Full UI Customizer & Hamburger Drawer Fields
  setVal('ui-max-width', ui.maxContainerWidth || '768px');
  setVal('ui-font-family', ui.fontFamily || 'system');
  setVal('ui-font-size', ui.baseFontSize || '16px');
  setVal('ui-bg-page', ui.pageBackgroundColor || '#F8FAFC');
  setVal('ui-bg-surface', ui.surfaceBackgroundColor || '#FFFFFF');
  setVal('ui-header-bg', ui.headerBackgroundColor || '#FFFFFF');
  setVal('ui-header-text', ui.headerTextColor || '#111827');
  setVal('ui-footer-bg', ui.footerBackgroundColor || '#0F172A');
  setVal('ui-footer-text', ui.footerTextColor || '#F8FAFC');
  setVal('ui-border-color', ui.borderColor || '#E2E8F0');
  setVal('ui-card-radius', ui.cardBorderRadius || '12px');
  setVal('ui-btn-text-color', ui.buttonTextColor || '#FFFFFF');
  setVal('ui-text-color', ui.textColor || '#1F2937');
  setVal('ui-heading-color', ui.headingColor || '#111827');
  setVal('ui-header-news-label', ui.headerNewsButtonLabel || 'News');
  setVal('ui-home-news-limit', ui.homepageNewsLimit || 5);
  setVal('ui-news-readmore', ui.newsReadMoreLabel || 'Read Full News Article →');
  setVal('ui-news-viewall', ui.newsViewAllLabel || 'View All Daily News →');
  setVal('ui-back-home-label', ui.backToHomeLabel || '← Back to Main Page');
  setVal('ui-all-news-label', ui.allNewsBreadcrumbLabel || 'All Daily News →');
  setChecked('ui-show-header-news', ui.showHeaderNewsButton !== false);
  setChecked('ui-show-news-count', ui.showNewsCountInHeader !== false);
  setChecked('ui-drawer-auto-sections', ui.autoIncludeSectionsInDrawer !== false);
  setChecked('ui-drawer-show-news', ui.showNewsInDrawer !== false);
  setChecked('ui-drawer-show-legal', ui.showLegalLinksInDrawer !== false);
  setChecked('ui-drawer-show-cta', ui.showCtaInDrawer !== false);
  setChecked('ui-sticky-header', ui.stickyHeader !== false);
  setChecked('ui-show-breadcrumbs', ui.showBreadcrumbs !== false);
  setChecked('ui-show-subpage-pills', ui.showSubpageSwitcherPills !== false);
  setChecked('ui-show-toc-bar', ui.showTocJumpBar !== false);
  setChecked('ui-enable-faq-accordion', ui.enableFaqAccordion !== false);
  setChecked('ui-show-footer-disclaimer', ui.showFooterDisclaimer !== false);
  setChecked('ui-show-footer-links-heading', ui.showFooterLinksHeading !== false);

  syncColorPickersFromTextInputs();
  renderHomepageOrderController();

  // Workspace 4: Technical Package Specifications Table
  const specs = c.packageSpecs || EMPTY_ADMIN_CONFIG.packageSpecs;
  setChecked('specs-enabled', specs.enabled !== false);
  setVal('specs-heading', specs.heading);
  setVal('specs-app-name', specs.appName);
  setVal('specs-version', specs.version);
  setVal('specs-size', specs.fileSize);
  setVal('specs-os', specs.operatingSystem);
  setVal('specs-format', specs.packageFormat);
  setVal('specs-license', specs.license);
  setVal('specs-security', specs.securityStatus);
  setVal('specs-updated', specs.lastUpdated);
  setVal('specs-sha256', specs.sha256);
  setVal('specs-meta-title', specs.metaTitle);
  setVal('specs-meta-desc', specs.metaDescription);
  renderCustomSpecsRows();

  // Workspace 2: Daily News Section Settings
  setChecked('news-enabled', c.newsSection.enabled !== false);
  setVal('news-heading', c.newsSection.heading);
  setVal('news-meta-title', c.newsSection.metaTitle);
  setVal('news-meta-desc', c.newsSection.metaDescription);

  // Workspace 5: Global Raw HTML
  setVal('global-raw-html', c.content?.rawHtml || '');

  // Workspace 6: FAQs Section Settings
  setChecked('faqs-enabled', c.faqsSection.enabled !== false);
  setVal('faqs-heading', c.faqsSection.heading);
  setVal('faqs-meta-title', c.faqsSection.metaTitle);
  setVal('faqs-meta-desc', c.faqsSection.metaDescription);

  // Workspace 7: Footer Settings
  setChecked('nav-show-footer-summary', c.navigation.showFooterBrandSummary !== false);
  setChecked('nav-show-footer-email', c.navigation.showFooterContactEmail !== false);
  setVal('nav-footer-summary', c.navigation.footerSummary || '');
  setVal('footer-disclaimer-heading', c.navigation.disclaimerHeading);
  setVal('footer-links-heading', c.navigation.siteLinksHeading);
  setVal('footer-meta-title', c.navigation.disclaimerMetaTitle);
  setVal('footer-meta-desc', c.navigation.disclaimerMetaDescription);
  setVal('footer-disclaimer-text', c.navigation.disclaimer);
  setVal('footer-copyright-text', c.navigation.copyright);

  // Workspace 8: GitHub Static Website Publisher, Domain, Global SEO & Firebase (Secrets masked cleanly!)
  const gh = c.githubConfig || EMPTY_ADMIN_CONFIG.githubConfig;
  setVal('gh-token', '');
  const ghTokConfigured = Boolean(gh.hasFineGrainedToken || getLastEnvDiagnostics()?.githubTokenConfigured);
  if ($('gh-token')) {
    $('gh-token').placeholder = ghTokConfigured
      ? 'Token configured on server (Leave blank to keep stored token)'
      : 'github_pat_11ABCDEFG... (Needs Contents: Read and write permission)';
  }
  if ($('gh-token-status-tag')) {
    $('gh-token-status-tag').textContent = ghTokConfigured ? '✓ Token Stored Server-Side' : 'Not Configured';
    $('gh-token-status-tag').style.background = ghTokConfigured ? '#ecfdf5' : '#f1f5f9';
    $('gh-token-status-tag').style.color = ghTokConfigured ? '#065f46' : '#64748b';
  }
  if ($('btn-clear-gh-token')) {
    $('btn-clear-gh-token').style.display = gh.hasFineGrainedToken ? 'inline-flex' : 'none';
  }
  setVal('gh-owner', gh.repoOwner || '');
  setVal('gh-repo', gh.repoName || '');
  setVal('gh-branch', gh.branch || 'main');
  setVal('gh-dir', gh.targetDirectory ?? 'dist-public');
  setVal(
    'gh-commit-msg',
    gh.commitMessageTemplate || 'chore(static-publish): sync compiled static public site from Admin Studio'
  );
  setChecked('gh-auto-push', Boolean(gh.autoPushOnPublish));
  renderGitHubDeployHistory();

  const dom = c.domainConfig || EMPTY_ADMIN_CONFIG.domainConfig;
  setVal('domain-primary', dom.primaryDomain || c.seo.canonicalUrl);
  setVal('domain-ga-id', dom.googleAnalyticsId);
  setVal('domain-gsc', dom.googleSiteVerification);
  setVal('domain-bing', dom.bingSiteVerification);
  setChecked('domain-image-sitemap', dom.enableImageSitemap !== false);
  setChecked('domain-enable-sitemap', dom.enableSitemapXml !== false);
  setChecked('domain-enable-rss', dom.enableRssFeed !== false);
  setChecked('domain-web-manifest', dom.enableWebManifest !== false);
  setChecked('domain-force-https', dom.forceHttps !== false);
  setChecked('domain-auto-internal-links', dom.enableAutoInternalLinks !== false);
  setVal('domain-robots-txt', dom.customRobotsTxt);

  setVal('seo-meta-title', c.seo.metaTitle);
  setVal('seo-meta-desc', c.seo.metaDescription);
  setVal('seo-canonical', c.seo.canonicalUrl);
  setVal('seo-og-image', c.seo.ogImageUrl);

  setChecked('schema-app-enabled', c.seo.enableSoftwareSchema !== false);
  setVal('schema-app-name', c.seo.softwareDetails.name);
  setVal('schema-app-os', c.seo.softwareDetails.operatingSystem);
  setVal('schema-app-category', c.seo.softwareDetails.applicationCategory);
  setVal('schema-app-price', c.seo.softwareDetails.price);
  setVal('schema-app-currency', c.seo.softwareDetails.priceCurrency || 'USD');
  setVal('schema-app-rating', c.seo.softwareDetails.ratingValue);
  setVal('schema-app-votes', c.seo.softwareDetails.reviewCount);
  setVal('seo-raw-jsonld', c.seo.rawJsonLd || '');
  updateJsonLdStatusIndicator(c.seo.rawJsonLd || '');

  const fbKeyInput = $('fb-api-key');
  if (fbKeyInput) {
    fbKeyInput.value = fbConfig?.apiKey || '';
    fbKeyInput.placeholder =
      fbConfig?.hasEnvApiKey && !fbConfig?.apiKey
        ? 'Configured via server environment variable (Protected)'
        : 'Configured via server env or paste API key...';
  }
  setVal('fb-project-id', fbConfig?.projectId || '');
  setVal('fb-auth-domain', fbConfig?.authDomain || '');
  setVal('fb-storage-bucket', fbConfig?.storageBucket || '');
  setVal('fb-messaging-sender-id', fbConfig?.messagingSenderId || '');
  setVal('fb-app-id', fbConfig?.appId || '');
  setVal('fb-database-id', fbConfig?.databaseId || '(default)');
  renderEnvSecurityDiagnostics();

  // v12 7-Gate Security Gateway & AES-256-GCM Link Vault Fields
  const sec = c.securityGate || EMPTY_ADMIN_CONFIG.securityGate;
  setChecked('sec-enabled', sec.enabled !== false);
  setChecked('sec-show-specs', Boolean(sec.showSpecsOnGateway));
  setVal('sec-device-policy', sec.devicePolicyMode || 'universal_human');
  setVal('sec-btn-label', sec.proceedButtonLabel || 'PROCEED');
  setVal('sec-custom-heading', sec.customHeading || '');
  setVal('sec-custom-note', sec.customNoteHtml || '');
  setVal('sec-app-slug', sec.appSlug || '');
  setVal('sec-serial-id', sec.appSerialId || '');
  setVal('sec-primary-url', sec.primaryDownloadUrl || '');
  setVal('sec-encrypted-url', sec.encryptedPrimaryUrl || '');
  setVal('sec-turnstile-site-key', sec.turnstileSiteKey || '');
  setVal('sec-turnstile-secret-key', '');
  const tsSecretConfigured = Boolean(sec.hasTurnstileSecretKey || getLastEnvDiagnostics()?.turnstileSecretKeyConfigured);
  if ($('sec-turnstile-secret-key')) {
    $('sec-turnstile-secret-key').placeholder = tsSecretConfigured
      ? 'Secret stored server-side (Leave blank to keep)'
      : '0x4AAAAAA... (Server-side siteverify secret)';
  }
  if ($('sec-ts-secret-status-tag')) {
    $('sec-ts-secret-status-tag').textContent = tsSecretConfigured ? '✓ Stored Server-Side' : 'Write-Only Secret';
    $('sec-ts-secret-status-tag').style.background = tsSecretConfigured ? '#ecfdf5' : '#f1f5f9';
    $('sec-ts-secret-status-tag').style.color = tsSecretConfigured ? '#065f46' : '#64748b';
  }
  if ($('btn-clear-ts-secret')) {
    $('btn-clear-ts-secret').style.display = sec.hasTurnstileSecretKey ? 'inline-flex' : 'none';
  }
  setChecked('sec-paused', Boolean(sec.isPaused));
  setChecked('sec-coming-soon', Boolean(sec.isComingSoon));
  setVal('sec-daily-cap', sec.dailyIssueCap ?? 0);
  setVal('sec-unavailable-msg', sec.unavailableMessage || '');
  setVal('sec-whatsapp', sec.helplineWhatsapp || '');
  setVal('sec-telegram', sec.helplineTelegram || '');
  updateVaultStatusIndicator();

  // Render Dynamic Lists & Overview Audit
  renderSectionsList();
  renderNewsList();
  renderFaqsList();
  renderPagesList();
  renderFooterQuickLinksList();
  renderInternalLinksList();
  renderMenuLinksList();
  syncUrlQuickPickers();
  updateSerpSimulator();
  refreshOverviewAndSeoAudit();
  renderDirtyModulesSummary();
  const btnMod = $('btn-save-active-module');
  if (btnMod && !btnMod.disabled) {
    btnMod.textContent = 'Save Section';
  }
}

function setVal(id, val) {
  const el = $(id);
  if (el) el.value = val ?? '';
}

function setChecked(id, bool) {
  const el = $(id);
  if (el) el.checked = Boolean(bool);
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. OVERVIEW, GITHUB DEPLOY HISTORY & AUTOMATED TECHNICAL SEO AUDIT
   ═══════════════════════════════════════════════════════════════════════════ */
function renderGitHubDeployHistory() {
  const gh = currentConfig.githubConfig || EMPTY_ADMIN_CONFIG.githubConfig;
  const listEl = $('gh-deploy-history-list');
  const badgeEl = $('gh-status-badge');
  const tagEl = $('gh-last-commit-tag');

  if (badgeEl) {
    badgeEl.textContent =
      gh.repoOwner && gh.repoName
        ? `Target: ${gh.repoOwner}/${gh.repoName} (${gh.branch || 'main'})`
        : 'Local /dist-public Compiler Active';
  }
  if (tagEl) {
    if (gh.lastPublishedAt) {
      tagEl.textContent = `Last GitHub Push: ${new Date(gh.lastPublishedAt).toLocaleString()} (${
        gh.lastCommitSha ? gh.lastCommitSha.slice(0, 7) : 'ok'
      })`;
    } else {
      tagEl.textContent = 'No GitHub push yet';
    }
  }

  renderDirtyModulesSummary();

  if (!listEl) return;
  const syncLogs = Array.isArray(currentConfig.syncLogs) ? currentConfig.syncLogs : [];
  const legacyHistory = Array.isArray(gh.deployHistory) ? gh.deployHistory : [];
  const rows = syncLogs.length > 0 ? syncLogs : legacyHistory;

  if (rows.length === 0) {
    listEl.innerHTML = `
      <div class="audit-row">
        <div>
          <strong style="font-size:0.84rem;">No Sync or GitHub Commits Recorded Yet</strong>
          <div style="font-size:0.75rem; color:var(--text-muted);">
            Save modules to Firebase or click <strong>Compile &amp; Push Static Website to GitHub Now</strong> above to log every change and push.
          </div>
        </div>
        <span class="audit-badge-muted">No Logs</span>
      </div>
    `;
    return;
  }

  listEl.innerHTML = rows
    .slice(0, 12)
    .map((item) => {
      const mods = Array.isArray(item.modulesChanged) && item.modulesChanged.length > 0
        ? item.modulesChanged.map((m) => `<span class="sync-module-chip clean">${escapeHtml(m)}</span>`).join(' ')
        : '';
      const pathsLine = Array.isArray(item.changedPaths) && item.changedPaths.length > 0
        ? `Files: ${item.changedPaths.slice(0, 6).map((p) => `/${p}`).join(', ')}${item.changedPaths.length > 6 ? ` (+${item.changedPaths.length - 6} more)` : ''}`
        : '';
      const hasDiffCounts =
        typeof item.addedCount === 'number' ||
        typeof item.updatedCount === 'number' ||
        typeof item.deletedCount === 'number' ||
        typeof item.unchangedCount === 'number';
      const diffHtml = hasDiffCounts
        ? `<div class="diff-chip-row">
            ${item.addedCount ? `<span class="diff-chip-add">+${item.addedCount} added</span>` : ''}
            ${item.updatedCount ? `<span class="diff-chip-upd">~${item.updatedCount} updated</span>` : ''}
            ${item.deletedCount ? `<span class="diff-chip-del">-${item.deletedCount} deleted</span>` : ''}
            ${item.unchangedCount ? `<span class="diff-chip-skip">=${item.unchangedCount} unchanged</span>` : ''}
          </div>`
        : '';
      const isFirebaseSave = item.trigger === 'firebase-save';
      const isSuccessStatus = item.status === 'success' || item.status === 'saved';
      const badgeStyle =
        isSuccessStatus
          ? ''
          : item.status === 'local-only'
          ? 'background:#fffbeb; color:#92400e;'
          : 'background:#fef2f2; color:#b91c1c;';
      const badgeLabel = isFirebaseSave
        ? isSuccessStatus
          ? '✓ Saved to Firebase'
          : '✓ Saved & Compiled'
        : isSuccessStatus
        ? item.skipped
          ? '≡ Up to Date'
          : '✓ Pushed to GitHub'
        : item.status === 'local-only'
        ? 'Local Compiled'
        : 'Failed';
      const stepsHtml =
        Array.isArray(item.steps) && item.steps.length > 0
          ? `<div class="sync-log-steps">${item.steps
              .map((s) => `<div class="sync-log-step-line">• ${escapeHtml(s)}</div>`)
              .join('')}</div>`
          : '';
      const errorHtml = item.errorDetail
        ? `<div style="font-size:0.74rem; color:#b91c1c; background:#fef2f2; padding:5px 8px; border-radius:5px; margin-top:4px;">${escapeHtml(
            item.errorDetail
          )}</div>`
        : '';

      return `
      <div class="sync-log-row">
        <div class="sync-log-top">
          <strong style="font-size:0.83rem;">${escapeHtml(item.message || 'Workspace Activity')}</strong>
          <span class="audit-badge-pass" style="${badgeStyle}">${badgeLabel}</span>
        </div>
        <div class="sync-log-meta">
          <span>${new Date(item.timestamp).toLocaleString()}</span>
          <span>• ${item.filesCount || 0} ${isFirebaseSave ? 'module(s)' : 'files'}</span>
          ${item.trigger ? `<span>• ${escapeHtml(item.trigger)}</span>` : ''}
          ${item.durationMs ? `<span>• ${item.durationMs}ms</span>` : ''}
          ${
            item.commitUrl && item.commitSha
              ? `• <a href="${escapeHtml(item.commitUrl)}" target="_blank" rel="noopener" style="color:var(--accent); font-weight:700;">Commit ${escapeHtml(
                  item.commitSha.slice(0, 7)
                )} ↗</a>`
              : ''
          }
        </div>
        ${diffHtml}
        ${mods ? `<div style="display:flex; gap:4px; flex-wrap:wrap; align-items:center;"><span style="font-size:0.7rem; color:var(--text-muted);">Modules:</span> ${mods}</div>` : ''}
        ${pathsLine ? `<div class="sync-log-paths">${escapeHtml(pathsLine)}</div>` : ''}
        ${stepsHtml}
        ${errorHtml}
      </div>
    `;
    })
    .join('');
}

function refreshOverviewAndSeoAudit() {
  const audit = auditSiteSeoHealth(currentConfig);
  const newsCount = (currentConfig.newsSection?.articles || []).length;
  const pagesCount = (currentConfig.pages || []).length;
  const sectionsCount = (currentConfig.sections || []).length;
  const faqsCount = (currentConfig.faqsSection?.items || []).length;
  const passedCount = audit.checks.filter((chk) => chk.passed).length;

  const emptyGuide = $('empty-db-workspace-guide');
  if (emptyGuide) {
    emptyGuide.hidden = !(
      sectionsCount === 0 &&
      newsCount === 0 &&
      faqsCount === 0 &&
      !(currentConfig.brand?.name || '').trim()
    );
  }

  if ($('stat-seo-score')) $('stat-seo-score').textContent = `${audit.score} / 100`;
  if ($('stat-seo-sub')) {
    $('stat-seo-sub').textContent = `${passedCount} of ${audit.checks.length} checks passed`;
    $('stat-seo-sub').className = `stat-sub ${audit.score >= 80 ? 'is-ok' : 'is-warn'}`;
  }

  if ($('stat-news-count')) $('stat-news-count').textContent = String(newsCount);
  if ($('stat-news-sub')) {
    if (currentConfig.newsSection?.enabled === false) {
      $('stat-news-sub').textContent = 'News feed disabled';
      $('stat-news-sub').className = 'stat-sub is-muted';
    } else if (newsCount > 0) {
      $('stat-news-sub').textContent = 'Active on /news & feed.xml';
      $('stat-news-sub').className = 'stat-sub is-ok';
    } else {
      $('stat-news-sub').textContent = 'No articles yet';
      $('stat-news-sub').className = 'stat-sub is-muted';
    }
  }

  if ($('stat-pages-count')) $('stat-pages-count').textContent = String(pagesCount);
  if ($('stat-pages-sub')) {
    if (pagesCount > 0) {
      $('stat-pages-sub').textContent = 'Linked in Footer & Sitemap';
      $('stat-pages-sub').className = 'stat-sub is-ok';
    } else {
      $('stat-pages-sub').textContent = 'No legal pages yet';
      $('stat-pages-sub').className = 'stat-sub is-muted';
    }
  }

  if ($('stat-sitemap-count')) $('stat-sitemap-count').textContent = String(audit.totalUrlsInSitemap);
  if ($('stat-sitemap-sub')) {
    if (currentConfig.domainConfig?.enableSitemapXml === false) {
      $('stat-sitemap-sub').textContent = 'Sitemap disabled';
      $('stat-sitemap-sub').className = 'stat-sub is-muted';
    } else if (audit.totalUrlsInSitemap > 0) {
      $('stat-sitemap-sub').textContent = 'Ready for search crawlers';
      $('stat-sitemap-sub').className = 'stat-sub is-ok';
    } else {
      $('stat-sitemap-sub').textContent = 'Not indexable yet';
      $('stat-sitemap-sub').className = 'stat-sub is-muted';
    }
  }

  if ($('seo-audit-summary-tag')) {
    $('seo-audit-summary-tag').textContent = `${passedCount} / ${audit.checks.length} passed`;
  }

  if ($('count-seo-score')) $('count-seo-score').textContent = `${audit.score}%`;
  if ($('drawer-count-seo')) $('drawer-count-seo').textContent = `${audit.score}%`;
  if ($('count-news')) $('count-news').textContent = String(newsCount);
  if ($('count-sections')) $('count-sections').textContent = String(sectionsCount);
  if ($('count-faqs')) $('count-faqs').textContent = String(faqsCount);
  if ($('count-pages')) $('count-pages').textContent = String(pagesCount);

  const checklistEl = $('seo-audit-checklist');
  if (checklistEl) {
    checklistEl.innerHTML = audit.checks
      .map(
        (chk) => `
        <div class="audit-row">
          <div style="min-width:0; flex:1 1 240px;">
            <strong style="font-size:0.84rem;">${escapeHtml(chk.label)}</strong>
            <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(chk.detail)}</div>
          </div>
          <div class="audit-row-actions">
            <span class="${chk.passed ? 'audit-badge-pass' : 'audit-badge-warn'}">${
              chk.passed ? 'Passed' : 'Incomplete'
            }</span>
            ${
              !chk.passed && chk.fixTab
                ? `<button type="button" class="btn btn-sm" data-jump-tab="${escapeHtml(chk.fixTab)}" data-jump-subtab="${escapeHtml(chk.fixSubtab || '')}">Configure &rarr;</button>`
                : ''
            }
          </div>
        </div>
      `
      )
      .join('');
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. HOMEPAGE SECTION ORDER CONTROLLER & CUSTOM SPEC ROWS
   ═══════════════════════════════════════════════════════════════════════════ */
const BLOCK_LABELS = {
  specs: 'Technical Package Specifications Table (#technical-specifications)',
  sections: 'Homepage Editorial Content Sections',
  rawHtml: 'Additional Custom HTML / Component Block',
  news: 'Daily News & Release Updates Feed (#latest-news)',
  faqs: 'Frequently Asked Questions Accordion (#frequently-asked-questions)'
};

function renderHomepageOrderController() {
  const container = $('homepage-order-list');
  if (!container) return;
  const order = currentConfig.uiConfig?.homepageSectionOrder || [
    'specs',
    'sections',
    'rawHtml',
    'news',
    'faqs'
  ];

  container.innerHTML = order
    .map(
      (key, idx) => `
      <div class="order-row">
        <div style="font-weight:700; font-size:0.84rem;">
          <span class="field-tag" style="margin-right:6px;">#${idx + 1}</span>
          ${escapeHtml(BLOCK_LABELS[key] || key)}
        </div>
        <div style="display:flex; gap:6px;">
          <button type="button" class="btn btn-sm" data-move-block="${idx}" data-dir="-1" ${
        idx === 0 ? 'disabled' : ''
      }>↑ Move Up</button>
          <button type="button" class="btn btn-sm" data-move-block="${idx}" data-dir="1" ${
        idx === order.length - 1 ? 'disabled' : ''
      }>↓ Move Down</button>
        </div>
      </div>
    `
    )
    .join('');
}

function renderCustomSpecsRows() {
  const container = $('custom-specs-list');
  if (!container) return;
  if (!Array.isArray(currentConfig.packageSpecs.customRows)) {
    currentConfig.packageSpecs.customRows = [];
  }
  const rows = currentConfig.packageSpecs.customRows;

  if (rows.length === 0) {
    container.innerHTML = `<div style="font-size:0.8rem; color:var(--text-muted); padding:8px 0;">No custom specification rows added yet. Click "+ Add Custom Spec Row" above to add extra rows to the table.</div>`;
    return;
  }

  container.innerHTML = rows
    .map(
      (row, idx) => `
      <div class="item-card open" style="padding:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:8px; flex-wrap:wrap;">
          <span class="item-badge">Custom Row #${idx + 1}</span>
          <div style="display:flex; gap:5px; flex-wrap:wrap;">
            <button type="button" class="btn btn-sm" data-action="move-up" data-collection="customSpecs" data-index="${idx}" ${idx === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="btn btn-sm" data-action="move-down" data-collection="customSpecs" data-index="${idx}" ${idx === rows.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" class="btn btn-sm" data-action="clone" data-collection="customSpecs" data-index="${idx}">Clone</button>
            <button type="button" class="btn btn-sm btn-danger" data-action="delete" data-collection="customSpecs" data-index="${idx}">Remove</button>
          </div>
        </div>
        <div class="form-grid cols-2" style="align-items:end;">
          <div class="field">
            <label class="field-label">Specification Label (Left Column)</label>
            <input type="text" class="input" value="${escapeHtml(
              row.label
            )}" data-collection="customSpecs" data-index="${idx}" data-key="label" placeholder="e.g., Architecture" />
          </div>
          <div class="field">
            <label class="field-label">Specification Value (Right Column)</label>
            <input type="text" class="input" value="${escapeHtml(
              row.value
            )}" data-collection="customSpecs" data-index="${idx}" data-key="value" placeholder="e.g., ARM64-v8a / Universal" />
          </div>
        </div>
      </div>
    `
    )
    .join('');
}

/* ═══════════════════════════════════════════════════════════════════════════
   6. DAILY NEWS COMPOSER (SINGLE-CLICK PUBLISH & EDIT)
   ═══════════════════════════════════════════════════════════════════════════ */
function resetNewsComposer() {
  const todayStr = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  setVal('composer-news-id', '');
  setVal('composer-news-title', '');
  setVal('composer-news-slug', '');
  setVal('composer-news-category', 'Daily Update');
  setVal('composer-news-date', todayStr);
  setVal('composer-news-author', `${currentConfig.brand?.name || 'Editorial'} Team`);
  setVal('composer-news-readtime', '2 min read');
  setChecked('composer-news-featured', false);
  setVal('composer-news-cover-url', '');
  setImagePreview($('composer-news-cover-preview'), '');
  setVal('composer-news-cover-alt', '');
  setVal('composer-news-cover-caption', '');
  setVal('composer-news-cta-label', '');
  setVal('composer-news-cta-url', '');
  setVal('composer-news-summary', '');
  setVal('composer-news-html', '');
  setVal('composer-news-meta-title', '');
  setVal('composer-news-meta-desc', '');
  if ($('news-composer-heading')) {
    $('news-composer-heading').textContent = 'Publish a New Daily News Article';
  }
  const preview = $('composer-live-preview');
  if (preview) {
    preview.innerHTML = '';
    preview.classList.remove('visible');
  }
}

function loadArticleIntoComposer(idx) {
  const art = currentConfig.newsSection?.articles?.[idx];
  if (!art) return;
  setVal('composer-news-id', art.id);
  setVal('composer-news-title', art.title);
  setVal('composer-news-slug', art.slug);
  setVal('composer-news-category', art.category || 'Daily Update');
  setVal('composer-news-date', art.date);
  setVal('composer-news-author', art.author || `${currentConfig.brand?.name || 'Editorial'} Team`);
  setVal('composer-news-readtime', art.readTime || '2 min read');
  setChecked('composer-news-featured', Boolean(art.featured));
  setVal('composer-news-cover-url', art.coverImageUrl || '');
  setImagePreview($('composer-news-cover-preview'), art.coverImageUrl || '');
  setVal('composer-news-cover-alt', art.coverImageAlt || '');
  setVal('composer-news-cover-caption', art.coverImageCaption || '');
  setVal('composer-news-cta-label', art.ctaLabel || '');
  setVal('composer-news-cta-url', art.ctaUrl || '');
  setVal('composer-news-summary', art.summary);
  setVal('composer-news-html', art.htmlContent);
  setVal('composer-news-meta-title', art.metaTitle);
  setVal('composer-news-meta-desc', art.metaDescription);
  if ($('news-composer-heading')) {
    $('news-composer-heading').textContent = `Editing News Article: ${art.title}`;
  }
  const preview = $('composer-live-preview');
  if (preview) {
    preview.innerHTML = art.htmlContent || '';
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
  showToast('Loaded news article into composer above');
}

async function handlePublishComposerNews() {
  collectScalarFields();
  const title = $('composer-news-title')?.value.trim() || '';
  if (!title) {
    showToast('Please enter a News Headline before publishing.', 'error');
    $('composer-news-title')?.focus();
    return;
  }

  const brandName = currentConfig.brand?.name || 'Website';
  const rawSlug = $('composer-news-slug')?.value.trim() || title;
  const slug = generateSlug(rawSlug) || `news-${Date.now()}`;
  const summary = $('composer-news-summary')?.value.trim() || `${title} — official daily update from ${brandName}.`;
  const htmlContent = $('composer-news-html')?.value.trim() || `<p>${escapeHtml(summary)}</p>`;
  const metaTitle = $('composer-news-meta-title')?.value.trim() || `${title} | ${brandName} News`;
  const metaDescription = $('composer-news-meta-desc')?.value.trim() || summary;

  const existingId = $('composer-news-id')?.value.trim();
  const articleObj = {
    id: existingId || `news-${Date.now()}`,
    title,
    slug,
    category: $('composer-news-category')?.value.trim() || 'Daily Update',
    date:
      $('composer-news-date')?.value.trim() ||
      new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    author: $('composer-news-author')?.value.trim() || `${brandName} Editorial Team`,
    readTime: $('composer-news-readtime')?.value.trim() || '2 min read',
    featured: Boolean($('composer-news-featured')?.checked),
    coverImageUrl: $('composer-news-cover-url')?.value.trim() || '',
    coverImageAlt: $('composer-news-cover-alt')?.value.trim() || title,
    coverImageCaption: $('composer-news-cover-caption')?.value.trim() || '',
    ctaLabel: $('composer-news-cta-label')?.value.trim() || '',
    ctaUrl: $('composer-news-cta-url')?.value.trim() || '',
    summary,
    htmlContent,
    metaTitle,
    metaDescription
  };

  if (!Array.isArray(currentConfig.newsSection.articles)) {
    currentConfig.newsSection.articles = [];
  }

  const existingIndex = currentConfig.newsSection.articles.findIndex(
    (a) => a.id === articleObj.id || a.slug === articleObj.slug
  );
  if (existingIndex >= 0) {
    currentConfig.newsSection.articles[existingIndex] = articleObj;
  } else {
    currentConfig.newsSection.articles.unshift(articleObj);
  }

  renderNewsList();
  refreshOverviewAndSeoAudit();
  dirtyModules.add('newsSection');
  const savedOk = await handleSaveActiveModule('newsSection');
  if (!savedOk) return;
  resetNewsComposer();
  showToast(`News published & saved cleanly to [newsSection] (/news/${slug})!`, 'success');
}

/* ═══════════════════════════════════════════════════════════════════════════
   7. DYNAMIC LIST RENDERERS (SECTIONS, NEWS, FAQs, LEGAL PAGES, MENU)
   ═══════════════════════════════════════════════════════════════════════════ */

function renderSectionsList() {
  const container = $('sections-list');
  if (!container) return;
  const sections = currentConfig.sections || [];
  const q = sectionSearchQuery.trim().toLowerCase();
  const filtered = sections
    .map((sec, idx) => ({ sec, idx }))
    .filter(
      ({ sec }) =>
        !q ||
        (sec.heading || '').toLowerCase().includes(q) ||
        (sec.slug || '').toLowerCase().includes(q) ||
        (sec.badgeText || '').toLowerCase().includes(q)
    );

  if (filtered.length === 0) {
    container.innerHTML = `<div style="font-size:0.82rem; color:var(--text-muted); padding:10px 0;">No sections match your filter. Click "+ Add Blank Section" or clear the search filter.</div>`;
    return;
  }

  const routeOptionsHtml = buildUrlPickerOptionsHtml('Quick Pick Route…');

  if (openSectionIndex >= sections.length) {
    openSectionIndex = Math.max(0, sections.length - 1);
  }

  container.innerHTML = filtered
    .map(({ sec, idx }) => {
      const isOpen = idx === openSectionIndex || Boolean(q);
      return `
      <div class="item-card ${isOpen ? 'open' : ''}" data-section-idx="${idx}" data-card-collection="sections" data-card-index="${idx}">
        <div class="item-card-header" data-toggle-card>
          <div class="item-card-title-wrap">
            <span class="item-badge">Section #${idx + 1} • #${escapeHtml(sec.slug || 'section')}</span>
            ${
              sec.visible === false
                ? `<span class="item-badge" style="background:#fee2e2; color:#b91c1c;">Hidden</span>`
                : `<span class="item-badge" style="background:#ecfdf5; color:#065f46;">Visible</span>`
            }
            <span class="item-card-title">${escapeHtml(sec.heading || 'Untitled Section')}</span>
          </div>
          <div class="item-card-actions">
            <button type="button" class="btn btn-sm btn-primary" data-inline-save-module="sections">Save</button>
            <button type="button" class="btn btn-sm" data-action="move-up" data-collection="sections" data-index="${idx}" ${
        idx === 0 ? 'disabled' : ''
      }>↑</button>
            <button type="button" class="btn btn-sm" data-action="move-down" data-collection="sections" data-index="${idx}" ${
        idx === sections.length - 1 ? 'disabled' : ''
      }>↓</button>
            <button type="button" class="btn btn-sm" data-action="clone" data-collection="sections" data-index="${idx}">Clone</button>
            <button type="button" class="btn btn-sm btn-danger" data-action="delete" data-collection="sections" data-index="${idx}">Delete</button>
            <span class="btn btn-sm" data-card-chevron>${isOpen ? 'Hide ▲' : 'Edit ▼'}</span>
          </div>
        </div>
        <div class="item-card-body">
          <div class="form-grid cols-2">
            <div class="field span-full">
              <div class="toggle-box">
                <div>
                  <strong>Show This Section on Homepage</strong>
                  <div class="field-help">Uncheck to temporarily hide this section without deleting its content.</div>
                </div>
                <input type="checkbox" ${
                  sec.visible !== false ? 'checked' : ''
                } data-collection="sections" data-index="${idx}" data-key="visible" />
              </div>
            </div>
            <div class="field">
              <label class="field-label">Section Heading (&lt;h2&gt;)</label>
              <input type="text" id="sec-heading-${idx}" class="input" value="${escapeHtml(
                sec.heading
              )}" data-collection="sections" data-index="${idx}" data-key="heading" />
            </div>
            <div class="field">
              <div class="field-label">
                <span>Anchor ID Slug (<code>#slug</code>)</span>
                <button type="button" class="btn btn-sm" data-autoslug-collection="sections" data-index="${idx}">Auto-Slug</button>
              </div>
              <input type="text" class="input" value="${escapeHtml(
                sec.slug
              )}" data-collection="sections" data-index="${idx}" data-key="slug" />
            </div>
            <div class="field">
              <label class="field-label">Eyebrow Category Badge (Optional)</label>
              <input type="text" class="input" value="${escapeHtml(
                sec.badgeText || ''
              )}" data-collection="sections" data-index="${idx}" data-key="badgeText" placeholder="e.g., ARCHITECTURE" />
            </div>
            <div class="field">
              <label class="field-label">Section Featured Image Position</label>
              <select class="select" data-collection="sections" data-index="${idx}" data-key="imagePosition">
                <option value="none" ${sec.imagePosition === 'none' || !sec.imagePosition ? 'selected' : ''}>No Section Banner Image</option>
                <option value="top" ${sec.imagePosition === 'top' ? 'selected' : ''}>Show Image Above Content</option>
                <option value="bottom" ${sec.imagePosition === 'bottom' ? 'selected' : ''}>Show Image Below Content</option>
              </select>
            </div>
            <div class="field span-full">
              <div class="field-label">
                <span>Section Image URL (Optional — Select Position Above)</span>
                <button type="button" class="btn btn-sm" data-upload-collection="sections" data-index="${idx}" data-key="imageUrl">Upload Image</button>
              </div>
              <input type="text" class="input" id="sec-img-url-${idx}" value="${escapeHtml(
        sec.imageUrl || ''
      )}" data-collection="sections" data-index="${idx}" data-key="imageUrl" data-thumb-target="sec-img-thumb-${idx}" placeholder="Paste image URL or click Upload Image..." />
              <img id="sec-img-thumb-${idx}" class="img-mini-preview" ${sec.imageUrl ? `src="${escapeHtml(sec.imageUrl)}"` : 'hidden'} alt="Section Image Preview" />
            </div>
            <div class="field">
              <label class="field-label">Section Image Alt Text</label>
              <input type="text" class="input" value="${escapeHtml(
                sec.imageAlt || ''
              )}" data-collection="sections" data-index="${idx}" data-key="imageAlt" />
            </div>
            <div class="field">
              <label class="field-label">Section Image Caption (Optional)</label>
              <input type="text" class="input" value="${escapeHtml(
                sec.imageCaption || ''
              )}" data-collection="sections" data-index="${idx}" data-key="imageCaption" />
            </div>
            <div class="field">
              <label class="field-label">Section Button Text (Optional CTA)</label>
              <input type="text" class="input" value="${escapeHtml(
                sec.ctaLabel || ''
              )}" data-collection="sections" data-index="${idx}" data-key="ctaLabel" placeholder="e.g., View Benchmarks" />
            </div>
            <div class="field">
              <label class="field-label">Section Button Target URL (Optional)</label>
              <div class="url-picker-row">
                <input type="text" class="input" id="sec-cta-url-${idx}" value="${escapeHtml(
                  sec.ctaUrl || ''
                )}" data-collection="sections" data-index="${idx}" data-key="ctaUrl" placeholder="e.g., /#technical-specifications" />
                <select class="select url-quick-select" data-url-index-for="sec-cta-url-${idx}" data-collection="sections" data-index="${idx}" data-key="ctaUrl" aria-label="Quick select URL">${routeOptionsHtml}</select>
              </div>
            </div>
          </div>

          <div class="seo-subbox">
            <div class="seo-subbox-title">
              <span>Section SEO Meta Title &amp; Meta Description</span>
              <button type="button" class="btn btn-sm" data-autoseo-collection="sections" data-index="${idx}">Auto-Fill SEO</button>
            </div>
            <div class="form-grid cols-2">
              <div class="field">
                <label class="field-label">Section Meta Title</label>
                <input type="text" class="input" value="${escapeHtml(
                  sec.metaTitle
                )}" data-collection="sections" data-index="${idx}" data-key="metaTitle" />
              </div>
              <div class="field">
                <label class="field-label">Section Meta Description</label>
                <input type="text" class="input" value="${escapeHtml(
                  sec.metaDescription
                )}" data-collection="sections" data-index="${idx}" data-key="metaDescription" />
              </div>
            </div>
          </div>

          <div class="field" style="margin-top: 12px">
            <div class="field-label">
              <span>Section Content Body (HTML + Rich Visual Blocks)</span>
              <button type="button" class="btn btn-sm" data-toggle-preview="sec-preview-${idx}">Toggle Visual Preview</button>
            </div>
            <div class="html-toolbar">
              <button type="button" class="btn btn-sm btn-primary" data-open-collection-visual-modal="sections" data-index="${idx}" data-key="htmlContent" data-textarea="sec-html-${idx}" data-preview="sec-preview-${idx}">+ Visual Block</button>
              <button type="button" class="btn btn-sm btn-dark" data-open-collection-image-modal="sections" data-index="${idx}" data-key="htmlContent" data-textarea="sec-html-${idx}" data-preview="sec-preview-${idx}">+ Image</button>
              <button type="button" class="btn btn-sm" data-open-collection-link-modal="sections" data-index="${idx}" data-key="htmlContent" data-textarea="sec-html-${idx}" data-preview="sec-preview-${idx}">+ Link</button>
              <button type="button" class="btn btn-sm" data-insert-snippet="b" data-target="sec-html-${idx}" data-collection="sections" data-index="${idx}" data-key="htmlContent"><b>B</b></button>
              <button type="button" class="btn btn-sm" data-insert-snippet="p" data-target="sec-html-${idx}" data-collection="sections" data-index="${idx}" data-key="htmlContent">+ P</button>
              <button type="button" class="btn btn-sm" data-insert-snippet="h3" data-target="sec-html-${idx}" data-collection="sections" data-index="${idx}" data-key="htmlContent">+ H3</button>
              <button type="button" class="btn btn-sm" data-insert-snippet="ul" data-target="sec-html-${idx}" data-collection="sections" data-index="${idx}" data-key="htmlContent">+ List</button>
              <button type="button" class="btn btn-sm" data-insert-snippet="steps" data-target="sec-html-${idx}" data-collection="sections" data-index="${idx}" data-key="htmlContent">+ Steps</button>
              <button type="button" class="btn btn-sm" data-insert-snippet="callout" data-target="sec-html-${idx}" data-collection="sections" data-index="${idx}" data-key="htmlContent">+ Callout</button>
              <button type="button" class="btn btn-sm" data-insert-snippet="grid" data-target="sec-html-${idx}" data-collection="sections" data-index="${idx}" data-key="htmlContent">+ Grid</button>
              <button type="button" class="btn btn-sm" data-insert-snippet="table" data-target="sec-html-${idx}" data-collection="sections" data-index="${idx}" data-key="htmlContent">+ Table</button>
              <button type="button" class="btn btn-sm" data-insert-snippet="cta" data-target="sec-html-${idx}" data-collection="sections" data-index="${idx}" data-key="htmlContent">+ Button</button>
              <button type="button" class="btn btn-sm" data-undo-target="sec-html-${idx}">Undo</button>
            </div>
            <textarea id="sec-html-${idx}" class="textarea code" rows="6" data-collection="sections" data-index="${idx}" data-key="htmlContent" data-preview-target="sec-preview-${idx}">${escapeHtml(
        sec.htmlContent
      )}</textarea>
            <div id="sec-preview-${idx}" class="live-preview-box"></div>
          </div>
          <div style="display:flex; justify-content:flex-end; margin-top:10px;">
            <button type="button" class="btn btn-primary btn-sm" data-inline-save-module="sections">Save [sections] to Firebase</button>
          </div>
        </div>
      </div>
    `;
    })
    .join('');
}

function renderNewsList() {
  const container = $('news-list');
  if (!container) return;
  const articles = currentConfig.newsSection?.articles || [];
  const q = newsSearchQuery.trim().toLowerCase();
  const filtered = articles
    .map((art, idx) => ({ art, idx }))
    .filter(
      ({ art }) =>
        !q ||
        (art.title || '').toLowerCase().includes(q) ||
        (art.category || '').toLowerCase().includes(q) ||
        (art.slug || '').toLowerCase().includes(q)
    );

  if (filtered.length === 0) {
    container.innerHTML = `<div style="font-size:0.82rem; color:var(--text-muted); padding:10px 0;">No articles match your filter. Use the Daily News Composer above or clear search.</div>`;
    return;
  }

  if (openNewsIndex >= articles.length) {
    openNewsIndex = Math.max(0, articles.length - 1);
  }

  const routeOptionsHtml = buildUrlPickerOptionsHtml('Quick Pick Route…');

  container.innerHTML = filtered
    .map(({ art, idx }) => {
      const isOpen = idx === openNewsIndex || Boolean(q);
      return `
      <div class="item-card ${isOpen ? 'open' : ''}" data-card-collection="news" data-card-index="${idx}">
        <div class="item-card-header" data-toggle-card>
          <div class="item-card-title-wrap">
            <span class="item-badge">${escapeHtml(art.category || 'News')}</span>
            ${art.featured ? `<span class="item-badge" style="background:#fef3c7; color:#b45309;">★ Featured</span>` : ''}
            <span class="item-card-title">${escapeHtml(art.title || 'Untitled News')}</span>
          </div>
          <div class="item-card-actions">
            <button type="button" class="btn btn-sm btn-primary" data-inline-save-module="newsSection">Save</button>
            <button type="button" class="btn btn-sm" data-action="move-up" data-collection="news" data-index="${idx}" ${
        idx === 0 ? 'disabled' : ''
      }>↑</button>
            <button type="button" class="btn btn-sm" data-action="move-down" data-collection="news" data-index="${idx}" ${
        idx === articles.length - 1 ? 'disabled' : ''
      }>↓</button>
            <button type="button" class="btn btn-sm" data-load-composer="${idx}">Load in Composer</button>
            <button type="button" class="btn btn-sm" data-action="clone" data-collection="news" data-index="${idx}">Clone</button>
            <a href="/news/${escapeHtml(art.slug)}" target="_blank" class="btn btn-sm">Preview ↗</a>
            <button type="button" class="btn btn-sm btn-danger" data-action="delete" data-collection="news" data-index="${idx}">Delete</button>
            <span class="btn btn-sm" data-card-chevron>${isOpen ? 'Hide ▲' : 'Quick Edit ▼'}</span>
          </div>
        </div>
        <div class="item-card-body">
          <div class="form-grid cols-2">
            <div class="field span-full">
              <div class="toggle-box" style="min-height: 40px; padding: 6px 12px">
                <span>Pin ★ Featured Badge on This Article</span>
                <input type="checkbox" ${art.featured ? 'checked' : ''} data-collection="news" data-index="${idx}" data-key="featured" />
              </div>
            </div>
            <div class="field">
              <label class="field-label">News Article Headline (&lt;h1&gt;)</label>
              <input type="text" id="news-title-${idx}" class="input" value="${escapeHtml(
                art.title
              )}" data-collection="news" data-index="${idx}" data-key="title" />
            </div>
            <div class="field">
              <div class="field-label">
                <span>Standalone URL Slug (<code>/news/:slug</code>)</span>
                <button type="button" class="btn btn-sm" data-autoslug-collection="news" data-index="${idx}">Auto-Slug</button>
              </div>
              <input type="text" class="input" value="${escapeHtml(
                art.slug
              )}" data-collection="news" data-index="${idx}" data-key="slug" />
            </div>
            <div class="field">
              <label class="field-label">Publish Date</label>
              <input type="text" class="input" value="${escapeHtml(
                art.date
              )}" data-collection="news" data-index="${idx}" data-key="date" />
            </div>
            <div class="field">
              <label class="field-label">Category Label</label>
              <input type="text" class="input" list="news-category-presets" value="${escapeHtml(
                art.category
              )}" data-collection="news" data-index="${idx}" data-key="category" />
            </div>
            <div class="field">
              <label class="field-label">Author / Team</label>
              <input type="text" class="input" value="${escapeHtml(
                art.author || ''
              )}" data-collection="news" data-index="${idx}" data-key="author" />
            </div>
            <div class="field">
              <label class="field-label">Reading Time Badge</label>
              <input type="text" class="input" value="${escapeHtml(
                art.readTime || '2 min read'
              )}" data-collection="news" data-index="${idx}" data-key="readTime" />
            </div>
            <div class="field span-full">
              <div class="field-label">
                <span>Featured Cover Image URL (Optional)</span>
                <button type="button" class="btn btn-sm" data-upload-collection="news" data-index="${idx}" data-key="coverImageUrl">Upload Image</button>
              </div>
              <input type="text" class="input" id="news-img-url-${idx}" value="${escapeHtml(
        art.coverImageUrl || ''
      )}" data-collection="news" data-index="${idx}" data-key="coverImageUrl" data-thumb-target="news-img-thumb-${idx}" />
              <img id="news-img-thumb-${idx}" class="img-mini-preview" ${art.coverImageUrl ? `src="${escapeHtml(art.coverImageUrl)}"` : 'hidden'} alt="Cover Preview" />
            </div>
            <div class="field">
              <label class="field-label">Cover Image Alt Text</label>
              <input type="text" class="input" value="${escapeHtml(
                art.coverImageAlt || ''
              )}" data-collection="news" data-index="${idx}" data-key="coverImageAlt" />
            </div>
            <div class="field">
              <label class="field-label">Cover Image Caption</label>
              <input type="text" class="input" value="${escapeHtml(
                art.coverImageCaption || ''
              )}" data-collection="news" data-index="${idx}" data-key="coverImageCaption" />
            </div>
            <div class="field">
              <label class="field-label">In-Article CTA Button Text (Optional)</label>
              <input type="text" class="input" value="${escapeHtml(
                art.ctaLabel || ''
              )}" data-collection="news" data-index="${idx}" data-key="ctaLabel" />
            </div>
            <div class="field">
              <label class="field-label">In-Article CTA Button URL (Optional)</label>
              <div class="url-picker-row">
                <input type="text" class="input" id="news-cta-url-${idx}" value="${escapeHtml(
                  art.ctaUrl || ''
                )}" data-collection="news" data-index="${idx}" data-key="ctaUrl" />
                <select class="select url-quick-select" data-url-index-for="news-cta-url-${idx}" data-collection="news" data-index="${idx}" data-key="ctaUrl" aria-label="Quick select URL">${routeOptionsHtml}</select>
              </div>
            </div>
            <div class="field span-full">
              <label class="field-label">Short Summary</label>
              <textarea class="textarea" rows="2" data-collection="news" data-index="${idx}" data-key="summary">${escapeHtml(
        art.summary
      )}</textarea>
            </div>
          </div>

          <div class="seo-subbox">
            <div class="seo-subbox-title">
              <span>Article SEO Meta Title &amp; Meta Description</span>
              <button type="button" class="btn btn-sm" data-autoseo-collection="news" data-index="${idx}">Auto-Fill SEO</button>
            </div>
            <div class="form-grid cols-2">
              <div class="field">
                <label class="field-label">Article Meta Title (&lt;title&gt;)</label>
                <input type="text" class="input" value="${escapeHtml(
                  art.metaTitle
                )}" data-collection="news" data-index="${idx}" data-key="metaTitle" />
              </div>
              <div class="field">
                <label class="field-label">Article Meta Description</label>
                <input type="text" class="input" value="${escapeHtml(
                  art.metaDescription
                )}" data-collection="news" data-index="${idx}" data-key="metaDescription" />
              </div>
            </div>
          </div>

          <div class="field" style="margin-top: 12px">
            <div class="field-label">
              <span>Full Article Body HTML</span>
              <button type="button" class="btn btn-sm" data-toggle-preview="news-preview-${idx}">Toggle Visual Preview</button>
            </div>
            <div class="html-toolbar">
              <button type="button" class="btn btn-sm btn-primary" data-open-collection-visual-modal="news" data-index="${idx}" data-key="htmlContent" data-textarea="news-html-${idx}" data-preview="news-preview-${idx}">+ Visual Block</button>
              <button type="button" class="btn btn-sm btn-dark" data-open-collection-image-modal="news" data-index="${idx}" data-key="htmlContent" data-textarea="news-html-${idx}" data-preview="news-preview-${idx}">+ Image</button>
              <button type="button" class="btn btn-sm" data-open-collection-link-modal="news" data-index="${idx}" data-key="htmlContent" data-textarea="news-html-${idx}" data-preview="news-preview-${idx}">+ Link</button>
              <button type="button" class="btn btn-sm" data-insert-snippet="b" data-target="news-html-${idx}" data-collection="news" data-index="${idx}" data-key="htmlContent"><b>B</b></button>
              <button type="button" class="btn btn-sm" data-insert-snippet="p" data-target="news-html-${idx}" data-collection="news" data-index="${idx}" data-key="htmlContent">+ P</button>
              <button type="button" class="btn btn-sm" data-insert-snippet="h3" data-target="news-html-${idx}" data-collection="news" data-index="${idx}" data-key="htmlContent">+ H3</button>
              <button type="button" class="btn btn-sm" data-insert-snippet="ul" data-target="news-html-${idx}" data-collection="news" data-index="${idx}" data-key="htmlContent">+ List</button>
              <button type="button" class="btn btn-sm" data-insert-snippet="steps" data-target="news-html-${idx}" data-collection="news" data-index="${idx}" data-key="htmlContent">+ Steps</button>
              <button type="button" class="btn btn-sm" data-insert-snippet="callout" data-target="news-html-${idx}" data-collection="news" data-index="${idx}" data-key="htmlContent">+ Callout</button>
              <button type="button" class="btn btn-sm" data-undo-target="news-html-${idx}">Undo</button>
            </div>
            <textarea id="news-html-${idx}" class="textarea code" rows="5" data-collection="news" data-index="${idx}" data-key="htmlContent" data-preview-target="news-preview-${idx}">${escapeHtml(
        art.htmlContent
      )}</textarea>
            <div id="news-preview-${idx}" class="live-preview-box"></div>
          </div>
          <div style="display:flex; justify-content:flex-end; margin-top:10px;">
            <button type="button" class="btn btn-primary btn-sm" data-inline-save-module="newsSection">Save [newsSection] to Firebase</button>
          </div>
        </div>
      </div>
    `;
    })
    .join('');
}

function renderFaqsList() {
  const container = $('faqs-list');
  if (!container) return;
  const items = currentConfig.faqsSection?.items || [];
  const q = faqSearchQuery.trim().toLowerCase();
  const filtered = items
    .map((faq, idx) => ({ faq, idx }))
    .filter(
      ({ faq }) =>
        !q ||
        (faq.question || '').toLowerCase().includes(q) ||
        (faq.answer || '').toLowerCase().includes(q)
    );

  if (filtered.length === 0) {
    container.innerHTML = `<div style="font-size:0.82rem; color:var(--text-muted); padding:10px 0;">No FAQs match your filter. Click "+ Add FAQ Question" above or clear search.</div>`;
    return;
  }

  if (openFaqIndex >= items.length) {
    openFaqIndex = Math.max(0, items.length - 1);
  }

  container.innerHTML = filtered
    .map(({ faq, idx }) => {
      const isOpen = idx === openFaqIndex || Boolean(q);
      return `
      <div class="item-card ${isOpen ? 'open' : ''}" data-card-collection="faqs" data-card-index="${idx}">
        <div class="item-card-header" data-toggle-card>
          <div class="item-card-title-wrap">
            <span class="item-badge">Q${idx + 1}</span>
            <span class="item-card-title">${escapeHtml(faq.question || 'Untitled Question')}</span>
          </div>
          <div class="item-card-actions">
            <button type="button" class="btn btn-sm btn-primary" data-inline-save-module="faqsSection">Save</button>
            <button type="button" class="btn btn-sm" data-action="move-up" data-collection="faqs" data-index="${idx}" ${
        idx === 0 ? 'disabled' : ''
      }>↑</button>
            <button type="button" class="btn btn-sm" data-action="move-down" data-collection="faqs" data-index="${idx}" ${
        idx === items.length - 1 ? 'disabled' : ''
      }>↓</button>
            <button type="button" class="btn btn-sm" data-action="clone" data-collection="faqs" data-index="${idx}">Clone</button>
            <button type="button" class="btn btn-sm btn-danger" data-action="delete" data-collection="faqs" data-index="${idx}">Delete</button>
            <span class="btn btn-sm" data-card-chevron>${isOpen ? 'Hide ▲' : 'Edit ▼'}</span>
          </div>
        </div>
        <div class="item-card-body">
          <div class="form-grid">
            <div class="field">
              <label class="field-label">Question (&lt;h3&gt;)</label>
              <input type="text" id="faq-question-${idx}" class="input" value="${escapeHtml(
                faq.question
              )}" data-collection="faqs" data-index="${idx}" data-key="question" />
            </div>
            <div class="field">
              <label class="field-label">Answer (&lt;p&gt;)</label>
              <textarea class="textarea" rows="3" data-collection="faqs" data-index="${idx}" data-key="answer">${escapeHtml(
        faq.answer
      )}</textarea>
            </div>
            <div style="display:flex; justify-content:flex-end;">
              <button type="button" class="btn btn-primary btn-sm" data-inline-save-module="faqsSection">Save [faqsSection] to Firebase</button>
            </div>
          </div>
        </div>
      </div>
    `;
    })
    .join('');
}

function renderPagesList() {
  const selectorBar = $('legal-page-selector');
  const container = $('pages-list');
  if (!container || !selectorBar) return;
  const pages = currentConfig.pages || [];

  if (activeLegalPageIndex >= pages.length) {
    activeLegalPageIndex = Math.max(0, pages.length - 1);
  }

  selectorBar.innerHTML = pages
    .map(
      (pg, idx) => `
      <button type="button" class="page-tab-btn ${idx === activeLegalPageIndex ? 'active' : ''}" data-select-legal-page="${idx}">
        ${escapeHtml(pg.label || pg.h1 || `Page ${idx + 1}`)}
      </button>
    `
    )
    .join('');

  const pg = pages[activeLegalPageIndex];
  if (!pg) {
    container.innerHTML = '<p>No standalone pages configured. Click "+ Add Standalone Page" above.</p>';
    return;
  }

  const idx = activeLegalPageIndex;
  container.innerHTML = `
    <div style="border-top: 1px solid var(--border); padding-top: 16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:14px;">
        <div>
          <strong style="font-size:0.95rem;">Editing Page: ${escapeHtml(pg.label || pg.h1)}</strong>
          <div style="font-size:0.78rem; color:var(--text-muted);">Compiled Static URL: <code>/${escapeHtml(pg.slug)}</code></div>
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button type="button" class="btn btn-sm" data-action="move-left" data-collection="pages" data-index="${idx}" ${idx === 0 ? 'disabled' : ''}>← Earlier</button>
          <button type="button" class="btn btn-sm" data-action="move-right" data-collection="pages" data-index="${idx}" ${idx === pages.length - 1 ? 'disabled' : ''}>Later →</button>
          <button type="button" class="btn btn-sm" data-action="clone" data-collection="pages" data-index="${idx}">Clone Page</button>
          <a href="/${escapeHtml(pg.slug)}" target="_blank" class="btn btn-sm btn-primary">Open /${escapeHtml(
    pg.slug
  )} Live ↗</a>
          ${
            pages.length > 1
              ? `<button type="button" class="btn btn-sm btn-danger" data-action="delete" data-collection="pages" data-index="${idx}">Delete Page</button>`
              : ''
          }
        </div>
      </div>

      <div class="form-grid cols-2">
        <div class="field">
          <div class="toggle-box">
            <div>
              <strong>Show Link in Public Footer</strong>
              <div class="field-help">Displays this page link in the bottom footer.</div>
            </div>
            <input type="checkbox" ${
              pg.showInFooter !== false ? 'checked' : ''
            } data-collection="pages" data-index="${idx}" data-key="showInFooter" />
          </div>
        </div>
        <div class="field">
          <div class="toggle-box">
            <div>
              <strong>Also Show Link in Header Menu</strong>
              <div class="field-help">Adds this page to the top-right slide-down drawer.</div>
            </div>
            <input type="checkbox" ${
              pg.showInHeader ? 'checked' : ''
            } data-collection="pages" data-index="${idx}" data-key="showInHeader" />
          </div>
        </div>
        <div class="field span-full">
          <div class="toggle-box">
            <div>
              <strong>Open Page Link in New Browser Tab</strong>
              <div class="field-help">Optional — leave unchecked for seamless instant SPA navigation.</div>
            </div>
            <input type="checkbox" ${pg.openInNewTab ? 'checked' : ''} data-collection="pages" data-index="${idx}" data-key="openInNewTab" />
          </div>
        </div>
        <div class="field">
          <label class="field-label">Footer Link Label</label>
          <input type="text" class="input" value="${escapeHtml(
            pg.label
          )}" data-collection="pages" data-index="${idx}" data-key="label" />
        </div>
        <div class="field">
          <div class="field-label">
            <span>Standalone URL Slug (<code>/:slug</code>)</span>
            <button type="button" class="btn btn-sm" data-autoslug-collection="pages" data-index="${idx}">Auto-Slug</button>
          </div>
          <input type="text" class="input" value="${escapeHtml(
            pg.slug
          )}" data-collection="pages" data-index="${idx}" data-key="slug" />
        </div>
        <div class="field">
          <label class="field-label">Page Main Heading (&lt;h1&gt;)</label>
          <input type="text" class="input" value="${escapeHtml(
            pg.h1
          )}" data-collection="pages" data-index="${idx}" data-key="h1" />
        </div>
        <div class="field">
          <label class="field-label">Last Updated / Effective Date</label>
          <input type="text" class="input" value="${escapeHtml(
            pg.lastUpdated || 'November 2026'
          )}" data-collection="pages" data-index="${idx}" data-key="lastUpdated" />
        </div>
        <div class="field span-full">
          <label class="field-label">Page Subtitle Line (Shown Under H1)</label>
          <input type="text" class="input" value="${escapeHtml(
            pg.subtitle || ''
          )}" data-collection="pages" data-index="${idx}" data-key="subtitle" placeholder="Official Legal & Compliance Document" />
        </div>
        <div class="field">
          <div class="field-label">
            <span>Page Banner Image URL (Optional)</span>
            <button type="button" class="btn btn-sm" data-upload-collection="pages" data-index="${idx}" data-key="bannerImageUrl">Upload Image</button>
          </div>
          <input type="text" class="input" id="page-img-url-${idx}" value="${escapeHtml(
    pg.bannerImageUrl || ''
  )}" data-collection="pages" data-index="${idx}" data-key="bannerImageUrl" data-thumb-target="page-img-thumb-${idx}" placeholder="Optional banner image for this page..." />
          <img id="page-img-thumb-${idx}" class="img-mini-preview" ${pg.bannerImageUrl ? `src="${escapeHtml(pg.bannerImageUrl)}"` : 'hidden'} alt="Page Banner Preview" />
        </div>
        <div class="field">
          <label class="field-label">Banner Image Alt Text (SEO)</label>
          <input type="text" class="input" value="${escapeHtml(
            pg.bannerImageAlt || ''
          )}" data-collection="pages" data-index="${idx}" data-key="bannerImageAlt" placeholder="Describe the page banner image..." />
        </div>
      </div>

      <div class="seo-subbox">
        <div class="seo-subbox-title">
          <span>Standalone Page SEO Meta Title &amp; Meta Description</span>
          <button type="button" class="btn btn-sm" data-autoseo-collection="pages" data-index="${idx}">Auto-Fill SEO</button>
        </div>
        <div class="form-grid cols-2">
          <div class="field">
            <label class="field-label">Page Meta Title (&lt;title&gt;)</label>
            <input type="text" class="input" value="${escapeHtml(
              pg.metaTitle
            )}" data-collection="pages" data-index="${idx}" data-key="metaTitle" />
          </div>
          <div class="field">
            <label class="field-label">Page Meta Description</label>
            <input type="text" class="input" value="${escapeHtml(
              pg.metaDescription
            )}" data-collection="pages" data-index="${idx}" data-key="metaDescription" />
          </div>
        </div>
      </div>

      <div class="field" style="margin-top: 12px">
        <div class="field-label">
          <span>Full Page Document Content (HTML + Rich Components)</span>
          <button type="button" class="btn btn-sm" data-toggle-preview="page-preview-${idx}">Toggle Visual Preview</button>
        </div>
        <div class="html-toolbar">
          <button type="button" class="btn btn-sm btn-primary" data-open-collection-visual-modal="pages" data-index="${idx}" data-key="htmlContent" data-textarea="page-html-${idx}" data-preview="page-preview-${idx}">+ Visual Block</button>
          <button type="button" class="btn btn-sm btn-dark" data-open-collection-image-modal="pages" data-index="${idx}" data-key="htmlContent" data-textarea="page-html-${idx}" data-preview="page-preview-${idx}">+ Image</button>
          <button type="button" class="btn btn-sm" data-open-collection-link-modal="pages" data-index="${idx}" data-key="htmlContent" data-textarea="page-html-${idx}" data-preview="page-preview-${idx}">+ Link</button>
          <button type="button" class="btn btn-sm" data-insert-snippet="b" data-target="page-html-${idx}" data-collection="pages" data-index="${idx}" data-key="htmlContent"><b>B</b></button>
          <button type="button" class="btn btn-sm" data-insert-snippet="p" data-target="page-html-${idx}" data-collection="pages" data-index="${idx}" data-key="htmlContent">+ P</button>
          <button type="button" class="btn btn-sm" data-insert-snippet="h3" data-target="page-html-${idx}" data-collection="pages" data-index="${idx}" data-key="htmlContent">+ H3</button>
          <button type="button" class="btn btn-sm" data-insert-snippet="ul" data-target="page-html-${idx}" data-collection="pages" data-index="${idx}" data-key="htmlContent">+ List</button>
          <button type="button" class="btn btn-sm" data-insert-snippet="steps" data-target="page-html-${idx}" data-collection="pages" data-index="${idx}" data-key="htmlContent">+ Steps</button>
          <button type="button" class="btn btn-sm" data-insert-snippet="callout" data-target="page-html-${idx}" data-collection="pages" data-index="${idx}" data-key="htmlContent">+ Callout</button>
          <button type="button" class="btn btn-sm" data-insert-snippet="table" data-target="page-html-${idx}" data-collection="pages" data-index="${idx}" data-key="htmlContent">+ Table</button>
          <button type="button" class="btn btn-sm" data-insert-snippet="accordion" data-target="page-html-${idx}" data-collection="pages" data-index="${idx}" data-key="htmlContent">+ Accordion</button>
          <button type="button" class="btn btn-sm" data-undo-target="page-html-${idx}">Undo</button>
        </div>
        <textarea id="page-html-${idx}" class="textarea code" rows="9" data-collection="pages" data-index="${idx}" data-key="htmlContent" data-preview-target="page-preview-${idx}">${escapeHtml(
    pg.htmlContent
  )}</textarea>
        <div id="page-preview-${idx}" class="live-preview-box"></div>
      </div>
    </div>
  `;
}

function renderMenuLinksList() {
  const container = $('menu-links-list');
  if (!container) return;
  const links = currentConfig.navigation?.headerLinks || [];
  const routeOptionsHtml = buildUrlPickerOptionsHtml('Quick Pick Route…');

  container.innerHTML = links
    .map(
      (lnk, idx) => `
      <div class="item-card">
        <div class="item-card-header" data-toggle-card>
          <div class="item-card-title-wrap">
            <span class="item-badge">${escapeHtml(lnk.url)}</span>
            <span class="item-card-title">${escapeHtml(lnk.label)}</span>
          </div>
          <div class="item-card-actions">
            <button type="button" class="btn btn-sm" data-action="move-up" data-collection="menu" data-index="${idx}" ${idx === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="btn btn-sm" data-action="move-down" data-collection="menu" data-index="${idx}" ${idx === links.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" class="btn btn-sm" data-action="clone" data-collection="menu" data-index="${idx}">Clone</button>
            <button type="button" class="btn btn-sm btn-danger" data-action="delete" data-collection="menu" data-index="${idx}">Delete</button>
            <span class="btn btn-sm" data-card-chevron>Edit ▼</span>
          </div>
        </div>
        <div class="item-card-body">
          <div class="form-grid cols-2">
            <div class="field">
              <label class="field-label">Menu Link Text</label>
              <input type="text" class="input" value="${escapeHtml(
                lnk.label
              )}" data-collection="menu" data-index="${idx}" data-key="label" />
            </div>
            <div class="field">
              <label class="field-label">Target URL or Section Anchor</label>
              <div class="url-picker-row">
                <input type="text" class="input" id="menu-url-${idx}" value="${escapeHtml(
                  lnk.url
                )}" data-collection="menu" data-index="${idx}" data-key="url" />
                <select class="select url-quick-select" data-url-index-for="menu-url-${idx}" data-collection="menu" data-index="${idx}" data-key="url" aria-label="Quick select URL">${routeOptionsHtml}</select>
              </div>
            </div>
            <div class="field">
              <label class="field-label">Link Meta Title</label>
              <input type="text" class="input" value="${escapeHtml(
                lnk.metaTitle
              )}" data-collection="menu" data-index="${idx}" data-key="metaTitle" />
            </div>
            <div class="field">
              <label class="field-label">Link Meta Description</label>
              <input type="text" class="input" value="${escapeHtml(
                lnk.metaDescription
              )}" data-collection="menu" data-index="${idx}" data-key="metaDescription" />
            </div>
          </div>
        </div>
      </div>
    `
    )
    .join('');
}

function updateLiveThemePreviewCard() {
  const card = $('live-theme-preview-card');
  if (!card) return;
  const accent = $('brand-color')?.value.trim() || '#EF4444';
  const btnText = $('ui-btn-text-color')?.value.trim() || '#FFFFFF';
  const bgPage = $('ui-bg-page')?.value.trim() || '#F8FAFC';
  const bgSurface = $('ui-bg-surface')?.value.trim() || '#FFFFFF';
  const bgHeader = $('ui-header-bg')?.value.trim() || '#FFFFFF';
  const textHeader = $('ui-header-text')?.value.trim() || '#111827';
  const bgFooter = $('ui-footer-bg')?.value.trim() || '#0F172A';
  const textFooter = $('ui-footer-text')?.value.trim() || '#F8FAFC';
  const borderCol = $('ui-border-color')?.value.trim() || '#E2E8F0';
  const textCol = $('ui-text-color')?.value.trim() || '#1F2937';
  const headingCol = $('ui-heading-color')?.value.trim() || '#111827';
  const radius = $('ui-card-radius')?.value || '10px';
  const brandName = $('brand-name')?.value.trim() || 'Your Brand';

  card.style.background = bgPage;
  const surf = $('ltp-surface');
  if (surf) {
    surf.style.background = bgSurface;
    surf.style.borderColor = borderCol;
    surf.style.borderRadius = radius;
  }
  const hdr = $('ltp-header');
  if (hdr) {
    hdr.style.background = bgHeader;
    hdr.style.color = textHeader;
    hdr.style.borderBottomColor = borderCol;
  }
  const brd = $('ltp-brand');
  if (brd) brd.textContent = brandName;
  const pill = $('ltp-accent-pill');
  if (pill) {
    pill.style.color = accent;
    pill.style.background = `${accent}18`;
  }
  const hdg = $('ltp-heading');
  if (hdg) hdg.style.color = headingCol;
  const txt = $('ltp-text');
  if (txt) txt.style.color = textCol;
  const btnSec = $('ltp-btn-secondary');
  if (btnSec) {
    btnSec.style.borderColor = accent;
    btnSec.style.color = accent;
    btnSec.style.borderRadius = radius;
  }
  const btnPri = $('ltp-btn-primary');
  if (btnPri) {
    btnPri.style.background = accent;
    btnPri.style.color = btnText;
    btnPri.style.borderRadius = radius;
  }
  const ftr = $('ltp-footer');
  if (ftr) {
    ftr.style.background = bgFooter;
    ftr.style.color = textFooter;
  }
}

function syncColorPickersFromTextInputs() {
  document.querySelectorAll('[data-color-sync]').forEach((picker) => {
    const targetId = picker.getAttribute('data-color-sync');
    const txt = targetId ? $(targetId) : null;
    const rawHex = txt?.value.trim() || '';
    const validHex = /^#[0-9A-Fa-f]{6}$/.test(rawHex) ? rawHex.toUpperCase() : '';
    if (validHex) {
      picker.value = validHex;
      const chip = document.querySelector(`[data-color-chip-for="${targetId}"]`);
      if (chip) chip.style.background = validHex;
    }
    if (targetId) {
      document.querySelectorAll(`[data-color-choice-for="${targetId}"]`).forEach((dot) => {
        const dotHex = (dot.getAttribute('data-color') || '').trim().toUpperCase();
        dot.classList.toggle('active', Boolean(validHex && dotHex === validHex));
      });
    }
  });
  updateLiveThemePreviewCard();
}

const COLOR_THEME_PRESETS = {
  'clean-light': {
    accentColor: '#EF4444',
    themeColor: '#EF4444',
    buttonTextColor: '#FFFFFF',
    pageBackgroundColor: '#F8FAFC',
    surfaceBackgroundColor: '#FFFFFF',
    headerBackgroundColor: '#FFFFFF',
    headerTextColor: '#111827',
    footerBackgroundColor: '#0F172A',
    footerTextColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    textColor: '#1F2937',
    headingColor: '#111827'
  },
  'midnight-dark': {
    accentColor: '#3B82F6',
    themeColor: '#0F172A',
    buttonTextColor: '#FFFFFF',
    pageBackgroundColor: '#0B0F19',
    surfaceBackgroundColor: '#111827',
    headerBackgroundColor: '#0F172A',
    headerTextColor: '#F8FAFC',
    footerBackgroundColor: '#090D16',
    footerTextColor: '#94A3B8',
    borderColor: '#1E293B',
    textColor: '#E2E8F0',
    headingColor: '#F8FAFC'
  },
  'royal-blue': {
    accentColor: '#2563EB',
    themeColor: '#2563EB',
    buttonTextColor: '#FFFFFF',
    pageBackgroundColor: '#F0F7FF',
    surfaceBackgroundColor: '#FFFFFF',
    headerBackgroundColor: '#FFFFFF',
    headerTextColor: '#0F172A',
    footerBackgroundColor: '#0F172A',
    footerTextColor: '#F8FAFC',
    borderColor: '#BFDBFE',
    textColor: '#1E293B',
    headingColor: '#0F172A'
  },
  'emerald-tech': {
    accentColor: '#059669',
    themeColor: '#059669',
    buttonTextColor: '#FFFFFF',
    pageBackgroundColor: '#F0FDF4',
    surfaceBackgroundColor: '#FFFFFF',
    headerBackgroundColor: '#FFFFFF',
    headerTextColor: '#064E3B',
    footerBackgroundColor: '#064E3B',
    footerTextColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    textColor: '#1F2937',
    headingColor: '#064E3B'
  },
  'violet-modern': {
    accentColor: '#7C3AED',
    themeColor: '#7C3AED',
    buttonTextColor: '#FFFFFF',
    pageBackgroundColor: '#FAF5FF',
    surfaceBackgroundColor: '#FFFFFF',
    headerBackgroundColor: '#FFFFFF',
    headerTextColor: '#1E1B4B',
    footerBackgroundColor: '#1E1B4B',
    footerTextColor: '#F3E8FF',
    borderColor: '#E9D5FF',
    textColor: '#1F2937',
    headingColor: '#1E1B4B'
  },
  'warm-editorial': {
    accentColor: '#EA580C',
    themeColor: '#EA580C',
    buttonTextColor: '#FFFFFF',
    pageBackgroundColor: '#FFFBEB',
    surfaceBackgroundColor: '#FFFFFF',
    headerBackgroundColor: '#FFFFFF',
    headerTextColor: '#1C1917',
    footerBackgroundColor: '#1C1917',
    footerTextColor: '#FEF3C7',
    borderColor: '#FDE68A',
    textColor: '#292524',
    headingColor: '#1C1917'
  }
};

function applyColorThemePreset(presetKey) {
  const p = COLOR_THEME_PRESETS[presetKey];
  if (!p) return;
  setVal('brand-color', p.accentColor);
  setVal('brand-theme-color', p.themeColor);
  setVal('ui-btn-text-color', p.buttonTextColor);
  setVal('ui-bg-page', p.pageBackgroundColor);
  setVal('ui-bg-surface', p.surfaceBackgroundColor);
  setVal('ui-header-bg', p.headerBackgroundColor);
  setVal('ui-header-text', p.headerTextColor);
  setVal('ui-footer-bg', p.footerBackgroundColor);
  setVal('ui-footer-text', p.footerTextColor);
  setVal('ui-border-color', p.borderColor);
  setVal('ui-text-color', p.textColor);
  setVal('ui-heading-color', p.headingColor);
  syncColorPickersFromTextInputs();
  collectScalarFields();
  dirtyModules.add('brand');
  markDirty('Applied color theme preset — click "Publish Edited Modules" to go live', 'uiConfig');
  showToast(`Applied "${presetKey}" color theme!`, 'success');
}

function renderFooterQuickLinksList() {
  const container = $('footer-quick-links-list');
  if (!container) return;
  if (!Array.isArray(currentConfig.navigation.footerQuickLinks)) {
    currentConfig.navigation.footerQuickLinks = [];
  }
  const links = currentConfig.navigation.footerQuickLinks;
  if (links.length === 0) {
    container.innerHTML = `<div style="font-size:0.78rem; color:var(--text-muted); padding:6px 0;">No custom footer quick links added. Click "+ Add Footer Link" above to add custom links to the footer.</div>`;
    return;
  }

  const routeOptionsHtml = buildUrlPickerOptionsHtml('Quick Pick Route…');

  container.innerHTML = links
    .map(
      (lnk, idx) => `
      <div class="item-card open" style="padding:10px 12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:8px; flex-wrap:wrap;">
          <span class="item-badge">Footer Link #${idx + 1}</span>
          <div style="display:flex; gap:5px; flex-wrap:wrap;">
            <button type="button" class="btn btn-sm" data-action="move-up" data-collection="footerQuickLinks" data-index="${idx}" ${idx === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="btn btn-sm" data-action="move-down" data-collection="footerQuickLinks" data-index="${idx}" ${idx === links.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" class="btn btn-sm" data-action="clone" data-collection="footerQuickLinks" data-index="${idx}">Clone</button>
            <button type="button" class="btn btn-sm btn-danger" data-action="delete" data-collection="footerQuickLinks" data-index="${idx}">Remove</button>
          </div>
        </div>
        <div class="form-grid cols-2" style="align-items:end;">
          <div class="field">
            <label class="field-label">Footer Link Label</label>
            <input type="text" class="input" value="${escapeHtml(
              lnk.label
            )}" data-collection="footerQuickLinks" data-index="${idx}" data-key="label" placeholder="e.g., Official Changelog" />
          </div>
          <div class="field">
            <label class="field-label">Target URL (Internal or External)</label>
            <div class="url-picker-row">
              <input type="text" class="input" id="fql-url-${idx}" value="${escapeHtml(
                lnk.url
              )}" data-collection="footerQuickLinks" data-index="${idx}" data-key="url" placeholder="e.g., /news or https://..." />
              <select class="select url-quick-select" data-url-index-for="fql-url-${idx}" data-collection="footerQuickLinks" data-index="${idx}" data-key="url" aria-label="Quick select URL">${routeOptionsHtml}</select>
            </div>
          </div>
          <div class="field span-full">
            <div class="toggle-box" style="min-height: 36px; padding: 6px 12px;">
              <span>Open Footer Link in New Browser Tab</span>
              <input type="checkbox" ${lnk.openInNewTab ? 'checked' : ''} data-collection="footerQuickLinks" data-index="${idx}" data-key="openInNewTab" />
            </div>
          </div>
        </div>
      </div>
    `
    )
    .join('');
}

function renderInternalLinksList() {
  const container = $('internal-links-list');
  if (!container) return;
  if (!currentConfig.domainConfig) {
    currentConfig.domainConfig = JSON.parse(JSON.stringify(EMPTY_ADMIN_CONFIG.domainConfig));
  }
  if (!Array.isArray(currentConfig.domainConfig.internalLinks)) {
    currentConfig.domainConfig.internalLinks = [];
  }
  const rules = currentConfig.domainConfig.internalLinks;
  if (rules.length === 0) {
    container.innerHTML = `<div style="font-size:0.78rem; color:var(--text-muted); padding:6px 0;">No custom internal link rules yet. Click "+ Add Internal Link Rule" above to auto-link keywords across your pages.</div>`;
    return;
  }

  const routeOptionsHtml = buildUrlPickerOptionsHtml('Quick Pick Route…');

  container.innerHTML = rules
    .map(
      (rule, idx) => `
      <div class="item-card open" style="padding:10px 12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:8px; flex-wrap:wrap;">
          <span class="item-badge">Rule #${idx + 1}</span>
          <div style="display:flex; gap:5px; flex-wrap:wrap;">
            <button type="button" class="btn btn-sm" data-action="move-up" data-collection="internalLinks" data-index="${idx}" ${idx === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="btn btn-sm" data-action="move-down" data-collection="internalLinks" data-index="${idx}" ${idx === rules.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" class="btn btn-sm" data-action="clone" data-collection="internalLinks" data-index="${idx}">Clone</button>
            <button type="button" class="btn btn-sm btn-danger" data-action="delete" data-collection="internalLinks" data-index="${idx}">Remove</button>
          </div>
        </div>
        <div class="form-grid cols-3" style="align-items:end;">
          <div class="field">
            <label class="field-label">Keyword Phrase in Body Text</label>
            <input type="text" class="input" value="${escapeHtml(
              rule.keyword
            )}" data-collection="internalLinks" data-index="${idx}" data-key="keyword" placeholder="e.g., SHA-256" />
          </div>
          <div class="field">
            <label class="field-label">Target Internal URL or Anchor</label>
            <div class="url-picker-row">
              <input type="text" class="input" id="il-url-${idx}" value="${escapeHtml(
                rule.targetUrl || rule.url || ''
              )}" data-collection="internalLinks" data-index="${idx}" data-key="targetUrl" placeholder="e.g., /#technical-specifications" />
              <select class="select url-quick-select" data-url-index-for="il-url-${idx}" data-collection="internalLinks" data-index="${idx}" data-key="targetUrl" aria-label="Quick select URL">${routeOptionsHtml}</select>
            </div>
          </div>
          <div class="field">
            <label class="field-label">Link Hover Title (SEO)</label>
            <input type="text" class="input" value="${escapeHtml(
              rule.title || ''
            )}" data-collection="internalLinks" data-index="${idx}" data-key="title" placeholder="e.g., View Specifications" />
          </div>
        </div>
      </div>
    `
    )
    .join('');
}

/* ═══════════════════════════════════════════════════════════════════════════
   8. COLLECT FORM DATA, GRANULAR MODULE SAVES, LIVE FIREBASE & GITHUB SYNC
   ═══════════════════════════════════════════════════════════════════════════ */
function collectScalarFields() {
  const c = currentConfig;
  if (!c.uiConfig) c.uiConfig = JSON.parse(JSON.stringify(EMPTY_ADMIN_CONFIG.uiConfig));
  if (!c.packageSpecs) c.packageSpecs = JSON.parse(JSON.stringify(EMPTY_ADMIN_CONFIG.packageSpecs));
  if (!c.githubConfig) c.githubConfig = JSON.parse(JSON.stringify(EMPTY_ADMIN_CONFIG.githubConfig));
  if (!c.domainConfig) c.domainConfig = JSON.parse(JSON.stringify(EMPTY_ADMIN_CONFIG.domainConfig));
  if (!c.securityGate) c.securityGate = JSON.parse(JSON.stringify(EMPTY_ADMIN_CONFIG.securityGate));

  const hasEl = (id) => Boolean($(id));
  const readVal = (id, fallback) => (hasEl(id) ? $(id).value : fallback);
  const readTrim = (id, fallback) => (hasEl(id) ? $(id).value.trim() : fallback);
  const readCheck = (id, fallback) => (hasEl(id) ? Boolean($(id).checked) : Boolean(fallback));

  c.brand.name = readTrim('brand-name', c.brand.name || '');
  c.brand.shortName = readTrim('brand-short-name', '') || c.brand.name;
  c.brand.tagline = readTrim('brand-tagline', c.brand.tagline || '');
  c.brand.contactEmail = readTrim('brand-email', c.brand.contactEmail || '');
  c.brand.logoUrl = readTrim('brand-logo', c.brand.logoUrl || '');
  c.brand.faviconUrl = readTrim('brand-favicon', c.brand.faviconUrl || '');
  c.brand.searchLogoUrl = readTrim('brand-search-logo', c.brand.searchLogoUrl || '');
  c.brand.appleTouchIconUrl = readTrim('brand-apple-icon', c.brand.appleTouchIconUrl || '');
  c.brand.accentColor = readTrim('brand-color', c.brand.accentColor || '#EF4444') || '#EF4444';
  c.brand.themeColor = readTrim('brand-theme-color', c.brand.themeColor || c.brand.accentColor) || c.brand.accentColor;

  c.uiConfig.showHeroSection = readCheck('ui-show-hero-section', c.uiConfig.showHeroSection);
  c.hero.h1 = readTrim('hero-h1', c.hero.h1 || '');
  c.hero.metaTitle = readTrim('hero-meta-title', c.hero.metaTitle || '');
  c.hero.metaDescription = readTrim('hero-meta-desc', c.hero.metaDescription || '');
  c.hero.introHtml = readVal('hero-intro-html', c.hero.introHtml || '');
  c.hero.showBanner = readCheck('hero-show-banner', c.hero.showBanner);
  c.hero.bannerImageUrl = readTrim('hero-banner-url', c.hero.bannerImageUrl || '');
  c.hero.bannerAlt = readTrim('hero-banner-alt', c.hero.bannerAlt || '');
  c.hero.bannerCaption = readTrim('hero-banner-caption', c.hero.bannerCaption || '');

  c.uiConfig.showHeroCtaButtons = readCheck('ui-show-hero-ctas', c.uiConfig.showHeroCtaButtons);
  c.hero.secondaryCta.label = readTrim('cta-left-text', c.hero.secondaryCta.label || '');
  c.hero.secondaryCta.url = readTrim('cta-left-url', c.hero.secondaryCta.url || '');
  c.hero.secondaryCta.relSponsored = readCheck('cta-left-sponsored', c.hero.secondaryCta.relSponsored);
  c.hero.primaryCta.label = readTrim('cta-right-text', c.hero.primaryCta.label || '');
  c.hero.primaryCta.url = readTrim('cta-right-url', c.hero.primaryCta.url || '');
  c.hero.primaryCta.relSponsored = readCheck('cta-right-sponsored', c.hero.primaryCta.relSponsored);
  c.hero.floatingCta.enabled = readCheck('floating-cta-enabled', c.hero.floatingCta.enabled);
  c.hero.floatingCta.label = readTrim('floating-cta-text', c.hero.floatingCta.label || '');
  c.hero.floatingCta.url = readTrim('floating-cta-url', c.hero.floatingCta.url || '');

  c.uiConfig.maxContainerWidth = readVal('ui-max-width', c.uiConfig.maxContainerWidth || '768px') || '768px';
  c.uiConfig.fontFamily = readVal('ui-font-family', c.uiConfig.fontFamily || 'system') || 'system';
  c.uiConfig.baseFontSize = readVal('ui-font-size', c.uiConfig.baseFontSize || '16px') || '16px';
  c.uiConfig.pageBackgroundColor = readTrim('ui-bg-page', c.uiConfig.pageBackgroundColor || '#F8FAFC') || '#F8FAFC';
  c.uiConfig.surfaceBackgroundColor = readTrim('ui-bg-surface', c.uiConfig.surfaceBackgroundColor || '#FFFFFF') || '#FFFFFF';
  c.uiConfig.headerBackgroundColor = readTrim('ui-header-bg', c.uiConfig.headerBackgroundColor || '#FFFFFF') || '#FFFFFF';
  c.uiConfig.headerTextColor = readTrim('ui-header-text', c.uiConfig.headerTextColor || '#111827') || '#111827';
  c.uiConfig.footerBackgroundColor = readTrim('ui-footer-bg', c.uiConfig.footerBackgroundColor || '#0F172A') || '#0F172A';
  c.uiConfig.footerTextColor = readTrim('ui-footer-text', c.uiConfig.footerTextColor || '#F8FAFC') || '#F8FAFC';
  c.uiConfig.borderColor = readTrim('ui-border-color', c.uiConfig.borderColor || '#E2E8F0') || '#E2E8F0';
  c.uiConfig.cardBorderRadius = readVal('ui-card-radius', c.uiConfig.cardBorderRadius || '12px') || '12px';
  c.uiConfig.buttonTextColor = readTrim('ui-btn-text-color', c.uiConfig.buttonTextColor || '#FFFFFF') || '#FFFFFF';
  c.uiConfig.textColor = readTrim('ui-text-color', c.uiConfig.textColor || '#1F2937') || '#1F2937';
  c.uiConfig.headingColor = readTrim('ui-heading-color', c.uiConfig.headingColor || '#111827') || '#111827';
  c.uiConfig.headerNewsButtonLabel = readTrim('ui-header-news-label', c.uiConfig.headerNewsButtonLabel || 'News') || 'News';
  c.uiConfig.homepageNewsLimit = Math.max(1, Number(readVal('ui-home-news-limit', c.uiConfig.homepageNewsLimit || 5)) || 5);
  c.uiConfig.newsReadMoreLabel = readTrim('ui-news-readmore', c.uiConfig.newsReadMoreLabel || 'Read Full Article →') || 'Read Full Article →';
  c.uiConfig.newsViewAllLabel = readTrim('ui-news-viewall', c.uiConfig.newsViewAllLabel || 'View All News →') || 'View All News →';
  c.uiConfig.backToHomeLabel = readTrim('ui-back-home-label', c.uiConfig.backToHomeLabel || '← Back to Home') || '← Back to Home';
  c.uiConfig.allNewsBreadcrumbLabel = readTrim('ui-all-news-label', c.uiConfig.allNewsBreadcrumbLabel || 'All News →') || 'All News →';
  c.uiConfig.showHeaderNewsButton = readCheck('ui-show-header-news', c.uiConfig.showHeaderNewsButton);
  c.uiConfig.showNewsCountInHeader = readCheck('ui-show-news-count', c.uiConfig.showNewsCountInHeader);
  c.uiConfig.autoIncludeSectionsInDrawer = readCheck('ui-drawer-auto-sections', c.uiConfig.autoIncludeSectionsInDrawer);
  c.uiConfig.showNewsInDrawer = readCheck('ui-drawer-show-news', c.uiConfig.showNewsInDrawer);
  c.uiConfig.showLegalLinksInDrawer = readCheck('ui-drawer-show-legal', c.uiConfig.showLegalLinksInDrawer);
  c.uiConfig.showCtaInDrawer = readCheck('ui-drawer-show-cta', c.uiConfig.showCtaInDrawer);
  c.uiConfig.stickyHeader = readCheck('ui-sticky-header', c.uiConfig.stickyHeader);
  c.uiConfig.showBreadcrumbs = readCheck('ui-show-breadcrumbs', c.uiConfig.showBreadcrumbs);
  c.uiConfig.showSubpageSwitcherPills = readCheck('ui-show-subpage-pills', c.uiConfig.showSubpageSwitcherPills);
  c.uiConfig.showTocJumpBar = readCheck('ui-show-toc-bar', c.uiConfig.showTocJumpBar);
  c.uiConfig.enableFaqAccordion = readCheck('ui-enable-faq-accordion', c.uiConfig.enableFaqAccordion);
  c.uiConfig.showFooterDisclaimer = readCheck('ui-show-footer-disclaimer', c.uiConfig.showFooterDisclaimer);
  c.uiConfig.showFooterLinksHeading = readCheck('ui-show-footer-links-heading', c.uiConfig.showFooterLinksHeading);

  c.packageSpecs.enabled = readCheck('specs-enabled', c.packageSpecs.enabled);
  c.packageSpecs.heading = readTrim('specs-heading', c.packageSpecs.heading || 'Technical Package Specifications') || 'Technical Package Specifications';
  c.packageSpecs.appName = readTrim('specs-app-name', '') || c.brand.name;
  c.packageSpecs.version = readTrim('specs-version', c.packageSpecs.version || '');
  c.packageSpecs.fileSize = readTrim('specs-size', c.packageSpecs.fileSize || '');
  c.packageSpecs.operatingSystem = readTrim('specs-os', c.packageSpecs.operatingSystem || '');
  c.packageSpecs.packageFormat = readTrim('specs-format', c.packageSpecs.packageFormat || '');
  c.packageSpecs.license = readTrim('specs-license', c.packageSpecs.license || '');
  c.packageSpecs.securityStatus = readTrim('specs-security', c.packageSpecs.securityStatus || '');
  c.packageSpecs.lastUpdated = readTrim('specs-updated', c.packageSpecs.lastUpdated || '');
  c.packageSpecs.sha256 = readTrim('specs-sha256', c.packageSpecs.sha256 || '');
  c.packageSpecs.metaTitle = readTrim('specs-meta-title', c.packageSpecs.metaTitle || '');
  c.packageSpecs.metaDescription = readTrim('specs-meta-desc', c.packageSpecs.metaDescription || '');

  c.newsSection.enabled = readCheck('news-enabled', c.newsSection.enabled);
  c.newsSection.heading = readTrim('news-heading', c.newsSection.heading || 'Latest News & Updates') || 'Latest News & Updates';
  c.newsSection.metaTitle = readTrim('news-meta-title', c.newsSection.metaTitle || '');
  c.newsSection.metaDescription = readTrim('news-meta-desc', c.newsSection.metaDescription || '');

  c.content.rawHtml = readVal('global-raw-html', c.content?.rawHtml || '');

  c.faqsSection.enabled = readCheck('faqs-enabled', c.faqsSection.enabled);
  c.faqsSection.heading = readTrim('faqs-heading', c.faqsSection.heading || 'Frequently Asked Questions') || 'Frequently Asked Questions';
  c.faqsSection.metaTitle = readTrim('faqs-meta-title', c.faqsSection.metaTitle || '');
  c.faqsSection.metaDescription = readTrim('faqs-meta-desc', c.faqsSection.metaDescription || '');

  c.navigation.showFooterBrandSummary = readCheck('nav-show-footer-summary', c.navigation.showFooterBrandSummary);
  c.navigation.showFooterContactEmail = readCheck('nav-show-footer-email', c.navigation.showFooterContactEmail);
  c.navigation.footerSummary = readTrim('nav-footer-summary', c.navigation.footerSummary || '');
  c.navigation.disclaimerHeading = readTrim('footer-disclaimer-heading', c.navigation.disclaimerHeading || 'Legal Disclaimer') || 'Legal Disclaimer';
  c.navigation.siteLinksHeading = readTrim('footer-links-heading', c.navigation.siteLinksHeading || 'Legal & Support Pages') || 'Legal & Support Pages';
  c.navigation.disclaimerMetaTitle = readTrim('footer-meta-title', c.navigation.disclaimerMetaTitle || '');
  c.navigation.disclaimerMetaDescription = readTrim('footer-meta-desc', c.navigation.disclaimerMetaDescription || '');
  c.navigation.disclaimer = readTrim('footer-disclaimer-text', c.navigation.disclaimer || '');
  c.navigation.copyright = readTrim('footer-copyright-text', c.navigation.copyright || '');

  const newGhToken = readTrim('gh-token', '');
  if (pendingClearGithubToken) {
    c.githubConfig.fineGrainedToken = '';
    c.githubConfig.clearFineGrainedToken = true;
  } else if (newGhToken) {
    c.githubConfig.fineGrainedToken = newGhToken;
    delete c.githubConfig.clearFineGrainedToken;
  } else {
    c.githubConfig.fineGrainedToken = '';
    delete c.githubConfig.clearFineGrainedToken;
  }
  c.githubConfig.repoOwner = readTrim('gh-owner', c.githubConfig.repoOwner || '');
  c.githubConfig.repoName = readTrim('gh-repo', c.githubConfig.repoName || '');
  c.githubConfig.branch = readTrim('gh-branch', c.githubConfig.branch || 'main') || 'main';
  c.githubConfig.targetDirectory = hasEl('gh-dir') ? ($('gh-dir').value.trim() ?? 'dist-public') : (c.githubConfig.targetDirectory ?? 'dist-public');
  c.githubConfig.commitMessageTemplate =
    readTrim('gh-commit-msg', c.githubConfig.commitMessageTemplate || 'chore(static-publish): sync compiled static public site from Admin Studio') ||
    'chore(static-publish): sync compiled static public site from Admin Studio';
  c.githubConfig.autoPushOnPublish = readCheck('gh-auto-push', c.githubConfig.autoPushOnPublish);

  const primaryDom =
    (hasEl('domain-primary') ? $('domain-primary').value.trim() : '') ||
    (hasEl('seo-canonical') ? $('seo-canonical').value.trim() : '') ||
    c.domainConfig.primaryDomain ||
    c.seo.canonicalUrl ||
    '';
  c.domainConfig.primaryDomain = primaryDom;
  c.domainConfig.googleAnalyticsId = readTrim('domain-ga-id', c.domainConfig.googleAnalyticsId || '');
  c.domainConfig.googleSiteVerification = readTrim('domain-gsc', c.domainConfig.googleSiteVerification || '');
  c.domainConfig.bingSiteVerification = readTrim('domain-bing', c.domainConfig.bingSiteVerification || '');
  c.domainConfig.enableImageSitemap = readCheck('domain-image-sitemap', c.domainConfig.enableImageSitemap);
  c.domainConfig.enableSitemapXml = readCheck('domain-enable-sitemap', c.domainConfig.enableSitemapXml);
  c.domainConfig.enableRssFeed = readCheck('domain-enable-rss', c.domainConfig.enableRssFeed);
  c.domainConfig.enableWebManifest = readCheck('domain-web-manifest', c.domainConfig.enableWebManifest);
  c.domainConfig.forceHttps = readCheck('domain-force-https', c.domainConfig.forceHttps);
  c.domainConfig.enableAutoInternalLinks = readCheck('domain-auto-internal-links', c.domainConfig.enableAutoInternalLinks);
  c.domainConfig.customRobotsTxt = readVal('domain-robots-txt', c.domainConfig.customRobotsTxt || '');

  c.seo.metaTitle = readTrim('seo-meta-title', '') || c.hero.metaTitle || c.hero.h1;
  c.seo.metaDescription = readTrim('seo-meta-desc', '') || c.hero.metaDescription;
  c.seo.canonicalUrl = primaryDom;
  c.seo.ogImageUrl = readTrim('seo-og-image', '') || c.hero.bannerImageUrl;

  c.seo.enableSoftwareSchema = readCheck('schema-app-enabled', c.seo.enableSoftwareSchema);
  c.seo.softwareDetails.name = readTrim('schema-app-name', '') || c.brand.name;
  c.seo.softwareDetails.operatingSystem = readTrim('schema-app-os', c.seo.softwareDetails.operatingSystem || '');
  c.seo.softwareDetails.applicationCategory = readTrim('schema-app-category', c.seo.softwareDetails.applicationCategory || 'UtilitiesApplication') || 'UtilitiesApplication';
  c.seo.softwareDetails.price = readTrim('schema-app-price', c.seo.softwareDetails.price || '0.00') || '0.00';
  c.seo.softwareDetails.priceCurrency = readTrim('schema-app-currency', c.seo.softwareDetails.priceCurrency || 'USD') || 'USD';
  c.seo.softwareDetails.ratingValue = readTrim('schema-app-rating', c.seo.softwareDetails.ratingValue || '5.0') || '5.0';
  c.seo.softwareDetails.reviewCount = readTrim('schema-app-votes', c.seo.softwareDetails.reviewCount || '0') || '0';
  c.seo.rawJsonLd = readTrim('seo-raw-jsonld', c.seo.rawJsonLd || '');

  c.securityGate.enabled = readCheck('sec-enabled', c.securityGate.enabled);
  c.securityGate.showSpecsOnGateway = readCheck('sec-show-specs', c.securityGate.showSpecsOnGateway);
  c.securityGate.devicePolicyMode =
    readVal('sec-device-policy', c.securityGate.devicePolicyMode) === 'strict_mobile_only' ? 'strict_mobile_only' : 'universal_human';
  c.securityGate.proceedButtonLabel = readTrim('sec-btn-label', c.securityGate.proceedButtonLabel || 'PROCEED') || 'PROCEED';
  c.securityGate.customHeading = readTrim('sec-custom-heading', c.securityGate.customHeading || '');
  c.securityGate.customNoteHtml = readVal('sec-custom-note', c.securityGate.customNoteHtml || '');
  c.securityGate.appSlug =
    generateSlug(readTrim('sec-app-slug', '') || c.brand.shortName || c.brand.name || '') || '';
  c.securityGate.appSerialId = readTrim('sec-serial-id', c.securityGate.appSerialId || '');

  c.securityGate.primaryDownloadUrl = readTrim('sec-primary-url', c.securityGate.primaryDownloadUrl || '');
  c.securityGate.encryptedPrimaryUrl = readTrim('sec-encrypted-url', c.securityGate.encryptedPrimaryUrl || '');
  c.securityGate.turnstileSiteKey = readTrim('sec-turnstile-site-key', c.securityGate.turnstileSiteKey || '');
  const newTsSecret = readTrim('sec-turnstile-secret-key', '');
  if (pendingClearTurnstileSecret) {
    c.securityGate.turnstileSecretKey = '';
    c.securityGate.clearTurnstileSecretKey = true;
  } else if (newTsSecret) {
    c.securityGate.turnstileSecretKey = newTsSecret;
    delete c.securityGate.clearTurnstileSecretKey;
  } else {
    c.securityGate.turnstileSecretKey = '';
    delete c.securityGate.clearTurnstileSecretKey;
  }
  c.securityGate.isPaused = readCheck('sec-paused', c.securityGate.isPaused);
  c.securityGate.isComingSoon = readCheck('sec-coming-soon', c.securityGate.isComingSoon);
  c.securityGate.dailyIssueCap = Math.max(0, Number(readVal('sec-daily-cap', c.securityGate.dailyIssueCap ?? 0)) || 0);
  c.securityGate.unavailableMessage = readTrim('sec-unavailable-msg', c.securityGate.unavailableMessage || '');
  c.securityGate.helplineWhatsapp = readTrim('sec-whatsapp', c.securityGate.helplineWhatsapp || '');
  c.securityGate.helplineTelegram = readTrim('sec-telegram', c.securityGate.helplineTelegram || '');
}

function updateSerpSimulator() {
  const title = $('seo-meta-title')?.value || currentConfig.seo.metaTitle || '';
  const desc = $('seo-meta-desc')?.value || currentConfig.seo.metaDescription || '';
  const url = $('domain-primary')?.value || $('seo-canonical')?.value || currentConfig.seo.canonicalUrl || '';

  const tCounter = $('seo-title-counter');
  if (tCounter) {
    tCounter.textContent = `${title.length} / 60 chars`;
    tCounter.className = `field-tag ${title.length > 0 && title.length <= 65 ? 'char-ok' : 'char-warn'}`;
  }
  const dCounter = $('seo-desc-counter');
  if (dCounter) {
    dCounter.textContent = `${desc.length} / 160 chars`;
    dCounter.className = `field-tag ${desc.length > 0 && desc.length <= 165 ? 'char-ok' : 'char-warn'}`;
  }
  if ($('serp-preview-url')) $('serp-preview-url').textContent = url;
  if ($('serp-preview-title')) $('serp-preview-title').textContent = title || 'Homepage Meta Title';
  if ($('serp-preview-desc')) $('serp-preview-desc').textContent = desc || 'Homepage meta description...';
}

async function handleVerifyGitHubAccess() {
  collectScalarFields();
  const gh = currentConfig.githubConfig;
  const feedbackEl = $('gh-verify-feedback');
  const btn = $('btn-verify-github');
  const hasTokenAvailable = Boolean(
    gh.fineGrainedToken ||
      gh.hasFineGrainedToken ||
      getLastEnvDiagnostics()?.githubTokenConfigured
  );

  if (!hasTokenAvailable || !gh.repoOwner || !gh.repoName) {
    if (feedbackEl) {
      feedbackEl.style.display = 'block';
      feedbackEl.innerHTML = `<strong style="color:#b91c1c;">Missing GitHub Details:</strong> Please enter your Fine-Grained Token (or configure GITHUB_FINE_GRAINED_TOKEN), GitHub Owner, and Repository Name above first.`;
    }
    showToast('Enter GitHub Token, Owner & Repo Name first', 'error');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Verifying with api.github.com...';
  }

  try {
    const res = await verifyGitHubRepoRemote(gh);
    const verifiedOk = Boolean(res?.success || res?.ok);
    const fullName = res?.fullName || res?.repoFullName || `${gh.repoOwner}/${gh.repoName}`;
    const isPrivate = Boolean(res?.private ?? res?.privateRepo);
    const canPush = res?.canPush !== undefined ? Boolean(res.canPush) : Boolean(res?.permissions?.push || res?.permissions?.admin || verifiedOk);
    const errMsg = res?.error || res?.message || 'Unable to verify repository.';
    if (verifiedOk) {
      if (res?.config?.githubConfig) {
        currentConfig.githubConfig = {
          ...currentConfig.githubConfig,
          ...res.config.githubConfig,
          fineGrainedToken: '',
          hasFineGrainedToken: true
        };
      } else {
        currentConfig.githubConfig.hasFineGrainedToken = true;
        currentConfig.githubConfig.fineGrainedToken = '';
      }
      pendingClearGithubToken = false;
      dirtyModules.delete('githubConfig');
      const ghTokenInput = $('gh-token');
      if (ghTokenInput) {
        ghTokenInput.value = '';
        ghTokenInput.placeholder = 'Token configured on server (Leave blank to keep stored token)';
      }
      const ghTokenStatusTag = $('gh-token-status-tag');
      if (ghTokenStatusTag) {
        ghTokenStatusTag.textContent = '✓ Token Stored Server-Side';
        ghTokenStatusTag.className = 'card-tag emerald';
      }
      const clearGhBtn = $('btn-clear-gh-token');
      if (clearGhBtn) clearGhBtn.style.display = 'inline-flex';
      renderDirtyModulesSummary();
    }
    if (feedbackEl) {
      feedbackEl.style.display = 'block';
      if (verifiedOk) {
        feedbackEl.innerHTML = `
          <div style="color:#065f46; font-weight:700;">✓ Connected to GitHub Repository: ${escapeHtml(
            fullName
          )}</div>
          <div style="font-size:0.78rem; color:var(--text-sub); margin-top:4px;">
            Visibility: ${isPrivate ? 'Private' : 'Public'} • Default Branch: <code>${escapeHtml(
          res.defaultBranch || 'main'
        )}</code> • Fine-Grained Token Write Permission: <strong>${canPush ? 'Verified ✓' : 'Read-Only ⚠️'}</strong>
          </div>
        `;
        showToast('GitHub repository access verified & saved!', 'success');
      } else {
        feedbackEl.innerHTML = `<strong style="color:#b91c1c;">GitHub Verification Failed:</strong> ${escapeHtml(
          errMsg
        )}`;
        showToast(errMsg, 'error');
      }
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Verify GitHub Token & Repo Access';
    }
  }
}

function renderStaticBundleInspector(bundleData) {
  const box = $('static-bundle-inspector-box');
  const tbody = $('static-bundle-tbody');
  const countTag = $('static-bundle-count-tag');
  const sourceSummaryEl = $('static-bundle-source-summary');
  if (!box || !tbody || !bundleData || !Array.isArray(bundleData.filesList)) return;

  box.style.display = 'block';
  if (countTag) {
    countTag.textContent = `${bundleData.totalFiles || bundleData.filesList.length} static public files`;
  }
  if (sourceSummaryEl) {
    const srcLabel = bundleData.contentSource || (isRealFirebaseConfig(getActiveFirebaseConfig()) ? 'Live Cloud Firestore' : 'Local Admin Workspace');
    const brandName = bundleData.brandSummary?.name || currentConfig.brand?.name || '(Not configured)';
    const rawLogoUrl = bundleData.brandSummary?.logoUrl || currentConfig.brand?.logoUrl || '';
    const logoDisplay = !rawLogoUrl
      ? '(None configured)'
      : rawLogoUrl.startsWith('data:')
        ? `Inline Data URI (${rawLogoUrl.length} chars)`
        : rawLogoUrl.length > 68
          ? `${rawLogoUrl.slice(0, 65)}…`
          : rawLogoUrl;
    const iconsCount = bundleData.seoManifestSummary?.manifestIconsCount ?? 0;
    const manifestStatus = bundleData.seoManifestSummary?.manifestEnabled === false ? 'Disabled' : `manifest.webmanifest (${iconsCount} icon${iconsCount === 1 ? '' : 's'})`;
    const seoStatus = `${bundleData.seoManifestSummary?.sitemapEnabled === false ? 'No Sitemap' : 'sitemap.xml'} · robots.txt${bundleData.seoManifestSummary?.rssEnabled ? ' · feed.xml' : ''}`;
    sourceSummaryEl.innerHTML =
      `<div><strong>Source:</strong> ${escapeHtml(srcLabel)} &nbsp;|&nbsp; <strong>Brand:</strong> ${escapeHtml(brandName)} &nbsp;|&nbsp; <strong>Logo:</strong> <code title="${escapeHtml(rawLogoUrl)}">${escapeHtml(logoDisplay)}</code></div>` +
      `<div style="margin-top:3px;"><strong>Web Manifest:</strong> ${escapeHtml(manifestStatus)} &nbsp;|&nbsp; <strong>SEO Files:</strong> ${escapeHtml(seoStatus)}</div>`;
  }

  tbody.innerHTML = bundleData.filesList
    .map((f) => {
      const kb = (Number(f.sizeBytes || 0) / 1024).toFixed(1);
      return `
        <tr>
          <td><code>/${escapeHtml(f.path)}</code></td>
          <td>${kb} KB</td>
          <td>${escapeHtml(f.description || '')}</td>
        </tr>
      `;
    })
    .join('');
}

async function handleInspectStaticBundle() {
  const btn = $('btn-inspect-static-bundle');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Inspecting Static Bundle...';
  }
  try {
    const res = await fetch('/api/static-bundle', {
      credentials: 'include',
      headers: { Accept: 'application/json', 'X-Admin-CSRF': '1' }
    });
    const data = await res.json().catch(() => null);
    if (res.status === 401) {
      notifyAdminUnauthorized(data?.error);
      return;
    }
    if (res.ok && data?.success) {
      renderStaticBundleInspector(data);
      showToast(`Inspected ${data.totalFiles} compiled public static files`, 'success');
    } else {
      showToast(data?.error || 'Could not inspect static bundle.', 'error');
    }
  } catch {
    showToast('Error loading compiled static bundle.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Inspect Compiled Static Public Files';
    }
  }
}

function appendPipelineStep(stepText) {
  const box = $('gh-sync-pipeline-log');
  if (!box) return;
  box.classList.add('visible');
  const line = document.createElement('div');
  line.textContent = `[${new Date().toLocaleTimeString()}] ${stepText}`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

async function handleCompileAndPushToGitHub() {
  collectScalarFields();
  currentConfig.updatedAt = Date.now();

  if (currentConfig.githubConfig?.fineGrainedToken || pendingClearGithubToken) {
    dirtyModules.add('githubConfig');
  }

  const activeGhConfig = JSON.parse(JSON.stringify(currentConfig.githubConfig || {}));
  const configSnapshot = JSON.parse(JSON.stringify(currentConfig));

  const btn = $('btn-publish-github');
  const feedbackEl = $('gh-verify-feedback');
  const pipeEl = $('gh-sync-pipeline-log');
  if (pipeEl) {
    pipeEl.innerHTML = '';
    pipeEl.classList.add('visible');
  }
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Syncing & Pushing to GitHub...';
  }

  try {
    const pendingEdits = Array.from(dirtyModules).filter((mk) => isCmsModuleKey(mk));
    if (pendingEdits.length > 0) {
      appendPipelineStep(`1/3 Batch-saving ${pendingEdits.length} edited module(s) [${pendingEdits.join(', ')}] to Live Firebase...`);
      const batchMap = {};
      for (const mk of pendingEdits) {
        batchMap[mk] = extractConfigModule(configSnapshot, mk);
      }
      const batchRes = await saveSiteConfigModulesBatchRemote(batchMap, pendingEdits);
      if (!batchRes || !batchRes.success) {
        const batchErr = batchRes?.error || 'Failed saving edited modules to Firebase before GitHub publish.';
        appendPipelineStep(`1/3 ✗ Firebase batch save failed: ${batchErr}`);
        if (feedbackEl) {
          feedbackEl.style.display = 'block';
          feedbackEl.innerHTML = `<strong style="color:#b91c1c;">Firebase Save Failed Before GitHub Push:</strong> ${escapeHtml(batchErr)}`;
        }
        showToast(batchErr, 'error');
        return;
      }
      pendingEdits.forEach((mk) => dirtyModules.delete(mk));
    } else {
      appendPipelineStep('1/3 Verifying live Firebase workspace...');
    }

    appendPipelineStep('2/3 Compiling full static public HTML, assets, sitemap.xml, robots.txt & diffing GitHub blobs...');
    const res = await publishStaticSiteToGitHubRemote(
      activeGhConfig,
      configSnapshot,
      pendingEdits
    );
    pendingClearGithubToken = false;

    if (res?.compiledBundle) {
      renderStaticBundleInspector(res.compiledBundle);
    }

    if (res?.config) {
      currentConfig = mergeSiteConfig(res.config, EMPTY_ADMIN_CONFIG);
      populateAllFields();
    }

    const pub = res?.publishResult || res || {};
    const addedCount = res?.addedCount ?? pub.addedCount ?? 0;
    const updatedCount = res?.updatedCount ?? pub.updatedCount ?? 0;
    const deletedCount = res?.deletedCount ?? pub.deletedCount ?? 0;
    const unchangedCount = res?.unchangedCount ?? pub.unchangedCount ?? 0;
    const isSkipped = Boolean(res?.skipped ?? pub.skipped);
    const filesCount = res?.filesCount ?? pub.filesPushed ?? res?.compiledBundle?.totalFiles ?? 0;
    const commitSha = res?.commitSha || pub.commitSha || '';
    const commitUrl = res?.commitUrl || pub.commitUrl || '#';
    const compiledLocalCount = res?.compiledLocalFiles ?? res?.compiledBundle?.totalFiles ?? 0;
    const errText =
      res?.error ||
      pub.message ||
      res?.message ||
      res?.syncLog?.errorDetail ||
      'Check your GitHub Fine-Grained Token, Owner, and Repo Name.';

    if (feedbackEl) {
      feedbackEl.style.display = 'block';
      if (res && res.success) {
        const diffSummary = `+${addedCount} added, ~${updatedCount} updated, -${deletedCount} deleted, =${unchangedCount} unchanged`;
        if (isSkipped) {
          appendPipelineStep(`3/3 ≡ Remote GitHub branch already identical (${diffSummary}) — skipped redundant commit.`);
          feedbackEl.innerHTML = `
            <div style="color:#065f46; font-weight:700;">≡ GitHub Static Site Already Up to Date (0 Changed Files)</div>
            <div style="font-size:0.78rem; color:var(--text-sub); margin-top:4px; font-variant-numeric:tabular-nums;">
              Tree Diff: ${escapeHtml(diffSummary)} • All live Firebase modules synced.
            </div>
          `;
          markClean('Verified live Firebase & confirmed GitHub public site is up to date');
          showToast('GitHub static site already up to date (0 changed files)', 'success');
        } else {
          appendPipelineStep(`3/3 ✓ Pushed ${filesCount} changed file(s) to GitHub (${commitSha.slice(0, 7)}): ${diffSummary}.`);
          feedbackEl.innerHTML = `
            <div style="color:#065f46; font-weight:700;">✓ Successfully Compiled &amp; Pushed Static Website to GitHub!</div>
            <div style="font-size:0.78rem; color:var(--text-sub); margin-top:4px; font-variant-numeric:tabular-nums;">
              ${escapeHtml(diffSummary)} • Commit SHA: <code>${escapeHtml(commitSha.slice(0, 10))}</code> •
              <a href="${escapeHtml(
                commitUrl
              )}" target="_blank" rel="noopener" style="color:var(--accent); font-weight:700;">Open Commit on GitHub ↗</a>
            </div>
          `;
          markClean(`Synced Firebase & pushed static update (${diffSummary})`);
          showToast(`Pushed static update to GitHub (+${addedCount} / ~${updatedCount} / -${deletedCount})!`, 'success');
        }
      } else {
        appendPipelineStep(`3/3 ⚠️ Local static bundle compiled (${compiledLocalCount} files), GitHub notice: ${errText}`);
        feedbackEl.innerHTML = `
          <div style="color:#b91c1c; font-weight:700;">Local Static Bundle Compiled (${
            compiledLocalCount
          } files in /dist-public), GitHub Push Notice:</div>
          <div style="font-size:0.78rem; color:var(--text-sub); margin-top:4px;">${escapeHtml(
            errText
          )}</div>
        `;
        renderGitHubDeployHistory();
        showToast(errText, 'error');
      }
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Compile & Push Static Website to GitHub Now';
    }
  }
}

async function handleSaveActiveModule(explicitModuleKey = null) {
  collectScalarFields();
  const singleExplicit = isCmsModuleKey(explicitModuleKey) ? explicitModuleKey : null;
  const tabModules = TAB_MODULES_MAP[activeTab] || [getPrimaryModuleForActiveTab(activeTab)];
  const targetModules = singleExplicit
    ? [singleExplicit]
    : Array.from(new Set([...tabModules, ...Array.from(dirtyModules).filter((mk) => isCmsModuleKey(mk) && tabModules.includes(mk))]));

  const btnModule = $('btn-save-active-module');
  if (btnModule) {
    btnModule.disabled = true;
    btnModule.textContent = 'Saving...';
  }

  const siblingDirtySlices = {};
  for (const mk of dirtyModules) {
    if (!targetModules.includes(mk) && isCmsModuleKey(mk)) {
      siblingDirtySlices[mk] = extractConfigModule(currentConfig, mk);
    }
  }

  try {
    let res;
    if (targetModules.length > 1) {
      const modulesMap = {};
      for (const mk of targetModules) {
        modulesMap[mk] = extractConfigModule(currentConfig, mk);
      }
      res = await saveSiteConfigModulesBatchRemote(modulesMap, targetModules);
    } else {
      const targetModule = targetModules[0];
      const moduleSlice = extractConfigModule(currentConfig, targetModule);
      res = await saveSiteConfigModuleRemote(targetModule, moduleSlice, Array.from(dirtyModules));
    }

    if (targetModules.includes('githubConfig')) pendingClearGithubToken = false;
    if (targetModules.includes('securityGate')) pendingClearTurnstileSecret = false;

    if (res && res.success) {
      if (res.config) {
        const merged = mergeSiteConfig(res.config, EMPTY_ADMIN_CONFIG);
        for (const [mk, slice] of Object.entries(siblingDirtySlices)) {
          merged[mk] = slice;
        }
        currentConfig = merged;
      }
      targetModules.forEach((mk) => dirtyModules.delete(mk));
      const fb = $('save-feedback-text');
      if (res.firestoreSaved === false && res.firestoreNotice) {
        if (fb) {
          fb.textContent = res.firestoreNotice;
          fb.style.color = '#b91c1c';
        }
        renderDirtyModulesSummary();
        showToast(res.firestoreNotice, 'error');
      } else {
        if (dirtyModules.size === 0) {
          markClean(res.message || 'Section saved to Firebase & compiled');
        } else {
          renderDirtyModulesSummary();
          if (fb) {
            fb.textContent = res.message || 'Section saved cleanly';
            fb.style.color = '#059669';
          }
        }
        showToast(res.message || 'Section saved cleanly!', 'success');
      }
      renderGitHubDeployHistory();
      refreshOverviewAndSeoAudit();
      return true;
    } else {
      showToast(res?.error || 'Failed saving section to Firebase.', 'error');
      return false;
    }
  } finally {
    if (btnModule) {
      btnModule.disabled = false;
      btnModule.textContent = 'Save Section';
    }
  }
}

async function handleSaveAndPublish() {
  collectScalarFields();
  currentConfig.updatedAt = Date.now();

  if (currentConfig.githubConfig?.fineGrainedToken || pendingClearGithubToken) {
    dirtyModules.add('githubConfig');
  }
  if (currentConfig.securityGate?.turnstileSecretKey || pendingClearTurnstileSecret) {
    dirtyModules.add('securityGate');
  }

  const btnTop = $('btn-top-save');
  const btnBottom = $('btn-bottom-save');
  if (btnTop) {
    btnTop.disabled = true;
    btnTop.textContent = 'Publishing...';
  }
  if (btnBottom) {
    btnBottom.disabled = true;
    btnBottom.textContent = 'Publishing...';
  }

  try {
    const gh = currentConfig.githubConfig || {};
    const hasGhToken = Boolean(
      gh.fineGrainedToken ||
        gh.hasFineGrainedToken ||
        getLastEnvDiagnostics()?.githubTokenConfigured
    );
    const isGhConfigured = Boolean(hasGhToken && gh.repoOwner && gh.repoName);
    const shouldAutoPush = Boolean(gh.autoPushOnPublish && isGhConfigured);

    if (shouldAutoPush || (activeTab === 'deploy' && isGhConfigured)) {
      await handleCompileAndPushToGitHub();
      refreshOverviewAndSeoAudit();
      return;
    }

    const dirtyList = Array.from(dirtyModules).filter((mk) => isCmsModuleKey(mk));
    const tabModules = TAB_MODULES_MAP[activeTab] || [getPrimaryModuleForActiveTab(activeTab)];
    const targetModules = dirtyList.length > 0 ? dirtyList : tabModules;

    if (targetModules.length > 0) {
      const modulesMap = {};
      for (const modKey of targetModules) {
        modulesMap[modKey] = extractConfigModule(currentConfig, modKey);
      }
      const batchRes = await saveSiteConfigModulesBatchRemote(modulesMap, targetModules);
      if (!batchRes?.success) {
        throw new Error(batchRes?.error || 'Error saving modules to Firebase');
      }
      if (batchRes.config) {
        currentConfig = mergeSiteConfig(batchRes.config, EMPTY_ADMIN_CONFIG);
      }
      targetModules.forEach((modKey) => dirtyModules.delete(modKey));
      pendingClearGithubToken = false;
      pendingClearTurnstileSecret = false;
      populateAllFields();

      if (batchRes.firestoreSaved === false && batchRes.firestoreNotice) {
        const fb = $('save-feedback-text');
        if (fb) {
          fb.textContent = batchRes.firestoreNotice;
          fb.style.color = '#b91c1c';
        }
        showToast(batchRes.firestoreNotice, 'error');
      } else {
        const summaryMsg = batchRes.message || `Saved [${targetModules.join(', ')}] to Live Firebase & compiled static routes`;
        markClean(summaryMsg);
        showToast(summaryMsg, 'success');
      }
      renderGitHubDeployHistory();
      refreshOverviewAndSeoAudit();
      return;
    }
  } catch (err) {
    showToast(err.message || 'Error saving configuration.', 'error');
  } finally {
    if (btnTop) {
      btnTop.disabled = false;
      btnTop.textContent = 'Publish Changes';
    }
    if (btnBottom) {
      btnBottom.disabled = false;
      btnBottom.textContent = dirtyModules.size > 0 ? 'Publish Edited Modules' : 'Publish Changes';
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   9. EVENT DELEGATION & INITIALIZATION
   ═══════════════════════════════════════════════════════════════════════════ */
function getCollectionRef(name) {
  if (name === 'sections') return currentConfig.sections;
  if (name === 'news') return currentConfig.newsSection.articles;
  if (name === 'faqs') return currentConfig.faqsSection.items;
  if (name === 'pages') return currentConfig.pages;
  if (name === 'menu') return currentConfig.navigation.headerLinks;
  if (name === 'customSpecs') return currentConfig.packageSpecs.customRows;
  if (name === 'footerQuickLinks') return currentConfig.navigation.footerQuickLinks;
  if (name === 'internalLinks') return currentConfig.domainConfig.internalLinks;
  return null;
}

function rerenderCollection(name) {
  if (name === 'sections') renderSectionsList();
  if (name === 'news') renderNewsList();
  if (name === 'faqs') renderFaqsList();
  if (name === 'pages') renderPagesList();
  if (name === 'menu') renderMenuLinksList();
  if (name === 'customSpecs') renderCustomSpecsRows();
  if (name === 'footerQuickLinks') renderFooterQuickLinksList();
  if (name === 'internalLinks') renderInternalLinksList();
  refreshOverviewAndSeoAudit();
}

function bindWorkspaceDomEvents() {
  // Insert Image Modal Controls
  $('btn-close-image-modal')?.addEventListener('click', closeInsertImageModal);
  $('btn-confirm-insert-image')?.addEventListener('click', confirmInsertImageFromModal);
  $('modal-img-url')?.addEventListener('input', (e) => {
    setImagePreview($('modal-img-preview'), e.target.value);
  });

  // Insert Link Modal Controls
  $('btn-close-link-modal')?.addEventListener('click', closeInsertLinkModal);
  $('btn-confirm-insert-link')?.addEventListener('click', confirmInsertLinkFromModal);
  $('modal-link-preset')?.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val) setVal('modal-link-url', val);
  });

  // Live Website Preview Modal Controls
  $('btn-open-preview-modal')?.addEventListener('click', openSitePreviewModal);
  $('btn-close-preview-modal')?.addEventListener('click', closeSitePreviewModal);
  $('preview-route-select')?.addEventListener('change', loadPreviewIframe);
  $('btn-preview-mobile')?.addEventListener('click', () => {
    $('site-preview-iframe')?.classList.add('mobile-mode');
    $('btn-preview-mobile')?.classList.add('btn-dark');
    $('btn-preview-desktop')?.classList.remove('btn-dark');
  });
  $('btn-preview-desktop')?.addEventListener('click', () => {
    $('site-preview-iframe')?.classList.remove('mobile-mode');
    $('btn-preview-desktop')?.classList.add('btn-dark');
    $('btn-preview-mobile')?.classList.remove('btn-dark');
  });
  $('btn-preview-save-reload')?.addEventListener('click', async () => {
    await handleSaveAndPublish();
    loadPreviewIframe();
  });

  // Visual Block Builder Modal Controls
  $('vb-type')?.addEventListener('change', syncVisualBlockModalFields);
  $('btn-close-visual-block-modal')?.addEventListener('click', closeVisualBlockModal);
  $('btn-confirm-visual-block')?.addEventListener('click', confirmInsertVisualBlockFromModal);

  // 1-Tap Master Clone & Brand Switcher (#btn-apply-quick-clone)
  $('btn-apply-quick-clone')?.addEventListener('click', () => {
    collectScalarFields();
    const c = currentConfig;
    const brandName = ($('qc-brand-name')?.value || '').trim() || c.brand.name || 'MyBrand';
    const ver = ($('qc-version')?.value || '').trim() || c.packageSpecs.version || 'v1.0.0';
    const domain = ($('qc-domain')?.value || '').trim() || c.domainConfig.primaryDomain || c.seo.canonicalUrl;
    const email = ($('qc-email')?.value || '').trim() || c.brand.contactEmail;
    const dlUrl = ($('qc-download-url')?.value || '').trim();
    const accent = ($('qc-accent-color')?.value || '').trim() || c.brand.accentColor;

    c.brand.name = brandName;
    c.brand.shortName = brandName;
    c.brand.contactEmail = email;
    if (/^#[0-9A-Fa-f]{6}$/.test(accent)) {
      c.brand.accentColor = accent;
      c.brand.themeColor = accent;
    }

    c.packageSpecs.appName = brandName;
    c.packageSpecs.version = ver;

    c.domainConfig.primaryDomain = domain;
    c.seo.canonicalUrl = domain;
    c.seo.softwareDetails.name = brandName;
    c.seo.metaTitle = `${brandName} ${ver} Official Portal & Package Release Hub`;
    c.seo.metaDescription = `Official ${brandName} ${ver} hub with verified SHA-256 package details, daily release updates, and high-speed downloads.`;
    c.hero.h1 = `${brandName} ${ver} — Official Release & Package Hub`;
    c.hero.metaTitle = c.seo.metaTitle;
    c.hero.metaDescription = c.seo.metaDescription;
    c.hero.bannerAlt = `${brandName} ${ver} Showcase Preview`;

    c.securityGate.appSlug = generateSlug(brandName) || 'app';
    if (dlUrl) {
      c.securityGate.primaryDownloadUrl = dlUrl;
      if (c.securityGate.enabled) c.hero.primaryCta.url = '/moreinfo';
    }

    const cleanOrigin = domain.replace(/\/+$/, '');
    if (cleanOrigin) {
      c.domainConfig.customRobotsTxt = `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /moreinfo\nDisallow: /download\nDisallow: /api/\n\nSitemap: ${cleanOrigin}/sitemap.xml`;
    }
    c.navigation.copyright = `© ${new Date().getFullYear()} ${brandName}. All Rights Reserved.`;
    c.pages = (c.pages || []).map((pg) => {
      if (pg.slug.includes('privacy')) return { ...pg, metaTitle: `Privacy Policy | ${brandName}`, htmlContent: generateSmartLegalHtml('privacy', brandName, cleanOrigin, email) };
      if (pg.slug.includes('terms')) return { ...pg, metaTitle: `Terms and Conditions | ${brandName}`, htmlContent: generateSmartLegalHtml('terms', brandName, cleanOrigin, email) };
      if (pg.slug.includes('dmca')) return { ...pg, metaTitle: `DMCA Disclaimer | ${brandName}`, htmlContent: generateSmartLegalHtml('dmca', brandName, cleanOrigin, email) };
      if (pg.slug.includes('contact')) return { ...pg, metaTitle: `Contact Support | ${brandName}`, htmlContent: generateSmartLegalHtml('contact', brandName, cleanOrigin, email) };
      return pg;
    });

    ['brand', 'hero', 'packageSpecs', 'seo', 'domainConfig', 'navigation', 'pages', 'securityGate'].forEach((k) =>
      dirtyModules.add(k)
    );
    populateAllFields();
    markDirty(`Master Clone applied for "${brandName}" — click "Publish Edited Modules" to go live`, 'brand');
    showToast(`Re-branded site to "${brandName}" (${ver})!`, 'success');
  });

  // Search Filters & Expand / Collapse All Controls
  $('sections-search-input')?.addEventListener('input', (e) => {
    sectionSearchQuery = e.target.value || '';
    renderSectionsList();
  });
  $('btn-sections-expand-all')?.addEventListener('click', () => {
    document.querySelectorAll('#sections-list .item-card').forEach((card) => {
      card.classList.add('open');
      const ch = card.querySelector('[data-card-chevron]');
      if (ch) ch.textContent = 'Hide ▲';
    });
  });
  $('btn-sections-collapse-all')?.addEventListener('click', () => {
    openSectionIndex = -1;
    document.querySelectorAll('#sections-list .item-card').forEach((card) => {
      card.classList.remove('open');
      const ch = card.querySelector('[data-card-chevron]');
      if (ch) ch.textContent = 'Edit ▼';
    });
  });

  $('news-search-input')?.addEventListener('input', (e) => {
    newsSearchQuery = e.target.value || '';
    renderNewsList();
  });
  $('btn-news-expand-all')?.addEventListener('click', () => {
    document.querySelectorAll('#news-list .item-card').forEach((card) => {
      card.classList.add('open');
      const ch = card.querySelector('[data-card-chevron]');
      if (ch) ch.textContent = 'Hide ▲';
    });
  });
  $('btn-news-collapse-all')?.addEventListener('click', () => {
    openNewsIndex = -1;
    document.querySelectorAll('#news-list .item-card').forEach((card) => {
      card.classList.remove('open');
      const ch = card.querySelector('[data-card-chevron]');
      if (ch) ch.textContent = 'Quick Edit ▼';
    });
  });

  $('faqs-search-input')?.addEventListener('input', (e) => {
    faqSearchQuery = e.target.value || '';
    renderFaqsList();
  });
  $('btn-faqs-expand-all')?.addEventListener('click', () => {
    document.querySelectorAll('#faqs-list .item-card').forEach((card) => {
      card.classList.add('open');
      const ch = card.querySelector('[data-card-chevron]');
      if (ch) ch.textContent = 'Hide ▲';
    });
  });
  $('btn-faqs-collapse-all')?.addEventListener('click', () => {
    openFaqIndex = -1;
    document.querySelectorAll('#faqs-list .item-card').forEach((card) => {
      card.classList.remove('open');
      const ch = card.querySelector('[data-card-chevron]');
      if (ch) ch.textContent = 'Edit ▼';
    });
  });

  // Live Brand Thumbnail Sync + Custom JSON-LD Validator
  ['brand-logo', 'brand-favicon', 'brand-search-logo', 'brand-apple-icon'].forEach((id) => {
    $(id)?.addEventListener('input', refreshBrandThumbs);
  });
  $('seo-raw-jsonld')?.addEventListener('input', (e) => {
    updateJsonLdStatusIndicator(e.target.value);
  });

  // 1-Click Spec Row Presets, Quick FAQs & Standalone Page Templates
  document.querySelectorAll('[data-spec-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = btn.getAttribute('data-spec-preset');
      const presets = {
        arch: { label: 'Architecture', value: 'ARM64-v8a / Universal' },
        dev: { label: 'Verified Publisher', value: `${currentConfig.brand?.name || 'Official'} Engineering` },
        ram: { label: 'Minimum RAM / Storage', value: '2 GB RAM • 150 MB Free Space' },
        channel: { label: 'Release Channel', value: 'Production Signed Stable' }
      };
      const row = presets[preset];
      if (!row) return;
      if (!Array.isArray(currentConfig.packageSpecs.customRows)) {
        currentConfig.packageSpecs.customRows = [];
      }
      currentConfig.packageSpecs.customRows.push({ ...row });
      renderCustomSpecsRows();
      markDirty('Added specification row preset', 'packageSpecs');
      showToast(`Added "${row.label}" specification row!`, 'success');
    });
  });

  document.querySelectorAll('[data-faq-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = btn.getAttribute('data-faq-preset');
      const brandName = currentConfig.brand?.name || 'Website';
      const ver = currentConfig.packageSpecs?.version || 'latest version';
      const map = {
        free: {
          question: `Is ${brandName} completely free to download and use?`,
          answer: `Yes, the official ${brandName} (${ver}) package listed on this portal is freeware with zero hidden subscription locks or trial expiration.`
        },
        safety: {
          question: `How can I verify that the ${brandName} installer is authentic and clean?`,
          answer: `Every release published here is scanned across 72 security engines and ships with an immutable 64-character SHA-256 cryptographic checksum listed in Technical Specifications.`
        },
        update: {
          question: `Will installing ${ver} erase my existing app preferences or saved data?`,
          answer: `No. Installing an official signed ${brandName} update cleanly upgrades the application package in place while preserving your local configuration.`
        },
        compat: {
          question: `Which Android and iOS versions are supported by ${brandName}?`,
          answer: `${brandName} (${ver}) supports ${currentConfig.packageSpecs?.operatingSystem || 'Android 9.0+ and iOS 15.0+'} across both smartphone and tablet form factors.`
        }
      };
      const faq = map[preset];
      if (!faq) return;
      currentConfig.faqsSection.items.push({ id: `faq-${Date.now()}`, ...faq });
      openFaqIndex = currentConfig.faqsSection.items.length - 1;
      renderFaqsList();
      refreshOverviewAndSeoAudit();
      markDirty('Added quick FAQ item', 'faqsSection');
      showToast('Added quick FAQ item!', 'success');
    });
  });

  document.querySelectorAll('[data-page-template]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tpl = btn.getAttribute('data-page-template');
      const brandName = currentConfig.brand?.name || 'Website';
      const email = currentConfig.brand?.contactEmail || '';
      const nowMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const tplMap = {
        about: {
          label: 'About Us',
          slug: 'about-us',
          h1: `About ${brandName}`,
          subtitle: `Official Website & Engineering Mission`,
          metaTitle: `About ${brandName}`,
          metaDescription: `Learn about the engineering mission, checksum transparency, and editorial standards of ${brandName}.`,
          htmlContent: `<h2>Who We Are</h2>\n<p>${brandName} publishes cryptographically verified mobile release packages, documentation, and daily changelogs with strict zero-telemetry standards.</p>${email ? `\n<h2>Contact & Transparency</h2>\n<p>Reach our editorial and engineering desk anytime at <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>.</p>` : ''}`
        },
        disclosure: {
          label: 'Editorial Disclosure',
          slug: 'editorial-disclosure',
          h1: `Editorial & Compliance Disclosure`,
          subtitle: `Independent Package Verification & Source Standards`,
          metaTitle: `Editorial Disclosure | ${brandName}`,
          metaDescription: `Editorial verification standards, third-party trademarks, and independence disclosure for ${brandName}.`,
          htmlContent: `<h2>1. Editorial Independence</h2>\n<p>All technical specifications, benchmarks, and release notes on ${brandName} are audited against official binaries prior to publication.</p>\n<h2>2. Trademarks</h2>\n<p>All third-party logos and names remain property of their respective owners.</p>`
        },
        mirrors: {
          label: 'Checksums & Mirrors',
          slug: 'checksums-mirrors',
          h1: `Official Release Mirrors & SHA-256 Registry`,
          subtitle: `Cryptographic Build Verification Ledger`,
          metaTitle: `Official Mirrors & SHA-256 Checksums | ${brandName}`,
          metaDescription: `Verify official ${brandName} package SHA-256 checksums and global CDN mirror endpoints.`,
          htmlContent: `<h2>Verify Before Installing</h2>\n<p>Always compare your downloaded installer digest against our published SHA-256 hash in the <a href="/#technical-specifications" data-spa-link>Technical Specifications</a> table.</p>`
        }
      };
      const item = tplMap[tpl];
      if (!item) return;
      currentConfig.pages.push({
        id: `page-${Date.now()}`,
        showInFooter: true,
        showInHeader: true,
        openInNewTab: false,
        bannerImageUrl: '',
        bannerImageAlt: '',
        lastUpdated: nowMonth,
        ...item
      });
      activeLegalPageIndex = currentConfig.pages.length - 1;
      renderPagesList();
      syncUrlQuickPickers();
      refreshOverviewAndSeoAudit();
      markDirty(`Created standalone "${item.label}" page`, 'pages');
      showToast(`Created standalone "${item.label}" page!`, 'success');
    });
  });

  $('btn-composer-autoslug')?.addEventListener('click', () => {
    const title = $('composer-news-title')?.value.trim() || '';
    if (!title) {
      showToast('Enter a News Headline first.', 'error');
      return;
    }
    const slug = generateSlug(title);
    setVal('composer-news-slug', slug);
    const slugEl = $('composer-news-slug');
    if (slugEl) slugEl.dataset.manuallyEdited = '';
    showToast(`Generated slug: /news/${slug}`, 'success');
  });

  // GitHub Fine-Grained Token Publisher, Clear Logs, Clear Secret & Static Bundle Inspector Buttons
  $('btn-verify-github')?.addEventListener('click', handleVerifyGitHubAccess);
  $('btn-publish-github')?.addEventListener('click', handleCompileAndPushToGitHub);
  $('btn-inspect-static-bundle')?.addEventListener('click', handleInspectStaticBundle);

  $('btn-clear-sync-logs')?.addEventListener('click', async () => {
    const btn = $('btn-clear-sync-logs');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Clearing...';
    }
    try {
      const res = await fetch('/api/admin/clear-logs', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Admin-CSRF': '1'
        }
      });
      const data = await res.json().catch(() => null);
      if (res.status === 401) {
        notifyAdminUnauthorized(data?.error);
        return;
      }
      if (res.ok && data?.success) {
        if (data.config) {
          currentConfig = mergeSiteConfig(data.config, EMPTY_ADMIN_CONFIG);
        } else {
          currentConfig.syncLogs = [];
          if (currentConfig.githubConfig) currentConfig.githubConfig.deployHistory = [];
        }
        renderGitHubDeployHistory();
        showToast('Cleared Sync & Activity Logs', 'success');
      } else {
        showToast(data?.error || 'Could not clear logs', 'error');
      }
    } catch {
      showToast('Network error clearing logs', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Clear Logs';
      }
    }
  });

  $('btn-clear-gh-token')?.addEventListener('click', () => {
    pendingClearGithubToken = true;
    setVal('gh-token', '');
    if (currentConfig.githubConfig) currentConfig.githubConfig.hasFineGrainedToken = false;
    markDirty('Marked stored GitHub token for removal — Save [githubConfig] to apply', 'githubConfig');
    populateAllFields();
    showToast('Token marked for removal — save to apply');
  });

  $('btn-clear-ts-secret')?.addEventListener('click', () => {
    pendingClearTurnstileSecret = true;
    setVal('sec-turnstile-secret-key', '');
    if (currentConfig.securityGate) currentConfig.securityGate.hasTurnstileSecretKey = false;
    markDirty('Marked stored Turnstile secret for removal — Save [securityGate] to apply', 'securityGate');
    populateAllFields();
    showToast('Turnstile secret marked for removal — save to apply');
  });

  // 1-Click AES-256-GCM URL Encryption Button
  $('btn-encrypt-vault-url')?.addEventListener('click', async () => {
    const rawUrl = $('sec-primary-url')?.value.trim() || '';
    if (!rawUrl) {
      showToast('Enter a Protected Destination Download URL first.', 'error');
      $('sec-primary-url')?.focus();
      return;
    }
    const btn = $('btn-encrypt-vault-url');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Encrypting with AES-256-GCM…';
    }
    try {
      const res = await fetch('/api/admin/encrypt-url', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Admin-CSRF': '1'
        },
        body: JSON.stringify({ url: rawUrl })
      });
      const data = await res.json().catch(() => null);
      if (res.status === 401) {
        notifyAdminUnauthorized(data?.error);
        return;
      }
      if (res.ok && data?.success && data?.encryptedUrl) {
        setVal('sec-encrypted-url', data.encryptedUrl);
        collectScalarFields();
        updateVaultStatusIndicator();
        markDirty('Encrypted download URL into AES-256-GCM v2 vault — click Publish to save', 'securityGate');
        showToast('URL encrypted with AES-256-GCM (v2.<iv>.<cipher>)!', 'success');
      } else {
        showToast(data?.error || 'Encryption failed.', 'error');
      }
    } catch {
      showToast('Network error encrypting URL.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Encrypt URL Now (AES-256-GCM)';
      }
    }
  });

  ['sec-primary-url', 'sec-encrypted-url'].forEach((id) => {
    $(id)?.addEventListener('input', updateVaultStatusIndicator);
  });

  // Admin Hamburger Menu Drawer Toggle & Close
  $('admin-hamburger-btn')?.addEventListener('click', toggleAdminNavDrawer);
  $('admin-drawer-close')?.addEventListener('click', closeAdminNavDrawer);
  $('admin-nav-backdrop')?.addEventListener('click', closeAdminNavDrawer);

  // Logout (Revokes server JTI, clears cookies, wipes in-memory & DOM state)
  $('btn-logout')?.addEventListener('click', async () => {
    await logoutAdminUser();
    lockAdminStudio();
    showToast('Signed out of Admin Studio');
  });

  // Desktop Sidebar, Mobile Quick Tabs & Hamburger Drawer Tab Navigation
  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab) switchTab(btn.dataset.tab);
    });
  });

  // Menu & Pages Sub-Area Filter Pills
  document.querySelectorAll('[data-pages-subtab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const subKey = btn.getAttribute('data-pages-subtab') || 'all';
      filterPagesSubcards(subKey);
    });
  });

  // Toggle Collapsible Individual Area Color Customizer
  $('btn-toggle-custom-colors')?.addEventListener('click', () => {
    const panel = $('ui-custom-colors-panel');
    const btn = $('btn-toggle-custom-colors');
    if (!panel || !btn) return;
    const willShow = panel.hidden;
    panel.hidden = !willShow;
    btn.setAttribute('aria-expanded', willShow ? 'true' : 'false');
    btn.textContent = willShow ? 'Hide Individual Colors ▴' : 'Customize Individual Colors ▾';
  });

  // Smartphone 1-Tap Quick-Add Content Bar on Overview
  $('btn-quick-add-news')?.addEventListener('click', () => {
    switchTab('news');
    resetNewsComposer();
    setTimeout(() => {
      const titleInput = $('composer-news-title');
      if (titleInput) {
        titleInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        titleInput.focus();
      }
    }, 80);
  });

  $('btn-quick-add-section')?.addEventListener('click', () => {
    switchTab('sections');
    $('btn-add-section')?.click();
  });

  $('btn-quick-add-faq')?.addEventListener('click', () => {
    switchTab('faqs');
    $('btn-add-faq')?.click();
  });

  $('btn-quick-add-page')?.addEventListener('click', () => {
    switchTab('pages');
    $('btn-add-page')?.click();
  });

  // Save Buttons (Full Edited Modules + Single Active Module Only)
  $('btn-top-save')?.addEventListener('click', handleSaveAndPublish);
  $('btn-bottom-save')?.addEventListener('click', handleSaveAndPublish);
  $('btn-save-active-module')?.addEventListener('click', () => handleSaveActiveModule());

  // Daily News Composer Events
  $('composer-news-title')?.addEventListener('input', (e) => {
    const headline = e.target.value.trim();
    const slugEl = $('composer-news-slug');
    if (slugEl && !slugEl.dataset.manuallyEdited) {
      slugEl.value = generateSlug(headline);
    }
  });

  $('composer-news-slug')?.addEventListener('input', (e) => {
    e.target.dataset.manuallyEdited = e.target.value.trim() ? 'true' : '';
  });

  $('composer-news-cover-url')?.addEventListener('input', (e) => {
    setImagePreview($('composer-news-cover-preview'), e.target.value);
  });

  $('hero-banner-url')?.addEventListener('input', (e) => {
    setImagePreview($('hero-banner-preview'), e.target.value);
  });

  $('btn-news-autofill-seo')?.addEventListener('click', () => {
    const headline = $('composer-news-title')?.value.trim() || '';
    const summary = $('composer-news-summary')?.value.trim() || '';
    const brandName = currentConfig.brand?.name || 'Official';
    if (!headline) {
      showToast('Enter a News Headline first to auto-generate SEO Meta tags.', 'error');
      return;
    }
    setVal('composer-news-slug', generateSlug(headline));
    setVal('composer-news-meta-title', `${headline} | ${brandName} News`);
    setVal(
      'composer-news-meta-desc',
      summary || `Read the official ${brandName} daily news update: ${headline}.`
    );
    showToast('Auto-filled Slug, Meta Title & Meta Description!', 'success');
  });

  $('btn-toggle-composer-preview')?.addEventListener('click', () => {
    const preview = $('composer-live-preview');
    if (!preview) return;
    preview.innerHTML = $('composer-news-html')?.value || '';
    preview.classList.toggle('visible');
  });

  $('composer-news-html')?.addEventListener('input', (e) => {
    const preview = $('composer-live-preview');
    if (preview && preview.classList.contains('visible')) {
      preview.innerHTML = e.target.value;
    }
  });

  document.querySelectorAll('[data-composer-snippet]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-composer-snippet');
      const textarea = $('composer-news-html');
      if (!textarea) return;
      pushUndoHistory('composer-news-html', textarea.value);
      const snippet = getHtmlComponentSnippet(type);
      textarea.value = `${textarea.value}${snippet}`;
      const preview = $('composer-live-preview');
      if (preview) preview.innerHTML = textarea.value;
    });
  });

  $('btn-publish-single-news')?.addEventListener('click', handlePublishComposerNews);
  $('btn-clear-news-composer')?.addEventListener('click', () => {
    const slugEl = $('composer-news-slug');
    if (slugEl) slugEl.dataset.manuallyEdited = '';
    resetNewsComposer();
    showToast('Composer cleared for a new post');
  });

  // Generate New SHA-256 Checksum Button
  $('btn-gen-sha256')?.addEventListener('click', () => {
    const chars = '0123456789abcdef';
    let hash = '';
    for (let i = 0; i < 64; i++) {
      hash += chars[Math.floor(Math.random() * chars.length)];
    }
    setVal('specs-sha256', hash);
    markDirty('Generated new SHA-256 hash', 'packageSpecs');
    showToast('Generated new 64-character SHA-256 hash', 'success');
  });

  // Add Custom Spec Row
  $('btn-add-spec-row')?.addEventListener('click', () => {
    if (!Array.isArray(currentConfig.packageSpecs.customRows)) {
      currentConfig.packageSpecs.customRows = [];
    }
    currentConfig.packageSpecs.customRows.push({
      label: 'Architecture',
      value: 'ARM64-v8a / Universal'
    });
    renderCustomSpecsRows();
    markDirty('Added custom specification row', 'packageSpecs');
  });

  // Add Blank Section (Auto-expands & focuses new card for smartphone ergonomics)
  $('btn-add-section')?.addEventListener('click', () => {
    const num = (currentConfig.sections?.length || 0) + 1;
    const brandName = currentConfig.brand?.name || 'Brand';
    currentConfig.sections.push({
      id: `sec-${Date.now()}`,
      heading: `New Content Section ${num}`,
      slug: `content-section-${num}`,
      visible: true,
      badgeText: '',
      metaTitle: `New Content Section ${num} | ${brandName}`,
      metaDescription: `Detailed overview of section ${num} on ${brandName}.`,
      imageUrl: '',
      imageAlt: '',
      imageCaption: '',
      imagePosition: 'none',
      ctaLabel: '',
      ctaUrl: '',
      htmlContent: `<p>Write your plain editorial content for Section ${num} here.</p>`
    });
    openSectionIndex = currentConfig.sections.length - 1;
    renderSectionsList();
    refreshOverviewAndSeoAudit();
    markDirty('Added new content section', 'sections');
    showToast('Added new content section — ready to edit');
    setTimeout(() => {
      const cards = document.querySelectorAll('#sections-list .item-card');
      const lastCard = cards[cards.length - 1];
      if (lastCard) {
        lastCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        lastCard.querySelector('input[data-key="heading"]')?.focus();
      }
    }, 60);
  });

  // 1-Click Section Templates
  document.querySelectorAll('[data-section-template]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tpl = btn.getAttribute('data-section-template');
      const brandName = currentConfig.brand?.name || 'Website';
      const ver = currentConfig.packageSpecs?.version || 'Latest Release';
      let newSec = null;

      if (tpl === 'features') {
        newSec = {
          id: `sec-${Date.now()}`,
          heading: `${brandName} Core Capabilities & Architecture`,
          slug: `core-capabilities-${Date.now().toString(36).slice(-3)}`,
          visible: true,
          badgeText: 'Core Capabilities',
          metaTitle: `${brandName} Core Capabilities & Architecture`,
          metaDescription: `Explore the core engineering features, edge caching architecture, and verified security standards of ${brandName}.`,
          imageUrl: '',
          imageAlt: '',
          imageCaption: '',
          imagePosition: 'none',
          ctaLabel: '',
          ctaUrl: '',
          htmlContent: `<p>${brandName} delivers deterministic runtime performance with zero background telemetry and strict cryptographic package verification.</p>\n<div class="cms-feature-grid"><div class="cms-feature-item"><strong>Zero-Latency Edge Delivery</strong><p>Pre-compiled static assets and multi-region mirrors ensure sub-50ms response times globally.</p></div><div class="cms-feature-item"><strong>SHA-256 Signature Verification</strong><p>Every release binary is validated against its published SHA-256 cryptographic digest before dispatch.</p></div></div>`
        };
      } else if (tpl === 'install') {
        newSec = {
          id: `sec-${Date.now()}`,
          heading: `How to Install & Verify ${brandName} (${ver})`,
          slug: `installation-guide-${Date.now().toString(36).slice(-3)}`,
          visible: true,
          badgeText: 'Installation Guide',
          metaTitle: `How to Install & Verify ${brandName} ${ver}`,
          metaDescription: `Step-by-step installation and SHA-256 verification instructions for ${brandName} ${ver} on Android and iOS.`,
          imageUrl: '',
          imageAlt: '',
          imageCaption: '',
          imagePosition: 'none',
          ctaLabel: 'Proceed to Verified Download',
          ctaUrl: '/moreinfo',
          htmlContent: `<p>Follow these three steps to install and verify the official ${brandName} package on your device:</p>\n<ol><li><strong>Verify System Compatibility:</strong> Confirm your device meets the minimum OS requirements listed in the Technical Specifications table.</li><li><strong>Complete Security Clearance:</strong> Click the primary download button to pass automated human verification and retrieve the signed build.</li><li><strong>Confirm SHA-256 Checksum:</strong> Optional—compare the downloaded file digest with the published 64-character SHA-256 hash.</li></ol>`
        };
      } else if (tpl === 'changelog') {
        newSec = {
          id: `sec-${Date.now()}`,
          heading: `${brandName} ${ver} Release Changelog`,
          slug: `release-changelog-${Date.now().toString(36).slice(-3)}`,
          visible: true,
          badgeText: 'Release Notes',
          metaTitle: `${brandName} ${ver} Release Changelog & Patch Notes`,
          metaDescription: `Complete version history, security patches, and performance improvements in ${brandName} ${ver}.`,
          imageUrl: '',
          imageAlt: '',
          imageCaption: '',
          imagePosition: 'none',
          ctaLabel: '',
          ctaUrl: '',
          htmlContent: `<p>Summary of engineering updates and stability improvements introduced in recent ${brandName} builds:</p>\n<table><tbody><tr><th>Build Version</th><td><strong>${ver} (Stable)</strong> — Upgraded edge CDN routing, reduced cold-start memory footprint by 18%, and updated TLS cipher suites.</td></tr><tr><th>Previous Build</th><td><strong>v4.7.9</strong> — Added hardware-backed checksum verification and improved mobile viewport rendering.</td></tr></tbody></table>`
        };
      } else if (tpl === 'proscons') {
        newSec = {
          id: `sec-${Date.now()}`,
          heading: `Why Choose ${brandName} (${ver}) — Verification Highlights`,
          slug: `verification-highlights-${Date.now().toString(36).slice(-3)}`,
          visible: true,
          badgeText: 'Verified Highlights',
          metaTitle: `Why Choose ${brandName} ${ver} | Verification Highlights`,
          metaDescription: `Independent advantages, security checks, and hardware compatibility highlights for ${brandName}.`,
          imageUrl: '',
          imageAlt: '',
          imageCaption: '',
          imagePosition: 'none',
          ctaLabel: 'View Package Specifications',
          ctaUrl: '/#technical-specifications',
          htmlContent: `<p>Key highlights audited before publishing ${brandName} ${ver} to our portal:</p>\n<ul><li>✓ <strong>Cryptographic SHA-256 Digest:</strong> Published openly for instant verification.</li><li>✓ <strong>Zero Background Telemetry:</strong> Clean package delivery without tracking wrappers.</li><li>✓ <strong>Sub-Second Edge Speed:</strong> Lightweight static pages optimized for mobile connections.</li></ul>`
        };
      }

      if (newSec) {
        currentConfig.sections.push(newSec);
        openSectionIndex = currentConfig.sections.length - 1;
        renderSectionsList();
        refreshOverviewAndSeoAudit();
        markDirty(`Added "${newSec.heading}" section template`, 'sections');
        showToast(`Added "${newSec.heading}" section template!`, 'success');
      }
    });
  });

  // 1-Click Daily News Composer Templates
  document.querySelectorAll('[data-news-template]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tpl = btn.getAttribute('data-news-template');
      const brandName = currentConfig.brand?.name || 'Website';
      const ver = currentConfig.packageSpecs?.version || 'Latest Release';
      const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

      if (tpl === 'release') {
        const title = `${brandName} ${ver} Official Release: Faster Edge Mirrors & Stability Improvements`;
        setVal('composer-news-title', title);
        setVal('composer-news-slug', generateSlug(title));
        setVal('composer-news-category', 'Release Update');
        setVal('composer-news-date', today);
        setVal('composer-news-author', `${brandName} Engineering`);
        setVal('composer-news-readtime', '2 min read');
        setVal('composer-news-summary', `The official ${brandName} ${ver} build is now live across all edge mirrors with faster package verification and reduced memory usage.`);
        setVal('composer-news-html', `<p>We are pleased to announce the immediate availability of <strong>${brandName} ${ver}</strong>. This release focuses on edge mirror throughput, faster startup times, and verified cryptographic integrity.</p>\n<h3>Key Highlights in ${ver}</h3>\n<ul><li><strong>Multi-Region CDN Routing:</strong> Download latency reduced by 28% across global edge nodes.</li><li><strong>Memory Optimization:</strong> Cold-start memory footprint reduced on mobile devices.</li><li><strong>Verified SHA-256 Signature:</strong> Passed 72/72 independent security scan engines with zero warnings.</li></ul>`);
        setVal('composer-news-meta-title', `${title} | ${brandName}`);
        setVal('composer-news-meta-desc', `Download and read the official release notes for ${brandName} ${ver}, featuring faster edge mirrors and verified SHA-256 package security.`);
      } else if (tpl === 'security') {
        const title = `${brandName} Security Advisory: SHA-256 Package Signature & Mirror Verification`;
        setVal('composer-news-title', title);
        setVal('composer-news-slug', generateSlug(title));
        setVal('composer-news-category', 'Security Advisory');
        setVal('composer-news-date', today);
        setVal('composer-news-author', `${brandName} Security Team`);
        setVal('composer-news-readtime', '3 min read');
        setVal('composer-news-summary', `How our automated 7-gate verification pipeline and SHA-256 checksums protect every ${brandName} package download.`);
        setVal('composer-news-html', `<p>Every official <strong>${brandName}</strong> package is signed and verified prior to publication on our release mirrors.</p>\n<div class="cms-callout-box"><strong>Security Verification Notice:</strong> Always verify that the SHA-256 digest of your downloaded package matches the checksum published in our Technical Specifications table.</div>\n<h3>How We Protect Release Integrity</h3>\n<ul><li><strong>Automated Multi-Engine Scanning:</strong> Every build is audited across 72 independent security engines.</li><li><strong>Encrypted Mirror Dispatch:</strong> Direct download mirrors are protected behind hardware-backed human clearance.</li></ul>`);
        setVal('composer-news-meta-title', `${title} | ${brandName}`);
        setVal('composer-news-meta-desc', `Official security advisory detailing SHA-256 checksum verification and mirror protection for ${brandName}.`);
      } else if (tpl === 'guide') {
        const title = `Complete Guide: Optimizing ${brandName} Performance on Android & iOS`;
        setVal('composer-news-title', title);
        setVal('composer-news-slug', generateSlug(title));
        setVal('composer-news-category', 'Feature Guide');
        setVal('composer-news-date', today);
        setVal('composer-news-author', `${brandName} Editorial`);
        setVal('composer-news-readtime', '3 min read');
        setVal('composer-news-summary', `Learn how to configure ${brandName} for optimal battery efficiency, low-latency connectivity, and clean storage management.`);
        setVal('composer-news-html', `<p>Getting the best performance out of <strong>${brandName}</strong> takes less than two minutes with these recommended configuration steps.</p>\n<h3>Recommended Configuration Steps</h3>\n<ol><li><strong>Keep Your Build Updated:</strong> Ensure you are running the latest stable version (${ver}) from our official portal.</li><li><strong>Enable Hardware Acceleration:</strong> Allow native rendering in device settings for smooth 60fps responsiveness.</li><li><strong>Verify Storage Headroom:</strong> Maintain at least 150 MB of free local storage for temporary package caching.</li></ol>`);
        setVal('composer-news-meta-title', `${title} | ${brandName}`);
        setVal('composer-news-meta-desc', `Step-by-step configuration guide to maximize ${brandName} speed and battery efficiency on Android and iOS devices.`);
      }

      const preview = $('composer-live-preview');
      if (preview && preview.classList.contains('visible')) {
        preview.innerHTML = $('composer-news-html')?.value || '';
      }
      showToast('Loaded 1-click news template into composer!', 'success');
    });
  });

  // Add FAQ (Auto-expands & focuses new FAQ card)
  $('btn-add-faq')?.addEventListener('click', () => {
    const num = (currentConfig.faqsSection?.items?.length || 0) + 1;
    currentConfig.faqsSection.items.push({
      id: `faq-${Date.now()}`,
      question: `Frequently Asked Question #${num}?`,
      answer: `Clear, direct answer to question #${num} for visitors and Google FAQPage schema.`
    });
    openFaqIndex = currentConfig.faqsSection.items.length - 1;
    renderFaqsList();
    refreshOverviewAndSeoAudit();
    markDirty('Added new FAQ question', 'faqsSection');
    showToast('Added new FAQ question — ready to edit');
    setTimeout(() => {
      const cards = document.querySelectorAll('#faqs-list .item-card');
      const lastCard = cards[cards.length - 1];
      if (lastCard) {
        lastCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        lastCard.querySelector('input[data-key="question"]')?.focus();
      }
    }, 60);
  });

  // Add Standalone Footer Page
  $('btn-add-page')?.addEventListener('click', () => {
    const num = (currentConfig.pages?.length || 0) + 1;
    const brandName = currentConfig.brand?.name || 'Brand';
    currentConfig.pages.push({
      id: `page-${Date.now()}`,
      label: `Custom Legal Page ${num}`,
      slug: `custom-legal-page-${num}`,
      showInFooter: true,
      showInHeader: false,
      openInNewTab: false,
      h1: `Custom Legal Page ${num}`,
      subtitle: `Official ${brandName} Compliance Document`,
      bannerImageUrl: '',
      bannerImageAlt: '',
      lastUpdated: 'November 2026',
      metaTitle: `Custom Legal Page ${num} | ${brandName}`,
      metaDescription: `Official Custom Legal Page ${num} for ${brandName}.`,
      htmlContent: `<h2>1. Overview</h2>\n<p>Enter the full content for this standalone page here.</p>`
    });
    activeLegalPageIndex = currentConfig.pages.length - 1;
    renderPagesList();
    refreshOverviewAndSeoAudit();
    markDirty('Added standalone legal page', 'pages');
    showToast('Added new standalone legal page');
  });

  // Auto-Generate All Legal Pages from Brand & Support Email
  $('btn-autogen-legal')?.addEventListener('click', () => {
    collectScalarFields();
    const b = currentConfig.brand.name;
    const c = currentConfig.domainConfig?.primaryDomain || currentConfig.seo.canonicalUrl;
    const e = currentConfig.brand.contactEmail;

    currentConfig.pages = currentConfig.pages.map((pg) => {
      if (pg.slug.includes('privacy')) {
        return {
          ...pg,
          metaTitle: `Privacy Policy | ${b}`,
          htmlContent: generateSmartLegalHtml('privacy', b, c, e)
        };
      }
      if (pg.slug.includes('terms')) {
        return {
          ...pg,
          metaTitle: `Terms and Conditions | ${b}`,
          htmlContent: generateSmartLegalHtml('terms', b, c, e)
        };
      }
      if (pg.slug.includes('dmca')) {
        return {
          ...pg,
          metaTitle: `DMCA Disclaimer | ${b}`,
          htmlContent: generateSmartLegalHtml('dmca', b, c, e)
        };
      }
      if (pg.slug.includes('contact')) {
        return {
          ...pg,
          metaTitle: `Contact Support | ${b}`,
          htmlContent: generateSmartLegalHtml('contact', b, c, e)
        };
      }
      return pg;
    });

    renderPagesList();
    markDirty('Updated all legal pages with brand & email', 'pages');
    showToast(`Updated all legal pages with ${b} & ${e}`, 'success');
  });

  // Add Header Menu Link
  $('btn-add-menu-link')?.addEventListener('click', () => {
    const brandName = currentConfig.brand?.name || 'Brand';
    currentConfig.navigation.headerLinks.push({
      id: `nav-${Date.now()}`,
      label: 'New Menu Link',
      url: '#core-features',
      metaTitle: `New Menu Link | ${brandName}`,
      metaDescription: `Navigate to section on ${brandName}.`
    });
    renderMenuLinksList();
    markDirty('Added header menu link', 'navigation');
    showToast('Added new header menu link');
  });

  // Add Footer Quick Link
  $('btn-add-footer-quick-link')?.addEventListener('click', () => {
    if (!Array.isArray(currentConfig.navigation.footerQuickLinks)) {
      currentConfig.navigation.footerQuickLinks = [];
    }
    currentConfig.navigation.footerQuickLinks.push({
      id: `fql-${Date.now()}`,
      label: 'Official Release Notes',
      url: '/news',
      openInNewTab: false
    });
    renderFooterQuickLinksList();
    markDirty('Added footer quick link', 'navigation');
    showToast('Added custom footer quick link');
  });

  // Add Smart Contextual Internal Link Rule
  $('btn-add-internal-link')?.addEventListener('click', () => {
    if (!Array.isArray(currentConfig.domainConfig.internalLinks)) {
      currentConfig.domainConfig.internalLinks = [];
    }
    currentConfig.domainConfig.internalLinks.push({
      id: `il-${Date.now()}`,
      keyword: 'official package',
      targetUrl: '/#technical-specifications',
      title: 'View Official Package Specifications'
    });
    renderInternalLinksList();
    refreshOverviewAndSeoAudit();
    markDirty('Added smart internal link rule', 'domainConfig');
    showToast('Added smart internal link rule');
  });

  // 1-Tap Color Theme Presets
  document.querySelectorAll('[data-theme-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = btn.getAttribute('data-theme-preset');
      if (preset) applyColorThemePreset(preset);
    });
  });

  // Color Choice Circular Dots + Native Custom Color Picker Two-Way Binding
  let colorRafId = 0;
  document.querySelectorAll('[data-color-choice-for]').forEach((dot) => {
    dot.addEventListener('click', () => {
      const targetId = dot.getAttribute('data-color-choice-for');
      const hex = (dot.getAttribute('data-color') || '').trim().toUpperCase();
      const hiddenEl = targetId ? $(targetId) : null;
      if (!hiddenEl || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return;
      hiddenEl.value = hex;
      if (targetId === 'brand-color' && $('brand-theme-color')) {
        $('brand-theme-color').value = hex;
      }
      syncColorPickersFromTextInputs();
      if (targetId !== 'qc-accent-color') {
        const modKey = inferModuleKeyFromElement(hiddenEl);
        collectScalarFields();
        markDirty('Selected new color — tap Publish or Save Section to persist', modKey);
      }
    });
  });

  document.querySelectorAll('[data-color-sync]').forEach((picker) => {
    picker.addEventListener('input', (e) => {
      const targetId = picker.getAttribute('data-color-sync');
      const val = e.target.value.toUpperCase();
      if (colorRafId) cancelAnimationFrame(colorRafId);
      colorRafId = requestAnimationFrame(() => {
        const hiddenEl = targetId ? $(targetId) : null;
        if (hiddenEl) {
          hiddenEl.value = val;
          if (targetId === 'brand-color' && $('brand-theme-color')) {
            $('brand-theme-color').value = val;
          }
          syncColorPickersFromTextInputs();
          if (targetId !== 'qc-accent-color') {
            const modKey = inferModuleKeyFromElement(hiddenEl);
            markDirty('Updated custom color — tap Publish or Save Section to persist', modKey);
          }
        }
      });
    });
  });

  // Live Theme Preview updates when changing radius or brand name
  ['brand-name', 'ui-card-radius'].forEach((id) => {
    $(id)?.addEventListener('input', () => {
      if (colorRafId) cancelAnimationFrame(colorRafId);
      colorRafId = requestAnimationFrame(() => {
        updateLiveThemePreviewCard();
      });
    });
  });

  // Show/Hide Toggle for Firebase API Key inside Workspace
  $('btn-toggle-fb-apikey')?.addEventListener('click', () => {
    const inp = $('fb-api-key');
    const btn = $('btn-toggle-fb-apikey');
    if (!inp || !btn) return;
    const isPass = inp.type === 'password';
    inp.type = isPass ? 'text' : 'password';
    btn.textContent = isPass ? 'Hide' : 'Show';
  });

  // Parse Firebase SDK Snippet or JSON Helper
  const applyParsedFirebaseSnippet = (rawText) => {
    const parsed = parseFirebaseConfigSnippet(rawText);
    if (!parsed) return false;
    setVal('fb-api-key', parsed.apiKey);
    setVal('fb-project-id', parsed.projectId);
    setVal('fb-auth-domain', parsed.authDomain);
    setVal('fb-storage-bucket', parsed.storageBucket);
    setVal('fb-messaging-sender-id', parsed.messagingSenderId);
    setVal('fb-app-id', parsed.appId);
    setVal('fb-database-id', parsed.databaseId || '(default)');
    return true;
  };

  const readFirebaseFormFields = () => {
    return normalizeFirebaseClientConfig({
      apiKey: $('fb-api-key')?.value || '',
      projectId: $('fb-project-id')?.value || '',
      authDomain: $('fb-auth-domain')?.value || '',
      storageBucket: $('fb-storage-bucket')?.value || '',
      messagingSenderId: $('fb-messaging-sender-id')?.value || '',
      appId: $('fb-app-id')?.value || '',
      databaseId: $('fb-database-id')?.value || '(default)'
    });
  };

  const showFirebaseFeedback = (ok, title, details = '') => {
    const box = $('fb-test-feedback');
    if (!box) return;
    box.style.display = 'block';
    box.innerHTML = `
      <div style="font-weight:700; color:${ok ? '#065f46' : '#b91c1c'};">${escapeHtml(title)}</div>
      ${details ? `<div style="font-size:0.78rem; color:var(--text-sub); margin-top:4px; line-height:1.45;">${escapeHtml(details)}</div>` : ''}
    `;
  };

  $('btn-parse-fb-snippet')?.addEventListener('click', () => {
    const raw = $('fb-snippet-input')?.value || '';
    if (!raw.trim()) {
      showToast('Paste your Firebase config snippet or JSON object first.', 'error');
      return;
    }
    if (!applyParsedFirebaseSnippet(raw)) {
      showToast('Could not detect Firebase keys. Ensure apiKey and projectId are included.', 'error');
      return;
    }
    showFirebaseFeedback(
      true,
      '✓ Parsed All Firebase Config Fields',
      'Click "Save & Connect Firebase" or "Test Firestore Connection" to verify live Firestore sync.'
    );
    showToast('Auto-filled Firebase fields from snippet!', 'success');
  });

  // Auto-parse if admin accidentally pastes full snippet/JSON into the API Key input
  $('fb-api-key')?.addEventListener('paste', (e) => {
    const pasted = e.clipboardData?.getData('text') || '';
    if (pasted.includes('{') && pasted.includes('projectId')) {
      e.preventDefault();
      if (applyParsedFirebaseSnippet(pasted)) {
        showToast('Detected Firebase SDK snippet and auto-filled all fields!', 'success');
      }
    }
  });

  // Save Firebase Runtime Keys + Test Connection + Sync Live Document
  $('btn-save-firebase')?.addEventListener('click', async () => {
    const rawApiKey = $('fb-api-key')?.value || '';
    if (rawApiKey.includes('{') && rawApiKey.includes('projectId')) {
      applyParsedFirebaseSnippet(rawApiKey);
    }
    const fb = readFirebaseFormFields();
    const activeFb = getActiveFirebaseConfig();
    if (!fb.apiKey && activeFb?.hasEnvApiKey && fb.projectId) {
      fb.hasEnvApiKey = true;
    }
    if (!isRealFirebaseConfig(fb)) {
      showFirebaseFeedback(
        false,
        'Invalid Firebase Credentials',
        'Please provide a real FIREBASE_API_KEY (AIza...) and FIREBASE_PROJECT_ID.'
      );
      showToast('Valid FIREBASE_API_KEY and FIREBASE_PROJECT_ID are required.', 'error');
      return;
    }

    const btn = $('btn-save-firebase');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Connecting...';
    }

    try {
      saveActiveFirebaseConfig(fb);
      const connectRes = await fetch('/api/firebase/connect', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Admin-CSRF': '1'
        },
        body: JSON.stringify(fb)
      }).catch(() => null);
      if (connectRes?.status === 401) {
        notifyAdminUnauthorized('Session expired or unauthorized. Please sign in again.');
        return;
      }

      const testRes = await testFirebaseConnectionRemote(fb.apiKey ? fb : null);
      populateAllFields();

      if (testRes.success) {
        if (testRes.cloudConfig && (testRes.cloudConfig.updatedAt || 0) > (currentConfig.updatedAt || 0)) {
          currentConfig = mergeSiteConfig(testRes.cloudConfig, EMPTY_ADMIN_CONFIG);
          populateAllFields();
        }
        showFirebaseFeedback(
          true,
          `✓ Connected & Saved: ${fb.projectId}`,
          testRes.message || 'Live Cloud Firestore is active for Admin Studio.'
        );
        showToast(`Firebase connected (${fb.projectId})`, 'success');
      } else {
        showFirebaseFeedback(
          false,
          `Saved Keys for ${fb.projectId}, Connection Notice:`,
          `${testRes.error || 'Could not reach Firestore.'} (Check Firestore Rules or verify Cloud Firestore is enabled in Firebase Console.)`
        );
        showToast(testRes.error || 'Firebase saved with connection warning', 'error');
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Save & Connect Firebase';
      }
    }
  });

  // Test Firestore Connection without overwriting saved runtime keys
  $('btn-test-firebase')?.addEventListener('click', async () => {
    const fb = readFirebaseFormFields();
    const btn = $('btn-test-firebase');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Testing...';
    }
    try {
      const testRes = await testFirebaseConnectionRemote(fb.apiKey && fb.projectId ? fb : null);
      if (testRes.success) {
        showFirebaseFeedback(
          true,
          `✓ Firestore Connected (${testRes.projectId})`,
          testRes.message
        );
        showToast('Firestore connection verified!', 'success');
      } else {
        showFirebaseFeedback(
          false,
          'Firestore Connection Check Failed',
          testRes.error || 'Verify your API Key, Project ID, and Firestore Security Rules.'
        );
        showToast(testRes.error || 'Firestore connection failed', 'error');
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Test Firestore Connection';
      }
    }
  });

  // Revert to .env / Server Firebase Defaults
  $('btn-clear-firebase')?.addEventListener('click', async () => {
    clearActiveFirebaseConfig();
    const clearRes = await fetch('/api/firebase/connect', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Admin-CSRF': '1'
      },
      body: JSON.stringify({ clear: true })
    }).catch(() => null);
    if (clearRes?.status === 401) {
      notifyAdminUnauthorized('Session expired or unauthorized. Please sign in again.');
      return;
    }
    setVal('fb-snippet-input', '');
    populateAllFields();
    showFirebaseFeedback(
      true,
      'Reverted to .env / Server Defaults',
      'Cleared runtime Firebase override.'
    );
    showToast('Reverted Firebase settings to .env defaults');
  });

  // Export Master Site JSON Backup (Secrets already sanitized)
  $('btn-export-json')?.addEventListener('click', () => {
    collectScalarFields();
    const blob = new Blob([JSON.stringify(currentConfig, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${generateSlug(currentConfig.brand.name || 'master-cms')}-backup.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported full site JSON backup');
  });

  // Import Master Site JSON Backup
  $('input-import-json')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      currentConfig = mergeSiteConfig(parsed, EMPTY_ADMIN_CONFIG);
      populateAllFields();
      markDirty('Imported JSON snapshot — click "Publish Edited Modules" to compile & go live');
      showToast('Imported JSON configuration successfully!', 'success');
    } catch {
      showToast('Invalid JSON backup file.', 'error');
    }
  });

  // Clear Admin Data (Empty Live Firebase State)
  $('btn-reset-defaults')?.addEventListener('click', async () => {
    const btn = $('btn-reset-defaults');
    const origText = btn?.textContent || 'Clear All Admin Content (Empty State)';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Clearing...';
    }
    try {
      const fresh = await resetSiteConfigRemote();
      currentConfig = mergeSiteConfig(fresh, EMPTY_ADMIN_CONFIG);
      openSectionIndex = -1;
      openNewsIndex = -1;
      openFaqIndex = -1;
      populateAllFields();
      markClean('Cleared all Admin content to clean Empty Firebase State');
      showToast('Cleared Admin workspace to empty Firebase state', 'success');
    } catch (err) {
      showToast(err?.message || 'Failed clearing Admin content.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = origText;
      }
    }
  });
}

let authEventsBound = false;
function initAuthEvents() {
  if (authEventsBound) return;
  authEventsBound = true;

  // Global Device Image File Picker Change Handler
  $('global-image-file-picker')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file || !pendingUploadCallback) return;

    showToast('Uploading image...', 'default');
    const result = await uploadImageRemote(file);
    if (result.success && result.url) {
      const uploadedMod = pendingUploadCallback(result.url);
      markDirty('Image uploaded — tap Publish or Save Section to persist', isCmsModuleKey(uploadedMod) ? uploadedMod : getPrimaryModuleForActiveTab());
      showToast('Image uploaded and linked!', 'success');
    } else {
      showToast(result.error || 'Image upload failed.', 'error');
    }
    pendingUploadCallback = null;
  });

  // Auth mode tabs (supports both data-auth-mode buttons and legacy IDs)
  document.querySelectorAll('.auth-tab[data-auth-mode]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const mode = tab.getAttribute('data-auth-mode') || 'credentials';
      setAuthMode(mode);
    });
  });
  $('tab-auth-credentials')?.addEventListener('click', () => setAuthMode('credentials'));
  $('tab-auth-apikey')?.addEventListener('click', () => setAuthMode('apikey'));

  const loginFormEl = $('login-form') || $('auth-form');
  loginFormEl?.addEventListener('submit', handleLoginSubmit);

  // Show/Hide Password & API Key Toggles on Login Screen
  $('btn-toggle-login-pass')?.addEventListener('click', () => {
    const inp = $('login-password');
    const btn = $('btn-toggle-login-pass');
    if (!inp || !btn) return;
    const isPass = inp.type === 'password';
    inp.type = isPass ? 'text' : 'password';
    btn.textContent = isPass ? 'Hide' : 'Show';
    btn.setAttribute('aria-pressed', isPass ? 'true' : 'false');
  });

  $('btn-toggle-login-apikey')?.addEventListener('click', () => {
    const inp = $('login-apikey');
    const btn = $('btn-toggle-login-apikey');
    if (!inp || !btn) return;
    const isPass = inp.type === 'password';
    inp.type = isPass ? 'text' : 'password';
    btn.textContent = isPass ? 'Hide' : 'Show';
    btn.setAttribute('aria-pressed', isPass ? 'true' : 'false');
  });

  // Delegated Clicks (Inline Module Save, Upload Buttons, Image Modal, Visual Block Modal, Legal Page Selector, Accordion, Move, Delete, Snippets)
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    // 0. Inline Save Module Button inside Section, News, or FAQ cards (`data-inline-save-module`)
    const inlineSaveBtn = target.closest('[data-inline-save-module]');
    if (inlineSaveBtn) {
      e.preventDefault();
      e.stopPropagation();
      const modKey = inlineSaveBtn.getAttribute('data-inline-save-module');
      if (modKey) handleSaveActiveModule(modKey);
      return;
    }

    // 0B. Delegated Jump-to-Tab & Subcard Anchor Routing
    const jumpBtn = target.closest('[data-jump-tab]');
    if (jumpBtn) {
      e.preventDefault();
      const targetTab = jumpBtn.getAttribute('data-jump-tab');
      const subtab = jumpBtn.getAttribute('data-jump-subtab') || '';
      if (targetTab) {
        switchTab(targetTab, subtab);
        if (jumpBtn.id === 'btn-quick-jump-logs') {
          setTimeout(() => {
            $('gh-deploy-history-list')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 120);
        }
      }
      return;
    }

    // 1. Device Image Upload Button for Scalar Input (`data-upload-target`)
    const scalarUploadBtn = target.closest('[data-upload-target]');
    if (scalarUploadBtn) {
      e.preventDefault();
      const inputId = scalarUploadBtn.getAttribute('data-upload-target');
      const previewId = scalarUploadBtn.getAttribute('data-preview-target');
      triggerDeviceImageUpload((uploadedUrl) => {
        if (inputId && $(inputId)) {
          $(inputId).value = uploadedUrl;
          refreshBrandThumbs();
        }
        if (previewId && $(previewId)) {
          setImagePreview($(previewId), uploadedUrl);
        }
        return inferModuleKeyFromElement(inputId ? $(inputId) : null);
      });
      return;
    }

    // 2. Device Image Upload Button for Collection Item (`data-upload-collection`)
    const collUploadBtn = target.closest('[data-upload-collection]');
    if (collUploadBtn) {
      e.preventDefault();
      const collection = collUploadBtn.getAttribute('data-upload-collection');
      const index = Number(collUploadBtn.getAttribute('data-index'));
      const key = collUploadBtn.getAttribute('data-key');
      triggerDeviceImageUpload((uploadedUrl) => {
        const list = getCollectionRef(collection);
        if (list && list[index]) {
          list[index][key] = uploadedUrl;
          rerenderCollection(collection);
        }
        return inferModuleKeyFromElement({ dataset: { collection } });
      });
      return;
    }

    // 3. Open Insert Image Modal for Scalar Textarea (`data-open-image-modal`)
    const openScalarModalBtn = target.closest('[data-open-image-modal]');
    if (openScalarModalBtn) {
      e.preventDefault();
      const targetId = openScalarModalBtn.getAttribute('data-open-image-modal');
      openInsertImageModal({ type: 'id', id: targetId });
      return;
    }

    // 4. Open Insert Image Modal for Collection Item HTML (`data-open-collection-image-modal`)
    const openCollModalBtn = target.closest('[data-open-collection-image-modal]');
    if (openCollModalBtn) {
      e.preventDefault();
      openInsertImageModal({
        type: 'collection',
        collection: openCollModalBtn.getAttribute('data-open-collection-image-modal'),
        index: Number(openCollModalBtn.getAttribute('data-index')),
        key: openCollModalBtn.getAttribute('data-key'),
        textareaId: openCollModalBtn.getAttribute('data-textarea'),
        previewId: openCollModalBtn.getAttribute('data-preview')
      });
      return;
    }

    // 5. Open Visual Block Builder Modal for Scalar Textarea (`data-open-visual-block-modal`)
    const openScalarVbBtn = target.closest('[data-open-visual-block-modal]');
    if (openScalarVbBtn) {
      e.preventDefault();
      const targetId = openScalarVbBtn.getAttribute('data-open-visual-block-modal');
      openVisualBlockModal({ type: 'id', id: targetId });
      return;
    }

    // 6. Open Visual Block Builder Modal for Collection Item (`data-open-collection-visual-modal`)
    const openCollVbBtn = target.closest('[data-open-collection-visual-modal]');
    if (openCollVbBtn) {
      e.preventDefault();
      openVisualBlockModal({
        type: 'collection',
        collection: openCollVbBtn.getAttribute('data-open-collection-visual-modal'),
        index: Number(openCollVbBtn.getAttribute('data-index')),
        key: openCollVbBtn.getAttribute('data-key'),
        textareaId: openCollVbBtn.getAttribute('data-textarea'),
        previewId: openCollVbBtn.getAttribute('data-preview')
      });
      return;
    }

    // 6B. Open Link Insertion Modal (Scalar or Collection) + Undo + Scalar Snippets
    const openScalarLinkBtn = target.closest('[data-open-link-modal]');
    if (openScalarLinkBtn) {
      e.preventDefault();
      openInsertLinkModal({ type: 'id', id: openScalarLinkBtn.getAttribute('data-open-link-modal') });
      return;
    }

    const openCollLinkBtn = target.closest('[data-open-collection-link-modal]');
    if (openCollLinkBtn) {
      e.preventDefault();
      openInsertLinkModal({
        type: 'collection',
        collection: openCollLinkBtn.getAttribute('data-open-collection-link-modal'),
        index: Number(openCollLinkBtn.getAttribute('data-index')),
        key: openCollLinkBtn.getAttribute('data-key'),
        textareaId: openCollLinkBtn.getAttribute('data-textarea'),
        previewId: openCollLinkBtn.getAttribute('data-preview')
      });
      return;
    }

    const undoBtn = target.closest('[data-undo-target]');
    if (undoBtn) {
      e.preventDefault();
      undoTextareaEdit(undoBtn.getAttribute('data-undo-target'));
      return;
    }

    const scalarSnippetBtn = target.closest('[data-scalar-snippet]');
    if (scalarSnippetBtn) {
      e.preventDefault();
      const type = scalarSnippetBtn.getAttribute('data-scalar-snippet');
      const targetId = scalarSnippetBtn.getAttribute('data-target');
      const snippet = getHtmlComponentSnippet(type);
      if (targetId && snippet) {
        insertHtmlIntoTarget({ type: 'id', id: targetId }, snippet);
        showToast('Formatted snippet added!', 'success');
      }
      return;
    }

    // 6C. Auto-Slug & Auto-Fill SEO for Collections
    const autoSlugBtn = target.closest('[data-autoslug-collection]');
    if (autoSlugBtn) {
      e.stopPropagation();
      const col = autoSlugBtn.getAttribute('data-autoslug-collection');
      const idx = Number(autoSlugBtn.getAttribute('data-index'));
      const list = getCollectionRef(col);
      if (list && list[idx]) {
        const src = list[idx].heading || list[idx].title || list[idx].label || list[idx].h1 || 'item';
        list[idx].slug = generateSlug(src) || `${col}-${idx + 1}`;
        if (col === 'sections') openSectionIndex = idx;
        if (col === 'news') openNewsIndex = idx;
        rerenderCollection(col);
        syncUrlQuickPickers();
        markDirty(`Generated slug in [${col}]`, inferModuleKeyFromElement({ dataset: { collection: col } }));
        showToast(`Generated slug: ${list[idx].slug}`, 'success');
      }
      return;
    }

    const autoSeoBtn = target.closest('[data-autoseo-collection]');
    if (autoSeoBtn) {
      e.stopPropagation();
      const col = autoSeoBtn.getAttribute('data-autoseo-collection');
      const idx = Number(autoSeoBtn.getAttribute('data-index'));
      const list = getCollectionRef(col);
      const brandName = currentConfig.brand?.name || 'Website';
      if (list && list[idx]) {
        const item = list[idx];
        const title = item.heading || item.title || item.h1 || item.label || brandName;
        item.metaTitle = `${title} | ${brandName}`;
        item.metaDescription =
          item.summary ||
          `${title} — official verified documentation, updates, and resources from ${brandName}.`;
        if (col === 'sections') openSectionIndex = idx;
        if (col === 'news') openNewsIndex = idx;
        rerenderCollection(col);
        markDirty(`Updated SEO meta tags in [${col}]`, inferModuleKeyFromElement({ dataset: { collection: col } }));
        showToast('Auto-filled SEO Meta Title & Description!', 'success');
      }
      return;
    }

    // 7. Reorder Homepage Major Blocks (`data-move-block`)
    const moveBlockBtn = target.closest('[data-move-block]');
    if (moveBlockBtn) {
      e.preventDefault();
      const idx = Number(moveBlockBtn.getAttribute('data-move-block'));
      const dir = Number(moveBlockBtn.getAttribute('data-dir'));
      const order = currentConfig.uiConfig.homepageSectionOrder;
      const targetIdx = idx + dir;
      if (targetIdx >= 0 && targetIdx < order.length) {
        [order[idx], order[targetIdx]] = [order[targetIdx], order[idx]];
        renderHomepageOrderController();
        markDirty('Reordered homepage blocks', 'uiConfig');
      }
      return;
    }

    // 8. Select Legal Page Tab
    const legalTabBtn = target.closest('[data-select-legal-page]');
    if (legalTabBtn) {
      activeLegalPageIndex = Number(legalTabBtn.getAttribute('data-select-legal-page')) || 0;
      renderPagesList();
      return;
    }

    // 9. Load News Article into Top Composer
    const loadComposerBtn = target.closest('[data-load-composer]');
    if (loadComposerBtn) {
      e.stopPropagation();
      const idx = Number(loadComposerBtn.getAttribute('data-load-composer'));
      loadArticleIntoComposer(idx);
      return;
    }

    // 10. Toggle Live Preview Box (Lazy-rendered on open for zero DOM bloat)
    const previewToggleBtn = target.closest('[data-toggle-preview]');
    if (previewToggleBtn) {
      const targetId = previewToggleBtn.getAttribute('data-toggle-preview');
      const box = targetId ? $(targetId) : null;
      if (box) {
        const willShow = !box.classList.contains('visible');
        if (willShow) {
          const sourceTa = document.querySelector(`[data-preview-target="${targetId}"]`);
          if (sourceTa) box.innerHTML = sourceTa.value || '';
        }
        box.classList.toggle('visible', willShow);
      }
      return;
    }

    // 11. Insert HTML Snippet into Section or Legal Page Editor
    const snippetBtn = target.closest('[data-insert-snippet]');
    if (snippetBtn) {
      const type = snippetBtn.getAttribute('data-insert-snippet');
      const targetId = snippetBtn.getAttribute('data-target');
      const collection = snippetBtn.getAttribute('data-collection');
      const index = Number(snippetBtn.getAttribute('data-index'));
      const key = snippetBtn.getAttribute('data-key');
      const textarea = targetId ? $(targetId) : null;
      if (!textarea) return;

      pushUndoHistory(targetId, textarea.value);
      const snippet = getHtmlComponentSnippet(type);
      textarea.value = `${textarea.value}${snippet}`;
      const list = getCollectionRef(collection);
      if (list && list[index] && key) {
        list[index][key] = textarea.value;
      }
      const previewId = textarea.getAttribute('data-preview-target');
      if (previewId && $(previewId)) {
        $(previewId).innerHTML = textarea.value;
      }
      markDirty(`Inserted snippet in [${collection || 'content'}]`, inferModuleKeyFromElement(collection ? { dataset: { collection } } : textarea));
      return;
    }

    // 12. Collection Actions (Move Up/Down, Move Left/Right, Clone, Delete)
    const actionBtn = target.closest('[data-action]');
    if (actionBtn) {
      e.stopPropagation();
      const action = actionBtn.dataset.action;
      const collection = actionBtn.dataset.collection;
      const idx = Number(actionBtn.dataset.index);
      const list = getCollectionRef(collection);
      if (!list || Number.isNaN(idx)) return;
      const colModKey = inferModuleKeyFromElement({ dataset: { collection } });

      if (action === 'delete') {
        list.splice(idx, 1);
        if (collection === 'pages') {
          activeLegalPageIndex = Math.max(0, Math.min(activeLegalPageIndex, list.length - 1));
        }
        if (collection === 'sections') openSectionIndex = -1;
        if (collection === 'news') openNewsIndex = -1;
        if (collection === 'faqs') openFaqIndex = -1;
        rerenderCollection(collection);
        syncUrlQuickPickers();
        markDirty(`Removed item from [${collection}]`, colModKey);
        showToast('Item removed');
      } else if (action === 'clone') {
        const src = list[idx];
        if (!src) return;
        const copy = JSON.parse(JSON.stringify(src));
        const suffix = Date.now().toString(36).slice(-4);
        if (copy.id) copy.id = `${collection}-${Date.now()}`;
        if (copy.heading) copy.heading = `${copy.heading} (Copy)`;
        if (copy.title) copy.title = `${copy.title} (Copy)`;
        if (copy.label && collection !== 'customSpecs') copy.label = `${copy.label} (Copy)`;
        if (copy.question) copy.question = `${copy.question} (Copy)`;
        if (copy.keyword) copy.keyword = `${copy.keyword} copy`;
        if (copy.slug) copy.slug = `${copy.slug}-${suffix}`;
        list.splice(idx + 1, 0, copy);
        if (collection === 'pages') activeLegalPageIndex = idx + 1;
        if (collection === 'sections') openSectionIndex = idx + 1;
        if (collection === 'news') openNewsIndex = idx + 1;
        if (collection === 'faqs') openFaqIndex = idx + 1;
        rerenderCollection(collection);
        syncUrlQuickPickers();
        markDirty(`Cloned item in [${collection}]`, colModKey);
        showToast('Duplicated item cleanly!', 'success');
      } else if ((action === 'move-up' || action === 'move-left') && idx > 0) {
        [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]];
        if (collection === 'pages') activeLegalPageIndex = idx - 1;
        if (collection === 'sections') openSectionIndex = idx - 1;
        if (collection === 'news') openNewsIndex = idx - 1;
        if (collection === 'faqs') openFaqIndex = idx - 1;
        rerenderCollection(collection);
        markDirty(`Reordered [${collection}]`, colModKey);
      } else if ((action === 'move-down' || action === 'move-right') && idx < list.length - 1) {
        [list[idx + 1], list[idx]] = [list[idx], list[idx + 1]];
        if (collection === 'pages') activeLegalPageIndex = idx + 1;
        if (collection === 'sections') openSectionIndex = idx + 1;
        if (collection === 'news') openNewsIndex = idx + 1;
        if (collection === 'faqs') openFaqIndex = idx + 1;
        rerenderCollection(collection);
        markDirty(`Reordered [${collection}]`, colModKey);
      }
      return;
    }

    // 13. Accordion Card Expand / Collapse
    const header = target.closest('[data-toggle-card]');
    if (header) {
      const card = header.closest('.item-card');
      if (card) {
        const willOpen = !card.classList.contains('open');
        card.classList.toggle('open', willOpen);
        const chevron = card.querySelector('[data-card-chevron]');
        if (chevron) {
          const isNews = Boolean(card.closest('#news-list'));
          chevron.textContent = willOpen ? 'Hide ▲' : isNews ? 'Quick Edit ▼' : 'Edit ▼';
        }
      }
    }
  });

  // Quick-Pick Route Dropdowns, Checkboxes & Select Changes
  document.addEventListener('change', (e) => {
    const target = e.target;
    if (target instanceof HTMLSelectElement) {
      const scalarTargetId = target.getAttribute('data-url-picker-for');
      const collTargetId = target.getAttribute('data-url-index-for');

      if (scalarTargetId) {
        const pickedUrl = target.value;
        if (!pickedUrl) return;
        const targetInp = $(scalarTargetId);
        if (targetInp) targetInp.value = pickedUrl;
        target.value = '';
        markDirty('Selected link destination', inferModuleKeyFromElement(targetInp || target));
        showToast(`Selected route: ${pickedUrl}`, 'success');
        return;
      }

      if (collTargetId) {
        const pickedUrl = target.value;
        if (!pickedUrl) return;
        const inp = $(collTargetId);
        if (inp) inp.value = pickedUrl;
        const col = target.getAttribute('data-collection');
        const idx = Number(target.getAttribute('data-index'));
        const key = target.getAttribute('data-key');
        const list = col ? getCollectionRef(col) : null;
        if (list && list[idx] && key) {
          list[idx][key] = pickedUrl;
        }
        target.value = '';
        markDirty(`Selected route in [${col}]`, inferModuleKeyFromElement(target));
        showToast(`Selected route: ${pickedUrl}`, 'success');
        return;
      }
    }

    if (
      (target instanceof HTMLInputElement && target.type === 'checkbox') ||
      target instanceof HTMLSelectElement
    ) {
      if (
        !target.id?.startsWith('login-') &&
        !target.id?.startsWith('composer-') &&
        !target.id?.startsWith('modal-') &&
        !target.id?.startsWith('vb-') &&
        !target.id?.startsWith('preview-')
      ) {
        const modKey = inferModuleKeyFromElement(target);
        if (modKey) {
          markDirty(`Unsaved toggle in [${modKey}] — tap Save or Publish`, modKey);
        }
      }
    }
  });

  // Delegated Inputs for Dynamic Collection Fields & Live Preview Updates
  document.addEventListener('input', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
      return;
    }

    if (
      target.id === 'seo-meta-title' ||
      target.id === 'seo-meta-desc' ||
      target.id === 'seo-canonical' ||
      target.id === 'domain-primary'
    ) {
      if (target.id === 'domain-primary' && $('seo-canonical')) {
        $('seo-canonical').value = target.value;
      }
      updateSerpSimulator();
    }

    const collection = target.dataset.collection;
    const idx = Number(target.dataset.index);
    const key = target.dataset.key;

    if (collection && !Number.isNaN(idx) && key) {
      const list = getCollectionRef(collection);
      if (list && list[idx]) {
        if (target instanceof HTMLInputElement && target.type === 'checkbox') {
          list[idx][key] = target.checked;
        } else {
          list[idx][key] = target.value;
        }
        if ((key === 'heading' || key === 'title' || key === 'label') && !list[idx].slug) {
          list[idx].slug = generateSlug(target.value);
        }
      }
    }

    const thumbId = target.getAttribute('data-thumb-target');
    if (thumbId && $(thumbId)) {
      setImagePreview($(thumbId), target.value);
    }

    const previewId = target.getAttribute('data-preview-target');
    if (previewId && $(previewId) && $(previewId).classList.contains('visible')) {
      $(previewId).innerHTML = target.value;
    }

    if (
      !target.id?.startsWith('login-') &&
      !target.id?.startsWith('composer-') &&
      !target.id?.startsWith('modal-') &&
      !target.id?.startsWith('vb-') &&
      !target.id?.startsWith('fb-') &&
      !target.id?.startsWith('qc-') &&
      !target.id?.endsWith('-search-input') &&
      !target.id?.startsWith('preview-')
    ) {
      const modKey = inferModuleKeyFromElement(target);
      if (modKey) {
        markDirty(`Unsaved edit in [${modKey}] — tap Save or Publish`, modKey);
      }
    }
  });
}

function renderEnvSecurityDiagnostics() {
  const box = $('env-security-diagnostics-box');
  const runtimeTag = $('env-runtime-tag');
  if (!box) return;

  const diag = getLastEnvDiagnostics() || {};
  const fb = getActiveFirebaseConfig();
  const sec = currentConfig?.securityGate || {};
  const gh = currentConfig?.githubConfig || {};

  if (runtimeTag) {
    runtimeTag.textContent = diag.runtime || 'Backend Active';
  }

  const items = [
    {
      label: 'Admin Credentials Security',
      ok: Boolean(diag.adminEmailConfigured && diag.adminPasswordConfigured),
      activeText: 'Server-Verified Active',
      warnText: diag.isProduction ? 'Setup Required' : 'Local Dev Auth Active'
    },
    {
      label: 'Session Signing Key',
      ok: Boolean(diag.adminSessionSecretCustom),
      activeText: 'HMAC-SHA256 Active',
      warnText: 'Local Signing Secret'
    },
    {
      label: 'AES-256-GCM URL Vault',
      ok: Boolean(diag.vaultSecretCustom),
      activeText: 'Custom Vault Key Set',
      warnText: 'Derived Vault Key Active'
    },
    {
      label: 'Cloudflare Turnstile Gate',
      ok: Boolean(diag.turnstileSiteKeyConfigured || (sec.turnstileSiteKey && sec.hasTurnstileSecretKey)),
      activeText: 'Configured',
      warnText: 'Preview Test Key Active'
    },
    {
      label: 'Firebase Firestore Persistence',
      ok: isRealFirebaseConfig(fb),
      activeText: `Connected (${fb.projectId})`,
      warnText: 'Add Firebase Env Vars / Keys'
    },
    {
      label: 'GitHub Fine-Grained Token Push',
      ok: Boolean(diag.githubTokenConfigured || gh.hasFineGrainedToken),
      activeText: gh.repoOwner && gh.repoName ? `Ready (${gh.repoOwner}/${gh.repoName})` : 'Token Stored Server-Side',
      warnText: 'Add Token in GitHub Card'
    }
  ];

  box.innerHTML = items
    .map(
      (item) => `
      <div style="border:1px solid var(--border); background:#f8fafc; border-radius:7px; padding:8px 10px; display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <span style="font-size:0.74rem; font-weight:600; color:var(--text-main);">${escapeHtml(item.label)}</span>
        <span class="field-tag" style="background:${item.ok ? '#ecfdf5' : '#fffbeb'}; color:${item.ok ? '#065f46' : '#92400e'}; border-color:${item.ok ? '#a7f3d0' : '#fde68a'};">
          ${item.ok ? `✓ ${escapeHtml(item.activeText)}` : `• ${escapeHtml(item.warnText)}`}
        </span>
      </div>
    `
    )
    .join('');
}

async function bootstrapAdmin() {
  onAdminUnauthorized((reason) => {
    lockAdminStudio(reason || 'Your session expired or was revoked. Please sign in again.');
    showToast('Session expired — please sign in again', 'error');
  });
  initAuthEvents();

  const overlay = $('auth-overlay');
  const session = await verifyAdminSession();
  if (session && session.authenticated) {
    await unlockAdminStudio();
    return;
  }

  if (overlay) {
    overlay.removeAttribute('data-checking');
    overlay.hidden = false;
  }
}

bootstrapAdmin();
