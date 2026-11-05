// Bundles every actions/<name>/src/index.ts into the committed actions/<name>/dist/index.js.
// Each bundle is self-contained (dependencies and lib/ included), so an action works when it is
// called from another repository at a pinned ref with no checkout and no npm install.
import { existsSync, readdirSync } from 'node:fs'
import commonjs from '@rollup/plugin-commonjs'
import nodeResolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'

const actions = readdirSync('actions', { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(`actions/${d.name}/src/index.ts`))
  .map((d) => d.name)

// Known harmless warnings from CommonJS code inside node_modules (@actions/core).
const QUIET = new Set(['THIS_IS_UNDEFINED', 'CIRCULAR_DEPENDENCY'])
const isDependency = (w) => (w.id ?? w.ids?.[0] ?? '').includes('node_modules')

export default actions.map((name) => ({
  input: `actions/${name}/src/index.ts`,
  output: { file: `actions/${name}/dist/index.js`, format: 'cjs', sourcemap: false },
  onwarn(warning, warn) {
    if (warning.code && QUIET.has(warning.code) && isDependency(warning)) return
    warn(warning)
  },
  plugins: [
    typescript({
      tsconfig: './tsconfig.json',
      noEmit: false,
      declaration: false,
      allowImportingTsExtensions: false,
      rewriteRelativeImportExtensions: true,
      exclude: ['**/*.test.ts']
    }),
    nodeResolve({ preferBuiltins: true }),
    commonjs()
  ]
}))
