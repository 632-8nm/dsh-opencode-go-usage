@echo off
rem ============================================================
rem  OpenCode Go 用量面板 - 浏览器调试模式启动器
rem
rem  以调试端口(9222)启动 Edge 的独立配置(不影响日常 Edge),
rem  插件通过 CDP 自动读取 opencode.ai 登录 cookie(v20 加密也支持)。
rem
rem  首次使用:启动后在新窗口登录一次 opencode.ai,之后长期有效。
rem  注意:调试端口开启期间,本机其它程序可读取该窗口的浏览数据,
rem        用完建议关闭本窗口(调试端口随之关闭)。
rem ============================================================

set "EDGE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=C:\Program Files\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" (
    echo 未找到 Edge,请修改本脚本中的 EDGE 路径,或改用 Chrome:
    echo 用 Chrome 时把 EDGE 改为 C:\Program Files\Google\Chrome\Application\chrome.exe
    pause
    exit /b 1
)

start "" "%EDGE%" --remote-debugging-port=9222 "--user-data-dir=%USERPROFILE%\.ocgo-browser-debug" https://opencode.ai
echo 已启动调试模式 Edge(端口 9222)。
echo 首次请登录 opencode.ai,之后关闭本窗口即可。
timeout /t 5 >nul
