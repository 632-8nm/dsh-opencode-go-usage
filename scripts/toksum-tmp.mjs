// 临时:统计 deepseek-v4-flash 的 token 用量
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const diskPath = join(process.env.USERPROFILE, '.config', 'dsh-opencode-go-usage-official.json')
const disk = JSON.parse(readFileSync(diskPath, 'utf-8'))
const recs = disk.records
const ts = recs.map((r) => r.ts).sort()
console.log('数据: ' + recs.length + ' 条,' + ' 覆盖 ' + ts[0].slice(0, 16) + ' ~ ' + ts[ts.length - 1].slice(0, 16) + ' UTC,缓存 age ' + Math.round((Date.now() - disk.at) / 60000) + ' 分钟')

const byModel = {}
for (const r of recs) {
  const m = byModel[r.model] || (byModel[r.model] = { requests: 0, ti: 0, to: 0, rt: 0, cr: 0, cost: 0 })
  m.requests++
  m.ti += r.ti || 0
  m.to += r.to || 0
  m.rt += r.rt || 0
  m.cr += r.cr || 0
  m.cost += r.cost || 0
}
const fmt = (n) => (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n))
for (const [model, m] of Object.entries(byModel).sort((a, b) => b[1].cost - a[1].cost)) {
  console.log(model.padEnd(22) + ' 请求 ' + String(m.requests).padStart(5) +
    ' | 输入 ' + fmt(m.ti).padStart(7) + ' | 输出 ' + fmt(m.to).padStart(7) +
    ' | 推理 ' + fmt(m.rt).padStart(7) + ' | cache读 ' + fmt(m.cr).padStart(7) +
    ' | 花费 $' + (m.cost / 1e8).toFixed(2))
}
