import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'

// Big libraries go in their own chunks so they load in parallel and stay
// cached when only app code changes.
const VENDOR_CHUNKS: [RegExp, string][] = [
  [/node_modules\/(react|react-dom|scheduler)\//, 'react'],
  [/node_modules\/three\/build\//, 'three'],
  [/node_modules\/(@react-three|three-stdlib|camera-controls|troika-|maath|meshline)/, 'three-extras'],
  // Combining shapes and cutting holes, loaded only when needed.
  [/node_modules\/(three-mesh-bvh|three-bvh-csg)\//, 'csg'],
]

// CF_REMOTE_BINDINGS=0 runs everything locally, with no Cloudflare login:
// Workers AI isn't available, but rooms, accounts and saves all work. CI and
// the browser tests use it.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}
const remoteBindings = env.CF_REMOTE_BINDINGS !== '0'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    cloudflare({
      // The Worker lives in ../backend. Local D1, R2 and Durable Object data
      // is kept at the repo root so the backend's migrate script sees it too.
      configPath: '../backend/wrangler.jsonc',
      persistState: { path: '../.wrangler/state' },
      remoteBindings,
    }),
  ],
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
