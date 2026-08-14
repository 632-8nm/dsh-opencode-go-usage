// OpenCode Go 用量面板 — Host 半区
//
// 用法:把本文件内容作为 cordis_define 的 code.host 传入(函数体),
// 或按 bundle 插件方式安装(见 README)。
//
// 数据管道:
//   1. DSH 会话事件  (assistant/message 携带真实 token usage + 模型/provider)
//   2. opencode 官方库 (part 表 step-finish 逐请求记录,含官方 cost)
//   3. codex 代理日志 (cc-switch proxy_request_logs,Go key 流量)
//   4. 官方配额接口 (opencode.ai/zen/go/v1/usage,curl + python 双通道)
//
// 安全:API key 只在 python/curl 子进程内从 auth.json 读取,不进命令日志、不落盘。
// 弹性:数据源缺失自动降级(OPENCODE_DATA 优先,各源独立可用性检测)。
return {
  apply(ctx) {
    const shell = ctx.get('shell')
    const sq = ctx.get('sessionQuery')
    if (shell === undefined || sq === undefined) return

    const PRICING = {
  // 官方定价(opencode.ai/docs/go,per 1M tokens;deepseek-v4-flash 限时 2× 用量)。
  // 含全部官方模型;gpt-5.6-luna/qwen3.7-plus/qwen3.6-plus 按低档价(≤272K/≤256K)。
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

    // --- 数据源 1:DSH 会话事件(任何 provider 通用) ---
    async function collectDsh() {
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
          // 口径:面板只统计 opencode-go provider 的流量(与 opencode.db 的
          // providerID 过滤一致)。DSH 会话若走了 deepseek 直连等其它 provider,
          // 不属于 Go key 计费,必须排除,否则会虚增金额。
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
      return out
    }

    // --- 数据源 2+3:opencode 官方逐请求 + codex 会话记录(只读,弹性降级) ---
    // codex 口径:codex 的 config.toml 指向 opencode.ai/zen/go/v1(Go key),无论
    // 走 cc-switch 代理(proxy)还是直连,都是 Go 账号流量,全部计入。
    // codex 抓取:直接读 ~/.codex/sessions/**/*.jsonl(事件流含每会话累计
    // total_token_usage),不再依赖 cc-switch 的会话同步(cc-switch 退出即断流)。
    // 实测与 cc-switch 记录差异 <0.1%(80M tokens 对账一致)。
    // opencode_session 直连记录则与 opencode.db 重复,由 opencode.db 来源覆盖。
    const PY_SCRIPT = [
      'import sqlite3, json, os, glob, datetime',
      'HOME = os.environ.get("USERPROFILE") or os.environ.get("HOME") or r"C:\\Users\\Xenia"',
      'DATA = os.environ.get("OPENCODE_DATA") or os.path.join(HOME, ".local", "share", "opencode")',
      'DB = os.path.join(DATA, "opencode.db")',
      'CODEX_DIR = os.path.join(HOME, ".codex", "sessions")',
      'def mid(raw):',
      '    if not raw: return "unknown"',
      '    try: return json.loads(raw).get("id") or raw',
      '    except Exception: return raw',
      'def pid(raw):',
      '    if not raw: return "unknown"',
      '    try: return json.loads(raw).get("providerID") or "unknown"',
      '    except Exception: return "unknown"',
      'rows = []',
      'codex_rows = []',
      'ocgo_avail = False',
      'ocgo_err = None',
      'codex_avail = False',
      'codex_err = None',
      'try:',
      '    if not os.path.exists(DB): raise FileNotFoundError("not found: " + DB)',
      '    con = sqlite3.connect("file:" + DB.replace(chr(92), "/") + "?mode=ro", uri=True)',
      '    cur = con.cursor()',
      '    cur.execute("SELECT p.session_id, p.time_created, p.data, s.model, s.title FROM part p JOIN session s ON s.id = p.session_id WHERE p.data LIKE \'%step-finish%\'")',
      '    for i, (sid, t, data, model, title) in enumerate(cur.fetchall()):',
      '        if pid(model) != "opencode-go": continue',
      '        try:',
      '            obj = json.loads(data)',
      '        except Exception:',
      '            continue',
      '        if obj.get("type") != "step-finish": continue',
      '        tok = obj.get("tokens") or {}',
      '        cache = tok.get("cache") or {}',
      '        rows.append({"id": "oc-" + str(i), "title": title or None, "model": mid(model), "provider": "opencode", "time": t or 0, "inputTokens": tok.get("input") or 0, "outputTokens": tok.get("output") or 0, "reasoningTokens": tok.get("reasoning") or 0, "cacheReadTokens": cache.get("read") or 0, "cacheWriteTokens": cache.get("write") or 0, "costOfficial": obj.get("cost")})',
      '    con.close()',
      '    ocgo_avail = True',
      'except Exception as e:',
      '    ocgo_err = "DB=" + DB + " " + repr(e)[:200]',
      'try:',
      '    # gpt-5.6-luna Go 官方定价(per 1M):in 0.2 / out 1.2 / cache read 0.02',
      '    CI, CO, CCR = 0.2, 1.2, 0.02',
      '    ci = 0',
      '    for cf in sorted(glob.glob(os.path.join(CODEX_DIR, "**", "*.jsonl"), recursive=True)):',
      '        last = None',
      '        ts = ""',
      '        try:',
      '            with open(cf, "r", encoding="utf-8", errors="replace") as fh:',
      '                for ln in fh:',
      '                    ln = ln.strip()',
      '                    if not ln: continue',
      '                    try: ev = json.loads(ln)',
      '                    except Exception: continue',
      '                    if ev.get("type") != "event_msg": continue',
      '                    info = (ev.get("payload") or {}).get("info") or {}',
      '                    u = info.get("total_token_usage")',
      '                    if isinstance(u, dict) and u.get("input_tokens"):',
      '                        last = u',
      '                        ts = ev.get("timestamp") or ts',
      '        except Exception:',
      '            continue',
      '        if not last: continue',
      '        ti = last.get("input_tokens") or 0',
      '        cr = last.get("cached_input_tokens") or 0',
      '        to = last.get("output_tokens") or 0',
      '        # input_tokens 含缓存命中(与 cc-switch 口径一致):非缓存输入 = ti - cr,',
      '        # 缓存读 = cr。成本 =(非缓存输入×in + 缓存×cr + 输出×out),不可重复计缓存。',
      '        tms = 0',
      '        # 时间优先用事件 timestamp(ISO),取不到时从文件名 rollout-YYYY-MM-DDTHH-MM-SS 解析',
      '        if isinstance(ts, str) and ts:',
      '            try: tms = int(datetime.datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp() * 1000)',
      '            except Exception: tms = 0',
      '        if not tms:',
      '            try:',
      '                b = os.path.basename(cf)',
      '                p = b.find("rollout-")',
      '                if p >= 0:',
      '                    part = b[p + 8: p + 27]',
      '                    tms = int(datetime.datetime.strptime(part, "%Y-%m-%dT%H-%M-%S").timestamp() * 1000)',
      '            except Exception:',
      '                tms = 0',
      '        cost = ((ti - cr) * CI + cr * CCR + to * CO) / 1e6',
      '        codex_rows.append({"id": "cx-" + str(ci), "title": "Codex 会话", "model": "gpt-5.6-luna", "provider": "codex", "time": tms, "inputTokens": max(0, ti - cr), "outputTokens": to, "reasoningTokens": 0, "cacheReadTokens": cr, "cacheWriteTokens": 0, "costOfficial": round(cost, 6)})',
      '        ci += 1',
      '    codex_avail = True',
      'except Exception as e:',
      '    codex_err = "CODEX=" + CODEX_DIR + " " + repr(e)[:200]',
      'print(json.dumps({"rows": rows, "codexRows": codex_rows, "ocgoAvailable": ocgo_avail, "ocgoError": ocgo_err, "codexAvailable": codex_avail, "codexError": codex_err}))',
    ].join('\n')
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
    const PY_PAYLOAD = utf8B64(PY_SCRIPT)

    // --- 数据源 5:官方账户级用量明细(usage.list server-fn,需浏览器 cookie) ---
    // 配置:~/.config/dsh-opencode-go-usage.json  {"authCookie": "...", "workspaceId": "wrk_..."}
    // cookie 在 opencode.ai 登录后浏览器 Application/Cookies 里复制名为 auth 的值。
    // 返回逐请求官方计费明细(cost 单位 1e-8 美元),账户级、跨设备,与官网账单一致。
    const OFFICIAL_SCRIPT = [
      'import json, os, re, time, urllib.request, urllib.parse',
      'HOME = os.environ.get("USERPROFILE") or os.environ.get("HOME") or r"C:\\Users\\Xenia"',
      'CFG = os.path.join(HOME, ".config", "dsh-opencode-go-usage.json")',
      'FID = "bfd684bfc2e4eed05cd0b518f5e4eafd3f3376e3938abb9e536e7c03df831e5c"',
      'PAGE_SIZE = 50',
      'out = {"ok": False, "error": None, "records": [], "truncated": False}',
      'try:',
      '    with open(CFG, encoding="utf-8-sig") as fh: cfg = json.load(fh)',
      '    CK = cfg.get("authCookie") or ""',
      '    WID = cfg.get("workspaceId") or ""',
      '    if not CK or not WID: raise ValueError("配置缺少 authCookie/workspaceId")',
      '    MAXP = int(cfg.get("maxPages", 150))',
      '    for page in range(MAXP):',
      '        args = urllib.parse.quote(json.dumps([WID, page]))',
      '        url = "https://opencode.ai/_server?id=%s&args=%s" % (FID, args)',
      '        req = urllib.request.Request(url, headers={',
      '            "Cookie": "auth=" + CK,',
      '            "X-Server-Id": FID,',
      '            "X-Server-Instance": "server-fn:ocgo-%d" % page,',
      '            "Origin": "https://opencode.ai",',
      '            "Referer": "https://opencode.ai/workspace/%s/usage" % WID,',
      '            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/143.0.0.0 Safari/537.36",',
      '        })',
      '        text = None',
      '        for attempt in range(3):',
      '            try:',
      '                with urllib.request.urlopen(req, timeout=30) as r:',
      '                    text = r.read().decode("utf-8", "replace")',
      '                break',
      '            except Exception:',
      '                time.sleep(1.0)',
      '        if text is None: break',
      '        got = 0',
      '        for b in re.findall(r\'\\{id:"usg_[^}]*?\\}\', text):',
      '            ts = re.search(r\'new Date\\("\' + r\'([^"]+)"\\)\', b)',
      '            model = re.search(r\'model:"([^"]+)"\', b)',
      '            cost = re.search(r\'cost:(\\d+)\', b)',
      '            if not (ts and model and cost): continue',
      '            def num(p):',
      '                m = re.search(p, b)',
      '                return int(m.group(1)) if m else 0',
      '            out["records"].append({"ts": ts.group(1), "model": model.group(1),',
      '                "ti": num(r\'inputTokens:(\\d+)\'), "to": num(r\'outputTokens:(\\d+)\'),',
      '                "rt": num(r\'reasoningTokens:(\\d+)\'), "cr": num(r\'cacheReadTokens:(\\d+)\'),',
      '                "cost": int(cost.group(1))})',
      '            got += 1',
      '        if got < PAGE_SIZE: break',
      '        time.sleep(0.4)',
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

    async function collectDb() {
      const cmd = "$py='E:\\python\\python.exe';if(-not(Test-Path $py)){$c=Get-Command python -ErrorAction SilentlyContinue;if($c){$py=$c.Source}else{Write-Error 'python-not-found';exit 1}}; & $py -c \"import base64;exec(base64.b64decode('" + PY_PAYLOAD + "'))\""
      const spec = shell.resolve({ command: cmd, timeoutMs: 30000, stdoutMaxBytes: 16 * 1024 * 1024 })
      const result = await shell.run(spec)
      const stderrText = String(typeof result.stderr === 'string' ? result.stderr : (result.stderr && result.stderr.text != null ? result.stderr.text : result.stderr || '')).slice(0, 300)
      if (result.exitCode !== 0) {
        // 整个子进程失败(python 缺失/超时等):opencode 与 codex 两个数据源都不可用,
        // 都要带上错误,否则客户端会把 codex 误显示为“可用但无数据”。
        return { rows: [], codexRows: [], ocgoAvailable: false, ocgoError: stderrText || 'collectDb 子进程退出码 ' + result.exitCode, codexAvailable: false, codexError: stderrText || 'collectDb 子进程退出码 ' + result.exitCode }
      }
      const raw = result.stdout
      const text = typeof raw === 'string' ? raw : (raw && raw.text != null ? String(raw.text) : '')
      try {
        const parsed = JSON.parse(text)
        return { rows: parsed.rows || [], codexRows: parsed.codexRows || [], ocgoAvailable: !!parsed.ocgoAvailable, ocgoError: parsed.ocgoError || null, codexAvailable: !!parsed.codexAvailable, codexError: parsed.codexError || null }
      } catch (e) {
        const err = 'parse: ' + String(e && e.message || e)
        return { rows: [], codexRows: [], ocgoAvailable: false, ocgoError: err, codexAvailable: false, codexError: err }
      }
    }

    // --- 聚合视图:今日/本月/累计、按模型(含分项)、按来源、按天、最近会话 ---
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
          return { ok: true, vd: buildView(rows), truncated: !!parsed.truncated, records: rows.length }
        } catch (e) {
          return { ok: false, error: String((e && e.message) || e) }
        } finally {
          officialInflight = null
        }
      })()
      try {
        const data = await officialInflight
        officialCache = { at: Date.now(), data }
        return data
      } finally {
        officialInflight = null
      }
    }

    // 并发去重:同一时刻只跑一次全量聚合(面板打开/刷新/定时轮询可能同时触发)。
    let inflight = null
    async function fetchAll() {
      if (cache && Date.now() - cache.at < 45000) return cache.data
      if (inflight) return inflight
      inflight = (async () => {
        // 四数据源并行(官方源自带 15 分钟缓存,失败降级不影响其它源)
        const [dshRows, db, quota, official] = await Promise.all([
          collectDsh().catch(() => []),
          collectDb(),
          collectQuota(),
          collectOfficial().catch(() => ({ ok: false, error: 'collectOfficial 异常' })),
        ])
        const dsh = buildView(dshRows)
        const all = buildView(dshRows.concat(db.rows, db.codexRows))
        const data = { ok: true, fetchedAt: Date.now(), quota: quota.error ? null : quota, quotaError: quota.error || null, dsh, all, official, ocgoAvailable: db.ocgoAvailable, ocgoError: db.ocgoError, codexAvailable: db.codexAvailable, codexError: db.codexError }
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
    }
  }
}
