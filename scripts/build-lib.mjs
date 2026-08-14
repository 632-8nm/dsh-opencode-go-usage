// Build src/*.js (cordis_define function-body format) into lib/*.js (ESM bundle entry).
// The src files are designed for dynamic plugins; lib files are the static bundle shape:
//   export const name = '...'
//   export function apply(ctx) { ... }
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function convert(src, out, name) {
  let text = readFileSync(join(root, src), 'utf8')
  // strip leading comment block and the opening `return {`
  text = text.replace(/^[\s\S]*?\nreturn \{/, '')
  // strip the trailing closing brace
  text = text.replace(/\n\}\s*$/, '')
  const outText = 'export const name = ' + JSON.stringify(name) + '\n' +
    text.replace(/^\s*apply\(ctx\) \{/, 'export function apply(ctx) {') + '\n'
  mkdirSync(join(root, 'lib'), { recursive: true })
  writeFileSync(join(root, 'lib', out), outText)
  console.log('built', out)
}

convert('src/host.js', 'index.js', 'opencode-go-usage')
convert('src/client.js', 'client.js', 'opencode-go-usage-client')
