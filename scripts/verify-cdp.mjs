// verify-cdp.mjs — 端到端验证 CDP 自动提取(不依赖配置中的 cookie)
// 用法:先启动调试浏览器(scripts/start-browser-debug.bat,端口 9222),
//       再运行:node scripts/verify-cdp.mjs [port]
// 从 src/host.js 提取真实的 OFFICIAL_SCRIPT 函数,单独调用 cdp_fetch_cookie。
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const port = process.argv[2] || '9222'
const host = readFileSync(new URL('../src/host.js', import.meta.url), 'utf-8')

const m = host.match(/const OFFICIAL_SCRIPT = \[([\s\S]*?)\n    \]\.join\(/)
if (!m) { console.error('OFFICIAL_SCRIPT not found in src/host.js'); process.exit(1) }
const lines = new Function('return [' + m[1] + ']')()
// 只取函数定义部分(到 "CK = \"\"" 之前),不含自动提取/抓取主流程
const cut = lines.findIndex((l) => l.startsWith('CK = ""'))
if (cut < 0) { console.error('unexpected OFFICIAL_SCRIPT shape'); process.exit(1) }
const prefix = lines.slice(0, cut).join('\n')

const driver = prefix + `

print("=== CDP VERIFY ===")
try:
    r1 = cdp_fetch_cookie(${port})
    print("RESULT " + json.dumps({"ok": bool(r1), "len": len(r1) if r1 else 0, "head": (r1 or "")[:16]}))
    # 协议级诊断:打印 getAllCookies 的原始返回
    import urllib.request as _ur
    targets = json.loads(_ur.urlopen("http://127.0.0.1:${port}/json", timeout=3).read().decode())
    page = next((t for t in targets if t.get("type") == "page"), None)
    if page:
        m = re.match(r"ws://([^:/]+):(\\d+)(/.+)", page.get("webSocketDebuggerUrl") or "")
        if m:
            s2 = ws_connect(m.group(1), int(m.group(2)), m.group(3))
            if s2:
                r = ws_call(s2, json.dumps({"id": 1, "method": "Network.getAllCookies"}))
                if r:
                    cs = (r.get("result") or {}).get("cookies") or []
                    print("DIAG count=" + str(len(cs)))
                    for c in cs[:200]:
                        if c.get("name") == "auth" or "opencode" in (c.get("domain") or ""):
                            print("DIAG cookie", c.get("domain"), c.get("name"), "len=" + str(len(c.get("value") or "")))
                else:
                    print("DIAG getAllCookies returned None")
                try: s2.close()
                except Exception: pass
except Exception as e:
    print("RESULT " + json.dumps({"ok": False, "err": repr(e)[:300]}))
`

const dir = mkdtempSync(join(tmpdir(), 'ocgo-cdp-'))
const py = join(dir, 'cdp_test.py')
writeFileSync(py, driver, 'utf-8')
const candidates = process.platform === 'win32'
  ? ['python', 'py', 'E:\\python\\python.exe']
  : ['python3', 'python']
let output = null
let lastError = null
for (const command of candidates) {
  try {
    output = execFileSync(command, [py], { encoding: 'utf-8', timeout: 30000 })
    break
  } catch (e) {
    lastError = e
  }
}
if (output == null) {
  console.error('python failed:', lastError && lastError.message)
  console.error((lastError && lastError.stdout) || '')
  process.exit(1)
}
console.log(output)
