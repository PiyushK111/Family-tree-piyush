import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Must match the GitHub repo name exactly, including capitals, or every asset
// 404s on GitHub Pages and the page renders blank.
const base = '/Family-tree-piyush/'

export default defineConfig({
  base,
  plugins: [
    react(),
    // Makes the site installable: "Add to Home screen" on Android/iOS gives a
    // standalone, full-screen app with its own icon and no browser chrome.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Family Tree',
        short_name: 'Family Tree',
        description: 'An interactive family tree with relations on every branch.',
        // Both must carry the base path, or the installed app opens the wrong
        // URL and falls out of standalone mode on first launch.
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#f4f7f5',
        theme_color: '#2f6b4f',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          // 'maskable' lets Android crop to its own shape without clipping the
          // glyph, which is why this one is full-bleed with extra padding.
          {
            src: 'maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the shell so a cold launch works offline; Firestore's own
        // IndexedDB cache supplies the data.
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: `${base}index.html`,
        // Firebase traffic must never be served from the SW cache: auth and the
        // Firestore stream are stateful and break if replayed.
        navigateFallbackDenylist: [/^\/__/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com\//,
            handler: 'NetworkOnly',
          },
        ],
        // Firebase alone is ~460 kB; the default 2 MiB cap would skip it.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Firebase is the bulk of the bundle and changes far less often than
        // app code, so give it its own long-lived cache entry.
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          flow: ['@xyflow/react', '@dagrejs/dagre'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
