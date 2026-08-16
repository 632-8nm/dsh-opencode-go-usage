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
const SAVED_HOME_ENV = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME, DSH_HOME: process.env.DSH_HOME }
const DISK_CACHE = join(FAKE_HOME, '.config', 'dsh-opencode-go-usage-official.json')
test.before(() => {
  process.env.USERPROFILE = FAKE_HOME
  process.env.HOME = FAKE_HOME
  process.env.DSH_HOME = FAKE_HOME // 多 key 发现(yaml)也落在临时 HOME
})
test.after(() => {
  try {
    if (SAVED_HOME_ENV.USERPROFILE === undefined) delete process.env.USERPROFILE
    else process.env.USERPROFILE = SAVED_HOME_ENV.USERPROFILE
    if (SAVED_HOME_ENV.HOME === undefined) delete process.env.HOME
    else process.env.HOME = SAVED_HOME_ENV.HOME
    if (SAVED_HOME_ENV.DSH_HOME === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = SAVED_HOME_ENV.DSH_HOME
  } catch (e) { /* 还原失败仅记录 */ }
  rmSync(FAKE_HOME, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// 工具:构造一次 apply 调用环境,可注入 fake services,并捕获 harness.handle
// ---------------------------------------------------------------------------
function makeHostEnv({ dynamic = true, sessions = [], officialResult = null, quotaResult = null, launchResult = null } = {}) {
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
      // 一键启动调试浏览器(pwsh -EncodedCommand)→ 默认成功(OK),可注入失败
      if (spec.command.includes('EncodedCommand')) {
        const lr = launchResult ?? 'OK'
        return { exitCode: lr === 'OK' ? 0 : 3, stdout: { text: lr }, stderr: { text: '' } }
      }
      // 多 key 配额命令(带 OCGO_KEYS_JSON,base64 payload 不含明文 url)→ 新结构
      if (spec.command.includes('OCGO_KEYS_JSON')) {
        const payload = quotaResult ?? {
          ok: true,
          keys: [{ name: 'go1', active: true, error: null, windows: { rolling: { percent: 30, status: 'ok', resetsAt: 1787000000000 }, weekly: { percent: 12, status: 'ok', resetsAt: 1787000000000 }, monthly: { percent: 33, status: 'ok', resetsAt: 1787000000000 } } }],
        }
        return { exitCode: 0, stdout: { text: JSON.stringify(payload) }, stderr: { text: '' } }
      }
      // 单 key 配额命令(含 /zen/go/v1/usage)→ 旧结构(curl 通道)
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
  // 会话扫描已后台化:首次响应 dshLoading=true(扫描未完成,不显示 0 误导),
  // 等后台扫描完成后 dshLoading=false 且 dsh 有数据
  assert.equal(data.dshLoading, true, '首次响应应标记 dshLoading(扫描未完成)')
  await new Promise((r) => setTimeout(r, 20))
  const settled = await handle(null)
  assert.equal(settled, data, '45s 缓存内应返回同一对象')
  assert.equal(settled.dshLoading, false, '后台扫描完成后 dshLoading 应清除')

  // DSH 会话分析:两笔 opencode-go(本地三源已移除,不再注入 opencode/codex)
  assert.equal(settled.dsh.total.requests, 2)
  assert.equal(settled.dsh.today.requests, 2)
  assert.ok(typeof settled.dsh.total.cost_est === 'number')

  // 模型排行按 cost 降序
  assert.ok(settled.dsh.by_model.length >= 1)
  const costs = settled.dsh.by_model.map((x) => x.cost_est)
  assert.deepEqual(costs, [...costs].sort((a, b) => b - a), 'by_model 应按 cost 降序')

  // 配额解析(单 key 回退通道 → keys[0])
  assert.equal(data.quota.keys[0].windows.rolling.percent, 30)
  assert.equal(data.quota.keys[0].windows.weekly.percent, 12)
  assert.equal(data.quotaError, null)

  // 官方明细:首次调用可能是 loading(后台拉取中)或已完成的 mock 空数据
  assert.ok(data.official, '应包含 official 字段')
  assert.ok(data.official.ok || data.official.loading, 'official 应为数据或加载中')
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

    // t0:读到截断缓存 → 强制全量重建(不带 OCGO_LAST_TS);
    // 注意:磁盘缓存不再秒开——首响应要么加载中、要么已是真实抓取结果
    // (mock 瞬时完成),但绝不携带磁盘缓存的 2 条旧记录
    const d0 = await handle(null)
    assert.notEqual(d0.official.records, 2, '首响应不得展示磁盘缓存旧记录')
    if (d0.official.ok) assert.equal(d0.official.records, 0, '若已展示则必须是真实抓取结果')
    await new Promise((r) => setTimeout(r, 10))
    assert.equal(officialRuns(), 1, '截断缓存应触发一次强制全量重建')
    assert.ok(!env.shellCalls.some((c) => c.includes('OCGO_LAST_TS')), '强制重建应是全量(无 LAST)')

    // 重建完成(后台)→ 下一次响应(45s 缓存内同一对象)展示真实数据
    const d0b = await handle(null)
    assert.equal(d0b.official.ok, true, '重建完成后应展示真实数据')
    assert.equal(d0b.official.records, 0, '数据来自抓取结果(mock 空),而非磁盘缓存')

    // t0+50s:12h 节流内 → 不重复强制,改走普通增量(带 OCGO_LAST_TS)
    now += 50_000
    const d1 = await handle(null)
    assert.equal(d1.official.ok, true)
    await new Promise((r) => setTimeout(r, 10))
    assert.equal(officialRuns(), 2, '节流期内应走普通增量')
    const incCmd = env.shellCalls.find((c) => c.includes('OCGO_LAST_TS'))
    assert.ok(incCmd, '普通增量应携带 OCGO_LAST_TS')
    // 回归门禁:增量命令的 python 前导必须 import os(历史 bug:只有 base64,
    // os.environ 注入直接 NameError,增量脚本从未成功执行过)
    assert.ok(incCmd.includes("import base64, os"), 'python 前导必须 import base64, os(否则增量 NameError)')
    assert.ok(incCmd.includes("os.environ['OCGO_LAST_TS']"), '增量应经 os.environ 注入 LAST')
  } finally {
    Date.now = realNow
  }
})

test('官方视图:磁盘缓存不再秒开,增量完成才展示真实数据', async () => {
  const realNow = Date.now
  let now = realNow()
  Date.now = () => now
  try {
    // 正常的(未截断)磁盘缓存
    const fake = {
      at: now - 60e3,
      truncated: false,
      records: [
        { ts: '2026-08-16T08:00:00.000Z', model: 'deepseek-v4-flash', ti: 100, to: 50, rt: 0, cr: 10, cost: 123 },
        { ts: '2026-08-16T07:00:00.000Z', model: 'deepseek-v4-pro', ti: 200, to: 80, rt: 0, cr: 0, cost: 456 },
      ],
    }
    mkdirSync(join(FAKE_HOME, '.config'), { recursive: true })
    writeFileSync(DISK_CACHE, JSON.stringify(fake), 'utf8')
    const env = makeHostEnv({ dynamic: true, sessions: [] })
    const m = await import(HOST_URL)
    m.apply(env.ctx)
    const handle = env.handlers.get('ocgo-usage:fetch')

    // t0:内存无缓存、磁盘有缓存 → 首响应要么"加载中"、要么已是真实抓取
    // 结果(mock 增量瞬时完成),但绝不展示磁盘缓存的 2 条旧记录
    const d0 = await handle(null)
    assert.notEqual(d0.official.records, 2, '有磁盘缓存也不得秒开旧记录')
    if (d0.official.ok) assert.equal(d0.official.records, 0, '若已展示则必须是真实抓取结果')

    // 后台增量(以磁盘为基准)完成 → 下一次响应展示真实数据(mock 返回的空集)
    await new Promise((r) => setTimeout(r, 10))
    const d1 = await handle(null)
    assert.equal(d1.official.ok, true, '增量完成后应展示真实数据')
    assert.equal(d1.official.records, 0, '展示的是抓取结果而非磁盘旧记录')
    // 增量应携带 OCGO_LAST_TS(磁盘基准)
    assert.ok(env.shellCalls.some((c) => c.includes('OCGO_LAST_TS')), '应以磁盘为基准走增量而非全量')
  } finally {
    Date.now = realNow
  }
})

test('配额:多 key 池自动发现(.credentials.yaml 的 OPENCODE_GO_KEY_* + ACTIVE)', async () => {
  // 假凭据文件:池 go1/go2 + ACTIVE=go2 + 单 key 回退项
  const yaml = [
    'DEEPSEEK_API_KEY: sk-dd-xxx',
    'OPENCODE_GO_API_KEY: sk-main-xxx',
    'OPENCODE_GO_KEY_ACTIVE: go2',
    'OPENCODE_GO_KEY_go1: sk-go1-xxx',
    'OPENCODE_GO_KEY_go2: sk-go2-xxx',
    '',
  ].join('\n')
  mkdirSync(FAKE_HOME, { recursive: true })
  writeFileSync(join(FAKE_HOME, '.credentials.yaml'), yaml, 'utf8')
  const quotaResult = {
    ok: true,
    keys: [
      { name: 'go1', active: false, error: null, windows: { rolling: { percent: 20, status: 'ok', resetsAt: '2026-08-16T12:00:00Z' }, weekly: { percent: 40, status: 'ok', resetsAt: null }, monthly: { percent: 60, status: 'ok', resetsAt: null } } },
      { name: 'go2', active: true, error: null, windows: { rolling: { percent: 70, status: 'rate-limited', resetsAt: '2026-08-16T12:00:00Z' }, weekly: { percent: 10, status: 'ok', resetsAt: null }, monthly: { percent: 5, status: 'ok', resetsAt: null } } },
    ],
  }
  const env = makeHostEnv({ dynamic: true, sessions: [], quotaResult })
  const m = await import(HOST_URL)
  m.apply(env.ctx)
  const data = await env.handlers.get('ocgo-usage:fetch')(null)

  // 两个 key 都被发现,ACTIVE 标记正确(mock 回显 = host 传入列表)
  assert.equal(data.quota.keys.length, 2)
  assert.equal(data.quota.keys[0].name, 'go1')
  assert.equal(data.quota.keys[0].active, false)
  assert.equal(data.quota.keys[1].name, 'go2')
  assert.equal(data.quota.keys[1].active, true, 'OPENCODE_GO_KEY_ACTIVE=go2 应标记生效')
  // rate-limited 状态原样透传(客户端据此显示 ⚠)
  assert.equal(data.quota.keys[1].windows.rolling.status, 'rate-limited')
  // 走的是多 key python 通道(带 OCGO_KEYS_JSON),而非单 key curl 通道;
  // 解码 payload 验证 host 实际传给 python 的 key 列表
  const cmd = env.shellCalls.find((c) => c.includes('OCGO_KEYS_JSON'))
  assert.ok(cmd, '多 key 应走 python 通道(OCGO_KEYS_JSON)')
  const b64 = cmd.match(/OCGO_KEYS_JSON'\]='([A-Za-z0-9+/=]+)'/)
  assert.ok(b64, '应携带 base64 编码的 key 列表')
  const sent = JSON.parse(Buffer.from(b64[1], 'base64').toString('utf8'))
  assert.equal(sent.length, 2)
  assert.equal(sent[0].name, 'go1')
  assert.equal(sent[1].name, 'go2')
  assert.equal(sent[1].active, true, 'ACTIVE 标记应传给 python')
})

test('配额:yaml 无池时回退 OPENCODE_GO_API_KEY 单 key', async () => {
  const yaml = ['OPENCODE_GO_API_KEY: sk-main-xxx', ''].join('\n')
  mkdirSync(FAKE_HOME, { recursive: true })
  writeFileSync(join(FAKE_HOME, '.credentials.yaml'), yaml, 'utf8')
  const env = makeHostEnv({ dynamic: true, sessions: [] })
  const m = await import(HOST_URL)
  m.apply(env.ctx)
  await env.handlers.get('ocgo-usage:fetch')(null)
  // mock 回显是固定值,真正验证 host 传给 python 的 key 列表:
  // yaml 单 key 应作为 default 传入
  const cmd = env.shellCalls.find((c) => c.includes('OCGO_KEYS_JSON'))
  assert.ok(cmd, 'yaml 单 key 也应走 python 通道')
  const b64 = cmd.match(/OCGO_KEYS_JSON'\]='([A-Za-z0-9+/=]+)'/)
  assert.ok(b64, '应携带 base64 编码的 key 列表')
  const sent = JSON.parse(Buffer.from(b64[1], 'base64').toString('utf8'))
  assert.equal(sent.length, 1)
  assert.equal(sent[0].name, 'default')
  assert.equal(sent[0].key, 'sk-main-xxx')
  assert.equal(sent[0].active, true)
})

test('配额:yaml 单 key 与 auth.json CLI key 自动合并为多 key', async () => {
  mkdirSync(FAKE_HOME, { recursive: true })
  writeFileSync(join(FAKE_HOME, '.credentials.yaml'), 'OPENCODE_GO_API_KEY: sk-main-xxx\n', 'utf8')
  // auth.json CLI 凭据(与 yaml 不同 key)
  mkdirSync(join(FAKE_HOME, '.local', 'share', 'opencode'), { recursive: true })
  writeFileSync(join(FAKE_HOME, '.local', 'share', 'opencode', 'auth.json'), JSON.stringify({ 'opencode-go': { key: 'sk-cli-xxx' } }), 'utf8')
  const env = makeHostEnv({ dynamic: true, sessions: [] })
  const m = await import(HOST_URL)
  m.apply(env.ctx)
  await env.handlers.get('ocgo-usage:fetch')(null)
  const cmd = env.shellCalls.find((c) => c.includes('OCGO_KEYS_JSON'))
  assert.ok(cmd, '应走多 key python 通道')
  const b64 = cmd.match(/OCGO_KEYS_JSON'\]='([A-Za-z0-9+/=]+)'/)
  assert.ok(b64, '应携带 base64 编码的 key 列表')
  const sent = JSON.parse(Buffer.from(b64[1], 'base64').toString('utf8'))
  assert.equal(sent.length, 2, 'yaml 单 key 与 auth.json CLI key 应合并')
  assert.equal(sent[0].name, 'default')
  assert.equal(sent[0].active, true, 'yaml key 应标记为当前生效')
  assert.equal(sent[1].name, 'cli')
  assert.equal(sent[1].active, false)
  assert.equal(sent[1].key, 'sk-cli-xxx')
})

test('一键启动调试浏览器:成功返回 ok,未监听返回明确错误(不再假报已弹出)', async () => {
  // 成功路径
  const okEnv = makeHostEnv({ dynamic: true, sessions: [] })
  const m = await import(HOST_URL)
  m.apply(okEnv.ctx)
  const ok = await okEnv.handlers.get('ocgo-usage:launch-browser')(null)
  assert.equal(ok.ok, true, '启动成功应返回 ok')
  assert.ok(okEnv.shellCalls.some((c) => c.includes('EncodedCommand')), 'Windows 应走 pwsh -EncodedCommand')

  // NO_LISTEN 路径:启动命令返回 NO_LISTEN → 明确错误,不再误报成功
  const failEnv = makeHostEnv({ dynamic: true, sessions: [], launchResult: 'NO_LISTEN' })
  const m2 = await import(HOST_URL)
  m2.apply(failEnv.ctx)
  const fail = await failEnv.handlers.get('ocgo-usage:launch-browser')(null)
  assert.equal(fail.ok, false)
  assert.ok(String(fail.error).includes('NO_LISTEN'), '应返回 NO_LISTEN 明确报错: ' + fail.error)
})

test('官方视图"最近会话":id 唯一且为真实会话 id(React key 防重复渲染)', async () => {
  const realNow = Date.now
  let now = realNow()
  Date.now = () => now
  try {
    const sessions = [
      { id: 'sess-a', title: '会话A', events: [mkAssistantEvent('deepseek-v4-flash', 'opencode-go', mkUsage({ inputTokens: 100 }))] },
      { id: 'sess-b', title: '会话B', events: [mkAssistantEvent('deepseek-v4-flash', 'opencode-go', mkUsage({ inputTokens: 200 }))] },
      { id: 'sess-c', title: '会话C', events: [mkAssistantEvent('deepseek-v4-flash', 'opencode-go', mkUsage({ inputTokens: 300 }))] },
    ]
    const env = makeHostEnv({ dynamic: true, sessions })
    const m = await import(HOST_URL)
    m.apply(env.ctx)
    const handle = env.handlers.get('ocgo-usage:fetch')
    await handle(null)
    await new Promise((r) => setTimeout(r, 20)) // 等后台扫描 + 官方 mock 完成
    now += 50_000 // 越过 45s 聚合缓存,触发一次真正 fetchAll(官方回填 recent)
    const data = await handle(null)
    const recent = data.official && data.official.ok ? data.official.vd.recent : null
    assert.ok(recent && recent.length >= 2, '官方视图应有最近会话(实际: ' + (recent ? recent.length : 'null') + ')')
    const ids = recent.map((s) => s.id)
    assert.equal(new Set(ids).size, ids.length, '最近会话 id 必须唯一(防 React key 冲突导致上下重复)')
    assert.ok(ids.every((id) => id !== 's' && id.length > 1), 'id 必须是真实会话 id,而非常量 s')
    // 金额为官方回填值(数值)
    for (const s of recent) assert.equal(typeof s.cost_est, 'number')
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
  const handle = env.handlers.get('ocgo-usage:fetch')
  await handle(null)
  await new Promise((r) => setTimeout(r, 20)) // 等后台扫描完成
  const data = await handle(null)
  // DSH 视图只有 opencode-go 那 1 笔;deepseek 直连与无来源均不计入
  assert.equal(data.dsh.total.requests, 1)
})

test('扫描完成后官方 recent 自动补真实会话 id(缓存命中路径)', async () => {
  const realNow = Date.now
  let now = realNow()
  Date.now = () => now
  try {
    const sessions = [
      { id: 'sess-x', title: '会话X', events: [mkAssistantEvent('deepseek-v4-flash', 'opencode-go', mkUsage({ inputTokens: 100 }))] },
      { id: 'sess-y', title: '会话Y', events: [mkAssistantEvent('deepseek-v4-flash', 'opencode-go', mkUsage({ inputTokens: 200 }))] },
    ]
    const env = makeHostEnv({ dynamic: true, sessions })
    const m = await import(HOST_URL)
    m.apply(env.ctx)
    const handle = env.handlers.get('ocgo-usage:fetch')
    const d0 = await handle(null)
    // 等后台扫描完成(refreshScanAsync 应同步刷新 cache.data.official.vd.recent)
    await new Promise((r) => setTimeout(r, 30))
    const d1 = await handle(null) // 45s 缓存命中,同一对象
    assert.equal(d1, d0, '应为 45s 缓存内同一对象')
    const recent = d1.official && d1.official.ok ? d1.official.vd.recent : null
    assert.ok(recent && recent.length >= 2, '扫描完成后 recent 应有数据(实际 ' + (recent ? recent.length : 'null') + ')')
    const ids = recent.map((s) => s.id)
    assert.ok(ids.every((id) => id.startsWith('sess-')), '缓存命中路径也应使用真实会话 id: ' + ids.join(','))
    assert.equal(new Set(ids).size, ids.length, 'id 唯一')
    // 标题已回填
    assert.ok(recent.some((s) => s.title === '会话X' || s.title === '会话Y'), '标题应回填')
  } finally {
    Date.now = realNow
  }
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
  const handle = env.handlers.get('ocgo-usage:fetch')
  await handle(null)
  await new Promise((r) => setTimeout(r, 20)) // 等后台扫描完成
  const data = await handle(null)
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
