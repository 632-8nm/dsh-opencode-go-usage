export const name = "opencode-go-usage"
import { writeFileSync as _ocgoWriteFileSync, mkdirSync as _ocgoMkdirSync } from 'node:fs'
import { join as _ocgoJoin } from 'node:path'
import { homedir as _ocgoHomedir } from 'node:os'
export function apply(ctx) {
    const shell = ctx.get('shell')
    const sq = ctx.get('sessionQuery')
    if (shell === undefined || sq === undefined) return

    const PRICING = {
  // 官方定价(opencode.ai/docs/go,per 1M tokens;deepseek-v4-flash 限时 2× 用量)。
  // 实测校准:deepseek-v4-flash 的 cache 读实际单价 ≈ $0.031/M(由 opencode.db
  // 官方 cost 反推,官网表格的 0.0028 与实测差 11 倍,以实测为准)。
  "deepseek-v4-flash": { in: 0.14, out: 0.28, cr: 0.031, cw: 0.0 },
  "deepseek-v4-pro": { in: 0.435, out: 0.87, cr: 0.003625, cw: 0.0 },
  "gpt-5.6-luna": { in: 0.2, out: 1.2, cr: 0.02, cw: 0.25 },
  "glm-5.3": { in: 1.4, out: 4.4, cr: 0.26, cw: 0.0 },
  "glm-5.2": { in: 1.4, out: 4.4, cr: 0.26, cw: 0.0 },
  "glm-5.1": { in: 1.4, out: 4.4, cr: 0.26, cw: 0.0 },
  "kimi-k3": { in: 3.0, out: 15.0, cr: 0.3, cw: 0.0 },
  "kimi-k2.7-code": { in: 0.95, out: 4.0, cr: 0.19, cw: 0.0 },
  "kimi-k2.6": { in: 0.95, out: 4.0, cr: 0.16, cw: 0.0 },
  "mimo-v2.5": { in: 0.14, out: 0.28, cr: 0.0028, cw: 0.0 },
  "mimo-v2.5-pro": { in: 0.435, out: 0.87, cr: 0.003625, cw: 0.0 },
  "minimax-m3": { in: 0.3, out: 1.2, cr: 0.06, cw: 0.0 },
  "minimax-m2.7": { in: 0.3, out: 1.2, cr: 0.06, cw: 0.375 },
  "minimax-m2.5": { in: 0.3, out: 1.2, cr: 0.06, cw: 0.375 },
  "qwen3.8-max": { in: 2.0, out: 6.0, cr: 0.25, cw: 2.5 },
  "qwen3.7-max": { in: 2.5, out: 7.5, cr: 0.5, cw: 3.125 },
  "qwen3.7-plus": { in: 0.4, out: 1.6, cr: 0.04, cw: 0.5 },
  "qwen3.6-plus": { in: 0.5, out: 3.0, cr: 0.05, cw: 0.625 },
  "grok-4.5": { in: 2.0, out: 6.0, cr: 0.3, cw: 0.0 },
  "hy3": { in: 0.14, out: 0.58, cr: 0.035, cw: 0.0 },
  "deepseek-v3.2": { in: 0.28, out: 0.42, cr: 0.028, cw: 0.0 },
  "deepseek-chat": { in: 0.14, out: 0.28, cr: 0.0028, cw: 0.0 },
  "deepseek-reasoner": { in: 0.14, out: 0.28, cr: 0.0028, cw: 0.0 },
  "gpt-5-nano": { in: 0.05, out: 0.4, cr: 0.005, cw: 0.0 },
  "qwen3-coder-flash": { in: 0.195, out: 0.975, cr: 0.039, cw: 0.0 },
  "gemini-2.5-flash": { in: 0.3, out: 2.5, cr: 0.03, cw: 0.0 },
}
    const GO_PROVIDER = 'opencode-go'
    const normModel = (m) => String(m || '').replace(/^(deepseek-ai|opencode-go|openai|anthropic|google|mistral|cohere)\//, '')
    const r4 = (n) => Math.round(n * 10000) / 10000
    const costOf = (r) => {
      if (typeof r.costOfficial === 'number') return r.costOfficial
      const p = PRICING[normModel(r.model)]
      if (!p) return null
      return r4(((r.inputTokens || 0) * p.in + (r.outputTokens || 0) * p.out + (r.cacheReadTokens || 0) * p.cr + (r.cacheWriteTokens || 0) * p.cw) / 1e6)
    }
    // 费用分项(仅估算行可拆分;官方 cost 行返回 null)
    const splitCost = (r) => {
      const p = PRICING[normModel(r.model)]
      if (!p || typeof r.costOfficial === 'number') return null
      return {
        in: r4((r.inputTokens || 0) * p.in / 1e6),
        out: r4((r.outputTokens || 0) * p.out / 1e6),
        cr: r4((r.cacheReadTokens || 0) * p.cr / 1e6),
        cw: r4((r.cacheWriteTokens || 0) * p.cw / 1e6),
      }
    }
    const dayKey = (ms) => {
      const d = new Date(ms)
      const p = (n) => String(n).padStart(2, '0')
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
    }

    // 45s 进程内缓存:面板打开与 60s 定时刷新共用一次计算。
    let cache = null

    // 有界并发读取全部会话(默认 4 并发)。
    async function mapLimit(items, limit, fn) {
      const out = new Array(items.length)
      let i = 0
      async function worker() {
        while (i < items.length) {
          const idx = i++
          out[idx] = await fn(items[idx], idx)
        }
      }
      await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
      return out
    }

    // --- DSH 会话分析(官方 usage.list 是账户级总额,无法区分来源应用;
    // 本分析单独统计 DSH 这个工具经 opencode-go 的用量,保留会话级视角) ---
    // 金额精度:先用官方定价估算(缓存增量法);再与官方 usage.list 逐请求记录按
    // (模型 + 时间窗口 + token 近似)匹配,匹配到的行用官方 cost 精确回填。
    async function collectDsh(officialRows) {
      const out = []
      const sessions = await sq.listSessions()
      const titles = new Map()
      try {
        const idList = sessions.map((s) => s.header.id)
        const obs = await sq.readTitleSnapshots(idList)
        for (const o of obs) {
          if (o.status === 'fulfilled' && o.value && o.value.title) {
            titles.set(o.sessionId, typeof o.value.title === 'string' ? o.value.title : (o.value.title.title || ''))
          }
        }
      } catch (e) { /* titles are best-effort */ }
      const snaps = await mapLimit(sessions, 4, (rec) => sq.readSession(rec.header.id).catch(() => null))
      // DSH 事件的 cacheReadTokens 是"会话累计上下文快照"(单调递增),直接求和会
      // 重复累计造成虚高(实测 12 会话可假算出 733M)。正确口径:按会话取相邻增量
      // (每次新增的缓存上下文),首条计全量(会话恢复时已有命中成本)。
      const prevCr = new Map()
      for (let k = 0; k < sessions.length; k++) {
        const snap = snaps[k]
        if (!snap) continue
        const sid = sessions[k].header.id
        for (const ev of snap.events) {
          if (ev.type !== 'assistant/message') continue
          const u = ev.data && ev.data.usage
          if (!u) continue
          const src = ev.data.message && ev.data.message.source
          // 只统计 opencode-go provider 的流量(与官方计费口径一致);
          // deepseek 直连等其它 provider 不属于 Go key,排除。
          if (!src || src.provider !== GO_PROVIDER) continue
          const crRaw = u.cacheReadTokens || 0
          const prev = prevCr.get(sid)
          const crDelta = prev == null ? crRaw : Math.max(0, crRaw - prev)
          prevCr.set(sid, crRaw)
          out.push({
            id: sid,
            title: titles.get(sid) || null,
            model: (src && src.model) || 'unknown',
            provider: (src && src.provider) || 'unknown',
            time: ev.time || 0,
            inputTokens: u.inputTokens || 0,
            outputTokens: u.outputTokens || 0,
            cacheReadTokens: crDelta,
            cacheWriteTokens: u.cacheWriteTokens || 0,
            reasoningTokens: u.reasoningTokens || 0,
          })
        }
      }
      // 官方 usage.list 回填:按 (模型, ±60s 时间窗, input ±30%) 匹配官方逐请求记录,
      // 匹配上的行用官方 cost 精确计费(替代估算)。匹配不上的保持估算
      // (如 8-14 之前本地已丢失的会话,官方记录里没有对应 DSH 事件)。
      if (officialRows && officialRows.length && out.length) {
        const used = new Set()
        let matched = 0
        for (const r of out) {
          if (r.time <= 0) continue
          let best = null
          for (const o of officialRows) {
            if (used.has(o.id) || o.model !== r.model) continue
            const dt = Math.abs(o.time - r.time)
            if (dt > 60000) continue
            const diff = Math.abs(o.inputTokens - r.inputTokens) / Math.max(1, r.inputTokens)
            if (diff > 0.3) continue
            if (!best || dt < best.dt) best = { o, dt }
          }
          if (best) {
            used.add(best.o.id)
            r.costOfficial = best.o.costOfficial
            matched++
          }
        }
        out.matchedOfficial = matched
      }
      return out
    }

    // UTF-8 安全的 base64.Native `btoa`(Node ≥16 的 whatwg 实现)只接受 Latin-1,
    // 遇到 >0xFF 的字符(如 PY 脚本里的中文标题 "Codex 会话")会抛 InvalidCharacterError,
    // 会直接打断 host 半区。先经 TextEncoder 落到 0-255 字节再编码即可稳定工作——
    // TextEncoder 在动态沙箱与静态 Node 都是全局。
    const utf8B64 = (s) => {
      const bytes = new TextEncoder().encode(s)
      let bin = ''
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
      return btoa(bin)
    }

    // --- 官方账户级用量明细(usage.list server-fn) ---
    // 凭据优先读配置 ~/.config/dsh-opencode-go-usage.json;缺失/过期时自动从
    // Edge cookie 库提取(auth cookie → workspaces API 解析 workspaceId),Edge
    // 运行时数据库被锁则返回 EDGE_RUNNING,由面板引导手动粘贴或关闭 Edge。
    // 返回逐请求官方计费明细(cost 单位 1e-8 美元),账户级、跨设备,与官网账单一致。
    const OFFICIAL_SCRIPT = [
      'import json, os, re, time, urllib.request, urllib.parse, base64, shutil, tempfile, sqlite3, ctypes, ctypes.wintypes as wt',
      'HOME = os.environ.get("USERPROFILE") or os.environ.get("HOME") or r"C:\\Users\\Xenia"',
      'CFG = os.path.join(HOME, ".config", "dsh-opencode-go-usage.json")',
      'FID = "bfd684bfc2e4eed05cd0b518f5e4eafd3f3376e3938abb9e536e7c03df831e5c"',
      'WSFID = "def39973159c7f0483d8793a822b8dbb10d067e12c65455fcb4608459ba0234f"',
      'PAGE_SIZE = 50',
      'UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/143.0.0.0 Safari/537.36"',
      'out = {"ok": False, "error": None, "records": [], "truncated": False, "autoExtracted": False}',
      'def unprotect(blob):',
      '    class BLOB(ctypes.Structure):',
      '        _fields_ = [("cbData", wt.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]',
      '    inb = BLOB(len(blob), ctypes.cast(ctypes.create_string_buffer(blob), ctypes.POINTER(ctypes.c_char)))',
      '    outb = BLOB()',
      '    if not ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(inb), None, None, None, None, 0, ctypes.byref(outb)):',
      '        raise RuntimeError("DPAPI unprotect failed")',
      '    data = ctypes.string_at(outb.pbData, outb.cbData)',
      '    ctypes.windll.kernel32.LocalFree(outb.pbData)',
      '    return data',
      'def extract_edge_cookie():',
      '    # 返回 auth cookie;失败抛异常(EDGE_RUNNING / NO_EDGE / NO_COOKIE / NO_CRYPTO)',
      '    try:',
      '        from cryptography.hazmat.primitives.ciphers.aead import AESGCM',
      '    except Exception:',
      '        raise RuntimeError("NO_CRYPTO")',
      '    la = os.environ.get("LOCALAPPDATA") or os.path.join(HOME, "AppData", "Local")',
      '    edge = os.path.join(la, "Microsoft", "Edge", "User Data")',
      '    ls_path = os.path.join(edge, "Local State")',
      '    if not os.path.exists(ls_path): raise RuntimeError("NO_EDGE")',
      '    ls = json.load(open(ls_path, encoding="utf-8"))',
      '    ek = base64.b64decode((ls.get("os_crypt") or {}).get("encrypted_key") or "")',
      '    if not ek.startswith(b"DPAPI"): raise RuntimeError("NO_DPAPI")',
      '    key = unprotect(ek[5:])',
      '    tmp = os.path.join(tempfile.gettempdir(), "ocgo-cookies-copy.db")',
      '    for prof in ["Default"] + ["Profile %d" % i for i in range(1, 30)]:',
      '        db = os.path.join(edge, prof, "Network", "Cookies")',
      '        if not os.path.exists(db): continue',
      '        try:',
      '            shutil.copy2(db, tmp)',
      '        except Exception:',
      '            raise RuntimeError("EDGE_RUNNING")',
      '        con = sqlite3.connect("file:" + tmp.replace(chr(92), "/") + "?mode=ro", uri=True)',
      '        rows = con.execute("SELECT encrypted_value FROM cookies WHERE host_key LIKE \'%opencode.ai%\' AND name = \'auth\'").fetchall()',
      '        con.close()',
      '        for (ev,) in rows:',
      '            if ev[:3] == b"v10" and len(ev) > 15:',
      '                try:',
      '                    val = AESGCM(key[:16]).decrypt(ev[3:15], ev[15:], None).decode("utf-8")',
      '                    if val.startswith("Fe26.2"): return val',
      '                except Exception:',
      '                    continue',
      '    raise RuntimeError("NO_COOKIE")',
      'def fetch_workspace_id(ck):',
      '    req = urllib.request.Request("https://opencode.ai/_server?id=" + WSFID, headers={',
      '        "Cookie": "auth=" + ck, "X-Server-Id": WSFID, "X-Server-Instance": "server-fn:ws-auto",',
      '        "Origin": "https://opencode.ai", "Referer": "https://opencode.ai/", "User-Agent": UA})',
      '    with urllib.request.urlopen(req, timeout=20) as r:',
      '        text = r.read().decode("utf-8", "replace")',
      '    m = re.search(r"wrk_[A-Za-z0-9]+", text)',
      '    return m.group(0) if m else None',
      'CK = ""',
      'WID = ""',
      'cfg = None',
      'try:',
      '    with open(CFG, encoding="utf-8-sig") as fh: cfg = json.load(fh)',
      'except Exception:',
      '    cfg = None',
      'if cfg:',
      '    CK = cfg.get("authCookie") or ""',
      '    WID = cfg.get("workspaceId") or ""',
      'if not CK or not WID:',
      '    try:',
      '        CK = extract_edge_cookie()',
      '        WID = fetch_workspace_id(CK)',
      '        if not WID: raise RuntimeError("WS_PARSE_FAIL")',
      '        try:',
      '            os.makedirs(os.path.dirname(CFG), exist_ok=True)',
      '            with open(CFG, "w", encoding="utf-8") as fh:',
      '                json.dump({"authCookie": CK, "workspaceId": WID}, fh, ensure_ascii=False)',
      '            out["autoExtracted"] = True',
      '        except Exception:',
      '            pass',
      '    except Exception as e:',
      '        out["error"] = str(e) if str(e) in ("EDGE_RUNNING", "NO_EDGE", "NO_COOKIE", "NO_CRYPTO", "NO_DPAPI", "WS_PARSE_FAIL") else repr(e)[:200]',
      '        print(json.dumps(out))',
      '        raise SystemExit',
      'def fetch_text(page):',
      '    args = urllib.parse.quote(json.dumps([WID, page]))',
      '    url = "https://opencode.ai/_server?id=%s&args=%s" % (FID, args)',
      '    req = urllib.request.Request(url, headers={',
      '        "Cookie": "auth=" + CK,',
      '        "X-Server-Id": FID,',
      '        "X-Server-Instance": "server-fn:ocgo-%d" % page,',
      '        "Origin": "https://opencode.ai",',
      '        "Referer": "https://opencode.ai/workspace/%s/usage" % WID,',
      '        "User-Agent": UA,',
      '    })',
      '    for attempt in range(2):',
      '        try:',
      '            with urllib.request.urlopen(req, timeout=20) as r:',
      '                return r.read().decode("utf-8", "replace")',
      '        except Exception:',
      '            time.sleep(0.8)',
      '    return None',
      'def parse_text(text):',
      '    got = 0',
      '    for b in re.findall(r\'\\{id:"usg_[^}]*?\\}\', text):',
      '        ts = re.search(r\'new Date\\("\' + r\'([^"]+)"\\)\', b)',
      '        model = re.search(r\'model:"([^"]+)"\', b)',
      '        cost = re.search(r\'cost:(\\d+)\', b)',
      '        if not (ts and model and cost): continue',
      '        def num(p):',
      '            m = re.search(p, b)',
      '            return int(m.group(1)) if m else 0',
      '        out["records"].append({"ts": ts.group(1), "model": model.group(1),',
      '            "ti": num(r\'inputTokens:(\\d+)\'), "to": num(r\'outputTokens:(\\d+)\'),',
      '            "rt": num(r\'reasoningTokens:(\\d+)\'), "cr": num(r\'cacheReadTokens:(\\d+)\'),',
      '            "cost": int(cost.group(1))})',
      '        got += 1',
      '    return got',
      'from concurrent.futures import ThreadPoolExecutor',
      'try:',
      '    MAXP = int((cfg or {}).get("maxPages", 150)) if cfg else 150',
      '    page = 0',
      '    with ThreadPoolExecutor(max_workers=6) as ex:',
      '        while page < MAXP:',
      '            batch = list(range(page, min(page + 6, MAXP)))',
      '            results = list(ex.map(fetch_text, batch))',
      '            for pg, text in zip(batch, results):',
      '                if text is None:',
      '                    page = MAXP',
      '                    break',
      '                got = parse_text(text)',
      '                if got < PAGE_SIZE:',
      '                    page = MAXP',
      '                    break',
      '                page = pg + 1',
      '            time.sleep(0.15)',
      '    out["ok"] = True',
      '    out["truncated"] = len(out["records"]) >= MAXP * PAGE_SIZE',
      'except Exception as e:',
      '    out["error"] = repr(e)[:200]',
      'print(json.dumps(out))',
    ].join('\n')
    const OFFICIAL_PAYLOAD = utf8B64(OFFICIAL_SCRIPT)

    // --- 数据源 4:官方配额(双通道容错:curl native TLS 优先,python urllib 兜底) ---
    const QUOTA_PY = [
      'import json, os, urllib.request',
      'HOME = os.environ.get("USERPROFILE") or os.environ.get("HOME") or r"C:\\Users\\Xenia"',
      'AUTH = os.path.join(HOME, ".local", "share", "opencode", "auth.json")',
      'try:',
      '    with open(AUTH, "r", encoding="utf-8") as f:',
      '        key = json.load(f).get("opencode-go", {}).get("key")',
      '    if not key:',
      '        raise RuntimeError("no key")',
      '    req = urllib.request.Request("https://opencode.ai/zen/go/v1/usage", headers={"Authorization": "Bearer " + key, "User-Agent": "dsh-ocgo-usage"})',
      '    with urllib.request.urlopen(req, timeout=15) as r:',
      '        print(r.read().decode("utf-8"))',
      'except Exception as e:',
      '    print(json.dumps({"error": repr(e)[:200]}))',
    ].join('\n')
    const QUOTA_PY_PAYLOAD = utf8B64(QUOTA_PY)

    async function collectQuota() {
      const parse = (text) => {
        try {
          const data = JSON.parse(text)
          const u = data.usage || {}
          const out = {}
          for (const k of ['rolling', 'weekly', 'monthly']) {
            const v = u[k]
            if (v && typeof v === 'object') out[k] = { percent: v.percent, status: v.status, resetsAt: v.resetsAt }
          }
          if (!Object.keys(out).length) return { error: 'empty usage payload' }
          return out
        } catch (e) {
          return { error: 'parse: ' + String(e && e.message || e) }
        }
      }
      const stdoutText = (raw) => typeof raw === 'string' ? raw : (raw && raw.text != null ? String(raw.text) : '')

      // 通道 1:curl(Windows 原生 TLS,代理兼容;key 在 pwsh 内读取,不进日志)
      const curlCmd = '$k=(Get-Content "$env:USERPROFILE\\.local\\share\\opencode\\auth.json" -Raw|ConvertFrom-Json).\'opencode-go\'.key; if(-not $k){Write-Error "no-key";exit 1}; curl.exe -s -m 15 -H "Authorization: Bearer $k" https://opencode.ai/zen/go/v1/usage'
      const c1 = await shell.run(shell.resolve({ command: curlCmd, timeoutMs: 20000 }))
      let c1err = null
      if (c1.exitCode === 0) {
        const r = parse(stdoutText(c1.stdout))
        if (!r.error) return r
        c1err = r.error
      }
      // 通道 2:python urllib 兜底
      const pyCmd = "$py='E:\\python\\python.exe';if(-not(Test-Path $py)){$c=Get-Command python -ErrorAction SilentlyContinue;if($c){$py=$c.Source}else{Write-Error 'python-not-found';exit 1}}; & $py -c \"import base64;exec(base64.b64decode('" + QUOTA_PY_PAYLOAD + "'))\""
      const c2 = await shell.run(shell.resolve({ command: pyCmd, timeoutMs: 20000 }))
      if (c2.exitCode === 0) {
        const r = parse(stdoutText(c2.stdout))
        if (!r.error) return r
        return { error: 'curl 失败(' + (c1err ? c1err : 'exit=' + c1.exitCode) + '); py 解析失败: ' + r.error }
      }
      return { error: 'curl+py 均失败: ' + (c1err ? 'curl ' + c1err + '; ' : '') + String(c1.stderr || c2.stderr || '').slice(0, 200) }
    }

    // --- 聚合视图:今日/本月/累计、按模型、按天、最近会话 ---
    function buildView(rows) {
      const todayKey = dayKey(Date.now())
      const monthPrefix = todayKey.slice(0, 7)
      const agg = (rs) => {
        const a = { requests: rs.length, tokens_input: 0, tokens_output: 0, tokens_reasoning: 0, tokens_cache_read: 0, tokens_cache_write: 0, cost_est: 0, cost_known: 0 }
        for (const r of rs) {
          a.tokens_input += r.inputTokens
          a.tokens_output += r.outputTokens
          a.tokens_reasoning += r.reasoningTokens
          a.tokens_cache_read += r.cacheReadTokens
          a.tokens_cache_write += r.cacheWriteTokens
          const c = costOf(r)
          if (c != null) { a.cost_est += c; a.cost_known++ }
        }
        a.cost_est = r4(a.cost_est)
        return a
      }
      const byModel = {}
      const byDay = {}
      const bySession = {}
      const byProvider = {}
      for (const r of rows) {
        const key = normModel(r.model)
        const m = byModel[key] || (byModel[key] = { model: key, requests: 0, cost_est: 0, cost_in: null, cost_out: null, cost_cr: null, cost_cw: null, tokens_in: 0, tokens_out: 0, tokens_cr: 0, tokens_cw: 0, providers: {} })
        m.requests++
        m.tokens_in += r.inputTokens
        m.tokens_out += r.outputTokens
        m.tokens_cr += r.cacheReadTokens
        m.tokens_cw += r.cacheWriteTokens
        m.providers[r.provider || 'unknown'] = (m.providers[r.provider || 'unknown'] || 0) + 1
        const c = costOf(r)
        if (c != null) { m.cost_est += c }
        const sp = splitCost(r)
        if (sp) {
          m.cost_in = (m.cost_in || 0) + sp.in
          m.cost_out = (m.cost_out || 0) + sp.out
          m.cost_cr = (m.cost_cr || 0) + sp.cr
          m.cost_cw = (m.cost_cw || 0) + sp.cw
        }
        const pv = byProvider[r.provider || 'unknown'] || (byProvider[r.provider || 'unknown'] = { provider: r.provider || 'unknown', requests: 0, cost_est: 0 })
        pv.requests++
        if (c != null) pv.cost_est += c
        const dk = dayKey(r.time)
        const dd = byDay[dk] || (byDay[dk] = { cost_est: 0, requests: 0 })
        dd.cost_est += c != null ? c : 0
        dd.requests++
        const s = bySession[r.id] || (bySession[r.id] = { id: r.id, title: r.title || null, cost_est: 0, updated: r.time, tokens: 0 })
        if (!s.title && r.title) s.title = r.title
        s.cost_est += c != null ? c : 0
        s.tokens += r.inputTokens + r.outputTokens
        if (r.time > s.updated) s.updated = r.time
      }
      const todayRows = rows.filter((r) => dayKey(r.time) === todayKey)
      const monthRows = rows.filter((r) => dayKey(r.time).slice(0, 7) === monthPrefix)
      const modelList = Object.keys(byModel).map((k) => ({ model: byModel[k].model, requests: byModel[k].requests, cost_est: r4(byModel[k].cost_est), cost_in: byModel[k].cost_in, cost_out: byModel[k].cost_out, cost_cr: byModel[k].cost_cr, cost_cw: byModel[k].cost_cw, tokens_in: byModel[k].tokens_in, tokens_out: byModel[k].tokens_out, tokens_cr: byModel[k].tokens_cr, tokens_cw: byModel[k].tokens_cw, providers: Object.keys(byModel[k].providers) })).sort((a, b) => b.cost_est - a.cost_est)
      const providerList = Object.keys(byProvider).map((k) => ({ provider: byProvider[k].provider, requests: byProvider[k].requests, cost_est: r4(byProvider[k].cost_est) })).sort((a, b) => b.cost_est - a.cost_est)
      const dayList = []
      const d0 = new Date()
      for (let i = 29; i >= 0; i--) {
        const dt = new Date(d0.getTime() - i * 86400000)
        const k = dayKey(dt.getTime())
        dayList.push({ date: k, cost_est: r4(byDay[k] ? byDay[k].cost_est : 0), requests: byDay[k] ? byDay[k].requests : 0 })
      }
      const recent = Object.keys(bySession).map((k) => bySession[k]).sort((a, b) => b.updated - a.updated).slice(0, 8).map((s) => ({ id: s.id, cost_est: r4(s.cost_est), updated: s.updated, title: s.title || null }))
      return { today: agg(todayRows), month: agg(monthRows), total: agg(rows), by_model: modelList, by_provider: providerList, by_day: dayList, recent }
    }

    // 官方账户级用量(usage.list)。15 分钟缓存 + 并发去重:全量分页开销大,
    // 面板 60s 轮询不应反复触发;标注 truncated 表示页数超上限(数据截断)。
    let officialCache = null
    let officialInflight = null
    async function collectOfficial() {
      if (officialCache && Date.now() - officialCache.at < 15 * 60 * 1000) return officialCache.data
      if (officialInflight) return officialInflight
      officialInflight = (async () => {
        try {
          const cmd = "$py='E:\\python\\python.exe';if(-not(Test-Path $py)){$c=Get-Command python -ErrorAction SilentlyContinue;if($c){$py=$c.Source}else{Write-Error 'python-not-found';exit 1}}; & $py -c \"import base64;exec(base64.b64decode('" + OFFICIAL_PAYLOAD + "'))\""
          const spec = shell.resolve({ command: cmd, timeoutMs: 240000, stdoutMaxBytes: 32 * 1024 * 1024 })
          const result = await shell.run(spec)
          const stderrText = String(typeof result.stderr === 'string' ? result.stderr : (result.stderr && result.stderr.text != null ? result.stderr.text : '')).slice(0, 200)
          if (result.exitCode !== 0) return { ok: false, error: stderrText || '子进程退出码 ' + result.exitCode }
          const raw = result.stdout
          const text = typeof raw === 'string' ? raw : (raw && raw.text != null ? String(raw.text) : '')
          const parsed = JSON.parse(text)
          if (!parsed.ok) return { ok: false, error: parsed.error || 'unknown' }
          const rows = (parsed.records || []).map((r, i) => ({
            id: 'of-' + i,
            title: null,
            model: r.model,
            provider: 'official',
            time: Date.parse(r.ts) || 0,
            inputTokens: r.ti || 0,
            outputTokens: r.to || 0,
            reasoningTokens: r.rt || 0,
            cacheReadTokens: r.cr || 0,
            cacheWriteTokens: 0,
            // usage.list 的 cost 单位为 1e-8 美元(实测与官网账单吻合)
            costOfficial: (r.cost || 0) / 1e8,
          }))
          return { ok: true, vd: buildView(rows), rows, truncated: !!parsed.truncated, records: rows.length, autoExtracted: !!parsed.autoExtracted }
        } catch (e) {
          return { ok: false, error: String((e && e.message) || e) }
        } finally {
          officialInflight = null
        }
      })()
      try {
        const data = await officialInflight
        officialCache = { at: Date.now(), data }
        // 后台拉取完成后,同步进已缓存响应;并用官方记录回填 DSH 金额(精确匹配)
        if (cache && cache.data) {
          cache.data.official = data
          if (data.ok && data.rows) {
            collectDsh(data.rows).then((rows) => {
              if (cache && cache.data) {
                const dv = buildView(rows)
                dv.matchedOfficial = rows.matchedOfficial || 0
                cache.data.dsh = dv
              }
            }).catch(() => {})
          }
        }
        return data
      } finally {
        officialInflight = null
      }
    }

    // 保存官方凭据配置(bundle 形态用注入的 node:fs;动态沙箱无 fs → bundle-only)
    function saveOfficialConfig(payload) {
      try {
        if (typeof _ocgoWriteFileSync !== 'function') return { ok: false, error: 'bundle-only' }
        const cfgPath = _ocgoJoin(_ocgoHomedir(), '.config', 'dsh-opencode-go-usage.json')
        _ocgoMkdirSync(_ocgoJoin(_ocgoHomedir(), '.config'), { recursive: true })
        _ocgoWriteFileSync(cfgPath, JSON.stringify(payload, null, 1), 'utf8')
        officialCache = null // 清缓存,下次拉取使用新配置
        return { ok: true }
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e) }
      }
    }

    // 并发去重:同一时刻只跑一次全量聚合(面板打开/刷新/定时轮询可能同时触发)。
    let inflight = null
    async function fetchAll() {
      if (cache && Date.now() - cache.at < 45000) return cache.data
      if (inflight) return inflight
      inflight = (async () => {
        // DSH 会话分析 + 官方配额并行;官方明细不阻塞面板——
        // 有缓存直接带出,无缓存先返回 loading 并在后台拉取(首次全量约 10-50s)
        const off = officialCache ? officialCache.data : null
        const [dshRows, quota] = await Promise.all([
          collectDsh(off && off.ok && off.rows ? off.rows : null).catch(() => []),
          collectQuota().catch(() => ({ error: 'quota 异常' })),
        ])
        const dsh = buildView(dshRows)
        dsh.matchedOfficial = dshRows.matchedOfficial || 0
        if (!off) collectOfficial().catch(() => {})
        const data = { ok: true, fetchedAt: Date.now(), quota: quota.error ? null : quota, quotaError: quota.error || null, dsh, official: off || { ok: false, loading: true } }
        cache = { at: Date.now(), data }
        return data
      })()
      try {
        return await inflight
      } finally {
        inflight = null
      }
    }

    const serve = async () => {
      try {
        return await fetchAll()
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e) }
      }
    }
    // 动态模式(dcordis 沙箱)提供 `harness` 全局:注册 Package-private RPC。
    const harnessApi = (typeof harness !== 'undefined' && harness) ? harness : null
    if (harnessApi && typeof harnessApi.handle === 'function') {
      ctx.effect(() => harnessApi.handle('ocgo-usage:fetch', serve))
    }
    // bundle 模式没有 harness 桥:改走 webServer 的本地 HTTP 路由,
    // 客户端同源 fetch('/ocgo-usage/fetch') 取数,两种加载模式都可用。
    const ws = ctx.get('webServer')
    if (ws !== undefined && typeof ws.register === 'function') {
      ctx.effect(() => ws.register({
        kind: 'exact',
        path: '/ocgo-usage/fetch',
        handler: async (req, res) => {
          try {
            const data = await fetchAll()
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(data))
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: String((e && e.message) || e) }))
          }
        },
      }))
      // 手动粘贴官方凭据:POST {authCookie, workspaceId} → 写配置文件并清缓存
      ctx.effect(() => ws.register({
        kind: 'exact',
        path: '/ocgo-usage/config',
        handler: async (req, res) => {
          try {
            if (req.method !== 'POST') { res.writeHead(405); res.end(); return }
            let body = ''
            for await (const chunk of req) body += chunk
            const cfg = JSON.parse(body || '{}')
            if (!cfg || typeof cfg.authCookie !== 'string' || !cfg.authCookie || typeof cfg.workspaceId !== 'string' || !cfg.workspaceId) {
              throw new Error('需要 authCookie 和 workspaceId')
            }
            const r = saveOfficialConfig({ authCookie: cfg.authCookie.trim(), workspaceId: cfg.workspaceId.trim() })
            res.writeHead(r.ok ? 200 : 400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(r))
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: String((e && e.message) || e) }))
          }
        },
      }))
    }
  }
