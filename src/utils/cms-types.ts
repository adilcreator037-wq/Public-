/**
 * ============================================================================
 * MODULE 1: CMS TYPES, INTERFACES & MASTER DEFAULT TEMPLATE (cms-types.ts)
 * Defines the data structures for:
 * - Live Admin State (stored in Firebase Cloud Firestore `siteConfig/main`)
 * - GitHub Fine-Grained Token Deployment Configuration (`githubConfig`)
 * - Public Static Website Content, UI Theme, News, Package Specs, and Pages
 * ============================================================================
 */

export interface HeaderNavLink {
  id: string;
  label: string;
  url: string;
  metaTitle: string;
  metaDescription: string;
}

export interface ContentSectionItem {
  id: string;
  heading: string;
  slug: string;
  visible?: boolean;
  badgeText?: string;
  metaTitle: string;
  metaDescription: string;
  imageUrl?: string;
  imageAlt?: string;
  imageCaption?: string;
  imagePosition?: 'top' | 'bottom' | 'none';
  ctaLabel?: string;
  ctaUrl?: string;
  htmlContent: string;
}

export interface NewsArticleItem {
  id: string;
  title: string;
  slug: string;
  date: string;
  category: string;
  author?: string;
  readTime?: string;
  featured?: boolean;
  summary: string;
  coverImageUrl?: string;
  coverImageAlt?: string;
  coverImageCaption?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  metaTitle: string;
  metaDescription: string;
  htmlContent: string;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  metaTitle?: string;
  metaDescription?: string;
}

export interface StandalonePageItem {
  id: string;
  label: string;
  slug: string;
  showInFooter?: boolean;
  showInHeader?: boolean;
  openInNewTab: boolean;
  h1: string;
  subtitle?: string;
  bannerImageUrl?: string;
  bannerImageAlt?: string;
  metaTitle: string;
  metaDescription: string;
  lastUpdated: string;
  htmlContent: string;
}

export interface CustomSpecRow {
  label: string;
  value: string;
}

export interface PackageSpecsConfig {
  enabled: boolean;
  heading: string;
  metaTitle: string;
  metaDescription: string;
  appName: string;
  version: string;
  fileSize: string;
  operatingSystem: string;
  packageFormat: string;
  sha256: string;
  license: string;
  lastUpdated: string;
  securityStatus: string;
  customRows?: CustomSpecRow[];
}

export interface InternalLinkRule {
  id: string;
  keyword: string;
  targetUrl: string;
  title?: string;
}

export interface FooterQuickLink {
  id: string;
  label: string;
  url: string;
  openInNewTab?: boolean;
}

export interface DomainSeoConfig {
  primaryDomain: string;
  forceHttps: boolean;
  googleSiteVerification: string;
  bingSiteVerification: string;
  googleAnalyticsId: string;
  enableSitemapXml: boolean;
  enableImageSitemap?: boolean;
  enableWebManifest?: boolean;
  enableRssFeed: boolean;
  enableAutoInternalLinks?: boolean;
  internalLinks?: InternalLinkRule[];
  customRobotsTxt: string;
}

export interface GitHubDeployLogItem {
  id: string;
  timestamp: number;
  status: 'success' | 'local-only' | 'error';
  commitSha?: string;
  commitUrl?: string;
  filesCount: number;
  message: string;
}

export interface GitHubDeployConfig {
  repoOwner: string;
  repoName: string;
  branch: string;
  targetDirectory: string;
  fineGrainedToken: string;
  commitMessageTemplate: string;
  autoPushOnPublish: boolean;
  lastPublishedAt?: number;
  lastCommitSha?: string;
  lastCommitUrl?: string;
  deployHistory?: GitHubDeployLogItem[];
}

export type HomepageBlockKey = 'specs' | 'sections' | 'rawHtml' | 'news' | 'faqs';

export interface SecurityGateConfig {
  /** Whether the v12 7-Gate Protected Download Gateway (/moreinfo) is enabled */
  enabled: boolean;
  /** Primary route path for the isolated security gateway */
  gatewayPath: string;
  /** Short slug identifier used for navigation breadcrumb & rate-limiting keys */
  appSlug: string;
  /** Official serial/release identifier shown on the Gateway card */
  appSerialId: string;
  /** Device policy mode: 'universal_human' (mobile + desktop humans, blocks all bots/headless/ASN) or 'strict_mobile_only' (v12 strict physical touch smartphone lock) */
  devicePolicyMode: 'universal_human' | 'strict_mobile_only';
  /** Plaintext destination download URL (Admin-only; never exposed in public HTML/JSON; auto-encrypted into encryptedPrimaryUrl) */
  primaryDownloadUrl: string;
  /** AES-256-GCM encrypted ciphertext (`v2.<iv>.<cipher>`) decrypted only in RAM at Gate G7 after all 7 gates pass */
  encryptedPrimaryUrl: string;
  /** Public Cloudflare Turnstile Site Key (`0x4...` or blank for auto test key on localhost) */
  turnstileSiteKey: string;
  /** Private Cloudflare Turnstile Secret Key (`0x4...`; server-only, never exposed to public client) */
  turnstileSecretKey: string;
  /** Label shown on the ClearanceButton once Turnstile & 3-second hold complete */
  proceedButtonLabel: string;
  /** Custom notice shown when link issuance is paused or unavailable */
  unavailableMessage: string;
  /** Temporarily pause link dispatch without taking down the page */
  isPaused: boolean;
  /** Mark the release link as Coming Soon */
  isComingSoon: boolean;
  /** Optional daily link issuance cap (0 = unlimited) */
  dailyIssueCap: number;
  /** Optional WhatsApp helpline URL shown in the Gateway support card */
  helplineWhatsapp: string;
  /** Optional Telegram helpline URL shown in the Gateway support card */
  helplineTelegram: string;
  /** Optional custom heading / app title displayed on the /moreinfo page (defaults to brand.name) */
  customHeading?: string;
  /** Optional custom description or HTML note added by Admin on the /moreinfo page (defaults to empty for a minimal UI) */
  customNoteHtml?: string;
  /** Whether to display the SHA-256 & package verification summary table on the /moreinfo Gateway */
  showSpecsOnGateway: boolean;
}

export interface UiCustomizationConfig {
  maxContainerWidth: string;
  pageBackgroundColor: string;
  surfaceBackgroundColor: string;
  headerBackgroundColor?: string;
  headerTextColor?: string;
  footerBackgroundColor?: string;
  footerTextColor?: string;
  borderColor?: string;
  cardBorderRadius?: string;
  buttonTextColor?: string;
  textColor: string;
  headingColor: string;
  fontFamily: 'system' | 'inter' | 'jakarta' | 'serif';
  baseFontSize: string;
  showHeaderNewsButton: boolean;
  headerNewsButtonLabel: string;
  showNewsCountInHeader: boolean;
  autoIncludeSectionsInDrawer?: boolean;
  showNewsInDrawer?: boolean;
  showLegalLinksInDrawer?: boolean;
  showCtaInDrawer?: boolean;
  showHeroSection: boolean;
  showHeroCtaButtons: boolean;
  homepageNewsLimit: number;
  newsReadMoreLabel: string;
  newsViewAllLabel: string;
  backToHomeLabel: string;
  allNewsBreadcrumbLabel: string;
  showSubpageSwitcherPills: boolean;
  showFooterDisclaimer: boolean;
  showFooterLinksHeading: boolean;
  homepageSectionOrder: HomepageBlockKey[];
}

export interface SiteConfig {
  brand: {
    name: string;
    shortName?: string;
    tagline?: string;
    logoUrl: string;
    faviconUrl: string;
    searchLogoUrl?: string;
    appleTouchIconUrl?: string;
    accentColor: string;
    themeColor?: string;
    contactEmail: string;
  };
  uiConfig: UiCustomizationConfig;
  domainConfig: DomainSeoConfig;
  githubConfig: GitHubDeployConfig;
  securityGate: SecurityGateConfig;
  hero: {
    h1: string;
    metaTitle: string;
    metaDescription: string;
    introHtml: string;
    bannerImageUrl: string;
    bannerAlt: string;
    bannerCaption?: string;
    showBanner: boolean;
    secondaryCta: {
      label: string;
      url: string;
      relSponsored: boolean;
    };
    primaryCta: {
      label: string;
      url: string;
      relSponsored: boolean;
    };
    floatingCta: {
      enabled: boolean;
      label: string;
      url: string;
    };
  };
  packageSpecs: PackageSpecsConfig;
  sections: ContentSectionItem[];
  newsSection: {
    enabled: boolean;
    heading: string;
    metaTitle: string;
    metaDescription: string;
    articles: NewsArticleItem[];
  };
  faqsSection: {
    enabled: boolean;
    heading: string;
    metaTitle: string;
    metaDescription: string;
    items: FaqItem[];
  };
  content: {
    rawHtml: string;
  };
  navigation: {
    headerLinks: HeaderNavLink[];
    footerSummary?: string;
    showFooterBrandSummary?: boolean;
    showFooterContactEmail?: boolean;
    footerQuickLinks?: FooterQuickLink[];
    disclaimerHeading: string;
    disclaimerMetaTitle: string;
    disclaimerMetaDescription: string;
    disclaimer: string;
    siteLinksHeading: string;
    copyright: string;
    showAdminLink: boolean;
  };
  pages: StandalonePageItem[];
  seo: {
    metaTitle: string;
    metaDescription: string;
    canonicalUrl: string;
    ogImageUrl: string;
    enableSoftwareSchema: boolean;
    softwareDetails: {
      name: string;
      operatingSystem: string;
      applicationCategory: string;
      ratingValue: string;
      reviewCount: string;
      price: string;
      priceCurrency: string;
    };
    rawJsonLd: string;
  };
  updatedAt: number;
}

/**
 * Cloudinary URL Optimizer Utility
 */
export function optimizeCloudinaryUrl(url: string | undefined | null): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed.includes('res.cloudinary.com')) return trimmed;
  if (trimmed.includes('/f_auto,q_auto/')) return trimmed;

  const uploadToken = '/image/upload/';
  const uploadIndex = trimmed.indexOf(uploadToken);
  if (uploadIndex === -1) return trimmed;

  const prefix = trimmed.substring(0, uploadIndex + uploadToken.length);
  const suffix = trimmed.substring(uploadIndex + uploadToken.length);
  return `${prefix}f_auto,q_auto/${suffix}`;
}

/**
 * Generate URL-safe slug from any text
 */
export function generateSlug(text: string | undefined | null): string {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Escape HTML attribute strings safely
 */
export function escapeHtml(str: string | undefined | null): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Normalize a domain or canonical URL
 */
export function normalizeDomainUrl(rawDomain: string | undefined | null, forceHttps = true): string {
  if (!rawDomain || !rawDomain.trim()) return 'https://apexmobile.example.com';
  let cleaned = rawDomain.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = `${forceHttps ? 'https' : 'http'}://${cleaned}`;
  } else if (forceHttps && cleaned.startsWith('http://') && !cleaned.includes('localhost')) {
    cleaned = cleaned.replace(/^http:\/\//i, 'https://');
  }
  return cleaned;
}

/**
 * Resolve Font Stack CSS value from fontFamily key
 */
export function resolveFontStackCss(fontFamily?: string): string {
  switch (fontFamily) {
    case 'inter':
      return '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    case 'jakarta':
      return '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    case 'serif':
      return 'Georgia, Cambria, "Times New Roman", Times, serif';
    default:
      return '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  }
}

/**
 * Generate Smart Legal HTML Documents dynamically tailored to Brand Name, Domain & Email
 */
export function generateSmartLegalHtml(
  docType: 'privacy' | 'terms' | 'dmca' | 'contact',
  brandName: string,
  canonicalUrl: string,
  contactEmail: string,
  effectiveDate = 'November 2026'
): string {
  const brand = brandName || 'ApexMobile';
  const domain = normalizeDomainUrl(canonicalUrl);
  const email = contactEmail || 'support@apexmobile.example.com';

  if (docType === 'privacy') {
    return `
<h2>1. Privacy Policy &amp; Data Protection Overview</h2>
<p>Welcome to <strong>${brand}</strong> (<a href="${domain}">${domain}</a>). Protecting your privacy and keeping your browsing experience secure is our top priority. This Privacy Policy explains how information is handled when you visit our website and download our software packages.</p>

<h3>Information We Collect</h3>
<p>We do not require account registration or collect personal identity documents to browse our guides or download public releases. Standard edge server logs (such as anonymized IP region, browser user-agent, and referring URLs) are processed strictly to maintain network security, DDoS mitigation, and service reliability.</p>

<h3>Static Zero-Tracking Architecture</h3>
<p>Our public website is pre-compiled as pure static HTML with zero third-party tracking scripts or database calls in the browser. We do not sell, rent, or trade user data to third-party data brokers.</p>

<h3>Cryptographic Package Verification</h3>
<p>All files distributed through ${brand} are verified with SHA-256 checksums. Users are encouraged to verify package hashes prior to installation.</p>

<h3>Your Privacy Rights &amp; Contact Information</h3>
<p>If you have any questions about this Privacy Policy, GDPR/CCPA compliance, or wish to contact our data protection officer, please email us directly at <a href="mailto:${email}">${email}</a>.</p>
<p><em>Effective &amp; Last Updated: ${effectiveDate}</em></p>
    `.trim();
  }

  if (docType === 'terms') {
    return `
<h2>1. Acceptance of Terms &amp; Conditions</h2>
<p>By accessing and using <strong>${brand}</strong> (<a href="${domain}">${domain}</a>), you agree to comply with and be bound by these Terms and Conditions. If you disagree with any part of these terms, please discontinue use of our website immediately.</p>

<h3>Use of Content, Software Guides &amp; Mirrors</h3>
<p>All content published on ${brand}, including installation tutorials, technical specifications, daily news updates, and FAQs, is provided for informational and educational purposes. You may not scrape, mirror, or redistribute our original articles without prior written consent.</p>

<h3>Device Compatibility &amp; User Responsibility</h3>
<p>Users are responsible for verifying that their smartphone or tablet meets the minimum operating system requirements outlined in our Technical Specifications table before installing any package.</p>

<h3>Limitation of Liability</h3>
<p>${brand} provides software documentation and distribution mirrors on an "as-is" basis without warranties of any kind. In no event shall ${brand} or its contributors be liable for any direct or indirect damages arising from the use of materials on this site.</p>

<h3>Contact &amp; Legal Notices</h3>
<p>We may update these Terms &amp; Conditions periodically. For legal inquiries, please contact <a href="mailto:${email}">${email}</a>.</p>
    `.trim();
  }

  if (docType === 'dmca') {
    return `
<h2>1. DMCA Copyright &amp; Intellectual Property Policy</h2>
<p><strong>${brand}</strong> (<a href="${domain}">${domain}</a>) respects the intellectual property rights of software developers and content creators and complies fully with the Digital Millennium Copyright Act (DMCA).</p>

<h3>Trademark &amp; Attribution Notice</h3>
<p>All third-party product names, operating system names (including Android and iOS), logos, and brands mentioned on this website are the property of their respective trademark owners. ${brand} operates as an independent technical documentation and verification portal.</p>

<h3>How to Submit a Formal DMCA Notice</h3>
<p>If you believe that any material hosted or linked on ${brand} infringes upon your copyright, please send a written DMCA notice to our designated agent at <a href="mailto:${email}">${email}</a> containing:</p>
<ul>
  <li>Identification of the copyrighted work claimed to have been infringed.</li>
  <li>The exact URL(s) on <code>${domain}</code> where the material is located.</li>
  <li>Your full legal name, organization, mailing address, telephone number, and email address.</li>
  <li>A statement made under penalty of perjury that you are the copyright owner or authorized to act on the owner's behalf.</li>
</ul>
<p>We review and act upon all valid copyright notices within 24 to 48 hours.</p>
    `.trim();
  }

  return `
<h2>1. Official Contact &amp; Technical Support Desk</h2>
<p>Need assistance with an installation guide, SHA-256 checksum verification, or press inquiry on <strong>${brand}</strong>? Our technical and editorial team is ready to help.</p>

<h3>Direct Communication Channels</h3>
<ul>
  <li><strong>Technical &amp; Editorial Support:</strong> <a href="mailto:${email}">${email}</a></li>
  <li><strong>Official Portal Domain:</strong> <a href="${domain}">${domain}</a></li>
  <li><strong>DMCA &amp; Legal Compliance:</strong> <a href="mailto:${email}">${email}</a></li>
  <li><strong>Standard Response Window:</strong> Within 24 hours (Monday – Sunday)</li>
</ul>

<h3>Reporting a Broken Mirror or Bug</h3>
<p>When reporting a technical issue, please include your device model, operating system version, and the release version number (e.g., <code>v4.8.2</code>) so our engineering team can reproduce and resolve the issue rapidly.</p>
  `.trim();
}

export const MASTER_DEFAULT_CONFIG: SiteConfig = {
  brand: {
    name: "ApexMobile",
    shortName: "ApexMobile",
    tagline: "Verified Mobile Release Portal",
    logoUrl: "/assets/app-icon.svg",
    faviconUrl: "/assets/app-icon.svg",
    searchLogoUrl: "/assets/app-icon.svg",
    appleTouchIconUrl: "/assets/app-icon.svg",
    accentColor: "#EF4444",
    themeColor: "#EF4444",
    contactEmail: "support@apexmobile.example.com"
  },
  uiConfig: {
    maxContainerWidth: "768px",
    pageBackgroundColor: "#F8FAFC",
    surfaceBackgroundColor: "#FFFFFF",
    headerBackgroundColor: "#FFFFFF",
    headerTextColor: "#111827",
    footerBackgroundColor: "#0F172A",
    footerTextColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    cardBorderRadius: "12px",
    buttonTextColor: "#FFFFFF",
    textColor: "#1F2937",
    headingColor: "#111827",
    fontFamily: "system",
    baseFontSize: "16px",
    showHeaderNewsButton: true,
    headerNewsButtonLabel: "News",
    showNewsCountInHeader: true,
    autoIncludeSectionsInDrawer: true,
    showNewsInDrawer: true,
    showLegalLinksInDrawer: true,
    showCtaInDrawer: true,
    showHeroSection: true,
    showHeroCtaButtons: true,
    homepageNewsLimit: 5,
    newsReadMoreLabel: "Read Full News Article →",
    newsViewAllLabel: "View All Daily News →",
    backToHomeLabel: "← Back to Main Page",
    allNewsBreadcrumbLabel: "All Daily News →",
    showSubpageSwitcherPills: true,
    showFooterDisclaimer: true,
    showFooterLinksHeading: true,
    homepageSectionOrder: ['specs', 'sections', 'rawHtml', 'news', 'faqs']
  },
  domainConfig: {
    primaryDomain: "https://apexmobile.example.com",
    forceHttps: true,
    googleSiteVerification: "",
    bingSiteVerification: "",
    googleAnalyticsId: "",
    enableSitemapXml: true,
    enableImageSitemap: true,
    enableWebManifest: true,
    enableRssFeed: true,
    enableAutoInternalLinks: true,
    internalLinks: [
      {
        id: "il-1",
        keyword: "installation guide",
        targetUrl: "/#install-guide",
        title: "Step-by-Step Installation Guide"
      },
      {
        id: "il-2",
        keyword: "SHA-256 cryptographic checksum",
        targetUrl: "/#technical-specifications",
        title: "Official Technical Specifications & SHA-256 Hash"
      },
      {
        id: "il-3",
        keyword: "daily news",
        targetUrl: "/news",
        title: "Official Daily News & Release Changelogs"
      }
    ],
    customRobotsTxt: "User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /admin.html\nDisallow: /moreinfo\nDisallow: /moreinfo/\nDisallow: /download\nDisallow: /download/\nDisallow: /api/v1/app/"
  },
  githubConfig: {
    repoOwner: "",
    repoName: "",
    branch: "main",
    targetDirectory: "dist-public",
    fineGrainedToken: "",
    commitMessageTemplate: "chore(static-publish): update compiled static public pages from Admin Studio",
    autoPushOnPublish: false,
    deployHistory: []
  },
  securityGate: {
    enabled: true,
    gatewayPath: "/moreinfo",
    appSlug: "apexmobile",
    appSerialId: "APM-482",
    devicePolicyMode: "universal_human",
    primaryDownloadUrl: "/#technical-specifications",
    encryptedPrimaryUrl: "",
    turnstileSiteKey: "",
    turnstileSecretKey: "",
    proceedButtonLabel: "PROCEED",
    unavailableMessage: "Official download mirror is undergoing scheduled maintenance. Please check back shortly.",
    isPaused: false,
    isComingSoon: false,
    dailyIssueCap: 0,
    helplineWhatsapp: "",
    helplineTelegram: "",
    customHeading: "",
    customNoteHtml: "",
    showSpecsOnGateway: false
  },
  hero: {
    h1: "ApexMobile v4.8.2 — Fast, Secure & Cryptographically Verified Mobile Utility",
    metaTitle: "ApexMobile v4.8.2 Official Release — Fast, Verified Mobile Platform",
    metaDescription: "Download the verified ApexMobile v4.8.2 release. Includes SHA-256 cryptographic checksums, zero-latency edge mirrors, daily news updates, and full installation guide.",
    introHtml: `<p>Welcome to the verified release portal for <strong>ApexMobile</strong>. Engineered for uncompromising speed, strict privacy controls, and cross-platform compatibility, this release introduces next-generation compression algorithms and seamless mobile performance.</p>`,
    bannerImageUrl: "/assets/hero-banner.svg",
    bannerAlt: "ApexMobile v4.8.2 Performance and Security Architecture Showcase",
    bannerCaption: "",
    showBanner: true,
    secondaryCta: {
      label: "Installation Guide",
      url: "#install-guide",
      relSponsored: false
    },
    primaryCta: {
      label: "Download Official Package",
      url: "/moreinfo",
      relSponsored: true
    },
    floatingCta: {
      enabled: true,
      label: "⚡ Download v4.8.2",
      url: "/moreinfo"
    }
  },
  packageSpecs: {
    enabled: true,
    heading: "Technical Package Specifications & Checksum",
    metaTitle: "ApexMobile v4.8.2 Technical Specifications & SHA-256 Checksum",
    metaDescription: "Official technical specifications, file size, Android/iOS compatibility, and SHA-256 cryptographic verification hash for ApexMobile v4.8.2.",
    appName: "ApexMobile Official Release",
    version: "v4.8.2 (Stable Build)",
    fileSize: "64.2 MB",
    operatingSystem: "Android 9.0+ / iOS 15.0+",
    packageFormat: "Signed APK / Universal Package",
    sha256: "8f94e2c1a7b3d6f09e12c4a8b5d7e3f19a02c4b6d8e1f3a5c7b9d0e2f4a6b8c1",
    license: "Freeware (100% Clean, No Ads)",
    lastUpdated: "November 4, 2026",
    securityStatus: "Verified Clean (0/72 Engines)",
    customRows: []
  },
  sections: [
    {
      id: "sec-features",
      heading: "Why Choose ApexMobile?",
      slug: "core-features",
      visible: true,
      badgeText: "",
      metaTitle: "Core Features & Architecture | ApexMobile",
      metaDescription: "Explore ApexMobile's zero-latency architecture, cryptographic SHA-256 verification, and 45% lower RAM optimization.",
      imageUrl: "",
      imageAlt: "",
      imageCaption: "",
      imagePosition: "none",
      ctaLabel: "",
      ctaUrl: "",
      htmlContent: `
<p>Designed from the ground up for high-traffic environments, ApexMobile eliminates bloated dependencies in favor of native-speed memory management and low-latency network tunnels.</p>

<h3>Zero-Latency Architecture</h3>
<p>Leverages pre-compiled static edge routing to deliver responsive interaction times (INP &lt; 50ms) across all mobile devices.</p>

<h3>End-to-End Cryptographic Verification</h3>
<p>Every compiled binary is signed with SHA-256 cryptographic hashes and scanned automatically across 70+ security engines prior to release.</p>

<h3>Battery &amp; RAM Optimization</h3>
<p>Consumes up to 45% less system memory compared to legacy alternatives, running smoothly even on entry-level Android and iOS hardware.</p>
      `.trim()
    },
    {
      id: "sec-install",
      heading: "Step-by-Step Installation Guide",
      slug: "install-guide",
      visible: true,
      badgeText: "",
      metaTitle: "How to Install ApexMobile on Android & iOS | Step-by-Step Guide",
      metaDescription: "Follow our 3-step installation guide to configure and launch ApexMobile safely on your Android or iOS device in under two minutes.",
      imageUrl: "",
      imageAlt: "",
      imageCaption: "",
      imagePosition: "none",
      ctaLabel: "",
      ctaUrl: "",
      htmlContent: `
<p>Follow these quick steps to install and configure ApexMobile on your device in under two minutes:</p>

<h3>Step 1: Enable Unknown Sources (Android only)</h3>
<p>Navigate to <em>Settings &gt; Security &gt; Install Unknown Apps</em> and toggle permission for your preferred mobile browser.</p>

<h3>Step 2: Download the Official Package</h3>
<p>Tap the primary download button above to retrieve the signed <code>.apk</code> package directly from our high-speed Cloudflare edge network.</p>

<h3>Step 3: Verify and Launch</h3>
<p>Open your file manager, tap the downloaded package, review system permissions, and select <strong>Install</strong>. Once complete, launch ApexMobile and complete the quick onboarding setup.</p>
      `.trim()
    }
  ],
  newsSection: {
    enabled: true,
    heading: "Daily News & Release Updates",
    metaTitle: "Daily News, Changelogs & Release Updates | ApexMobile",
    metaDescription: "Read daily news updates, official software changelogs, security advisories, and feature announcements from the ApexMobile engineering team.",
    articles: [
      {
        id: "news-1",
        title: "ApexMobile v4.8.2 Released with 45% Faster Cold-Start Engine",
        slug: "apexmobile-v4-8-2-release-notes",
        date: "November 4, 2026",
        category: "Release Update",
        author: "ApexMobile Core Engineering",
        readTime: "2 min read",
        featured: true,
        summary: "Version 4.8.2 introduces our new lightweight memory allocator, reducing app launch time to under 180ms across Android 9+ and iOS 15+ devices.",
        coverImageUrl: "/assets/hero-banner.svg",
        coverImageAlt: "ApexMobile v4.8.2 Release Benchmark Overview",
        coverImageCaption: "ApexMobile v4.8.2 cold-start and memory allocation telemetry across Android and iOS devices.",
        ctaLabel: "Download v4.8.2 Package",
        ctaUrl: "/#technical-specifications",
        metaTitle: "ApexMobile v4.8.2 Release Notes — 45% Faster Cold-Start Engine",
        metaDescription: "Read the official changelog for ApexMobile v4.8.2 featuring a 45% faster cold-start engine, DNS-over-HTTPS encryption, and battery optimizations.",
        htmlContent: `
<p>We are pleased to announce the immediate availability of <strong>ApexMobile v4.8.2</strong> across all official edge mirrors. This update focuses on raw responsiveness, memory efficiency, and hardened transport security.</p>

<h3>Key Highlights in v4.8.2</h3>
<ul>
  <li><strong>Sub-180ms Cold Start:</strong> Re-engineered initialization pipeline defers non-critical modules until after the first frame is painted.</li>
  <li><strong>Automatic Cache Compaction:</strong> Reduces local storage usage by 32% on devices with limited free space.</li>
  <li><strong>Hardened TLS 1.3 Handshakes:</strong> Improved connection resilience on unstable cellular networks.</li>
</ul>

<h3>How to Upgrade</h3>
<p>Existing users can install the v4.8.2 package directly over their current installation without losing saved preferences or local configurations.</p>
        `.trim()
      },
      {
        id: "news-2",
        title: "Security Audit Complete: 100% Clean SHA-256 Verification Report",
        slug: "security-audit-sha256-verification-report",
        date: "October 28, 2026",
        category: "Security Advisory",
        author: "Security & Compliance Desk",
        readTime: "2 min read",
        featured: false,
        summary: "Our quarterly independent security audit confirmed zero vulnerabilities and 0/72 clean multi-engine verification across all official distribution mirrors.",
        coverImageUrl: "",
        coverImageAlt: "",
        coverImageCaption: "",
        ctaLabel: "",
        ctaUrl: "",
        metaTitle: "Quarterly Security Audit & SHA-256 Verification Report | ApexMobile",
        metaDescription: "Review the findings of our independent security audit confirming 100% cryptographic package integrity and zero malware detections.",
        htmlContent: `
<p>Transparency and verifiable user safety are core to the <strong>ApexMobile</strong> release process. Every build undergoes automated and manual binary inspection before publication.</p>

<h3>Audit Summary</h3>
<p>All release packages were tested against 72 independent security scanners with zero flags. Additionally, reproducible build verification confirms that the downloadable binary matches our source tree bit-for-bit.</p>
        `.trim()
      },
      {
        id: "news-3",
        title: "Global Edge CDN Upgrade: 14 New Low-Latency Download Nodes Live",
        slug: "global-edge-cdn-upgrade-low-latency-nodes",
        date: "October 21, 2026",
        category: "Infrastructure News",
        author: "Network Operations Team",
        readTime: "3 min read",
        featured: false,
        summary: "We have expanded our Cloudflare & multi-region edge mirror network across Asia-Pacific, Europe, and North America for instant package delivery.",
        coverImageUrl: "",
        coverImageAlt: "",
        coverImageCaption: "",
        ctaLabel: "",
        ctaUrl: "",
        metaTitle: "Global Edge CDN Upgrade: 14 New Download Nodes | ApexMobile News",
        metaDescription: "ApexMobile expands its global edge distribution network with 14 new high-speed mirror nodes for sub-50ms download initialization.",
        htmlContent: `
<p>To ensure users worldwide experience instant download speeds regardless of peak traffic, we have deployed 14 additional edge caching nodes across key metropolitan regions.</p>

<h3>Regional Performance Gains</h3>
<ul>
  <li><strong>Asia-Pacific &amp; India:</strong> Average download throughput increased by 62% with direct Singapore, Tokyo, and Mumbai routing.</li>
  <li><strong>Europe &amp; UK:</strong> Redundant failover mirrors active in Frankfurt, London, and Amsterdam.</li>
  <li><strong>Automatic Mirror Selection:</strong> The primary download button automatically routes requests to the geographically closest verified node.</li>
</ul>
        `.trim()
      }
    ]
  },
  faqsSection: {
    enabled: true,
    heading: "Frequently Asked Questions",
    metaTitle: "Frequently Asked Questions (FAQs) | ApexMobile Help Center",
    metaDescription: "Find instant answers to common questions about downloading, installing, updating, and verifying ApexMobile on Android and iOS.",
    items: [
      {
        id: "faq-1",
        question: "Is ApexMobile completely free to download and use?",
        answer: "Yes. The official release is 100% free with zero hidden subscriptions, paywalls, or forced advertisements. All core performance and security features are unlocked out of the box.",
        metaTitle: "Is ApexMobile Free to Download and Use? | FAQ",
        metaDescription: "Yes, ApexMobile is 100% free to download and use with no hidden subscriptions or paywalls."
      },
      {
        id: "faq-2",
        question: "Does this application require root access or device jailbreaking?",
        answer: "No. ApexMobile runs inside the standard operating system security sandbox on both Android and iOS. Root access or custom firmware is never required.",
        metaTitle: "Does ApexMobile Require Root or Jailbreak? | FAQ",
        metaDescription: "No, ApexMobile runs safely in standard user-space on Android and iOS without root or jailbreak."
      },
      {
        id: "faq-3",
        question: "How can I verify that the downloaded file is authentic and safe?",
        answer: "Every release listed on our portal includes its exact SHA-256 cryptographic hash in the Technical Package Specifications table. You can compare this checksum using any standard hash utility before installing.",
        metaTitle: "How to Verify ApexMobile SHA-256 Checksum | FAQ",
        metaDescription: "Learn how to verify the SHA-256 cryptographic checksum of your ApexMobile download."
      },
      {
        id: "faq-4",
        question: "How do I update to a newer version without losing my settings?",
        answer: "Simply install the new release package directly over your existing installation. Your local preferences and saved state are preserved automatically across version upgrades.",
        metaTitle: "How to Update ApexMobile Without Losing Data | FAQ",
        metaDescription: "Install the latest ApexMobile package over your existing version to preserve all settings and data."
      }
    ]
  },
  content: {
    rawHtml: ""
  },
  navigation: {
    headerLinks: [
      {
        id: "nav-1",
        label: "Core Features",
        url: "#core-features",
        metaTitle: "Core Features & Architecture | ApexMobile",
        metaDescription: "Explore the core features and low-latency performance of ApexMobile."
      },
      {
        id: "nav-2",
        label: "Specs & Checksum",
        url: "#technical-specifications",
        metaTitle: "Technical Specifications & SHA-256 | ApexMobile",
        metaDescription: "View version specifications and SHA-256 verification checksums."
      },
      {
        id: "nav-3",
        label: "Installation Guide",
        url: "#install-guide",
        metaTitle: "Installation Guide | ApexMobile",
        metaDescription: "Step-by-step installation guide for Android and iOS."
      },
      {
        id: "nav-4",
        label: "Daily News (/news)",
        url: "/news",
        metaTitle: "Daily News & Release Updates | ApexMobile",
        metaDescription: "Browse all daily news updates, changelogs, and announcements."
      },
      {
        id: "nav-5",
        label: "FAQs",
        url: "#frequently-asked-questions",
        metaTitle: "Frequently Asked Questions | ApexMobile",
        metaDescription: "Answers to common questions about ApexMobile."
      }
    ],
    footerSummary: "Official release portal providing cryptographically verified mobile packages, SHA-256 checksums, step-by-step installation guides, and daily changelog updates.",
    showFooterBrandSummary: true,
    showFooterContactEmail: true,
    footerQuickLinks: [
      {
        id: "fql-1",
        label: "Official Download & Checksums",
        url: "/#technical-specifications",
        openInNewTab: false
      },
      {
        id: "fql-2",
        label: "Installation Guide",
        url: "/#install-guide",
        openInNewTab: false
      },
      {
        id: "fql-3",
        label: "Daily News Archive",
        url: "/news",
        openInNewTab: false
      }
    ],
    disclaimerHeading: "Legal & Trademark Disclaimer",
    disclaimerMetaTitle: "Legal Disclaimer & Trademark Notice | ApexMobile",
    disclaimerMetaDescription: "Official legal disclaimer and third-party trademark attribution notice for ApexMobile.",
    disclaimer: "ApexMobile is an independent software documentation and verified distribution portal. All third-party trademarks, operating system names, and brand insignias remain the property of their respective owners. Packages are provided with cryptographic SHA-256 checksums for user verification.",
    siteLinksHeading: "Official Legal & Support Pages",
    copyright: "© 2026 ApexMobile. All rights reserved.",
    showAdminLink: false
  },
  pages: [
    {
      id: "page-privacy",
      label: "Privacy Policy",
      slug: "privacy-policy",
      showInFooter: true,
      showInHeader: false,
      openInNewTab: false,
      h1: "Privacy Policy",
      subtitle: "Official Data Protection & Zero-Tracking Compliance Document",
      bannerImageUrl: "",
      bannerImageAlt: "",
      metaTitle: "Privacy Policy — Data Protection & Zero-Tracking | ApexMobile",
      metaDescription: "Read the official ApexMobile Privacy Policy covering data protection, static edge delivery, and GDPR/CCPA compliance.",
      lastUpdated: "November 2026",
      htmlContent: generateSmartLegalHtml('privacy', 'ApexMobile', 'https://apexmobile.example.com', 'support@apexmobile.example.com', 'November 2026')
    },
    {
      id: "page-terms",
      label: "Terms and Conditions",
      slug: "terms-and-conditions",
      showInFooter: true,
      showInHeader: false,
      openInNewTab: false,
      h1: "Terms and Conditions",
      subtitle: "Official Portal Terms of Service & Usage Agreement",
      bannerImageUrl: "",
      bannerImageAlt: "",
      metaTitle: "Terms and Conditions — Official Usage Agreement | ApexMobile",
      metaDescription: "Review the official Terms and Conditions for accessing guides, documentation, and downloads on ApexMobile.",
      lastUpdated: "November 2026",
      htmlContent: generateSmartLegalHtml('terms', 'ApexMobile', 'https://apexmobile.example.com', 'support@apexmobile.example.com', 'November 2026')
    },
    {
      id: "page-dmca",
      label: "DMCA Disclaimer",
      slug: "dmca-disclaimer",
      showInFooter: true,
      showInHeader: false,
      openInNewTab: false,
      h1: "DMCA Copyright & Trademark Disclaimer",
      subtitle: "Digital Millennium Copyright Act (DMCA) & Intellectual Property Notice",
      bannerImageUrl: "",
      bannerImageAlt: "",
      metaTitle: "DMCA Notice & Copyright Takedown Policy | ApexMobile",
      metaDescription: "Official Digital Millennium Copyright Act (DMCA) compliance policy and copyright inquiry procedure for ApexMobile.",
      lastUpdated: "November 2026",
      htmlContent: generateSmartLegalHtml('dmca', 'ApexMobile', 'https://apexmobile.example.com', 'support@apexmobile.example.com', 'November 2026')
    },
    {
      id: "page-contact",
      label: "Contact Support",
      slug: "contact-support",
      showInFooter: true,
      showInHeader: false,
      openInNewTab: false,
      h1: "Contact & Technical Support",
      subtitle: "Direct Engineering, Editorial & Verification Support Desk",
      bannerImageUrl: "",
      bannerImageAlt: "",
      metaTitle: "Contact Support & Editorial Desk | ApexMobile",
      metaDescription: "Get in touch with the ApexMobile technical support and editorial team for assistance or inquiries.",
      lastUpdated: "November 2026",
      htmlContent: generateSmartLegalHtml('contact', 'ApexMobile', 'https://apexmobile.example.com', 'support@apexmobile.example.com', 'November 2026')
    }
  ],
  seo: {
    metaTitle: "ApexMobile v4.8.2 Official Release — Fast, Verified Mobile Platform",
    metaDescription: "Download the verified ApexMobile v4.8.2 release. Includes SHA-256 cryptographic checksums, zero-latency edge mirrors, daily news updates, and full installation guide.",
    canonicalUrl: "https://apexmobile.example.com",
    ogImageUrl: "/assets/hero-banner.svg",
    enableSoftwareSchema: true,
    softwareDetails: {
      name: "ApexMobile",
      operatingSystem: "Android 9.0+, iOS 15.0+",
      applicationCategory: "UtilitiesApplication",
      ratingValue: "4.9",
      reviewCount: "18420",
      price: "0.00",
      priceCurrency: "USD"
    },
    rawJsonLd: ""
  },
  updatedAt: 1762265000000
};

/**
 * Strip HTML tags to generate an automatic plain-text SEO excerpt when summary/metaDescription is omitted
 */
export function stripHtmlToExcerpt(html = '', maxLen = 155): string {
  const plain = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return '';
  return plain.length <= maxLen ? plain : `${plain.slice(0, maxLen - 1).trim()}…`;
}

/**
 * Deep-merge any partial or legacy config into the complete SiteConfig schema
 */
export function mergeSiteConfig(
  partial: Partial<SiteConfig> | Record<string, any> | null | undefined,
  base: SiteConfig = MASTER_DEFAULT_CONFIG
): SiteConfig {
  if (!partial || typeof partial !== 'object') {
    return JSON.parse(JSON.stringify(base));
  }

  const p = partial as Record<string, any>;

  const mergedBrand = {
    ...base.brand,
    ...(p.brand || {}),
    shortName: p.brand?.shortName || p.brand?.name || base.brand.shortName || base.brand.name,
    searchLogoUrl: p.brand?.searchLogoUrl || p.brand?.logoUrl || base.brand.searchLogoUrl || base.brand.logoUrl,
    appleTouchIconUrl: p.brand?.appleTouchIconUrl || p.brand?.logoUrl || base.brand.appleTouchIconUrl || base.brand.logoUrl,
    themeColor: p.brand?.themeColor || p.brand?.accentColor || base.brand.themeColor || base.brand.accentColor
  };
  if (mergedBrand.logoUrl === 'https://res.cloudinary.com/demo/image/upload/sample.jpg') {
    mergedBrand.logoUrl = base.brand.logoUrl;
  }
  if (mergedBrand.faviconUrl === 'https://res.cloudinary.com/demo/image/upload/sample.jpg') {
    mergedBrand.faviconUrl = base.brand.faviconUrl;
  }

  const defaultOrder: HomepageBlockKey[] = ['specs', 'sections', 'rawHtml', 'news', 'faqs'];
  const rawOrder = Array.isArray(p.uiConfig?.homepageSectionOrder)
    ? p.uiConfig.homepageSectionOrder.filter((k: any) => defaultOrder.includes(k))
    : [];
  const completeOrder: HomepageBlockKey[] = [
    ...rawOrder,
    ...defaultOrder.filter((k) => !rawOrder.includes(k))
  ];

  const mergedUiConfig: UiCustomizationConfig = {
    ...base.uiConfig,
    ...(p.uiConfig || {}),
    homepageSectionOrder: completeOrder
  };

  const mergedDomainConfig: DomainSeoConfig = {
    ...base.domainConfig,
    ...(p.domainConfig || {}),
    internalLinks: Array.isArray(p.domainConfig?.internalLinks)
      ? p.domainConfig.internalLinks
          .map((il: any, idx: number) => ({
            id: il.id || `il-${idx + 1}`,
            keyword: String(il.keyword || '').trim(),
            targetUrl: String(il.targetUrl || '/').trim(),
            title: String(il.title || il.keyword || '').trim()
          }))
          .filter((il: InternalLinkRule) => il.keyword && il.targetUrl)
      : JSON.parse(JSON.stringify(base.domainConfig.internalLinks || []))
  };
  if (p.seo?.canonicalUrl && !p.domainConfig?.primaryDomain) {
    mergedDomainConfig.primaryDomain = normalizeDomainUrl(p.seo.canonicalUrl, mergedDomainConfig.forceHttps);
  }

  const mergedGitHubConfig: GitHubDeployConfig = {
    ...base.githubConfig,
    ...(p.githubConfig || {}),
    deployHistory: Array.isArray(p.githubConfig?.deployHistory)
      ? p.githubConfig.deployHistory.slice(0, 15)
      : []
  };

  const rawSec = p.securityGate || {};
  const mergedSecurityGate: SecurityGateConfig = {
    ...base.securityGate,
    ...rawSec,
    enabled: rawSec.enabled !== false,
    gatewayPath: String(rawSec.gatewayPath || base.securityGate.gatewayPath || '/moreinfo').trim(),
    appSlug: generateSlug(rawSec.appSlug || mergedBrand.shortName || mergedBrand.name || 'apexmobile') || 'apexmobile',
    appSerialId: String(rawSec.appSerialId || base.securityGate.appSerialId || 'APM-482').trim(),
    devicePolicyMode:
      rawSec.devicePolicyMode === 'strict_mobile_only' ? 'strict_mobile_only' : 'universal_human',
    primaryDownloadUrl: String(
      rawSec.primaryDownloadUrl !== undefined
        ? rawSec.primaryDownloadUrl
        : base.securityGate.primaryDownloadUrl
    ).trim(),
    encryptedPrimaryUrl: String(rawSec.encryptedPrimaryUrl || '').trim(),
    turnstileSiteKey: String(rawSec.turnstileSiteKey || '').trim(),
    turnstileSecretKey: String(rawSec.turnstileSecretKey || '').trim(),
    proceedButtonLabel: String(rawSec.proceedButtonLabel || 'PROCEED').trim() || 'PROCEED',
    unavailableMessage: String(
      rawSec.unavailableMessage || base.securityGate.unavailableMessage
    ).trim(),
    isPaused: Boolean(rawSec.isPaused),
    isComingSoon: Boolean(rawSec.isComingSoon),
    dailyIssueCap: Math.max(0, Number(rawSec.dailyIssueCap) || 0),
    helplineWhatsapp: String(rawSec.helplineWhatsapp || '').trim(),
    helplineTelegram: String(rawSec.helplineTelegram || '').trim(),
    customHeading: String(rawSec.customHeading || '').trim(),
    customNoteHtml: String(rawSec.customNoteHtml || '').trim(),
    showSpecsOnGateway: Boolean(rawSec.showSpecsOnGateway)
  };

  const mergedHero = {
    ...base.hero,
    ...(p.hero || {}),
    secondaryCta: {
      ...base.hero.secondaryCta,
      ...(p.hero?.secondaryCta || {})
    },
    primaryCta: {
      ...base.hero.primaryCta,
      ...(p.hero?.primaryCta || {})
    },
    floatingCta: {
      ...base.hero.floatingCta,
      ...(p.hero?.floatingCta || {})
    }
  };
  if (mergedHero.primaryCta.url === 'https://res.cloudinary.com/demo/image/upload/sample.jpg') {
    mergedHero.primaryCta.url = '/moreinfo';
  }

  // When the Protected Gateway (/moreinfo) is enabled, if Admin pasted a destination URL into Hero Primary CTA
  // or Floating CTA, automatically capture it into securityGate.primaryDownloadUrl and route the public CTA to /moreinfo!
  if (mergedSecurityGate.enabled) {
    const isGatewayOrAnchor = (u: string) => {
      const clean = (u || '').trim();
      return (
        !clean ||
        clean === '/moreinfo' ||
        clean.startsWith('/moreinfo/') ||
        clean === '/download' ||
        clean.startsWith('/download/') ||
        clean.startsWith('#') ||
        clean.startsWith('/#')
      );
    };
    const heroPrimaryRaw = String(mergedHero.primaryCta.url || '').trim();
    const heroFloatingRaw = String(mergedHero.floatingCta.url || '').trim();

    if (!isGatewayOrAnchor(heroPrimaryRaw)) {
      if (
        !rawSec.primaryDownloadUrl ||
        rawSec.primaryDownloadUrl === '/#technical-specifications'
      ) {
        mergedSecurityGate.primaryDownloadUrl = heroPrimaryRaw;
        mergedSecurityGate.encryptedPrimaryUrl = '';
      }
      mergedHero.primaryCta.url = '/moreinfo';
    } else if (heroPrimaryRaw === '#technical-specifications' || heroPrimaryRaw === '/#technical-specifications') {
      mergedHero.primaryCta.url = '/moreinfo';
    }

    if (!isGatewayOrAnchor(heroFloatingRaw)) {
      if (
        !rawSec.primaryDownloadUrl ||
        rawSec.primaryDownloadUrl === '/#technical-specifications'
      ) {
        mergedSecurityGate.primaryDownloadUrl = heroFloatingRaw;
        mergedSecurityGate.encryptedPrimaryUrl = '';
      }
      mergedHero.floatingCta.url = '/moreinfo';
    } else if (heroFloatingRaw === '#technical-specifications' || heroFloatingRaw === '/#technical-specifications') {
      mergedHero.floatingCta.url = '/moreinfo';
    }
  }

  const mergedPackageSpecs: PackageSpecsConfig = {
    ...base.packageSpecs,
    ...(p.packageSpecs || {}),
    customRows: Array.isArray(p.packageSpecs?.customRows)
      ? p.packageSpecs.customRows
          .map((r: any) => ({
            label: String(r.label || '').trim(),
            value: String(r.value || '').trim()
          }))
          .filter((r: CustomSpecRow) => r.label || r.value)
      : []
  };

  const mergedSections: ContentSectionItem[] = Array.isArray(p.sections)
    ? p.sections.map((s: any, idx: number) => {
        const autoExcerpt = stripHtmlToExcerpt(s.htmlContent || '', 155);
        return {
          id: s.id || `sec-${idx + 1}`,
          heading: s.heading || 'Section Heading',
          slug: generateSlug(s.slug || s.heading || `section-${idx + 1}`),
          visible: s.visible !== false,
          badgeText: s.badgeText || '',
          metaTitle: s.metaTitle || `${s.heading || 'Section'} | ${mergedBrand.name}`,
          metaDescription: s.metaDescription || autoExcerpt || `${s.heading || 'Section'} on ${mergedBrand.name}.`,
          imageUrl: s.imageUrl || '',
          imageAlt: s.imageAlt || s.heading || '',
          imageCaption: s.imageCaption || '',
          imagePosition: s.imagePosition || (s.imageUrl ? 'top' : 'none'),
          ctaLabel: s.ctaLabel || '',
          ctaUrl: s.ctaUrl || '',
          htmlContent: s.htmlContent || ''
        };
      })
    : JSON.parse(JSON.stringify(base.sections));

  const mergedNews = {
    ...base.newsSection,
    ...(p.newsSection || {}),
    articles: Array.isArray(p.newsSection?.articles)
      ? p.newsSection.articles.map((a: any, idx: number) => {
          const autoSummary = a.summary || stripHtmlToExcerpt(a.htmlContent || '', 160);
          return {
            id: a.id || `news-${idx + 1}`,
            title: a.title || 'News Update',
            slug: generateSlug(a.slug || a.title || `news-${idx + 1}`),
            date: a.date || 'November 2026',
            category: a.category || 'Daily Update',
            author: a.author || `${mergedBrand.name} Editorial`,
            readTime: a.readTime || '2 min read',
            featured: Boolean(a.featured),
            summary: autoSummary,
            coverImageUrl: a.coverImageUrl || '',
            coverImageAlt: a.coverImageAlt || a.title || '',
            coverImageCaption: a.coverImageCaption || '',
            ctaLabel: a.ctaLabel || '',
            ctaUrl: a.ctaUrl || '',
            metaTitle: a.metaTitle || `${a.title || 'News'} | ${mergedBrand.name}`,
            metaDescription: a.metaDescription || autoSummary || `${a.title || 'News'} published by ${mergedBrand.name}.`,
            htmlContent: a.htmlContent || `<p>${autoSummary || ''}</p>`
          };
        })
      : JSON.parse(JSON.stringify(base.newsSection.articles))
  };

  const mergedFaqs = {
    ...base.faqsSection,
    ...(p.faqsSection || {}),
    items: Array.isArray(p.faqsSection?.items)
      ? p.faqsSection.items.map((f: any, idx: number) => ({
          id: f.id || `faq-${idx + 1}`,
          question: f.question || '',
          answer: f.answer || '',
          metaTitle: f.metaTitle || `${f.question || 'FAQ'} | ${mergedBrand.name}`,
          metaDescription: f.metaDescription || f.answer || ''
        }))
      : JSON.parse(JSON.stringify(base.faqsSection.items))
  };

  const mergedNav = {
    ...base.navigation,
    ...(p.navigation || {}),
    headerLinks: Array.isArray(p.navigation?.headerLinks)
      ? p.navigation.headerLinks.map((l: any, idx: number) => ({
          id: l.id || `nav-${idx + 1}`,
          label: l.label || 'Link',
          url: l.url || '#',
          metaTitle: l.metaTitle || `${l.label || 'Section'} | ${mergedBrand.name}`,
          metaDescription: l.metaDescription || ''
        }))
      : JSON.parse(JSON.stringify(base.navigation.headerLinks)),
    footerQuickLinks: Array.isArray(p.navigation?.footerQuickLinks)
      ? p.navigation.footerQuickLinks
          .map((ql: any, idx: number) => ({
            id: ql.id || `fql-${idx + 1}`,
            label: String(ql.label || '').trim(),
            url: String(ql.url || '/').trim(),
            openInNewTab: Boolean(ql.openInNewTab)
          }))
          .filter((ql: FooterQuickLink) => ql.label && ql.url)
      : JSON.parse(JSON.stringify(base.navigation.footerQuickLinks || []))
  };

  let mergedPages: StandalonePageItem[] = [];
  if (Array.isArray(p.pages) && p.pages.length > 0) {
    mergedPages = p.pages.map((pg: any, idx: number) => {
      const slug = generateSlug(pg.slug || pg.label || `page-${idx + 1}`);
      return {
        id: pg.id || `page-${idx + 1}`,
        label: pg.label || pg.h1 || 'Page',
        slug,
        showInFooter: pg.showInFooter !== false,
        showInHeader: Boolean(pg.showInHeader),
        openInNewTab: Boolean(pg.openInNewTab),
        h1: pg.h1 || pg.label || 'Page Heading',
        subtitle: pg.subtitle !== undefined ? pg.subtitle : `Official ${pg.label || 'Document'}`,
        bannerImageUrl: pg.bannerImageUrl || '',
        bannerImageAlt: pg.bannerImageAlt || pg.h1 || '',
        metaTitle: pg.metaTitle || `${pg.h1 || pg.label} | ${mergedBrand.name}`,
        metaDescription: pg.metaDescription || `Official ${pg.h1 || pg.label} for ${mergedBrand.name}.`,
        lastUpdated: pg.lastUpdated || 'November 2026',
        htmlContent: pg.htmlContent || ''
      };
    });
  } else {
    mergedPages = JSON.parse(JSON.stringify(base.pages));
  }

  const mergedSeo = {
    ...base.seo,
    ...(p.seo || {}),
    canonicalUrl: normalizeDomainUrl(
      p.domainConfig?.primaryDomain || p.seo?.canonicalUrl || base.seo.canonicalUrl,
      mergedDomainConfig.forceHttps
    ),
    softwareDetails: {
      ...base.seo.softwareDetails,
      ...(p.seo?.softwareDetails || {})
    }
  };
  mergedDomainConfig.primaryDomain = mergedSeo.canonicalUrl;

  return {
    brand: mergedBrand,
    uiConfig: mergedUiConfig,
    domainConfig: mergedDomainConfig,
    githubConfig: mergedGitHubConfig,
    securityGate: mergedSecurityGate,
    hero: mergedHero,
    packageSpecs: mergedPackageSpecs,
    sections: mergedSections,
    newsSection: mergedNews,
    faqsSection: mergedFaqs,
    content: {
      rawHtml: typeof p.content?.rawHtml === 'string' ? p.content.rawHtml : base.content.rawHtml
    },
    navigation: mergedNav,
    pages: mergedPages,
    seo: mergedSeo,
    updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : Date.now()
  };
}
