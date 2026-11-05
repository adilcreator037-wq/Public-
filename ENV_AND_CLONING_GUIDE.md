# Master CMS & Landing Page Architecture — Environment Variables & Cloning Guide

This project is engineered as a **Master Cloneable Single-Domain CMS & High-Performance Landing Page Architecture**. Every piece of content—from the app icon, version specs, hero buttons, and technical tables to the article body, interactive FAQs, Privacy Policy, Terms & Conditions, and JSON-LD SEO schemas—is **100% controllable from the `/admin` dashboard**.

---

## 1. How Data Persistence Works (Dual-Layer Reliability)

To guarantee that **your work is never lost**, this system uses a **Dual-Layer Persistence Engine**:

1. **Server-Side Persistent Storage (`data/site-config.json`)**:
   - Every time you click **Save & Publish** in `/admin`, the backend server immediately writes your complete site configuration atomically to `data/site-config.json` on the server.
   - Even if you haven't added Firebase credentials yet, your changes are saved on the server and served to all visitors with sub-millisecond ETag caching.
2. **Firebase v10 Cloud Firestore (`siteConfig/main`)**:
   - As soon as you add your Firebase credentials (via Environment Variables or inside the Admin Dashboard's **SEO, Schema & Firebase** tab), every save automatically syncs to your Cloud Firestore database (`siteConfig/main`), and public pages receive real-time background updates.
3. **Browser Zero-Jank Cache (`localStorage`)**:
   - Repeat visitors render in **0ms** directly from `localStorage` (`Stale-While-Revalidate`) while silently checking the server/Firestore in the background.

---

## 2. Complete Environment Variables Reference (`.env`)

Below is every environment variable supported by the backend (`server.ts`) and frontend, along with **why** you should add it.

### A. Server-Side Admin Authentication Variables

| Variable Name | Required? | Default Value (Dev) | Purpose & Reason for Adding |
| :--- | :--- | :--- | :--- |
| `ADMIN_EMAIL` | **Yes** | `admin@domain.com` | The administrator email address verified on the server when logging into `/admin` (`POST /api/admin/login`). |
| `ADMIN_PASSWORD` | **Yes** | `admin123` | The administrator password verified on the server. Change this in production so only you can access `/admin`. |
| `ADMIN_API_KEY` | Optional | *(Empty)* | Optional master security key. When set in `.env`, the login screen verifies this key alongside your email and password (or allows automated API updates via the `x-admin-api-key` header). |
| `ADMIN_SESSION_SECRET` | Recommended | `master-cms-secret-key-2026` | Used by the backend server to cryptographically sign (HMAC-SHA256) your admin login token so sessions cannot be forged. |

### B. Firebase v10+ Cloud Firestore Variables

Add these variables from your **Firebase Console → Project Settings → General → Your Apps (Web App)** so your site state is permanently backed up and synced in Google Cloud Firestore:

| Variable Name | Required? | Purpose & Reason for Adding |
| :--- | :--- | :--- |
| `FIREBASE_API_KEY` | Recommended | Your Firebase Web API Key (`AIzaSy...`). Enables the client and server to connect to your Firebase project. |
| `FIREBASE_PROJECT_ID` | Recommended | Your unique Firebase Project ID (e.g., `my-cms-site-01`). Identifies which Cloud Firestore database stores `siteConfig/main`. |
| `FIREBASE_AUTH_DOMAIN` | Recommended | Your Firebase Auth domain (e.g., `my-cms-site-01.firebaseapp.com`). |
| `FIREBASE_STORAGE_BUCKET` | Optional | Your Firebase Storage bucket (e.g., `my-cms-site-01.appspot.com`). |
| `FIREBASE_MESSAGING_SENDER_ID` | Optional | Your Firebase Cloud Messaging Sender ID. |
| `FIREBASE_APP_ID` | Recommended | Your Firebase Web App ID (`1:123456789:web:abcdef...`). |
| `FIREBASE_DATABASE_ID` | Optional | Defaults to `(default)`. Set this only if you created a named Firestore database instance. |

> **Tip:** If you deploy to a static-only host without a Node.js environment, you can also prefix these with `VITE_` (e.g. `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`) or paste them directly inside `/admin` → **SEO, Schema & Firebase** → **Firebase Cloud Connection**.

### C. Master Cloning & White-Label Variables

When you clone this repository for a new micro-niche site or new domain, you can set these variables to pre-configure the initial brand identity automatically:

| Variable Name | Required? | Purpose & Reason for Adding |
| :--- | :--- | :--- |
| `SITE_BRAND_NAME` | Optional | Sets the initial brand/app name (e.g., `SnapVault Pro`) on a fresh clone before you customize it in `/admin`. |
| `SITE_CANONICAL_URL` | Optional | Sets the primary domain URL (e.g., `https://snapvault.example.com`) for canonical tags, OpenGraph URLs, and JSON-LD schema. |
| `SITE_CONTACT_EMAIL` | Optional | Sets the default support & legal contact email used inside the Privacy Policy, Terms & Conditions, and DMCA templates. |

---

## 3. Firestore Security Rules Setup

When setting up a new Firebase project for a clone:
1. Open the [Firebase Console](https://console.firebase.google.com/) and create a **Firestore Database**.
2. Go to **Firestore Database → Rules** and publish the following rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Public visitors can read the main site configuration for fast rendering
    // Authenticated or authorized clients can update the configuration
    match /siteConfig/{docId} {
      allow read: if true;
      allow write: if true; // Or restrict to request.auth != null if using Firebase Auth
    }
  }
}
```

---

## 4. Step-by-Step Workflow to Clone This Master Project for a New Website

1. **Duplicate / Clone the Repository**:
   ```bash
   git clone <your-repo-url> my-new-domain-site
   cd my-new-domain-site
   npm install
   ```
2. **Configure Your `.env` File**:
   Copy `.env.example` to `.env` and set your `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_API_KEY` (optional), and `FIREBASE_*` keys.
3. **Start the Server**:
   - Development: `npm run dev`
   - Production: `npm run build && npm start`
4. **Log into `/admin`**:
   - Visit `http://localhost:3000/admin` (or `https://yourdomain.com/admin`).
   - Sign in with your `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
5. **Customize 100% of Your Site**:
   - **App Identity & Specs**: Upload/paste your App Icon URL, Brand Logo, Version, File Size, OS requirements, and Technical Specifications table rows.
   - **Hero & CTAs**: Set your `<h1>` headline, primary download link, secondary guide button, and sticky bottom bar.
   - **Article & Features**: Edit the Key Features cards and the semantic HTML body with live 375px mobile preview.
   - **FAQ Manager**: Add your niche Q&A items. They automatically render as interactive accordions on the page AND generate Google `FAQPage` JSON-LD schema.
   - **Legal Pages (Privacy, Terms & DMCA)**: Click **"Auto-Generate Legal Templates for Brand"** to populate compliant Privacy Policy, Terms & Conditions, and DMCA pages tailored to your brand name and domain, or edit the text directly.
   - **One-Click JSON Backup**: Use the **Overview & Backup** tab to export your entire site configuration as a `.json` file to clone or back up your setup anytime.
