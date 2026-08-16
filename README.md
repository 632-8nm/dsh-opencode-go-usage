<div align="center">

# 📊 OpenCode Go 用量面板

**DeepSeek Harness 插件 — 可拖拽缩放的悬浮仪表盘,实时展示 OpenCode Go 配额、逐请求用量与花费**

> 数据完全本机获取 · API key 不出本机、不进日志 · 官方限额实时监控

![license](https://img.shields.io/badge/license-MIT-blue.svg)
![platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![DSH](https://img.shields.io/badge/DSH-Plugin-4D6BFE)
![dsh-bundle](https://img.shields.io/badge/dsh-bundle%20plugin-4D6BFE)
![tests](https://img.shields.io/badge/tests-14%20passing-brightgreen)

</div>

---

## ✨ 功能一览

| | 能力 | 说明 |
|---|---|---|
| 🖱️ | **悬浮 FAB** | 右下角胶囊,可拖动,实时显示累计金额 + 滚动配额 %(配额 ≥70% 变黄、≥90% 变红);位置越界自动重置 |
| 🪟 | **窗口控制** | 拖标题栏移动、拖边缘/右下角缩放、双击/按钮最大化、淡入动画、位置/大小持久化 |
| 📅 | **今日/本月/累计** | 花费 + 请求数 + token 明细(输入/输出/cache 读) |
| 🏛️ | **官方账户级视图** | 主数据源:直接调官网 `usage.list` API,逐请求官方计费(与官网账单一致,跨设备);凭据**自动提取**(调试端口 CDP,一键启动),零配置 |
| 📊 | **DSH 会话分析** | 保留会话级视角:估算 + 官方逐请求**精确回填**(实测匹配率 83%,金额修正 3.3×) |
| 🍩 | **配额环形图** | 滚动(5 小时)/ 周 / 月官方配额百分比 + **重置倒计时**(如 `3h 45m 后重置`);走独立接口,**明细不可用时也始终显示** |
| 🔮 | **Pace 期末预测** | 按烧速外推窗口期末用量(预计 X%),超速时红色提示**预计耗尽时间**(窗口刚重置时不误报) |
| 📈 | **按模型排行** | 花费降序 + 条状图,点击展开费用分项与来源构成 |
| 📊 | **花费趋势** | 7 / 14 / 30 天柱状图 |
| 🕒 | **最近会话** | 真实标题 + 花费(官方视图按 DSH 会话补标题并按会话聚合,金额为官方回填值) |
| ⚠️ | **配额告警条** | 任一窗口 ≥90% 时面板顶部醒目提示(FAB 同步变色) |
| ⬇️ | **CSV 导出** | 标题栏一键导出当前视图(统计/配额/按模型/最近会话) |
| 🌐 | **中英切换** | 面板标题栏一键切换(EN/中),记忆选择;未手动选择时跟随 DSH 全局语言 |
| ⚡ | **加载性能** | 首次全量抓取约 10-15 秒(12 并发);之后磁盘缓存 0.1s、过期增量刷新 1.5s;会话扫描后台化(5 分钟缓存),60s 轮询(面板开/关均刷新) |

## 📸 界面预览

<img src="docs/screenshot.svg" alt="OpenCode Go 用量面板界面预览" width="640">

> 上图为按真实界面风格绘制的示意图(默认官方视图):视图切换 + 数据源徽标 + 统计 / 配额环形图(独立接口始终显示)/ 按模型 / 趋势 / 最近会话(DSH 会话补标题)+ 右下角 FAB。将实际截图保存为 `docs/screenshot.png` 即可替换预览(该文件已被 `.gitignore` 排除,不会入库)。

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
│  (调试端口 CDP 自动  逐请求官方计费(账户级,跨设备,与官网    │
│   提取,一键启动 /   账单逐模型吻合 ±2%)——面板主数据源      │
│   手动粘贴兜底)                                           │
├──────────────────────────────────────────────────────────┤
│  DSH 会话分析        sessionQuery 事件(仅 opencode-go)     │
│  (估算 + 官方回填)   cache 增量法估算;再与 usage.list 逐    │
│                     请求按 模型+时间+token 匹配,匹配到的    │
│                     行用官方 cost 精确回填(实测匹配率 83%)  │
├──────────────────────────────────────────────────────────┤
│  官方配额接口        opencode.ai/zen/go/v1/usage          │
│  (curl native TLS)  滚动/周/月配额百分比 + 重置时间         │
│  (auth.json key,    不需要 cookie,官方明细不可用时也正常    │
│   始终可用)          显示配额百分比)                       │
└──────────────────────────────────────────────────────────┘
```

- **面板主数据源为官方 `usage.list`**(账户级逐请求官方计费,与官网账单一致、跨设备、不受本地数据丢失影响);`DSH` 视图保留会话级分析
- **抓取上限**:页数上限 5000(默认,约 25 万条,可在配置 `maxPages` 覆盖),超出上限或抓取中途跳页时面板 foot 会标注"数据截断";单页失败只跳过该页,连续 5 页失败才判定数据尽头
- **DSH 金额精度**:先用官方定价估算(cache 按会话增量 × 实测单价 $0.031/M),再与官方逐请求记录按(模型 + ±60s + token ±30%)匹配,匹配到的记录**直接用官方 cost**(实测匹配率 83%,金额从估算 $2.57 修正为官方 $8.44);未匹配的保持估算(如 8-14 数据目录迁移前的丢失会话)
- **来源口径**:DSH 分析只统计 `source.provider == 'opencode-go'`;deepseek 直连、opencode 免费模型等非 Go key 流量不计入
- **官方明细不可用时**:官方视图只显示配额环形图 + 状态横幅(含一键启动按钮与手动粘贴),不显示 DSH 数据充数;DSH 数据仅在 DSH 视图展示
- **对账(仅参考,不判对错)**:官方视图 foot 显示 `官方窗口 vs 本地明细`——配额接口的 percent 按**用量单位**计(部分模型限时 2×,实测 monthly 33%×$60=$19.80 而同一窗口的美元明细仅 $9.71,约差 2 倍),`×$60` 只是参考换算,**与 usage.list 逐请求美元明细不是同一计量基准,不可直接对比**

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
| 刷新 | 标题栏按钮,或等 60s 自动刷新(关闭面板时 FAB 同样 60s 刷新) |

## 📁 项目结构

```
dsh-opencode-go-usage/
├── src/                 # 源码(动态插件函数体,含注释)
│   ├── host.js          #   Host 半区:聚合、缓存、python 数据管道(官方 usage.list/CDP 自动提取)
│   └── client.js        #   Client 半区:shell.overlay FAB + React 仪表盘
├── lib/                 # 构建产物(勿手改)
│   ├── index.js         #   host ESM 入口(注入 node:fs 供凭据保存)
│   └── client.js        #   浏览器注册形态 bundle
├── scripts/
│   ├── build-lib.mjs        # 构建 + 回归门禁(注册形态/harness 守卫断言)
│   ├── start-browser-debug.bat  # 以调试端口 9222 启动独立 Edge(CDP 自动提取用)
│   └── verify-cdp.mjs       # 端到端验证 CDP 提取(从 src/host.js 提取真实函数测试)
├── tests/
│   └── test.mjs         # 14 个用例:聚合、口径过滤、静态降级、bundle 注册、i18n、官方源、失败冷却、增量路径
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
             ┌──────────────┬───────────────┬───────────────┬──────────────┐
             ▼              ▼               ▼               ▼
       sessionQuery    python(自动提取)   curl(官方配额)  python(官方明细)
       DSH 会话事件    CDP 调试端口      usage 百分比    usage.list
       (token+增量)    → auth cookie    (auth.json key) (auth cookie)
```

- Host 半区:动态模式走 `harness.handle` 私有 RPC;bundle 模式走 `webServer` 本地路由
  (`/ocgo-usage/fetch` 取数 + `/ocgo-usage/config` 存凭据 + `/ocgo-usage/launch-browser`
  一键启动调试浏览器)。45s 本地聚合缓存,官方源自带 15 分钟缓存 + 磁盘缓存,失败各自降级互不影响
- 配额接口走 curl native TLS(代理兼容),key 在子进程内从 `auth.json` 读取,**不需要 cookie**,
  官方明细不可用时配额百分比照常显示;官方凭据通过调试端口 CDP 由浏览器自身解密(支持 v20),
  均不进命令日志、不落盘
- 官方明细不可用时,官方视图自动降级显示 DSH 会话数据(配额环形图始终可用),不再整屏"拉取中"
- 构建回归门禁:`build-lib.mjs` 断言客户端注册形态、工厂 `require('react')`、host 无裸 `harness` 引用

## 🛠️ 开发

```sh
npm run build      # 构建 lib 产物 + 回归门禁
npm test           # 14 个用例(node --test,零依赖)
npm run typecheck  # src 语法校验
```

## ❓ 常见问题

**为什么"累计"和官方配额百分比对不上?**
本地"累计"是全部历史记录;官方百分比是 5 小时 / 周 / 月的窗口用量。金额对比请用面板"本月" vs `monthly% × $60`。

**DSH 部分准确吗?**
DSH 会话事件没有官方 cost,先用官方定价估算(cache 按会话增量 × 实测单价);官方明细就绪后**自动与 usage.list 逐请求匹配回填官方 cost**(实测匹配率 83%)。DSH 视图 foot 会显示"官方回填 N 条"。想精确看账户级总额请用"官方"视图。

**codex 流量算不算 Go 用量?**
算。codex 的 `config.toml` 指向 `opencode.ai/zen/go/v1`(同一 Go key),其用量已在官网
`usage.list` 中按请求计费,官方视图与配额百分比天然包含;本地不再单独读 codex 会话(与官网重复)。

**免费模型会被计入吗?**
不会。`*-free`(OpenCode Zen 免费)以及 deepseek 直连等非 opencode-go 流量全部被过滤。

**重启后插件不见了 / 加载不起来?**
动态方式(方式 A)是进程内定义,重启即失(设计如此)。要随 DSH 自动加载请用
方式 B:在 profile 目录执行 `pnpm add link:<插件目录>`(或 `dsh plugin --profile <名> add <目录>`),
并把包名追加进 profile `package.json` 的 `dsh.profile.bundles` 列表(等价于 `dsh plugin`
的 reconcile 步骤),然后重启 DSH。重启后 host 路由与右下角 FAB 自动出现。

**官方视图怎么配置?**
面板"官方"视图直接调官网 `usage.list` 接口(账户级逐请求计费,与官网账单一致),凭据获取
**全自动,只需手动做一次登录**:

**🚀 快速开始(首次只做这三步)**
1. 打开面板,官方视图提示"未找到调试浏览器"时,点击 **"🚀 一键启动调试浏览器并登录"**
   (或双击运行 `scripts/start-browser-debug.bat`)——弹出一个独立 Edge 窗口,不影响日常浏览器
2. 在该窗口里登录一次 opencode.ai
3. 关闭该窗口,刷新面板

之后插件自动探测调试端口(9222–9230),由浏览器自身解密并交出 `auth` cookie,再解析
workspaceId 写入配置——**之后每次启动直接复用,无需再操作**。

**提取方式(仅调试端口 CDP,别无分店)**
- 通过浏览器调试协议读取 cookie,浏览器自身解密,**支持任何加密版本(含新版 v20)**,
  **无需关闭日常浏览器、无需管理员权限、不触碰数据库文件**
- **跨平台**:Windows / macOS / Linux 全部支持(CDP 与平台无关;一键启动自动选择平台
  上已安装的 **Chromium 系浏览器**:Chrome / Edge / Brave / Vivaldi / Opera / Arc /
  Chromium——macOS 用 `open -na`,Linux 自动探测可执行文件,Windows 遍历安装路径。
  Safari / Firefox 的调试协议与 CDP 不兼容,无法用于自动提取)
- 调试浏览器是独立 profile(`~/.ocgo-browser-debug`),登录一次长期有效;
  日常浏览器是否登录过 opencode.ai 都不影响
- **手动粘贴兜底**:错误区仍可粘贴 `authCookie` 和 `workspaceId` 并保存
  - cookie:浏览器 F12 → Application → Cookies → 复制 `auth` 值
  - workspaceId:打开 `https://opencode.ai/workspace/<你的工作区>/usage`,地址栏里的 `wrk_xxx`

**配置与重置**
- 配置保存在 `~/.config/dsh-opencode-go-usage.json`:首次自动提取后生成,之后每次启动
  直接复用,不重复抓取;cookie 失效时面板会自动提示
- **重抓(cookie 过期 / 换账号 / 想彻底重新提取)**:
  1. 删除 `~/.config/dsh-opencode-go-usage.json`(或先改名备份)
  2. 面板点"🚀 一键启动调试浏览器并登录"(或运行 `scripts/start-browser-debug.bat`)
  3. 在调试窗口登录一次 opencode.ai,然后关闭窗口
  4. 刷新面板 —— 插件自动重新提取并重新生成配置
- 也可以随时在面板错误区手动粘贴 `authCookie` + `workspaceId` 直接覆盖

> 为什么只用调试端口方式:新版 Edge/Chrome(v137+)cookie 使用 v20 应用绑定加密,普通用户
> 权限无法从数据库直读;而调试端口方式让浏览器自己解密,**任何版本、任何浏览器都适用**,
> 且不需要关闭任何正在运行的浏览器。注意调试端口开启期间本机其它程序可访问该窗口浏览
> 数据,用完请关闭该窗口。

凭据只在本机使用,不进日志、不发送任何第三方;15 分钟缓存,失败自动降级不影响本地视图。

## 🔒 隐私

- API key **只在本机**由子进程从 `~/.local/share/opencode/auth.json` 读取
- 官方凭据(auth cookie)仅本机提取使用(调试端口 CDP,浏览器自身解密),不进日志、不落盘外传
- 网络请求只发往官网(opencode.ai 配额接口 + usage.list 明细接口),不向任何第三方发送数据
- 不写入、不修改任何数据库(全部 `mode=ro` 只读;调试端口方式由浏览器自身返回 cookie,不触碰数据库文件)

## 📝 变更日志

见 [CHANGELOG.md](CHANGELOG.md)。

## License

[MIT](LICENSE)
