import {
  MASTER_DEFAULT_CONFIG,
  mergeSiteConfig,
  generateSlug,
  generateSmartLegalHtml,
  auditSiteSeoHealth
} from './src/utils/cms-engine.ts';

import {
  getCachedSiteConfigSync,
  getSiteConfigRemote,
  saveSiteConfigRemote,
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
  logoutAdminUser
} from './firebase-config.js';

let currentConfig = mergeSiteConfig(getCachedSiteConfigSync(), MASTER_DEFAULT_CONFIG);
let activeTab = 'overview';
let activeLegalPageIndex = 0;
let authMode = 'credentials';
let isDirty = false;

// State for Global Image Upload, Insert Image Modal, Link Modal & Visual Block Builder Modal
let pendingUploadCallback = null;
let activeImageModalTarget = null; // Either { type: 'id', id: string } or { type: 'collection', collection, index, key, textareaId, previewId }
let activeVisualBlockTarget = null; // Either { type: 'id', id: string } or { type: 'collection', collection, index, key, textareaId, previewId }
let activeLinkModalTarget = null; // Same descriptor shape for Link Insertion Modal
let sectionSearchQuery = '';
let newsSearchQuery = '';
let faqSearchQuery = '';
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

function markDirty(message = 'Unsaved edits — click "Publish All Changes" to go live') {
  isDirty = true;
  const fb = $('save-feedback-text');
  if (fb) {
    fb.textContent = message;
    fb.style.color = '#d97706';
  }
}

function markClean(message = 'All changes published and compiled to static public site') {
  isDirty = false;
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
  markDirty();
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
      img.src = inp.value.trim() || '/assets/app-icon.svg';
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
    tag.textContent = '✓ Valid JSON-LD Ready';
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
      return '\n<ul>\n  <li>✓ <strong>Verified Checksum:</strong> Cryptographic SHA-256 signature verified.</li>\n  <li>✓ <strong>Zero Telemetry:</strong> Clean runtime with zero unwanted background scripts.</li>\n</ul>';
    case 'quote':
    case 'callout':
      return '\n<div class="cms-callout-box">\n  <strong>✓ Verified Technical Note:</strong> Highlight an important tip, security verification note, or update notice here.\n</div>';
    case 'grid':
      return '\n<div class="cms-feature-grid">\n  <div class="cms-feature-item">\n    <strong>⚡ High-Speed Performance</strong>\n    <p style="margin:6px 0 0 0;">Optimized for sub-second response times on mobile and desktop.</p>\n  </div>\n  <div class="cms-feature-item">\n    <strong>🔒 Verified Integrity</strong>\n    <p style="margin:6px 0 0 0;">Every package is signed and verified with SHA-256 checksums.</p>\n  </div>\n</div>';
    case 'table':
      return '\n<table>\n  <tbody>\n    <tr><th>Parameter</th><td>Specification Value</td></tr>\n    <tr><th>Compatibility</th><td>Android 9.0+ / iOS 15.0+</td></tr>\n  </tbody>\n</table>';
    case 'cta':
      return '\n<div style="margin:18px 0;">\n  <a href="/#technical-specifications" data-spa-link class="section-inline-cta">⚡ Download Latest Build</a>\n</div>';
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
      markDirty();
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
      markDirty();
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
  if ($('modal-img-preview')) $('modal-img-preview').src = '';
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
    if ($('vb-title-1')) $('vb-title-1').value = '✓ Verified Security & Integrity Note';
    if ($('vb-text-1')) $('vb-text-1').value = 'Every release is cryptographically signed with SHA-256 and verified clean across 72 security engines.';
    if (grp2) grp2.style.display = 'none';
    if (grp2Txt) grp2Txt.style.display = 'none';
  } else if (type === 'grid') {
    if (lbl1) lbl1.textContent = 'Left Feature Card Title';
    if (txt1) txt1.textContent = 'Left Feature Card Description';
    if (lbl2) lbl2.textContent = 'Right Feature Card Title';
    if (txt2) txt2.textContent = 'Right Feature Card Description';
    if ($('vb-title-1')) $('vb-title-1').value = '⚡ Sub-Second Edge Speed';
    if ($('vb-text-1')) $('vb-text-1').value = 'Pre-compiled static pages load in under 50ms globally with zero runtime database overhead.';
    if ($('vb-title-2')) $('vb-title-2').value = '🔒 Verified SHA-256 Signature';
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
    if ($('vb-title-1')) $('vb-title-1').value = '✓ Official Signed Package';
    if ($('vb-text-1')) $('vb-text-1').value = 'Cryptographically verified SHA-256 checksum matches official release manifest.';
    if ($('vb-title-2')) $('vb-title-2').value = '✓ Zero Bloatware or Adware';
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
    if ($('vb-title-1')) $('vb-title-1').value = '⚡ Download Official Signed Build';
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
   1. AUTHENTICATION FLOW
   ═══════════════════════════════════════════════════════════════════════════ */
function setAuthMode(mode) {
  authMode = mode;
  const tabCreds = $('tab-auth-credentials');
  const tabKey = $('tab-auth-apikey');
  const fieldsCreds = $('auth-credentials-fields');
  const fieldsKey = $('auth-apikey-fields');

  if (mode === 'apikey') {
    tabCreds?.classList.remove('active');
    tabKey?.classList.add('active');
    if (fieldsCreds) fieldsCreds.style.display = 'none';
    if (fieldsKey) fieldsKey.style.display = 'grid';
  } else {
    tabCreds?.classList.add('active');
    tabKey?.classList.remove('active');
    if (fieldsCreds) fieldsCreds.style.display = 'grid';
    if (fieldsKey) fieldsKey.style.display = 'none';
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const errBox = $('auth-error');
  const btn = $('btn-login-submit');
  if (errBox) errBox.classList.remove('visible');

  const email = $('login-email')?.value.trim() || '';
  const password = $('login-password')?.value || '';
  const apiKey = $('login-apikey')?.value.trim() || '';

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Verifying...';
  }

  try {
    const result = await loginAdminUser(email, password, apiKey);
    if (!result.success) {
      if (errBox) {
        errBox.textContent = result.error || 'Invalid credentials.';
        errBox.classList.add('visible');
      }
      return;
    }

    await unlockAdminStudio();
    showToast('Signed in to Master Admin Studio', 'success');
  } catch (err) {
    if (errBox) {
      errBox.textContent = err.message || 'Authentication error.';
      errBox.classList.add('visible');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Sign In to Admin Studio';
    }
  }
}

async function unlockAdminStudio() {
  const overlay = $('auth-overlay');
  const shell = $('cms-shell');
  if (overlay) overlay.hidden = true;
  if (shell) shell.hidden = false;

  try {
    const remote = await getSiteConfigRemote();
    if (remote) {
      currentConfig = mergeSiteConfig(remote, MASTER_DEFAULT_CONFIG);
    }
  } catch {
    currentConfig = mergeSiteConfig(getCachedSiteConfigSync(), MASTER_DEFAULT_CONFIG);
  }

  populateAllFields();
  resetNewsComposer();
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. WORKSPACE TAB SWITCHING (DESKTOP SIDEBAR + MOBILE HAMBURGER DRAWER)
   ═══════════════════════════════════════════════════════════════════════════ */
const WORKSPACE_CONTEXT_MAP = {
  overview: {
    label: '1. Website Map & Audit',
    target: 'Public Site: Master Overview & SEO Audit'
  },
  brand: {
    label: '2. Brand, Hero & Colors',
    target: 'Public Site: Sticky Header, Search Logo, Hero, 3-Bar Menu & Colors'
  },
  specs: {
    label: '3. Package Specs Table',
    target: 'Public Site: #technical-specifications & SHA-256 Table'
  },
  sections: {
    label: '4. Content Sections',
    target: 'Public Site: Homepage Body Editorial Sections'
  },
  news: {
    label: '5. Daily News Publisher',
    target: 'Public Site: Homepage #latest-news & /news/:slug'
  },
  faqs: {
    label: '6. FAQs Manager',
    target: 'Public Site: #frequently-asked-questions & FAQPage Schema'
  },
  pages: {
    label: '7. Footer & Legal Pages',
    target: 'Public Site: Footer & /privacy-policy, /terms, /dmca'
  },
  domain: {
    label: '8. Security, SEO & Deploy',
    target: 'Public Site: /moreinfo Security Gate, Sitemap & GitHub Push'
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

function switchTab(tabId) {
  activeTab = tabId;
  closeAdminNavDrawer();
  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `panel-${tabId}`);
  });

  const ctx = WORKSPACE_CONTEXT_MAP[tabId] || WORKSPACE_CONTEXT_MAP.overview;
  if ($('editing-now-label')) {
    $('editing-now-label').textContent = `📍 ${ctx.label}`;
  }
  if ($('editing-now-target')) {
    $('editing-now-target').textContent = ctx.target;
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function filterBrandSubcards(subKey) {
  document.querySelectorAll('[data-brand-subtab]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-brand-subtab') === subKey);
  });
  document.querySelectorAll('[data-brand-card]').forEach((card) => {
    const key = card.getAttribute('data-brand-card');
    card.style.display = subKey === 'all' || key === subKey ? 'block' : 'none';
  });
  const subLabels = {
    all: 'Public Site: Sticky Header, Search Logo, Hero, 3-Bar Menu & Colors',
    identity: 'Public Site: Sticky Header Logo, Favicon, Search Logo & PWA Manifest',
    hero: 'Public Site: Top Homepage H1, Intro & 16:9 LCP Banner',
    ctas: 'Public Site: 2-Column Download Buttons & Floating Pill CTA',
    drawer: 'Public Site: Sticky Header & 3-Bar Hamburger Slide-Down Menu',
    theme: 'Public Site: Global Colors, Fonts & Vertical Block Order'
  };
  if ($('editing-now-target') && subLabels[subKey]) {
    $('editing-now-target').textContent = subLabels[subKey];
  }
}

function filterDomainSubcards(subKey) {
  document.querySelectorAll('[data-domain-subtab]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-domain-subtab') === subKey);
  });
  document.querySelectorAll('[data-domain-card]').forEach((card) => {
    const key = card.getAttribute('data-domain-card');
    card.style.display = subKey === 'all' || key === subKey ? 'block' : 'none';
  });
  const subLabels = {
    all: 'Public Site: /moreinfo Security Gate, Sitemap & GitHub Push',
    security: 'Public Site: /moreinfo 7-Gate Security & AES-256-GCM Link Vault',
    internallinks: 'Public Site: Smart Contextual Internal Linking Engine',
    github: 'Public Site: GitHub Fine-Grained Token Static Bundle Publisher',
    sitemap: 'Public Site: /sitemap.xml (<image:image>), /manifest.webmanifest & /robots.txt',
    serp: 'Public Site: Homepage <head> Meta & Google Search Result Preview',
    schema: 'Public Site: SoftwareApplication Star Rating JSON-LD Schema',
    firebase: 'Admin Studio: Live Firebase Cloud Persistence & JSON Backup'
  };
  if ($('editing-now-target') && subLabels[subKey]) {
    $('editing-now-target').textContent = subLabels[subKey];
  }
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
  const ui = c.uiConfig || MASTER_DEFAULT_CONFIG.uiConfig;

  // Topbar Brand & Live Firebase Storage Status
  if ($('topbar-logo')) $('topbar-logo').src = c.brand.logoUrl || '/assets/app-icon.svg';
  if ($('topbar-brand-title')) $('topbar-brand-title').textContent = `${c.brand.name || 'Site'} — Master CMS Studio`;

  const fbConfig = getActiveFirebaseConfig();
  const fbActive = isRealFirebaseConfig(fbConfig);
  if ($('storage-status-text')) {
    $('storage-status-text').textContent = fbActive
      ? `Live Firebase (${fbConfig.projectId}) + Static Compiler Ready`
      : 'Live Admin Store + Static Compiler Ready';
  }
  if ($('fb-env-badge')) {
    const srcLabel =
      fbConfig?.source === 'admin-override'
        ? 'Runtime Keys'
        : fbConfig?.source === 'server-env' || fbConfig?.source === 'vite-env'
        ? '.env / Server Secret'
        : 'Local';
    $('fb-env-badge').textContent = fbActive
      ? `✓ Live Firebase Connected (${fbConfig.projectId} · ${srcLabel})`
      : 'Local Live Store Active (Add Firebase Keys Below or in .env)';
  }

  // Quick 1-Tap Master Clone Fields in Overview
  setVal('qc-brand-name', c.brand.name);
  setVal('qc-version', c.packageSpecs?.version || 'v4.8.2');
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
  setVal('brand-search-logo', c.brand.searchLogoUrl || c.brand.logoUrl);
  setVal('brand-apple-icon', c.brand.appleTouchIconUrl || c.brand.logoUrl);
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
  if ($('hero-banner-preview')) $('hero-banner-preview').src = c.hero.bannerImageUrl || '';
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
  setVal('ui-footer-bg', ui.footerBackgroundColor || '#F9FAFB');
  setVal('ui-footer-text', ui.footerTextColor || '#4B5563');
  setVal('ui-border-color', ui.borderColor || '#E5E7EB');
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
  const specs = c.packageSpecs || MASTER_DEFAULT_CONFIG.packageSpecs;
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

  // Workspace 8: GitHub Static Website Publisher, Domain, Global SEO & Firebase
  const gh = c.githubConfig || MASTER_DEFAULT_CONFIG.githubConfig;
  setVal('gh-token', gh.fineGrainedToken || '');
  setVal('gh-owner', gh.repoOwner || '');
  setVal('gh-repo', gh.repoName || '');
  setVal('gh-branch', gh.branch || 'main');
  setVal('gh-dir', gh.targetDirectory ?? 'dist-public');
  setVal(
    'gh-commit-msg',
    gh.commitMessageTemplate || 'chore(static-publish): update compiled static public pages from Admin Studio'
  );
  setChecked('gh-auto-push', Boolean(gh.autoPushOnPublish));
  renderGitHubDeployHistory();

  const dom = c.domainConfig || MASTER_DEFAULT_CONFIG.domainConfig;
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

  setVal('fb-api-key', fbConfig?.apiKey || '');
  setVal('fb-project-id', fbConfig?.projectId || '');
  setVal('fb-auth-domain', fbConfig?.authDomain || '');
  setVal('fb-storage-bucket', fbConfig?.storageBucket || '');
  setVal('fb-messaging-sender-id', fbConfig?.messagingSenderId || '');
  setVal('fb-app-id', fbConfig?.appId || '');
  setVal('fb-database-id', fbConfig?.databaseId || '(default)');
  renderEnvSecurityDiagnostics();

  // v12 7-Gate Security Gateway & AES-256-GCM Link Vault Fields
  const sec = c.securityGate || MASTER_DEFAULT_CONFIG.securityGate;
  setChecked('sec-enabled', sec.enabled !== false);
  setChecked('sec-show-specs', Boolean(sec.showSpecsOnGateway));
  setVal('sec-device-policy', sec.devicePolicyMode || 'universal_human');
  setVal('sec-btn-label', sec.proceedButtonLabel || 'PROCEED');
  setVal('sec-custom-heading', sec.customHeading || '');
  setVal('sec-custom-note', sec.customNoteHtml || '');
  setVal('sec-app-slug', sec.appSlug || 'apexmobile');
  setVal('sec-serial-id', sec.appSerialId || 'APM-482');
  setVal('sec-primary-url', sec.primaryDownloadUrl || '');
  setVal('sec-encrypted-url', sec.encryptedPrimaryUrl || '');
  setVal('sec-turnstile-site-key', sec.turnstileSiteKey || '');
  setVal('sec-turnstile-secret-key', sec.turnstileSecretKey || '');
  setChecked('sec-paused', Boolean(sec.isPaused));
  setChecked('sec-coming-soon', Boolean(sec.isComingSoon));
  setVal('sec-daily-cap', sec.dailyIssueCap ?? 0);
  setVal('sec-unavailable-msg', sec.unavailableMessage || '');
  setVal('sec-whatsapp', sec.helplineWhatsapp || '');
  setVal('sec-telegram', sec.helplineTelegram || '');

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
  const gh = currentConfig.githubConfig || MASTER_DEFAULT_CONFIG.githubConfig;
  const listEl = $('gh-deploy-history-list');
  const badgeEl = $('gh-status-badge');
  const tagEl = $('gh-last-commit-tag');

  if (badgeEl) {
    badgeEl.textContent =
      gh.repoOwner && gh.repoName
        ? `Target: ${gh.repoOwner}/${gh.repoName} (${gh.branch || 'main'})`
        : 'Local /dist-public Compiler Active';
  }
  if (tagEl && gh.lastPublishedAt) {
    tagEl.textContent = `Last GitHub Push: ${new Date(gh.lastPublishedAt).toLocaleString()} (${
      gh.lastCommitSha ? gh.lastCommitSha.slice(0, 7) : 'ok'
    })`;
  }

  if (!listEl) return;
  const history = Array.isArray(gh.deployHistory) ? gh.deployHistory : [];
  if (history.length === 0) {
    listEl.innerHTML = `
      <div class="audit-row">
        <div>
          <strong style="font-size:0.84rem;">Local Static Public Bundle Ready (/dist-public)</strong>
          <div style="font-size:0.75rem; color:var(--text-muted);">
            Every "Publish Changes" compiles 100% static HTML &amp; per-route JSON locally. Enter your GitHub Fine-Grained Token above to push commits directly to GitHub.
          </div>
        </div>
        <span class="audit-badge-pass">✓ Compiled</span>
      </div>
    `;
    return;
  }

  listEl.innerHTML = history
    .slice(0, 6)
    .map(
      (item) => `
      <div class="audit-row">
        <div>
          <strong style="font-size:0.84rem;">${escapeHtml(item.message)}</strong>
          <div style="font-size:0.75rem; color:var(--text-muted);">
            ${new Date(item.timestamp).toLocaleString()} • ${item.filesCount || 0} static files ${
        item.commitUrl
          ? `• <a href="${escapeHtml(item.commitUrl)}" target="_blank" rel="noopener" style="color:var(--primary); font-weight:700;">View Commit ${escapeHtml(
              item.commitSha.slice(0, 7)
            )} ↗</a>`
          : ''
      }
          </div>
        </div>
        <span class="audit-badge-pass" style="${
          item.status === 'success' ? '' : 'background:#fef2f2; color:#b91c1c;'
        }">${item.status === 'success' ? '✓ Pushed' : 'Failed'}</span>
      </div>
    `
    )
    .join('');
}

function refreshOverviewAndSeoAudit() {
  const audit = auditSiteSeoHealth(currentConfig);
  const newsCount = (currentConfig.newsSection?.articles || []).length;
  const pagesCount = (currentConfig.pages || []).length;
  const sectionsCount = (currentConfig.sections || []).length;
  const faqsCount = (currentConfig.faqsSection?.items || []).length;

  if ($('stat-seo-score')) $('stat-seo-score').textContent = `${audit.score} / 100`;
  if ($('stat-news-count')) $('stat-news-count').textContent = String(newsCount);
  if ($('stat-pages-count')) $('stat-pages-count').textContent = String(pagesCount);
  if ($('stat-sitemap-count')) $('stat-sitemap-count').textContent = String(audit.totalUrlsInSitemap);

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
          <div>
            <strong style="font-size:0.84rem;">${escapeHtml(chk.label)}</strong>
            <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(chk.detail)}</div>
          </div>
          <span class="audit-badge-pass" style="${
            chk.passed ? '' : 'background:#fef2f2; color:#b91c1c;'
          }">${chk.passed ? '✓ Passed' : 'Needs Attention'}</span>
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
  specs: '📦 Technical Package Specifications Table (#technical-specifications)',
  sections: '📄 Homepage Editorial Content Sections',
  rawHtml: '🧩 Additional Custom HTML / Component Block',
  news: '📰 Daily News & Release Updates Feed (#latest-news)',
  faqs: '❓ Frequently Asked Questions Accordion (#frequently-asked-questions)'
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
  setVal('composer-news-author', `${currentConfig.brand?.name || 'ApexMobile'} Editorial Team`);
  setVal('composer-news-readtime', '2 min read');
  setChecked('composer-news-featured', false);
  setVal('composer-news-cover-url', '');
  if ($('composer-news-cover-preview')) $('composer-news-cover-preview').src = '';
  setVal('composer-news-cover-alt', '');
  setVal('composer-news-cover-caption', '');
  setVal('composer-news-cta-label', '');
  setVal('composer-news-cta-url', '');
  setVal('composer-news-summary', '');
  setVal('composer-news-html', '');
  setVal('composer-news-meta-title', '');
  setVal('composer-news-meta-desc', '');
  if ($('news-composer-heading')) {
    $('news-composer-heading').textContent = '✍️ Publish a New Daily News Article';
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
  if ($('composer-news-cover-preview')) $('composer-news-cover-preview').src = art.coverImageUrl || '';
  setVal('composer-news-cover-alt', art.coverImageAlt || '');
  setVal('composer-news-cover-caption', art.coverImageCaption || '');
  setVal('composer-news-cta-label', art.ctaLabel || '');
  setVal('composer-news-cta-url', art.ctaUrl || '');
  setVal('composer-news-summary', art.summary);
  setVal('composer-news-html', art.htmlContent);
  setVal('composer-news-meta-title', art.metaTitle);
  setVal('composer-news-meta-desc', art.metaDescription);
  if ($('news-composer-heading')) {
    $('news-composer-heading').textContent = `✏️ Editing News Article: ${art.title}`;
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

  const brandName = currentConfig.brand?.name || 'ApexMobile';
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
  await handleSaveAndPublish();
  resetNewsComposer();
  showToast(`News published & compiled to static /news/${slug}!`, 'success');
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

  container.innerHTML = filtered
    .map(
      ({ sec, idx }) => `
      <div class="item-card ${idx === 0 || q ? 'open' : ''}" data-section-idx="${idx}">
        <div class="item-card-header" data-toggle-card>
          <div class="item-card-title-wrap">
            <span class="item-badge">Section #${idx + 1} • #${escapeHtml(sec.slug || 'section')}</span>
            ${
              sec.visible === false
                ? `<span class="item-badge" style="background:#fee2e2; color:#b91c1c;">Hidden</span>`
                : `<span class="placement-badge">📍 Homepage Body</span>`
            }
            <span class="item-card-title">${escapeHtml(sec.heading || 'Untitled Section')}</span>
          </div>
          <div class="item-card-actions">
            <button type="button" class="btn btn-sm" data-action="move-up" data-collection="sections" data-index="${idx}" ${
        idx === 0 ? 'disabled' : ''
      }>↑</button>
            <button type="button" class="btn btn-sm" data-action="move-down" data-collection="sections" data-index="${idx}" ${
        idx === sections.length - 1 ? 'disabled' : ''
      }>↓</button>
            <button type="button" class="btn btn-sm" data-action="clone" data-collection="sections" data-index="${idx}">Clone</button>
            <button type="button" class="btn btn-sm btn-danger" data-action="delete" data-collection="sections" data-index="${idx}">Delete</button>
            <span class="btn btn-sm" data-card-chevron>${idx === 0 || q ? 'Hide ▲' : 'Edit ▼'}</span>
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
              <input type="text" class="input" value="${escapeHtml(
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
                <button type="button" class="btn btn-sm" data-upload-collection="sections" data-index="${idx}" data-key="imageUrl">📤 Upload Image</button>
              </div>
              <input type="text" class="input" id="sec-img-url-${idx}" value="${escapeHtml(
        sec.imageUrl || ''
      )}" data-collection="sections" data-index="${idx}" data-key="imageUrl" data-thumb-target="sec-img-thumb-${idx}" placeholder="Paste image URL or click Upload Image..." />
              ${sec.imageUrl ? `<img id="sec-img-thumb-${idx}" class="img-mini-preview" src="${escapeHtml(sec.imageUrl)}" alt="Section Image Preview" />` : ''}
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
              <button type="button" class="btn btn-sm" data-toggle-preview="sec-preview-${idx}">👁️ Toggle Visual Preview</button>
            </div>
            <div class="html-toolbar">
              <button type="button" class="btn btn-sm btn-primary" data-open-collection-visual-modal="sections" data-index="${idx}" data-key="htmlContent" data-textarea="sec-html-${idx}" data-preview="sec-preview-${idx}">🧩 + Visual Block</button>
              <button type="button" class="btn btn-sm btn-dark" data-open-collection-image-modal="sections" data-index="${idx}" data-key="htmlContent" data-textarea="sec-html-${idx}" data-preview="sec-preview-${idx}">🖼️ + Image</button>
              <button type="button" class="btn btn-sm" data-open-collection-link-modal="sections" data-index="${idx}" data-key="htmlContent" data-textarea="sec-html-${idx}" data-preview="sec-preview-${idx}">🔗 + Link</button>
              <button type="button" class="btn btn-sm" data-insert-snippet="b" data-target="sec-html-${idx}" data-collection="sections" data-index="${idx}" data-key="htmlContent"><b>B</b></button>
              <button type="button" class="btn btn-sm" data-insert-snippet="p" data-target="sec-html-${idx}" data-collection="sections" data-index="${idx}" data-key="htmlContent">+ P</button>
              <button type="button" class="btn btn-sm" data-insert-snippet="h3" data-target="sec-html-${idx}" data-collection="sections" data-index="${idx}" data-key="htmlContent">+ H3</button>
              <button type="button" class="btn btn-sm" data-insert-snippet="ul" data-target="sec-html-${idx}" data-collection="sections" data-index="${idx}" data-key="htmlContent">+ List</button>
              <button type="button" class="btn btn-sm" data-insert-snippet="steps" data-target="sec-html-${idx}" data-collection="sections" data-index="${idx}" data-key="htmlContent">+ Steps</button>
              <button type="button" class="btn btn-sm" data-insert-snippet="callout" data-target="sec-html-${idx}" data-collection="sections" data-index="${idx}" data-key="htmlContent">+ Callout</button>
              <button type="button" class="btn btn-sm" data-insert-snippet="grid" data-target="sec-html-${idx}" data-collection="sections" data-index="${idx}" data-key="htmlContent">+ Grid</button>
              <button type="button" class="btn btn-sm" data-insert-snippet="table" data-target="sec-html-${idx}" data-collection="sections" data-index="${idx}" data-key="htmlContent">+ Table</button>
              <button type="button" class="btn btn-sm" data-insert-snippet="cta" data-target="sec-html-${idx}" data-collection="sections" data-index="${idx}" data-key="htmlContent">+ Button</button>
              <button type="button" class="btn btn-sm" data-undo-target="sec-html-${idx}">↩ Undo</button>
            </div>
            <textarea id="sec-html-${idx}" class="textarea code" rows="6" data-collection="sections" data-index="${idx}" data-key="htmlContent" data-preview-target="sec-preview-${idx}">${escapeHtml(
        sec.htmlContent
      )}</textarea>
            <div id="sec-preview-${idx}" class="live-preview-box"></div>
          </div>
        </div>
      </div>
    `
    )
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

  const routeOptionsHtml = buildUrlPickerOptionsHtml('Quick Pick Route…');

  container.innerHTML = filtered
    .map(
      ({ art, idx }) => `
      <div class="item-card ${idx === 0 || q ? 'open' : ''}">
        <div class="item-card-header" data-toggle-card>
          <div class="item-card-title-wrap">
            <span class="item-badge">${escapeHtml(art.category || 'News')}</span>
            ${art.featured ? `<span class="item-badge" style="background:#fef3c7; color:#b45309;">★ Featured</span>` : ''}
            <span class="item-card-title">${escapeHtml(art.title || 'Untitled News')}</span>
          </div>
          <div class="item-card-actions">
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
            <span class="btn btn-sm" data-card-chevron>${idx === 0 || q ? 'Hide ▲' : 'Quick Edit ▼'}</span>
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
              <input type="text" class="input" value="${escapeHtml(
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
                <button type="button" class="btn btn-sm" data-upload-collection="news" data-index="${idx}" data-key="coverImageUrl">📤 Upload Image</button>
              </div>
              <input type="text" class="input" id="news-img-url-${idx}" value="${escapeHtml(
        art.coverImageUrl || ''
      )}" data-collection="news" data-index="${idx}" data-key="coverImageUrl" />
              ${art.coverImageUrl ? `<img class="img-mini-preview" src="${escapeHtml(art.coverImageUrl)}" alt="Cover Preview" />` : ''}
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
              <button type="button" class="btn btn-sm" data-toggle-preview="news-preview-${idx}">👁️ Toggle Visual Preview</button>
            </div>
            <div class="html-toolbar">
              <button type="button" class="btn btn-sm btn-primary" data-open-collection-visual-modal="news" data-index="${idx}" data-key="htmlContent" data-textarea="news-html-${idx}" data-preview="news-preview-${idx}">🧩 + Visual Block</button>
              <button type="button" class="btn btn-sm btn-dark" data-open-collection-image-modal="news" data-index="${idx}" data-key="htmlContent" data-textarea="news-html-${idx}" data-preview="news-preview-${idx}">🖼️ + Image</button>
              <button type="button" class="btn btn-sm" data-open-collection-link-modal="news" data-index="${idx}" data-key="htmlContent" data-textarea="news-html-${idx}" data-preview="news-preview-${idx}">🔗 + Link</button>
              <button type="button" class="btn btn-sm" data-insert-snippet="b" data-target="news-html-${idx}" data-collection="news" data-index="${idx}" data-key="htmlContent"><b>B</b></button>
              <button type="button" class="btn btn-sm" data-insert-snippet="p" data-target="news-html-${idx}" data-collection="news" data-index="${idx}" data-key="htmlContent">+ P</button>
              <button type="button" class="btn btn-sm" data-insert-snippet="h3" data-target="news-html-${idx}" data-collection="news" data-index="${idx}" data-key="htmlContent">+ H3</button>
              <button type="button" class="btn btn-sm" data-insert-snippet="ul" data-target="news-html-${idx}" data-collection="news" data-index="${idx}" data-key="htmlContent">+ List</button>
              <button type="button" class="btn btn-sm" data-insert-snippet="steps" data-target="news-html-${idx}" data-collection="news" data-index="${idx}" data-key="htmlContent">+ Steps</button>
              <button type="button" class="btn btn-sm" data-insert-snippet="callout" data-target="news-html-${idx}" data-collection="news" data-index="${idx}" data-key="htmlContent">+ Callout</button>
              <button type="button" class="btn btn-sm" data-undo-target="news-html-${idx}">↩ Undo</button>
            </div>
            <textarea id="news-html-${idx}" class="textarea code" rows="5" data-collection="news" data-index="${idx}" data-key="htmlContent" data-preview-target="news-preview-${idx}">${escapeHtml(
        art.htmlContent
      )}</textarea>
            <div id="news-preview-${idx}" class="live-preview-box"></div>
          </div>
        </div>
      </div>
    `
    )
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

  container.innerHTML = filtered
    .map(
      ({ faq, idx }) => `
      <div class="item-card ${idx === 0 || q ? 'open' : ''}">
        <div class="item-card-header" data-toggle-card>
          <div class="item-card-title-wrap">
            <span class="item-badge">Q${idx + 1}</span>
            <span class="item-card-title">${escapeHtml(faq.question || 'Untitled Question')}</span>
          </div>
          <div class="item-card-actions">
            <button type="button" class="btn btn-sm" data-action="move-up" data-collection="faqs" data-index="${idx}" ${
        idx === 0 ? 'disabled' : ''
      }>↑</button>
            <button type="button" class="btn btn-sm" data-action="move-down" data-collection="faqs" data-index="${idx}" ${
        idx === items.length - 1 ? 'disabled' : ''
      }>↓</button>
            <button type="button" class="btn btn-sm" data-action="clone" data-collection="faqs" data-index="${idx}">Clone</button>
            <button type="button" class="btn btn-sm btn-danger" data-action="delete" data-collection="faqs" data-index="${idx}">Delete</button>
            <span class="btn btn-sm" data-card-chevron>${idx === 0 || q ? 'Hide ▲' : 'Edit ▼'}</span>
          </div>
        </div>
        <div class="item-card-body">
          <div class="form-grid">
            <div class="field">
              <label class="field-label">Question (&lt;h3&gt;)</label>
              <input type="text" class="input" value="${escapeHtml(
                faq.question
              )}" data-collection="faqs" data-index="${idx}" data-key="question" />
            </div>
            <div class="field">
              <label class="field-label">Answer (&lt;p&gt;)</label>
              <textarea class="textarea" rows="3" data-collection="faqs" data-index="${idx}" data-key="answer">${escapeHtml(
        faq.answer
      )}</textarea>
            </div>
          </div>
        </div>
      </div>
    `
    )
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
            <button type="button" class="btn btn-sm" data-upload-collection="pages" data-index="${idx}" data-key="bannerImageUrl">📤 Upload Image</button>
          </div>
          <input type="text" class="input" id="page-img-url-${idx}" value="${escapeHtml(
    pg.bannerImageUrl || ''
  )}" data-collection="pages" data-index="${idx}" data-key="bannerImageUrl" placeholder="Optional banner image for this page..." />
          ${pg.bannerImageUrl ? `<img class="img-mini-preview" src="${escapeHtml(pg.bannerImageUrl)}" alt="Page Banner Preview" />` : ''}
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
          <button type="button" class="btn btn-sm" data-toggle-preview="page-preview-${idx}">👁️ Toggle Visual Preview</button>
        </div>
        <div class="html-toolbar">
          <button type="button" class="btn btn-sm btn-primary" data-open-collection-visual-modal="pages" data-index="${idx}" data-key="htmlContent" data-textarea="page-html-${idx}" data-preview="page-preview-${idx}">🧩 + Visual Block</button>
          <button type="button" class="btn btn-sm btn-dark" data-open-collection-image-modal="pages" data-index="${idx}" data-key="htmlContent" data-textarea="page-html-${idx}" data-preview="page-preview-${idx}">🖼️ + Image</button>
          <button type="button" class="btn btn-sm" data-open-collection-link-modal="pages" data-index="${idx}" data-key="htmlContent" data-textarea="page-html-${idx}" data-preview="page-preview-${idx}">🔗 + Link</button>
          <button type="button" class="btn btn-sm" data-insert-snippet="b" data-target="page-html-${idx}" data-collection="pages" data-index="${idx}" data-key="htmlContent"><b>B</b></button>
          <button type="button" class="btn btn-sm" data-insert-snippet="p" data-target="page-html-${idx}" data-collection="pages" data-index="${idx}" data-key="htmlContent">+ P</button>
          <button type="button" class="btn btn-sm" data-insert-snippet="h3" data-target="page-html-${idx}" data-collection="pages" data-index="${idx}" data-key="htmlContent">+ H3</button>
          <button type="button" class="btn btn-sm" data-insert-snippet="ul" data-target="page-html-${idx}" data-collection="pages" data-index="${idx}" data-key="htmlContent">+ List</button>
          <button type="button" class="btn btn-sm" data-insert-snippet="steps" data-target="page-html-${idx}" data-collection="pages" data-index="${idx}" data-key="htmlContent">+ Steps</button>
          <button type="button" class="btn btn-sm" data-insert-snippet="callout" data-target="page-html-${idx}" data-collection="pages" data-index="${idx}" data-key="htmlContent">+ Callout</button>
          <button type="button" class="btn btn-sm" data-insert-snippet="table" data-target="page-html-${idx}" data-collection="pages" data-index="${idx}" data-key="htmlContent">+ Table</button>
          <button type="button" class="btn btn-sm" data-insert-snippet="accordion" data-target="page-html-${idx}" data-collection="pages" data-index="${idx}" data-key="htmlContent">+ Accordion</button>
          <button type="button" class="btn btn-sm" data-undo-target="page-html-${idx}">↩ Undo</button>
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
  const brandName = $('brand-name')?.value.trim() || 'ApexMobile';

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
    if (txt && /^#[0-9A-Fa-f]{6}$/.test(txt.value.trim())) {
      picker.value = txt.value.trim();
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
  markDirty('Applied color theme preset — click "Publish Changes" to compile & go live');
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
    currentConfig.domainConfig = { ...MASTER_DEFAULT_CONFIG.domainConfig };
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
   8. COLLECT FORM DATA, SAVE LIVE FIREBASE & GITHUB STATIC PUSH
   ═══════════════════════════════════════════════════════════════════════════ */
function collectScalarFields() {
  const c = currentConfig;
  if (!c.uiConfig) c.uiConfig = JSON.parse(JSON.stringify(MASTER_DEFAULT_CONFIG.uiConfig));

  c.brand.name = $('brand-name')?.value.trim() || 'ApexMobile';
  c.brand.shortName = $('brand-short-name')?.value.trim() || c.brand.name;
  c.brand.tagline = $('brand-tagline')?.value.trim() || 'High-Speed Edge Utility & Package Hub';
  c.brand.contactEmail = $('brand-email')?.value.trim() || 'support@apexmobile.example.com';
  c.brand.logoUrl = $('brand-logo')?.value.trim() || '/assets/app-icon.svg';
  c.brand.faviconUrl = $('brand-favicon')?.value.trim() || c.brand.logoUrl;
  c.brand.searchLogoUrl = $('brand-search-logo')?.value.trim() || c.brand.logoUrl;
  c.brand.appleTouchIconUrl = $('brand-apple-icon')?.value.trim() || c.brand.logoUrl;
  c.brand.accentColor = $('brand-color')?.value.trim() || '#EF4444';
  c.brand.themeColor = $('brand-theme-color')?.value.trim() || c.brand.accentColor;

  c.uiConfig.showHeroSection = Boolean($('ui-show-hero-section')?.checked);
  c.hero.h1 = $('hero-h1')?.value.trim() || '';
  c.hero.metaTitle = $('hero-meta-title')?.value.trim() || '';
  c.hero.metaDescription = $('hero-meta-desc')?.value.trim() || '';
  c.hero.introHtml = $('hero-intro-html')?.value || '';
  c.hero.showBanner = Boolean($('hero-show-banner')?.checked);
  c.hero.bannerImageUrl = $('hero-banner-url')?.value.trim() || '/assets/hero-banner.svg';
  c.hero.bannerAlt = $('hero-banner-alt')?.value.trim() || '';
  c.hero.bannerCaption = $('hero-banner-caption')?.value.trim() || '';

  c.uiConfig.showHeroCtaButtons = Boolean($('ui-show-hero-ctas')?.checked);
  c.hero.secondaryCta.label = $('cta-left-text')?.value.trim() || 'Installation Guide';
  c.hero.secondaryCta.url = $('cta-left-url')?.value.trim() || '#install-guide';
  c.hero.secondaryCta.relSponsored = Boolean($('cta-left-sponsored')?.checked);
  c.hero.primaryCta.label = $('cta-right-text')?.value.trim() || 'Download Official Package';
  c.hero.primaryCta.url = $('cta-right-url')?.value.trim() || '#technical-specifications';
  c.hero.primaryCta.relSponsored = Boolean($('cta-right-sponsored')?.checked);
  c.hero.floatingCta.enabled = Boolean($('floating-cta-enabled')?.checked);
  c.hero.floatingCta.label = $('floating-cta-text')?.value.trim() || '⚡ Download';
  c.hero.floatingCta.url = $('floating-cta-url')?.value.trim() || '#technical-specifications';

  // UI Customizer & Hamburger Drawer Fields
  c.uiConfig.maxContainerWidth = $('ui-max-width')?.value || '768px';
  c.uiConfig.fontFamily = $('ui-font-family')?.value || 'system';
  c.uiConfig.baseFontSize = $('ui-font-size')?.value || '16px';
  c.uiConfig.pageBackgroundColor = $('ui-bg-page')?.value.trim() || '#F8FAFC';
  c.uiConfig.surfaceBackgroundColor = $('ui-bg-surface')?.value.trim() || '#FFFFFF';
  c.uiConfig.headerBackgroundColor = $('ui-header-bg')?.value.trim() || '#FFFFFF';
  c.uiConfig.headerTextColor = $('ui-header-text')?.value.trim() || '#111827';
  c.uiConfig.footerBackgroundColor = $('ui-footer-bg')?.value.trim() || '#F9FAFB';
  c.uiConfig.footerTextColor = $('ui-footer-text')?.value.trim() || '#4B5563';
  c.uiConfig.borderColor = $('ui-border-color')?.value.trim() || '#E5E7EB';
  c.uiConfig.cardBorderRadius = $('ui-card-radius')?.value || '12px';
  c.uiConfig.buttonTextColor = $('ui-btn-text-color')?.value.trim() || '#FFFFFF';
  c.uiConfig.textColor = $('ui-text-color')?.value.trim() || '#1F2937';
  c.uiConfig.headingColor = $('ui-heading-color')?.value.trim() || '#111827';
  c.uiConfig.headerNewsButtonLabel = $('ui-header-news-label')?.value.trim() || 'News';
  c.uiConfig.homepageNewsLimit = Math.max(1, Number($('ui-home-news-limit')?.value) || 5);
  c.uiConfig.newsReadMoreLabel = $('ui-news-readmore')?.value.trim() || 'Read Full News Article →';
  c.uiConfig.newsViewAllLabel = $('ui-news-viewall')?.value.trim() || 'View All Daily News →';
  c.uiConfig.backToHomeLabel = $('ui-back-home-label')?.value.trim() || '← Back to Main Page';
  c.uiConfig.allNewsBreadcrumbLabel = $('ui-all-news-label')?.value.trim() || 'All Daily News →';
  c.uiConfig.showHeaderNewsButton = Boolean($('ui-show-header-news')?.checked);
  c.uiConfig.showNewsCountInHeader = Boolean($('ui-show-news-count')?.checked);
  c.uiConfig.autoIncludeSectionsInDrawer = Boolean($('ui-drawer-auto-sections')?.checked);
  c.uiConfig.showNewsInDrawer = Boolean($('ui-drawer-show-news')?.checked);
  c.uiConfig.showLegalLinksInDrawer = Boolean($('ui-drawer-show-legal')?.checked);
  c.uiConfig.showCtaInDrawer = Boolean($('ui-drawer-show-cta')?.checked);
  c.uiConfig.stickyHeader = Boolean($('ui-sticky-header')?.checked);
  c.uiConfig.showBreadcrumbs = Boolean($('ui-show-breadcrumbs')?.checked);
  c.uiConfig.showSubpageSwitcherPills = Boolean($('ui-show-subpage-pills')?.checked);
  c.uiConfig.showTocJumpBar = Boolean($('ui-show-toc-bar')?.checked);
  c.uiConfig.enableFaqAccordion = Boolean($('ui-enable-faq-accordion')?.checked);
  c.uiConfig.showFooterDisclaimer = Boolean($('ui-show-footer-disclaimer')?.checked);
  c.uiConfig.showFooterLinksHeading = Boolean($('ui-show-footer-links-heading')?.checked);

  if (!c.packageSpecs) c.packageSpecs = { ...MASTER_DEFAULT_CONFIG.packageSpecs };
  c.packageSpecs.enabled = Boolean($('specs-enabled')?.checked);
  c.packageSpecs.heading = $('specs-heading')?.value.trim() || 'Technical Package Specifications';
  c.packageSpecs.appName = $('specs-app-name')?.value.trim() || c.brand.name;
  c.packageSpecs.version = $('specs-version')?.value.trim() || 'v4.8.2';
  c.packageSpecs.fileSize = $('specs-size')?.value.trim() || '64.2 MB';
  c.packageSpecs.operatingSystem = $('specs-os')?.value.trim() || 'Android 9.0+ / iOS 15.0+';
  c.packageSpecs.packageFormat = $('specs-format')?.value.trim() || 'Signed Package';
  c.packageSpecs.license = $('specs-license')?.value.trim() || 'Freeware';
  c.packageSpecs.securityStatus = $('specs-security')?.value.trim() || 'Verified Clean (0/72 Engines)';
  c.packageSpecs.lastUpdated = $('specs-updated')?.value.trim() || 'November 4, 2026';
  c.packageSpecs.sha256 = $('specs-sha256')?.value.trim() || '';
  c.packageSpecs.metaTitle = $('specs-meta-title')?.value.trim() || '';
  c.packageSpecs.metaDescription = $('specs-meta-desc')?.value.trim() || '';

  c.newsSection.enabled = Boolean($('news-enabled')?.checked);
  c.newsSection.heading = $('news-heading')?.value.trim() || 'Daily News & Release Updates';
  c.newsSection.metaTitle = $('news-meta-title')?.value.trim() || '';
  c.newsSection.metaDescription = $('news-meta-desc')?.value.trim() || '';

  c.content.rawHtml = $('global-raw-html')?.value || '';

  c.faqsSection.enabled = Boolean($('faqs-enabled')?.checked);
  c.faqsSection.heading = $('faqs-heading')?.value.trim() || 'Frequently Asked Questions';
  c.faqsSection.metaTitle = $('faqs-meta-title')?.value.trim() || '';
  c.faqsSection.metaDescription = $('faqs-meta-desc')?.value.trim() || '';

  c.navigation.showFooterBrandSummary = Boolean($('nav-show-footer-summary')?.checked);
  c.navigation.showFooterContactEmail = Boolean($('nav-show-footer-email')?.checked);
  c.navigation.footerSummary = $('nav-footer-summary')?.value.trim() || '';
  c.navigation.disclaimerHeading = $('footer-disclaimer-heading')?.value.trim() || 'Legal & Trademark Disclaimer';
  c.navigation.siteLinksHeading = $('footer-links-heading')?.value.trim() || 'Official Legal & Support Pages';
  c.navigation.disclaimerMetaTitle = $('footer-meta-title')?.value.trim() || '';
  c.navigation.disclaimerMetaDescription = $('footer-meta-desc')?.value.trim() || '';
  c.navigation.disclaimer = $('footer-disclaimer-text')?.value.trim() || '';
  c.navigation.copyright = $('footer-copyright-text')?.value.trim() || '';

  // GitHub Fine-Grained Token Static Publisher Settings
  if (!c.githubConfig) c.githubConfig = { ...MASTER_DEFAULT_CONFIG.githubConfig };
  c.githubConfig.fineGrainedToken = $('gh-token')?.value.trim() || '';
  c.githubConfig.repoOwner = $('gh-owner')?.value.trim() || '';
  c.githubConfig.repoName = $('gh-repo')?.value.trim() || '';
  c.githubConfig.branch = $('gh-branch')?.value.trim() || 'main';
  c.githubConfig.targetDirectory = $('gh-dir')?.value.trim() ?? 'dist-public';
  c.githubConfig.commitMessageTemplate =
    $('gh-commit-msg')?.value.trim() ||
    'chore(static-publish): update compiled static public pages from Admin Studio';
  c.githubConfig.autoPushOnPublish = Boolean($('gh-auto-push')?.checked);

  if (!c.domainConfig) c.domainConfig = { ...MASTER_DEFAULT_CONFIG.domainConfig };
  const primaryDom =
    $('domain-primary')?.value.trim() || $('seo-canonical')?.value.trim() || 'https://apexmobile.example.com';
  c.domainConfig.primaryDomain = primaryDom;
  c.domainConfig.googleAnalyticsId = $('domain-ga-id')?.value.trim() || '';
  c.domainConfig.googleSiteVerification = $('domain-gsc')?.value.trim() || '';
  c.domainConfig.bingSiteVerification = $('domain-bing')?.value.trim() || '';
  c.domainConfig.enableImageSitemap = Boolean($('domain-image-sitemap')?.checked);
  c.domainConfig.enableSitemapXml = Boolean($('domain-enable-sitemap')?.checked);
  c.domainConfig.enableRssFeed = Boolean($('domain-enable-rss')?.checked);
  c.domainConfig.enableWebManifest = Boolean($('domain-web-manifest')?.checked);
  c.domainConfig.forceHttps = Boolean($('domain-force-https')?.checked);
  c.domainConfig.enableAutoInternalLinks = Boolean($('domain-auto-internal-links')?.checked);
  c.domainConfig.customRobotsTxt = $('domain-robots-txt')?.value || '';

  c.seo.metaTitle = $('seo-meta-title')?.value.trim() || c.hero.metaTitle || c.hero.h1;
  c.seo.metaDescription = $('seo-meta-desc')?.value.trim() || c.hero.metaDescription;
  c.seo.canonicalUrl = primaryDom;
  c.seo.ogImageUrl = $('seo-og-image')?.value.trim() || c.hero.bannerImageUrl;

  c.seo.enableSoftwareSchema = Boolean($('schema-app-enabled')?.checked);
  c.seo.softwareDetails.name = $('schema-app-name')?.value.trim() || c.brand.name;
  c.seo.softwareDetails.operatingSystem = $('schema-app-os')?.value.trim() || 'Android 9.0+, iOS 15.0+';
  c.seo.softwareDetails.applicationCategory = $('schema-app-category')?.value.trim() || 'UtilitiesApplication';
  c.seo.softwareDetails.price = $('schema-app-price')?.value.trim() || '0.00';
  c.seo.softwareDetails.priceCurrency = $('schema-app-currency')?.value.trim() || 'USD';
  c.seo.softwareDetails.ratingValue = $('schema-app-rating')?.value.trim() || '4.9';
  c.seo.softwareDetails.reviewCount = $('schema-app-votes')?.value.trim() || '18420';
  c.seo.rawJsonLd = $('seo-raw-jsonld')?.value.trim() || '';

  if (!c.securityGate) c.securityGate = { ...MASTER_DEFAULT_CONFIG.securityGate };
  c.securityGate.enabled = Boolean($('sec-enabled')?.checked);
  c.securityGate.showSpecsOnGateway = Boolean($('sec-show-specs')?.checked);
  c.securityGate.devicePolicyMode =
    $('sec-device-policy')?.value === 'strict_mobile_only' ? 'strict_mobile_only' : 'universal_human';
  c.securityGate.proceedButtonLabel = $('sec-btn-label')?.value.trim() || 'PROCEED';
  c.securityGate.customHeading = $('sec-custom-heading')?.value.trim() || '';
  c.securityGate.customNoteHtml = $('sec-custom-note')?.value || '';
  c.securityGate.appSlug = generateSlug($('sec-app-slug')?.value.trim() || c.brand.shortName || c.brand.name || 'apexmobile') || 'apexmobile';
  c.securityGate.appSerialId = $('sec-serial-id')?.value.trim() || 'APM-482';

  let resolvedProtectedUrl =
    $('sec-primary-url')?.value.trim() ||
    c.securityGate.primaryDownloadUrl ||
    '';
  if (c.securityGate.enabled) {
    const rawHeroUrl = c.hero.primaryCta.url.trim();
    const rawFloatUrl = c.hero.floatingCta.url.trim();
    if (rawHeroUrl && rawHeroUrl !== '/moreinfo' && !rawHeroUrl.startsWith('#')) {
      resolvedProtectedUrl = rawHeroUrl;
      c.hero.primaryCta.url = '/moreinfo';
      setVal('cta-right-url', '/moreinfo');
    } else if (rawFloatUrl && rawFloatUrl !== '/moreinfo' && !rawFloatUrl.startsWith('#')) {
      resolvedProtectedUrl = rawFloatUrl;
      c.hero.floatingCta.url = '/moreinfo';
      setVal('floating-cta-url', '/moreinfo');
    }
  }
  c.securityGate.primaryDownloadUrl = resolvedProtectedUrl;
  setVal('sec-primary-url', resolvedProtectedUrl);

  c.securityGate.encryptedPrimaryUrl = $('sec-encrypted-url')?.value.trim() || '';
  const resolvedSiteKey = $('sec-turnstile-site-key')?.value.trim() || '';
  const resolvedSecretKey = $('sec-turnstile-secret-key')?.value.trim() || '';
  c.securityGate.turnstileSiteKey = resolvedSiteKey;
  c.securityGate.turnstileSecretKey = resolvedSecretKey;
  c.securityGate.isPaused = Boolean($('sec-paused')?.checked);
  c.securityGate.isComingSoon = Boolean($('sec-coming-soon')?.checked);
  c.securityGate.dailyIssueCap = Math.max(0, Number($('sec-daily-cap')?.value) || 0);
  c.securityGate.unavailableMessage = $('sec-unavailable-msg')?.value.trim() || '';
  c.securityGate.helplineWhatsapp = $('sec-whatsapp')?.value.trim() || '';
  c.securityGate.helplineTelegram = $('sec-telegram')?.value.trim() || '';
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

  if (!gh.fineGrainedToken || !gh.repoOwner || !gh.repoName) {
    if (feedbackEl) {
      feedbackEl.style.display = 'block';
      feedbackEl.innerHTML = `<strong style="color:#b91c1c;">Missing GitHub Details:</strong> Please enter your Fine-Grained Token, GitHub Owner, and Repository Name above first.`;
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
    if (feedbackEl) {
      feedbackEl.style.display = 'block';
      if (res.success) {
        feedbackEl.innerHTML = `
          <div style="color:#065f46; font-weight:700;">✓ Connected to GitHub Repository: ${escapeHtml(
            res.fullName || `${gh.repoOwner}/${gh.repoName}`
          )}</div>
          <div style="font-size:0.78rem; color:var(--text-sub); margin-top:4px;">
            Visibility: ${res.private ? 'Private' : 'Public'} • Default Branch: <code>${escapeHtml(
          res.defaultBranch || 'main'
        )}</code> • Fine-Grained Token Write Permission: <strong>${res.canPush ? 'Verified ✓' : 'Read-Only ⚠️'}</strong>
          </div>
        `;
        showToast('GitHub repository access verified!', 'success');
      } else {
        feedbackEl.innerHTML = `<strong style="color:#b91c1c;">GitHub Verification Failed:</strong> ${escapeHtml(
          res.error || 'Unable to verify repository.'
        )}`;
        showToast(res.error || 'GitHub verification failed', 'error');
      }
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🔍 Verify GitHub Token & Repo Access';
    }
  }
}

function renderStaticBundleInspector(bundleData) {
  const box = $('static-bundle-inspector-box');
  const tbody = $('static-bundle-tbody');
  const countTag = $('static-bundle-count-tag');
  if (!box || !tbody || !bundleData || !Array.isArray(bundleData.filesList)) return;

  box.style.display = 'block';
  if (countTag) {
    countTag.textContent = `${bundleData.totalFiles || bundleData.filesList.length} static public files`;
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
    const token = localStorage.getItem('cms_admin_bearer_token') || '';
    const res = await fetch('/api/static-bundle', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    const data = await res.json().catch(() => null);
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

async function handleCompileAndPushToGitHub() {
  collectScalarFields();
  currentConfig.updatedAt = Date.now();

  const btn = $('btn-publish-github');
  const feedbackEl = $('gh-verify-feedback');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Compiling Static HTML & Pushing to GitHub...';
  }

  try {
    // 1. Save live config to Firebase + Server first
    await saveSiteConfigRemote(currentConfig);

    // 2. Compile & Push static files to GitHub
    const res = await publishStaticSiteToGitHubRemote(currentConfig.githubConfig, currentConfig);

    if (res?.compiledBundle) {
      renderStaticBundleInspector(res.compiledBundle);
    }

    if (feedbackEl) {
      feedbackEl.style.display = 'block';
      if (res.success) {
        feedbackEl.innerHTML = `
          <div style="color:#065f46; font-weight:700;">Successfully Compiled &amp; Pushed ${
            res.filesCount || 0
          } Static Files to GitHub!</div>
          <div style="font-size:0.78rem; color:var(--text-sub); margin-top:4px;">
            Commit SHA: <code>${escapeHtml((res.commitSha || '').slice(0, 10))}</code> •
            <a href="${escapeHtml(
              res.commitUrl || '#'
            )}" target="_blank" rel="noopener" style="color:var(--accent); font-weight:700;">Open Commit on GitHub ↗</a>
          </div>
        `;
        const latest = await getSiteConfigRemote();
        if (latest) {
          currentConfig = mergeSiteConfig(latest, MASTER_DEFAULT_CONFIG);
          renderGitHubDeployHistory();
        }
        markClean('Saved to Live Admin & pushed 100% static site to GitHub!');
        showToast(`Pushed ${res.filesCount || 0} static files to GitHub!`, 'success');
      } else {
        feedbackEl.innerHTML = `
          <div style="color:#b91c1c; font-weight:700;">Local Static Bundle Compiled (${
            res.compiledLocalFiles || 0
          } files in /dist-public), but GitHub Push Needs Token:</div>
          <div style="font-size:0.78rem; color:var(--text-sub); margin-top:4px;">${escapeHtml(
            res.error || 'Check your GitHub Fine-Grained Token, Owner, and Repo Name.'
          )}</div>
        `;
        showToast(res.error || 'GitHub push failed — check token & repo settings', 'error');
      }
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Compile & Push Static Website to GitHub Now';
    }
  }
}

async function handleSaveAndPublish() {
  collectScalarFields();
  currentConfig.updatedAt = Date.now();

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
    const res = await saveSiteConfigRemote(currentConfig);
    if (res && res.success === false) {
      showToast(res.error || 'Saved locally, but server sync returned a warning.', 'error');
    } else {
      if (res?.config) {
        currentConfig = mergeSiteConfig(res.config, MASTER_DEFAULT_CONFIG);
        setVal('sec-encrypted-url', currentConfig.securityGate?.encryptedPrimaryUrl || '');
        setVal('sec-primary-url', currentConfig.securityGate?.primaryDownloadUrl || '');
      }
      const ghMsg = res?.githubPush?.success
        ? ` + Pushed ${res.staticBundle?.totalFiles || ''} static files to GitHub!`
        : ` (${res?.staticBundle?.totalFiles || 9} static routes compiled)`;
      markClean(`Published to Live Admin & compiled static public website${ghMsg}`);
      showToast(`Published & compiled static website${ghMsg}`, 'success');
    }
    renderGitHubDeployHistory();
    refreshOverviewAndSeoAudit();
  } catch (err) {
    showToast(err.message || 'Error saving configuration.', 'error');
  } finally {
    if (btnTop) {
      btnTop.disabled = false;
      btnTop.textContent = 'Publish Changes';
    }
    if (btnBottom) {
      btnBottom.disabled = false;
      btnBottom.textContent = 'Publish All Changes';
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

function initAdminEvents() {
  // Global Device Image File Picker Change Handler
  $('global-image-file-picker')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file || !pendingUploadCallback) return;

    showToast('Uploading image...', 'default');
    const result = await uploadImageRemote(file);
    if (result.success && result.url) {
      pendingUploadCallback(result.url);
      markDirty();
      showToast('Image uploaded and linked!', 'success');
    } else {
      showToast(result.error || 'Image upload failed.', 'error');
    }
    pendingUploadCallback = null;
  });

  // Insert Image Modal Controls
  $('btn-close-image-modal')?.addEventListener('click', closeInsertImageModal);
  $('btn-confirm-insert-image')?.addEventListener('click', confirmInsertImageFromModal);
  $('modal-img-url')?.addEventListener('input', (e) => {
    if ($('modal-img-preview')) $('modal-img-preview').src = e.target.value.trim();
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
    const brandName = ($('qc-brand-name')?.value || '').trim() || c.brand.name || 'ApexMobile';
    const ver = ($('qc-version')?.value || '').trim() || c.packageSpecs.version || 'v4.8.2';
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
    c.domainConfig.customRobotsTxt = `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /moreinfo\nDisallow: /download\nDisallow: /api/\n\nSitemap: ${cleanOrigin}/sitemap.xml`;
    c.navigation.copyright = `© ${new Date().getFullYear()} ${brandName}. All Rights Reserved.`;
    c.pages = (c.pages || []).map((pg) => {
      if (pg.slug.includes('privacy')) return { ...pg, metaTitle: `Privacy Policy | ${brandName}`, htmlContent: generateSmartLegalHtml('privacy', brandName, cleanOrigin, email) };
      if (pg.slug.includes('terms')) return { ...pg, metaTitle: `Terms and Conditions | ${brandName}`, htmlContent: generateSmartLegalHtml('terms', brandName, cleanOrigin, email) };
      if (pg.slug.includes('dmca')) return { ...pg, metaTitle: `DMCA Disclaimer | ${brandName}`, htmlContent: generateSmartLegalHtml('dmca', brandName, cleanOrigin, email) };
      if (pg.slug.includes('contact')) return { ...pg, metaTitle: `Contact Support | ${brandName}`, htmlContent: generateSmartLegalHtml('contact', brandName, cleanOrigin, email) };
      return pg;
    });

    populateAllFields();
    markDirty(`Master Clone applied for "${brandName}" — click "Publish All Changes" to go live`);
    showToast(`Re-branded entire site to "${brandName}" (${ver})!`, 'success');
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
      markDirty();
      showToast(`Added "${row.label}" specification row!`, 'success');
    });
  });

  document.querySelectorAll('[data-faq-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = btn.getAttribute('data-faq-preset');
      const brandName = currentConfig.brand?.name || 'ApexMobile';
      const ver = currentConfig.packageSpecs?.version || 'v4.8.2';
      const map = {
        free: {
          question: `Is ${brandName} completely free to download and use?`,
          answer: `Yes, the official ${brandName} ${ver} package listed on this portal is freeware with zero hidden subscription locks or trial expiration.`
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
          answer: `${brandName} ${ver} supports ${currentConfig.packageSpecs?.operatingSystem || 'Android 9.0+ and iOS 15.0+'} across both smartphone and tablet form factors.`
        }
      };
      const faq = map[preset];
      if (!faq) return;
      currentConfig.faqsSection.items.push({ id: `faq-${Date.now()}`, ...faq });
      renderFaqsList();
      refreshOverviewAndSeoAudit();
      markDirty();
      showToast('Added quick FAQ item!', 'success');
    });
  });

  document.querySelectorAll('[data-page-template]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tpl = btn.getAttribute('data-page-template');
      const brandName = currentConfig.brand?.name || 'ApexMobile';
      const email = currentConfig.brand?.contactEmail || 'support@example.com';
      const nowMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const tplMap = {
        about: {
          label: 'About Us',
          slug: 'about-us',
          h1: `About ${brandName}`,
          subtitle: `Official Verified Portal & Engineering Mission`,
          metaTitle: `About ${brandName} | Verified Portal`,
          metaDescription: `Learn about the engineering mission, checksum transparency, and editorial standards of ${brandName}.`,
          htmlContent: `<h2>Who We Are</h2>\n<p>${brandName} publishes cryptographically verified mobile release packages, documentation, and daily changelogs with strict zero-telemetry standards.</p>\n<h2>Contact & Transparency</h2>\n<p>Reach our editorial and engineering desk anytime at <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>.</p>`
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
      markDirty();
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

  // GitHub Fine-Grained Token Publisher & Static Bundle Inspector Buttons
  $('btn-verify-github')?.addEventListener('click', handleVerifyGitHubAccess);
  $('btn-publish-github')?.addEventListener('click', handleCompileAndPushToGitHub);
  $('btn-inspect-static-bundle')?.addEventListener('click', handleInspectStaticBundle);

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
      const token = localStorage.getItem('cms_admin_bearer_token') || '';
      const res = await fetch('/api/admin/encrypt-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ url: rawUrl })
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && data?.encryptedUrl) {
        setVal('sec-encrypted-url', data.encryptedUrl);
        collectScalarFields();
        markDirty('Encrypted download URL into AES-256-GCM v2 vault — click Publish to save');
        showToast('URL encrypted with AES-256-GCM (v2.<iv>.<cipher>)!', 'success');
      } else {
        showToast(data?.error || 'Encryption failed.', 'error');
      }
    } catch {
      showToast('Network error encrypting URL.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '🔒 Encrypt URL with AES-256-GCM Now';
      }
    }
  });

  // Admin Hamburger Menu Drawer Toggle & Close
  $('admin-hamburger-btn')?.addEventListener('click', toggleAdminNavDrawer);
  $('admin-drawer-close')?.addEventListener('click', closeAdminNavDrawer);
  $('admin-nav-backdrop')?.addEventListener('click', closeAdminNavDrawer);

  // Auth mode tabs
  $('tab-auth-credentials')?.addEventListener('click', () => setAuthMode('credentials'));
  $('tab-auth-apikey')?.addEventListener('click', () => setAuthMode('apikey'));
  $('auth-form')?.addEventListener('submit', handleLoginSubmit);

  // Logout
  $('btn-logout')?.addEventListener('click', async () => {
    await logoutAdminUser();
    if ($('cms-shell')) $('cms-shell').hidden = true;
    if ($('auth-overlay')) $('auth-overlay').hidden = false;
    showToast('Signed out of Admin Studio');
  });

  // Desktop Sidebar & Hamburger Drawer Tab Navigation
  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab) switchTab(btn.dataset.tab);
    });
  });

  // Workspace 2 (Brand & Colors) Sub-Card Filter Pills
  document.querySelectorAll('[data-brand-subtab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const subKey = btn.getAttribute('data-brand-subtab') || 'all';
      filterBrandSubcards(subKey);
    });
  });

  // Workspace 8 (Security, SEO & Deploy) Sub-Card Filter Pills
  document.querySelectorAll('[data-domain-subtab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const subKey = btn.getAttribute('data-domain-subtab') || 'all';
      filterDomainSubcards(subKey);
    });
  });

  // Quick Jump Buttons on Overview Panel & Topbar
  document.querySelectorAll('[data-jump-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-jump-tab');
      if (targetTab) switchTab(targetTab);
    });
  });

  // Save Buttons
  $('btn-top-save')?.addEventListener('click', handleSaveAndPublish);
  $('btn-bottom-save')?.addEventListener('click', handleSaveAndPublish);

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
    if ($('composer-news-cover-preview')) {
      $('composer-news-cover-preview').src = e.target.value.trim();
    }
  });

  $('hero-banner-url')?.addEventListener('input', (e) => {
    if ($('hero-banner-preview')) {
      $('hero-banner-preview').src = e.target.value.trim();
    }
  });

  $('btn-news-autofill-seo')?.addEventListener('click', () => {
    const headline = $('composer-news-title')?.value.trim() || '';
    const summary = $('composer-news-summary')?.value.trim() || '';
    const brandName = currentConfig.brand?.name || 'ApexMobile';
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
    markDirty();
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
    markDirty();
  });

  // Add Blank Section
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
    renderSectionsList();
    refreshOverviewAndSeoAudit();
    markDirty();
    showToast('Added new content section');
  });

  // 1-Click Section Templates
  document.querySelectorAll('[data-section-template]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tpl = btn.getAttribute('data-section-template');
      const brandName = currentConfig.brand?.name || 'ApexMobile';
      const ver = currentConfig.packageSpecs?.version || 'v4.8.2';
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
        renderSectionsList();
        refreshOverviewAndSeoAudit();
        markDirty();
        showToast(`Added "${newSec.heading}" section template!`, 'success');
      }
    });
  });

  // 1-Click Daily News Composer Templates
  document.querySelectorAll('[data-news-template]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tpl = btn.getAttribute('data-news-template');
      const brandName = currentConfig.brand?.name || 'ApexMobile';
      const ver = currentConfig.packageSpecs?.version || 'v4.8.2';
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

  // Add FAQ
  $('btn-add-faq')?.addEventListener('click', () => {
    const num = (currentConfig.faqsSection?.items?.length || 0) + 1;
    currentConfig.faqsSection.items.push({
      id: `faq-${Date.now()}`,
      question: `Frequently Asked Question #${num}?`,
      answer: `Clear, direct answer to question #${num} for visitors and Google FAQPage schema.`
    });
    renderFaqsList();
    refreshOverviewAndSeoAudit();
    markDirty();
    showToast('Added new FAQ question');
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
    markDirty();
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
    markDirty();
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
    markDirty();
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
    markDirty();
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
    markDirty();
    showToast('Added smart internal link rule');
  });

  // 1-Tap Color Theme Presets
  document.querySelectorAll('[data-theme-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = btn.getAttribute('data-theme-preset');
      if (preset) applyColorThemePreset(preset);
    });
  });

  // Color Picker Two-Way Binding (`data-color-sync`) with 60fps requestAnimationFrame throttling
  let colorRafId = 0;
  document.querySelectorAll('[data-color-sync]').forEach((picker) => {
    picker.addEventListener('input', (e) => {
      const targetId = picker.getAttribute('data-color-sync');
      const val = e.target.value.toUpperCase();
      if (colorRafId) cancelAnimationFrame(colorRafId);
      colorRafId = requestAnimationFrame(() => {
        const txt = targetId ? $(targetId) : null;
        if (txt) txt.value = val;
        updateLiveThemePreviewCard();
        markDirty();
      });
    });
  });

  // Live Theme Preview updates when typing hex colors or changing radius/brand name
  ['brand-name', 'brand-color', 'brand-theme-color', 'ui-bg-page', 'ui-bg-surface', 'ui-border-color', 'ui-header-bg', 'ui-header-text', 'ui-btn-text-color', 'ui-footer-bg', 'ui-footer-text', 'ui-text-color', 'ui-heading-color', 'ui-card-radius'].forEach((id) => {
    $(id)?.addEventListener('input', () => {
      if (colorRafId) cancelAnimationFrame(colorRafId);
      colorRafId = requestAnimationFrame(() => {
        syncColorPickersFromTextInputs();
      });
    });
  });

  // Delegated Clicks (Upload Buttons, Image Modal, Visual Block Modal, Legal Page Selector, Accordion, Move, Delete, Snippets)
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    // 1. Device Image Upload Button for Scalar Input (`data-upload-target`)
    const scalarUploadBtn = target.closest('[data-upload-target]');
    if (scalarUploadBtn) {
      e.preventDefault();
      const inputId = scalarUploadBtn.getAttribute('data-upload-target');
      const previewId = scalarUploadBtn.getAttribute('data-preview-target');
      triggerDeviceImageUpload((uploadedUrl) => {
        if (inputId && $(inputId)) {
          $(inputId).value = uploadedUrl;
        }
        if (previewId && $(previewId)) {
          $(previewId).src = uploadedUrl;
        }
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
        rerenderCollection(col);
        syncUrlQuickPickers();
        markDirty();
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
      const brandName = currentConfig.brand?.name || 'ApexMobile';
      if (list && list[idx]) {
        const item = list[idx];
        const title = item.heading || item.title || item.h1 || item.label || brandName;
        item.metaTitle = `${title} | ${brandName}`;
        item.metaDescription =
          item.summary ||
          `${title} — official verified documentation, updates, and resources from ${brandName}.`;
        rerenderCollection(col);
        markDirty();
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
        markDirty();
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
      markDirty();
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

      if (action === 'delete') {
        list.splice(idx, 1);
        if (collection === 'pages') {
          activeLegalPageIndex = Math.max(0, Math.min(activeLegalPageIndex, list.length - 1));
        }
        rerenderCollection(collection);
        syncUrlQuickPickers();
        markDirty();
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
        rerenderCollection(collection);
        syncUrlQuickPickers();
        markDirty();
        showToast('Duplicated item cleanly!', 'success');
      } else if ((action === 'move-up' || action === 'move-left') && idx > 0) {
        [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]];
        if (collection === 'pages') activeLegalPageIndex = idx - 1;
        rerenderCollection(collection);
        markDirty();
      } else if ((action === 'move-down' || action === 'move-right') && idx < list.length - 1) {
        [list[idx + 1], list[idx]] = [list[idx], list[idx + 1]];
        if (collection === 'pages') activeLegalPageIndex = idx + 1;
        rerenderCollection(collection);
        markDirty();
      }
      return;
    }

    // 13. Accordion Card Expand / Collapse
    const header = target.closest('[data-toggle-card]');
    if (header) {
      const card = header.closest('.item-card');
      if (card) {
        card.classList.toggle('open');
        const chevron = card.querySelector('[data-card-chevron]');
        if (chevron) {
          chevron.textContent = card.classList.contains('open') ? 'Hide ▲' : 'Edit ▼';
        }
      }
    }
  });

  // Quick-Pick Route Dropdown Handler (`data-url-picker-for` and `data-url-index-for`)
  document.addEventListener('change', (e) => {
    const sel = e.target;
    if (!(sel instanceof HTMLSelectElement)) return;
    const pickedUrl = sel.value;
    if (!pickedUrl) return;

    const scalarTargetId = sel.getAttribute('data-url-picker-for');
    if (scalarTargetId && $(scalarTargetId)) {
      $(scalarTargetId).value = pickedUrl;
      sel.value = '';
      markDirty();
      showToast(`Selected route: ${pickedUrl}`, 'success');
      return;
    }

    const collTargetId = sel.getAttribute('data-url-index-for');
    if (collTargetId) {
      const inp = $(collTargetId);
      if (inp) inp.value = pickedUrl;
      const col = sel.getAttribute('data-collection');
      const idx = Number(sel.getAttribute('data-index'));
      const key = sel.getAttribute('data-key');
      const list = col ? getCollectionRef(col) : null;
      if (list && list[idx] && key) {
        list[idx][key] = pickedUrl;
      }
      sel.value = '';
      markDirty();
      showToast(`Selected route: ${pickedUrl}`, 'success');
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
      $(thumbId).src = target.value.trim();
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
      !target.id?.endsWith('-search-input') &&
      !target.id?.startsWith('preview-')
    ) {
      markDirty();
    }
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
      const testRes = await testFirebaseConnectionRemote(fb);
      populateAllFields();

      if (testRes.success) {
        if (testRes.cloudConfig && (testRes.cloudConfig.updatedAt || 0) > (currentConfig.updatedAt || 0)) {
          currentConfig = mergeSiteConfig(testRes.cloudConfig, MASTER_DEFAULT_CONFIG);
          localStorage.setItem('siteConfig_main', JSON.stringify(currentConfig));
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
  $('btn-clear-firebase')?.addEventListener('click', () => {
    clearActiveFirebaseConfig();
    setVal('fb-snippet-input', '');
    populateAllFields();
    showFirebaseFeedback(
      true,
      'Reverted to .env / Server Defaults',
      'Cleared browser-saved runtime Firebase override.'
    );
    showToast('Reverted Firebase settings to .env defaults');
  });

  // Export Master Site JSON Backup
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
      currentConfig = mergeSiteConfig(parsed, MASTER_DEFAULT_CONFIG);
      populateAllFields();
      markDirty('Imported JSON snapshot — click "Publish All Changes" to compile & go live');
      showToast('Imported JSON configuration successfully!', 'success');
    } catch {
      showToast('Invalid JSON backup file.', 'error');
    }
  });

  // Reset to Master Template
  $('btn-reset-defaults')?.addEventListener('click', async () => {
    const fresh = await resetSiteConfigRemote();
    currentConfig = mergeSiteConfig(fresh, MASTER_DEFAULT_CONFIG);
    populateAllFields();
    markClean('Reset to clean Master Template & recompiled static pages');
    showToast('Reset to clean Master Template', 'success');
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
      label: 'ADMIN_EMAIL & ADMIN_PASSWORD',
      ok: Boolean(diag.adminEmailConfigured && diag.adminPasswordConfigured),
      activeText: 'Custom Env Secrets Set',
      warnText: 'Using Dev Defaults'
    },
    {
      label: 'ADMIN_SESSION_SECRET',
      ok: Boolean(diag.adminSessionSecretCustom),
      activeText: 'Custom HMAC Secret Active',
      warnText: 'Using Built-in Signing Secret'
    },
    {
      label: 'VAULT_ENCRYPTION_SECRET (AES-256-GCM)',
      ok: Boolean(diag.vaultSecretCustom),
      activeText: 'Custom Vault Key Set',
      warnText: 'Using Server Derived Vault Key'
    },
    {
      label: 'Cloudflare Turnstile Keys',
      ok: Boolean(diag.turnstileSiteKeyConfigured || (sec.turnstileSiteKey && sec.turnstileSecretKey)),
      activeText: 'Configured',
      warnText: 'Preview Test Key Active'
    },
    {
      label: 'Firebase Firestore Persistence',
      ok: isRealFirebaseConfig(fb),
      activeText: `Connected (${fb.projectId})`,
      warnText: 'Not Configured (Local Live Store)'
    },
    {
      label: 'GitHub Fine-Grained Token Push',
      ok: Boolean(diag.githubTokenConfigured || gh.fineGrainedToken),
      activeText: gh.repoOwner && gh.repoName ? `Ready (${gh.repoOwner}/${gh.repoName})` : 'Token Configured',
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
  initAdminEvents();
  const session = await verifyAdminSession();
  if (session && session.authenticated) {
    await unlockAdminStudio();
    return;
  }

  const hints = session?.loginHints || {};
  const hintTextEl = $('auth-env-hint-text');
  const statusPillEl = $('auth-env-status-pill');

  if (hints.usingDefaultDevCredentials) {
    if (statusPillEl) statusPillEl.textContent = 'Dev Defaults';
    if (hintTextEl) {
      hintTextEl.innerHTML =
        'Default dev credentials active: <code>admin@domain.com</code> / <code>admin123</code>. Set <code>ADMIN_EMAIL</code> &amp; <code>ADMIN_PASSWORD</code> in <code>.env</code> or Cloudflare Pages for production.';
    }
    const emailInput = $('login-email');
    const passInput = $('login-password');
    if (emailInput && passInput) {
      if (!emailInput.value) emailInput.value = hints.defaultEmailHint || 'admin@domain.com';
      if (!passInput.value) passInput.value = 'admin123';
    }
  } else {
    if (statusPillEl) statusPillEl.textContent = 'Custom Secrets';
    if (hintTextEl) {
      hintTextEl.innerHTML = hints.requiresApiKey
        ? 'Custom environment secrets active. Sign in with <code>ADMIN_EMAIL</code> &amp; <code>ADMIN_PASSWORD</code>, or switch to the <strong>Server API Key</strong> tab.'
        : 'Custom environment secrets active. Sign in with your configured <code>ADMIN_EMAIL</code> &amp; <code>ADMIN_PASSWORD</code>.';
    }
  }
}

bootstrapAdmin();
