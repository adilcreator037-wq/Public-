# Essential Environment Variables Guide (`ENV_VARIABLES.md`)

This project is designed so that **almost everything** (Domains, SEO Meta Tags, Google Analytics, Search Console Verification, GitHub Fine-Grained Token, and even Firebase Runtime Keys) can be configured directly inside the **Admin Studio (`/admin.html`)**.

As a result, your `.env` file only needs **3 essential Admin Security variables** (plus **2 optional Firebase bootstrap variables** if you prefer loading Firebase from `.env` instead of pasting keys in the Admin UI).

---

## 1. Required Admin Login Variables (`.env`)

| Variable Name | Example Value | Why It Is Needed |
| :--- | :--- | :--- |
| `ADMIN_EMAIL` | `admin@yourdomain.com` | The administrator email address used to sign in to `/admin.html`. |
| `ADMIN_PASSWORD` | `StrongPassword123!` | The administrator password verified on the server (`/api/admin/login`). |
| `ADMIN_SESSION_SECRET` | `8f94e2c1a7b3d6f09e12c4a8b5d7e3f1` | Secret key used by the server to sign `HttpOnly` admin session tokens so your login stays secure. |

---

## 2. Optional Live-Firebase Bootstrap Variables (`.env`)

> **Note:** The Public Website (`index.html`) is **100% static** and never uses Firebase. Only the **Admin Studio (`/admin.html`)** uses Firebase Cloud Firestore (`siteConfig/main`) to store your live CMS state. You can either enter your Firebase keys inside **Admin Workspace 8** OR set these two variables in `.env`:

| Variable Name | Example Value | Why It Is Needed |
| :--- | :--- | :--- |
| `FIREBASE_API_KEY` | `AIzaSyD...` | Connects the Admin Studio to your Firebase project for live Cloud Firestore persistence. |
| `FIREBASE_PROJECT_ID` | `my-cms-project-id` | Identifies which Firebase Cloud Firestore project holds your `siteConfig/main` document. |

---

## 3. Minimal `.env` Template for New Clones

Copy `.env.example` to `.env` and fill in your values:

```ini
# 1. Admin Studio Login & Session Security (Required)
ADMIN_EMAIL="admin@yourdomain.com"
ADMIN_PASSWORD="ChangeThisStrongPassword!"
ADMIN_SESSION_SECRET="replace-with-a-random-32-character-secret-string"

# 2. Live Firebase Cloud Persistence for Admin Studio (Optional - can also be set inside Admin UI)
FIREBASE_API_KEY=""
FIREBASE_PROJECT_ID=""
```

---

## 4. What Is Managed Inside the Admin UI (No `.env` Clutter Needed)

To keep your environment configuration ultra-clean, the following settings are stored directly in your live Admin configuration and do **not** require environment variables:
- **GitHub Fine-Grained Token (`github_pat_...`), Repo Owner, Repo Name & Branch** $\rightarrow$ Managed in **Admin Workspace 8**.
- **Primary Production Domain (`https://yourdomain.com`)** $\rightarrow$ Managed in **Admin Workspace 8**.
- **Google Analytics ID & Search Console Verification Codes** $\rightarrow$ Managed in **Admin Workspace 8**.
