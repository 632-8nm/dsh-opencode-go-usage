// 分析 DSH 会话存储中 assistant/message 的 provider/model 构成(核实数据源口径)
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
console.log('session files:', files.length)

const byProvider = {}
const byModel = {}
const byProviderModel = {}
let totalEvents = 0
let usageEvents = 0
let bytes = 0

for (const f of files) {
  const raw = readFileSync(f)
  let text
  try {
    text = zstdDecompressSync(raw).toString('utf8')
  } catch (e) {
    console.log('decompress FAIL', f, e.message)
    continue
  }
  bytes += text.length
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let ev
    try { ev = JSON.parse(line) } catch { continue }
    if (ev.type !== 'assistant/message') continue
    totalEvents++
    const u = ev.data && ev.data.usage
    if (!u) continue
    usageEvents++
    const src = (ev.data.message && ev.data.message.source) || {}
    const provider = src.provider || 'unknown'
    const model = src.model || 'unknown'
    byProvider[provider] = (byProvider[provider] || 0) + 1
    byModel[model] = (byModel[model] || 0) + 1
    const k = provider + ' | ' + model
    byProviderModel[k] = (byProviderModel[k] || 0) + 1
  }
}

console.log('assistant/message 事件:', totalEvents, '| 带 usage:', usageEvents)
console.log('\n=== 按 provider ===')
for (const [k, v] of Object.entries(byProvider).sort((a, b) => b[1] - a[1])) console.log(' ', k, v)
console.log('\n=== 按 model ===')
for (const [k, v] of Object.entries(byModel).sort((a, b) => b[1] - a[1])) console.log(' ', k, v)
console.log('\n=== provider | model ===')
for (const [k, v] of Object.entries(byProviderModel).sort((a, b) => b[1] - a[1])) console.log(' ', k, v)
