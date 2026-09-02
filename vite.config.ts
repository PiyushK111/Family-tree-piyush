import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Must match the GitHub repo name exactly, including capitals, or every asset
  // 404s on GitHub Pages and the page renders blank.
  base: '/Family-tree-piyush/',
  plugins: [react()],
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
