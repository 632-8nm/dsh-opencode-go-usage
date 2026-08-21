// dsh-opencode-go-usage 自动化测试(纯 Node,无外部依赖)
//
// 用 Node 内置 test runner 直接执行真实的构建产物(lib/index.js、lib/client.js),
// 覆盖当前纯 JS 架构(已彻底移除 python/CDP/curl/shell):
//   1. lib/index.js 的 host ESM 导出契约
//   2. 动态模式:harness.handle 注册 + 全量聚合(DSH 会话 + 官方明细 + 配额)
//   3. 静态模式:无 harness 时 apply 干净退出、不注册 RPC handler、不抛错
//   4. lib/client.js 的浏览器注册形态(经典 script 语义 + 工厂 require(react))
//   5. 聚合逻辑的边界(空数据、time=0、provider 口径、价格前缀归一)
//   6. 官方 usage.list:fetch 分页抓取 + cost 1e-8 换算 + 磁盘落盘
//   7. 手动凭据保存端点(/ocgo-usage/config)写本地配置
//   8. 展示快照 -snapshot.json 的写入与瘦身(official.rows 剔除)
//   9. i18n:zh/en 字典键完全对齐
//  10. 源码级回归门禁:新纯 JS 符号在位 / 已删除 python·shell·CDP 符号不再出现
//
// 数据通道:host 现在用全局 fetch(Node 18+ 自带)抓取:
//   - 配额: https://opencode.ai/zen/go/v1/usage
//           → { usage: { rolling|weekly|monthly: { percent, status, resetsAt } } }
//   - 官方: https://opencode.ai/_server?id=<OCGO_FID>&args=<[wid,page] 的 JSON>
//           → 纯文本,含 \{id:"usg_..."\} 记录块(host 用 res.text() + 正则解析)
// 测试用 globalThis.fetch 桩按 URL 区分回显,并在 test.after 恢复原值。
//
// 运行:`node --test` 或 `npm test`
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createContext, runInContext } from 'node:vm'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const HOST_URL = pathToFileURL(join(root, 'lib', 'index.js'))

// host.js 实现里实际使用的常量,以源码为准,不臆造。
const QUOTA_URL = 'https://opencode.ai/zen/go/v1/usage'
const OFFICIAL_FID = 'bfd684bfc2e4eed05cd0b518f5e4eafd3f3376e3938abb9e536e7c03df831e5c'
const OFFICIAL_PREFIX = 'https://opencode.ai/_server?id=' + OFFICIAL_FID + '&args='

// ---------------------------------------------------------------------------
// 测试隔离:lib/index.js 的 fs 访问全部经注入的 _ocgoHomedir()(= os.homedir(),
// 每次调用读环境变量),套件把 USERPROFILE/HOME/DSH_HOME 重定向到临时目录——
// 磁盘缓存、凭据配置、快照、DSH 扫描、诊断日志全都落在临时 HOME,绝不触碰
// 真实用户文件。
// ---------------------------------------------------------------------------
const FAKE_HOME = mkdtempSync(join(tmpdir(), 'ocgo-test-home-'))
const SAVED_HOME_ENV = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME, DSH_HOME: process.env.DSH_HOME }
const DISK_CACHE = join(FAKE_HOME, '.config', 'dsh-opencode-go-usage-official.json')
const SNAPSHOT = join(FAKE_HOME, '.config', 'dsh-opencode-go-usage-snapshot.json')
const CFG = join(FAKE_HOME, '.config', 'dsh-opencode-go-usage.json')
const AUTH_JSON = join(FAKE_HOME, '.local', 'share', 'opencode', 'auth.json')

const REAL_FETCH = globalThis.fetch

// 配额抓取需要 opencode-go key:host 的 findPrimaryGoKey() 读 ~/.local/share/
// opencode/auth.json 的 auth['opencode-go'].key。写到 FAKE_HOME 下即生效。
function writeGoKey() {
  mkdirSync(join(FAKE_HOME, '.local', 'share', 'opencode'), { recursive: true })
  writeFileSync(AUTH_JSON, JSON.stringify({ 'opencode-go': { key: 'sk-test-key' } }), 'utf8')
}
// 官方明细抓取需要手动粘贴的凭据(authCookie + workspaceId)。
function writeCfg(cfg) {
  mkdirSync(join(FAKE_HOME, '.config'), { recursive: true })
  writeFileSync(CFG, JSON.stringify(cfg), 'utf8')
}

// 每个测试前重定向 HOME:node:test 顶层 before 只在文件级跑一次,若缺失或只用
// before,后续测试的 os.homedir() 会读到真实用户目录(lib 的 _ocgoHomedir 每次调用
// 读 env),快照/配置/日志会写进真实 ~/.config。beforeEach 保证每个测试隔离。
test.beforeEach(async () => {
  // 先等上一个测试的异步后台任务(增量抓取/快照/后台刷新)落定:它们由上一个
  // 测试的模块实例持有,可能在下一个测试的清理之后才写盘(共享 FAKE_HOME)——
  // 不等的话旧任务会把刚清空的 .config 又写脏(如测试 4 的增量写盘)。
  await sleep(250)
  process.env.USERPROFILE = FAKE_HOME
  process.env.HOME = FAKE_HOME
  process.env.DSH_HOME = FAKE_HOME // 多 key 发现(yaml)也落在临时 HOME
  cleanState()
})

test.after(() => {
  // 无论测试如何退出都还原 fetch 与 HOME
  globalThis.fetch = REAL_FETCH
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 每个测试运行在独立的模块实例上:Node 按 URL 缓存 ESM 模块,若复用同一个实例,
// lastScan/cache/officialCache 等模块级状态会跨测试残留(45s 缓存命中、旧扫描
// 结果污染后续用例)。给 URL 加 query 参数,让每个测试拿到全新模块实例。
let moduleSalt = 0
function freshHost() {
  return import(HOST_URL.href + '?t=' + (++moduleSalt))
}
// 清空 FAKE_HOME 下的磁盘状态(.config 下的配置/快照/DSH 扫描/日志 + auth.json),
// 防止上一个用例写入的文件污染本用例;需要的东西由 writeGoKey/writeCfg 重建。
function cleanState() {
  rmSync(join(FAKE_HOME, '.config'), { recursive: true, force: true })
  rmSync(join(FAKE_HOME, '.local'), { recursive: true, force: true })
}

// ---------------------------------------------------------------------------
// fetch 桩:按 URL 区分配额 / 官方 usage.list。host 可能传 AbortSignal.timeout
// 之类的 init,桩签名 (url, init) 能接受即可。官方 usage.list 响应是纯文本。
// ---------------------------------------------------------------------------
function makeFetchStub({ quota, officialText = '', quotaDelay = 0 } = {}) {
  const defaultQuota = {
    usage: {
      rolling: { percent: 30, status: 'ok', resetsAt: 1787000000000 },
      weekly: { percent: 12, status: 'ok', resetsAt: 1787000000000 },
      monthly: { percent: 33, status: 'ok', resetsAt: 1787000000000 },
    },
  }
  const calls = { quota: 0, official: [] }
  const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => body })
  const stub = async (url /* init */) => {
    if (url === QUOTA_URL) {
      calls.quota++
      if (quotaDelay) await sleep(quotaDelay) // 模拟真实网络耗时:首次响应先于配额返回
      return ok(quota ?? defaultQuota)
    }
    if (typeof url === 'string' && url.startsWith(OFFICIAL_PREFIX)) {
      calls.official.push(url)
      return ok(officialText)
    }
    throw new Error('mock fetch unexpected URL: ' + url)
  }
  return { stub, calls }
}

// ---------------------------------------------------------------------------
// 工具:构造一次 apply 调用环境,注入 fake sessionQuery,捕获 harness.handle
// 与 webServer.register。
// ---------------------------------------------------------------------------
function makeHostEnv({ dynamic = true, sessions = [], scanDelay = 0 } = {}) {
  const handlers = new Map()
  const routes = new Map()
  const fakeHarness = { handle: (method, fn) => { handlers.set(method, fn); return () => handlers.delete(method) } }
  // 动态模式模拟:dsh-cordis-host-runner 沙箱把 harness 作为全局。
  if (dynamic) globalThis.harness = fakeHarness
  else delete globalThis.harness

  const titleSnap = (id, title) => ({ sessionId: id, status: 'fulfilled', value: { title: { title } } })
  const sessionQuery = {
    listSessions: async () => sessions.map((s) => ({ header: { id: s.id }, live: true, persisted: true })),
    readTitleSnapshots: async () => sessions.map((s) => titleSnap(s.id, s.title)),
    readSession: async (id) => {
      if (scanDelay) await sleep(scanDelay) // 模拟真实扫描耗时(读会话事件流),让首次响应先于扫描完成返回
      const s = sessions.find((x) => x.id === id)
      return { session: { id }, events: s ? s.events : [] }
    },
  }
  const webServer = { register: (r) => { routes.set(r.path, r); return () => routes.delete(r.path) } }

  const effects = []
  const ctx = {
    get: (name) => (name === 'sessionQuery' ? sessionQuery : name === 'webServer' ? webServer : undefined),
    effect: (fn) => { effects.push(fn); const d = fn(); return d },
  }
  return { ctx, handlers, routes, effects, fakeHarness }
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
  const m = await freshHost()
  assert.equal(m.name, 'opencode-go-usage')
  assert.equal(typeof m.apply, 'function')
})

// ---------------------------------------------------------------------------
// 2. 动态模式:注册 + 全量聚合(DSH + 配额 + 官方占位)
// ---------------------------------------------------------------------------
test('动态模式:注册 ocgo-usage:fetch 并正确聚合 DSH + 配额', async () => {
  cleanState()
  writeGoKey()
  const { stub } = makeFetchStub({ quotaDelay: 50 }) // 配额 50ms 后才返回:首次响应先展开再补配额
  globalThis.fetch = stub
  const sessions = [
    { id: 's1', title: '会话一', events: [mkAssistantEvent('deepseek-ai/deepseek-v4-flash', 'opencode-go', mkUsage({ inputTokens: 100, outputTokens: 50, cacheReadTokens: 10 }))] },
    { id: 's2', title: null, events: [mkAssistantEvent('deepseek-v4-pro', 'opencode-go', mkUsage({ inputTokens: 200 }))] },
  ]
  const env = makeHostEnv({ dynamic: true, sessions, scanDelay: 40 })
  const m = await freshHost()
  m.apply(env.ctx)

  const handle = env.handlers.get('ocgo-usage:fetch')
  assert.ok(handle, '应注册 ocgo-usage:fetch')

  const data = await handle(null)
  assert.equal(data.ok, true)

  // 会话扫描后台化:mock 的 sessionQuery 带 40ms 延迟,首次响应先于扫描完成返回
  // (dshLoading=true),后台扫描完成后同对象被原地更新(dshLoading 清除)。
  assert.equal(data.dshLoading, true, '首次响应应标记 dshLoading(扫描未完成)')
  // 首次响应:配额后台抓取中,不阻塞展开(FAB 显示 —%,面板先渲染其它区)
  assert.equal(data.quota, null, '首次响应配额应后台抓取中(不阻塞展开)')
  assert.equal(data.quotaLoading, true, '首次响应应标记 quotaLoading')
  await sleep(150)
  const settled = await handle(null)
  assert.equal(settled, data, '45s 缓存内应返回同一对象')
  assert.equal(settled.dshLoading, false, '后台扫描完成后 dshLoading 应清除')

  // 两笔 opencode-go 均计入;价格前缀归一(deepseek-ai/ 被剥掉)
  assert.equal(settled.dsh.total.requests, 2)
  assert.equal(settled.dsh.today.requests, 2)
  assert.ok(typeof settled.dsh.total.cost_est === 'number')

  // by_model 按 cost 降序
  const costs = settled.dsh.by_model.map((x) => x.cost_est)
  assert.deepEqual(costs, [...costs].sort((a, b) => b - a), 'by_model 应按 cost 降序')

  // 后台抓取完成后同对象被原地更新(60s 轮询自然拿到):keys[0] 来自 mock fetch 的 usage
  assert.equal(settled.quota.keys.length, 1)
  assert.equal(settled.quota.keys[0].name, 'default')
  assert.equal(settled.quota.keys[0].windows.rolling.percent, 30)
  assert.equal(settled.quota.keys[0].windows.weekly.percent, 12)
  assert.equal(settled.quotaError, null)

  // 官方明细:无凭据配置 → NEED_CONFIG(不会真的抓取)
  assert.ok(data.official, '应包含 official 字段')
  assert.equal(data.official.error, 'NEED_CONFIG', '无凭据时应返回 NEED_CONFIG')
})

// ---------------------------------------------------------------------------
// 3. 静态模式:无 harness 时干净退出
// ---------------------------------------------------------------------------
test('静态模式:无 harness 时 apply 干净退出且不注册 RPC handler', async () => {
  const env = makeHostEnv({ dynamic: false, sessions: [] })
  const m = await freshHost()
  m.apply(env.ctx) // 不应抛错
  assert.equal(env.handlers.size, 0, '无 harness 则不应注册 ocgo-usage:fetch RPC')
})

// ---------------------------------------------------------------------------
// 4. 官方 usage.list:fetch 分页抓取 + cost 1e-8 换算 + 磁盘落盘
// ---------------------------------------------------------------------------
test('官方 usage.list:经 fetch 抓取,cost 按 1e-8 换算并落盘', async () => {
  cleanState()
  writeGoKey()
  writeCfg({ authCookie: 'Fe26.2-testcookie', workspaceId: 'wrk_test' })
  const rec = '{id:"usg_1",model:"deepseek-v4-flash",ts:new Date("2026-08-16T08:00:00.000Z"),inputTokens:100,outputTokens:50,reasoningTokens:0,cacheReadTokens:10,cost:123}'
  const { stub, calls } = makeFetchStub({ officialText: rec })
  globalThis.fetch = stub

  const env = makeHostEnv({ dynamic: true, sessions: [] })
  const m = await freshHost()
  m.apply(env.ctx)
  const handle = env.handlers.get('ocgo-usage:fetch')

  const d0 = await handle(null) // 首次:官方后台抓取中(runOfficial 有 150ms 节流)
  assert.ok(calls.quota >= 1, '配额应经 fetch 抓取')
  assert.ok(calls.official.length >= 1, '官方 usage.list 应经 fetch 分页抓取')
  assert.ok(calls.official.every((u) => u.startsWith(OFFICIAL_PREFIX)), '官方请求应指向 _server?id=FID&args=...')

  // 等官方抓取落定(150ms 分页节流 + 落盘),再触发一次 fetchAll(officialSettled
  // 会绕过 45s 缓存,重建响应返回真实数据)
  await sleep(300)
  const d1 = await handle(null)

  assert.equal(d1.official.ok, true, '官方抓取落定后应返回可用数据')
  assert.equal(d1.official.records, 1, '应解析出 1 条官方记录')
  assert.equal(d1.official.rows[0].model, 'deepseek-v4-flash')
  assert.ok(Math.abs(d1.official.rows[0].costOfficial - 123 / 1e8) < 1e-12, '官方 cost 应按 1e-8 美元换算')

  // 官方磁盘缓存落盘(全量抓取后写 _ocgo fs 别名)
  assert.equal(existsSync(DISK_CACHE), true, '官方记录应落盘到 -official.json')
  const disk = JSON.parse(readFileSync(DISK_CACHE, 'utf8'))
  assert.ok(Array.isArray(disk.records), '磁盘缓存应含 records 数组')
  assert.equal(disk.records.length, 1)
})

test('官方:空响应(如 cookie 失效)不当作成功,返回明确错误且不落盘', async () => {
  cleanState()
  writeGoKey()
  writeCfg({ authCookie: 'Fe26.2-bad', workspaceId: 'wrk_bad' })
  // 模拟 cookie 失效:服务端返回登录页 HTML,正则解析不出任何记录
  const { stub } = makeFetchStub({ officialText: '<html><body>login required</body></html>' })
  globalThis.fetch = stub
  const env = makeHostEnv({ dynamic: true, sessions: [] })
  const m = await freshHost()
  m.apply(env.ctx)
  const handle = env.handlers.get('ocgo-usage:fetch')

  await handle(null) // 首次:官方后台抓取中
  await sleep(500) // 等 collectOfficial 完成(5 空页 × 重试 + 150ms 节流)
  const d = await handle(null) // 45s 缓存内(loading 占位或已错误),均不得为 ok
  assert.notEqual(d.official.ok, true, '空响应不应被当作成功')
  assert.equal(existsSync(DISK_CACHE), false, '空结果不应落盘毒化增量基准')
  const log = readFileSync(join(FAKE_HOME, '.config', 'dsh-opencode-go-usage.log'), 'utf8')
  assert.ok(log.includes('official fetch empty'), '日志应记录空响应诊断(含响应样本)')
})

test('强制刷新:force 请求绕过 45s 缓存重建数据', async () => {
  cleanState()
  writeGoKey()
  const { stub, calls } = makeFetchStub()
  globalThis.fetch = stub
  const env = makeHostEnv({ dynamic: true, sessions: [] })
  const m = await freshHost()
  m.apply(env.ctx)
  const handle = env.handlers.get('ocgo-usage:fetch')

  const d0 = await handle(null) // 首次构建
  const quotaCalls1 = calls.quota
  await sleep(20)
  const d1 = await handle(null) // 无 force → 45s 缓存命中
  assert.equal(d1, d0, '非 force 请求应命中 45s 缓存返回同一对象')
  const d2 = await handle({ force: true }) // force → 重建
  assert.notEqual(d2, d0, 'force 请求应绕过缓存重建新对象')
  assert.ok(calls.quota >= quotaCalls1 + 1, 'force 应重新抓配额')
})

test('配额兜底:配额缓存空时任何构建(含后台抢占)都带快照配额,不空白', async () => {
  cleanState()
  writeGoKey()
  writeCfg({ authCookie: 'Fe26.2-c', workspaceId: 'wrk_w' })
  const rec = '{id:"usg_1",model:"deepseek-v4-flash",ts:new Date("2026-08-16T08:00:00.000Z"),inputTokens:100,outputTokens:50,cost:123}'
  const { stub } = makeFetchStub({ officialText: rec })
  globalThis.fetch = stub
  const env = makeHostEnv({ dynamic: true, sessions: [] })
  const m = await freshHost()
  m.apply(env.ctx)
  const handle = env.handlers.get('ocgo-usage:fetch')

  await handle(null)
  await sleep(300) // 官方落定 + 快照写入(含配额)
  // 模拟"重启后"(新模块实例 = 全新内存状态,quotaCache 为空):force 构建
  // (等同 bgRefresh 抢占)仍应带快照配额,不空白
  const env2 = makeHostEnv({ dynamic: true, sessions: [] })
  const m2 = await freshHost()
  m2.apply(env2.ctx)
  const handle2 = env2.handlers.get('ocgo-usage:fetch')
  const d = await handle2({ force: true })
  assert.ok(d.quota && d.quota.keys, 'force 构建(配额缓存空)也应有快照配额打底')
})

// ---------------------------------------------------------------------------
// 5. 手动凭据保存端点(/ocgo-usage/config)
// ---------------------------------------------------------------------------
test('手动凭据:POST /ocgo-usage/config 写配置并返回 ok', async () => {
  cleanState()
  const { stub } = makeFetchStub()
  globalThis.fetch = stub
  const env = makeHostEnv({ dynamic: true, sessions: [] })
  const m = await freshHost()
  m.apply(env.ctx)

  const route = env.routes.get('/ocgo-usage/config')
  assert.ok(route, '应注册 /ocgo-usage/config 路由')

  // 预置保存前(无凭据)写入的旧快照:official=NEED_CONFIG。保存凭据后 reload
  // 不得再命中它把"加载中"顶成旧引导——旧快照必须在保存时被删除。
  mkdirSync(join(FAKE_HOME, '.config'), { recursive: true })
  writeFileSync(SNAPSHOT, JSON.stringify({
    ok: true,
    quota: { ok: true, keys: [{ name: 'default', active: true, error: null, windows: {} }] },
    dsh: { total: { requests: 0 }, today: { requests: 0 }, month: { requests: 0 }, by_model: [], by_day: [] },
    official: { ok: false, error: 'NEED_CONFIG' },
  }), 'utf8')
  const handle = env.handlers.get('ocgo-usage:fetch')
  const before = await handle(null)
  assert.equal(before.official.error, 'NEED_CONFIG', '保存前应命中旧快照(NEED_CONFIG)')

  const body = JSON.stringify({ authCookie: 'Fe26.2-abc', workspaceId: 'wrk_xyz' })
  let statusCode = 0
  let respBody = null
  const req = {
    method: 'POST',
    [Symbol.asyncIterator]: async function* () { yield body },
  }
  const res = { writeHead: (code) => { statusCode = code }, end: (buf) => { respBody = buf } }
  await route.handler(req, res)

  assert.equal(statusCode, 200, '成功应返回 200')
  assert.equal(JSON.parse(respBody).ok, true)

  assert.equal(existsSync(CFG), true, '凭据应写入配置文件')
  const cfg = JSON.parse(readFileSync(CFG, 'utf8'))
  assert.equal(cfg.authCookie, 'Fe26.2-abc')
  assert.equal(cfg.workspaceId, 'wrk_xyz')

  assert.equal(existsSync(SNAPSHOT), false, '保存后旧快照应被删除')

  // reload 后的下一次取数:不再命中旧快照,走网络构建(加载中或真实数据)
  const after = await handle(null)
  assert.notEqual(after.official.error, 'NEED_CONFIG', '保存后不得再显示旧引导(应加载中/数据)')
  assert.ok(after.official.loading || after.official.ok, '保存后应为加载中或已就绪')
})

// ---------------------------------------------------------------------------
// 6. 展示快照:-snapshot.json 写入且剔除 official.rows(瘦身)
// ---------------------------------------------------------------------------
test('快照:数据完整时写 -snapshot.json,且剔除 official.rows', async () => {
  cleanState()
  writeGoKey()
  writeCfg({ authCookie: 'Fe26.2-c', workspaceId: 'wrk_w' })
  const rec = '{id:"usg_1",model:"deepseek-v4-flash",ts:new Date("2026-08-16T08:00:00.000Z"),inputTokens:100,outputTokens:50,cost:123}'
  const { stub } = makeFetchStub({ officialText: rec })
  globalThis.fetch = stub

  const env = makeHostEnv({ dynamic: true, sessions: [] })
  const m = await freshHost()
  m.apply(env.ctx)
  const handle = env.handlers.get('ocgo-usage:fetch')

  await handle(null) // 首次:官方后台抓取中,配额已就绪,但官方未 ok → 不写快照
  await sleep(300) // 等官方落定
  await handle(null) // officialSettled 触发重建:配额 + 官方都就绪 → 写快照

  assert.equal(existsSync(SNAPSHOT), true, '数据完整时应写展示快照')
  const snap = JSON.parse(readFileSync(SNAPSHOT, 'utf8'))
  assert.equal(snap.ok, true)
  assert.ok(snap.quota && snap.quota.keys, '快照应含 quota')
  assert.ok(snap.official && snap.official.ok && snap.official.vd, '快照应含 official.vd')
  assert.equal(snap.official.rows, undefined, '快照应剔除 official.rows(瘦身)')
})

test('快照:无凭据时配额一到也写快照(重启后首屏即见上次配额)', async () => {
  cleanState()
  writeGoKey()
  const { stub } = makeFetchStub({ quotaDelay: 50 }) // 模拟配额网络耗时
  globalThis.fetch = stub
  const env = makeHostEnv({ dynamic: true, sessions: [] })
  const m = await freshHost()
  m.apply(env.ctx)
  const handle = env.handlers.get('ocgo-usage:fetch')

  await handle(null) // 首次:配额后台抓取中(尚未到位)
  assert.equal(existsSync(SNAPSHOT), false, '配额未到前不写快照')
  await sleep(150) // 等配额到位(50ms 延迟)
  assert.equal(existsSync(SNAPSHOT), true, '无凭据时配额一到也应写快照')
  const snap = JSON.parse(readFileSync(SNAPSHOT, 'utf8'))
  assert.equal(snap.ok, true)
  assert.ok(snap.quota && snap.quota.keys, '快照应含 quota')
  assert.ok(snap.dsh, '快照应含 dsh 视图')
  assert.equal(snap.official.error, 'NEED_CONFIG', '无凭据时快照记录官方引导状态')

  // 模拟重启:新模块实例 + 磁盘快照保留 → 快照命中秒回(首屏即见上次配额)
  const m2 = await freshHost()
  m2.apply(env.ctx)
  const handle2 = env.handlers.get('ocgo-usage:fetch')
  const s2 = await handle2(null)
  assert.equal(s2.ok, true)
  assert.ok(s2.quota && s2.quota.keys, '重启后快照命中即带上次配额(秒开)')
  assert.ok(s2.stale, '命中快照应标注 stale 供前台提示刷新中')

  // 命中后后台刷新(fetchAll(true))不得把配额写成 null:快照配额已恢复到内存缓存,
  // 等 bgRefresh 完成(50ms 配额延迟)后再次取数,配额应仍在(不闪没)
  await sleep(300)
  const s3 = await handle2(null)
  assert.ok(s3.quota && s3.quota.keys, '后台刷新后配额不应消失(闪没)')
})

// ---------------------------------------------------------------------------
// 7. 口径:DSH 源只统计 opencode-go provider,其它被排除 + 前缀归一
// ---------------------------------------------------------------------------
test('口径:DSH 源只统计 opencode-go provider,价格前缀归一', async () => {
  cleanState()
  writeGoKey()
  const { stub } = makeFetchStub()
  globalThis.fetch = stub
  const sessions = [
    // deepseek 直连(非 Go key)→ 应被排除
    { id: 's1', title: '直连', events: [mkAssistantEvent('deepseek-v4-flash', 'deepseek', mkUsage({ inputTokens: 100000 }))] },
    // opencode-go → 应计入(deepseek-ai/ 前缀应被归一)
    { id: 's2', title: 'Go', events: [mkAssistantEvent('deepseek-ai/deepseek-v4-flash', 'opencode-go', mkUsage({ inputTokens: 100 }))] },
    // 无 source(unknown)→ 应被排除
    { id: 's3', title: '无来源', events: [{ type: 'assistant/message', time: Date.now(), data: { usage: mkUsage({ inputTokens: 50000 }) } }] },
  ]
  const env = makeHostEnv({ dynamic: true, sessions, scanDelay: 40 })
  const m = await freshHost()
  m.apply(env.ctx)
  const handle = env.handlers.get('ocgo-usage:fetch')
  await handle(null)
  await sleep(200) // 等后台扫描完成
  const data = await handle(null)
  assert.equal(data.dsh.total.requests, 1)
  assert.equal(data.dsh.by_model.length, 1)
  assert.equal(data.dsh.by_model[0].model, 'deepseek-v4-flash', 'deepseek-ai/ 前缀应归一为裸模型名')
})

// ---------------------------------------------------------------------------
// 8. 聚合边界:空数据 / time=0 不产生 NaN
// ---------------------------------------------------------------------------
test('聚合:空 DSH 数据不含 NaN,by_day 完整 30 天', async () => {
  cleanState()
  writeGoKey()
  const { stub } = makeFetchStub()
  globalThis.fetch = stub
  const env = makeHostEnv({ dynamic: true, sessions: [] })
  const m = await freshHost()
  m.apply(env.ctx)
  const data = await env.handlers.get('ocgo-usage:fetch')(null)
  assert.equal(data.dsh.total.requests, 0)
  assert.ok(Number.isFinite(data.dsh.total.cost_est))
  assert.ok(Number.isFinite(data.dsh.month.cost_est))
  assert.equal(data.dsh.by_day.length, 30)
  for (const d of data.dsh.by_day) assert.equal(typeof d.cost_est, 'number')
})

test('聚合:time=0 的记录不产生 Invalid/NaN 时间桶', async () => {
  cleanState()
  writeGoKey()
  const { stub } = makeFetchStub()
  globalThis.fetch = stub
  const sessions = [{ id: 's0', title: null, events: [{ type: 'assistant/message', time: 0, data: { usage: mkUsage(), message: { source: { model: 'deepseek-v4-flash', provider: 'opencode-go' } } } }] }]
  const env = makeHostEnv({ dynamic: true, sessions, scanDelay: 40 })
  const m = await freshHost()
  m.apply(env.ctx)
  const handle = env.handlers.get('ocgo-usage:fetch')
  await handle(null)
  await sleep(200)
  const data = await handle(null)
  assert.equal(data.dsh.total.requests, 1)
  assert.ok(Number.isFinite(data.dsh.total.cost_est))
  for (const d of data.dsh.by_day) assert.equal(typeof d.cost_est, 'number')
})

// ---------------------------------------------------------------------------
// 9. i18n:zh/en 字典键完全对齐
// ---------------------------------------------------------------------------
test('i18n:中英字典键完全一致且产物含切换逻辑', () => {
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
// 10. 客户端 bundle 注册形态
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
// 11. 源码级回归门禁
// ---------------------------------------------------------------------------
test('源码:新纯 JS 架构符号在位(手动凭据/快照/fs 别名/常量/DSH 扫描)', () => {
  const src = readFileSync(join(root, 'src', 'host.js'), 'utf8')
  // 手动凭据保存端点与保存逻辑
  assert.ok(src.includes("'/ocgo-usage/config'"), '应提供手动凭据保存端点')
  assert.ok(src.includes('saveOfficialConfig'), '应含手动凭据保存逻辑')
  // 展示快照读写与瘦身
  assert.ok(src.includes('writeSnapshot'), '应含快照写入')
  assert.ok(src.includes('readSnapshot'), '应含快照读取')
  assert.ok(src.includes('delete slim.official.rows'), '快照应剔除 official.rows')
  // 官方明细抓取常量
  assert.ok(src.includes('OCGO_FID'), '应保留官方 server-fn 的 FID 常量')
  assert.ok(src.includes('OCGO_PAGE_SIZE'), '应保留分页大小常量')
  // DSH 扫描持久化
  assert.ok(src.includes('saveDshScan'), '应含 DSH 扫描持久化')
  assert.ok(src.includes('restoreDshScan'), '应含 DSH 扫描恢复')
  // 官方 cost 1e-8 换算 + 配额 URL
  assert.ok(src.includes('costOfficial: (r.cost || 0) / 1e8'), '官方 cost 应按 1e-8 美元换算')
  assert.ok(src.includes('zen/go/v1/usage'), '配额应经 zen/go/v1/usage')
  // 纯 JS 单 key 发现(auth.json 的 opencode-go.key)
  assert.ok(src.includes("'opencode-go'"), '应从 auth.json 读 opencode-go key')

  const lib = readFileSync(join(root, 'lib', 'index.js'), 'utf8')
  // _ocgo* fs 别名注入(bundle 形态)
  assert.ok(lib.includes('_ocgoWriteFileSync'), 'bundle 应注入 writeFileSync 别名')
  assert.ok(lib.includes('_ocgoReadFileSync'), 'bundle 应注入 readFileSync 别名')
  assert.ok(lib.includes('_ocgoMkdirSync'), 'bundle 应注入 mkdirSync 别名')
  assert.ok(lib.includes('_ocgoRenameSync'), 'bundle 应注入 renameSync 别名')
  assert.ok(lib.includes('_ocgoUnlinkSync'), 'bundle 应注入 unlinkSync 别名')
  assert.ok(lib.includes('_ocgoJoin'), 'bundle 应注入 path.join 别名')
  assert.ok(lib.includes('_ocgoHomedir'), 'bundle 应注入 os.homedir 别名')
  assert.ok(lib.includes('collectOfficial'), '产物应包含官方源聚合')
  assert.ok(lib.includes("node:fs"), 'bundle 产物应注入 node:fs')
  // 快照/DSH 扫描文件名
  assert.ok(lib.includes('dsh-opencode-go-usage-snapshot.json'), '应使用快照文件')
  assert.ok(lib.includes('dsh-opencode-go-usage-dshscan.json'), '应使用 DSH 扫描文件')
})

test('源码:已删除的 python/shell/CDP/调试浏览器符号不再出现', () => {
  const src = readFileSync(join(root, 'src', 'host.js'), 'utf8')
  const removedSymbols = [
    'cdp_fetch_cookie',
    'launchDebugBrowser',
    'buildPythonCmd',
    'OCGO_KEYS_JSON',
    'ws_connect',
    'NO_BROWSER',
    'OFFICIAL_SCRIPT',
  ]
  for (const sym of removedSymbols) {
    assert.ok(!src.includes(sym), '已删除符号不应残留: ' + sym)
  }
  assert.ok(!src.includes('import base64'), '不应残留 python base64 导入')
  assert.ok(!src.includes('/ocgo-usage/launch-browser'), '调试浏览器端点应已删除')

  const lib = readFileSync(join(root, 'lib', 'index.js'), 'utf8')
  for (const sym of removedSymbols) {
    assert.ok(!lib.includes(sym), 'bundle 产物不应残留已删除符号: ' + sym)
  }

  // 客户端死代码「一键启动调试浏览器」已清除(src/client.js 与 lib/client.js 都不得残留)
  const removedClientSymbols = [
    'launchBrowser',
    'official.launch',
    '/ocgo-usage/launch-browser',
    'launching',
    'launched',
    'launchFail',
  ]
  const srcClient = readFileSync(join(root, 'src', 'client.js'), 'utf8')
  for (const sym of removedClientSymbols) {
    assert.ok(!srcClient.includes(sym), 'src/client.js 不应残留已删除符号: ' + sym)
  }
  const libClient = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
  for (const sym of removedClientSymbols) {
    assert.ok(!libClient.includes(sym), 'lib/client.js 不应残留已删除符号: ' + sym)
  }
})
