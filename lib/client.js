// dsh-agents-md —— 客户端半区
// 在「设置」里注册一个独立分区：全局 AGENTS.md 编辑器。
// 数据走宿主半区的 /dsh-agents/* 路由（同源 fetch）。
;(function () {
  var NAME = 'dsh-agents-md'
  var CSS_ID = 'dsh-agents-md-settings-css'

  var CSS = [
    '.dsh-agents-set{padding:2px 0 8px;max-width:760px}',
    '.dsh-agents-set__title{font-size:15px;font-weight:600;line-height:1.4}',
    '.dsh-agents-set__desc{font-size:12px;opacity:.6;margin-top:4px;line-height:1.6}',
    '.dsh-agents-set__path{font:12px ui-monospace,Consolas,"Courier New",monospace;opacity:.65;',
    'margin:10px 0 10px;word-break:break-all}',
    '.dsh-agents-set__editor{width:100%;min-height:320px;box-sizing:border-box;resize:vertical;',
    'border:1px solid rgba(127,127,127,.28);border-radius:8px;padding:12px;background:transparent;',
    'color:inherit;font:13px/1.65 ui-monospace,Consolas,"Courier New",monospace;outline:none;',
    'transition:box-shadow .15s,border-color .15s}',
    '.dsh-agents-set__editor:focus{border-color:rgba(77,107,254,.55);box-shadow:0 0 0 2px rgba(77,107,254,.18)}',
    '.dsh-agents-set__fixed{display:flex;align-items:center;justify-content:space-between;gap:8px;',
    'padding:9px 12px;border:1px solid rgba(127,127,127,.28);border-bottom:0;border-radius:8px 8px 0 0;',
    'font:600 13px/1.4 ui-monospace,Consolas,"Courier New",monospace;user-select:none}',
    '.dsh-agents-set__fixed small{font-family:inherit;font-weight:400;font-size:11px;opacity:.6}',
    '.dsh-agents-set__editor.attached{border-radius:0 0 8px 8px}',
    '.dsh-agents-set__foot{display:flex;align-items:center;gap:8px;margin-top:12px}',
    '.dsh-agents-set__status{flex:1;min-width:0;font-size:12px;opacity:.7;overflow:hidden;',
    'text-overflow:ellipsis;white-space:nowrap}',
    '.dsh-agents-set__btn{height:30px;padding:0 16px;border-radius:8px;font-size:13px;cursor:pointer;',
    'border:1px solid rgba(127,127,127,.3);background:transparent;color:inherit;transition:background .15s}',
    '.dsh-agents-set__btn:hover{background:rgba(127,127,127,.10)}',
    '.dsh-agents-set__btn.primary{border-color:transparent;background:#4d6bfe;color:#fff}',
    '.dsh-agents-set__btn.primary:hover{background:#3f5aea}',
    '.dsh-agents-set__btn:disabled{opacity:.5;cursor:default}',
  ].join('')

  function injectCss() {
    if (typeof document === 'undefined') return
    if (document.getElementById(CSS_ID)) return
    var tag = document.createElement('style')
    tag.id = CSS_ID
    tag.textContent = CSS
    document.head.appendChild(tag)
  }

  function makeFactory() {
    return function (require) {
      var module = { exports: {} }
      var react = require('react')
      var useState = react.useState
      var useEffect = react.useEffect
      var jsx = require('react/jsx-runtime').jsx

      // 兜底：本分区渲染出错时只显示一行错误，不连累整个设置页。
      class Boundary extends react.Component {
        constructor(props) {
          super(props)
          this.state = { err: '' }
        }
        static getDerivedStateFromError(err) {
          return { err: String((err && err.message) || err) }
        }
        render() {
          if (this.state.err) {
            return jsx('div', { className: 'dsh-agents-set__desc', children: '编辑器加载失败：' + this.state.err })
          }
          return this.props.children
        }
      }

      function GlobalSection() {
        var s = useState({
          path: '',
          header: '# 工作原则（所有项目生效）',
          body: '',
          exists: false,
          loaded: false,
          status: '读取中…',
          busy: false,
          dirty: false,
        })
        var state = s[0]
        var setState = s[1]

        function patch(next) {
          setState(function (prev) {
            var out = {}
            for (var k in prev) out[k] = prev[k]
            for (var j in next) out[j] = next[j]
            return out
          })
        }

        function load() {
          if (state.busy) return
          patch({ busy: true, status: '读取中…' })
          fetch('/dsh-agents/state?scope=global', { cache: 'no-store' })
            .then(function (r) { return r.json() })
            .then(function (res) {
              if (!res || res.ok === false) {
                patch({ busy: false, loaded: false, status: (res && res.error) || '读取失败' })
                return
              }
              patch({
                path: res.path || '',
                header: res.header || '# 工作原则（所有项目生效）',
                body: res.exists ? (res.body || '') : (res.defaultBody || ''),
                exists: !!res.exists,
                loaded: true,
                status: res.exists ? '已加载' : '文件还不存在，下面是默认规则，保存后创建',
                dirty: false,
                busy: false,
              })
            })
            .catch(function (err) {
              patch({ busy: false, loaded: false, status: '读取失败：' + String((err && err.message) || err) })
            })
        }

        function save() {
          if (state.busy) return
          if (!state.loaded) {
            patch({ status: '还没读到文件内容，先点「重新读取」' })
            return
          }
          patch({ busy: true, status: '保存中…' })
          fetch('/dsh-agents/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scope: 'global', body: state.body, createOnly: !state.exists }),
          })
            .then(function (r) { return r.json() })
            .then(function (res) {
              if (res && res.ok) {
                patch({ busy: false, dirty: false, exists: true, loaded: true, status: '已保存' })
              } else if (res && res.code === 'EEXIST') {
                patch({
                  busy: false,
                  loaded: false,
                  dirty: false,
                  status: (res && res.error) || '目标文件已存在，已停止覆盖；请点「重新读取」',
                })
              } else {
                patch({ busy: false, status: (res && res.error) || '保存失败' })
              }
            })
            .catch(function (err) {
              patch({ busy: false, status: '保存失败：' + String((err && err.message) || err) })
            })
        }

        useEffect(function () {
          injectCss()
          load()
        }, [])

        return jsx(Boundary, {
          children: jsx('div', {
            className: 'dsh-agents-set',
            children: [
              jsx('div', { key: 'head', children: [
                jsx('div', { key: 't', className: 'dsh-agents-set__title', children: '全局规则 · AGENTS.md' }),
                jsx('div', { key: 'd', className: 'dsh-agents-set__desc', children: '所有工作区共用，每个会话开始时自动加载。' }),
              ] }),
              jsx('div', { key: 'path', className: 'dsh-agents-set__path', children: state.path || '…' }),
              jsx('div', {
                key: 'fixed',
                className: 'dsh-agents-set__fixed',
                children: [
                  jsx('span', { key: 'h', children: state.header }),
                  jsx('small', { key: 'n', children: '首行固定' }),
                ],
              }),
              jsx('textarea', {
                key: 'editor',
                className: 'dsh-agents-set__editor attached',
                spellCheck: false,
                value: state.body,
                onChange: function (e) { patch({ body: e.target.value, dirty: true }) },
                onKeyDown: function (e) {
                  if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
                    e.preventDefault()
                    save()
                  }
                },
              }),
              jsx('div', { key: 'foot', className: 'dsh-agents-set__foot', children: [
                jsx('span', { key: 's', className: 'dsh-agents-set__status', children: state.status }),
                jsx('button', {
                  key: 'r', type: 'button', className: 'dsh-agents-set__btn',
                  disabled: state.busy, onClick: load, children: '重新读取',
                }),
                jsx('button', {
                  key: 'w', type: 'button', className: 'dsh-agents-set__btn primary',
                  disabled: state.busy || !state.loaded || (!state.dirty && state.exists),
                  onClick: save, children: '保存',
                }),
              ] }),
            ],
          }),
        })
      }

      var name = NAME
      var inject = ['slots']

      function apply(ctx) {
        try {
          injectCss()
          ctx.slots.inject('settings.section', function* () {
            yield ctx.slots.register({
              name: 'settings.section',
              id: 'agents-md-global',
              order: 40,
              label: function () { return '全局规则' },
            }, GlobalSection)
          })
        } catch (err) {
          console.warn('[dsh-agents-md] 设置分区注册失败：' + String((err && err.message) || err))
        }
      }

      module.exports = { apply: apply, inject: inject, name: name }
      return module.exports
    }
  }

  window.__ModuleLoader__.load({ id: NAME, factory: makeFactory() })
})()
