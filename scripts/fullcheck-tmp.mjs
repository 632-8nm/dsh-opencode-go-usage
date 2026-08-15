// 临时:全量抓取看总条数和截断
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const host = readFileSync(join(process.cwd(), 'src', 'host.js'), 'utf-8')
const m = host.match(/const OFFICIAL_SCRIPT = \[([\s\S]*?)\n    \]\.join\(/)
const lines = new Function('return [' + m[1] + ']')()
const py = join(process.env.TEMP, 'ocgo-full-check.py')
// 临时把 maxPages 提到 800 看看总量
const lines2 = lines.map((l) => l.includes('"maxPages", 150') ? l.replace('"maxPages", 150', '"maxPages", 800') : l)
writeFileSync(py, lines2.join('\n'), 'utf-8')
const out = execFileSync('E:\\python\\python.exe', [py], { encoding: 'utf-8', timeout: 300000 })
const o = JSON.parse(out.trim().split('\n').pop())
const recs = o.records || []
const ts = recs.map((r) => r.ts).sort()
console.log(JSON.stringify({ ok: o.ok, total: recs.length, truncated: o.truncated, earliest: ts[0], latest: ts[ts.length - 1], error: o.error }))
