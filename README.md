<div align="center">

# 📊 OpenCode Go 用量面板

**DeepSeek Harness 插件 — 可拖拽缩放的悬浮仪表盘,实时展示 OpenCode Go 配额、逐请求用量与花费**

> 数据完全本机获取 · API key 不出本机、不进日志 · 官方限额实时监控

![license](https://img.shields.io/badge/license-MIT-blue.svg)
![platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![DSH](https://img.shields.io/badge/DSH-Plugin-4D6BFE)
![dsh-bundle](https://img.shields.io/badge/dsh-bundle%20plugin-4D6BFE)
![tests](https://img.shields.io/badge/tests-10%20passing-brightgreen)

</div>

---

## ✨ 功能一览

| | 能力 | 说明 |
|---|---|---|
| 🖱️ | **悬浮 FAB** | 右下角胶囊,可拖动,实时显示累计金额 + 滚动配额 %(配额 ≥70% 变黄、≥90% 变红) |
| 🪟 | **窗口控制** | 拖标题栏移动、拖边缘/右下角缩放、双击/按钮最大化、淡入动画、位置/大小持久化 |
| 📅 | **今日/本月/累计** | 花费 + 请求数 + token 明细(输入/输出/cache 读) |
| 🏛️ | **官方账户级视图** | 主数据源:直接调官网 `usage.list` API,逐请求官方计费(与官网账单一致,跨设备);凭据**自动从 Edge 提取**,零配置 |
| 📊 | **DSH 会话分析** | 保留会话级视角:估算 + 官方逐请求**精确回填**(实测匹配率 83%,金额修正 3.3×) |
| 🍩 | **配额环形图** | 滚动(5 小时)/ 周 / 月官方配额百分比 + **重置倒计时**(如 `3h 45m 后重置`) |
| 🔮 | **Pace 期末预测** | 按烧速外推窗口期末用量(预计 X%),超速时红色提示**预计耗尽时间**(窗口刚重置时不误报) |
| 📈 | **按模型排行** | 花费降序 + 条状图,点击展开费用分项与来源构成 |
| 📊 | **花费趋势** | 7 / 14 / 30 天柱状图 |
| 🕒 | **最近会话** | 真实标题 + 花费 |
| ⚠️ | **配额告警条** | 任一窗口 ≥90% 时面板顶部醒目提示(FAB 同步变色) |
| ⬇️ | **CSV 导出** | 标题栏一键导出当前视图(统计/配额/按模型/最近会话) |
| 🌐 | **中英切换** | 面板标题栏一键切换(EN/中),记忆选择;未手动选择时跟随 DSH 全局语言 |
| 🔄 | **自动刷新** | 面板打开时 60s 定时 + 即时刷新;关闭时零后台轮询;45s Host 缓存 |

## 📸 界面预览

<img src="docs/screenshot.svg" alt="OpenCode Go 用量面板界面预览" width="640">

> 上图为按真实界面绘制的示意图(DSH 视图)。将实际截图保存为 `docs/screenshot.png` 即可替换预览(该文件已被 `.gitignore` 排除,不会入库)。

## 📋 官方限额与定价(2026-08)

OpenCode Go 的限额与定价来自 [opencode.ai/docs/go](https://opencode.ai/docs/go),面板的配额百分比与 DSH 估算均以此为基准:

| 窗口 | 限额 | 换算示例 |
|---|---|---|
| **5 小时(滚动)** | **$12** 用量 | 10% ≈ $1.20 |
| **每周** | **$30** 用量 | 16% ≈ $4.80 |
| **每月** | **$60** 用量 | 8% ≈ $4.80 |

**模型定价**(per 1M tokens,部分常用模型):

| 模型 | 输入 | 输出 | Cache 读 | Cache 写 |
|---|---|---|---|---|
| DeepSeek V4 Flash | $0.14 | $0.28 | $0.031(实测) | — |
| DeepSeek V4 Pro | $0.435 | $0.87 | $0.003625 | — |
| GPT 5.6 Luna | $0.20 | $1.20 | $0.02 | $0.25 |
| GLM-5.2 | $1.40 | $4.40 | $0.26 | — |
| Kimi K3 | $3.00 | $15.00 | $0.30 | — |
| MiniMax M3 | $0.30 | $1.20 | $0.06 | — |
| …(共 26 个模型,详见源码 `PRICING` 表) | | | | |

## 🗄️ 数据来源与口径

```
┌──────────────────────────────────────────────────────────┐
│  官方用量明细        opencode.ai/_server usage.list        │
│  (Edge cookie 自动   逐请求官方计费(账户级,跨设备,与官网    │
│   提取 / 手动粘贴)   账单逐模型吻合 ±2%)——面板主数据源      │
├──────────────────────────────────────────────────────────┤
│  DSH 会话分析        sessionQuery 事件(仅 opencode-go)     │
│  (估算 + 官方回填)   cache 增量法估算;再与 usage.list 逐    │
│                     请求按 模型+时间+token 匹配,匹配到的    │
│                     行用官方 cost 精确回填(实测匹配率 83%)  │
├──────────────────────────────────────────────────────────┤
│  官方配额接口        opencode.ai/zen/go/v1/usage          │
│  (curl native TLS)  滚动/周/月配额百分比 + 重置时间         │
└──────────────────────────────────────────────────────────┘
```

- **面板主数据源为官方 `usage.list`**(账户级逐请求官方计费,与官网账单一致、跨设备、不受本地数据丢失影响);`DSH` 视图保留会话级分析
- **DSH 金额精度**:先用官方定价估算(cache 按会话增量 × 实测单价 $0.031/M),再与官方逐请求记录按(模型 + ±60s + token ±30%)匹配,匹配到的记录**直接用官方 cost**(实测匹配率 83%,金额从估算 $2.57 修正为官方 $8.44);未匹配的保持估算(如 8-14 数据目录迁移前的丢失会话)
- **来源口径**:DSH 分析只统计 `source.provider == 'opencode-go'`;deepseek 直连、opencode 免费模型等非 Go key 流量不计入
- **对账**:官方视图 foot 显示 `官方月估算 vs 明细合计`(quota monthly% × $60 vs usage.list 本月)

## 🚀 安装

### 方式 A:会话内动态加载(快速体验,免构建)

1. 打开 DSH 会话,让 Agent 执行 `cordis_define`(kind: new, idPrefix: `zenus`)
2. 将 [`src/host.js`](src/host.js) 内容粘贴为 `code.host`,将 [`src/client.js`](src/client.js) 内容粘贴为 `code.client`
3. `cordis_run` 授权后,右下角出现 FAB 胶囊

> ⚠️ 动态定义只活在当前进程,**DSH 重启后丢失**;想长期使用请用方式 B。

### 方式 B:Bundle 插件(推荐,随 DSH 启动自动加载)

> host 半区注册本地 HTTP 路由(`webServer` → `/ocgo-usage/fetch`),客户端同源
> `fetch` 取数——**bundle 形态功能完整**,且随 DSH 启动自动加载,无需每次会话重建。
> 动态方式(方式 A)仍走 `harness.handle` / `host.call` 私有 RPC,两种形态共用同一套聚合逻辑。

```sh
git clone https://github.com/Xenia0922/dsh-opencode-go-usage.git
cd dsh-opencode-go-usage

# 从父目录安装进 profile 并启动
dsh plugin --profile my-profile add ./dsh-opencode-go-usage
dsh --profile my-profile
```

> 💡 插件目录路径含**空格**时 `dsh plugin add` 会解析失败(如 `D:\Opencode view\...`):
> 先把目录放到无空格路径(如 junction 链接到 `C:\Users\<你>\dsh-plugin-src\...`),
> 再 `cd` 到 profile 目录用 `pnpm add link:<无空格路径>` 安装。

`dsh plugin add` 会执行 `pnpm add` 并把声明了 `dsh.bundle` 的包写进
`dsh.profile.bundles`;bundle 的 `cordis.patch.yml` 随后插入插件行
(`inject: ['webServer']` 等待服务就绪),host 聚合路由与客户端 UI 随 DSH
启动自动注册。若 `dsh` CLI 不可用,可手动等价操作(见下方 FAQ)。

`package.json` 已声明官方 bundle 字段(`dsh.bundle.patch -> cordis.patch.yml`);构建产物由 `npm run build` 生成(host ESM + 浏览器注册形态 bundle)。

### 方式 C:把链接丢给 AI 装(最省事)

把下面这句话复制给任意 AI(DSH 会话里的),它自己会 clone、安装并告诉你重启:

> 帮我安装 https://github.com/Xenia0922/dsh-opencode-go-usage 这个 DSH 插件:按仓库 README 的方式 B 装进我的 DSH profile(数据目录以 DSH_HOME 环境变量为准),装完告诉我需要重启 DSH

AI 会读本 README,自己完成 clone、`pnpm add link:`、写 `dsh.profile.bundles` 等步骤——你只需要等它说"重启吧"。

## 🕹️ 使用

| 操作 | 效果 |
|---|---|
| 点击胶囊 | 打开面板(从胶囊位置展开) |
| 拖动胶囊 | 移动入口位置 |
| 拖标题栏 / 双击 | 移动 / 最大化还原 |
| 拖右缘 / 底缘 / 右下角 | 调整宽度 / 高度 / 整体缩放 |
| 视图切换 | **官方** / DSH |
| 点击 🌐 | 面板界面中/英切换(记忆选择,可随时切回) |
| 点击 ⬇ | 导出当前视图为 CSV(统计 / 配额 / 按模型 / 最近会话) |
| 点击模型行 | 展开费用分项(输入/输出/cache)与来源构成 |
| 刷新 | 标题栏按钮,或等 60s 自动刷新 |

## 📁 项目结构

```
dsh-opencode-go-usage/
├── src/                 # 源码(动态插件函数体,含注释)
│   ├── host.js          #   Host 半区:聚合、缓存、python 数据管道(本地库/jsonl/官方 usage.list/Edge 自动提取)
│   └── client.js        #   Client 半区:shell.overlay FAB + React 仪表盘
├── lib/                 # 构建产物(勿手改)
│   ├── index.js         #   host ESM 入口(注入 node:fs 供凭据保存)
│   └── client.js        #   浏览器注册形态 bundle
├── scripts/
│   └── build-lib.mjs    # 构建 + 回归门禁(注册形态/harness 守卫断言)
├── tests/
│   └── test.mjs         # 10 个用例:聚合、口径过滤、静态降级、bundle 注册、i18n、官方源
├── cordis.patch.yml     # bundle 补丁层(插入插件行,inject webServer)
├── package.json         # dsh.bundle / dsh.client 声明
└── README.md
```

## 🏗️ 技术架构

```
┌─────────────┐   ① harness.handle / host.call(动态包)   ┌─────────────┐
│  Client 半区 │ ─────────────────────────────────────▶ │  Host 半区   │
│  shell.overlay│   ② fetch('/ocgo-usage/fetch')(bundle) │  webServer   │
│  React 仪表盘 │ ─────────────────────────────────────▶ │  路由 + 聚合  │
└─────────────┘         JSON(纯数据,无 live 对象)         └──────┬──────┘
                                                             │
             ┌──────────────┬───────────────┬───────────────┼──────────────┐
             ▼              ▼               ▼               ▼              ▼
       sessionQuery    python(只读)     python(直读)    curl(官方配额)  python(官方明细)
       DSH 会话事件     opencode.db      codex jsonl     usage 百分比    usage.list
       (token+增量)     (官方 cost)      (官方定价)      (auth.json key) (Edge cookie)
```

- Host 半区:动态模式走 `harness.handle` 私有 RPC;bundle 模式走 `webServer` 本地路由
  (`/ocgo-usage/fetch` 取数 + `/ocgo-usage/config` 存凭据)。45s 本地聚合缓存,
  官方源自带 15 分钟缓存,五数据源并行拉取,失败各自降级互不影响
- Python 子进程只读打开 SQLite(`?mode=ro`)或解析 codex jsonl;配额走 curl native TLS
  (代理兼容),key 在子进程内从 `auth.json` 读取;官方凭据自动从 Edge cookie 库
  解密(DPAPI + AES-GCM,仅本机),均不进命令日志、不落盘
- 构建回归门禁:`build-lib.mjs` 断言客户端注册形态、工厂 `require('react')`、host 无裸 `harness` 引用

## 🛠️ 开发

```sh
npm run build      # 构建 lib 产物 + 回归门禁
npm test           # 10 个用例(node --test,零依赖)
npm run typecheck  # src 语法校验
```

## ❓ 常见问题

**为什么"累计"和官方配额百分比对不上?**
本地"累计"是全部历史记录;官方百分比是 5 小时 / 周 / 月的窗口用量。金额对比请用面板"本月" vs `monthly% × $60`。

**DSH 部分准确吗?**
DSH 会话事件没有官方 cost,先用官方定价估算(cache 按会话增量 × 实测单价);官方明细就绪后**自动与 usage.list 逐请求匹配回填官方 cost**(实测匹配率 83%)。DSH 视图 foot 会显示"官方回填 N 条"。想精确看账户级总额请用"官方"视图。

**codex 流量算不算 Go 用量?**
算。codex 的 `config.toml` 指向 `opencode.ai/zen/go/v1`(同一 Go key)。插件**直接读 `~/.codex/sessions/**/*.jsonl`** 会话记录(不依赖 cc-switch 运行),与 cc-switch 记录对账差异 <0.1%。

**免费模型会被计入吗?**
不会。`*-free`(OpenCode Zen 免费)以及 deepseek 直连等非 opencode-go 流量全部被过滤。

**重启后插件不见了 / 加载不起来?**
动态方式(方式 A)是进程内定义,重启即失(设计如此)。要随 DSH 自动加载请用
方式 B:在 profile 目录执行 `pnpm add link:<插件目录>`(或 `dsh plugin --profile <名> add <目录>`),
并把包名追加进 profile `package.json` 的 `dsh.profile.bundles` 列表(等价于 `dsh plugin`
的 reconcile 步骤),然后重启 DSH。重启后 host 路由与右下角 FAB 自动出现。

**官方视图怎么配置?**
面板"官方"视图直接调官网 `usage.list` 接口(账户级逐请求计费,与官网账单一致),凭据获取**全自动,任意浏览器**:

1. **零操作(推荐)**:只要用 **Edge / Chrome / Chromium / Brave / Vivaldi / Arc / Opera / Firefox** 任一浏览器登录过 `opencode.ai`,插件自动从浏览器 cookie 库提取 `auth` cookie 并解析 workspaceId(Chromium 系 DPAPI + AES-GCM 解密,Firefox 明文直读,全部本机处理)。浏览器正在运行时会提示"关闭浏览器后刷新",关闭后自动完成
2. **手动兜底**:面板官方视图的错误区可直接粘贴 `authCookie` 和 `workspaceId` 并保存
   - cookie:浏览器 F12 → Application → Cookies → 复制 `auth` 值
   - workspaceId:打开 `https://opencode.ai/workspace/<你的工作区>/usage`,地址栏里的 `wrk_xxx`
3. 配置保存在 `~/.config/dsh-opencode-go-usage.json`(cookie 失效后自动重新提取或按上述更新)

> 提示:新版 Chrome/Edge 的 v20 加密暂不支持自动提取(会提示手动粘贴);Chromium 系浏览器提取前需先关闭该浏览器(cookie 数据库锁定)。

凭据只在本机使用,不进日志、不发送任何第三方;15 分钟缓存,失败自动降级不影响本地视图。

## 🔒 隐私

- API key **只在本机**由子进程从 `~/.local/share/opencode/auth.json` 读取
- 官方凭据(Edge cookie)仅本机解密使用(DPAPI + AES-GCM),不进日志、不落盘外传
- 网络请求只发往官网(opencode.ai 配额接口 + usage.list 明细接口),不向任何第三方发送数据
- 不写入、不修改任何数据库(全部 `mode=ro` 只读)

## 📝 变更日志

见 [CHANGELOG.md](CHANGELOG.md)。

## License

[MIT](LICENSE)
