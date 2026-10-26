import { keyboard, touch, hashRouter } from '@react-slides/viewer'

// Plain object instead of defineConfig(): the published @react-slides/cli@0.1.0
// has no "main"/"exports" entry, so importing it from here does not resolve.
export default {
  entry: 'src/slides.tsx',
  viewport: { width: 1920, height: 1080 },
  controls: [keyboard(), touch(), hashRouter()],
  plugins: [],
}
