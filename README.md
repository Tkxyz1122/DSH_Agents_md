# dsh-agents-md

dsh-agents-md 是一个 DSH 客户端插件，把 AGENTS.md 的创建与编辑直接放进工作流：在会话标签行点「项目规则」，就能编辑当前对话所在项目的规则文件；在设置页的「全局规则」里，维护对所有项目生效的通用原则。

两个编辑器共用一套体验：首行固定标题不可改、正文随意编辑、`Ctrl+S` 保存；文件不存在时预填一份默认规则，点保存即创建。项目目录默认跟随当前对话，路径可随时手动调整。

两个入口：

- **项目规则**：会话标签行右侧的按钮，新建 / 编辑**当前对话所在项目**的 `AGENTS.md`
- **全局规则**：设置页里的独立分区，编辑 `~/.dsh/AGENTS.md`

## 特性

- 标签行按钮与「对话 / 轨迹」同字号、同基线、同间距，带文档图标和悬停胶囊
- 编辑器跟随 DSH 的浅色 / 深色主题
- 全局规则与项目规则互不干扰；项目里的规则更具体，优先于全局
- 首行固定标题，保存时强制写回，避免出现两个 H1
- 项目目录默认取**当前打开对话**所属工作区，弹层顶部也能手动改
- 新建时预填内置默认规则（见下文）
- 原子写入（先写临时文件再改名），内容上限 1 MB
- 接口只接受本机回环、同源请求，不联网

## 安装（桌面客户端）

两种方式任选其一；装完都要**完全退出客户端（含托盘）再重新打开**才生效。

### 方式一：从 GitHub 安装（推荐，不依赖源码目录）

在客户端「插件」页把 `github:Tkxyz1122/DSH_Agents_md` 填为安装来源；或者在 profile 目录里执行（命令行里没有 `pnpm` 时用前者）：

```powershell
cd "$env:USERPROFILE\.dsh\profiles\desktop"
pnpm add github:Tkxyz1122/DSH_Agents_md
```

装好后 `node_modules\dsh-agents-md` 是实体副本，源码目录可以随意移动或删除；升级时重新安装一次即可。

### 方式二：从本地目录链接安装（改代码时用）

1. 把本仓库放到任意目录，例如 `D:\plugins\dsh-agents-md`。

2. 链接进桌面 profile 的 `node_modules`：

   ```powershell
   cmd /c mklink /J "%USERPROFILE%\.dsh\profiles\desktop\node_modules\dsh-agents-md" "D:\plugins\dsh-agents-md"
   ```

3. 在 `%USERPROFILE%\.dsh\profiles\desktop\package.json` 里登记插件：

   ```json
   {
     "dependencies": {
       "dsh-agents-md": "link:D:\\plugins\\dsh-agents-md"
     },
     "dsh": {
       "profile": {
         "bundles": ["...原有插件...", "dsh-agents-md"]
       }
     }
   }
   ```

4. 完全退出客户端（含托盘）后重新打开。

> 用客户端的「插件」页从本地目录安装也可以，本质同样是 link + bundles 登记。
> 这种方式下插件始终读取源码目录：改完代码后宿主半区要完全重启才生效（`assets/agents-widget.js` 刷新页面即可）；源码目录被移动或删除，插件就失效了。

## 使用

1. 打开任意会话，点标签行右侧的「项目规则」：
   - 路径默认是当前对话所在项目，可在弹层顶部改成别的目录；
   - 项目里还没有 `AGENTS.md` 时，正文框会预填默认规则，点「保存」即创建。
2. 打开「设置 → 全局规则」，编辑 `~/.dsh/AGENTS.md`。

两个编辑器的首行都是固定标题，**可见但不可编辑**：

| 范围 | 固定首行 |
|---|---|
| 全局 | `# 工作原则（所有项目生效）` |
| 项目 | `# 工作原则（当前项目生效）` |

保存时由宿主拼回这一行；已有文件如果首行是别的 H1，会被替换掉，不会出现重复标题。

## 默认规则

文件不存在时，编辑器预填下面的正文（固定首行单独写入）：

<details>
<summary>全局默认正文</summary>

```markdown
## 通用
- 先看清现状再动手，不确定就问，不要猜

## 文件
- 生成的文件默认放在当前项目目录内，临时文件统一放项目的_Temp/下
- 若文件需要写在项目外请申请审批，并告知需要写入的目标目录
- 删除覆盖已有文件需征得审批同意，并列出需要删除或者覆盖的文件

## 交付
- 完成后说明：改了什么、放在哪、清理了什么

## 安全
- 不做破坏性操作（批量删除、格式化、改系统设置），除非明确要求
```

</details>

<details>
<summary>项目默认正文</summary>

```markdown
## 关于本项目（一句话说明项目用途）
- 本项目XXXXXX

## 约定（遵循规则）
- 生成的文件放在：项目根目录
- 生成的临时过程文件放在：项目根目录/_Temp/
- 禁止事项：搞破坏
```

</details>

想改默认内容，编辑 `lib/index.js` 里的 `DEFAULT_GLOBAL_BODY` 与 `DEFAULT_PROJECT_BODY` 两个常量。

## 项目目录是怎么定位的

弹层打开时，宿主按顺序尝试：

1. 弹层顶部手填的目录（最高优先级）
2. 窗口标题（= 当前对话标题）→ 在 `~/.dsh/storages/session_projcache` 找到该会话的 `cwd`
3. 最近有写入的会话 → 用 `~/.dsh/storages/workspace.json` 映射到工作区路径
4. 最近更新的工作区

用到了会话缓存，所以标题重复时会取最近写入的那份；定位不准时直接在弹层顶部改路径即可。

## 目录结构

```text
dsh-agents-md/
├── package.json
├── cordis.patch.yml        # bundle 挂载声明
├── icon.png
├── lib/
│   ├── index.js            # 宿主：/dsh-agents/* 路由 + 前端注入
│   └── client.js           # 客户端：设置页「全局规则」分区
├── assets/
│   └── agents-widget.js    # 标签行按钮 + 项目规则编辑弹层
├── LICENSE
└── README.md
```

## 宿主路由

| 路由 | 方法 | 用途 |
|---|---|---|
| `/dsh-agents/state?scope=global\|project&dir=&title=` | GET | 读取目标文件路径、是否存在、固定首行、正文、默认正文 |
| `/dsh-agents/save` | POST `{scope, dir, title, body}` | 写入 AGENTS.md（不存在则创建） |
| `/dsh-agents/widget.js` | GET | 标签行按钮脚本 |

## 兼容与限制

- 需要带 `settings.section` 槽位和 `webserver/index-inject` 注入点的 DSH 桌面客户端
- 安装或升级后必须完全重启客户端才生效
- 只在桌面端做过完整验证；`dsh web` 形态保留了注入逻辑，但未做完整回归
- 链接安装始终读取源码目录；从 GitHub / tarball 安装的是实体副本，不依赖源码目录
- 同一份 AGENTS.md 被多个窗口同时编辑时没有文件锁，后保存的会覆盖先保存的
- 不访问网络，不收集任何数据；所有读写都发生在你本机

## License

[MIT](LICENSE)
