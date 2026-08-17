// Build src/*.js (cordis_define function-body format) into lib/*.js (bundle entries).
//
// - lib/index.js  — host ESM entry (`export const name` + `export function apply`)
//   for the Node-side Cordis Loader. src/host.js 已对 `harness` 做存在性守卫:
//   动态模式(dcordis 沙箱)正常注册 RPC;静态 bundle 模式干净退出。
//
// - lib/client.js — browser bundle,必须采用 dsh client-modules 的注册形态:
//   `window.__ModuleLoader__.load({ id, factory })`(id == 包名)。
//   web shell 以 classic <script> 执行该文件,factory 收到绑定模块表(react 等)
//   的同步 require;裸 ESM(`export function apply`)作为 classic script 会直接
//   抛 SyntaxError,客户端半区永远不会注册 —— 这是历史上方式 B 不工作的根因。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGE_NAME = 'dsh-opencode-go-usage'
const HOST_NAME = 'opencode-go-usage'
const CLIENT_NAME = 'opencode-go-usage-client'

// 去掉开头注释块与 `return {`、末尾收尾 `}`,并把 `apply(ctx[, config]) {` 换成函数声明。
function stripWrapper(text) {
  text = text.replace(/^[\s\S]*?\nreturn \{/, '')
  text = text.replace(/\n\}\s*$/, '')
  return text.replace(/^\s*apply\(ctx(?:, config)?\) \{/, 'function apply(ctx, config) {')
}

function buildHost() {
  const srcText = readFileSync(join(root, 'src/host.js'), 'utf8')
  // 回归门禁:host.js 的 VERSION 常量必须与 package.json 同步(更新检查用)
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  if (!srcText.includes("const VERSION = '" + pkg.version + "'")) {
    throw new Error('src/host.js 的 VERSION 与 package.json 不同步(build-lib 回归门禁):请同步为 ' + pkg.version)
  }
  const text = stripWrapper(srcText)
  // 注入 Node 内置模块(bundle 形态可用;动态沙箱无这些符号,apply 内必须用
  // typeof 守卫后再访问,否则动态模式会 ReferenceError)。
  const imports = [
    "import { writeFileSync as _ocgoWriteFileSync, mkdirSync as _ocgoMkdirSync, chmodSync as _ocgoChmodSync, renameSync as _ocgoRenameSync, readFileSync as _ocgoReadFileSync, existsSync as _ocgoExistsSync } from 'node:fs'",
    "import { join as _ocgoJoin } from 'node:path'",
    "import { homedir as _ocgoHomedir } from 'node:os'",
    '',
  ].join('\n')
  const outText = 'export const name = ' + JSON.stringify(HOST_NAME) + '\n' +
    imports +
    text.replace(/^function apply\(ctx(?:, config)?\) \{/, 'export function apply(ctx, config) {') + '\n'
  mkdirSync(join(root, 'lib'), { recursive: true })
  writeFileSync(join(root, 'lib', 'index.js'), outText)
  console.log('built lib/index.js (host ESM)')
}

function buildClient() {
  const body = stripWrapper(readFileSync(join(root, 'src/client.js'), 'utf8'))
  const outText = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(PACKAGE_NAME)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    // src 面向动态沙箱(React 是闭包符号);bundle 工厂里从模块表取 react。
    let React = require("react");
${body}
    exports.name = ${JSON.stringify(CLIENT_NAME)};
    exports.apply = apply;
    return module.exports;
  }
});
`
  mkdirSync(join(root, 'lib'), { recursive: true })
  writeFileSync(join(root, 'lib', 'client.js'), outText)
  console.log('built lib/client.js (browser registration bundle)')
}

buildHost()
buildClient()
verifyLib()
console.log('build + verify ok')

// 回归门禁:断言运行时关键不变量,防止未来改动静默破坏 bundle 形态。
// 1) 客户端 bundle 必须是注册形态(否则 web shell 以 classic script 加载即 SyntaxError);
// 2) 客户端工厂必须从模块表取 react(静态模式没有 React 全局);
// 3) host 端不得再裸引用 `harness<...>`(静态 bundle 模式没有该全局,裸引用会 ReferenceError)。
function verifyLib() {
  const client = readFileSync(join(root, 'lib/client.js'), 'utf8')
  if (!client.startsWith('window.__ModuleLoader__.load({')) {
    throw new Error('lib/client.js 不是注册形态(build-lib 回归门禁):必须以 window.__ModuleLoader__.load({ 开头')
  }
  if (!client.includes('let React = require("react");')) {
    throw new Error('lib/client.js 工厂缺少 react 模块表 require(build-lib 回归门禁)')
  }
  const host = readFileSync(join(root, 'lib/index.js'), 'utf8')
  if (!host.startsWith('export const name = ')) {
    throw new Error('lib/index.js 不是 host ESM 入口(build-lib 回归门禁)')
  }
  // 允许 `typeof harness` 守卫,禁止裸 `harness.handle(...)` 调用。
  if (/[^.]harness\s*\./.test(host)) {
    throw new Error('lib/index.js 裸引用 harness 全局(build-lib 回归门禁):静态 bundle 模式没有 harness,请用 typeof 守卫')
  }
}
