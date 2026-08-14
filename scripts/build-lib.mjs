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

// 去掉开头注释块与 `return {`、末尾收尾 `}`,并把 `apply(ctx) {` 换成函数声明。
function stripWrapper(text) {
  text = text.replace(/^[\s\S]*?\nreturn \{/, '')
  text = text.replace(/\n\}\s*$/, '')
  return text.replace(/^\s*apply\(ctx\) \{/, 'function apply(ctx) {')
}

function buildHost() {
  const text = stripWrapper(readFileSync(join(root, 'src/host.js'), 'utf8'))
  const outText = 'export const name = ' + JSON.stringify(HOST_NAME) + '\n' +
    text.replace(/^function apply\(ctx\) \{/, 'export function apply(ctx) {') + '\n'
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
