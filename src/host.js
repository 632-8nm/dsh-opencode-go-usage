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
  // 注:deepseek-v4-flash 为 2026-08 从本机 opencode.db 的 opencode-go 真实计费行
  // (2667 行,含官方 cost)最小二乘拟合所得;其余模型为公开价估算。
  "deepseek-v4-flash": { in: 0.299, out: 0.215, cr: 0.0043, cw: 0.253 },
  "deepseek-v4-pro": { in: 0.435, out: 0.87, cr: 0.003625, cw: 0.0 },
  "gpt-5.6-luna": { in: 0.2, out: 1.2, cr: 0.02, cw: 0.25 },
  "glm-5.2": { in: 1.4, out: 4.4, cr: 0.26, cw: 0.0 },
  "deepseek-v3.2": { in: 0.28, out: 0.42, cr: 0.028, cw: 0.0 },
  "deepseek-chat": { in: 0.14, out: 0.28, cr: 0.0028, cw: 0.0 },
  "deepseek-reasoner": { in: 0.14, out: 0.28, cr: 0.0028, cw: 0.0 },
  "gpt-5-nano": { in: 0.05, out: 0.4, cr: 0.005, cw: 0.0 },
  "mimo-v2.5": { in: 0.14, out: 0.29, cr: 0.0028, cw: 0.0 },
  "kimi-k2.7-code": { in: 0.95, out: 4.0, cr: 0.19, cw: 0.0 },
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
      for (let k = 0; k < sessions.length; k++) {
        const snap = snaps[k]
        if (!snap) continue
        for (const ev of snap.events) {
          if (ev.type !== 'assistant/message') continue
          const u = ev.data && ev.data.usage
          if (!u) continue
          const src = ev.data.message && ev.data.message.source
          // 口径:面板只统计 opencode-go provider 的流量(与 opencode.db 的
          // providerID 过滤一致)。DSH 会话若走了 deepseek 直连等其它 provider,
          // 不属于 Go key 计费,必须排除,否则会虚增金额。
          if (!src || src.provider !== GO_PROVIDER) continue
          out.push({
            id: sessions[k].header.id,
            title: titles.get(sessions[k].header.id) || null,
            model: (src && src.model) || 'unknown',
            provider: (src && src.provider) || 'unknown',
            time: ev.time || 0,
            inputTokens: u.inputTokens || 0,
            outputTokens: u.outputTokens || 0,
            cacheReadTokens: u.cacheReadTokens || 0,
            cacheWriteTokens: u.cacheWriteTokens || 0,
            reasoningTokens: u.reasoningTokens || 0,
          })
        }
      }
      return out
    }

    // --- 数据源 2+3:opencode 官方逐请求 + codex 代理日志(只读 sqlite,弹性降级) ---
    const PY_SCRIPT = [
      'import sqlite3, json, os',
      'HOME = os.environ.get("USERPROFILE") or os.environ.get("HOME") or r"C:\\Users\\Xenia"',
      'DATA = os.environ.get("OPENCODE_DATA") or os.path.join(HOME, ".local", "share", "opencode")',
      'DB = os.path.join(DATA, "opencode.db")',
      'CCDB = os.path.join(HOME, ".cc-switch", "cc-switch.db")',
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
      '    if not os.path.exists(CCDB): raise FileNotFoundError("not found: " + CCDB)',
      '    con2 = sqlite3.connect("file:" + CCDB.replace(chr(92), "/") + "?mode=ro", uri=True)',
      '    cur2 = con2.cursor()',
      '    cur2.execute("SELECT model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, total_cost_usd, created_at FROM proxy_request_logs WHERE app_type = \'codex\'")',
      '    for i, r in enumerate(cur2.fetchall()):',
      '        try:',
      '            cost = float(r[5] or 0)',
      '        except Exception:',
      '            cost = 0',
      '        codex_rows.append({"id": "cx-" + str(i), "title": "Codex 会话", "model": r[0] or "unknown", "provider": "codex", "time": (r[6] or 0) * 1000, "inputTokens": r[1] or 0, "outputTokens": r[2] or 0, "reasoningTokens": 0, "cacheReadTokens": r[3] or 0, "cacheWriteTokens": r[4] or 0, "costOfficial": cost})',
      '    con2.close()',
      '    codex_avail = True',
      'except Exception as e:',
      '    codex_err = "CCDB=" + CCDB + " " + repr(e)[:200]',
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

    // 并发去重:同一时刻只跑一次全量聚合(面板打开/刷新/定时轮询可能同时触发)。
    let inflight = null
    async function fetchAll() {
      if (cache && Date.now() - cache.at < 45000) return cache.data
      if (inflight) return inflight
      inflight = (async () => {
        // 三数据源并行(此前串行,每次刷新延迟约为三者之和)
        const [dshRows, db, quota] = await Promise.all([
          collectDsh().catch(() => []),
          collectDb(),
          collectQuota(),
        ])
        const dsh = buildView(dshRows)
        const all = buildView(dshRows.concat(db.rows, db.codexRows))
        const data = { ok: true, fetchedAt: Date.now(), quota: quota.error ? null : quota, quotaError: quota.error || null, dsh, all, ocgoAvailable: db.ocgoAvailable, ocgoError: db.ocgoError, codexAvailable: db.codexAvailable, codexError: db.codexError }
        cache = { at: Date.now(), data }
        return data
      })()
      try {
        return await inflight
      } finally {
        inflight = null
      }
    }

    // 动态模式(dcordis 沙箱)提供 `harness` 全局;静态 bundle 模式没有该桥,
    // host 半区干净退出,客户端会显示明确的“RPC 桥不可用”提示。
    const harnessApi = (typeof harness !== 'undefined' && harness) ? harness : null
    if (harnessApi && typeof harnessApi.handle === 'function') {
      ctx.effect(() => harnessApi.handle('ocgo-usage:fetch', async () => {
        try {
          return await fetchAll()
        } catch (e) {
          return { ok: false, error: String((e && e.message) || e) }
        }
      }))
    }
  }
}
