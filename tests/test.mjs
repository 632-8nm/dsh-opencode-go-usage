// dsh-opencode-go-usage 自动化测试(纯 Node,无外部依赖)
//
// 用 Node 内置 test runner 直接执行真实的构建产物(lib/index.js、lib/client.js),
// 覆盖:
//   1. lib/index.js 的 host ESM 导出契约
//   2. 动态模式:harness.handle 注册 + 全量聚合(DSH 会话 + opencode + codex + 配额)
//   3. 静态模式:无 harness 时 apply 干净退出、不注册 handler、不抛错
//   4. lib/client.js 的浏览器注册形态(经典 script 语义 + 工厂 require(react))
//   5. 聚合逻辑的边界(空数据、time=0、免费模型、价格前缀归一)
//
// 运行:`node --test` 或 `npm test`
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createContext, runInContext } from 'node:vm'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const HOST_URL = pathToFileURL(join(root, 'lib', 'index.js'))

// ---------------------------------------------------------------------------
// 测试隔离:lib/index.js 的 fs 访问全部经 os.homedir()(每次调用读环境变量),
// 套件把 USERPROFILE/HOME 重定向到临时目录——磁盘缓存、凭据配置、诊断日志
// 全部落在临时 HOME,绝不触碰真实用户文件(此前把真实缓存移开再还原,且
// ocgoLog 会把测试噪声写进真实 ~/.config 日志)。
// ---------------------------------------------------------------------------
const FAKE_HOME = mkdtempSync(join(tmpdir(), 'ocgo-test-home-'))
const SAVED_HOME_ENV = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME }
const DISK_CACHE = join(FAKE_HOME, '.config', 'dsh-opencode-go-usage-official.json')
test.before(() => {
  process.env.USERPROFILE = FAKE_HOME
  process.env.HOME = FAKE_HOME
})
test.after(() => {
  try {
    if (SAVED_HOME_ENV.USERPROFILE === undefined) delete process.env.USERPROFILE
    else process.env.USERPROFILE = SAVED_HOME_ENV.USERPROFILE
    if (SAVED_HOME_ENV.HOME === undefined) delete process.env.HOME
    else process.env.HOME = SAVED_HOME_ENV.HOME
  } catch (e) { /* 还原失败仅记录 */ }
  rmSync(FAKE_HOME, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// 工具:构造一次 apply 调用环境,可注入 fake services,并捕获 harness.handle
// ---------------------------------------------------------------------------
function makeHostEnv({ dynamic = true, sessions = [], officialResult = null } = {}) {
  const handlers = new Map()
  const fakeHarness = { handle: (method, fn) => { handlers.set(method, fn); return () => handlers.delete(method) } }
  // 动态模式模拟:dsh-cordis-host-runner 沙箱把 harness/btoa 作为全局。
  if (dynamic) globalThis.harness = fakeHarness
  else delete globalThis.harness
  globalThis.btoa = typeof globalThis.btoa === 'function' ? globalThis.btoa : (s) => Buffer.from(s, 'binary').toString('base64')

  const shellCalls = []
  const shell = {
    resolve: (req) => ({ ...req }),
    run: async (spec) => {
      shellCalls.push(spec.command)
      // 配额命令(含 /zen/go/v1/usage)→ 返回配额 JSON
      if (spec.command.includes('zen/go/v1/usage')) {
        return { exitCode: 0, stdout: { text: JSON.stringify({ usage: { rolling: { percent: 30, status: 'ok', resetsAt: 1787000000000 }, weekly: { percent: 12, status: 'ok', resetsAt: 1787000000000 } } }) }, stderr: { text: '' } }
      }
      // 官方 usage.list(mock,避免测试联网):默认空记录,可注入失败结果
      const payload = officialResult ?? { ok: true, records: [], truncated: false }
      return { exitCode: 0, stdout: { text: JSON.stringify(payload) }, stderr: { text: '' } }
    },
  }

  const titleSnap = (id, title) => ({ sessionId: id, status: 'fulfilled', value: { title: { title } } })
  const sessionQuery = {
    listSessions: async () => sessions.map((s) => ({ header: { id: s.id }, live: true, persisted: true })),
    readTitleSnapshots: async (ids) => sessions.map((s) => titleSnap(s.id, s.title)),
    readSession: async (id) => {
      const s = sessions.find((x) => x.id === id)
      return { session: { id }, events: s ? s.events : [] }
    },
  }

  const effects = []
  const ctx = {
    get: (name) => (name === 'shell' ? shell : name === 'sessionQuery' ? sessionQuery : undefined),
    effect: (fn) => { effects.push(fn); const d = fn(); return d },
  }
  return { ctx, shellCalls, handlers, effects, fakeHarness }
}

function mkUsage(overrides = {}) {
  return { inputTokens: 100, outputTokens: 50, cacheReadTokens: 10, cacheWriteTokens: 5, reasoningTokens: 3, ...overrides }
}
function mkAssistantEvent(model, provider = 'opencode-go', usage) {
  return { type: 'assistant/message', time: Date.now(), data: { usage, message: { source: { kind: 'model', model, provider } } } }
}

// ---------------------------------------------------------------------------
// 1. host ESM 导出契约
// ---------------------------------------------------------------------------
test('lib/index.js 导出 host ESM 契约(name/apply)', async () => {
  const m = await import(HOST_URL)
  assert.equal(m.name, 'opencode-go-usage')
  assert.equal(typeof m.apply, 'function')
})

// ---------------------------------------------------------------------------
// 2. 动态模式:注册 + 全量聚合 DSL 会话已含,opencode/codex 注入
// ---------------------------------------------------------------------------
test('动态模式:注册 ocgo-usage:fetch 并正确聚合多数据源', async () => {
  const sessions = [
    { id: 's1', title: '会话一', events: [mkAssistantEvent('deepseek-ai/deepseek-v4-flash', 'opencode-go', mkUsage({ inputTokens: 100, outputTokens: 50, cacheReadTokens: 10 }))] },
    { id: 's2', title: null, events: [mkAssistantEvent('deepseek-v4-pro', 'opencode-go', mkUsage({ inputTokens: 200 }))] },
  ]
  const env = makeHostEnv({ dynamic: true, sessions })
  const m = await import(HOST_URL)
  m.apply(env.ctx)

  const handle = env.handlers.get('ocgo-usage:fetch')
  assert.ok(handle, '应注册 ocgo-usage:fetch')
  const data = await handle(null)
  assert.equal(data.ok, true)

  // DSH 会话分析:两笔 opencode-go(本地三源已移除,不再注入 opencode/codex)
  assert.equal(data.dsh.total.requests, 2)
  assert.equal(data.dsh.today.requests, 2)
  assert.ok(typeof data.dsh.total.cost_est === 'number')

  // 模型排行按 cost 降序
  assert.ok(data.dsh.by_model.length >= 1)
  const costs = data.dsh.by_model.map((x) => x.cost_est)
  assert.deepEqual(costs, [...costs].sort((a, b) => b - a), 'by_model 应按 cost 降序')

  // 配额解析
  assert.equal(data.quota.rolling.percent, 30)
  assert.equal(data.quotaError, null)

  // 官方明细:首次调用可能是 loading(后台拉取中)或已完成的 mock 空数据
  assert.ok(data.official, '应包含 official 字段')
  assert.ok(data.official.ok || data.official.loading, 'official 应为数据或加载中')

  // 两次调用:45s 缓存应复用同一对象(并发去重也生效)
  const again = await handle(null)
  assert.equal(again, data, '45s 缓存内应返回同一对象')
})

test('官方失败 60s 冷却:不重复全量抓取,冷却过后自动重试', async () => {
  const realNow = Date.now
  let now = realNow()
  Date.now = () => now
  try {
    const env = makeHostEnv({ dynamic: true, sessions: [], officialResult: { ok: false, error: 'mock-offline' } })
    const m = await import(HOST_URL)
    m.apply(env.ctx)
    const handle = env.handlers.get('ocgo-usage:fetch')
    const officialRuns = () => env.shellCalls.filter((c) => c.includes('base64') && !c.includes('zen/go/v1/usage')).length

    // t0:首次拉取,官方在后台失败(响应为 loading;等后台落定)
    const d0 = await handle(null)
    assert.equal(d0.official.ok, false)
    await new Promise((r) => setTimeout(r, 10))
    assert.equal(officialRuns(), 1, '首次应执行一次官方抓取')
    const afterFirst = officialRuns()

    // t0+50s:越过 45s 聚合缓存,仍在 60s 失败冷却内 → 不再执行官方脚本,错误透传
    now += 50_000
    const d1 = await handle(null)
    assert.equal(d1.official.ok, false)
    assert.equal(d1.official.error, 'mock-offline', '错误应原样透传面板展示')
    assert.equal(officialRuns(), afterFirst, '冷却期内不得重复全量抓取')

    // t0+100s:再越过 45s 聚合缓存(冷却已过期)→ 自动重试一次
    now += 50_000
    await handle(null)
    assert.equal(officialRuns(), afterFirst + 1, '冷却过期后应自动重试')
  } finally {
    Date.now = realNow
  }
})

// ---------------------------------------------------------------------------
// 2b. 官方失败冷却(续):重试成功后恢复正常数据流
// ---------------------------------------------------------------------------
test('官方抓取成功后 official 变为可用数据(冷却被清除)', async () => {
  const realNow = Date.now
  let now = realNow()
  Date.now = () => now
  try {
    let fail = true
    const env = makeHostEnv({ dynamic: true, sessions: [], officialResult: null })
    // 第一次返回失败,之后返回成功(空记录)
    const shell = env.ctx.get('shell')
    const origRun = shell.run
    shell.run = async (spec) => {
      if (spec.command.includes('base64') && !spec.command.includes('zen/go/v1/usage') && fail) {
        return { exitCode: 0, stdout: { text: JSON.stringify({ ok: false, error: 'mock-offline' }) }, stderr: { text: '' } }
      }
      return origRun(spec)
    }
    const m = await import(HOST_URL)
    m.apply(env.ctx)
    const handle = env.handlers.get('ocgo-usage:fetch')

    // t0:首次拉取,官方在后台失败
    await handle(null)
    await new Promise((r) => setTimeout(r, 10))
    now += 70_000 // 越过 45s 聚合缓存 + 60s 失败冷却
    fail = false
    await handle(null) // 触发自动重试(后台)
    await new Promise((r) => setTimeout(r, 10))
    now += 50_000 // 越过 45s 聚合缓存,让重试结果进入响应
    const d2 = await handle(null)
    assert.equal(d2.official.ok, true, '重试成功后 official 应为可用数据')
    assert.equal(d2.official.truncated, false)
  } finally {
    Date.now = realNow
  }
})

test('增量:磁盘缓存缺失时回退全量重抓(15min 节流,不静默停摆)', async () => {
  const realNow = Date.now
  let now = realNow()
  Date.now = () => now
  try {
    const env = makeHostEnv({ dynamic: true, sessions: [] })
    const m = await import(HOST_URL)
    m.apply(env.ctx)
    const handle = env.handlers.get('ocgo-usage:fetch')
    const officialRuns = () => env.shellCalls.filter((c) => c.includes('base64') && !c.includes('zen/go/v1/usage')).length

    // t0:无内存/磁盘缓存 → 首次全量(模拟磁盘缺失:python 未落盘)
    await handle(null)
    await new Promise((r) => setTimeout(r, 10))
    assert.equal(officialRuns(), 1)
    assert.equal(existsSync(DISK_CACHE), false, '用例前提:磁盘缓存不存在')

    // t0+50s:内存有 ok 数据但磁盘缺失 → 增量无基准,应回退全量重抓(不静默跳过)
    now += 50_000
    const d1 = await handle(null)
    assert.equal(d1.official.ok, true)
    await new Promise((r) => setTimeout(r, 10))
    assert.equal(officialRuns(), 2, '磁盘缺失时增量应回退全量重抓,不得静默停摆')

    // t0+100s:仍在 15min 回退节流内 → 不再重复全量
    now += 50_000
    await handle(null)
    assert.equal(officialRuns(), 2, '回退全量 15min 节流期内不得重复')
  } finally {
    Date.now = realNow
  }
})

test('增量:截断的磁盘缓存触发一次强制全量重建(12h 节流,之后走普通增量)', async () => {
  const realNow = Date.now
  let now = realNow()
  Date.now = () => now
  try {
    // 假磁盘缓存:truncated=true(旧版 150 页截断遗留的数据形态)
    const fake = {
      at: now - 3600e3,
      truncated: true,
      records: [
        { ts: '08/16/2026 03:00:00', model: 'deepseek-v4-flash', ti: 100, to: 50, rt: 0, cr: 10, cost: 123 },
        { ts: '08/16/2026 02:00:00', model: 'deepseek-v4-pro', ti: 200, to: 80, rt: 0, cr: 0, cost: 456 },
      ],
    }
    mkdirSync(join(FAKE_HOME, '.config'), { recursive: true })
    writeFileSync(DISK_CACHE, JSON.stringify(fake), 'utf8')
    const env = makeHostEnv({ dynamic: true, sessions: [] })
    const m = await import(HOST_URL)
    m.apply(env.ctx)
    const handle = env.handlers.get('ocgo-usage:fetch')
    const officialRuns = () => env.shellCalls.filter((c) => c.includes('base64') && !c.includes('zen/go/v1/usage')).length

    // t0:读到截断缓存 → 强制全量重建(不带 OCGO_LAST_TS)
    const d0 = await handle(null)
    assert.equal(d0.official.ok, true)
    await new Promise((r) => setTimeout(r, 10))
    assert.equal(officialRuns(), 1, '截断缓存应触发一次强制全量重建')
    assert.ok(!env.shellCalls.some((c) => c.includes('OCGO_LAST_TS')), '强制重建应是全量(无 LAST)')

    // t0+50s:12h 节流内 → 不重复强制,改走普通增量(带 OCGO_LAST_TS)
    now += 50_000
    const d1 = await handle(null)
    assert.equal(d1.official.ok, true)
    await new Promise((r) => setTimeout(r, 10))
    assert.equal(officialRuns(), 2, '节流期内应走普通增量')
    assert.ok(env.shellCalls.some((c) => c.includes('OCGO_LAST_TS')), '普通增量应携带 OCGO_LAST_TS')
  } finally {
    Date.now = realNow
  }
})

test('口径:DSH 源只统计 opencode-go provider,其它 provider 被排除', async () => {
  const sessions = [
    // deepseek 直连(非 Go key)→ 应被排除
    { id: 's1', title: '直连', events: [mkAssistantEvent('deepseek-v4-flash', 'deepseek', mkUsage({ inputTokens: 100000 }))] },
    // opencode-go → 应计入
    { id: 's2', title: 'Go', events: [mkAssistantEvent('deepseek-v4-flash', 'opencode-go', mkUsage({ inputTokens: 100 }))] },
    // 无 source(unknown)→ 应被排除
    { id: 's3', title: '无来源', events: [{ type: 'assistant/message', time: Date.now(), data: { usage: mkUsage({ inputTokens: 50000 }) } }] },
  ]
  const env = makeHostEnv({ dynamic: true, sessions })
  const m = await import(HOST_URL)
  m.apply(env.ctx)
  const data = await env.handlers.get('ocgo-usage:fetch')(null)
  // DSH 视图只有 opencode-go 那 1 笔;deepseek 直连与无来源均不计入
  assert.equal(data.dsh.total.requests, 1)
})

// ---------------------------------------------------------------------------
// 3. 静态模式:无 harness 时干净退出
// ---------------------------------------------------------------------------
test('静态模式:无 harness 时 apply 干净退出且不注册 handler', async () => {
  const env = makeHostEnv({ dynamic: false, sessions: [] })
  const m = await import(HOST_URL)
  m.apply(env.ctx) // 不应抛错
  assert.equal(env.handlers.size, 0, '静态模式不应注册任何 handler')
})

// ---------------------------------------------------------------------------
// 4. 客户端 bundle 注册形态
// ---------------------------------------------------------------------------
test('lib/client.js 以注册形态加载并可 materialize', async () => {
  const client = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
  assert.ok(client.startsWith('window.__ModuleLoader__.load({'), '必须以注册形态开头')

  let registered
  const sandbox = createContext({
    window: { __ModuleLoader__: { load: (h) => { registered = h } } },
    Symbol, Object,
  })
  runInContext(client, sandbox) // 经典 script 语义:顶层无 export
  assert.equal(registered.id, 'dsh-opencode-go-usage')
  assert.equal(typeof registered.factory, 'function')

  const React = { createElement: () => ({}) }
  const mod = registered.factory((spec) => { if (spec === 'react') return React; throw new Error('unexpected require ' + spec) })
  assert.equal(mod.name, 'opencode-go-usage-client')
  assert.equal(typeof mod.apply, 'function')
})

test('客户端 apply 在空上下文(无 slots)时干净返回', async () => {
  const client = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
  let registered
  const sandbox = createContext({ window: { __ModuleLoader__: { load: (h) => { registered = h } } }, Symbol, Object })
  runInContext(client, sandbox)
  const React = { createElement: () => ({}) }
  const mod = registered.factory((spec) => spec === 'react' ? React : null)
  const ctx = { get: () => undefined }
  assert.doesNotThrow(() => mod.apply(ctx))
})

// ---------------------------------------------------------------------------
// 5. 聚合边界(通过 host 的 buildView 真实代码验证)
// ---------------------------------------------------------------------------
test('聚合:空 DSH 数据时不含 NaN,by_day 完整', async () => {
  const env = makeHostEnv({ dynamic: true, sessions: [] })
  const m = await import(HOST_URL)
  m.apply(env.ctx)
  const data = await env.handlers.get('ocgo-usage:fetch')(null)
  assert.equal(data.dsh.total.requests, 0) // DSH 空
  assert.ok(Number.isFinite(data.dsh.total.cost_est))
  assert.ok(Number.isFinite(data.dsh.month.cost_est))
  assert.ok(data.dsh.by_day.length === 30)
  for (const d of data.dsh.by_day) assert.equal(typeof d.cost_est, 'number')
})

// 时间戳为 0 的记录不应制造 NaN
test('聚合:time=0 的记录不产生 Invalid/NaN 时间桶', async () => {
  const sessions = [{ id: 's0', title: null, events: [{ type: 'assistant/message', time: 0, data: { usage: mkUsage(), message: { source: { model: 'deepseek-v4-flash', provider: 'opencode-go' } } } }] }]
  const env = makeHostEnv({ dynamic: true, sessions })
  const m = await import(HOST_URL)
  m.apply(env.ctx)
  const data = await env.handlers.get('ocgo-usage:fetch')(null)
  // DSH 的 time=0 那笔计入累计,且总 cost 为有限数
  assert.equal(data.dsh.total.requests, 1)
  assert.ok(Number.isFinite(data.dsh.total.cost_est))
  // 近 30 天柱状图 cost_est 全部为有限数(1970 桶不在窗口内,不应出现 NaN)
  for (const d of data.dsh.by_day) assert.equal(typeof d.cost_est, 'number')
})

// ---------------------------------------------------------------------------
// 6. i18n:zh/en 字典键完全对齐,产物含切换逻辑
// ---------------------------------------------------------------------------
test('i18n:中英字典键完全一致且产物含语言切换逻辑', () => {
  const src = readFileSync(join(root, 'src', 'client.js'), 'utf8')
  const zhBlock = src.match(/zh: \{([\s\S]*?)\n      \},/)
  const enBlock = src.match(/en: \{([\s\S]*?)\n    \}/)
  assert.ok(zhBlock && enBlock, '应能提取 zh/en 字典块')
  const keysOf = (block) => [...block.matchAll(/'([^']+)':/g)].map((m) => m[1]).sort()
  const zhKeys = keysOf(zhBlock[1])
  const enKeys = keysOf(enBlock[1])
  assert.deepEqual(zhKeys, enKeys, 'zh/en 字典键必须一一对应(防止漏翻译)')
  assert.ok(zhKeys.length >= 30, '字典应有足够条目(当前 ' + zhKeys.length + ')')

  const client = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
  assert.ok(client.includes("'lang.switch'"), '产物应包含语言切换文案键')
  assert.ok(client.includes('toggleLang'), '产物应包含 toggleLang 切换逻辑')
  assert.ok(client.includes('ocgo-lang-v1'), '产物应持久化语言选择')
})

// ---------------------------------------------------------------------------
// 7. 官方账户级源(usage.list)就位
// ---------------------------------------------------------------------------
test('host 源码包含官方 usage.list 抓取(配置/cookie/1e8 换算)', () => {
  const src = readFileSync(join(root, 'src', 'host.js'), 'utf8')
  assert.ok(src.includes('OFFICIAL_SCRIPT'), '应定义官方抓取脚本')
  assert.ok(src.includes('dsh-opencode-go-usage.json'), '应使用本地配置文件')
  assert.ok(src.includes('utf-8-sig'), '配置文件应容忍 BOM')
  assert.ok(src.includes('usage.list') || src.includes('bfd684bfc2e4eed05cd0b518f5e4eafd3f3376e3938abb9e536e7c03df831e5c'), '应调用官方 usage.list server-fn')
  assert.ok(src.includes('costOfficial: (r.cost || 0) / 1e8'), '官方 cost 应按 1e-8 美元换算')
  // 自动提取(仅调试端口 CDP 方案)
  assert.ok(src.includes('cdp_fetch_cookie'), '应含调试端口 CDP 自动提取')
  assert.ok(src.includes('ws_connect'), '应含最小 WebSocket 客户端')
  assert.ok(src.includes('NO_BROWSER'), '调试浏览器缺失应有明确错误码')
  assert.ok(src.includes('OCGO_LAST_TS'), '应支持增量刷新')
  assert.ok(src.includes('load_disk_cache'), '应含磁盘缓存')
  assert.ok(src.includes("'/ocgo-usage/launch-browser'"), '应提供一键启动调试浏览器端点')
  assert.ok(src.includes('launchDebugBrowser'), 'host 应能启动调试浏览器')
  assert.ok(src.includes("'/ocgo-usage/config'"), '应提供手动凭据保存端点')
  const lib = readFileSync(join(root, 'lib', 'index.js'), 'utf8')
  assert.ok(lib.includes('collectOfficial'), '产物应包含官方源聚合')
  assert.ok(lib.includes("node:fs"), 'bundle 产物应注入 node:fs')
  const client = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
  assert.ok(client.includes("'view.official'"), '面板应含官方视图')
  assert.ok(client.includes("'official.launch'"), '面板应含一键启动调试浏览器按钮')
  assert.ok(client.includes('saveCfg'), '面板应含手动凭据保存')
})
