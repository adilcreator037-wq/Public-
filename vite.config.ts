import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';

function copyDirectoryRecursiveSync(srcDir: string, destDir: string, skipRootNames: Set<string> = new Set()) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (skipRootNames.has(entry.name)) continue;
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursiveSync(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export default defineConfig(() => {
  return {
    plugins: [
      {
        name: 'admin-route-rewrite',
        configureServer(server) {
          server.middlewares.use((req, _res, next) => {
            if (req.url === '/admin' || req.url === '/admin/') {
              req.url = '/admin.html';
            }
            next();
          });
        }
      },
      {
        name: 'static-public-bundle-overlay',
        closeBundle() {
          const distPublicDir = path.resolve(__dirname, 'dist-public');
          const distDir = path.resolve(__dirname, 'dist');
          if (!fs.existsSync(distDir)) return;

          // Ensure standalone public runtime scripts (/app.js and /moreinfo.js) always exist in dist/
          // so static pages and Cloudflare Pages Edge ASSETS.fetch('/app.js') never receive an HTML SPA fallback.
          for (const runtimeScript of ['app.js', 'moreinfo.js']) {
            const rootSrc = path.resolve(__dirname, runtimeScript);
            const destFile = path.join(distDir, runtimeScript);
            if (fs.existsSync(rootSrc) && fs.statSync(rootSrc).isFile()) {
              fs.copyFileSync(rootSrc, destFile);
            }
          }

          if (fs.existsSync(distPublicDir)) {
            // Overlay compiled static public routes (index.html, news/**, <page>/index.html,
            // moreinfo/index.html, static-routes/**, sitemap.xml, robots.txt, app.js, moreinfo.js)
            // into dist/ while preserving Vite's bundled admin.html and dist/assets/*.
            copyDirectoryRecursiveSync(distPublicDir, distDir, new Set(['admin.html', 'admin.js', 'admin.css', 'functions']));
          }
        }
      }
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          admin: path.resolve(__dirname, 'admin.html'),
          moreinfo: path.resolve(__dirname, 'moreinfo.html'),
        },
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      // HMR is disabled in AI Studio.
      hmr: false,
      watch: null,
    },
  };
});
