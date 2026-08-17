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
  apply(ctx, config) {
    const sq = ctx.get('sessionQuery')
    if (sq === undefined) return

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

    // --- DSH 会话分析(官方 usage.list 是账户级总额,无法区分来源应用;
    // 本分析单独统计 DSH 这个工具经 opencode-go 的用量,保留会话级视角) ---
    // 金额精度:先用官方定价估算(缓存增量法);再与官方 usage.list 逐请求记录按
    // (模型 + 时间窗口 + token 近似)匹配,匹配到的行用官方 cost 精确回填。
    // DSH 会话扫描(慢:逐个读会话事件)。与官方段1 拉取并行执行,
    // 回填是纯内存操作(backfillDsh),不重复扫描。
    // 内存约束:流式扫描,最多 SCAN_CONCURRENCY 个会话同时驻留,行提取后快照
    // 立即释放——此前 24 并发 + 全量驻留,会话库几百 MB 压缩时所有会话事件
    // 同时解压成 JS 对象,瞬时峰值可达 GB 级,实测把 DSH 服务 V8 堆撑爆到
    // 4GB 上限(FATAL ERROR: Ineffective mark-compacts,退出码 134,服务被
    // V8 直接杀死)。并发降到 6 后峰值约为原来的 1/4,且每块处理完即被 GC。
    async function collectDshScan() {
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
      // DSH 事件的 cacheReadTokens 是"会话累计上下文快照"(单调递增),直接求和会
      // 重复累计造成虚高(实测 12 会话可假算出 733M)。正确口径:按会话取相邻增量
      // (每次新增的缓存上下文),首条计全量(会话恢复时已有命中成本)。
      const prevCr = new Map()
      const SCAN_CONCURRENCY = 6
      let cursor = 0
      async function worker() {
        while (cursor < sessions.length) {
          const idx = cursor++
          const rec = sessions[idx]
          const snap = await sq.readSession(rec.header.id).catch(() => null)
          if (!snap) continue
          const sid = rec.header.id
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
          // snap 离开作用域即释放,GC 可回收
        }
      }
      await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, sessions.length) }, worker))
      return out
    }

    // 官方 usage.list 回填(纯内存,毫秒级):按 (模型, ±60s 时间窗, input ±30%)
    // 匹配官方逐请求记录,匹配上的行用官方 cost 精确计费(替代估算)。
    // 匹配不上的保持估算(如 8-14 之前本地已丢失的会话,官方记录里没有对应 DSH 事件)。
    function backfillDsh(out, officialRows) {
      let matched = 0
      if (officialRows && officialRows.length && out.length) {
        const byModel = new Map()
        for (const o of officialRows) {
          const arr = byModel.get(o.model) || (byModel.set(o.model, []) && byModel.get(o.model))
          arr.push(o)
        }
        const used = new Set()
        for (const r of out) {
          if (r.time <= 0) continue
          delete r.costOfficial // 重置上次回填结果,避免复用数组时残留
          const cands = byModel.get(r.model)
          if (!cands) continue
          let best = null
          for (const o of cands) {
            if (used.has(o.id)) continue
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
      }
      out.matchedOfficial = matched
      return out
    }




    // 读取当前 opencode-go 凭据 key(纯 JS,单 key)。优先 auth.json 的 opencode-go.key。
    function findPrimaryGoKey() {
      try {
        if (typeof _ocgoReadFileSync === 'function' && typeof _ocgoExistsSync === 'function'
          && typeof _ocgoJoin === 'function' && typeof _ocgoHomedir === 'function') {
          const ap = _ocgoJoin(_ocgoHomedir(), '.local', 'share', 'opencode', 'auth.json')
          if (_ocgoExistsSync(ap)) {
            const auth = JSON.parse(String(_ocgoReadFileSync(ap, 'utf8') || '{}'))
            const k = auth && auth['opencode-go'] && auth['opencode-go'].key
            if (k) return String(k).trim()
          }
        }
      } catch (e) { /* ignore */ }
      return null
    }

    // 官方配额 —— 纯 JS 单 key 实现:读 opencode-go key → fetch /zen/go/v1/usage。
    async function collectQuota() {
      const key = findPrimaryGoKey()
      if (!key) return { error: 'no opencode-go key' }
      // 冷启动时配额接口可能首次响应慢(>15s),超时会导致"配额查询失败:aborted"。
      // 放宽到 30s 并重试一次,第二次通常已建立连接、秒回。
      const timeoutMs = 30000
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch('https://opencode.ai/zen/go/v1/usage', {
            headers: { 'Authorization': 'Bearer ' + key, 'User-Agent': 'dsh-ocgo-usage' },
            signal: (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(timeoutMs) : undefined,
          })
          if (!res.ok) return { error: 'http ' + res.status }
          const data = await res.json()
          const u = (data && data.usage) || {}
          const windows = {}
          for (const k of ['rolling', 'weekly', 'monthly']) {
            const v = u[k]
            if (v && typeof v === 'object') windows[k] = { percent: v.percent, status: v.status, resetsAt: v.resetsAt }
          }
          if (!Object.keys(windows).length) return { error: 'empty usage payload' }
          return { ok: true, keys: [{ name: 'default', active: true, error: null, windows }] }
        } catch (e) {
          if (attempt === 0) continue
          return { error: String((e && e.message) || e) }
        }
      }
      return { error: 'quota query failed' }
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
    // 磁盘缓存(bundle 形态,注入 fs):DSH 重启后首屏直接读盘,避免每次启动
    // 都全量分页(首次全量 10-50s);过期数据先展示,后台增量刷新只抓新增页。
    function officialDiskPath() {
      if (typeof _ocgoJoin !== 'function' || typeof _ocgoHomedir !== 'function') return null
      return _ocgoJoin(_ocgoHomedir(), '.config', 'dsh-opencode-go-usage-official.json')
    }
    function toOfficialData(parsed) {
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
      return { ok: true, vd: buildView(rows), rows, truncated: !!parsed.truncated, records: rows.length, autoExtracted: !!parsed.autoExtracted, browser: parsed.browser || null }
    }
    function readOfficialDisk() {
      const p = officialDiskPath()
      if (!p || typeof _ocgoReadFileSync !== 'function' || typeof _ocgoExistsSync !== 'function') return null
      try {
        if (!_ocgoExistsSync(p)) return null
        const d = JSON.parse(_ocgoReadFileSync(p, 'utf8'))
        if (d && d.at && Array.isArray(d.records)) return d
      } catch (e) {}
      return null
    }
    let officialCache = null
    let officialInflight = null
    // 失败冷却时间戳:官方抓取失败后 60s 内不重复全量抓取——
    // 否则客户端 15s fast-poll 期间每次 fetchAll 都会再触发一次全量
    // (每页 2 次请求 × 20s 超时,网络故障时会反复轰炸官网)。
    let officialErrAt = 0


    // 磁盘记录的 ts 是 "MM/dd/yyyy HH:mm:ss"(美国格式):字符串 max 跨月/跨年
    // 会选错(如 "09/…" > "12/…"),导致 LAST 不是真正最新、增量停早丢新记录。
    // 按 Date.parse 取真正的时间最大值,并返回原始字符串(格式原样传给增量脚本)。
    function diskLastTs(records) {
      let best = { ms: 0, raw: '' }
      for (const r of records) {
        if (!r || typeof r.ts !== 'string') continue
        const ms = Date.parse(r.ts)
        if (!isFinite(ms)) continue
        if (ms > best.ms) best = { ms, raw: r.ts }
      }
      return best.raw
    }

    // 官方明细抓取 —— 纯 JS 实现(替代 python OFFICIAL_SCRIPT):
    // 读配置拿 cookie/workspaceId → fetch _server 分页抓 usage.list → 正则解析 →
    // 增量合并去重 → JS 落盘。不依赖 python。
    const OCGO_FID = 'bfd684bfc2e4eed05cd0b518f5e4eafd3f3376e3938abb9e536e7c03df831e5c'
    const OCGO_PAGE_SIZE = 50
    const OCGO_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/143.0.0.0 Safari/537.36'
    const OCGO_ABS_MAXP = 5000

    function ocgoParseTs(ts) {
      const s = String(ts || '').trim().replace(/Z$/, '').split('.')[0]
      const d = new Date(s)
      if (!Number.isNaN(d.getTime())) return d.getTime()
      const m = String(ts || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/)
      if (m) return new Date(+m[3], +m[1] - 1, +m[2], +m[4], +m[5], +m[6]).getTime()
      return NaN
    }

    // 从 _server 返回文本解析 {id:"usg_..."} 记录(与旧 python 正则一致)
    function ocgoParseText(text) {
      const page = []
      const re = /\{id:"usg_[^}]*?\}/g
      let b
      while ((b = re.exec(text)) !== null) {
        const block = b[0]
        const tsM = block.match(/new Date\("([^"]+)"\)/)
        const modelM = block.match(/model:"([^"]+)"/)
        const costM = block.match(/cost:(\d+)/)
        if (!(tsM && modelM && costM)) continue
        const num = (p) => { const mm = block.match(p); return mm ? (parseInt(mm[1], 10) || 0) : 0 }
        page.push({
          ts: tsM[1], model: modelM[1],
          ti: num(/inputTokens:(\d+)/), to: num(/outputTokens:(\d+)/),
          rt: num(/reasoningTokens:(\d+)/), cr: num(/cacheReadTokens:(\d+)/),
          cost: parseInt(costM[1], 10) || 0,
        })
      }
      return page
    }

    async function ocgoFetchPage(wid, ck, page) {
      const args = encodeURIComponent(JSON.stringify([wid, page]))
      const url = 'https://opencode.ai/_server?id=' + OCGO_FID + '&args=' + args
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(url, {
            headers: {
              'Cookie': 'auth=' + ck,
              'X-Server-Id': OCGO_FID,
              'X-Server-Instance': 'server-fn:ocgo-' + page,
              'Origin': 'https://opencode.ai',
              'Referer': 'https://opencode.ai/workspace/' + wid + '/usage',
              'User-Agent': OCGO_UA,
            },
            signal: (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(20000) : undefined,
          })
          if (!res.ok) throw new Error('http ' + res.status)
          return await res.text()
        } catch (e) {
          if (attempt === 1) return null
          await new Promise((r) => setTimeout(r, 800))
        }
      }
      return null
    }

    // envs: 空 = 全量; [['OCGO_LAST_TS', lastTs]] = 增量(只抓新记录)
    async function runOfficial(envs) {
      const out = { ok: false, error: null, records: [], truncated: false, skippedPages: 0, autoExtracted: false, browser: null }
      const cfgPath = (typeof _ocgoJoin === 'function' && typeof _ocgoHomedir === 'function')
        ? _ocgoJoin(_ocgoHomedir(), '.config', 'dsh-opencode-go-usage.json') : ''
      const diskPath = (typeof _ocgoJoin === 'function' && typeof _ocgoHomedir === 'function')
        ? _ocgoJoin(_ocgoHomedir(), '.config', 'dsh-opencode-go-usage-official.json') : ''
      const canFs = typeof _ocgoReadFileSync === 'function' && typeof _ocgoExistsSync === 'function' && typeof _ocgoWriteFileSync === 'function' && typeof _ocgoMkdirSync === 'function'

      let CK = '', WID = '', maxPages = OCGO_ABS_MAXP
      if (canFs && cfgPath) {
        try {
          if (_ocgoExistsSync(cfgPath)) {
            const cfg = JSON.parse(String(_ocgoReadFileSync(cfgPath, 'utf8') || '{}'))
            CK = cfg.authCookie || ''; WID = cfg.workspaceId || ''
            if (typeof cfg.maxPages === 'number') maxPages = Math.min(cfg.maxPages, OCGO_ABS_MAXP)
          }
        } catch (e) { ocgoLog('runOfficial read cfg: ' + String((e && e.message) || e)) }
      }

      const isIncremental = !!((envs || []).find((e) => e && e[0] === 'OCGO_LAST_TS'))
      const LAST = isIncremental ? (((envs || []).find((e) => e && e[0] === 'OCGO_LAST_TS') || [])[1] || '') : ''

      // 非增量 + 磁盘缓存 15 分钟内命中 → 直接返回
      if (!isIncremental && canFs && diskPath && _ocgoExistsSync(diskPath)) {
        try {
          const d = JSON.parse(String(_ocgoReadFileSync(diskPath, 'utf8') || '{}'))
          if (d && d.at && Array.isArray(d.records) && Date.now() - d.at < 15 * 60 * 1000) {
            out.records = d.records; out.ok = true; out.diskCached = true; out.diskAt = d.at
            out.truncated = !!d.truncated
            return out
          }
        } catch (e) { /* 缓存读失败走全量 */ }
      }

      if (!CK || !WID) { out.error = 'NEED_CONFIG'; out.autoExtracted = false; return out }

      // 分页抓取(12 并发,连续 5 空页结束)
      let page = 0, skipped = 0, empty = 0, done = false
      try {
        while (page < maxPages && !done) {
          const end = Math.min(page + 12, maxPages)
          const batch = []
          for (let p = page; p < end; p++) batch.push(p)
          const results = await Promise.all(batch.map((p) => ocgoFetchPage(WID, CK, p).catch(() => null)))
          for (let i = 0; i < batch.length; i++) {
            const pg = batch[i]
            const text = results[i]
            if (text === null) {
              empty++; skipped++
              if (empty >= 5) { page = maxPages; done = true; break }
              continue
            }
            let pgs = ocgoParseText(text)
            if (!pgs.length) {
              const retry = await ocgoFetchPage(WID, CK, pg)
              pgs = retry ? ocgoParseText(retry) : []
            }
            if (!pgs.length) {
              empty++
              if (empty >= 5) { page = maxPages; done = true; break }
              continue
            }
            empty = 0
            if (LAST) {
              const l = ocgoParseTs(LAST), p0 = ocgoParseTs(pgs[0].ts)
              if (!Number.isNaN(l) && !Number.isNaN(p0)) {
                out.records.push(...pgs.filter((r) => ocgoParseTs(r.ts) > l))
                if (pgs.length < OCGO_PAGE_SIZE || ocgoParseTs(pgs[pgs.length - 1].ts) <= l) { page = maxPages; done = true; break }
              } else {
                out.records.push(...pgs.filter((r) => r.ts > LAST))
                if (pgs.length < OCGO_PAGE_SIZE || pgs[pgs.length - 1].ts <= LAST) { page = maxPages; done = true; break }
              }
            } else {
              out.records.push(...pgs)
              if (pgs.length < OCGO_PAGE_SIZE) { page = maxPages; done = true; break }
            }
            page = pg + 1
          }
          await new Promise((r) => setTimeout(r, 150))
        }
        // 增量:与磁盘旧缓存合并去重
        if (LAST && canFs && diskPath && _ocgoExistsSync(diskPath)) {
          try {
            const old = JSON.parse(String(_ocgoReadFileSync(diskPath, 'utf8') || '{}'))
            if (old && Array.isArray(old.records)) {
              const seen = new Set(), combined = []
              for (const r of out.records.concat(old.records)) {
                const k = [r.ts, r.model, r.cost, r.ti || 0, r.to || 0, r.rt || 0, r.cr || 0].join('|')
                if (seen.has(k)) continue
                seen.add(k); combined.push(r)
              }
              out.records = combined
            }
          } catch (e) { /* 合并失败用增量结果 */ }
        }
        // JS 落盘
        if (canFs && diskPath) {
          try {
            _ocgoMkdirSync(_ocgoJoin(_ocgoHomedir(), '.config'), { recursive: true })
            _ocgoWriteFileSync(diskPath, JSON.stringify({ at: Date.now(), records: out.records, truncated: out.records.length >= maxPages * OCGO_PAGE_SIZE }), 'utf8')
          } catch (e) { ocgoLog('runOfficial write disk: ' + String((e && e.message) || e)) }
        }
        out.ok = true
        out.truncated = out.records.length >= maxPages * OCGO_PAGE_SIZE
        out.skippedPages = skipped
      } catch (e) {
        out.error = String((e && e.message) || e).slice(0, 200)
      }
      return out
    }

    // 最近一次 DSH 会话扫描结果(复用:官方拉取/增量完成后仅做内存回填,不重扫)
    let lastScan = null

    // 诊断日志(追加 + 只保留最近 200 行;bundle 形态注入 fs;失败静默)
    function ocgoLog(msg) {
      try {
        if (typeof _ocgoWriteFileSync !== 'function' || typeof _ocgoJoin !== 'function' || typeof _ocgoHomedir !== 'function') return
        const dir = _ocgoJoin(_ocgoHomedir(), '.config')
        const p = _ocgoJoin(dir, 'dsh-opencode-go-usage.log')
        if (typeof _ocgoMkdirSync === 'function') _ocgoMkdirSync(dir, { recursive: true })
        let tail = ''
        if (typeof _ocgoReadFileSync === 'function' && typeof _ocgoExistsSync === 'function') {
          try { if (_ocgoExistsSync(p)) tail = String(_ocgoReadFileSync(p, 'utf8') || '').split('\n').slice(-200).join('\n') } catch (e) { tail = '' }
        }
        _ocgoWriteFileSync(p, tail + new Date().toISOString() + ' ' + msg + '\n', 'utf8')
      } catch (e) { /* 日志失败静默 */ }
    }

    // 把一份官方数据同步进内存缓存 + 已缓存响应 + DSH 金额回填(复用 lastScan,纯内存)
    function syncOfficialToCache(data) {
      officialCache = { at: Date.now(), data }
      if (cache && cache.data) {
        cache.data.official = data
        if (data.ok && data.rows && lastScan && lastScan.rows) {
          const rows = backfillDsh(lastScan.rows, data.rows)
          const dv = buildView(rows)
          dv.matchedOfficial = rows.matchedOfficial || 0
          cache.data.dsh = dv
        }
      }
    }

    // opts.force:完全绕过成功缓存与失败冷却(截断缓存重建用,调用方自带节流)
    // opts.skipOkCache:绕过 15min 成功缓存,保留 60s 失败冷却(磁盘缺失回退用,
    //   否则会直接命中"刚同步成功"的内存缓存而什么都不做)
    async function collectOfficial(opts) {
      const force = !!(opts && opts.force)
      const skipOkCache = !!(opts && opts.skipOkCache)
      if (!force) {
        if (officialCache && officialCache.data.ok && !skipOkCache && Date.now() - officialCache.at < 15 * 60 * 1000) return officialCache.data
        if (!officialCache || !officialCache.data.ok) {
          if (Date.now() - officialErrAt < 60 * 1000) return officialCache ? officialCache.data : { ok: false, loading: true }
        }
      }
      if (officialInflight) return officialInflight
      officialInflight = (async () => {
        try {
          // 全量抓取(12 并发,约 10-15s):首次必须返回完整历史(从开通日起),
          // 不能只给近期数据让用户误以为"从导入当天开始"。
          const p = await runOfficial([])
          if (!p || !p.ok) {
            ocgoLog('collectOfficial not ok: ' + ((p && p.error) || 'no data'))
            officialErrAt = Date.now()
            // 无配置/无凭据 → 直接提示用户在面板粘贴一次凭据(已去除 CDP 自动提取,
            // 浏览器调试端口在 Windows 常因残留进程被 merge 忽略,自动提取不可靠)。
            const code = (p && p.error) || 'unknown'
            officialCache = { at: Date.now(), data: { ok: false, error: code === 'NEED_CONFIG' ? 'NEED_CONFIG' : code } }
            return officialCache.data
          }
          if (p.skippedPages) ocgoLog('collectOfficial skipped pages: ' + p.skippedPages)
          const data = toOfficialData(p)
          syncOfficialToCache(data)
          return data
        } catch (e) {
          ocgoLog('collectOfficial failed: ' + String((e && e.message) || e))
          officialErrAt = Date.now()
          officialCache = { at: Date.now(), data: { ok: false, error: String((e && e.message) || e) } }
          return officialCache.data
        } finally {
          officialInflight = null
        }
      })()
      try {
        return await officialInflight
      } finally {
        officialInflight = null
      }
    }

    // 已去除 CDP 自动提取:浏览器调试端口在 Windows 常因残留进程被 merge 忽略,
    // 自动提取不可靠。官方明细改为"面板手动粘贴一次凭据"后自动读取。

    // 增量刷新:磁盘缓存过期时只抓新增页(日常仅 1-3 页,秒级完成);
    // python 端读旧盘合并去重后写回,host 同步更新内存缓存。
    let incrementalInflight = null
    // 增量修复路径的节流:截断缓存强制全量重建 12h 一次;磁盘缓存缺失回退
    // 全量 15min 一次——避免每轮 60s 轮询都重抓(数据真的超过上限时也不轰炸)。
    let officialForceAt = 0
    let officialMissingAt = 0
    function triggerIncremental() {
      if (incrementalInflight) return incrementalInflight
      const disk = readOfficialDisk()
      if (!disk || !disk.records.length) {
        // 磁盘缓存缺失(被删/落盘失败):增量没有合并基准。若静默跳过,内存
        // 数据将永远陈旧(历史 bug:增量永不触发,金额卡住)直到 DSH 重启。
        // 退化为全量重抓(15min 节流,失败冷却仍生效,不会反复轰炸官网)。
        if (Date.now() - officialMissingAt < 15 * 60 * 1000) return Promise.resolve()
        officialMissingAt = Date.now()
        ocgoLog('incremental skipped: disk cache missing, fallback to full fetch')
        return collectOfficial({ skipOkCache: true }).catch(() => {})
      }
      // 截断检测:新版缓存带 truncated 字段;旧版(≤1.6.10,150 页上限)缓存
      // 没有该字段,但 ≥7500 条即为当年被截断的遗留数据。增量只追最新页,
      // 永远补不回被截断的旧记录 → 强制一次全量重建缓存(12h 节流)。
      const legacyTrunc = !Object.prototype.hasOwnProperty.call(disk, 'truncated') && disk.records.length >= 7500
      if ((disk.truncated || legacyTrunc) && Date.now() - officialForceAt >= 12 * 3600 * 1000) {
        officialForceAt = Date.now()
        ocgoLog('incremental: disk cache truncated (' + disk.records.length + ' records), forced full refetch')
        return collectOfficial({ force: true }).catch(() => {})
      }
      const lastTs = diskLastTs(disk.records)
      if (!lastTs) return Promise.resolve()
      incrementalInflight = (async () => {
        try {
          const p = await runOfficial([['OCGO_LAST_TS', lastTs]])
          if (!p || !p.ok) {
            ocgoLog('incremental not ok: ' + (p && p.error ? p.error : 'no data'))
            return
          }
          syncOfficialToCache(toOfficialData(p))
        } catch (e) {
          ocgoLog('incremental failed: ' + String((e && e.message) || e))
          // 增量失败静默:旧数据仍可用,下次轮询再试
        } finally {
          incrementalInflight = null
        }
      })()
      return incrementalInflight
    }

    // 保存官方凭据配置(bundle 形态用注入的 node:fs;动态沙箱无 fs → bundle-only)
    function saveOfficialConfig(payload) {
      try {
        if (typeof _ocgoWriteFileSync !== 'function') return { ok: false, error: 'bundle-only' }
        const cfgPath = _ocgoJoin(_ocgoHomedir(), '.config', 'dsh-opencode-go-usage.json')
        _ocgoMkdirSync(_ocgoJoin(_ocgoHomedir(), '.config'), { recursive: true })
        _ocgoWriteFileSync(cfgPath, JSON.stringify(payload, null, 1), 'utf8')
        officialCache = null // 清官方缓存,下次拉取使用新配置
        cache = null        // 清 45s 聚合缓存,否则保存后 reload 命中旧结果(闪烁报错)
        officialErrAt = 0   // 重置失败冷却,保存后立即重试抓取,不再白等 60s
        return { ok: true }
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e) }
      }
    }

    // 并发去重:同一时刻只跑一次全量聚合(面板打开/刷新/定时轮询可能同时触发)。
    let inflight = null

    // DSH 会话扫描后台化:扫描可能耗时数十秒(会话库几百 MB 压缩,流式并发
    // 下 6 个会话同时驻留),若放在 fetchAll 响应路径里,60s 轮询会被 inFlight
    // 连续跳过(实测一次请求 64s,面板看起来"不再 60 秒刷新")。改为:响应先用
    // lastScan 旧结果,扫描在后台完成后更新 lastScan 与内存缓存,客户端下一次
    // 轮询自然拿到新数据。并发去重:同一时刻只跑一次扫描。
    let scanInflight = null
    function refreshScanAsync() {
      if (scanInflight) return scanInflight
      scanInflight = collectDshScan()
        .then((rows) => {
          lastScan = { at: Date.now(), rows }
          // 扫描完成时官方缓存可能已被增量更新:用最新官方行做回填
          const cur = (officialCache && officialCache.data.ok) ? officialCache.data : null
          if (cache && cache.data) {
            const dshRows = backfillDsh(rows, cur && cur.rows ? cur.rows : null)
            const dv = buildView(dshRows)
            dv.matchedOfficial = dshRows.matchedOfficial || 0
            cache.data.dsh = dv
            cache.data.dshLoading = false
          }
        })
        .catch((e) => {
          ocgoLog('dsh scan failed: ' + String((e && e.message) || e))
          // 扫描失败:保留旧 lastScan(无则保持 dshLoading),下次轮询再试
        })
        .finally(() => { scanInflight = null })
      return scanInflight
    }

    async function fetchAll() {
      // 若 officialCache 已定论(NEED_CONFIG 需手动粘贴 / 抓取成功),不要复用
      // 45s 缓存里可能存的"旧 loading 占位"——否则前端会一直转"加载中"直到
      // 缓存过期。定论后应重建响应,让前端尽快显示表单或数据。
      const officialSettled = !!(officialCache && officialCache.data
        && (officialCache.data.ok || officialCache.data.error === 'NEED_CONFIG'))
      if (cache && !officialSettled && Date.now() - cache.at < 45000) return cache.data
      if (inflight) return inflight
      inflight = (async () => {
        const quotaP = collectQuota().catch(() => ({ error: 'quota 异常' }))
        // quota 不阻塞首响应:最多等 3s,超时先用占位(quota:null),框架先渲染出来,
        // 配额环形图后续由 60s 轮询补上。避免冷启动时 quota fetch 慢导致面板卡在 FAB 无法展开。
        // 数据实时性:内存缓存(本次会话已抓到的真实数据)直接展示,每次刷新
        // 增量抓最新页(1-3s);磁盘缓存**不再秒开旧数据**(用户要求:官方视图
        // 真实数据到位前显示"加载中",不拿可能过期的缓存顶)——磁盘缓存只作
        // 增量基准(lastTs)与截断检测。失败缓存(ok:false)不算数据:
        // collectOfficial 内部按 60s 冷却去重,避免 fast-poll 期间反复全量
        // 重试;错误原样透传给面板展示。
        // 最快路径:直接读配置文件判断有无凭据。无凭据 → 本次响应直接返回
        // NEED_CONFIG,不起 python、不等后台抓取,前端第一次就显示粘贴表单,
        // 不再先"加载中"卡一会儿。
        let noCred = false
        if (typeof _ocgoReadFileSync === 'function' && typeof _ocgoExistsSync === 'function'
          && typeof _ocgoJoin === 'function' && typeof _ocgoHomedir === 'function' && !officialCache) {
          try {
            const cfgPath = _ocgoJoin(_ocgoHomedir(), '.config', 'dsh-opencode-go-usage.json')
            if (_ocgoExistsSync(cfgPath)) {
              const c = JSON.parse(String(_ocgoReadFileSync(cfgPath, 'utf8') || '{}'))
              noCred = !(c && c.authCookie && c.workspaceId)
            } else {
              noCred = true
            }
          } catch (e) { /* 读失败保守按有凭据处理,交给既有流程 */ }
        }
        let off = (officialCache && officialCache.data.ok) ? officialCache.data : null
        let officialErr = (officialCache && !officialCache.data.ok) ? officialCache.data : null
        if (noCred) {
          officialErr = { ok: false, error: 'NEED_CONFIG' }
        }
        if (!off) {
          // 无真实数据(内存缓存):优先增量(1-3s 拿到最新完整集,比全量快),
          // 增量以磁盘缓存为基准;无磁盘缓存才全量抓取(10-15s,后台完成
          // 后 syncOfficialToCache 自动更新,客户端 fast-poll 拿到数据)。
          const disk = readOfficialDisk()
          if (disk && disk.records.length) {
            triggerIncremental().catch(() => {})
          } else if (!noCred) {
            collectOfficial().catch(() => {})
          }
        } else if (off.ok) {
          // 实时增量同步(并发去重由 triggerIncremental 内部保证)
          triggerIncremental().catch(() => {})
        }
        // DSH 会话扫描:5 分钟内复用(lastScan),过期则在后台刷新——
        // 响应不等待扫描,避免 60s 轮询被长请求拖死。
        if (!(lastScan && Date.now() - lastScan.at < 5 * 60 * 1000)) {
          refreshScanAsync()
        }
        const dshRaw = lastScan ? lastScan.rows : []
        // quota 最多等 3s,超时用 null 占位(框架先出,数据后补)
        const quota = await Promise.race([
          quotaP,
          new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
        ])
        const dshRows = backfillDsh(dshRaw, off && off.ok && off.rows ? off.rows : null)
        const dsh = buildView(dshRows)
        dsh.matchedOfficial = dshRows.matchedOfficial || 0
        // 官方视图"最近会话":usage.list 没有会话标题,按时间回填的 DSH 会话
        // 补上标题并按会话聚合(金额为官方回填值),避免整列"(无标题)"。
        if (off && off.ok && off.vd && dshRows.length) {
          const bySession = new Map()
          for (const r of dshRows) {
            const s = bySession.get(r.id) || (bySession.set(r.id, { title: null, cost: 0, updated: r.time }), bySession.get(r.id))
            if (!s.title && r.title) s.title = r.title
            if (r.costOfficial != null) s.cost += r.costOfficial
            if (r.time > s.updated) s.updated = r.time
          }
          off.vd.recent = Array.from(bySession.values())
            .sort((a, b) => b.updated - a.updated)
            .slice(0, 8)
            .map((s) => ({ id: 's', title: s.title, cost_est: Math.round(s.cost * 10000) / 10000, updated: s.updated }))
        }
        const data = { ok: true, fetchedAt: Date.now(), quota: (quota && !quota.error) ? quota : null, quotaError: (quota && quota.error) || null, dsh, dshLoading: !(lastScan && lastScan.rows), official: off || officialErr || { ok: false, loading: true } }
        // 竞态兜底:后台抓取(增量/全量)可能早于本响应完成,其 sync 未命中
        // cache(当时 cache 还没赋值)——用最新 officialCache 覆盖 loading 占位,
        // 保证"数据到位后立即展示真实数据"而不是等到下一个轮询周期。
        // NEED_CONFIG(需要手动粘贴)也属"后台已定论"结果,必须覆盖 loading,
        // 否则前端的 45s cache 一直缓存 loading 占位,用户要干等缓存过期才见表单。
        if (officialCache && officialCache.data
          && (officialCache.data.ok || officialCache.data.error === 'NEED_CONFIG')) {
          data.official = officialCache.data
        }
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
}
