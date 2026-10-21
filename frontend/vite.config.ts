import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
// Tunnels (ngrok) for testing on other devices; add other hosts here if needed. Through a
// tunnel only the frontend port is public, so API calls are forwarded to the backend.
// Used by `npm run dev` and by `npm run pwa:test` (production build + preview, for the PWA).
const devAccess = {
  allowedHosts: [".ngrok-free.dev", ".ngrok-free.app", ".ngrok.io", ".ngrok.app"],
  proxy: { "/api": { target: "http://localhost:5000", changeOrigin: true } },
};

export default defineConfig({
  server: devAccess,
  preview: devAccess,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["pwa-icons/icon.svg"],
      manifest: {
        name: "Ram Raj Singh International School — ERP",
        short_name: "RRS Intl School",
        description: "RRS Intl School management system",
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#0f2a47",
        icons: [
          // Placeholder icons — replace with the school's real branded
          // 192/512 PNG (+ a maskable PNG) before real deployment.
          { src: "/pwa-icons/icon.svg", sizes: "192x192", type: "image/svg+xml" },
          { src: "/pwa-icons/icon.svg", sizes: "512x512", type: "image/svg+xml" },
        ],
      },
      workbox: {
        // App shell (JS/CSS/fonts/icons): cache-first, so repeat visits on a
        // weak rural connection load instantly. Workbox precaches these by default.
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
        // Only PUBLIC API data (school website content) is cached for offline use. Signed-in
        // data (/api/profile/me, fees, attendance…) has the same URL for every account, so a
        // cached copy could show one user's data to the next person on a shared phone.
        runtimeCaching: [
          {
            urlPattern: /\/api\/public\/.*/,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-public-cache",
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        // Drop app-shell files from older builds (the old "api-get-cache" is removed by the app, store.ts).
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
