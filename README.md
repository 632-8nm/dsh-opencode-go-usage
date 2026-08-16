<p align="center">
  <img src="assets/banner.svg" width="100%" alt="dsh-opencode-go-usage — OpenCode Go 用量与花费面板" />
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-4d6bfe" alt="license: MIT" /></a>
  <a href="https://github.com/Xenia0922/dsh-opencode-go-usage"><img src="https://img.shields.io/badge/version-v1.6.18-22c3a6" alt="最新版本" /></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-2a3558" alt="平台" />
  <img src="https://img.shields.io/badge/runtime-DSH%20plugin-4d6bfe" alt="运行时：DSH 插件" />
  <img src="https://img.shields.io/badge/tests-15%20passing-22c3a6" alt="测试：15 通过" />
</p>

# OpenCode Go 用量面板

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件——可拖拽缩放的悬浮仪表盘,实时展示 OpenCode Go 配额、逐请求用量与花费。

> 由 Xenia0922 维护。数据完全本机获取,API key 不出本机、不进日志。

## 特性

- **悬浮 FAB**:右下角胶囊,可拖动,实时显示累计金额 + 滚动配额 %(≥70% 变黄、≥90% 变红);**面板开/关都 60s 自动刷新**;位置越界自动重置
- **窗口控制**:拖标题栏移动、拖边缘/右下角缩放、双击/按钮最大化、位置/大小持久化
- **官方账户级视图(主数据源)**:直接调官网 `usage.list`,逐请求官方计费(与官网账单一致、跨设备);凭据**自动提取**(调试端口 CDP,一键启动),零配置
- **DSH 会话分析**:会话级视角,官方定价估算 + 与 `usage.list` 逐请求**精确回填**(实测匹配率 83%)
- **配额环形图**:滚动(5h)/ 周 / 月配额 % + 重置倒计时;**明细不可用时也始终显示**;超速时红色提示预计耗尽时间
- **按模型排行 / 花费趋势 / 最近会话**:花费降序条状图 + 费用分项展开、7/14/30 天柱状图、真实会话标题
- **配额告警条**:任一窗口 ≥90% 面板顶部醒目提示
- **中英切换 / CSV 导出**:面板标题栏一键切换(记忆选择,未选择时跟随 DSH 语言)、导出当前视图统计

## 界面预览

<img src="docs/screenshot.svg" alt="OpenCode Go 用量面板界面预览" width="640">

> 上图为按真实界面风格绘制的示意图(默认官方视图)。将实际截图保存为 `docs/screenshot.png` 即可替换预览(该文件已被 `.gitignore` 排除,不会入库)。

## 安装

### 方式 A:会话内动态加载(快速体验,免构建)

1. 打开 DSH 会话,让 Agent 执行 `cordis_define`(kind: new, idPrefix: `zenus`)
2. 将 [`src/host.js`](src/host.js) 内容粘贴为 `code.host`,将 [`src/client.js`](src/client.js) 内容粘贴为 `code.client`
3. `cordis_run` 授权后,右下角出现 FAB 胶囊

> ⚠️ 动态定义只活在当前进程,**DSH 重启后丢失**;想长期使用请用方式 B。

### 方式 B:Bundle 插件(推荐,随 DSH 启动自动加载)

```sh
git clone https://github.com/Xenia0922/dsh-opencode-go-usage.git
cd dsh-opencode-go-usage

# 从父目录安装进 profile 并启动
dsh plugin --profile my-profile add ./dsh-opencode-go-usage
dsh --profile my-profile
```

- host 半区注册本地 HTTP 路由(`webServer` → `/ocgo-usage/fetch`),客户端同源 `fetch` 取数,随 DSH 启动自动注册
- `dsh plugin add` 会执行 `pnpm add` 并写入 `dsh.profile.bundles`;构建产物由 `npm run build` 生成(host ESM + 浏览器注册形态 bundle)
- 💡 插件目录路径含**空格**时 `dsh plugin add` 会解析失败(如 `D:\Opencode view\...`):先把目录放到无空格路径(如 junction 链接到 `C:\Users\<你>\dsh-plugin-src\...`)

### 方式 C:把链接丢给 AI 装(最省事)

把下面这句话复制给任意 AI(DSH 会话里的),它自己会 clone、安装并告诉你重启:

> 帮我安装 https://github.com/Xenia0922/dsh-opencode-go-usage 这个 DSH 插件:按仓库 README 的方式 B 装进我的 DSH profile(数据目录以 DSH_HOME 环境变量为准),装完告诉我需要重启 DSH

## 使用

| 操作 | 效果 |
|---|---|
| 点击胶囊 | 打开面板(从胶囊位置展开) |
| 拖动胶囊 / 拖标题栏 / 双击 | 移动 / 最大化还原 |
| 拖右缘 / 底缘 / 右下角 | 调整宽度 / 高度 / 整体缩放 |
| 视图切换 | **官方** / DSH |
| 点击 🌐 / ⬇ / 刷新 | 中英切换(记忆选择)/ 导出 CSV / 手动刷新(或等 60s 自动) |
| 点击模型行 | 展开费用分项(输入/输出/cache)与来源构成 |

## 数据来源与口径

```
┌──────────────────────────────────────────────────────────┐
│  官方用量明细   opencode.ai/_server usage.list            │
│  (CDP 自动提取   逐请求官方计费(账户级,跨设备,与官网账单    │
│   cookie,一键    一致)——面板主数据源                      │
│   启动 / 手动粘贴)                                        │
├──────────────────────────────────────────────────────────┤
│  DSH 会话分析   sessionQuery 事件(仅 opencode-go)         │
│  (估算 + 官方    cache 增量法估算;再与 usage.list 按       │
│   回填)          模型+时间+token 匹配精确回填(匹配率 83%)  │
├──────────────────────────────────────────────────────────┤
│  官方配额接口   opencode.ai/zen/go/v1/usage              │
│  (curl native  滚动/周/月配额 % + 重置时间,               │
│   TLS)         auth.json key,不需要 cookie,明细不可用时   │
│                也始终显示)                                │
└──────────────────────────────────────────────────────────┘
```

- **真实性优先**:官方视图**不秒开磁盘缓存旧数据**——磁盘缓存仅作增量基准,真实数据(增量 1-3s / 首次全量 10-15s)到位前显示"加载中";DSH 视图同理,扫描后台化完成前显示"扫描中"
- **DSH 金额精度**:先用官方定价估算(cache 按会话增量 × 实测单价 $0.031/M),再与官方逐请求记录按(模型 + ±60s + token ±30%)匹配,匹配到的记录**直接用官方 cost**;未匹配的保持估算
- **来源口径**:DSH 分析只统计 `source.provider == 'opencode-go'`;deepseek 直连等非 Go key 流量不计入;`*-free` 免费模型不计数
- **对账(仅参考)**:foot 显示 `官方窗口 vs 本地明细`——配额接口按**用量单位**计(部分模型限时 2×),`×$60` 只是参考换算,与美元明细不是同一计量基准,不可直接对比
- **抓取上限**:页数上限 5000(约 25 万条,可配置 `maxPages` 覆盖),超出或跳页时 foot 标注"数据截断";单页失败跳过,连续 5 页失败才判定数据尽头
- **失败降级**:官方失败 60s 冷却自动重试(错误透传面板);增量/扫描失败写入诊断日志 `~/.config/dsh-opencode-go-usage.log`;配额与明细互不影响

## 开发

```sh
npm run build      # 构建 lib 产物 + 回归门禁(注册形态 / harness 守卫断言)
npm test           # 15 个用例(node --test,零依赖;测试 HOME 完全隔离)
npm run typecheck  # src 语法校验
```

```
src/host.js    # Host 半区:聚合、缓存、python 数据管道(usage.list/CDP 自动提取/增量)
src/client.js  # Client 半区:shell.overlay FAB + React 仪表盘(可拖拽缩放)
lib/           # 构建产物(勿手改):host ESM 入口 + 浏览器注册形态 bundle
scripts/       # build-lib.mjs(构建+回归门禁)、verify-cdp.mjs(CDP 端到端验证)
tests/         # 15 个用例:聚合、口径过滤、静态降级、bundle 注册、i18n、官方源、失败冷却、增量路径
cordis.patch.yml  # bundle 补丁层(插入插件行,inject webServer)
```

## 常见问题

**重启后插件不见了?**
动态方式(方式 A)是进程内定义,重启即失(设计如此)。要随 DSH 自动加载请用方式 B:在 profile 目录执行 `pnpm add link:<插件目录>`,并把包名追加进 profile `package.json` 的 `dsh.profile.bundles`,然后重启 DSH。

**官方视图怎么配置?** 全自动,只需手动做一次登录:点"🚀 一键启动调试浏览器并登录"→ 在弹出的独立窗口登录 opencode.ai → 关闭窗口 → 刷新面板。插件通过调试端口 CDP 由浏览器自身解密并提取 `auth` cookie(支持任何加密版本,无需关闭日常浏览器),之后长期复用;cookie 失效时面板自动提示,也可手动粘贴 `authCookie` + `workspaceId`。

**为什么"累计"和官方配额百分比对不上?**
本地"累计"是全部历史记录的美元明细;官方百分比是 5 小时/周/月的**用量单位**窗口(部分模型限时 2×)。金额对比请用面板"本月" vs 官方窗口换算,且两者计量基准不同,仅作参考。

**codex 流量算不算 Go 用量?**
算。codex 的 `config.toml` 指向 `opencode.ai/zen/go/v1`(同一 Go key),其用量已在官网 `usage.list` 中按请求计费,官方视图与配额百分比天然包含。

## 隐私

- API key **只在本机**由子进程从 `~/.local/share/opencode/auth.json` 读取
- 官方凭据(auth cookie)仅本机提取使用(调试端口 CDP),不进日志、不落盘外传
- 网络请求只发往官网(opencode.ai),不向任何第三方发送数据

## 许可证

[MIT](LICENSE)——版权归 Xenia0922。

## 变更日志

见 [CHANGELOG.md](CHANGELOG.md)。
