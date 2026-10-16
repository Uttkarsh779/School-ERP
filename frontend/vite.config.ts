import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
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
        runtimeCaching: [
          {
            // API GET requests (method defaults to GET): network-first, falling
            // back to the last cached response when offline — parents on a weak
            // signal still see last-known timetable/notices/fee-status instead
            // of a blank error.
            urlPattern: /\/api\/.*/,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-get-cache",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
