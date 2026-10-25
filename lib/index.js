// dsh-agents-md —— 宿主半区
// 提供 /dsh-agents/* 路由：读取/保存全局 AGENTS.md 或当前项目的 AGENTS.md。
// 前端半区（assets/agents-widget.js）负责界面，两者通过 HTTP 通信。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const GLOBAL_FILE = path.join(DSH_HOME, 'AGENTS.md')
const WORKSPACE_STORE = path.join(DSH_HOME, 'storages', 'workspace.json')
const MAX_BYTES = 1024 * 1024

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
}

// ---- 路径解析 -------------------------------------------------------------

function readWorkspaceTable() {
  try {
    const data = JSON.parse(fs.readFileSync(WORKSPACE_STORE, 'utf8'))
    const table = data && data.tables && data.tables.workspaces
    return table && typeof table === 'object' ? table : {}
  } catch (err) {
    return {}
  }
}

// 会话 id -> 工作区：workspace.json 里每个工作区记着自己的 sessionIds。
function sessionWorkspaceMap(table) {
  const map = new Map()
  for (const ws of Object.values(table)) {
    if (!ws || typeof ws.path !== 'string' || !ws.path) continue
    for (const id of Array.isArray(ws.sessionIds) ? ws.sessionIds : []) {
      map.set(id, ws)
    }
  }
  return map
}

// 最近有写入的会话 = 用户当前大概率打开着的那个对话。
function newestSessionId() {
  const root = path.join(DSH_HOME, 'sessions')
  let best = ''
  let bestTime = 0
  try {
    for (const folder of fs.readdirSync(root, { withFileTypes: true })) {
      if (!folder.isDirectory()) continue
      const dir = path.join(root, folder.name)
      let subs = []
      try {
        subs = fs.readdirSync(dir, { withFileTypes: true })
      } catch (err) {
        continue
      }
      for (const sub of subs) {
        if (!sub.isDirectory() || !sub.name.startsWith('session-')) continue
        const sessDir = path.join(dir, sub.name)
        let files = []
        try {
          files = fs.readdirSync(sessDir, { withFileTypes: true })
        } catch (err) {
          continue
        }
        for (const f of files) {
          if (!f.isFile() || !f.name.startsWith('session.')) continue
          try {
            const st = fs.statSync(path.join(sessDir, f.name))
            if (st.mtimeMs > bestTime) {
              bestTime = st.mtimeMs
              best = sub.name
            }
          } catch (err) {}
        }
      }
    }
  } catch (err) {
    return ''
  }
  return best
}

// 当前项目：优先“最近活动的会话”所属工作区；取不到再退回最近更新的工作区。
function resolveProjectDir() {
  const table = readWorkspaceTable()
  const bySession = sessionWorkspaceMap(table)
  const sessionId = newestSessionId()
  if (sessionId && bySession.has(sessionId)) {
    return bySession.get(sessionId).path
  }
  let best = null
  for (const ws of Object.values(table)) {
    if (!ws || typeof ws.path !== 'string' || !ws.path) continue
    if (!best || String(ws.updatedAt || '') > String(best.updatedAt || '')) best = ws
  }
  return best ? best.path : ''
}

// 会话投影缓存里有每个会话的标题与 cwd：按窗口标题找到当前对话，就能拿到它所属项目。
const PROJ_CACHE = () => path.join(DSH_HOME, 'storages', 'session_projcache', 'sessions')

function cleanTitle(raw) {
  return String(raw || '')
    .replace(/\s+[—–-]\s+DeepSeek Harness\s*$/i, '')
    .trim()
}

function readProjCache(file) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'))
    const rec = j && j.record
    const cwd = rec && rec.identity && rec.identity.cwd
    const title = rec && rec.rows && rec.rows.title && rec.rows.title.val
    return { cwd: typeof cwd === 'string' ? cwd : '', title: typeof title === 'string' ? title : '' }
  } catch (err) {
    return null
  }
}

function resolveByTitle(title) {
  const dir = PROJ_CACHE()
  let files = []
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
  } catch (err) {
    return ''
  }
  const wanted = cleanTitle(title)
  let best = ''
  let bestTime = 0
  for (const f of files) {
    const full = path.join(dir, f)
    const info = readProjCache(full)
    if (!info || !info.cwd) continue
    if (wanted && info.title !== wanted) continue
    try {
      const m = fs.statSync(full).mtimeMs
      if (m > bestTime) {
        bestTime = m
        best = info.cwd
      }
    } catch (err) {}
  }
  return best
}

function targetOf(scope, dir, title) {
  if (scope === 'global') {
    return { scope, dir: DSH_HOME, file: GLOBAL_FILE }
  }
  const projectDir =
    String(dir || '').trim() ||
    resolveByTitle(title) ||
    resolveProjectDir()
  if (!projectDir) return null
  const abs = path.resolve(projectDir)
  if (!path.isAbsolute(abs)) return null
  return { scope: 'project', dir: abs, file: path.join(abs, 'AGENTS.md') }
}

// 首行固定：全局与项目各一句，编辑时可见但不可改，保存时强制写回。
const HEADER_GLOBAL = '# 工作原则（所有项目生效）'
const HEADER_PROJECT = '# 工作原则（当前项目生效）'

// 新建文件时的初始正文（不含固定首行）。
const DEFAULT_GLOBAL_BODY = `## 通用
- 先看清现状再动手，不确定就问，不要猜

## 文件
- 生成的文件默认放在当前项目目录内，临时文件统一放项目的_Temp/下
- 若文件需要写在项目外请申请审批，并告知需要写入的目标目录
- 删除覆盖已有文件需征得审批同意，并列出需要删除或者覆盖的文件

## 交付
- 完成后说明：改了什么、放在哪、清理了什么

## 安全
- 不做破坏性操作（批量删除、格式化、改系统设置），除非明确要求`

const DEFAULT_PROJECT_BODY = `## 关于本项目（一句话说明项目用途）
- 本项目XXXXXX

## 约定（遵循规则）
- 生成的文件放在：项目根目录
- 生成的临时过程文件放在：项目根目录/_Temp/
- 禁止事项：搞破坏`

function headerOf(scope) {
  return scope === 'global' ? HEADER_GLOBAL : HEADER_PROJECT
}

function defaultBodyOf(scope) {
  return scope === 'global' ? DEFAULT_GLOBAL_BODY : DEFAULT_PROJECT_BODY
}

// 把文件拆成「固定首行 + 正文」：首行是任意 H1 时丢弃它，正文原样保留。
function splitHeader(text) {
  const normalized = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  if (lines.length && lines[0].startsWith('# ')) {
    return lines.slice(1).join('\n').replace(/^\s*\n/, '')
  }
  return normalized
}

function readState(target) {
  let raw = ''
  let exists = false
  let mtime = 0
  try {
    const st = fs.statSync(target.file)
    if (st.isFile()) {
      if (st.size > MAX_BYTES) {
        return {
          ok: false,
          scope: target.scope,
          dir: target.dir,
          path: target.file,
          error: '文件超过 1 MB，请手动用编辑器处理',
        }
      }
      exists = true
      mtime = st.mtimeMs
      raw = fs.readFileSync(target.file, 'utf8')
    }
  } catch (err) {
    // 文件不存在：保持默认
  }
  return {
    ok: true,
    scope: target.scope,
    dir: target.dir,
    path: target.file,
    exists,
    mtime,
    header: headerOf(target.scope),
    body: exists ? splitHeader(raw) : '',
    defaultBody: defaultBodyOf(target.scope),
  }
}

// 原子写入：先写临时文件再改名，避免中途失败把原文件写坏。
function writeFileAtomic(file, content) {
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = file + '.tmp-' + process.pid + '-' + Date.now()
  fs.writeFileSync(tmp, content, 'utf8')
  try {
    fs.renameSync(tmp, file)
  } catch (err) {
    try { fs.unlinkSync(tmp) } catch (e) {}
    throw err
  }
}

// ---- HTTP 工具 ------------------------------------------------------------

function readBody(req, limit = MAX_BYTES + 65536) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('请求体过大'))
        try { req.destroy() } catch (err) {}
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function isLoopbackHostname(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/^\[/, '').replace(/\]$/, '')
  if (!h) return false
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (h === '::1') return true
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)
  if (!m) return false
  if (Number(m[1]) !== 127) return false
  return [m[2], m[3], m[4]].every((x) => Number(x) <= 255)
}

// 只接受本机回环、同源请求：这个接口能写任意目录下的 AGENTS.md，必须设栅栏。
function fenceRejection(req) {
  try {
    const headers = (req && req.headers) || {}
    let hostUrl = null
    try {
      hostUrl = new URL('http://' + String(headers.host || ''))
    } catch (err) {
      return 403
    }
    if (!isLoopbackHostname(hostUrl.hostname)) return 403
    const site = String(headers['sec-fetch-site'] || '').toLowerCase()
    if (site === 'cross-site') return 403
    const origin = headers.origin
    if (typeof origin === 'string' && origin && origin !== 'null') {
      let originUrl = null
      try {
        originUrl = new URL(origin)
      } catch (err) {
        return 403
      }
      if (originUrl.host.toLowerCase() !== hostUrl.host.toLowerCase()) return 403
    }
    return null
  } catch (err) {
    return 403
  }
}

function sendJson(res, code, payload) {
  res.writeHead(code, JSON_HEADERS)
  res.end(JSON.stringify(payload))
}

// ---- 前端注入 -------------------------------------------------------------

// 桌面端启动时宿主只收集一次注入表，必须尽早注册成内联 script 行。
const DESKTOP_ROW_TEXT =
  '(function(){try{var d=document.body||document.head||document.documentElement;if(!d)return;' +
  'var s=document.createElement("script");s.src="/dsh-agents/widget.js";' +
  's.onerror=function(){};d.appendChild(s)}catch(e){}})()'

const WIDGET_FILE = path.join(PACKAGE_ROOT, 'assets', 'agents-widget.js')
let widgetCache = null

function loadWidgetJs() {
  try {
    const st = fs.statSync(WIDGET_FILE)
    if (widgetCache && widgetCache.mtimeMs === st.mtimeMs) return widgetCache.text
    const text = fs.readFileSync(WIDGET_FILE, 'utf8')
    widgetCache = { text, mtimeMs: st.mtimeMs }
    return text
  } catch (err) {
    return widgetCache ? widgetCache.text : ''
  }
}

export default {
  name: 'dsh-agents-md',
  apply(root) {
    const rowDisposers = []
    root.effect(() => () => {
      for (const d of rowDisposers) {
        try { d() } catch (err) {}
      }
    })

    rowDisposers.push(root.on('webserver/index-inject', (table) => {
      try {
        if (!Array.isArray(table)) return
        for (const row of table) {
          if (!row) continue
          if (row.kind === 'script' && typeof row.text === 'string' && row.text.indexOf('/dsh-agents/widget.js') >= 0) return
        }
        table.push({ kind: 'script', placement: 'body', text: DESKTOP_ROW_TEXT })
      } catch (err) {}
    }))

    root.inject(['webServer'], (ctx) => {
      const disposers = []

      function registerRoute(route) {
        const inner = route.handler
        const wrapped = Object.assign({}, route, {
          handler: async (req, res) => {
            const rejected = fenceRejection(req)
            if (rejected) {
              res.statusCode = rejected
              try { res.end() } catch (err) {}
              return
            }
            return inner(req, res)
          },
        })
        return ctx.webServer.register(wrapped)
      }

      // 读取状态（含文件内容）
      disposers.push(registerRoute({
        kind: 'exact',
        path: '/dsh-agents/state',
        handler: async (req, res) => {
          try {
            const url = new URL('http://x' + (req.url || ''))
            const scope = url.searchParams.get('scope') === 'global' ? 'global' : 'project'
            const target = targetOf(
              scope,
              url.searchParams.get('dir') || '',
              url.searchParams.get('title') || '',
            )
            if (!target) {
              return sendJson(res, 200, { ok: false, scope, error: '没能定位项目目录，请手动填写', dir: '' })
            }
            sendJson(res, 200, readState(target))
          } catch (err) {
            sendJson(res, 500, { ok: false, error: String((err && err.message) || err) })
          }
        },
      }))

      // 保存
      disposers.push(registerRoute({
        kind: 'exact',
        path: '/dsh-agents/save',
        handler: async (req, res) => {
          if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
          try {
            const body = JSON.parse((await readBody(req)) || '{}')
            const scope = body.scope === 'global' ? 'global' : 'project'
            const target = targetOf(scope, body.dir || '', body.title || '')
            if (!target) return sendJson(res, 400, { ok: false, error: '项目目录无效' })
            const rawBody = typeof body.body === 'string'
              ? body.body
              : (typeof body.content === 'string' ? body.content : '')
            const header = headerOf(scope)
            // 兼容旧客户端：正文里若还带着 H1 标题，丢掉它，统一由固定首行承担。
            const trimmed = splitHeader(rawBody).replace(/\s+$/, '')
            const text = trimmed ? header + '\n\n' + trimmed + '\n' : header + '\n'
            if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) {
              return sendJson(res, 413, { ok: false, error: '内容超过 1 MB' })
            }
            if (scope === 'project' && !fs.existsSync(target.dir)) {
              return sendJson(res, 400, { ok: false, error: '项目目录不存在：' + target.dir })
            }
            writeFileAtomic(target.file, text)
            sendJson(res, 200, { ok: true, path: target.file, header: header, body: trimmed })
          } catch (err) {
            sendJson(res, 500, { ok: false, error: String((err && err.message) || err) })
          }
        },
      }))

      // 前端脚本
      disposers.push(registerRoute({
        kind: 'exact',
        path: '/dsh-agents/widget.js',
        handler: (req, res) => {
          res.writeHead(200, {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'no-store',
          })
          res.end(loadWidgetJs())
        },
      }))

      // web 形态走 tapIndex；桌面端由上面的注入行负责。
      if (typeof ctx.webServer.tapIndex === 'function') {
        disposers.push(ctx.webServer.tapIndex((html) => {
          if (html.indexOf('/dsh-agents/widget.js') !== -1) return html
          const tag = '<script defer src="/dsh-agents/widget.js"></script>'
          if (html.indexOf('</body>') !== -1) return html.replace('</body>', tag + '</body>')
          return html + tag
        }))
      }

      ctx.effect(() => () => {
        for (const d of disposers) {
          try { d() } catch (err) {}
        }
      })
    })
  },
}
