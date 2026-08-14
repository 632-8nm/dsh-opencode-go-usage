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
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createContext, runInContext } from 'node:vm'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const HOST_URL = pathToFileURL(join(root, 'lib', 'index.js'))

// ---------------------------------------------------------------------------
// 工具:构造一次 apply 调用环境,可注入 fake services,并捕获 harness.handle
// ---------------------------------------------------------------------------
function makeHostEnv({ dynamic = true, sessions = [] } = {}) {
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
      // 官方 usage.list(mock 空记录,避免测试联网)
      return { exitCode: 0, stdout: { text: JSON.stringify({ ok: true, records: [], truncated: false }) }, stderr: { text: '' } }
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
  // 自动提取
  assert.ok(src.includes('extract_edge_cookie'), '应含 Edge cookie 自动提取')
  assert.ok(src.includes('EDGE_RUNNING'), 'Edge 运行时应有明确错误码')
  assert.ok(src.includes('CryptUnprotectData'), '应使用 DPAPI 解密')
  assert.ok(src.includes('AESGCM'), '应使用 AES-GCM 解 cookie')
  assert.ok(src.includes("'/ocgo-usage/config'"), '应提供手动凭据保存端点')
  const lib = readFileSync(join(root, 'lib', 'index.js'), 'utf8')
  assert.ok(lib.includes('collectOfficial'), '产物应包含官方源聚合')
  assert.ok(lib.includes("node:fs"), 'bundle 产物应注入 node:fs')
  const client = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
  assert.ok(client.includes("'view.official'"), '面板应含官方视图')
  assert.ok(client.includes("'official.errEdge'"), '面板应含 Edge 运行提示')
  assert.ok(client.includes('saveCfg'), '面板应含手动凭据保存')
})
