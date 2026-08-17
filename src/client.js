// OpenCode Go 用量面板 — Client 半区
//
// 用法:把本文件内容作为 cordis_define 的 code.client 传入(函数体)。
// 注册到 shell.overlay:右下角可拖动 FAB 胶囊 + 可拖拽/缩放/最大化的悬浮仪表盘。
// 数据经 host.call('ocgo-usage:fetch') 或同源 fetch('/ocgo-usage/fetch') 获取,
// 60s 自动刷新,打开面板时立即刷新。
// 面板位置/大小/FAB 位置/语言通过 localStorage 持久化;
// 语言初始跟随 DSH 全局 locale(未手动选择时),面板标题栏按钮可切换中/英。
return {
  apply(ctx) {
    const slots = ctx.get('slots')
    const timer = ctx.get('timer')
    const localeSvc = ctx.get('locale')
    if (slots === undefined) return

    // ---- 中英字典 ----
    const I18N = {
      zh: {
        'title': 'OpenCode Go 用量',
        'view.dsh': 'DSH',
        'view.official': '官方',
        'dsh.loading': 'DSH 会话扫描中(全量读取会话事件,约 10-60 秒)…',
        'official.err': '官方数据不可用: {e}',
        'official.loading': '官方数据加载中(增量/全量抓取)…',
        'official.errConfig': '尚未配置官方凭据。请在浏览器中打开 opencode.ai 的 usage 页面,从开发者工具复制 auth Cookie 和 workspaceId,填入下方并保存。凭据只保存在本机。',
        'official.errWs': '无法解析 workspaceId(cookie 可能已过期,请重新登录 opencode.ai)。',
        'official.retry': '🔄 重试提取',
        'official.paste': '手动填写官方凭据:',
        'official.cookiePh': 'auth Cookie Value（只填值,不要 auth=）',
        'official.widPh': 'workspaceId（只填 wrk_xxx）',
        'official.save': '保存并刷新',
        'official.saved': '已保存,刷新中…',
        'foot.official': '官方账户级 usage.list · 更新 {t}',
        'foot.officialTrunc': '官方数据截断(超出抓取页数上限)',
        'src.quota': '配额 API',
        'stat.today': '今日',
        'stat.month': '本月',
        'stat.total': '累计',
        'stat.reqs': '{n} 次 · {t} tok',
        'stat.tok': '{i} in / {o} out · cache {c}',
        'donut.rolling': '滚动配额',
        'donut.weekly': '本周',
        'donut.month': '本月',
        'donut.resets': '{t} 重置',
        'donut.resetsUnknown': '重置时间未知',
        'donut.limited': '⚠ 已限流',
        'donut.resetIn': '{s} 后重置',
        'pace.projected': '预计 {p}%',
        'pace.emptyAt': '· 预计耗尽 {t}',
        'warn.banner': '配额即将耗尽: {s}',
        'stat.vsUp': '较昨日 +{d}%',
        'stat.vsDown': '较昨日 {d}%',
        'stat.vsFlat': '较昨日持平',
        'btn.export': '导出',
        'btn.exportTitle': '导出 CSV',
        'quota.err': '配额查询失败: {e}',
        'model.title': '按模型 · 共 {n} 个 · 点击展开分项',
        'model.click': '点击查看费用分项',
        'model.reqs': '{n} 次 · {t}',
        'model.split': '输入 {a} · 输出 {b} · cache 读 {c} · cache 写 {d}',
        'model.official': '金额为官方 cost(无分项)',
        'model.tok': '{i} in / {o} out · cache {c} 读 / {w} 写',
        'model.src': '来源: {s}',
        'trend.title': '花费趋势',
        'trend.7d': '7天',
        'trend.14d': '14天',
        'trend.30d': '30天',
        'trend.day': '{d}  {n} 次  {c}',
        'recent.title': '最近会话',
        'recent.none': '(无标题)',
        'foot.src.dsh': 'DSH 会话事件',
        'foot.matched': '官方回填 {n} 条',
        'foot.est': '金额: 官方 cost + 定价估算',
        'foot.upd': '更新 {t}',
        'foot.int': '60s 自动刷新',
        'update.available': '发现新版本 v{latest}(当前 v{current})——git pull 后重启 DSH 生效',
        'foot.recon': '官方窗口 {o} · 本地明细 {l}',
        'foot.reconTitle': '官方配额按用量单位计(部分模型限时 2×,×$60 仅是参考换算);本地为 usage.list 逐请求美元明细——两口径不可直接对比,差 {d}',
        'load': '加载中…',
        'err.title': '数据不可用',
        'err.local': '本地数据接口 {s}',
        'fab.loading': 'OpenCode Go 加载中…',
        'fab.retry': 'OpenCode Go 重试',
        'fab.rolling': '滚动 {p}%',
        'fab.week': ' · 周 {p}%',
        'fab.month': ' · 月 {p}%',
        'fab.hint': ' (拖动移动,点击打开)',
        'btn.refresh': '刷新',
        'btn.max': '最大化',
        'btn.restore': '还原',
        'btn.close': '关闭',
        'resize.e': '拖拽调整宽度',
        'resize.s': '拖拽调整高度',
        'resize.se': '拖拽缩放',
        'lang.switch': '切换语言',
      },
      en: {
        'title': 'OpenCode Go Usage',
        'view.dsh': 'DSH',
        'view.official': 'Official',
        'dsh.loading': 'Scanning DSH sessions (reading all session events, ~10-60s)…',
        'official.err': 'Official data unavailable: {e}',
        'official.loading': 'Loading official data (incremental/full fetch)…',
        'official.errConfig': 'Official credentials are not configured. Open the opencode.ai usage page, copy the auth cookie and workspaceId from DevTools, then save them below. Credentials stay on this machine.',
        'official.errWs': 'Cannot resolve workspaceId (cookie may be expired — sign in to opencode.ai again).',
        'official.retry': '🔄 Retry extraction',
        'official.paste': 'Enter official credentials:',
        'official.cookiePh': 'auth Cookie Value (value only, no auth=)',
        'official.widPh': 'workspaceId (only the wrk_xxx ID)',
        'official.save': 'Save & refresh',
        'official.saved': 'Saved, refreshing…',
        'foot.official': 'Official account-level usage.list · updated {t}',
        'foot.officialTrunc': 'Official data truncated (over fetch page cap)',
        'src.quota': 'Quota API',
        'stat.today': 'Today',
        'stat.month': 'This month',
        'stat.total': 'Total',
        'stat.reqs': '{n} reqs · {t} tok',
        'stat.tok': '{i} in / {o} out · cache {c}',
        'donut.rolling': 'Rolling',
        'donut.weekly': 'Week',
        'donut.month': 'Month',
        'donut.resets': 'resets {t}',
        'donut.resetsUnknown': 'Reset time unknown',
        'donut.limited': '⚠ rate-limited',
        'donut.resetIn': 'resets in {s}',
        'pace.projected': 'Projected {p}%',
        'pace.emptyAt': ' · likely empty {t}',
        'warn.banner': 'Quota nearly exhausted: {s}',
        'stat.vsUp': '+{d}% vs yesterday',
        'stat.vsDown': '{d}% vs yesterday',
        'stat.vsFlat': 'flat vs yesterday',
        'btn.export': 'Export',
        'btn.exportTitle': 'Export CSV',
        'quota.err': 'Quota query failed: {e}',
        'model.title': 'By model · {n} total · click for details',
        'model.click': 'Click for cost details',
        'model.reqs': '{n} reqs · {t}',
        'model.split': 'In {a} · Out {b} · Cache read {c} · Cache write {d}',
        'model.official': 'Official cost (no breakdown)',
        'model.tok': '{i} in / {o} out · cache {c} r / {w} w',
        'model.src': 'Sources: {s}',
        'trend.title': 'Cost trend',
        'trend.7d': '7d',
        'trend.14d': '14d',
        'trend.30d': '30d',
        'trend.day': '{d}  {n} reqs  {c}',
        'recent.title': 'Recent sessions',
        'recent.none': '(untitled)',
        'foot.src.dsh': 'DSH session events',
        'foot.matched': 'official-matched {n}',
        'foot.est': 'Cost: official + estimated',
        'foot.upd': 'Updated {t}',
        'foot.int': 'Auto-refresh 60s',
        'update.available': 'Update available: v{latest} (current v{current}) — git pull & restart DSH',
        'foot.recon': 'Official window {o} · Local detail {l}',
        'foot.reconTitle': 'Official quota is metered in usage units (some models count 2x; ×$60 is only a reference conversion); local is per-request USD from usage.list — different bases, not directly comparable, diff {d}',
        'load': 'Loading…',
        'err.title': 'Data unavailable',
        'err.local': 'Local data endpoint {s}',
        'fab.loading': 'OpenCode Go loading…',
        'fab.retry': 'OpenCode Go retry',
        'fab.rolling': 'Rolling {p}%',
        'fab.week': ' · Wk {p}%',
        'fab.month': ' · Mo {p}%',
        'fab.hint': ' (drag to move, click to open)',
        'btn.refresh': 'Refresh',
        'btn.max': 'Maximize',
        'btn.restore': 'Restore',
        'btn.close': 'Close',
        'resize.e': 'Drag to resize width',
        'resize.s': 'Drag to resize height',
        'resize.se': 'Drag to resize',
        'lang.switch': 'Switch language',
      },
    }

    const STYLE_TEXT = `
@keyframes ocgo-in { from { opacity: 0; transform: scale(.97) translateY(4px); } to { opacity: 1; transform: none; } }
.ocgo-fab { position: fixed; right: 16px; bottom: 84px; z-index: 9999; display: flex; align-items: center; gap: 6px; padding: 8px 14px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px; cursor: grab; user-select: none; font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-primary); background: linear-gradient(135deg, color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent), transparent), var(--dsw-alias-bg-overlay); box-shadow: 0 4px 16px rgba(0,0,0,.18); white-space: nowrap; transition: filter .15s ease, border-color .3s ease, background .3s ease; }
.ocgo-fab:hover { filter: brightness(1.12); }
.ocgo-fab:active { cursor: grabbing; }
.ocgo-fab.ocgo-warn-mid { border-color: var(--dsw-alias-state-warn-primary); }
.ocgo-fab.ocgo-warn-hi { border-color: var(--dsw-alias-state-error-primary); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent), var(--dsw-alias-bg-overlay); }
.ocgo-fab .ocgo-fab-sub { font-weight: 500; font-size: 10px; opacity: .8; }
.ocgo-panel { position: fixed; z-index: 9999; display: flex; flex-direction: column; width: 400px; min-width: 300px; max-width: 92vw; height: 560px; min-height: 260px; max-height: 84vh; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-bg-base); box-shadow: 0 12px 48px rgba(0,0,0,.32); overflow: hidden; animation: ocgo-in .16s ease; }
.ocgo-panel.ocgo-max { left: 8px; top: 8px; right: 8px; bottom: 8px; width: auto; height: auto; max-width: none; max-height: none; }
.ocgo-titlebar { display: flex; align-items: center; gap: 8px; padding: 8px 10px; cursor: move; user-select: none; background: linear-gradient(135deg, color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent), transparent), var(--dsw-alias-bg-layer-1); border-bottom: 1px solid var(--dsw-alias-border-l1); }
.ocgo-title { font-size: 13px; font-weight: 700; color: var(--dsw-alias-label-primary); letter-spacing: .02em; }
.ocgo-spacer { flex: 1; }
.ocgo-ibtn { background: none; border: none; cursor: pointer; color: var(--dsw-alias-label-secondary); display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; border-radius: 6px; transition: background .15s ease, color .15s ease; }
.ocgo-ibtn:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.ocgo-body { flex: 1; overflow: auto; padding: 10px; display: flex; flex-direction: column; gap: 10px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.ocgo-viewrow { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
.ocgo-seg { display: flex; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; overflow: hidden; }
.ocgo-seg-btn { background: none; border: none; cursor: pointer; padding: 4px 12px; font-size: 12px; color: var(--dsw-alias-label-secondary); transition: background .15s ease; }
.ocgo-seg-btn.on { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent); color: var(--dsw-alias-label-primary); font-weight: 600; }
.ocgo-src { font-size: 10px; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1); }
.ocgo-src.ok { color: var(--dsw-alias-state-success-primary); }
.ocgo-src.miss { color: var(--dsw-alias-label-secondary); opacity: .6; }
.ocgo-stats { display: flex; gap: 8px; }
.ocgo-stat { flex: 1; display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--dsw-alias-border-l1); background: linear-gradient(160deg, color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent), transparent 70%), var(--dsw-alias-bg-layer-1); }
.ocgo-stat-label { font-size: 10px; color: var(--dsw-alias-label-secondary); }
.ocgo-stat-value { font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: -.02em; color: var(--dsw-alias-label-primary); }
.ocgo-stat-sub { font-size: 10px; color: var(--dsw-alias-label-secondary); opacity: .85; }
.ocgo-quota { display: flex; gap: 12px; justify-content: space-around; padding: 8px; border-radius: 10px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); }
.ocgo-donut-wrap { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.ocgo-donut { width: 76px; height: 76px; }
.ocgo-donut-val { fill: var(--dsw-alias-label-primary); font-size: 14px; font-weight: 800; }
.ocgo-donut-lbl { fill: var(--dsw-alias-label-secondary); font-size: 9px; }
.ocgo-donut-time { font-size: 9px; color: var(--dsw-alias-label-secondary); }
.ocgo-panel2 { display: flex; flex-direction: column; gap: 6px; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); }
.ocgo-ptitle { font-size: 10px; font-weight: 700; color: var(--dsw-alias-label-secondary); text-transform: uppercase; letter-spacing: .06em; }
.ocgo-mrow { display: flex; align-items: center; gap: 8px; cursor: pointer; border-radius: 6px; padding: 2px 4px; }
.ocgo-mrow:hover { background: var(--dsw-alias-bg-layer-2); }
.ocgo-mname { width: 120px; flex: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-primary); font-size: 11px; }
.ocgo-mbar { flex: 1; height: 8px; border-radius: 4px; background: var(--dsw-alias-bg-layer-2); overflow: hidden; }
.ocgo-mbar-fill { height: 100%; border-radius: 4px; background: linear-gradient(90deg, color-mix(in srgb, var(--dsw-alias-brand-primary) 50%, transparent), var(--dsw-alias-brand-primary)); }
.ocgo-mreq { width: 58px; flex: none; text-align: right; color: var(--dsw-alias-label-secondary); font-size: 10px; }
.ocgo-mcost { width: 66px; flex: none; text-align: right; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary); font-weight: 600; font-size: 11px; }
.ocgo-mdetail { display: flex; flex-direction: column; gap: 2px; padding: 4px 6px 6px 6px; font-size: 10px; color: var(--dsw-alias-label-secondary); border-left: 2px solid var(--dsw-alias-border-l2); margin-left: 4px; }
.ocgo-prow { display: flex; align-items: center; gap: 8px; }
.ocgo-pname { width: 84px; flex: none; color: var(--dsw-alias-label-primary); font-size: 11px; }
.ocgo-pbar { flex: 1; height: 8px; border-radius: 4px; background: var(--dsw-alias-bg-layer-2); overflow: hidden; }
.ocgo-pbar-fill { height: 100%; border-radius: 4px; background: linear-gradient(90deg, color-mix(in srgb, var(--dsw-alias-brand-primary) 40%, transparent), var(--dsw-alias-brand-primary)); }
.ocgo-pcost { width: 66px; flex: none; text-align: right; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary); font-weight: 600; font-size: 11px; }
.ocgo-days { display: flex; align-items: flex-end; gap: 4px; height: 76px; padding-top: 4px; }
.ocgo-day { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 2px; height: 100%; }
.ocgo-day-fill { width: 100%; max-width: 20px; border-radius: 3px 3px 0 0; background: linear-gradient(180deg, color-mix(in srgb, var(--dsw-alias-brand-primary) 25%, transparent), var(--dsw-alias-brand-primary)); transition: height .3s ease; }
.ocgo-day-lbl { font-size: 8px; color: var(--dsw-alias-label-secondary); }
.ocgo-srow { display: flex; align-items: baseline; gap: 8px; }
.ocgo-sname { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-primary); font-size: 11px; }
.ocgo-stime { color: var(--dsw-alias-label-secondary); font-size: 10px; flex: none; }
.ocgo-scost { font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary); font-weight: 600; font-size: 11px; flex: none; }
.ocgo-foot { display: flex; align-items: center; gap: 8px; font-size: 10px; color: var(--dsw-alias-label-secondary); opacity: .75; flex-wrap: wrap; }
.ocgo-foot .ocgo-warn { color: var(--dsw-alias-state-warn-primary); opacity: 1; }
.ocgo-err { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent); }
.ocgo-loading { color: var(--dsw-alias-label-secondary); padding: 8px 4px; }
.ocgo-edge-e { position: absolute; top: 0; right: 0; width: 8px; height: 100%; cursor: ew-resize; }
.ocgo-edge-s { position: absolute; left: 0; bottom: 0; width: 100%; height: 8px; cursor: ns-resize; }
.ocgo-resize { position: absolute; right: 0; bottom: 0; width: 26px; height: 26px; cursor: nwse-resize; }
.ocgo-resize::before, .ocgo-resize::after { content: ''; position: absolute; right: 6px; bottom: 6px; border-right: 2px solid var(--dsw-alias-label-secondary); border-bottom: 2px solid var(--dsw-alias-label-secondary); }
.ocgo-resize::before { width: 9px; height: 9px; opacity: .3; }
.ocgo-resize::after { width: 5px; height: 5px; opacity: .6; }
`
    // 样式注入:动态模式下用 `styles` 全局(fiber 卸载自动移除);
    // 静态 bundle 模式下 styles 不可用,降级为直接挂 <style>(页面刷新后清除)。
    try {
      if (typeof styles !== 'undefined' && styles && typeof styles.insert === 'function') {
        styles.insert(STYLE_TEXT)
      } else {
        const el = document.createElement('style')
        el.setAttribute('data-plugin-css', 'ocgo-usage-static')
        el.textContent = STYLE_TEXT
        document.head.appendChild(el)
      }
    } catch (e) { /* css 注入为尽力而为 */ }

    const LS_KEY = 'ocgo-panel-state-v1'
    const LS_LANG = 'ocgo-lang-v1'
    function loadState() {
      try {
        const raw = window.localStorage.getItem(LS_KEY)
        if (raw) {
          const s = JSON.parse(raw)
          if (s && typeof s === 'object') {
            // 位置越界保护:窗口尺寸/分辨率变化后,FAB/面板可能被存到屏幕外而"消失"。
            // 超出可视区的位置视为无效,回落到默认(右下角 FAB)。
            const vw = window.innerWidth
            const vh = window.innerHeight
            const valid = (p) => p && typeof p.x === 'number' && typeof p.y === 'number' &&
              p.x >= -8 && p.y >= -8 && p.x <= vw - 40 && p.y <= vh - 40
            if (!valid(s.fabPos)) s.fabPos = null
            if (!valid(s.pos)) s.pos = null
            return s
          }
        }
      } catch (e) { /* storage unavailable */ }
      return null
    }
    function saveState(state) {
      try {
        window.localStorage.setItem(LS_KEY, JSON.stringify(state))
      } catch (e) { /* storage unavailable */ }
    }

    function fmtUsd(v) {
      if (v == null) return '—'
      const n = Number(v)
      if (n !== 0 && Math.abs(n) < 0.01) return '$' + n.toFixed(4)
      return '$' + n.toFixed(2)
    }
    function fmtTokens(n) {
      if (n == null) return ''
      if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
      if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
      if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
      return String(n)
    }
    function fmtTime(ms) {
      if (!ms) return ''
      try {
        const d = new Date(ms)
        const p = (n) => String(n).padStart(2, '0')
        return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
      } catch (e) { return '' }
    }
    // 倒计时格式:>=24h → "1d 5h";>=1h → "3h 45m";否则 "45m"(<1m → "<1m")
    function fmtDur(ms) {
      if (ms == null || !isFinite(ms)) return '—'
      if (ms < 0) return '0m'
      const totalMin = Math.floor(ms / 60000)
      if (totalMin < 1) return '<1m'
      if (totalMin < 60) return totalMin + 'm'
      const h = Math.floor(totalMin / 60)
      if (h < 24) return h + 'h ' + (totalMin % 60) + 'm'
      const d = Math.floor(h / 24)
      return d + 'd ' + (h % 24) + 'h'
    }
    // Pace 预测:按"窗口已过时间比例"外推期末用量。
    // projected = 当前 percent / 已过比例;>100 表示按当前烧速会在重置前耗尽。
    // windowMs:rolling=5h,weekly=7d,monthly≈30d(窗口起点 = resetsAt - windowMs)。
    function paceOf(q, now, windowMs) {
      if (!q || q.percent == null || !q.resetsAt || !windowMs) return null
      const resetsAt = new Date(q.resetsAt).getTime()
      const elapsed = now - (resetsAt - windowMs)
      // 窗口刚重置(<2% 时间)时数据太少,外推不可靠,不显示预测(避免误报)
      if (elapsed < windowMs * 0.02 || windowMs <= 0) return null
      const ratio = Math.min(1, Math.max(0.001, elapsed / windowMs))
      const projected = q.percent / ratio
      let emptyAt = null
      if (projected > 100 && elapsed > 0) {
        const burnPerMs = q.percent / elapsed
        if (burnPerMs > 0) {
          const at = now + (100 - q.percent) / burnPerMs
          if (at < resetsAt) emptyAt = at
        }
      }
      return { projected, emptyAt, over: projected > 100 }
    }
    function quotaColor(p, limited) {
      if (limited) return 'var(--dsw-alias-state-error-primary)'
      if (p >= 90) return 'var(--dsw-alias-state-error-primary)'
      if (p >= 70) return 'var(--dsw-alias-state-warn-primary)'
      return 'var(--dsw-alias-state-success-primary)'
    }
    function Donut(props) {
      // rate-limited:窗口配额已耗尽(服务端限流),红色 + ⚠ 徽标,不显示倒计时
      const limited = props.status === 'rate-limited'
      const p = Math.max(0, Math.min(100, props.percent || 0))
      const r = 28
      const c = 2 * Math.PI * r
      const pace = props.pace
      const paceColor = pace && pace.over ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-state-success-primary)'
      const paceText = pace
        ? props.t('pace.projected', { p: Math.round(pace.projected) }) + (pace.emptyAt ? props.t('pace.emptyAt', { t: fmtTime(pace.emptyAt) }) : '')
        : null
      return React.createElement('div', { className: 'ocgo-donut-wrap' },
        React.createElement('svg', { className: 'ocgo-donut', viewBox: '0 0 76 76' },
          React.createElement('circle', { cx: 38, cy: 38, r, fill: 'none', stroke: 'var(--dsw-alias-bg-layer-2)', strokeWidth: 9 }),
          React.createElement('circle', { cx: 38, cy: 38, r, fill: 'none', stroke: quotaColor(p, limited), strokeWidth: 9, strokeLinecap: 'round', strokeDasharray: (p / 100) * c + ' ' + c, transform: 'rotate(-90 38 38)', style: { transition: 'stroke-dasharray .5s ease' } }),
          React.createElement('text', { x: 38, y: 35, textAnchor: 'middle', className: 'ocgo-donut-val', fill: limited ? 'var(--dsw-alias-state-error-primary)' : undefined }, limited ? '⚠' : Math.round(p) + '%'),
          React.createElement('text', { x: 38, y: 48, textAnchor: 'middle', className: 'ocgo-donut-lbl' }, props.label)
        ),
        limited
          ? React.createElement('span', { className: 'ocgo-donut-time', style: { color: 'var(--dsw-alias-state-error-primary)', opacity: 1, fontWeight: 700 } }, props.t('donut.limited'))
          : React.createElement('span', { className: 'ocgo-donut-time' }, props.resetsAt
            ? props.t('donut.resetIn', { s: fmtDur(new Date(props.resetsAt).getTime() - Date.now()) })
            : props.t('donut.resetsUnknown')),
        paceText ? React.createElement('span', { className: 'ocgo-donut-time', style: { color: paceColor, opacity: 1, fontWeight: 600 } }, paceText) : null
      )
    }
    function Stat(props) {
      return React.createElement('div', { className: 'ocgo-stat' },
        React.createElement('div', { className: 'ocgo-stat-label' }, props.label),
        React.createElement('div', { className: 'ocgo-stat-value' }, props.value),
        props.sub ? React.createElement('div', { className: 'ocgo-stat-sub' }, props.sub) : null
      )
    }
    // 标题栏 SVG 图标(16×16 viewBox,stroke 风格,currentColor 随主题)
    function Icon({ name, size }) {
      const s = size || 14
      const common = { width: s, height: s, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }
      const paths = {
        // 语言切换:地球
        lang: [
          React.createElement('circle', { key: 'c', cx: 8, cy: 8, r: 6.2 }),
          React.createElement('path', { key: 'h', d: 'M1.8 8h12.4' }),
          React.createElement('path', { key: 'v', d: 'M8 1.8c2.3 1.9 2.3 10.5 0 12.4M8 1.8c-2.3 1.9-2.3 10.5 0 12.4' }),
        ],
        // 导出 CSV:下载箭头 + 托盘
        export: [
          React.createElement('path', { key: 'a', d: 'M8 2.8v7.4' }),
          React.createElement('path', { key: 'b', d: 'M4.8 7.2 8 10.4l3.2-3.2' }),
          React.createElement('path', { key: 'c', d: 'M2.5 13.2h11' }),
        ],
        // 刷新:环形箭头
        refresh: [
          React.createElement('path', { key: 'a', d: 'M13.6 5.4A5.6 5.6 0 1 0 13.6 10.6' }),
          React.createElement('path', { key: 'b', d: 'M13.6 1.9v3.5h-3.5' }),
        ],
        // 最大化:方块
        max: [React.createElement('rect', { key: 'r', x: 2.8, y: 2.8, width: 10.4, height: 10.4, rx: 1.5 })],
        // 还原:重叠方块
        restore: [
          React.createElement('path', { key: 'f', d: 'M5.8 5.8V2.8h7.4v7.4h-3' }),
          React.createElement('rect', { key: 'b', x: 2.8, y: 5.8, width: 7.4, height: 7.4, rx: 1.2 }),
        ],
        // 关闭:X
        close: [
          React.createElement('path', { key: 'x', d: 'M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6' }),
        ],
      }
      return React.createElement('svg', common, paths[name] || null)
    }

    function UsagePanel() {
      const saved = loadState()
      const [state, setState] = React.useState({ loading: true, data: null, error: null })
      const [view, setView] = React.useState('official')
      const [days, setDays] = React.useState(14)
      const [open, setOpen] = React.useState(false)
      const [pos, setPos] = React.useState(saved ? saved.pos || null : null)
      const [size, setSize] = React.useState(saved ? saved.size || null : null)
      const [maximized, setMaximized] = React.useState(saved ? !!saved.maximized : false)
      const [fabPos, setFabPos] = React.useState(saved ? saved.fabPos || null : null)
      const [expModel, setExpModel] = React.useState(null)
      const [stamp, setStamp] = React.useState(0)
      const [tick, setTick] = React.useState(0)
      const [cfgAuth, setCfgAuth] = React.useState('')
      const [cfgWid, setCfgWid] = React.useState('')
      const [cfgSaving, setCfgSaving] = React.useState(false)
      const [cfgMsg, setCfgMsg] = React.useState(null)
      // 多 key 池:手动选中的 key 名(null = 自动:ACTIVE 优先,否则第一个)
      const [qKey, setQKey] = React.useState(null)
      // 语言:本地记忆优先,否则跟随 DSH 全局 locale(未手动选择时订阅其变化)
      const [lang, setLang] = React.useState(() => {
        try {
          const savedLang = window.localStorage.getItem(LS_LANG)
          if (savedLang === 'zh' || savedLang === 'en') return savedLang
        } catch (e) { /* storage unavailable */ }
        try {
          const id = (localeSvc && typeof localeSvc.getLocale === 'function' && localeSvc.getLocale().id) || ''
          return /^zh/i.test(String(id)) ? 'zh' : 'en'
        } catch (e) { /* locale unavailable */ }
        return 'zh'
      })
      React.useEffect(() => {
        if (!localeSvc || typeof localeSvc.subscribe !== 'function') return
        return localeSvc.subscribe(() => {
          try {
            if (window.localStorage.getItem(LS_LANG)) return
            const id = String((localeSvc.getLocale && localeSvc.getLocale().id) || '')
            setLang(/^zh/i.test(id) ? 'zh' : 'en')
          } catch (e) { /* storage unavailable */ }
        })
      }, [])
      function toggleLang() {
        const next = lang === 'zh' ? 'en' : 'zh'
        try { window.localStorage.setItem(LS_LANG, next) } catch (e) { /* storage unavailable */ }
        setLang(next)
      }
      const t = (key, vars) => {
        let s = (I18N[lang] && I18N[lang][key]) || I18N.zh[key] || key
        if (vars) for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(String(vars[k]))
        return s
      }
      const n = (x) => x == null ? '—' : String(x)
      const subReqs = (x, tok) => t('stat.reqs', { n: n(x), t: fmtTokens(tok) })

      React.useEffect(() => {
        let alive = true
        let inFlight = false
        let fastTimer = null
        const stopFast = () => { if (fastTimer) { try { fastTimer() } catch (e) { /* timer may be gone */ } fastTimer = null } }
        async function load() {
          if (inFlight) return
          inFlight = true
          try {
            let r
            // 动态模式走 host.call(harness 桥);bundle 模式走 webServer 本地路由。
            const fetchP = (async () => {
              if (typeof host !== 'undefined' && host && typeof host.call === 'function') {
                return host.call('ocgo-usage:fetch')
              }
              const res = await fetch('/ocgo-usage/fetch', { cache: 'no-store' })
              if (!res.ok) throw new Error(t('err.local', { s: res.status }))
              return res.json()
            })()
            // 看门狗:单次请求 60s 超时。历史问题:host 一次聚合耗时超过轮询
            // 间隔时,inFlight 被长请求永久占用,60s 轮询被连续跳过,面板看起来
            // "不再 60 秒刷新"。超时放弃本次、保留旧数据,下一个 tick 重试。
            let wdTimer = null
            const watchdog = new Promise((_, reject) => {
              if (timer && typeof timer.setTimeout === 'function') {
                wdTimer = timer.setTimeout(() => reject(new Error('fetch timeout (60s)')), 60000)
              }
            })
            try {
              r = await Promise.race([fetchP, watchdog])
            } finally {
              if (wdTimer) { try { wdTimer() } catch (e) { /* timer may be gone */ } }
            }
            if (!alive) return
            if (r && r.ok) {
              setState({ loading: false, data: r, error: null })
              setStamp(Date.now())
              // 官方明细未就绪或 DSH 扫描未完成时 15s 快速轮询,就绪后恢复 60s
              const of = r.official
              if (open && ((of && !of.ok) || r.dshLoading)) {
                if (!fastTimer && timer && typeof timer.setTimeout === 'function') {
                  fastTimer = timer.setTimeout(() => { fastTimer = null; if (alive) load() }, 15000)
                }
              } else {
                stopFast()
              }
            } else {
              stopFast()
              // 保留旧数据:瞬时失败不清空面板/FAB(函数式更新避免闭包陈旧)
              setState((prev) => ({ loading: false, data: prev.data, error: (r && r.error) || 'unknown error' }))
            }
          } catch (e) {
            stopFast()
            if (alive) setState((prev) => ({ loading: false, data: prev.data, error: String((e && e.message) || e) }))
          } finally {
            inFlight = false
          }
        }
        if (open || !state.data) load()
        // 始终 60s 轮询(面板打开或仅 FAB 都刷新):v1.6.15 起会话扫描后台化、
        // 官方增量轻量(1-3s)、配额 curl 秒级——关闭状态 60s 一次的开销可控,
        // FAB 的金额/配额百分比因此保持实时(此前仅面板打开时轮询)。
        // 15s fast-poll 仍只在面板打开且官方未就绪时启用。
        let disposer = null
        if (timer) disposer = timer.interval(load, 60000)
        return () => { alive = false; stopFast(); if (disposer) disposer() }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [tick, open])

      function reload() { setState({ loading: true, data: null, error: null }); setTick((t) => t + 1) }

      // 手动保存官方凭据:动态模式走 host RPC,bundle 模式走同源路由。
      async function saveCfg() {
        if (!cfgAuth.trim() || !cfgWid.trim()) return
        setCfgSaving(true)
        try {
          const payload = { authCookie: cfgAuth.trim(), workspaceId: cfgWid.trim() }
          let r
          if (typeof host !== 'undefined' && host && typeof host.call === 'function') {
            r = await host.call('ocgo-usage:config', payload)
          } else {
            const res = await fetch('/ocgo-usage/config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })
            r = await res.json()
          }
          if (r && r.ok) { setCfgMsg(t('official.saved')); reload() }
          else setCfgMsg((r && r.error) || 'save failed')
        } catch (e) {
          setCfgMsg(String((e && e.message) || e))
        }
        setCfgSaving(false)
      }

      // "再抓一次":清缓存/重置冷却并立即重新提取+抓取(动态走 harness 桥;bundle 走本地路由)
      async function retryExtract() {
        setCfgSaving(true)
        try {
          let r
          if (typeof host !== 'undefined' && host && typeof host.call === 'function') {
            r = await host.call('ocgo-usage:retry')
          } else {
            const res = await fetch('/ocgo-usage/retry', { method: 'POST' })
            r = await res.json()
          }
          if (r && r.ok) reload()
          else setCfgMsg((r && r.error) || 'retry failed')
        } catch (e) {
          setCfgMsg(String((e && e.message) || e))
        }
        setCfgSaving(false)
      }

      // 导出 CSV:统计 + 配额 + 按模型 + 最近会话(当前视图)
      function exportCsv() {
        try {
          const rows = []
          const push = (arr) => rows.push(arr.map((v) => {
            const s = String(v == null ? '' : v)
            return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
          }).join(','))
          push(['OpenCode Go 用量导出', new Date().toLocaleString()])
          if (d) {
            const v = vd
            if (v) {
              push([])
              push(['指标', '今日', '本月', '累计'])
              push(['花费', v.today.cost_est, v.month.cost_est, v.total.cost_est])
              push(['请求数', v.today.requests, v.month.requests, v.total.requests])
              push(['输入 tokens', v.today.tokens_input, v.month.tokens_input, v.total.tokens_input])
              push(['输出 tokens', v.today.tokens_output, v.month.tokens_output, v.total.tokens_output])
            }
            if (d.quota && Array.isArray(d.quota.keys) && d.quota.keys.length) {
              // 导出当前选中 key 的窗口(多 key 时每 key 一组)
              d.quota.keys.forEach((ke) => {
                const w = ke.windows
                if (!w) return
                push([])
                push(['配额窗口', 'key', '用量 %', '状态', '重置时间'])
                ;['rolling', 'weekly', 'monthly'].forEach((k) => {
                  const q = w[k]
                  if (q) push([k, ke.name, q.percent, q.status || '', q.resetsAt ? fmtTime(new Date(q.resetsAt).getTime()) : ''])
                })
              })
            }
            if (v && v.by_model && v.by_model.length) {
              push([])
              push(['模型', '请求数', '花费', '输入 tok', '输出 tok'])
              v.by_model.forEach((m) => push([m.model, m.requests, m.cost_est, m.tokens_in || 0, m.tokens_out || 0]))
            }
            if (v && v.recent && v.recent.length) {
              push([])
              push(['最近会话', '时间', '花费'])
              v.recent.forEach((s) => push([s.title || '', fmtTime(s.updated), s.cost_est]))
            }
          }
          const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = 'ocgo-usage-' + new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-') + '.csv'
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
        } catch (e) { /* 导出失败不阻塞 */ }
      }

      // 位置/大小只在拖动结束时持久化一次,避免 mousemove 期间反复写 localStorage
      function commitState(partial) {
        saveState({ pos, size, fabPos, maximized, ...partial })
      }

      function toggleMax() {
        setMaximized(!maximized)
        commitState({ maximized: !maximized })
      }

      function onTitleDown(e) {
        if (e.target.closest && e.target.closest('.ocgo-ibtn')) return
        if (maximized) return // 最大化时禁止拖动,避免还原后位置跳变
        e.preventDefault()
        const panel = e.currentTarget.parentElement
        const rect = panel.getBoundingClientRect()
        const sx = e.clientX, sy = e.clientY
        const bx = rect.left, by = rect.top
        const maxX = Math.max(8, window.innerWidth - Math.min(rect.width, window.innerWidth - 16) - 8)
        const maxY = Math.max(8, window.innerHeight - Math.min(rect.height, window.innerHeight - 16) - 8)
        let last = null
        const onMove = (ev) => {
          last = { x: Math.min(Math.max(8, bx + ev.clientX - sx), maxX), y: Math.min(Math.max(8, by + ev.clientY - sy), maxY) }
          setPos(last)
        }
        const onUp = () => {
          window.removeEventListener('mousemove', onMove)
          window.removeEventListener('mouseup', onUp)
          if (last) commitState({ pos: last })
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
      }
      function onResizeDown(e, mode) {
        e.preventDefault()
        e.stopPropagation()
        const panel = e.currentTarget.parentElement
        const rect = panel.getBoundingClientRect()
        const sx = e.clientX, sy = e.clientY
        const bw = rect.width, bh = rect.height
        let last = null
        const onMove = (ev) => {
          const dx = ev.clientX - sx
          const dy = ev.clientY - sy
          const next = { w: bw, h: bh }
          if (mode === 'e' || mode === 'se') next.w = Math.max(300, bw + dx)
          if (mode === 's' || mode === 'se') next.h = Math.max(260, bh + dy) // 与 CSS min-height: 260px 对齐
          last = next
          setSize(last)
        }
        const onUp = () => {
          window.removeEventListener('mousemove', onMove)
          window.removeEventListener('mouseup', onUp)
          if (last) commitState({ size: last })
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
      }
      function onFabDown(e) {
        e.preventDefault()
        const rect = e.currentTarget.getBoundingClientRect()
        const sx = e.clientX, sy = e.clientY
        const bx = rect.left, by = rect.top
        let moved = false
        let last = null
        const onMove = (ev) => {
          if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 4) moved = true
          // 视口钳制:与面板拖动一致,FAB 不允许被拖出屏幕外
          last = {
            x: Math.min(Math.max(0, bx + ev.clientX - sx), window.innerWidth - 60),
            y: Math.min(Math.max(0, by + ev.clientY - sy), window.innerHeight - 40),
          }
          setFabPos(last)
        }
        const onUp = () => {
          window.removeEventListener('mousemove', onMove)
          window.removeEventListener('mouseup', onUp)
          if (!moved) {
            const w = 400, h = 560
            const x = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8))
            const y = Math.max(8, Math.min(rect.top, window.innerHeight - h - 8))
            setPos({ x, y })
            setMaximized(false)
            setOpen(true)
            commitState({ pos: { x, y }, maximized: false, fabPos: last || fabPos })
          } else if (last) {
            commitState({ fabPos: last })
          }
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
      }

      const d = state.data
      const official = d && d.official
      const dshVd = d && d.dsh
      // DSH 会话扫描后台化后,首次(或扫描过期重扫期间)响应里的 dsh 是旧/空
      // 数据——未就绪时(dshLoading)显示"扫描中"提示,不渲染 0 误导
      const dshLoading = !!(d && d.dshLoading)
      const officialVd = official && official.ok ? official.vd : null
      // 官方视图只认官方明细;DSH 数据仅在 DSH 视图展示,官方明细不可用时不充数
      const vd = (view === 'dsh' ? dshVd : officialVd) || null
      const total = vd ? vd.total : null
      const pct = (v) => (v == null ? null : Math.round(v))
      // 配额数据:多 key 池(host 返回 keys 数组)。当前 key = 手动选中 →
      // ACTIVE 标记 → 第一个;单 key 时行为与旧版一致。
      const quotaKeys = (d && d.quota && Array.isArray(d.quota.keys) && d.quota.keys.length) ? d.quota.keys : null
      const curQ = quotaKeys ? (quotaKeys.find((k) => k.name === qKey) || quotaKeys.find((k) => k.active) || quotaKeys[0]) : null
      const qz = curQ ? curQ.windows : null
      const rollPct = qz && qz.rolling ? qz.rolling.percent : null
      const fabTitle = t('title') + (curQ && curQ.name !== 'default' ? ' · ' + curQ.name : '') + ' · ' + t('fab.rolling', { p: rollPct != null ? pct(rollPct) : '—' }) +
        (qz && qz.weekly ? t('fab.week', { p: pct(qz.weekly.percent) }) : '') +
        (qz && qz.monthly ? t('fab.month', { p: pct(qz.monthly.percent) }) : '') +
        t('fab.hint')
      const fabWarn = rollPct != null && rollPct >= 90 ? ' ocgo-warn-hi' : (rollPct != null && rollPct >= 70 ? ' ocgo-warn-mid' : '')

      const fabStyle = {}
      if (fabPos) { fabStyle.left = fabPos.x; fabStyle.top = fabPos.y; fabStyle.right = 'auto'; fabStyle.bottom = 'auto' }
      const panelStyle = {}
      if (maximized) {
        // .ocgo-max class handles geometry
      } else if (pos) { panelStyle.left = pos.x; panelStyle.top = pos.y; panelStyle.right = 'auto'; panelStyle.bottom = 'auto' }
      else { panelStyle.right = 16; panelStyle.top = 72 }
      if (size && !maximized) { panelStyle.width = size.w; panelStyle.height = size.h }

      if (state.loading && !d) {
        return React.createElement('div', null,
          React.createElement('button', { className: 'ocgo-fab' + fabWarn, style: fabStyle, onMouseDown: onFabDown, title: fabTitle }, t('fab.loading'))
        )
      }
      if (state.error && !d) {
        return React.createElement('div', null,
          React.createElement('button', { className: 'ocgo-fab' + fabWarn, style: fabStyle, onMouseDown: onFabDown, title: state.error }, t('fab.retry'))
        )
      }

      const fab = React.createElement('button', { className: 'ocgo-fab' + fabWarn, style: fabStyle, onMouseDown: onFabDown, title: fabTitle },
        React.createElement('span', null, 'OpenCode Go'),
        (total && !(view === 'dsh' && dshLoading)) ? React.createElement('span', { style: { fontWeight: 800 } }, fmtUsd(total.cost_est)) : null,
        rollPct != null ? React.createElement('span', { className: 'ocgo-fab-sub' }, t('fab.rolling', { p: pct(rollPct) })) : null
      )
      if (!open) return React.createElement('div', null, fab)

      const body = []
      if (state.loading) {
        body.push(React.createElement('div', { key: 'l', className: 'ocgo-loading' }, t('load')))
      } else if (state.error) {
        body.push(React.createElement('div', { key: 'e', className: 'ocgo-err' },
          React.createElement('div', null, t('err.title')),
          React.createElement('div', null, state.error)
        ))
      } else if (dshLoading || vd || (view !== 'dsh' && official)) {
        body.push(React.createElement('div', { key: 'views', className: 'ocgo-viewrow' },
          React.createElement('div', { className: 'ocgo-seg' },
            React.createElement('button', { className: 'ocgo-seg-btn' + (view === 'official' ? ' on' : ''), onClick: () => setView('official') }, t('view.official')),
            React.createElement('button', { className: 'ocgo-seg-btn' + (view === 'dsh' ? ' on' : ''), onClick: () => setView('dsh') }, t('view.dsh'))
          ),
          React.createElement('span', { className: 'ocgo-spacer' })
        ))
        // 官方明细状态横幅(不阻塞主体:配额始终显示)
        if (view !== 'dsh' && official) {
          if (official.loading) {
            body.push(React.createElement('div', { key: 'of-status', className: 'ocgo-src miss' }, t('official.loading')))
          } else if (!official.ok) {
            const ec = official.error
            const friendly = ec === 'NEED_CONFIG' ? t('official.errConfig')
              : ec === 'WS_PARSE_FAIL' ? t('official.errWs')
              : t('official.err', { e: official.error || 'unknown' })
            const inputStyle = { flex: 1, minWidth: 0, background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 6, padding: '4px 6px', color: 'var(--dsw-alias-label-primary)', fontSize: 11 }
            body.push(React.createElement('div', { key: 'of-status', className: 'ocgo-err' },
              React.createElement('div', null, friendly),
              React.createElement('div', { className: 'ocgo-viewrow', style: { marginTop: 6 } },
                React.createElement('button', { className: 'ocgo-seg-btn', onClick: retryExtract, disabled: cfgSaving, style: { border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 6, color: 'var(--dsw-alias-label-primary)' } }, t('official.retry')),
                cfgMsg ? React.createElement('span', { style: { fontSize: 10 } }, cfgMsg) : null
              ),
              React.createElement('div', { style: { fontSize: 10, opacity: .8 } }, '~/.config/dsh-opencode-go-usage.json'),
              React.createElement('div', { className: 'ocgo-viewrow', style: { marginTop: 4 } },
                React.createElement('input', { value: cfgAuth, onChange: (e) => setCfgAuth(e.target.value), placeholder: t('official.cookiePh'), style: inputStyle })
              ),
              React.createElement('div', { className: 'ocgo-viewrow' },
                React.createElement('input', { value: cfgWid, onChange: (e) => setCfgWid(e.target.value), placeholder: t('official.widPh'), style: inputStyle })
              ),
              React.createElement('div', { className: 'ocgo-viewrow' },
                React.createElement('button', { className: 'ocgo-seg-btn', onClick: saveCfg, disabled: cfgSaving, style: { border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 6, color: 'var(--dsw-alias-label-primary)' } }, cfgSaving ? t('official.saved') : t('official.save'))
              )
            ))
          }
        }
        // DSH 扫描状态横幅:未就绪时提示,不显示 0 数据
        if (view === 'dsh' && dshLoading) {
          body.push(React.createElement('div', { key: 'dsh-status', className: 'ocgo-src miss' }, t('dsh.loading')))
        }
        body.push(React.createElement('div', { key: 'srcs', className: 'ocgo-viewrow' },
          view === 'dsh'
            ? React.createElement('span', { className: 'ocgo-src ok' }, 'DSH 会话')
            : officialVd ? React.createElement('span', { className: 'ocgo-src ok' }, 'usage.list') : null,
          React.createElement('span', { className: 'ocgo-src ' + (d.quota && !d.quotaError ? 'ok' : 'miss'), title: d.quotaError || '' }, t('src.quota'))
        ))
        // 配额环形图:独立接口(auth.json key),官方明细不可用时也始终显示
        const z = qz
        const labels = { rolling: t('donut.rolling'), weekly: t('donut.weekly'), monthly: t('donut.month') }
        if (z && Object.keys(z).length) {
          // 多 key 池:key 切换标签行(★ = DSH 当前生效 key;⚠ = 该 key 查询失败)
          if (quotaKeys && quotaKeys.length > 1) {
            body.push(React.createElement('div', { key: 'keys', className: 'ocgo-viewrow', style: { flexWrap: 'wrap' } },
              quotaKeys.map((k) => React.createElement('button', {
                key: k.name,
                className: 'ocgo-seg-btn' + (curQ && curQ.name === k.name ? ' on' : ''),
                onClick: () => setQKey(k.name),
                title: k.error || (k.active ? t('fab.hint') : ''),
                style: { fontSize: 11 },
              }, (k.active ? '★ ' : '') + k.name + (k.error ? ' ⚠' : '')))
            ))
          }
          const donuts = []
          const windows = { rolling: 5 * 3600e3, weekly: 7 * 86400e3, monthly: 30 * 86400e3 }
          ;['rolling', 'weekly', 'monthly'].forEach((k) => {
            const q = z[k]
            if (q) donuts.push(React.createElement(Donut, { key: k, percent: q.percent, label: labels[k], resetsAt: q.resetsAt, status: q.status, t, pace: paceOf(q, Date.now(), windows[k]) }))
          })
          body.push(React.createElement('div', { key: 'quota', className: 'ocgo-quota' }, donuts))
        } else if (d.quotaError) {
          body.push(React.createElement('div', { key: 'quota-err', className: 'ocgo-err' },
            React.createElement('div', null, t('quota.err', { e: d.quotaError }))
          ))
        }
        // 配额告警条:当前 key 任一窗口 ≥90% 时面板顶部醒目提示
        if (z) {
          const hot = ['rolling', 'weekly', 'monthly'].map((k) => z[k] && z[k].percent >= 90 ? { k, p: z[k].percent } : null).filter(Boolean)
          if (hot.length) {
            body.push(React.createElement('div', { key: 'warn-banner', className: 'ocgo-err' },
              React.createElement('div', null, t('warn.banner', { s: hot.map((h) => labels[h.k] + ' ' + Math.round(h.p) + '%').join(' · ') }))
            ))
          }
        }
        // 明细板块:官方视图需官方明细就绪;DSH 视图用 DSH 会话数据
        if (vd && !(view === 'dsh' && dshLoading)) {
        // 环比:今日 vs 昨日(by_day 末项为今天,前一项为昨天)
        const vsd = (() => {
          const bd = vd.by_day
          if (!bd || bd.length < 2) return null
          const last = bd[bd.length - 1]
          const prev = bd[bd.length - 2]
          if (!last || !prev) return null
          const now = new Date()
          const p2 = (n) => String(n).padStart(2, '0')
          const todayKey = now.getFullYear() + '-' + p2(now.getMonth() + 1) + '-' + p2(now.getDate())
          if (last.date !== todayKey || !prev.cost_est) return null
          return ((vd.today.cost_est - prev.cost_est) / prev.cost_est) * 100
        })()
        const vsText = vsd == null ? null : (vsd > 0.5 ? t('stat.vsUp', { d: Math.round(vsd) }) : vsd < -0.5 ? t('stat.vsDown', { d: Math.round(vsd) }) : t('stat.vsFlat'))
        const vsColor = vsd != null && vsd > 0 ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-state-success-primary)'
        body.push(React.createElement('div', { key: 'stats', className: 'ocgo-stats' },
          React.createElement(Stat, { label: t('stat.today'), value: fmtUsd(vd.today.cost_est), sub: React.createElement('span', null,
            subReqs(vd.today.requests, vd.today.tokens_input + vd.today.tokens_output),
            vsText ? React.createElement('span', { style: { color: vsColor, fontWeight: 600 } }, ' · ' + vsText) : null
          ) }),
          React.createElement(Stat, { label: t('stat.month'), value: fmtUsd(vd.month.cost_est), sub: subReqs(vd.month.requests, vd.month.tokens_input + vd.month.tokens_output) }),
          React.createElement(Stat, { label: t('stat.total'), value: fmtUsd(vd.total.cost_est), sub: t('stat.tok', { i: fmtTokens(vd.total.tokens_input), o: fmtTokens(vd.total.tokens_output), c: fmtTokens(vd.total.tokens_cache_read) }) })
        ))
        // 按来源板块已移除:与顶部"数据源"徽标重复,且 provider 命名
        // (opencode vs opencode-go)易误导。来源信息以数据源徽标为准。
        if (vd.by_model && vd.by_model.length) {
          const maxC = Math.max.apply(null, vd.by_model.map((m) => m.cost_est)) || 1
          const rows = []
          vd.by_model.forEach((m) => {
            const expanded = expModel === m.model
            rows.push(React.createElement('div', { key: m.model, className: 'ocgo-mrow', onClick: () => setExpModel(expanded ? null : m.model), title: t('model.click') },
              React.createElement('span', { className: 'ocgo-mname', title: m.model }, m.model),
              React.createElement('div', { className: 'ocgo-mbar' },
                React.createElement('div', { className: 'ocgo-mbar-fill', style: { width: Math.max(2, (m.cost_est / maxC) * 100) + '%' } })),
              React.createElement('span', { className: 'ocgo-mreq' }, t('model.reqs', { n: n(m.requests), t: fmtTokens((m.tokens_in || 0) + (m.tokens_out || 0)) })),
              React.createElement('span', { className: 'ocgo-mcost' }, fmtUsd(m.cost_est))
            ))
            if (expanded) {
              const hasSplit = m.cost_in != null
              rows.push(React.createElement('div', { key: m.model + '-d', className: 'ocgo-mdetail' },
                hasSplit
                  ? React.createElement('span', null, t('model.split', { a: fmtUsd(m.cost_in), b: fmtUsd(m.cost_out), c: fmtUsd(m.cost_cr), d: fmtUsd(m.cost_cw) }))
                  : React.createElement('span', null, t('model.official')),
                React.createElement('span', null, t('model.tok', { i: fmtTokens(m.tokens_in || 0), o: fmtTokens(m.tokens_out || 0), c: fmtTokens(m.tokens_cr || 0), w: fmtTokens(m.tokens_cw || 0) })),
                React.createElement('span', null, t('model.src', { s: (m.providers || []).join(' / ') }))
              ))
            }
          })
          body.push(React.createElement('div', { key: 'models', className: 'ocgo-panel2' },
            React.createElement('div', { className: 'ocgo-ptitle' }, t('model.title', { n: vd.by_model.length })),
            rows
          ))
        }
        if (vd.by_day && vd.by_day.length) {
          const shown = vd.by_day.slice(-days)
          const maxD = Math.max.apply(null, shown.map((x) => x.cost_est)) || 1
          body.push(React.createElement('div', { key: 'days', className: 'ocgo-panel2' },
            React.createElement('div', { className: 'ocgo-viewrow' },
              React.createElement('div', { className: 'ocgo-ptitle' }, t('trend.title')),
              React.createElement('span', { className: 'ocgo-spacer' }),
              React.createElement('div', { className: 'ocgo-seg' },
                React.createElement('button', { className: 'ocgo-seg-btn' + (days === 7 ? ' on' : ''), onClick: () => setDays(7) }, t('trend.7d')),
                React.createElement('button', { className: 'ocgo-seg-btn' + (days === 14 ? ' on' : ''), onClick: () => setDays(14) }, t('trend.14d')),
                React.createElement('button', { className: 'ocgo-seg-btn' + (days === 30 ? ' on' : ''), onClick: () => setDays(30) }, t('trend.30d'))
              )
            ),
            React.createElement('div', { className: 'ocgo-days' },
              shown.map((x) => React.createElement('div', { key: x.date, className: 'ocgo-day', title: t('trend.day', { d: x.date, n: n(x.requests), c: fmtUsd(x.cost_est) }) },
                React.createElement('div', { className: 'ocgo-day-fill', style: { height: Math.max(3, (x.cost_est / maxD) * 100) + '%' } }),
                React.createElement('span', { className: 'ocgo-day-lbl' }, x.date.slice(5))
              ))
            )
          ))
        }
        if (vd.recent && vd.recent.length) {
          body.push(React.createElement('div', { key: 'recent', className: 'ocgo-panel2' },
            React.createElement('div', { className: 'ocgo-ptitle' }, t('recent.title')),
            vd.recent.map((s) => React.createElement('div', { key: s.id, className: 'ocgo-srow', title: s.title || '' },
              React.createElement('span', { className: 'ocgo-sname' }, s.title || t('recent.none')),
              React.createElement('span', { className: 'ocgo-stime' }, fmtTime(s.updated)),
              React.createElement('span', { className: 'ocgo-scost' }, fmtUsd(s.cost_est))
            ))
          ))
        }
        const foot = [
          React.createElement('span', { key: 'src' }, view === 'dsh'
            ? t('foot.src.dsh') + (vd.matchedOfficial ? ' · ' + t('foot.matched', { n: vd.matchedOfficial }) : '') + ' · ' + t('foot.est')
            : t('foot.official', { t: stamp ? fmtTime(stamp) : '—' }) + (official && official.truncated ? ' · ' + t('foot.officialTrunc') : '')),
          React.createElement('span', { key: 'upd' }, t('foot.upd', { t: stamp ? fmtTime(stamp) : '—' })),
          React.createElement('span', { key: 'int' }, t('foot.int'))
        ].filter(Boolean)
        // 官方配额 vs 本地明细:仅信息展示,不再判对错——
        // 配额接口的 percent 按"用量单位"计(部分模型限时 2×,实测 monthly
        // 33%×$60=$19.80 而同一窗口的美元明细仅 $9.71,差约 2 倍),与 usage.list
        // 的逐请求美元明细不是同一计量基准,百分比×$60 换算出的"金额"只是
        // 参考值,直接对比并标红是误报(实测差值 17%+ 恒触发 warn)。
        const qm = curQ && curQ.windows && curQ.windows.monthly
        if (view !== 'dsh' && qm && qm.percent != null && vd && vd.month && vd.month.cost_est != null) {
          const officialEst = (qm.percent / 100) * 60
          foot.push(React.createElement('span', {
            key: 'recon',
            title: t('foot.reconTitle', { d: fmtUsd(officialEst - vd.month.cost_est) }),
          }, t('foot.recon', { o: fmtUsd(officialEst), l: fmtUsd(vd.month.cost_est) })))
        }
        // 更新提示:host 检测到 GitHub 有更新时显示(6h 节流,失败静默)
        const upd = d && d.update
        if (upd) {
          foot.push(React.createElement('span', { key: 'update', className: 'ocgo-warn', title: t('update.available', upd) }, t('update.available', upd)))
        }
        body.push(React.createElement('div', { key: 'foot', className: 'ocgo-foot' }, foot))
        } // /if (vd) 明细板块
      }

      return React.createElement('div', { className: 'ocgo-panel' + (maximized ? ' ocgo-max' : ''), style: panelStyle },
        React.createElement('div', { className: 'ocgo-titlebar', onMouseDown: onTitleDown, onDoubleClick: toggleMax },
          React.createElement('span', { className: 'ocgo-title' }, t('title')),
          React.createElement('span', { className: 'ocgo-spacer' }),
          React.createElement('button', { className: 'ocgo-ibtn', onClick: toggleLang, title: t('lang.switch') + ' (' + (lang === 'zh' ? '中文' : 'English') + ')' }, React.createElement(Icon, { name: 'lang' })),
          React.createElement('button', { className: 'ocgo-ibtn', onClick: exportCsv, title: t('btn.exportTitle') }, React.createElement(Icon, { name: 'export' })),
          React.createElement('button', { className: 'ocgo-ibtn', onClick: reload, title: t('btn.refresh') }, React.createElement(Icon, { name: 'refresh' })),
          React.createElement('button', { className: 'ocgo-ibtn', onClick: toggleMax, title: maximized ? t('btn.restore') : t('btn.max') }, React.createElement(Icon, { name: maximized ? 'restore' : 'max' })),
          React.createElement('button', { className: 'ocgo-ibtn', onClick: () => setOpen(false), title: t('btn.close') }, React.createElement(Icon, { name: 'close' }))
        ),
        React.createElement('div', { className: 'ocgo-body' }, body),
        React.createElement('div', { className: 'ocgo-edge-e', onMouseDown: (e) => onResizeDown(e, 'e'), title: t('resize.e') }),
        React.createElement('div', { className: 'ocgo-edge-s', onMouseDown: (e) => onResizeDown(e, 's'), title: t('resize.s') }),
        React.createElement('div', { className: 'ocgo-resize', onMouseDown: (e) => onResizeDown(e, 'se'), title: t('resize.se') })
      )
    }

    slots.inject('shell.overlay', () => slots.register(
      { name: 'shell.overlay', id: 'ocgo-usage-overlay', order: 50 },
      () => React.createElement(UsagePanel)
    ))
  }
}
