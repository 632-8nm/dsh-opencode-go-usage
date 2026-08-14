# 变更日志

本项目的所有显著变更。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/),版本遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [1.1.0] - 2026-08-15

### 修复(bundle 形态随 DSH 自动加载)
- **bundle 持久安装**:此前 `dsh plugin add` 实际未把包装进 profile(package.json 无依赖、无 node_modules),重启后插件丢失;现在通过 profile 内 `pnpm add link:` + `dsh.profile.bundles` 收录,插件随 DSH 启动自动加载
- **bundle 取数通道**:host 半区注册 `webServer` 本地路由 `/ocgo-usage/fetch`,客户端同源 `fetch` 取数;`cordis.patch.yml` 插件行 `inject: ['webServer']` 确保服务就绪后才注册(此前 bundle 形态只能显示"RPC 桥不可用"占位)
- **修正安装目标**:DSH 实际读取的 profile 位于 `DSH_HOME`(Windows 常见 `%APPDATA%\DeepSeek Harness\data\dsh`)而非 `~/.dsh`;此前一次 `dsh plugin add` 因路径含空格被拆成两个参数,在真实 profile 里留下了坏链接(`Opencode → link:D:/Opencode`、`dsh-opencode-go-usage → link:view\...`),现已在真实 profile 修正为正确的 `link:` 并重新链接
- 动态方式(方式 A)与 bundle 方式(方式 B)共用同一套聚合逻辑,均可用

### 文档
- README:方式 B 更新为"功能完整"并改为推荐;新增方式 C(把仓库链接丢给 AI 装);新增 FAQ「重启后插件不见了?」;新增界面预览图 `docs/screenshot.svg`

## [1.0.0] - 2026-08-14

### 修复(数据准确性,多轮实机对账)
- **恢复官方定价口径**:DSH 估算改用 [opencode.ai/docs/go](https://opencode.ai/docs/go) 官方定价表(此前一度使用本机最小二乘拟合价,与官方价偏差大;cache 写单价 0.253 → 官方 0)
- **PRICING 补全全部 26 个官方模型**:新增 kimi-k3、minimax-m3、glm-5.3/5.1、kimi-k2.6、mimo-v2.5-pro、minimax-m2.7/2.5、qwen3.8-max/3.7-max/3.7-plus/3.6-plus、grok-4.5、hy3;修正 mimo-v2.5 输出价(0.29 → 0.28)
- **codex 源口径修正**:codex 的 `config.toml` 指向 `opencode.ai/zen/go/v1`(同一 Go key),代理与直连会话均计入(此前一度误排除直连会话,与官方 weekly/monthly 配额缺口吻合后恢复)
- **DSH 源 provider 过滤**:只统计 `source.provider == 'opencode-go'`,排除 deepseek 直连等非 Go key 流量(此前未过滤导致虚增)
- **配额对账**:本地"本月"合计与官方 `monthly% × $60`(月限额 $60)误差约 3–5%

### 界面
- 移除"按来源"板块(与数据源徽标重复,provider 命名易误导)

### 构建与质量
- `build-lib.mjs` 回归门禁:断言客户端 `window.__ModuleLoader__.load` 注册形态、工厂 `require('react')`、host 无裸 `harness` 引用
- 新增 `tests/test.mjs`(8 个用例,`node --test` 零依赖):聚合、口径过滤、静态降级、bundle 注册冒烟
- 修复 `btoa` 对非 ASCII 抛 `InvalidCharacterError`(PY 脚本含中文标题)→ `utf8B64`(TextEncoder 预编码)
- 修复 collectDb 复合失败时 codex 源被误标为"可用"
- 客户端:面板关闭时停止 60s 轮询、localStorage 拖动结束才持久化、视口钳制、百分比取整、styles/host 缺失降级

### 部署
- 支持 `dsh plugin --profile <name> add` 官方 bundle 安装(注意:静态 bundle 暂无包私有 RPC,完整功能需动态加载,见 README)
