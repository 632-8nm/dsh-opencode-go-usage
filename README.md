<div align="center">

# OpenCode Go 用量面板

**DeepSeek Harness 插件 — 可拖拽缩放的悬浮仪表盘,实时展示 OpenCode Go 配额、逐请求用量与花费**

> A DeepSeek Harness plugin — 数据完全本机获取,API key 不出本机、不进日志。

![license](https://img.shields.io/badge/license-MIT-blue.svg)
![platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![DSH](https://img.shields.io/badge/DSH-Plugin-4D6BFE)
![dsh-bundle](https://img.shields.io/badge/dsh-bundle%20plugin-4D6BFE)

</div>

---

## 这是什么

在 DSH 右下角挂一个悬浮胶囊,点开就是完整的 **OpenCode Go 用量仪表盘**:

- 今日 / 本月 / 累计花费(带请求数与 token 明细)
- 滚动 / 周 / 月 **配额环形图**(官方实时百分比 + 重置时间)
- 按模型花费排行(悬停查看来源构成与 cache 明细)
- 7 / 14 / 30 天花费趋势
- 最近会话列表(真实标题 + 花费)

数据 **完全本机获取**:DSH 会话事件 + opencode 官方数据库 + cc-switch 代理日志 + 官方配额接口。**API key 不出本机、不进日志**。

## 界面预览

```
  ┌────────────────────────────────────┐
  │ OpenCode Go 用量       刷新 最大化 关闭 │  ← 可拖动标题栏,双击最大化
  ├────────────────────────────────────┤
  │ [DSH] [全部]                        │  ← 视图切换
  │ ┌────────┐ ┌────────┐ ┌────────┐   │
  │ │ 今日    │ │ 本月    │ │ 累计    │   │  ← 渐变卡片
  │ │ $0.73  │ │ $4.65  │ │ $2.14  │   │
  │ └────────┘ └────────┘ └────────┘   │
  │   ◔ 30%     ◔ 12%     ◔ 6%         │  ← 配额环形图 + 重置时间
  │ 按模型 · 共 3 个                     │
  │ deepseek-v4-flash  ████████  $2.14 │
  │ gpt-5.6-luna       ██░░░░░░  $0.06 │
  │ 花费趋势         [7天][14天][30天]   │
  │ ▂▃▅▇██▇▅▃▂                        │
  │ 最近会话 …                          │
  └────────────────────────────────────┘
      ↖ 右下角可拖动 FAB 胶囊(金额 + 滚动配额)
```

## 功能特性

| 能力 | 说明 |
|---|---|
| 悬浮入口 | 右下角胶囊,FAB 本身可拖动,显示累计金额 + 滚动配额 % |
| 窗口控制 | 拖标题栏移动、拖边缘/右下角缩放、双击/按钮最大化、淡入动画 |
| 双视图 | **DSH**(仅 DSH 会话)/ **全部**(DSH + opencode 官方记录 + codex) |
| 精确费用 | opencode 逐请求官方 cost + codex 代理记录,DSH 按公开定价估算 |
| 配额监控 | 滚动/周/月官方配额百分比与重置时间 |
| 自动刷新 | 面板打开时 60s 定时 + 即时刷新,关闭时不再后台轮询;45s Host 缓存 |

## 数据来源与口径

```
┌──────────────────────────────────────────────────────────┐
│  DSH 会话事件        assistant/message 事件携带真实 token  │
│  (sessionQuery)      用量与模型/provider(仅统计 opencode-go │
│                      provider 的会话,其它 provider 不计入)  │
├──────────────────────────────────────────────────────────┤
│  opencode 官方库     part 表 step-finish 逐请求记录,含     │
│  (opencode.db)       官方计算的 cost(仅 opencode-go)      │
├──────────────────────────────────────────────────────────┤
│  cc-switch 代理日志  proxy_request_logs 中 codex 流量      │
│  (cc-switch.db)      (同一 Go key 的逐请求记录)            │
├──────────────────────────────────────────────────────────┤
│  官方配额接口        opencode.ai/zen/go/v1/usage          │
│  (curl native TLS)  滚动/周/月配额百分比 + 重置时间         │
└──────────────────────────────────────────────────────────┘
```

- **金额口径**:opencode / codex 为官方或代理记录的精确 cost;**DSH 部分按校准定价表估算**(deepseek-v4-flash 单价从本机 opencode-go 真实计费行拟合,其余模型为公开价;输入/输出/cache 读/写按每百万 token 单价计算),面板底部有标注
- **来源口径**:三个来源均**只统计 opencode-go provider 的流量**(DSH 会话按 `source.provider == 'opencode-go'` 过滤,opencode.db 按 `session.model.providerID == 'opencode-go'` 过滤,cc-switch 只取 codex 应用日志);deepseek 直连、opencode 免费模型等非 Go key 流量一律不计入
- **免费模型**:`*-free`(OpenCode Zen 免费)不计入,只统计 **opencode-go** 付费流量
- **请求次数**:opencode 部分为逐请求(step-finish)计数,与 DSH 的逐次调用同口径

## 安装

### 方式 A:会话内动态加载(推荐,免构建)

1. 打开 DSH 会话,让 Agent 执行 `cordis_define`(kind: new, idPrefix: `zenus`)
2. 将 [`src/host.js`](src/host.js) 内容粘贴为 `code.host`,将 [`src/client.js`](src/client.js) 内容粘贴为 `code.client`
3. `cordis_run` 授权后,右下角出现 FAB 胶囊

### 方式 B:Bundle 插件(官方安装方式)

> ⚠️ **当前平台限制**:客户端↔宿主 RPC(`harness.handle` / `host.call`)是
> DSH **动态包(dcordis)专属**能力;静态 bundle 插件没有该桥,因此**方式 B 目前
> 无法取数** —— 面板会正常加载并弹出,但显示“host RPC 桥不可用”的明确提示。
> 完整功能请使用方式 A(会话内动态加载)。bundle 形态保持可安装、可注册、可加载,
> 等 DSH 开放静态插件的包私有 RPC 后即可直接启用。

```sh
git clone https://github.com/Xenia0922/dsh-opencode-go-usage.git
cd dsh-opencode-go-usage

# 从父目录安装进 profile 并启动
dsh plugin --profile my-profile add ./dsh-opencode-go-usage
dsh --profile my-profile
```

`package.json` 已声明官方 bundle 字段(`dsh.bundle.patch -> cordis.patch.yml`),安装后插件行自动注册(`opencode-go-usage`)。构建产物由 `npm run build`(`scripts/build-lib.mjs`)生成:host 端为 ESM 入口(`lib/index.js`),浏览器端为符合 `window.__ModuleLoader__.load({ id, factory })` 注册协议的 bundle(`lib/client.js`)。

## 使用

| 操作 | 效果 |
|---|---|
| 点击胶囊 | 打开面板(从胶囊位置展开) |
| 拖动胶囊 | 移动入口位置 |
| 拖标题栏 / 双击 | 移动 / 最大化还原 |
| 拖右缘 / 底缘 / 右下角 | 调整宽度 / 高度 / 整体缩放 |
| 视图切换 | DSH / 全部 |
| 悬停模型行 | 来源构成 + token 明细 |
| 刷新 | 标题栏按钮,或等 60s 自动刷新 |

## 技术架构

```
┌─────────────┐   host.call('ocgo-usage:fetch')   ┌─────────────┐
│  Client 半区 │ ────────────────────────────────▶ │  Host 半区   │
│  shell.overlay│                                 │  harness.handle│
│  React 仪表盘 │ ◀──────────────────────────────── │  聚合 + 缓存  │
└─────────────┘      JSON(纯数据,无 live 对象)      └──────┬──────┘
                                                     │
                              ┌──────────────────────┼──────────────────────┐
                              ▼                      ▼                      ▼
                    sessionQuery              python(只读 sqlite)       curl(官方配额)
                    DSH 会话事件               opencode.db + cc-switch    auth.json key
                                              (mode=ro, 零写入)          (进程内读取)
```

- Host 半区:`harness.handle` 注册 RPC(动态模式),45s 进程内缓存,三数据源并行拉取,有界并发(4)读取会话,同一时刻只跑一次全量聚合
- Python 子进程只读打开 SQLite(`?mode=ro`),沙箱/代理环境下稳定
- 配额走 curl native TLS(代理兼容),key 在 pwsh/python 进程内从 `auth.json` 读取,不经过命令字符串、不落盘

## 依赖

- DeepSeek Harness(DSH)桌面版
- opencode 桌面版/CLI(数据源:`~/.local/share/opencode/opencode.db`)
- Python 3(读取 SQLite,自动探测 `E:\python\python.exe` 或 PATH)
- Windows 自带 `curl.exe`(配额接口)
- 可选:cc-switch(提供 codex 流量记录;缺失时仅该部分显示警告)

## 隐私

- API key **只在本机**由子进程从 `~/.local/share/opencode/auth.json` 读取
- 不向任何第三方发送数据(唯一网络请求是配额接口本身,携带官方 Bearer key)
- 不写入、不修改任何数据库(全部 `mode=ro` 只读)

## License

[MIT](LICENSE)
