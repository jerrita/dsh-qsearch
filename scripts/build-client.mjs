import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outfile = join(root, 'lib', 'client.js')

const bundled = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ['src/client/index.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  write: false,
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'react-dom'],
  logLevel: 'silent',
})

const code = bundled.outputFiles[0]?.text
if (code === undefined) throw new Error('esbuild produced no output')

const wrapped = `window.__ModuleLoader__.load({id:"dsh-qsearch",factory:function(require){
var module = { exports: {} };
var exports = module.exports;
${code}
return module.exports;
}});
`

mkdirSync(dirname(outfile), { recursive: true })
writeFileSync(outfile, wrapped)

const typesDir = join(root, 'lib', 'types', 'client')
mkdirSync(typesDir, { recursive: true })
writeFileSync(join(typesDir, 'index.d.ts'), `export const name: string
export const inject: string[]
export function apply(ctx: unknown): void
`)
