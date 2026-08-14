window.__ModuleLoader__.load({
  id: "dsh-opencode-go-usage",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    // src 面向动态沙箱(React 是闭包符号);bundle 工厂里从模块表取 react。
    let React = require("react");
function apply(ctx) {
    const slots = ctx.get('slots')
    const timer = ctx.get('timer')
    const localeSvc = ctx.get('locale')
    if (slots === undefined) return

    // ---- 中英字典 ----
    const I18N = {
      zh: {
        'title': 'OpenCode Go 用量',
        'view.all': '全部',
        'view.dsh': 'DSH',
        'srcs.title': '数据源',
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
        'foot.src.all': 'DSH + opencode 官方记录 + codex(Go key)',
        'foot.est': '金额: 官方 cost + 定价估算',
        'foot.upd': '更新 {t}',
        'foot.int': '60s 自动刷新',
        'foot.ocgoErr': 'opencode 记录不可用: {e}',
        'foot.codexErr': 'codex 记录不可用: {e}',
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
        'view.all': 'All',
        'view.dsh': 'DSH',
        'srcs.title': 'Sources',
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
        'foot.src.all': 'DSH + opencode records + codex (Go key)',
        'foot.est': 'Cost: official + estimated',
        'foot.upd': 'Updated {t}',
        'foot.int': 'Auto-refresh 60s',
        'foot.ocgoErr': 'opencode records unavailable: {e}',
        'foot.codexErr': 'codex records unavailable: {e}',
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
.ocgo-ibtn { background: none; border: none; cursor: pointer; color: var(--dsw-alias-label-secondary); font-size: 12px; padding: 2px 6px; border-radius: 6px; line-height: 1; }
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
          if (s && typeof s === 'object') return s
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
    function quotaColor(p) {
      if (p >= 90) return 'var(--dsw-alias-state-error-primary)'
      if (p >= 70) return 'var(--dsw-alias-state-warn-primary)'
      return 'var(--dsw-alias-state-success-primary)'
    }
    function Donut(props) {
      const p = Math.max(0, Math.min(100, props.percent || 0))
      const r = 28
      const c = 2 * Math.PI * r
      return React.createElement('div', { className: 'ocgo-donut-wrap' },
        React.createElement('svg', { className: 'ocgo-donut', viewBox: '0 0 76 76' },
          React.createElement('circle', { cx: 38, cy: 38, r, fill: 'none', stroke: 'var(--dsw-alias-bg-layer-2)', strokeWidth: 9 }),
          React.createElement('circle', { cx: 38, cy: 38, r, fill: 'none', stroke: quotaColor(p), strokeWidth: 9, strokeLinecap: 'round', strokeDasharray: (p / 100) * c + ' ' + c, transform: 'rotate(-90 38 38)', style: { transition: 'stroke-dasharray .5s ease' } }),
          React.createElement('text', { x: 38, y: 35, textAnchor: 'middle', className: 'ocgo-donut-val' }, Math.round(p) + '%'),
          React.createElement('text', { x: 38, y: 48, textAnchor: 'middle', className: 'ocgo-donut-lbl' }, props.label)
        ),
        React.createElement('span', { className: 'ocgo-donut-time' }, props.resetsAt
          ? props.t('donut.resets', { t: fmtTime(new Date(props.resetsAt).getTime()) })
          : props.t('donut.resetsUnknown'))
      )
    }
    function Stat(props) {
      return React.createElement('div', { className: 'ocgo-stat' },
        React.createElement('div', { className: 'ocgo-stat-label' }, props.label),
        React.createElement('div', { className: 'ocgo-stat-value' }, props.value),
        props.sub ? React.createElement('div', { className: 'ocgo-stat-sub' }, props.sub) : null
      )
    }

    function UsagePanel() {
      const saved = loadState()
      const [state, setState] = React.useState({ loading: true, data: null, error: null })
      const [view, setView] = React.useState('all')
      const [days, setDays] = React.useState(14)
      const [open, setOpen] = React.useState(false)
      const [pos, setPos] = React.useState(saved ? saved.pos || null : null)
      const [size, setSize] = React.useState(saved ? saved.size || null : null)
      const [maximized, setMaximized] = React.useState(saved ? !!saved.maximized : false)
      const [fabPos, setFabPos] = React.useState(saved ? saved.fabPos || null : null)
      const [expModel, setExpModel] = React.useState(null)
      const [stamp, setStamp] = React.useState(0)
      const [tick, setTick] = React.useState(0)
      // 语言:本地记忆优先,否则跟随 DSH 全局 locale(未手动选择时订阅其变化)
      const [lang, setLang] = React.useState(() => {
        try {
          const savedLang = window.localStorage.getItem(LS_LANG)
          if (savedLang === 'zh' || savedLang === 'en') return savedLang
        } catch (e) { /* storage unavailable */ }
        const id = (localeSvc && typeof localeSvc.getLocale === 'function' && localeSvc.getLocale().id) || ''
        return /^zh/i.test(String(id)) ? 'zh' : 'en'
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
        async function load() {
          if (inFlight) return
          inFlight = true
          try {
            let r
            // 动态模式走 host.call(harness 桥);bundle 模式走 webServer 本地路由。
            if (typeof host !== 'undefined' && host && typeof host.call === 'function') {
              r = await host.call('ocgo-usage:fetch')
            } else {
              const res = await fetch('/ocgo-usage/fetch')
              if (!res.ok) throw new Error(t('err.local', { s: res.status }))
              r = await res.json()
            }
            if (!alive) return
            if (r && r.ok) {
              setState({ loading: false, data: r, error: null })
              setStamp(Date.now())
            } else {
              setState({ loading: false, data: null, error: (r && r.error) || 'unknown error' })
            }
          } catch (e) {
            if (alive) setState({ loading: false, data: null, error: String((e && e.message) || e) })
          } finally {
            inFlight = false
          }
        }
        if (open || !state.data) load()
        // 只在面板打开时轮询:关闭状态不发起全量聚合(会话扫描 + python + curl 开销大)
        let disposer = null
        if (open && timer) disposer = timer.interval(load, 60000)
        return () => { alive = false; if (disposer) disposer() }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [tick, open])

      function reload() { setState({ loading: true, data: null, error: null }); setTick((t) => t + 1) }

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
          last = { x: bx + ev.clientX - sx, y: by + ev.clientY - sy }
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
      const vd = (d && (view === 'dsh' ? d.dsh : d.all)) || null
      const total = vd ? vd.total : null
      const pct = (v) => (v == null ? null : Math.round(v))
      const qz = d && d.quota
      const rollPct = qz && qz.rolling ? qz.rolling.percent : null
      const fabTitle = t('title') + ' · ' + t('fab.rolling', { p: rollPct != null ? pct(rollPct) : '—' }) +
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
        total ? React.createElement('span', { style: { fontWeight: 800 } }, fmtUsd(total.cost_est)) : null,
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
      } else if (vd) {
        body.push(React.createElement('div', { key: 'views', className: 'ocgo-viewrow' },
          React.createElement('div', { className: 'ocgo-seg' },
            React.createElement('button', { className: 'ocgo-seg-btn' + (view === 'dsh' ? ' on' : ''), onClick: () => setView('dsh') }, 'DSH'),
            React.createElement('button', { className: 'ocgo-seg-btn' + (view === 'all' ? ' on' : ''), onClick: () => setView('all') }, t('view.all'))
          ),
          React.createElement('span', { className: 'ocgo-spacer' })
        ))
        body.push(React.createElement('div', { key: 'srcs', className: 'ocgo-viewrow' },
          React.createElement('span', { className: 'ocgo-ptitle' }, t('srcs.title')),
          React.createElement('span', { className: 'ocgo-src ok' }, 'DSH'),
          React.createElement('span', { className: 'ocgo-src ' + (d.ocgoAvailable ? 'ok' : 'miss'), title: d.ocgoError || '' }, 'opencode'),
          React.createElement('span', { className: 'ocgo-src ' + (d.codexAvailable ? 'ok' : 'miss'), title: d.codexError || '' }, 'codex'),
          React.createElement('span', { className: 'ocgo-src ' + (d.quota && !d.quotaError ? 'ok' : 'miss'), title: d.quotaError || '' }, t('src.quota'))
        ))
        body.push(React.createElement('div', { key: 'stats', className: 'ocgo-stats' },
          React.createElement(Stat, { label: t('stat.today'), value: fmtUsd(vd.today.cost_est), sub: subReqs(vd.today.requests, vd.today.tokens_input + vd.today.tokens_output) }),
          React.createElement(Stat, { label: t('stat.month'), value: fmtUsd(vd.month.cost_est), sub: subReqs(vd.month.requests, vd.month.tokens_input + vd.month.tokens_output) }),
          React.createElement(Stat, { label: t('stat.total'), value: fmtUsd(vd.total.cost_est), sub: t('stat.tok', { i: fmtTokens(vd.total.tokens_input), o: fmtTokens(vd.total.tokens_output), c: fmtTokens(vd.total.tokens_cache_read) }) })
        ))
        const z = d.quota
        if (z && !z.error && Object.keys(z).length) {
          const donuts = []
          const labels = { rolling: t('donut.rolling'), weekly: t('donut.weekly'), monthly: t('donut.month') }
          ;['rolling', 'weekly', 'monthly'].forEach((k) => {
            const q = z[k]
            if (q) donuts.push(React.createElement(Donut, { key: k, percent: q.percent, label: labels[k], resetsAt: q.resetsAt, t }))
          })
          body.push(React.createElement('div', { key: 'quota', className: 'ocgo-quota' }, donuts))
        } else if (d.quotaError) {
          body.push(React.createElement('div', { key: 'quota-err', className: 'ocgo-err' },
            React.createElement('div', null, t('quota.err', { e: d.quotaError }))
          ))
        }
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
          React.createElement('span', { key: 'src' }, view === 'dsh' ? t('foot.src.dsh') : t('foot.src.all')),
          React.createElement('span', { key: 'est' }, t('foot.est')),
          React.createElement('span', { key: 'upd' }, t('foot.upd', { t: stamp ? fmtTime(stamp) : '—' })),
          React.createElement('span', { key: 'int' }, t('foot.int'))
        ]
        if (d.ocgoError) {
          foot.push(React.createElement('span', { key: 'warn', className: 'ocgo-warn' }, t('foot.ocgoErr', { e: d.ocgoError })))
        }
        if (d.codexError) {
          foot.push(React.createElement('span', { key: 'warn2', className: 'ocgo-warn' }, t('foot.codexErr', { e: d.codexError })))
        }
        body.push(React.createElement('div', { key: 'foot', className: 'ocgo-foot' }, foot))
      }

      return React.createElement('div', { className: 'ocgo-panel' + (maximized ? ' ocgo-max' : ''), style: panelStyle },
        React.createElement('div', { className: 'ocgo-titlebar', onMouseDown: onTitleDown, onDoubleClick: toggleMax },
          React.createElement('span', { className: 'ocgo-title' }, t('title')),
          React.createElement('span', { className: 'ocgo-spacer' }),
          React.createElement('button', { className: 'ocgo-ibtn', onClick: toggleLang, title: t('lang.switch') }, lang === 'zh' ? 'EN' : '中'),
          React.createElement('button', { className: 'ocgo-ibtn', onClick: reload, title: t('btn.refresh') }, t('btn.refresh')),
          React.createElement('button', { className: 'ocgo-ibtn', onClick: toggleMax, title: maximized ? t('btn.restore') : t('btn.max') }, maximized ? t('btn.restore') : t('btn.max')),
          React.createElement('button', { className: 'ocgo-ibtn', onClick: () => setOpen(false), title: t('btn.close') }, t('btn.close'))
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
    exports.name = "opencode-go-usage-client";
    exports.apply = apply;
    return module.exports;
  }
});
