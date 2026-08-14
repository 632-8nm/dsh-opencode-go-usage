// OpenCode Go 用量面板 — Host 半区
//
// 用法:把本文件内容作为 cordis_define 的 code.host 传入(函数体),
// 或按 bundle 插件方式安装(见 README)。
//
// 数据管道:
//   1. DSH 会话事件  (assistant/message 携带真实 token usage + 模型/provider)
//   2. opencode 官方库 (part 表 step-finish 逐请求记录,含官方 cost)
//   3. codex 代理日志 (cc-switch proxy_request_logs,Go key 流量)
//   4. 官方配额接口 (opencode.ai/zen/go/v1/usage,curl native TLS)
//
// 安全:API key 只在 python/curl 子进程内从 auth.json 读取,不进命令日志、不落盘。
return {
  apply(ctx) {
    const shell = ctx.get('shell')
    const sq = ctx.get('sessionQuery')
    if (shell === undefined || sq === undefined) return

    const PRICING = {
  "deepseek-v4-flash": { in: 0.14, out: 0.28, cr: 0.0028, cw: 0.0 },
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
    const normModel = (m) => String(m || '').replace(/^deepseek-ai\//, '')
    const r4 = (n) => Math.round(n * 10000) / 10000
    const costOf = (r) => {
      if (typeof r.costOfficial === 'number') return r.costOfficial
      const p = PRICING[normModel(r.model)]
      if (!p) return null
      return r4(((r.inputTokens || 0) * p.in + (r.outputTokens || 0) * p.out + (r.cacheReadTokens || 0) * p.cr + (r.cacheWriteTokens || 0) * p.cw) / 1e6)
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

    // --- 数据源 1:DSH 会话事件(任何 provider 通用,模型/provider 从事件 source 取) ---
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

    // --- 数据源 2+3:opencode 官方逐请求记录 + codex 代理日志(python 只读 sqlite) ---
    const PY_SCRIPT = [
      'import sqlite3, json, os',
      'HOME = os.environ.get("USERPROFILE") or os.environ.get("HOME") or r"C:\\Users\\Xenia"',
      'DB = os.path.join(HOME, ".local", "share", "opencode", "opencode.db")',
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
      'err = None',
      'codex_err = None',
      'try:',
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
      'except Exception as e:',
      '    err = "DB=" + DB + " exists=" + str(os.path.exists(DB)) + " " + repr(e)',
      'try:',
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
      'except Exception as e:',
      '    codex_err = "CCDB=" + CCDB + " " + repr(e)',
      'print(json.dumps({"rows": rows, "codexRows": codex_rows, "error": err, "codexError": codex_err}))',
    ].join('\n')
    const PY_PAYLOAD = btoa(PY_SCRIPT)

    async function collectDb() {
      const cmd = "$py='E:\\python\\python.exe';if(-not(Test-Path $py)){$c=Get-Command python -ErrorAction SilentlyContinue;if($c){$py=$c.Source}else{Write-Error 'python-not-found';exit 1}}; & $py -c \"import base64;exec(base64.b64decode('" + PY_PAYLOAD + "'))\""
      const spec = shell.resolve({ command: cmd, timeoutMs: 30000, stdoutMaxBytes: 16 * 1024 * 1024 })
      const result = await shell.run(spec)
      if (result.exitCode !== 0) {
        const raw = result.stderr
        return { rows: [], codexRows: [], error: String(typeof raw === 'string' ? raw : (raw && raw.text != null ? raw.text : raw || '')).slice(0, 300), codexError: null }
      }
      const raw = result.stdout
      const text = typeof raw === 'string' ? raw : (raw && raw.text != null ? String(raw.text) : '')
      try {
        const parsed = JSON.parse(text)
        return { rows: parsed.rows || [], codexRows: parsed.codexRows || [], error: parsed.error || null, codexError: parsed.codexError || null }
      } catch (e) {
        return { rows: [], codexRows: [], error: 'parse: ' + String(e && e.message || e), codexError: null }
      }
    }

    // --- 数据源 4:官方配额(curl native TLS,代理友好;key 在 pwsh 内读取,不进日志) ---
    async function collectQuota() {
      const cmd = '$k=(Get-Content "$env:USERPROFILE\\.local\\share\\opencode\\auth.json" -Raw|ConvertFrom-Json).\'opencode-go\'.key; if(-not $k){Write-Error "no-key";exit 1}; curl.exe -s -m 15 -H "Authorization: Bearer $k" https://opencode.ai/zen/go/v1/usage'
      const spec = shell.resolve({ command: cmd, timeoutMs: 20000 })
      const result = await shell.run(spec)
      if (result.exitCode !== 0) {
        const raw = result.stderr
        return { error: String(typeof raw === 'string' ? raw : (raw && raw.text != null ? raw.text : raw || '')).slice(0, 200) }
      }
      const raw = result.stdout
      const text = typeof raw === 'string' ? raw : (raw && raw.text != null ? String(raw.text) : '')
      try {
        const data = JSON.parse(text)
        const u = data.usage || {}
        const out = {}
        for (const k of ['rolling', 'weekly', 'monthly']) {
          const v = u[k]
          if (v && typeof v === 'object') out[k] = { percent: v.percent, status: v.status, resetsAt: v.resetsAt }
        }
        return out
      } catch (e) {
        return { error: 'quota parse: ' + String(e && e.message || e) }
      }
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
      for (const r of rows) {
        const key = normModel(r.model)
        const m = byModel[key] || (byModel[key] = { model: key, requests: 0, cost_est: 0, tokens_in: 0, tokens_out: 0, tokens_cr: 0, tokens_cw: 0, providers: {} })
        m.requests++
        m.tokens_in += r.inputTokens
        m.tokens_out += r.outputTokens
        m.tokens_cr += r.cacheReadTokens
        m.tokens_cw += r.cacheWriteTokens
        m.providers[r.provider || 'unknown'] = (m.providers[r.provider || 'unknown'] || 0) + 1
        const c = costOf(r)
        if (c != null) { m.cost_est += c }
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
      const modelList = Object.keys(byModel).map((k) => ({ model: byModel[k].model, requests: byModel[k].requests, cost_est: r4(byModel[k].cost_est), tokens_in: byModel[k].tokens_in, tokens_out: byModel[k].tokens_out, tokens_cr: byModel[k].tokens_cr, tokens_cw: byModel[k].tokens_cw, providers: Object.keys(byModel[k].providers) })).sort((a, b) => b.cost_est - a.cost_est)
      const dayList = []
      const d0 = new Date()
      for (let i = 29; i >= 0; i--) {
        const dt = new Date(d0.getTime() - i * 86400000)
        const k = dayKey(dt.getTime())
        dayList.push({ date: k, cost_est: r4(byDay[k] ? byDay[k].cost_est : 0), requests: byDay[k] ? byDay[k].requests : 0 })
      }
      const recent = Object.keys(bySession).map((k) => bySession[k]).sort((a, b) => b.updated - a.updated).slice(0, 6).map((s) => ({ id: s.id, cost_est: r4(s.cost_est), updated: s.updated, title: s.title || null }))
      return { today: agg(todayRows), month: agg(monthRows), total: agg(rows), by_model: modelList, by_day: dayList, recent }
    }

    async function fetchAll() {
      if (cache && Date.now() - cache.at < 45000) return cache.data
      const dshRows = await collectDsh()
      const db = await collectDb()
      const quota = await collectQuota()
      const dsh = buildView(dshRows)
      const all = buildView(dshRows.concat(db.rows, db.codexRows))
      const data = { ok: true, fetchedAt: Date.now(), quota: quota.error ? null : quota, quotaError: quota.error || null, dsh, all, ocgoError: db.error, codexError: db.codexError, ocgoCount: db.rows.length + db.codexRows.length }
      cache = { at: Date.now(), data }
      return data
    }

    ctx.effect(() => harness.handle('ocgo-usage:fetch', async () => {
      try {
        return await fetchAll()
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e) }
      }
    }))
  }
}
