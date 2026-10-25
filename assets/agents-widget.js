/* dsh-agents-md —— 前端半区
 * 在会话标签行（对话 / 轨迹 那一行）右侧追加「项目规则」按钮：
 *   新建 / 编辑当前项目目录下的 AGENTS.md
 * 点击后弹出与 DSH 风格一致的编辑弹层。
 * 全局规则的入口在设置页，由 lib/client.js 注册。
 */
;(function () {
  if (window.__dshAgentsMdLoaded) return
  window.__dshAgentsMdLoaded = true

  var API = '/dsh-agents'
  var BTN_CLASS = 'dsh-agents-md-actions'
  var STYLE_ID = 'dsh-agents-md-style'

  // ---- 主题 ---------------------------------------------------------------
  function isDark() {
    try {
      var bg = getComputedStyle(document.body).backgroundColor || ''
      var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(bg)
      if (m) {
        var lum = (Number(m[1]) * 299 + Number(m[2]) * 587 + Number(m[3]) * 114) / 1000
        return lum < 128
      }
    } catch (e) {}
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
  }

  function palette() {
    var dark = isDark()
    return dark
      ? { bg: '#232323', fg: '#e6e6e6', sub: '#9a9a9a', border: 'rgba(255,255,255,.12)', hover: 'rgba(255,255,255,.10)', field: '#1b1b1b' }
      : { bg: '#ffffff', fg: '#1f1f1f', sub: '#6b6b6b', border: 'rgba(0,0,0,.10)', hover: 'rgba(0,0,0,.06)', field: '#f7f7f7' }
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return
    var st = document.createElement('style')
    st.id = STYLE_ID
    st.textContent = [
      // 与「对话 / 轨迹」同一套排版：13px / 500、行高 16、下内边距 9；悬停时浮出浅色胶囊
      '.' + BTN_CLASS + '{display:flex;align-items:flex-start;flex:none;min-height:25px}',
      '.' + BTN_CLASS + ' button{position:relative;display:inline-flex;align-items:center;gap:5px;',
      'appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-tertiary,inherit);',
      'min-height:25px;padding:0 0 9px;font-family:inherit;font-size:13px;font-weight:500;line-height:16px;',
      'cursor:pointer;transition:color .15s}',
      '.' + BTN_CLASS + ' button::before{content:"";position:absolute;left:-8px;right:-8px;top:-4px;bottom:6px;',
      'border-radius:7px;background:transparent;transition:background .15s;pointer-events:none}',
      '.' + BTN_CLASS + ' button:hover{color:var(--dsw-alias-label-secondary,currentColor)}',
      '.' + BTN_CLASS + ' button:hover::before{background:rgba(127,127,127,.10)}',
      '.' + BTN_CLASS + ' button:active::before{background:rgba(127,127,127,.17)}',
      '.' + BTN_CLASS + ' svg{display:block;flex:none;opacity:.9}',
      '.dsh-agents-mask{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;',
      'justify-content:center;background:rgba(0,0,0,.32);animation:dsh-agents-fade .12s ease-out}',
      '@keyframes dsh-agents-fade{from{opacity:0}to{opacity:1}}',
      '.dsh-agents-panel{width:min(760px,92vw);max-height:78vh;display:flex;flex-direction:column;',
      'border-radius:12px;box-shadow:0 18px 48px rgba(0,0,0,.24);overflow:hidden}',
      '.dsh-agents-head{padding:16px 18px 10px;border-bottom:1px solid transparent}',
      '.dsh-agents-title{font-size:14px;font-weight:600;display:flex;align-items:center;gap:8px}',
      '.dsh-agents-path{font-size:12px;margin-top:6px;word-break:break-all;font-family:ui-monospace,Consolas,monospace}',
      '.dsh-agents-body{padding:8px 18px;display:flex;flex-direction:column;gap:8px;min-height:0;flex:1;overflow:auto}',
      '.dsh-agents-editor{width:100%;flex:1;min-height:240px;resize:vertical;border-radius:8px;box-sizing:border-box;',
      'border:1px solid;padding:12px;font:13px/1.65 ui-monospace,Consolas,"Courier New",monospace;outline:none}',
      '.dsh-agents-editor:focus{box-shadow:0 0 0 2px rgba(77,107,254,.25)}',
      '.dsh-agents-dir{width:100%;height:30px;border-radius:7px;border:1px solid;padding:0 10px;box-sizing:border-box;',
      'font:12px ui-monospace,Consolas,monospace;outline:none}',
      '.dsh-agents-fixed{display:flex;align-items:center;justify-content:space-between;gap:8px;',
      'padding:9px 12px;border:1px solid;border-bottom:0;border-radius:8px 8px 0 0;',
      'font:600 13px/1.4 ui-monospace,Consolas,"Courier New",monospace;user-select:none}',
      '.dsh-agents-fixed small{font-family:inherit;font-weight:400;font-size:11px;opacity:.6}',
      '.dsh-agents-editor.attached{border-radius:0 0 8px 8px}',
      '.dsh-agents-foot{display:flex;align-items:center;gap:8px;padding:12px 18px 16px}',
      '.dsh-agents-hint{font-size:12px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-agents-btn{height:30px;padding:0 16px;border-radius:8px;border:1px solid;cursor:pointer;',
      'font-size:13px;background:transparent;transition:background .15s}',
      '.dsh-agents-btn.primary{border-color:transparent;background:#4d6bfe;color:#fff}',
      '.dsh-agents-btn.primary:hover{background:#3f5aea}',
      '.dsh-agents-btn:disabled{opacity:.5;cursor:default}',
    ].join('')
    document.head.appendChild(st)
  }

  // ---- 宿主通信 -----------------------------------------------------------
  // 窗口标题 = 当前对话标题，交给宿主用它定位对话所属项目。
  function currentTitle() {
    return document.title || ''
  }

  function requestState(scope, dir) {
    var q = '?scope=' + encodeURIComponent(scope) +
      (dir ? '&dir=' + encodeURIComponent(dir) : '') +
      '&title=' + encodeURIComponent(currentTitle())
    return fetch(API + '/state' + q, { cache: 'no-store' }).then(function (r) { return r.json() })
  }

  function saveState(scope, dir, content) {
    return fetch(API + '/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: scope, dir: dir, body: content, title: currentTitle() }),
    }).then(function (r) { return r.json() })
  }

  // ---- 弹层 ---------------------------------------------------------------
  var openMask = null

  function closeEditor() {
    if (openMask) {
      var m = openMask
      openMask = null
      m.remove()
    }
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag)
    if (cls) n.className = cls
    if (text !== undefined) n.textContent = text
    return n
  }

  function openEditor(scope) {
    closeEditor()
    injectStyle()
    var c = palette()
    var isProject = scope === 'project'

    var mask = el('div', 'dsh-agents-mask')
    var panel = el('div', 'dsh-agents-panel')
    panel.style.background = c.bg
    panel.style.color = c.fg
    mask.appendChild(panel)

    var head = el('div', 'dsh-agents-head')
    var title = el('div', 'dsh-agents-title')
    title.appendChild(el('span', null, isProject ? '项目规则 · AGENTS.md' : '全局规则 · AGENTS.md'))
    var pathLine = el('div', 'dsh-agents-path', '正在读取…')
    pathLine.style.color = c.sub
    head.appendChild(title)
    head.appendChild(pathLine)
    panel.appendChild(head)

    var body = el('div', 'dsh-agents-body')
    var dirInput = null
    if (isProject) {
      dirInput = el('input', 'dsh-agents-dir')
      dirInput.type = 'text'
      dirInput.placeholder = '项目目录（留空自动取当前对话所在目录）'
      dirInput.style.background = c.field
      dirInput.style.borderColor = c.border
      dirInput.style.color = c.fg
      body.appendChild(dirInput)
    }
    var fixed = el('div', 'dsh-agents-fixed')
    fixed.appendChild(document.createTextNode('# 工作原则（当前项目生效）'))
    var fixedTip = el('small', null, '首行固定')
    fixedTip.style.color = c.sub
    fixed.appendChild(fixedTip)
    fixed.style.background = c.field
    fixed.style.borderColor = c.border
    fixed.style.color = c.fg
    body.appendChild(fixed)

    var ta = el('textarea', 'dsh-agents-editor attached')
    ta.spellcheck = false
    ta.style.background = c.field
    ta.style.borderColor = c.border
    ta.style.color = c.fg
    body.appendChild(ta)
    panel.appendChild(body)

    var foot = el('div', 'dsh-agents-foot')
    var hint = el('div', 'dsh-agents-hint', '')
    hint.style.color = c.sub
    var cancel = el('button', 'dsh-agents-btn', '关闭')
    cancel.style.borderColor = c.border
    cancel.style.color = c.fg
    var save = el('button', 'dsh-agents-btn primary', '保存')
    save.disabled = true
    foot.appendChild(hint)
    foot.appendChild(cancel)
    foot.appendChild(save)
    panel.appendChild(foot)

    var state = { scope: scope, dir: dirInput ? '' : '', path: '' }
    var saving = false
    var loaded = false

    function setHint(text, bad) {
      hint.textContent = text || ''
      hint.style.color = bad ? '#e5484d' : c.sub
    }

    function load(dir) {
      setHint('读取中…')
      save.disabled = true
      loaded = false
      requestState(scope, dir).then(function (res) {
        if (!res || res.ok === false) {
          state.dir = dir || ''
          pathLine.textContent = (res && res.path) || '未能定位项目目录'
          ta.value = ''
          setHint((res && res.error) || '读取失败', true)
          return
        }
        state.dir = res.dir || ''
        state.path = res.path || ''
        if (dirInput && !dirInput.value && res.dir) dirInput.value = res.dir
        pathLine.textContent = res.path || ''
        if (res.header) fixed.firstChild.nodeValue = res.header
        ta.value = res.exists ? (res.body || '') : (res.defaultBody || '')
        setHint(res.exists ? '已加载，修改后点保存' : '文件还不存在，下面是默认规则，保存后创建')
        panel.dataset.exists = res.exists ? '1' : '0'
        loaded = true
        save.disabled = false
      }).catch(function (err) {
        pathLine.textContent = '读取失败'
        setHint('读取失败：' + String((err && err.message) || err), true)
      })
    }

    function doSave() {
      if (saving) return
      if (!loaded) {
        setHint('还没读到文件内容，先改目录回车重试', true)
        return
      }
      saving = true
      save.disabled = true
      cancel.disabled = true
      var dir = dirInput ? dirInput.value.trim() : ''
      setHint('保存中…')
      saveState(scope, dir, ta.value).then(function (res) {
        if (res && res.ok) {
          state.path = res.path || state.path
          pathLine.textContent = state.path
          setHint('已保存')
          setTimeout(function () {
            saving = false
            save.disabled = false
            cancel.disabled = false
            closeEditor()
          }, 500)
        } else {
          saving = false
          save.disabled = false
          cancel.disabled = false
          setHint((res && res.error) || '保存失败', true)
        }
      }).catch(function (err) {
        saving = false
        save.disabled = false
        cancel.disabled = false
        setHint('保存失败：' + String((err && err.message) || err), true)
      })
    }

    cancel.addEventListener('click', closeEditor)
    save.addEventListener('click', doSave)
    mask.addEventListener('mousedown', function (e) {
      if (e.target === mask) closeEditor()
    })
    panel.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeEditor()
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        e.stopPropagation()
        doSave()
      }
    })
    if (dirInput) {
      dirInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault()
          load(dirInput.value.trim())
        }
      })
    }

    document.body.appendChild(mask)
    openMask = mask
    load(dirInput ? '' : '')
    setTimeout(function () { ta.focus() }, 30)
  }

  // ---- 注入按钮 -----------------------------------------------------------
  function tabsRow() {
    var tabs = document.querySelector('[data-conversation-tabs]')
    if (!tabs) return null
    return tabs.parentElement
  }

  function ensureButtons() {
    var row = tabsRow()
    if (!row) return
    var holder = row.querySelector(':scope > .' + BTN_CLASS)
    if (holder && holder.isConnected) return
    injectStyle()
    holder = el('div', BTN_CLASS)
    var project = el('button', null, '')
    project.type = 'button'
    project.title = '新建 / 编辑当前项目（当前对话所在目录）的 AGENTS.md'
    project.innerHTML =
      '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" ' +
      'stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M9.5 1.8H4.2a1 1 0 0 0-1 1v10.4a1 1 0 0 0 1 1h7.6a1 1 0 0 0 1-1V5.1z"/>' +
      '<path d="M9.4 1.9v3.3h3.3"/><path d="M5.6 8.6h4.8M5.6 11.1h3.2"/>' +
      '</svg><span>项目规则</span>'
    project.addEventListener('click', function (e) {
      e.preventDefault()
      e.stopPropagation()
      openEditor('project')
    })
    holder.appendChild(project)
    row.appendChild(holder)
  }

  function start() {
    injectStyle()
    ensureButtons()
    // 轻量轮询：切换会话、视图重渲染后把按钮补回去。
    // 比监听整页 DOM 变更便宜得多（聊天流式输出时不会被频繁触发）。
    var timer = setInterval(function () {
      try { ensureButtons() } catch (e) {}
    }, 700)
    window.addEventListener('beforeunload', function () { clearInterval(timer) })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start)
  } else {
    start()
  }
})()
