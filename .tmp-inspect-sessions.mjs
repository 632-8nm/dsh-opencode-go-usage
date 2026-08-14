// 检查 DSH 会话文件的实际结构
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

const ROOT = 'C:\\Users\\Xenia\\AppData\\Roaming\\DeepSeek Harness\\data\\dsh\\sessions'

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.jsonl.zstd')) out.push(p)
  }
  return out
}

const files = walk(ROOT)
for (const f of files) {
  const raw = readFileSync(f)
  let text
  try { text = zstdDecompressSync(raw).toString('utf8') } catch (e) { console.log('decompress FAIL', f, e.message); continue }
  const lines = text.split('\n').filter((l) => l.trim())
  console.log('FILE:', f, '| decompressed bytes:', text.length, '| lines:', lines.length)
  // 事件类型统计
  const types = {}
  for (const line of lines) {
    try {
      const ev = JSON.parse(line)
      types[ev.type] = (types[ev.type] || 0) + 1
    } catch { types['(unparseable)'] = (types['(unparseable)'] || 0) + 1 }
  }
  console.log('  types:', JSON.stringify(types))
  // 打印第一个 assistant 相关事件的结构
  for (const line of lines) {
    try {
      const ev = JSON.parse(line)
      if (String(ev.type).includes('assistant')) {
        console.log('  sample event type:', ev.type, '| keys:', Object.keys(ev).join(','))
        console.log('  sample data keys:', ev.data ? Object.keys(ev.data).join(',') : '(none)')
        console.log('  sample data.usage:', ev.data && ev.data.usage ? JSON.stringify(ev.data.usage).slice(0, 200) : '(none)')
        console.log('  sample message.source:', ev.data && ev.data.message && ev.data.message.source ? JSON.stringify(ev.data.message.source).slice(0, 200) : '(none)')
        break
      }
    } catch { }
  }
}
