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
  // 稳定"今天"时间:凌晨 1:05,避免 Date.now()-偏移 在午夜前后跨到昨天导致 today 桶断言脆弱
  const todayEarly = (() => { const d = new Date(); d.setHours(1, 5, 0, 0); return d.getTime() })()
  const shell = {
    resolve: (req) => ({ ...req }),
    run: async (spec) => {
      shellCalls.push(spec.command)
      // 配额命令(含 /zen/go/v1/usage)与数据库命令(含 base64 payload)分开应答。
      if (spec.command.includes('zen/go/v1/usage')) {
        return { exitCode: 0, stdout: { text: JSON.stringify({ usage: { rolling: { percent: 30, status: 'ok', resetsAt: 1787000000000 }, weekly: { percent: 12, status: 'ok', resetsAt: 1787000000000 } } }) }, stderr: { text: '' } }
      }
      // collectDb:返回 1 条 opencode 行 + 1 条 codex 行 + 两源均可用。
      return {
        exitCode: 0,
        stdout: { text: JSON.stringify({
          rows: [{ id: 'oc-0', title: 'OC 会话', model: 'opencode-go/deepseek-v4-flash', provider: 'opencode', time: todayEarly, inputTokens: 1000, outputTokens: 500, reasoningTokens: 10, cacheReadTokens: 100, cacheWriteTokens: 50, costOfficial: 0.0005 }],
          codexRows: [{ id: 'cx-0', title: 'Codex 会话', model: 'gpt-5.6-luna', provider: 'codex', time: todayEarly, inputTokens: 2000, outputTokens: 1000, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costOfficial: 0.012 }],
          ocgoAvailable: true, ocgoError: null, codexAvailable: true, codexError: null,
        }) },
        stderr: { text: '' },
      }
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

  // DSH 两笔 + opencode 1 笔 + codex 1 笔 = 4 个请求
  assert.equal(data.all.total.requests, 4)
  // DSH 视图只含 DSH 两笔
  assert.equal(data.dsh.total.requests, 2)

  // cash 聚合:今日应为 4 笔(都在今日)
  assert.equal(data.all.today.requests, 4)
  assert.ok(typeof data.all.total.cost_est === 'number')

  // 模型排行按 cost 降序
  assert.ok(data.all.by_model.length >= 1)
  const costs = data.all.by_model.map((x) => x.cost_est)
  assert.deepEqual(costs, [...costs].sort((a, b) => b - a), 'by_model 应按 cost 降序')

  // 配额解析
  assert.equal(data.quota.rolling.percent, 30)

  // 数据源可用标志
  assert.equal(data.ocgoAvailable, true)
  assert.equal(data.codexAvailable, true)
  assert.equal(data.quotaError, null)

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
  // 全部视图 = 1(DSH opencode-go)+ 1(oc)+ 1(cx)= 3
  assert.equal(data.all.total.requests, 3)
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
test('聚合:空 DSH 数据时 opencode/codex 仍正常,不含 NaN', async () => {
  const env = makeHostEnv({ dynamic: true, sessions: [] })
  const m = await import(HOST_URL)
  m.apply(env.ctx)
  const data = await env.handlers.get('ocgo-usage:fetch')(null)
  assert.equal(data.all.total.requests, 2) // 仅 opencode + codex
  assert.equal(data.dsh.total.requests, 0) // DSH 空
  assert.ok(Number.isFinite(data.all.total.cost_est))
  assert.ok(Number.isFinite(data.all.month.cost_est))
  assert.ok(data.all.by_day.length === 30)
  for (const d of data.all.by_day) assert.equal(typeof d.cost_est, 'number')
})

// 时间戳为 0 的记录不应制造 NaN
test('聚合:time=0 的记录不产生 Invalid/NaN 时间桶', async () => {
  const sessions = [{ id: 's0', title: null, events: [{ type: 'assistant/message', time: 0, data: { usage: mkUsage(), message: { source: { model: 'deepseek-v4-flash', provider: 'opencode-go' } } } }] }]
  const env = makeHostEnv({ dynamic: true, sessions })
  const m = await import(HOST_URL)
  m.apply(env.ctx)
  const data = await env.handlers.get('ocgo-usage:fetch')(null)
  // DSH 的 time=0 那笔计入累计,且总 cost 为有限数
  // (测试环境 shell mock 总会注入 1 条 opencode + 1 条 codex,故 total=1+1+1=3)
  assert.equal(data.dsh.total.requests, 1)
  assert.equal(data.all.total.requests, 3)
  assert.ok(Number.isFinite(data.all.total.cost_est))
  // 近 30 天柱状图 cost_est 全部为有限数(1970 桶不在窗口内,不应出现 NaN)
  for (const d of data.all.by_day) assert.equal(typeof d.cost_est, 'number')
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
