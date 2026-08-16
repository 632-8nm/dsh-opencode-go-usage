# 变更日志

本项目的所有显著变更。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/),版本遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [1.6.15] - 2026-08-16

### 修复(面板不再"60 秒刷新"——实测单次请求 64s 拖死轮询)
- **会话扫描后台化**:v1.6.13 为防 OOM 把扫描并发降到 6,流式扫描在会话库较大时耗时 60s+(实测一次 `fetchAll` 64s)——扫描在响应路径里,60s 轮询每次都被 `inFlight` 挡住(上次请求还没返回),刷新周期塌成 2 分钟+,面板看起来"不再 60 秒刷新"。现在响应先用 `lastScan` 旧结果,**扫描在后台完成后再更新缓存**,轮询恢复 60s 节奏;扫描本身并发去重,5 分钟缓存不变
- **客户端看门狗**:单次请求 60s 超时——即使 host 卡死,也不会让 `inFlight` 永久占用、轮询永久跳过;超时/失败均**保留旧数据**(函数式更新,避免闭包陈旧把数据清空),下一个 60s tick 自动重试

## [1.6.14] - 2026-08-16

### 修复(增量从未真正成功——历史根因)
- **增量命令 NameError 修复**:`buildPythonCmd` 注入 `OCGO_LAST_TS` 时生成的 python 前导只有 `import base64`,`os.environ['OCGO_LAST_TS']=...` 直接抛 `NameError: name 'os' is not defined`——**增量脚本在真实插件里从未成功执行过**(诊断日志持续记录该 Traceback,面板金额/条数因此永不刷新);修复为 `import base64, os`,macOS/Linux 分支移除冗余的 envPart(环境变量已由 shell export 注入)
- **真实执行验证**:修复后增量命令实际跑通——磁盘缓存 13,396 → **13,893 条(+497 条新记录)**,最新记录从 08:07 推进到 09:25,合并 0 丢失

### 测试
- 增量用例新增回归门禁:断言命令前导必须为 `import base64, os` 且经 `os.environ` 注入 LAST(防止 NameError 复发)

## [1.6.13] - 2026-08-16

### 修复(DSH 服务被 V8 堆 OOM 杀死——退出码 134)
- **会话扫描改流式,峰值内存降约 75%**:`collectDshScan` 此前 24 并发 + 全量驻留——所有会话事件同时解压成 JS 对象(本机会话库 117MB 压缩,解压后瞬时峰值可达 GB 级),每 5 分钟一轮,曾两次把 DSH 服务 V8 堆撑爆到 4GB 上限(`FATAL ERROR: Ineffective mark-compacts`,`the dsh service exited unexpectedly (code 134)`)
- 现在并发降到 **6** 且**逐会话提取即释放**(worker 流式),任何时刻最多 6 个会话驻留,峰值约为原来的 1/4,且每块处理完即可被 GC 回收;`lastScan` 5 分钟复用不变
- 移除不再使用的 `mapLimit`

### 测试
- **测试完全隔离**:套件把 `USERPROFILE`/`HOME` 重定向到临时目录(此前把真实磁盘缓存移开再还原,且 `ocgoLog` 会把测试噪声写进真实 `~/.config` 诊断日志)——现在磁盘缓存/凭据/诊断日志全部落在临时 HOME,不再触碰真实用户文件

## [1.6.12] - 2026-08-16

### 修复(增量刷新残留缺口——增量不再"停摆"或丢数据)
- **增量时间戳比较改 epoch 制**:此前 `LAST` 与记录时间用字符串比较——ISO 格式内碰巧正确,但服务器可能返回美国格式 `MM/dd/yyyy HH:mm:ss`(跨月/跨年时字典序 ≠ 时间序,如 `"12/01/2025" < "01/02/2026"`),增量会停早丢新记录或选错基准。现统一按 epoch 比较(`_pts`,兼容 ISO 与 MM/dd 两种格式,解析失败自动退化为字符串比较)
- **磁盘缓存缺失不再静默停摆**:增量依赖磁盘缓存作合并基准;缓存被删/落盘失败时,此前 `triggerIncremental` 直接返回,内存数据永远陈旧(金额卡住)。现在退化为全量重抓(15min 节流,失败冷却仍生效)
- **截断的旧缓存自动强制重建(12h 节流)**:旧版(≤1.6.10,150 页上限)遗留的截断缓存无 truncated 字段且 ≥7500 条——增量只追最新页、永远补不回被截断的旧数据。现在检测到截断缓存(新字段或旧版遗留)会触发一次强制全量重建,重建后恢复正常增量
- **真实数据验证**:本机缓存 12,278 条(旧版截断 + 增量已停摆 5 小时)→ 全量重建 **13,396 条(补回 +1,118 条)** → 再增量合并 **0 丢失**

### 测试
- 新增 2 用例:磁盘缺失回退全量(15min 节流)、截断缓存强制重建(12h 节流后走普通增量);套件 12 → 14 用例

## [1.6.11] - 2026-08-16

### 修复(官方明细"抓不全"根因)
- **页数上限 150 → 5000 页**:usage.list 超过 7500 条(150 页)时不再截断,抓取在"不足 50 条的页"自然结束(约 10k/15k 条数据此前被静默截断,是 7498/9070/11270 条数差异的根因之一);用户可在配置 `maxPages` 覆盖,绝对上限 5000 页
- **单页失败不再终止整次抓取**:任一页两次请求失败(超时/网络抖动)只跳过该页继续,只有**连续 5 页**失败才判定数据尽头——此前一页失败即中断,导致数据缺失且无法恢复
- **官方失败 60s 冷却**:抓取失败会缓存错误并在 60s 内不再重复全量抓取——此前客户端 15s fast-poll 期间每次刷新都重新触发一次全量(每页 2 请求 × 20s 超时,故障时反复轰炸官网);错误原样透传面板展示,60s 后自动重试

### 健壮性
- **truncated 状态落盘透传**:磁盘缓存持久化截断标志,读盘路径不再把截断数据误报为完整;截断文案改为通用表述(不再写死"7500 条")
- **诊断日志可追溯**:`~/.config/dsh-opencode-go-usage.log` 由"覆盖写最近一条"改为**追加 + 只保留最近 200 行**,多条失败/跳页信息不再互相覆盖;抓取跳过的页数(诊断字段 `skippedPages`)一并记录
- **stdout 上限 32MB → 64MB**:页数放宽后 25 万条记录输出约 30-40MB,原 32MB 上限可能截断 stdout 导致 JSON 解析失败
- FAB 拖动增加视口钳制(与面板拖动一致),不再可能被拖出屏幕外

### 清理
- 移除面板死文案键(`view.all`/`srcs.title`/`official.auto`/`foot.ocgoErr`/`foot.codexErr`),zh/en 字典继续严格对齐
- 删除临时探针 `scripts/probe-tmp.mjs`(全量/增量验证已完成)

## [1.6.10] - 2026-08-16

### 性能(首次打开不再等官方全量)
- **fetchAll 不阻塞官方全量**:首次(无缓存)时官方 usage.list 后台全量拉取(10-15s),面板立即返回配额环形图 + DSH 数据(2-3s);官方完成自动更新——官方视图仍坚持"要么无数据(仅配额+横幅)要么完整",不显示部分数据
- **客户端 fast-poll**:官方明细未就绪时 15s 快速轮询,就绪后恢复 60s;FAB 首次 2-3s 即显示配额百分比

## [1.6.9] - 2026-08-16

### 一键启动浏览器候选扩展
- **Chromium 系全家桶**:Windows 遍历 Edge/Chrome/Brave/Vivaldi/Opera/Arc/Chromium 安装路径;macOS 按应用名遍历(系统+用户 Applications);Linux 自动探测常见可执行文件——不再只认 Chrome/Edge
- macOS 用 `open -na`(launchd 启动,进程独立于 DSH),Linux 用 `nohup` 后台;Safari/Firefox 调试协议与 CDP 不兼容,README 已注明

## [1.6.8] - 2026-08-16

### 跨平台(数据通道全部脱离 PowerShell)
- **配额通道跨平台**:curl 通道在 macOS/Linux 用 `python3` 一行读取 key + 原生 curl;python 兜底通道统一走 `buildPythonCmd`(`python3`/`python` 自动探测),不再依赖 Windows 专属的 pwsh 语法与 `E:\python\python.exe` 硬编码
- **主数据源(runOfficial)同步跨平台**:usage.list 抓取/增量/磁盘缓存命中全部通过 `buildPythonCmd` 生成平台对应命令(macOS/Linux 走 sh,Windows 行为不变)

## [1.6.7] - 2026-08-16

### 跨平台(一键启动支持 macOS / Linux)
- **一键启动调试浏览器增加 macOS / Linux 分支**:macOS 用 `open -na`(Chrome 优先,回退 Edge),Linux 用 `nohup` 后台启动(google-chrome / chromium / microsoft-edge 自动探测);Windows 保持 explorer 中转方案
- **macOS 不再有 DPAPI 问题**:cookie 库直读(DPAPI/AES-GCM,Windows 专属)已在 1.6.4 移除,自动提取统一走调试端口 CDP——CDP 与平台无关,任何加密版本(v10/v20)都能提取

## [1.6.6] - 2026-08-16

### 修复(首屏数据完整性与一键启动可靠性)
- **撤销分段拉取**(1.6.5 引入):首次全量抓取(16 并发约 10-15s)一次性返回完整历史(从开通日起),不再只给近期数据造成"从导入当天开始"的误解
- **一键启动改 explorer.exe 中转**:写临时 bat 后由桌面 explorer 运行,浏览器脱离 DSH 进程树不被清理,且不依赖受限环境下被禁的 WMI cmdlet——窗口可靠弹出
- **最近会话补标题**:官方 `usage.list` 无会话标题字段,官方视图"最近会话"按时间关联 DSH 会话补真实标题、按会话聚合,金额为官方回填值

### 性能(后台负载)
- **DSH 会话扫描 5 分钟缓存复用**:面板 60s 轮询不再每次全量重扫所有会话(node CPU 不再持续高负载);扫描并发 12→24

### 健壮性
- **FAB/面板位置越界保护**:localStorage 中的屏幕外坐标自动重置(窗口尺寸/分辨率变化后 FAB 不再"消失")

## [1.6.5] - 2026-08-16

### 性能(首次拉取 30s → 3-6s 出数据)
- **分段拉取**:首次无缓存时先抓最近 40 页(约 2000 条,覆盖今天/昨天)立即返回,**3-6 秒面板出数据**;后台继续抓剩余页,合并去重后落盘并更新(完整数据约 12-18s,之后全部秒级)
- **并发提升**:分页并发 6 → 16,全量抓取 31.8s → 约 13s
- fetchAll 等待段1 直接带出近期数据,面板不再长时间"拉取中";loading 文案更新

## [1.6.4] - 2026-08-16

### 简化(只保留调试浏览器方案)
- **移除多浏览器 cookie 库直读**(DPAPI/AES-GCM/Firefox 等全部删除):自动提取只走调试端口 CDP,**任何加密版本都支持,不需要关闭任何正在运行的浏览器**——不再有"开着浏览器就不能抓"的矛盾
- **一键启动调试浏览器**:官方视图错误区新增"🚀 一键启动调试浏览器并登录"按钮(host 新增 `/ocgo-usage/launch-browser` 端点 + harness 桥),点击直接弹出独立调试窗口,无需手动找脚本

### 体验(官方明细不可用时面板不空屏)
- **配额百分比始终显示**:配额接口走 `auth.json` key,不需要 cookie;官方明细不可用时,滚动/周/月配额环形图照常渲染
- **不充数**:官方明细拉取中/失败时,官方视图**只显示配额环形图 + 状态横幅**(含一键启动按钮),**不显示 DSH 会话数据**——DSH 数据仅在 DSH 视图展示;官方明细就绪后统计/模型/趋势照常

## [1.6.3] - 2026-08-16

### 性能(启动加载提速 ~300×)
- **官方数据磁盘缓存**:抓取结果落盘 `~/.config/dsh-opencode-go-usage-official.json`,DSH 重启后首屏直接读盘,**0.1s 出数据**(此前每次启动都要全量分页 30s+)
- **增量刷新**:缓存过期后只抓新增页(实测 1.5s / 12 条新增),python 端与旧缓存合并去重后写回;过期时先展示旧数据、后台刷新,面板不再长时间 loading
- 磁盘缓存命中无需 cookie/网络;首次全量仍为 10-50s,之后全部秒级

## [1.6.2] - 2026-08-16

### 功能(调试端口 CDP 自动提取)
- **CDP 调试端口提取**:探测 9222–9230 端口,通过浏览器调试协议(WebSocket,纯标准库零依赖)让浏览器自身解密并返回 `auth` cookie——**新版 Edge/Chrome v20 应用绑定加密也能用**,无需关闭日常浏览器、无需管理员权限、不触碰数据库文件
- **一键启动器**:`scripts/start-browser-debug.bat` 以调试端口 9222 启动独立 Edge 配置(不影响日常 Edge),首次登录一次 opencode.ai 后长期有效
- **提取优先级**:CDP 调试端口 → 浏览器 cookie 库直读(v10 / Firefox)→ 手动粘贴兜底;失败自动降级
- **端到端验证通过**:`scripts/verify-cdp.mjs` 从真实调试浏览器提取到有效 cookie(`Fe26.2*`,561 字符),无配置状态下完整链路(CDP 提取 → workspace 解析 → usage.list 6068 条抓取)跑通并持久化配置
- 修复 Python WebSocket 实现:改为单连接多次调用(`ws_connect` + `ws_call`),解决二次调用超时

## [1.6.1] - 2026-08-16

### 功能(cookie 自动提取支持任意浏览器)
- **多浏览器提取**:Edge / Chrome / Chromium / Brave / Vivaldi / Arc / Opera / Firefox 任一浏览器登录过 opencode.ai 即可自动提取 auth cookie(Chromium 系 DPAPI + AES-GCM v10;Firefox `moz_cookies` 明文直读)
- 浏览器运行锁定检测升级:先尝试只读打开,失败再复制,仍失败返回 `BROWSER_RUNNING`;找不到登录返回 `NO_LOGIN`;v20 新版加密返回 `V20`(提示手动粘贴)
- 面板错误提示全部更新为浏览器通用文案

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
