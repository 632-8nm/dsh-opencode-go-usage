# 变更日志

本项目的所有显著变更。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/),版本遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [1.6.0] - 2026-08-16

### 重构(官方为唯一主数据源)
- **移除本地 opencode.db / codex 记录源**:官方 `usage.list` 为账户级完整数据(逐请求官方计费、跨设备、不受本地丢失影响),本地两源不再拉取/显示
- **保留 DSH 会话分析**:官方总额无法区分来源应用,DSH 视图保留会话级视角

### 修复(DSH 金额不准确)
- **官方逐请求回填**:DSH 估算(cache 增量法)会低估——官方每次请求都收缓存命中费,而 DSH 事件只有累计快照。现与 usage.list 逐请求按(模型 + ±60s + token ±30%)匹配,**匹配到的行直接用官方 cost 精确回填**
- 实测:2997 个 DSH 事件匹配 2500 条(83.4%),DSH 金额从估算 $2.57 **修正为官方 $8.44**(3.3×)——此前估算系统性低估
- DSH 视图 foot 显示"官方回填 N 条"

### 性能
- 官方全量分页 6 路并发;fetchAll 不阻塞面板(无缓存时返回 loading,后台拉取完成后自动更新)

## [1.5.1] - 2026-08-16

### 功能(官方凭据零操作获取)
- **Edge cookie 自动提取**:配置缺失/过期时,自动从 Edge 的 cookie 库解密 `opencode.ai` 的 `auth` cookie(DPAPI + AES-GCM,全部本机处理),再调 workspaces API 解析 workspaceId,写入配置——用 Edge 登录过官网即可,无需任何手动复制
- **手动兜底 UI**:面板官方视图错误区可直接粘贴 `authCookie` + `workspaceId` 并保存(host 新增 `POST /ocgo-usage/config` 端点)
- **友好错误码**:Edge 运行中(`EDGE_RUNNING`,关闭后刷新即自动提取)/ 未登录 / 无 Edge / 缺 cryptography 等,面板分别显示对应指引

### 质量
- 端到端验证:无配置 + Edge 运行 → `EDGE_RUNNING` 正确;配置有效 → 5267 条正常拉取
- 测试扩至 10 个(自动提取/DPAPI/AES-GCM/保存端点断言)

## [1.5.0] - 2026-08-16

### 功能(官方账户级数据源)
- **官方视图**:直接调官网 `usage.list` server-fn(逐请求官方计费,`cost` 单位为 1e-8 美元,实测与官网账单逐模型吻合 ±2%),显示账户级今日/本月/按模型/趋势/最近会话——跨设备、不受本地数据丢失影响
- **官方源验证**:8-14 本地时区(UTC+8)对账——kimi-k3 $0.93、deepseek-v4-pro $0.22、glm-5.2 $0.06 等与官网账单精确吻合;8-14 白天缺口确认源于 DSH 数据目录 17:10 迁移前的会话丢失(本地不可恢复,官方视图可补)
- 配置:`~/.config/dsh-opencode-go-usage.json`(authCookie + workspaceId),15 分钟缓存,失败降级不影响本地视图

### 质量
- 测试增至 10 个:官方源就位断言(脚本/配置/换算/产物/官方视图)

## [1.4.0] - 2026-08-16

### 修复(数据抓取口径,全部经真实数据实锤验证)
- **DSH cache 口径**:`cacheReadTokens` 是会话累计上下文快照,直接求和会重复累计(12 会话假算出 733M);改为按会话相邻增量,并修正 cache 单价为实测 $0.031/M(官网表 0.0028 与官方 cost 反推差 11 倍)
- **codex 源直读 jsonl**:绕开 cc-switch 会话同步(应用退出即断流,08-14 13:54 后无记录);直接解析 `~/.codex/sessions/**/*.jsonl` 的 `total_token_usage`,与 cc-switch 对账差异 <0.1%;修成本公式重复计缓存、时间解析(文件名兜底)
- **面板对账行**:底部显示 `官方月 $X · 本地 $Y`,缺口一目了然

## [1.3.0] - 2026-08-16

### 功能(对标同类工具调研:OpenUsage / opencode-bar / AIUsageTracker / LiteLLM 等)
- **重置倒计时**:配额环形图下方显示 `3h 45m 后重置`(1d/1h/1m 粒度),替代静态时间
- **Pace 期末预测**:按窗口已过时间比例外推期末用量(`预计 40%`);超速时红色显示 `预计耗尽 08-20 14:00`;窗口刚重置(<2% 时间)不显示避免误报
- **较昨日环比**:今日统计卡显示 `较昨日 +12%`(升红降绿),由 30 天趋势数据计算
- **配额告警条**:任一窗口 ≥90% 时面板顶部红色提示条(FAB 变色同步)
- **CSV 导出**:标题栏 ⬇ 按钮导出当前视图(统计 / 配额 / 按模型 / 最近会话)

### 质量
- i18n 字典扩至 50+ 键(zh/en 对齐测试强制约束);Pace 数学经边界验证(窗口起点/刚重置/跨天)

## [1.2.0] - 2026-08-16

### 功能
- **中英双语界面**:全部文案抽离为 zh/en 字典(40+ 键,测试强制键对齐防漏译);面板标题栏新增 🌐 切换按钮,选择持久化(localStorage);未手动选择时初始跟随 DSH 全局语言,并订阅其变化

### 质量
- 测试增至 9 个:新增「i18n 字典键一致 + 产物含切换逻辑」用例;修复 today 桶断言在午夜前后跨天导致的脆弱性(测试 mock 改用当天凌晨 1:05 的稳定时间)

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
