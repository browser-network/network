import alias from '@rollup/plugin-alias'
import commonjs from '@rollup/plugin-commonjs'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import replace from '@rollup/plugin-replace'
import terser from '@rollup/plugin-terser'
import typescript from '@rollup/plugin-typescript'

import { fileURLToPath } from 'node:url'

const cryptoEntry = fileURLToPath(new URL('../crypto/umd/crypto.esm.js', import.meta.url))
const browserProcessShim = 'var process = { nextTick: function (fn) { var args = Array.prototype.slice.call(arguments, 1); queueMicrotask(function () { fn.apply(null, args) }) } };'

const plugins = [
  replace({
    preventAssignment: true,
    values: {
      'typeof window === \'undefined\'': 'false',
      "wrtc: IS_NODE ? require('wrtc') : undefined": 'wrtc: undefined'
    }
  }),
  alias({ entries: [{ find: '@browser-network/crypto', replacement: cryptoEntry }] }),
  nodeResolve({ browser: true, preferBuiltins: false }),
  commonjs(),
  typescript({
    tsconfig: './tsconfig.json',
    declaration: false,
    declarationMap: false,
    outDir: 'umd',
    sourceMap: true,
    module: 'ESNext'
  })
]

export default {
  input: 'src/index.ts',
  plugins,
  output: [
    {
      file: 'umd/network.js',
      format: 'umd',
      name: 'Network',
      intro: browserProcessShim,
      sourcemap: true
    },
    {
      file: 'umd/network.min.js',
      format: 'umd',
      name: 'Network',
      intro: browserProcessShim,
      plugins: [terser()],
      sourcemap: true
    }
  ]
}
