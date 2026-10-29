import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'

// Big libraries go in their own chunks so they load in parallel and stay
// cached when only app code changes.
const VENDOR_CHUNKS: [RegExp, string][] = [
  [/node_modules\/(react|react-dom|scheduler)\//, 'react'],
  [/node_modules\/three\/build\//, 'three'],
  [/node_modules\/(@react-three|three-stdlib|camera-controls|troika-|maath|meshline|three-mesh-bvh|three-bvh-csg)/, 'three-extras'],
]

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cloudflare()],
  environments: {
    client: {
      build: {
        // three.js alone is ~700 kB minified, which is expected.
        chunkSizeWarningLimit: 800,
        rollupOptions: {
          output: {
            manualChunks(id) {
              const path = id.replace(/\\/g, '/').replace(/.*\.pnpm\/[^/]+\//, '')
              return VENDOR_CHUNKS.find(([pattern]) => pattern.test(path))?.[1]
            },
          },
        },
      },
    },
  },
})
