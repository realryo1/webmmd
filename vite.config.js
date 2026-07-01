import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'inline',
      devOptions: {
        enabled: true
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}'],
        maximumFileSizeToCacheInBytes: 25 * 1024 * 1024, // Babylon.js & Havok WASM用に上限を引き上げ (25MB)
      },
      manifest: {
        name: "webmmd",
        short_name: "webmmd",
        description: "ブラウザ上で MMD モデルを表示・再生",
        start_url: "./",
        scope: "./",
        display: "standalone",
        background_color: "#0b1118",
        theme_color: "#0b1118",
        lang: "ja",
        icons: [
          {
            src: "./icons/icon-192.svg",
            sizes: "192x192",
            type: "image/svg+xml",
            purpose: "any maskable"
          },
          {
            src: "./icons/icon-512.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any maskable"
          }
        ]
      }
    })
  ],
  server: {
    allowedHosts: ['.ts.net'],
    hmr: {
      clientPort: 443
    }
  },
  build: {
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000
  }
});
