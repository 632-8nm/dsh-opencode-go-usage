export const name = "opencode-go-usage"
import { writeFileSync as _ocgoWriteFileSync, mkdirSync as _ocgoMkdirSync, readFileSync as _ocgoReadFileSync, existsSync as _ocgoExistsSync } from 'node:fs'
import { join as _ocgoJoin } from 'node:path'
import { homedir as _ocgoHomedir } from 'node:os'
export function apply(ctx, config) {
    const shell = ctx.get('shell')
    const sq = ctx.get('sessionQuery')
    if (shell === undefined || sq === undefined) return

    // 与 package.json version 同步(build-lib 回归门禁校验,防漂移)
    const VERSION = '1.6.27'

    // --- 更新检查(轻量):启动后异步读 raw GitHub 的 package.json 比对版本,
    // 有新版本时面板提示"git pull 后重启"。不自动改代码;网络失败/受限环境
    // 静默;6 小时节流(测试用 OCGO_DISABLE_UPDATE=1 关闭)。 ---
    let updateInfo = null
    let updateCheckedAt = 0
    function compareVersions(a, b) {
      const pa = String(a).split('.').map(Number)
      const pb = String(b).split('.').map(Number)
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const x = pa[i] || 0
        const y = pb[i] || 0
        if (x !== y) return x - y
      }
      return 0
    }
    function checkUpdate() {
      try {
        if (typeof fetch !== 'function') return
        if (typeof process !== 'undefined' && process.env && process.env.OCGO_DISABLE_UPDATE === '1') return
        if (Date.now() - updateCheckedAt < 6 * 3600e3) return
        updateCheckedAt = Date.now()
        const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null
        const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : null
        const done = () => { if (timer) clearTimeout(timer) }
        fetch('https://raw.githubusercontent.com/Xenia0922/dsh-opencode-go-usage/main/package.json', ctrl ? { signal: ctrl.signal } : {})
          .then((r) => (r.ok ? r.json() : null))
          .then((p) => {
            done()
            if (!p || typeof p.version !== 'string') return
            updateInfo = { current: VERSION, latest: p.version, ok: compareVersions(p.version, VERSION) > 0 }
          })
          .catch(() => { done() })
      } catch (e) { /* 更新检查失败静默 */ }
    }
    checkUpdate()

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

    // UTF-16LE → base64(powershell -EncodedCommand 用)。纯 JS,沙箱安全;
    // 避免命令行里引号/括号/空格被 cmd 或 shell 服务破坏(如 Program Files (x86))。
    const utf16leB64 = (s) => {
      let bin = ''
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i)
        bin += String.fromCharCode(c & 0xFF, (c >> 8) & 0xFF)
      }
      return btoa(bin)
    }

    // --- 官方账户级用量明细(usage.list server-fn) ---
    // 凭据优先读配置 ~/.config/dsh-opencode-go-usage.json;缺失/过期时自动从
    // Edge cookie 库提取(auth cookie → workspaces API 解析 workspaceId),Edge
    // 运行时数据库被锁则返回 EDGE_RUNNING,由面板引导手动粘贴或关闭 Edge。
    // 返回逐请求官方计费明细(cost 单位 1e-8 美元),账户级、跨设备,与官网账单一致。
    const OFFICIAL_SCRIPT = [
      'import json, os, re, time, urllib.request, urllib.parse, base64',
      'HOME = os.environ.get("USERPROFILE") or os.environ.get("HOME") or r"C:\\Users\\Xenia"',
      'CFG = os.path.join(HOME, ".config", "dsh-opencode-go-usage.json")',
      'FID = "bfd684bfc2e4eed05cd0b518f5e4eafd3f3376e3938abb9e536e7c03df831e5c"',
      'WSFID = "def39973159c7f0483d8793a822b8dbb10d067e12c65455fcb4608459ba0234f"',
      'PAGE_SIZE = 50',
      'UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/143.0.0.0 Safari/537.36"',
      'out = {"ok": False, "error": None, "records": [], "truncated": False, "skippedPages": 0, "autoExtracted": False, "browser": None}',
      'DISK = os.path.join(HOME, ".config", "dsh-opencode-go-usage-official.json")',
      'def load_disk_cache():',
      '    # 官方抓取结果磁盘缓存(加速 DSH 重启后的首屏加载)',
      '    try:',
      '        with open(DISK, encoding="utf-8") as f: d = json.load(f)',
      '        if isinstance(d, dict) and d.get("at") and isinstance(d.get("records"), list): return d',
      '    except Exception:',
      '        pass',
      '    return None',
      'def save_disk_cache(records):',
      '    try:',
      '        os.makedirs(os.path.dirname(DISK), exist_ok=True)',
      '        with open(DISK, "w", encoding="utf-8") as f:',
      '            json.dump({"at": int(time.time() * 1000), "records": records, "truncated": out.get("truncated", False)}, f, ensure_ascii=False)',
      '    except Exception:',
      '        pass',
      'def ws_connect(host, port, path):',
      '    # 最小 WebSocket 客户端(标准库 socket,零依赖):握手返回 socket',
      '    import socket as _sk, base64 as _b64',
      '    try:',
      '        s = _sk.create_connection((host, port), timeout=5)',
      '        s.settimeout(8)',
      '    except Exception:',
      '        return None',
      '    try:',
      '        key = _b64.b64encode(os.urandom(16)).decode()',
      '        req = ("GET %s HTTP/1.1\\r\\nHost: %s:%d\\r\\nUpgrade: websocket\\r\\nConnection: Upgrade\\r\\nSec-WebSocket-Key: %s\\r\\nSec-WebSocket-Version: 13\\r\\n\\r\\n") % (path, host, port, key)',
      '        s.sendall(req.encode())',
      '        resp = b""',
      '        while b"\\r\\n\\r\\n" not in resp:',
      '            chunk = s.recv(4096)',
      '            if not chunk: return None',
      '            resp += chunk',
      '        return s',
      '    except Exception:',
      '        try: s.close()',
      '        except Exception: pass',
      '        return None',
      'def ws_call(s, payload):',
      '    # 复用连接发一条文本帧,读回 id==1 的响应',
      '    import struct as _st',
      '    try:',
      '        data = payload.encode()',
      '        mask = os.urandom(4)',
      '        hdr = bytearray([0x81])',
      '        ln = len(data)',
      '        if ln < 126: hdr.append(0x80 | ln)',
      '        elif ln < 65536:',
      '            hdr.append(0x80 | 126)',
      '            hdr += _st.pack(">H", ln)',
      '        else:',
      '            hdr.append(0x80 | 127)',
      '            hdr += _st.pack(">Q", ln)',
      '        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(data))',
      '        s.sendall(bytes(hdr) + mask + masked)',
      '        for _ in range(80):',
      '            h = s.recv(2)',
      '            if len(h) < 2: return None',
      '            op = h[0] & 0x0F',
      '            l = h[1] & 0x7F',
      '            if l == 126: l = _st.unpack(">H", s.recv(2))[0]',
      '            elif l == 127: l = _st.unpack(">Q", s.recv(8))[0]',
      '            d = b""',
      '            while len(d) < l:',
      '                c = s.recv(l - len(d))',
      '                if not c: return None',
      '                d += c',
      '            if op == 8: return None',
      '            if op == 1:',
      '                try:',
      '                    msg = json.loads(d.decode())',
      '                    if msg.get("id") == 1: return msg',
      '                except Exception:',
      '                    continue',
      '        return None',
      '    except Exception:',
      '        return None',
      'def cdp_fetch_cookie(port):',
      '    # 通过浏览器调试端口(CDP)读取 cookie:浏览器自身解密,支持 v20',
      '    try:',
      '        import urllib.request as _ur',
      '        targets = json.loads(_ur.urlopen("http://127.0.0.1:%d/json" % port, timeout=3).read().decode())',
      '    except Exception:',
      '        return None',
      '    page = None',
      '    for t in targets:',
      '        if t.get("type") == "page": page = t; break',
      '    if not page: return None',
      '    url = page.get("webSocketDebuggerUrl") or ""',
      '    m = re.match(r"ws://([^:/]+):(\\d+)(/.+)", url)',
      '    if not m: return None',
      '    s = ws_connect(m.group(1), int(m.group(2)), m.group(3))',
      '    if s is None: return None',
      '    try:',
      '        if ws_call(s, json.dumps({"id": 1, "method": "Network.enable"})) is None: return None',
      '        r2 = ws_call(s, json.dumps({"id": 1, "method": "Network.getAllCookies"}))',
      '        if not r2: return None',
      '        cookies = (r2.get("result") or {}).get("cookies") or []',
      '        for c in cookies:',
      '            if c.get("name") == "auth" and "opencode" in (c.get("domain") or ""):',
      '                v = c.get("value") or ""',
      '                if v.startswith("Fe26.2"): return v',
      '        return None',
      '    finally:',
      '        try: s.close()',
      '        except Exception: pass',
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
      '# 磁盘缓存命中(15 分钟内):直接返回,无需 cookie/网络——DSH 重启后首屏秒开',
      'if not os.environ.get("OCGO_LAST_TS"):',
      '    _d = load_disk_cache()',
      '    if _d and int(time.time() * 1000) - _d["at"] < 15 * 60 * 1000:',
      '        out["records"] = _d["records"]',
      '        out["ok"] = True',
      '        out["diskCached"] = True',
      '        out["diskAt"] = _d["at"]',
      '        out["truncated"] = bool(_d.get("truncated"))',
      '        print(json.dumps(out))',
      '        raise SystemExit',
      'if not CK or not WID:',
      '    try:',
      '        CK = None',
      '        src_browser = None',
      '        # 1) 调试端口 CDP(浏览器自身解密,v20 也可用)——唯一自动提取通道',
      '        for port in (9222, 9223, 9224, 9225, 9226, 9227, 9228, 9229, 9230):',
      '            try:',
      '                CK = cdp_fetch_cookie(port)',
      '            except Exception:',
      '                CK = None',
      '            if CK:',
      '                src_browser = "CDP:%d" % port',
      '                break',
      '        # 调试浏览器未启动/未登录 → 引导一键启动(面板按钮)',
      '        if not CK: raise RuntimeError("NO_BROWSER")',
      '        WID = fetch_workspace_id(CK)',
      '        if not WID: raise RuntimeError("WS_PARSE_FAIL")',
      '        try:',
      '            os.makedirs(os.path.dirname(CFG), exist_ok=True)',
      '            with open(CFG, "w", encoding="utf-8") as fh:',
      '                json.dump({"authCookie": CK, "workspaceId": WID}, fh, ensure_ascii=False)',
      '            out["autoExtracted"] = True',
      '            out["browser"] = src_browser',
      '        except Exception:',
      '            pass',
      '    except Exception as e:',
      '        code = str(e)',
      '        out["error"] = code if code in ("NO_BROWSER", "WS_PARSE_FAIL") else repr(e)[:200]',
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
      '    page = []',
      '    for b in re.findall(r\'\\{id:"usg_[^}]*?\\}\', text):',
      '        ts = re.search(r\'new Date\\("\' + r\'([^"]+)"\\)\', b)',
      '        model = re.search(r\'model:"([^"]+)"\', b)',
      '        cost = re.search(r\'cost:(\\d+)\', b)',
      '        if not (ts and model and cost): continue',
      '        def num(p):',
      '            m = re.search(p, b)',
      '            return int(m.group(1)) if m else 0',
      '        page.append({"ts": ts.group(1), "model": model.group(1),',
      '            "ti": num(r\'inputTokens:(\\d+)\'), "to": num(r\'outputTokens:(\\d+)\'),',
      '            "rt": num(r\'reasoningTokens:(\\d+)\'), "cr": num(r\'cacheReadTokens:(\\d+)\'),',
      '            "cost": int(cost.group(1))})',
      '    return page',
      'def _pts(ts):',
      '    # 时间戳 → epoch(相对比较用,本地时区一致即可)。字符串比较跨月/跨年',
      '    # 会误判大小(如 "12/01/2025" < "01/02/2026"),导致增量停早丢新记录。',
      '    # 兼容两种实际格式:ISO("2026-08-16T03:08:12.000Z")与美国格式',
      '    # ("MM/dd/yyyy HH:mm:ss");都失败返回 None(调用方退化为字符串比较)',
      '    try:',
      '        _s = ts.strip()',
      '        if _s.endswith("Z"): _s = _s[:-1]',
      '        if "." in _s: _s = _s.split(".", 1)[0]',
      '        return time.mktime(time.strptime(_s, "%Y-%m-%dT%H:%M:%S"))',
      '    except Exception:',
      '        pass',
      '    try:',
      '        return time.mktime(time.strptime(ts, "%m/%d/%Y %H:%M:%S"))',
      '    except Exception:',
      '        return None',
      'from concurrent.futures import ThreadPoolExecutor',
      'LAST = os.environ.get("OCGO_LAST_TS") or ""',
      'ABS_MAXP = 5000  # 绝对安全上限(25 万条),防无限循环',
      'try:',
      '    # 页数上限默认放宽到 5000:usage.list 数据超过 7500 条(150 页)时不再截断,',
      '    # 抓取在"不足 50 条的页"自然结束;用户可在配置 maxPages 覆盖',
      '    MAXP = int((cfg or {}).get("maxPages", 5000)) if cfg else 5000',
      '    MAXP = min(MAXP, ABS_MAXP)',
      '    page = 0',
      '    _skipped = 0  # 单页失败被跳过的页数(诊断用,不终止抓取)',
      '    with ThreadPoolExecutor(max_workers=12) as ex:',
      '        _empty = 0  # 连续失败/空页计数:只有连续 5 页才判定数据尽头',
      '        while page < MAXP:',
      '            batch = list(range(page, min(page + 12, MAXP)))',
      '            results = list(ex.map(fetch_text, batch))',
      '            for pg, text in zip(batch, results):',
      '                if text is None:',
      '                    # 单页两次请求均失败(超时/网络抖动):跳过该页继续。',
      '                    # 绝不能因一页失败终止整次抓取——否则数据"抓不全"',
      '                    # (7498/9070/11270 条数差异的根因)',
      '                    _empty += 1',
      '                    _skipped += 1',
      '                    if _empty >= 5:',
      '                        page = MAXP',
      '                        break',
      '                    continue',
      '                pgs = parse_text(text)',
      '                if not pgs:',
      '                    # 空页:可能是数据尽头,也可能是单页解析失败——重试一次再定',
      '                    _retry = fetch_text(pg)',
      '                    pgs = parse_text(_retry) if _retry else []',
      '                if not pgs:',
      '                    _empty += 1',
      '                    if _empty >= 5:',
      '                        page = MAXP',
      '                        break',
      '                    continue',
      '                _empty = 0',
      '                if LAST:',
      '                    # 增量:只保留比上次新的记录;本页时间已不新于上次即停止。',
      '                    # 时间戳按 epoch 比较(跨月/跨年正确);任一侧解析失败则',
      '                    # 退化为字符串比较(仅同月内可靠,兜底不中断)',
      '                    _l = _pts(LAST)',
      '                    _p0 = _pts(pgs[0]["ts"]) if pgs else None',
      '                    if _l is not None and _p0 is not None:',
      '                        out["records"].extend(r for r in pgs if _pts(r["ts"]) > _l)',
      '                        if len(pgs) < PAGE_SIZE or _pts(pgs[-1]["ts"]) <= _l:',
      '                            page = MAXP',
      '                            break',
      '                    else:',
      '                        out["records"].extend(r for r in pgs if r["ts"] > LAST)',
      '                        if len(pgs) < PAGE_SIZE or pgs[-1]["ts"] <= LAST:',
      '                            page = MAXP',
      '                            break',
      '                else:',
      '                    out["records"].extend(pgs)',
      '                    if len(pgs) < PAGE_SIZE:',
      '                        page = MAXP',
      '                        break',
      '                page = pg + 1',
      '            time.sleep(0.15)',
      '    if LAST:',
      '        # 增量模式:与磁盘旧缓存合并去重(新记录在前),结果仍为完整集',
      '        _old = load_disk_cache()',
      '        if _old and _old["records"]:',
      '            _seen = set()',
      '            _combined = []',
      '            for r in out["records"] + _old["records"]:',
      '                _k = (r["ts"], r["model"], r["cost"], r.get("ti", 0), r.get("to", 0), r.get("rt", 0), r.get("cr", 0))',
      '                if _k in _seen: continue',
      '                _seen.add(_k)',
      '                _combined.append(r)',
      '            out["records"] = _combined',
      '    save_disk_cache(out["records"])',
      '    out["ok"] = True',
      '    out["truncated"] = len(out["records"]) >= MAXP * PAGE_SIZE',
      '    out["skippedPages"] = _skipped',
      'except Exception as e:',
      '    out["error"] = repr(e)[:200]',
      'print(json.dumps(out))',
    ].join('\n')
    const OFFICIAL_PAYLOAD = utf8B64(OFFICIAL_SCRIPT)

    // --- 数据源 4:官方配额(多 key:key 池逐 key 抓取;单 key 双通道容错) ---
    // OCGO_KEYS_JSON(可选)= base64(JSON [{"name","key","active"}]);缺省回退
    // auth.json 单 key(兼容动态沙箱/无 yaml 环境)。输出 {ok, keys:[{name,
    // active, error, windows:{rolling,weekly,monthly}}]}。
    const QUOTA_PY = [
      'import json, os, urllib.request, base64',
      'HOME = os.environ.get("USERPROFILE") or os.environ.get("HOME") or r"C:\\Users\\Xenia"',
      'AUTH = os.path.join(HOME, ".local", "share", "opencode", "auth.json")',
      'out = {"ok": True, "keys": [], "error": None}',
      'keys = []',
      'RAW = os.environ.get("OCGO_KEYS_JSON") or ""',
      'try:',
      '    if RAW:',
      '        keys = json.loads(base64.b64decode(RAW).decode("utf-8"))',
      '    else:',
      '        with open(AUTH, "r", encoding="utf-8") as f:',
      '            k = json.load(f).get("opencode-go", {}).get("key")',
      '        if k: keys = [{"name": "default", "key": k, "active": True}]',
      'except Exception:',
      '    keys = []',
      'if not keys:',
      '    out["error"] = "no keys"',
      'else:',
      '    for it in keys:',
      '        entry = {"name": it.get("name", "default"), "active": bool(it.get("active")), "error": None, "windows": None}',
      '        try:',
      '            req = urllib.request.Request("https://opencode.ai/zen/go/v1/usage", headers={"Authorization": "Bearer " + it["key"], "User-Agent": "dsh-ocgo-usage"})',
      '            with urllib.request.urlopen(req, timeout=15) as r:',
      '                data = json.loads(r.read().decode("utf-8"))',
      '            u = data.get("usage") or {}',
      '            windows = {}',
      '            for k in ("rolling", "weekly", "monthly"):',
      '                v = u.get(k)',
      '                if v and isinstance(v, dict):',
      '                    windows[k] = {"percent": v.get("percent"), "status": v.get("status"), "resetsAt": v.get("resetsAt")}',
      '            entry["windows"] = windows if windows else None',
      '            if not windows: entry["error"] = "empty usage payload"',
      '        except Exception as e:',
      '            entry["error"] = repr(e)[:200]',
      '        out["keys"].append(entry)',
      'print(json.dumps(out))',
    ].join('\n')
    const QUOTA_PY_PAYLOAD = utf8B64(QUOTA_PY)

    // 多 key 发现(bundle 形态):config.keyNames 显式指定 → $DSH_HOME/.credentials.yaml
    // 的 OPENCODE_GO_KEY_<name> 池(明文 yaml)→ 回退 OPENCODE_GO_API_KEY 单 key;
    // 最后统一追加 OpenCode CLI 凭据(auth.json)。动态沙箱/找不到时返回空。
    function discoverGoKeys() {
      const keys = []
      const home = (typeof process !== 'undefined' && process.env && process.env.DSH_HOME) || ''
      if (home && typeof _ocgoReadFileSync === 'function' && typeof _ocgoExistsSync === 'function' && typeof _ocgoJoin === 'function') {
        try {
          const p = _ocgoJoin(home, '.credentials.yaml')
          if (_ocgoExistsSync(p)) {
            const text = String(_ocgoReadFileSync(p, 'utf8') || '')
            const pool = []
            for (const m of text.matchAll(/^OPENCODE_GO_KEY_([A-Za-z0-9_]+)\s*:\s*(.+?)\s*$/gm)) {
              if (m[1] !== 'ACTIVE' && m[2]) pool.push({ name: m[1], key: m[2].trim() })
            }
            const actM = text.match(/^OPENCODE_GO_KEY_ACTIVE\s*:\s*(.+?)\s*$/m)
            const activeName = actM ? actM[1].trim() : ''
            const names = (config && config.keyNames) ? config.keyNames : null
            if (names && names.length) {
              const byName = new Map(pool.map((it) => [it.name, it]))
              for (const n of names) {
                const it = byName.get(n)
                if (it) keys.push({ name: it.name, key: it.key, active: it.name === activeName })
              }
            } else if (pool.length) {
              for (const it of pool) keys.push({ name: it.name, key: it.key, active: it.name === activeName })
            } else {
              const single = text.match(/^OPENCODE_GO_API_KEY\s*:\s*(.+?)\s*$/m)
              if (single && single[1]) keys.push({ name: 'default', key: single[1].trim(), active: true })
            }
          }
        } catch (e) { /* 发现失败走回退 */ }
      }
      // 追加 OpenCode CLI 凭据(auth.json 的 opencode-go.key):它是另一个真实
      // 的 Go key(yaml 来源之外),加入池后配额区立即显示多 key 标签——
      // 同一账号时数据一致,不同账号时可对比各 key 配额。仅 bundle 形态可用。
      if (typeof _ocgoReadFileSync === 'function' && typeof _ocgoExistsSync === 'function' && typeof _ocgoJoin === 'function' && typeof _ocgoHomedir === 'function') {
        try {
          const ap = _ocgoJoin(_ocgoHomedir(), '.local', 'share', 'opencode', 'auth.json')
          if (_ocgoExistsSync(ap)) {
            const auth = JSON.parse(String(_ocgoReadFileSync(ap, 'utf8') || '{}'))
            const k = auth && auth['opencode-go'] && auth['opencode-go'].key
            if (k && !keys.some((it) => it.key === k)) {
              keys.push({ name: 'cli', key: k, active: keys.length === 0 })
            }
          }
        } catch (e) { /* auth.json 读取失败忽略 */ }
      }
      return keys
    }

    async function collectQuota() {
      const stdoutText = (raw) => typeof raw === 'string' ? raw : (raw && raw.text != null ? String(raw.text) : '')
      const plat = (typeof process !== 'undefined' && process.platform) || ''
      // 新结构解析:{ok, keys:[{name,active,error,windows:{rolling,weekly,monthly}}]}
      const parsePy = (text) => {
        try {
          const data = JSON.parse(text)
          if (data && Array.isArray(data.keys)) return { keys: data.keys }
          if (data && data.error) return { error: data.error }
          return { error: 'unexpected payload' }
        } catch (e) {
          return { error: 'parse: ' + String(e && e.message || e) }
        }
      }
      // 旧结构(curl 通道的 usage 单 key)包装成 keys
      const parseCurl = (text) => {
        try {
          const data = JSON.parse(text)
          const u = data.usage || {}
          const windows = {}
          for (const k of ['rolling', 'weekly', 'monthly']) {
            const v = u[k]
            if (v && typeof v === 'object') windows[k] = { percent: v.percent, status: v.status, resetsAt: v.resetsAt }
          }
          if (!Object.keys(windows).length) return { error: 'empty usage payload' }
          return { keys: [{ name: 'default', active: true, error: null, windows }] }
        } catch (e) {
          return { error: 'parse: ' + String(e && e.message || e) }
        }
      }

      // 有明确来源(yaml 池 / yaml 单 key):python 通道逐 key 抓取。
      // key 列表 base64 传递,避免命令行转义;单个 key 失败不影响其他。
      const keys = discoverGoKeys()
      if (keys.length) {
        const payload = utf8B64(JSON.stringify(keys))
        const pyCmd = buildPythonCmd(QUOTA_PY_PAYLOAD, [['OCGO_KEYS_JSON', payload]])
        const c2 = await shell.run(shell.resolve({ command: pyCmd, timeoutMs: 30000 }))
        if (c2.exitCode === 0) {
          const r = parsePy(stdoutText(c2.stdout))
          if (r.keys) return r
          return { error: r.error }
        }
        return { error: 'py 失败: ' + String(typeof c2.stderr === 'string' ? c2.stderr : (c2.stderr && c2.stderr.text != null ? c2.stderr.text : '')).slice(0, 200) }
      }

      // 回退(动态沙箱 / 无 yaml):curl native TLS 优先,python urllib 兜底(auth.json)。
      // Windows 用 pwsh 读取,macOS/Linux 用 python3 一行读取 key。
      const curlCmd = (plat === 'darwin' || plat === 'linux')
        ? "PY=$(command -v python3 || command -v python || true); if [ -z \"$PY\" ]; then exit 1; fi; K=$(\"$PY\" -c 'import json,os;d=json.load(open(os.path.expanduser(\"~/.local/share/opencode/auth.json\")));print((d.get(\"opencode-go\") or {}).get(\"key\") or \"\")' 2>/dev/null); if [ -z \"$K\" ]; then exit 1; fi; curl -s -m 15 -H \"Authorization: Bearer $K\" https://opencode.ai/zen/go/v1/usage"
        : '$k=(Get-Content "$env:USERPROFILE\\.local\\share\\opencode\\auth.json" -Raw|ConvertFrom-Json).\'opencode-go\'.key; if(-not $k){Write-Error "no-key";exit 1}; curl.exe -s -m 15 -H "Authorization: Bearer $k" https://opencode.ai/zen/go/v1/usage'
      const c1 = await shell.run(shell.resolve({ command: curlCmd, timeoutMs: 20000 }))
      let c1err = null
      if (c1.exitCode === 0) {
        const r = parseCurl(stdoutText(c1.stdout))
        if (r.keys) return r
        c1err = r.error
      }
      // 通道 2:python urllib 兜底(QUOTA_PY 本身跨平台,HOME 兼容)
      const pyCmd = buildPythonCmd(QUOTA_PY_PAYLOAD, null)
      const c2 = await shell.run(shell.resolve({ command: pyCmd, timeoutMs: 20000 }))
      if (c2.exitCode === 0) {
        const r = parsePy(stdoutText(c2.stdout))
        if (r.keys) return r
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

    // 跨平台 python 调用命令(bundle 模式按 process.platform 分支;动态沙箱无
    // process → 走 Windows 写法,开发环境在 Windows)。envPairs: [['K','V'],...]
    // 注意:Windows 的 -c 前导必须 `import base64, os`——此前只有 base64,
    // 增量注入 os.environ['OCGO_LAST_TS'] 时直接 NameError,增量脚本从未成功
    // 执行过(诊断日志:NameError: name 'os' is not defined)。
    function buildPythonCmd(payload, envPairs) {
      const plat = (typeof process !== 'undefined' && process.platform) || ''
      if (plat === 'darwin' || plat === 'linux') {
        // POSIX:环境变量用 shell export 注入(不需要 os.environ,也不拼进 -c)
        const envPre = (envPairs || []).map((e) => "export " + e[0] + "='" + e[1] + "'; ").join('')
        return "PY=$(command -v python3 || command -v python || true); if [ -z \"$PY\" ]; then echo python-not-found >&2; exit 1; fi; " + envPre + "\"$PY\" -c \"import base64;exec(base64.b64decode('" + payload + "'))\""
      }
      const envPart = (envPairs || []).map((e) => ";os.environ['" + e[0] + "']='" + e[1] + "'").join('')
      return "$py='E:\\python\\python.exe';if(-not(Test-Path $py)){$c=Get-Command python -ErrorAction SilentlyContinue;if($c){$py=$c.Source}else{Write-Error 'python-not-found';exit 1}}; & $py -c \"import base64, os" + envPart + ";exec(base64.b64decode('" + payload + "'))\""
    }

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

    // 运行官方抓取 python(envs: [['KEY','VALUE'],...] 注入环境变量)
    async function runOfficial(envs) {
      const cmd = buildPythonCmd(OFFICIAL_PAYLOAD, envs)
      const spec = shell.resolve({ command: cmd, timeoutMs: 240000, stdoutMaxBytes: 64 * 1024 * 1024 })
      const result = await shell.run(spec)
      const stderrText = String(typeof result.stderr === 'string' ? result.stderr : (result.stderr && result.stderr.text != null ? result.stderr.text : '')).slice(0, 200)
      if (result.exitCode !== 0) throw new Error(stderrText || '子进程退出码 ' + result.exitCode)
      const raw = result.stdout
      const text = typeof raw === 'string' ? raw : (raw && raw.text != null ? String(raw.text) : '')
      return JSON.parse(text)
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
            officialCache = { at: Date.now(), data: { ok: false, error: (p && p.error) || 'unknown' } }
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
        officialCache = null // 清缓存,下次拉取使用新配置
        cache = null // 清 45s 聚合缓存:否则保存后 reload 仍命中旧缓存,白等一轮
        // 用户主动更新凭据 = 明确想立即重试:重置失败冷却,否则此前 NO_BROWSER
        // 等失败留下的 60s 冷却会让保存后白等一轮(实测保存→开始抓取隔 60s+)
        officialErrAt = 0
        return { ok: true }
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e) }
      }
    }

    // 并发去重:同一时刻只跑一次全量聚合(面板打开/刷新/定时轮询可能同时触发)。
    let inflight = null

    // 用 DSH 会话行重建官方视图"最近会话"(真实会话 id 作 React key + 标题回填)
    function rebuildOfficialRecent(offData, dshRows) {
      if (!offData || !offData.ok || !offData.vd || !dshRows || !dshRows.length) return
      const bySession = new Map()
      for (const r of dshRows) {
        const s = bySession.get(r.id) || (bySession.set(r.id, { id: r.id, title: null, cost: 0, updated: r.time }), bySession.get(r.id))
        if (!s.title && r.title) s.title = r.title
        if (r.costOfficial != null) s.cost += r.costOfficial
        if (r.time > s.updated) s.updated = r.time
      }
      offData.vd.recent = Array.from(bySession.values())
        .sort((a, b) => b.updated - a.updated)
        .slice(0, 8)
        .map((s) => ({ id: s.id, title: s.title, cost_est: Math.round(s.cost * 10000) / 10000, updated: s.updated }))
    }

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
            // 同步刷新官方 recent:首次打开时扫描未完成,recent 还是 usage.list
            // 自聚合(of-N,无标题)——扫描一完成立即补上真实会话标题,不必等
            // 下一个轮询周期
            if (cache.data.official) rebuildOfficialRecent(cache.data.official, dshRows)
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
      if (cache && Date.now() - cache.at < 45000) return cache.data
      if (inflight) return inflight
      inflight = (async () => {
        const quotaP = collectQuota().catch(() => ({ error: 'quota 异常' }))
        // 数据实时性:内存缓存(本次会话已抓到的真实数据)直接展示,每次刷新
        // 增量抓最新页(1-3s);磁盘缓存**不再秒开旧数据**(用户要求:官方视图
        // 真实数据到位前显示"加载中",不拿可能过期的缓存顶)——磁盘缓存只作
        // 增量基准(lastTs)与截断检测。失败缓存(ok:false)不算数据:
        // collectOfficial 内部按 60s 冷却去重,避免 fast-poll 期间反复全量
        // 重试;错误原样透传给面板展示。
        let off = (officialCache && officialCache.data.ok) ? officialCache.data : null
        let officialErr = (officialCache && !officialCache.data.ok) ? officialCache.data : null
        if (!off) {
          // 无真实数据(内存缓存):优先增量(1-3s 拿到最新完整集,比全量快),
          // 增量以磁盘缓存为基准;无磁盘缓存才全量抓取(10-15s,后台完成
          // 后 syncOfficialToCache 自动更新,客户端 fast-poll 拿到数据)。
          const disk = readOfficialDisk()
          if (disk && disk.records.length) {
            triggerIncremental().catch(() => {})
          } else {
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
        const quota = await quotaP
        const dshRows = backfillDsh(dshRaw, off && off.ok && off.rows ? off.rows : null)
        const dsh = buildView(dshRows)
        dsh.matchedOfficial = dshRows.matchedOfficial || 0
        const data = { ok: true, fetchedAt: Date.now(), quota: quota.error ? null : quota, quotaError: quota.error || null, dsh, dshLoading: !(lastScan && lastScan.rows), official: off || officialErr || { ok: false, loading: true }, update: (updateInfo && updateInfo.ok) ? { current: updateInfo.current, latest: updateInfo.latest } : null }
        // 竞态兜底:后台抓取(增量/全量)可能早于本响应完成,其 sync 未命中
        // cache(当时 cache 还没赋值)——用最新 officialCache 覆盖 loading 占位,
        // 保证"数据到位后立即展示真实数据"而不是等到下一个轮询周期。
        if (officialCache && officialCache.data.ok) data.official = officialCache.data
        // 官方视图"最近会话":usage.list 没有会话标题,按时间回填的 DSH 会话
        // 补上标题并按会话聚合(金额为官方回填值),避免整列"(无标题)"。
        // 必须对最终 data.official 操作:竞态覆盖可能刚换掉对象,只改 off 会被
        // 换掉导致 recent 空/旧。id 用真实会话 id——曾用常量 's' 使 React key
        // 全部相同,数据更新时列表渲染错乱:同一批会话"上下重复"(issue 632-8nm)。
        rebuildOfficialRecent(data.official, dshRows)
        cache = { at: Date.now(), data }
        return data
      })()
      try {
        return await inflight
      } finally {
        inflight = null
      }
    }

    // 一键启动调试浏览器(独立 profile + 调试端口 9222,不影响日常浏览器):
    // 用户登录一次后关闭窗口,插件即可通过 CDP 自动提取。不等待浏览器退出。
    // 跨平台:Windows 走 powershell + explorer 中转;macOS 走 open -na(launchd
    // 启动,进程独立于 DSH);Linux 走 nohup 后台。浏览器候选为 Chromium 系
    // (CDP 协议;Safari/Firefox 调试协议不兼容,无法走本方案)。
    async function launchDebugBrowser() {
      try {
        if (typeof shell === 'undefined' || !shell || typeof shell.resolve !== 'function') {
          return { ok: false, error: 'shell 不可用' }
        }
        const plat = (typeof process !== 'undefined' && process.platform) || ''
        let cmd = null
        if (plat === 'darwin') {
          // macOS:遍历常见 Chromium 系 .app(系统 + 用户目录),open -na 新实例传参
          const apps = ['Google Chrome', 'Microsoft Edge', 'Brave Browser', 'Vivaldi', 'Opera', 'Arc', 'Chromium']
          const chain = apps.map((a) =>
            'open -na "' + a + '" --args --remote-debugging-port=9222 --user-data-dir="$HOME/.ocgo-browser-debug" https://opencode.ai 2>/dev/null'
          ).join(' || ')
          cmd = chain + ' || { echo NO_BROWSER; exit 2; }; echo OK'
        } else if (plat === 'linux') {
          // Linux:nohup 后台脱离进程树;遍历常见 Chromium 系可执行文件
          cmd = 'for B in google-chrome-stable google-chrome chromium chromium-browser microsoft-edge brave-browser vivaldi opera; do P=$(command -v $B 2>/dev/null) && { nohup "$P" --remote-debugging-port=9222 --user-data-dir="$HOME/.ocgo-browser-debug" https://opencode.ai >/dev/null 2>&1 & echo OK; exit 0; }; done; echo NO_BROWSER; exit 2'
        }
        if (cmd) {
          const spec = shell.resolve({ command: cmd, timeoutMs: 30000 })
          const result = await shell.run(spec)
          const text = String(typeof result.stdout === 'string' ? result.stdout : (result.stdout && result.stdout.text != null ? result.stdout.text : ''))
          if (result.exitCode !== 0 || !/OK/.test(text)) return { ok: false, error: 'NO_BROWSER' }
          return { ok: true }
        }
        // Windows(及动态沙箱无 process 信息时):EncodedCommand + explorer 中转。
        // EncodedCommand 避免引号/括号被 shell 服务破坏;explorer 是用户桌面已有
        // 进程,派生的浏览器不属于 DSH 的进程树,不会被 shell 服务在命令结束后
        // 清理,窗口正常显示;且只用 core cmdlet,不受受限执行环境影响。
        // 浏览器候选:Edge/Chrome/Brave/Vivaldi/Opera/Arc/Chromium 常见安装路径。
        // 启动策略(2026-08-16 用户实测修复):
        //   1. 9222 已监听 → 直接成功(用户可能已手动启动过)
        //   2. explorer 中转 bat(历史方案;部分环境 explorer 不执行 .bat,
        //      窗口不出现但命令仍返回成功——必须验证端口,不能假报"已弹出")
        //   3. Start-Process 直接启动 Edge 兜底(不依赖 explorer;subprocess
        //      服务只在插件 teardown 时清理进程树,命令结束后 Edge 存活)
        //   4. 轮询验证 9222 监听(最多 ~20s),未监听返回 NO_LISTEN 明确报错。
        //      窗口不能太短:Edge 冷启动 + 加载 profile 实测 10-20s,6s 内未
        //      监听不代表失败(实测报 NO_LISTEN 后浏览器最终起来了)。
        const ps = [
          "$cands=@('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',(Join-Path $env:LOCALAPPDATA 'Microsoft\\Edge\\Application\\msedge.exe'),'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',(Join-Path $env:LOCALAPPDATA 'Google\\Chrome\\Application\\chrome.exe'),'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe','C:\\Program Files\\Vivaldi\\Application\\vivaldi.exe','C:\\Program Files\\Opera\\launcher.exe',(Join-Path $env:LOCALAPPDATA 'Arc\\Application\\arc.exe'),(Join-Path $env:LOCALAPPDATA 'Chromium\\Application\\chrome.exe'))",
          "$edge=$null; foreach($c in $cands){ if($c -and (Test-Path $c)){ $edge=$c; break } }",
          "if(-not $edge){ Write-Output 'NO_BROWSER'; exit 2 }",
          "if(Get-NetTCPConnection -LocalPort 9222 -State Listen -ErrorAction SilentlyContinue){ Write-Output 'OK'; exit 0 }",
          "$bat=Join-Path $env:TEMP 'ocgo-launch.bat'",
          "'@echo off' | Set-Content $bat -Encoding ASCII",
          "'start \"\" \"' + $edge + '\" --remote-debugging-port=9222 \"--user-data-dir=%USERPROFILE%\\.ocgo-browser-debug\" https://opencode.ai' | Add-Content $bat -Encoding ASCII",
          "explorer.exe $bat",
          "Start-Process -FilePath $edge -ArgumentList '--remote-debugging-port=9222',(\"--user-data-dir=$env:USERPROFILE\\.ocgo-browser-debug\"),'https://opencode.ai' -WindowStyle Minimized",
          "for($i=0;$i -lt 26;$i++){ Start-Sleep -Milliseconds 750; if(Get-NetTCPConnection -LocalPort 9222 -State Listen -ErrorAction SilentlyContinue){ Write-Output 'OK'; exit 0 } }",
          "Write-Output 'NO_LISTEN'; exit 3",
        ].join('\n')
        const spec = shell.resolve({ command: 'powershell -NoProfile -NonInteractive -EncodedCommand ' + utf16leB64(ps), timeoutMs: 60000 })
        const result = await shell.run(spec)
        const text = String(typeof result.stdout === 'string' ? result.stdout : (result.stdout && result.stdout.text != null ? result.stdout.text : ''))
        if (result.exitCode !== 0 || !/OK/.test(text)) {
          const stderrText = String(typeof result.stderr === 'string' ? result.stderr : (result.stderr && result.stderr.text != null ? result.stderr.text : '')).slice(0, 150)
          // 区分"浏览器没找到"与"启动了但 9222 未监听"。Edge 冷启动可能
          // 10-20s(验证已加长到 ~20s);仍失败时引导稍等/重试,而非找 bat 文件
          if (/NO_LISTEN/.test(text)) return { ok: false, error: 'NO_LISTEN: 浏览器启动较慢或失败——请稍等 20 秒后点刷新;仍未出现则再点一次启动按钮' }
          return { ok: false, error: 'NO_BROWSER' + (stderrText ? ' (' + stderrText + ')' : '') }
        }
        return { ok: true }
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e) }
      }
    }

    const serve = async () => {
      try {
        return await fetchAll()
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e) }
      }
    }
    // "再抓一次":清缓存 + 重置失败冷却 + 立即触发官方抓取/提取——
    // 面板按钮用,绕过 60s 冷却与 45s 聚合缓存(用户主动重试 = 想立即执行)
    const retryFetch = async () => {
      try {
        officialCache = null
        cache = null
        officialErrAt = 0
        const p = await collectOfficial()
        return { ok: true, official: p }
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e) }
      }
    }
    // 动态模式(dcordis 沙箱)提供 `harness` 全局:注册 Package-private RPC。
    const harnessApi = (typeof harness !== 'undefined' && harness) ? harness : null
    if (harnessApi && typeof harnessApi.handle === 'function') {
      ctx.effect(() => harnessApi.handle('ocgo-usage:fetch', serve))
      ctx.effect(() => harnessApi.handle('ocgo-usage:launch-browser', launchDebugBrowser))
      ctx.effect(() => harnessApi.handle('ocgo-usage:retry', retryFetch))
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
      // 一键启动调试浏览器:POST → 弹出独立调试窗口(登录用),不等待退出
      ctx.effect(() => ws.register({
        kind: 'exact',
        path: '/ocgo-usage/launch-browser',
        handler: async (req, res) => {
          try {
            if (req.method !== 'POST') { res.writeHead(405); res.end(); return }
            const r = await launchDebugBrowser()
            res.writeHead(r.ok ? 200 : 400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(r))
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: String((e && e.message) || e) }))
          }
        },
      }))
      // 再抓一次:POST → 清缓存/重置冷却并立即重新提取+抓取
      ctx.effect(() => ws.register({
        kind: 'exact',
        path: '/ocgo-usage/retry',
        handler: async (req, res) => {
          try {
            if (req.method !== 'POST') { res.writeHead(405); res.end(); return }
            const r = await retryFetch()
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
