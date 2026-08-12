# Zhihu Sync

> **别让知乎收藏夹继续吃灰——让 Agent 用一条命令，把收藏与赞同持续沉淀为开放的本地 Markdown 知识库。**
>
> 无需逐篇手动导出；内容可直接用于 Obsidian、Typora、Logseq、VS Code 等工具，
> 也可导入 Notion，并随时交给 Agent 检索、分析与整理。

[![npm version](https://img.shields.io/npm/v/zhihu-sync?label=npm)](https://www.npmjs.com/package/zhihu-sync)
[![CI](https://github.com/Michael-Han0608/zhihu-sync/actions/workflows/ci.yml/badge.svg)](https://github.com/Michael-Han0608/zhihu-sync/actions/workflows/ci.yml)

基于 [chouheiwa/download-zhihu](https://github.com/chouheiwa/download-zhihu)
二次开发的浏览器导出扩展与本机增量归档工具。它包含两种使用方式：

- **浏览器导出**：将文章、回答、问题、想法、收藏夹和专栏导出为 Markdown 或 Word。
- **本机增量归档**：通过 `zhihu-sync`、专用 Edge 和 Native Messaging，将白名单收藏夹及
  “赞同的回答”只增不减地保存为本地 Markdown；可直接放入 Obsidian 等知识库目录。

本机增量归档的设计、安全边界和命令说明见
[`docs/zhihu-sync-design.md`](docs/zhihu-sync-design.md)。

## 平台支持

| 组件 | macOS | Windows | Linux |
|------|-------|---------|-------|
| 浏览器导出扩展 | 可构建、可加载 | 可构建、可加载 | 可构建、可加载 |
| `zhihu-sync` 自动归档 | 已在 Apple Silicon + Edge + Node.js 22 验证 | 已在 Windows + Edge + Node.js 22+ 验证 | 尚未适配 |

Windows 自动归档使用专用 Edge 配置、Windows Native Messaging 注册表和 Task Scheduler，
可以直接使用 `setup`、`login`、`sync`、`votes` 及每日定时同步。首次使用前请先执行
`sync --dry-run`，并备份目标知识库目录。

> [!WARNING]
> 自动归档系统目前是 **Developer Preview**。安装、升级和跨机器迁移流程仍在完善；
> 请先执行 `--dry-run`，并备份目标知识库目录。

## 功能特性

- **多类型支持** — 文章、回答、问题、想法、收藏夹、专栏一键导出
- **个人主页导出** — 导出本人主页（`/people/:token`）的文章、回答、想法
- **导出管理器** — 独立的 Extension Page，支持收藏夹、专栏和个人主页的批量导出管理
- **按时间线导出** — 从旧到新按时间线导出，支持增量导出（只导出新增内容）
- **评论区导出** — 文章列表勾选式评论导出，显示作者、类型、收藏时间、评论数量
- **进度持久化** — 导出进度保存在文件夹中，中断后可继续，多收藏夹互不冲突
- **流式导出** — 逐页拉取逐页处理，无需等待全部目录加载完成
- **请求节流** — 自动控制请求频率（500ms 间隔），403 时指数退避重试
- **高质量转换** — 完整保留数学公式、代码块、表格、脚注、链接卡片
- **图片本地化** — 自动下载文章和评论中的图片，存入本地文件夹
- **Front Matter** — 自动生成 YAML 元数据（id、标题、作者、来源、日期）
- **浮动按钮** — 知乎页面内直接显示可拖拽按钮，无需打开弹窗
- **浏览器内工作** — 不需要单独申请 API Key；需要登录才能访问的内容沿用浏览器会话
- **隐私安全** — 纯本地运行，不收集任何用户数据
- **只增不减归档** — 远端取消收藏或取消赞同时不删除本地内容
- **正文版本记录** — 内容更新时间变化时保留旧正文快照
- **可选评论覆盖** — 仅显式传入 `--comments` 时保存评论，不保留评论历史版本

## 安装方式

### 浏览器扩展成品

1. 前往 [Releases](../../releases) 下载 `ZhihuSync-extension-vX.Y.Z.zip`
2. 解压到一个固定位置（不要删除解压后的文件夹）
3. 打开 Chrome，访问 `chrome://extensions/`
4. 右上角开启 **开发者模式**
5. 点击 **加载已解压的扩展程序**，选择解压后的文件夹

该 ZIP 只包含浏览器导出扩展。要使用 Agent 自动归档，请继续安装下面的 CLI。

### npm 安装自动归档 CLI（Developer Preview）

当前预览版要求 macOS 或 Windows、Microsoft Edge 和 Node.js 22 或更高版本：

```bash
npm install --global zhihu-sync@next
zhihu-sync setup --vault "/absolute/path/to/your/knowledge-base/zhihu"
```

`setup` 会使用当前 Node.js 的绝对路径注册 Native Messaging Host，并创建最小配置；
它不会静默覆盖已有配置。macOS 配置位于 `~/.config/zhihu-sync/config.json`，Windows
配置位于 `%APPDATA%\zhihu-sync\config.json`。随后补充需要同步的收藏夹白名单，再执行：

```bash
zhihu-sync doctor
zhihu-sync login
zhihu-sync sync --dry-run
zhihu-sync sync
```

npm 包同时包含 CLI、Native Host 和专用浏览器扩展构建产物，不需要克隆源码或运行构建。
它仍需要 Node.js 22；自包含安装器尚未提供。

### GitHub Release 源码包（Developer Preview）

每个预览版 Release 同时提供：

- `ZhihuSync-extension-vX.Y.Z.zip`：浏览器扩展成品。
- `ZhihuSync-developer-preview-source-vX.Y.Z.tar.gz`：完整源码快照，需自行构建。
- `zhihu-sync-X.Y.Z.tgz`：与 npm `next` 渠道相同的安装包，可用于离线检查或安装。
- `SHA256SUMS`：上述附件的 SHA-256 校验值。

源码包安装：

```bash
tar -xzf ZhihuSync-developer-preview-source-vX.Y.Z.tar.gz
cd zhihu-sync-vX.Y.Z
npm ci
npm run build
node dist-cli/zhihu-sync.mjs setup --vault "/absolute/path/to/your/knowledge-base/zhihu"
```

### 从源码构建

1. 克隆本仓库
2. 安装依赖并构建：
   ```bash
   npm ci
   npm run build
   ```
3. 打开 Chrome，访问 `chrome://extensions/`
4. 开启右上角 **开发者模式**
5. 点击 **加载已解压的扩展程序**，选择 `dist/` 目录

### 本机增量归档配置（macOS / Windows）

增量归档当前面向熟悉命令行的用户，要求 Microsoft Edge、Node.js 22 和一个本地
Markdown 知识库目录。`setup --vault` 会生成最小配置；Windows 用户请在 PowerShell
中使用 Windows 路径，例如：

```bash
npm install --global zhihu-sync@next
zhihu-sync setup --vault "C:\Users\you\Documents\ObsidianVault\zhihu"
zhihu-sync login
zhihu-sync sync --dry-run
zhihu-sync schedule install --hour 4 --minute 30
```

Windows 的登录和同步会复用 `%LOCALAPPDATA%\Zhihu Sync\Edge`，不会使用或关闭日常
Edge 窗口。运行同步前请关闭遗留的 Zhihu Sync 专用窗口；普通 Edge 窗口不受影响。
Windows 收藏夹目录会自动替换文件系统禁用字符、清理末尾点和空格，并为 `CON`、
`PRN`、`AUX`、`NUL`、`COM1`-`COM9`、`LPT1`-`LPT9` 等保留设备名加前缀，以保证归档可写。

macOS 用户仍可手工复制示例：

```bash
mkdir -p ~/.config/zhihu-sync
cp config.example.json ~/.config/zhihu-sync/config.json
```

随后按 [`docs/zhihu-sync-design.md`](docs/zhihu-sync-design.md) 检查配置并使用：

```bash
zhihu-sync doctor
zhihu-sync login
zhihu-sync sync --dry-run
zhihu-sync sync
```

`config.json`、专用 Edge 用户目录以及同步所得文章均不会被 Git 跟踪。

## 使用方法

### 单篇下载

1. 打开任意知乎文章、回答、问题或想法页面
2. 页面右下角会出现一个可拖拽的浮动按钮
3. 点击按钮展开面板，确认识别到的内容信息
4. 根据需要调整选项（下载图片、导出评论区等）
5. 点击下载按钮

| 条件 | 输出格式 |
|------|---------|
| 无图片、无评论 | `.md` 文件 |
| 有图片或有评论 | `.zip` 压缩包 |

### 收藏夹 / 专栏批量导出

1. 打开知乎收藏夹或专栏页面
2. 点击浮动按钮，面板显示"打开导出管理器"
3. 在导出管理器页面中选择导出文件夹
4. 点击"开始导出"，自动按时间线从旧到新导出全部内容
5. 新增内容后，再次打开导出管理器即可增量导出

**评论导出：** 在导出管理器的"评论导出"区域，勾选需要导出评论的文章，点击导出即可。

```
导出文件夹/
├── export-progress-{id}.json       # 进度文件（自动管理）
└── 收藏夹名称/
    ├── README.md                   # 目录索引
    └── articles/
        ├── 文章标题.md
        ├── 问题标题-作者的回答.md
        ├── 问题标题-作者的回答-评论.md
        └── images/
            ├── 001_001.jpg
            └── comment_xxx_001_001.jpg
```

### 文件命名规则

| 类型 | 文件名格式 |
|------|-----------|
| 文章 | `文章标题.md` |
| 回答 | `问题标题-作者的回答.md` |
| 想法 | `内容前30字-作者的想法.md` |

## 支持的内容类型

| 类型 | URL 格式 | 单篇下载 | 批量导出 | 评论导出 |
|------|---------|---------|---------|---------|
| 文章 | `zhuanlan.zhihu.com/p/{id}` | 支持 | — | 支持 |
| 回答 | `zhihu.com/question/{qid}/answer/{aid}` | 支持 | — | 支持 |
| 问题 | `zhihu.com/question/{qid}` | 支持 | — | — |
| 想法 | `zhihu.com/pin/{id}` | 支持 | — | 支持 |
| 收藏夹 | `zhihu.com/collection/{id}` | — | 支持 | 支持 |
| 专栏 | `zhihu.com/column/{id}` | — | 支持 | 支持 |

## Markdown 转换规则

- 数学公式（`eeimg`）→ LaTeX `$...$` / `$$...$$`
- 带语言标记的代码块 → 围栏代码块
- HTML 表格 → Markdown 表格
- `<figure>` 图片 → `![alt](src)`
- 知乎脚注 `<sup>` → Markdown 脚注 `[^n]`
- 视频占位 → 链接
- 链接卡片 → Markdown 链接

## 技术架构

**技术栈：** React 19 + Ant Design 5 + TypeScript + Zustand + Vite 8 + CRXJS

```
src/
├── manifest.ts                         # CRXJS 扩展清单 (Manifest V3)
├── background/
│   └── index.ts                        # Service Worker：消息中转、打开导出页面
├── content/
│   ├── index.tsx                       # Content Script 入口：React 渲染
│   ├── detector.ts                     # 页面检测 + 内容提取 + fetch 代理
│   ├── fetch-bridge.js                 # 页面上下文桥接（携带 x-zse 签名）
│   ├── hooks/
│   │   ├── usePageDetect.ts            # 页面类型检测 Hook
│   │   └── useFolderHandle.ts          # IndexedDB 文件夹句柄持久化 Hook
│   └── components/
│       ├── PanelHost.tsx               # Shadow DOM + Antd StyleProvider 隔离
│       ├── FloatingButton.tsx          # 可拖拽浮动按钮
│       ├── ContentApp.tsx              # 面板路由调度
│       ├── ArticlePanel.tsx            # 单篇导出面板
│       ├── CollectionPanel.tsx         # 收藏夹面板
│       └── ColumnPanel.tsx             # 专栏面板
├── export/
│   ├── index.html                      # 导出管理器页面
│   ├── main.tsx                        # 导出管理器入口
│   ├── export.css                      # 水墨风界面样式
│   └── components/
│       ├── ExportManager.tsx           # 主布局
│       ├── FolderPicker.tsx            # 文件夹选择 + 进度校准
│       ├── ArticleList.tsx             # 文章批量导出
│       ├── CommentExport.tsx           # 评论导出（Antd Table）
│       └── LogPanel.tsx                # 日志面板
├── shared/
│   ├── api/
│   │   ├── zhihu-api.ts                # 知乎 API 层（收藏夹/专栏/评论）
│   │   ├── proxy-fetch.ts              # Extension Page 代理请求 + 403 重试
│   │   └── throttle.ts                 # 请求节流
│   ├── converters/
│   │   ├── html-to-markdown.ts         # Turndown 自定义规则
│   │   ├── html-to-docx.ts             # docx 库 + 公式转换
│   │   └── zhihu-html-utils.ts         # 知乎 HTML 元素识别
│   ├── stores/
│   │   ├── uiStore.ts                  # UI 状态（Zustand）
│   │   └── exportStore.ts              # 导出状态（Zustand）
│   ├── theme/
│   │   ├── token.ts                    # Antd 主题配置
│   │   └── ink-wash.module.css         # 水墨纹理装饰
│   └── utils/
│       ├── export-utils.ts             # 文件操作、图片下载、Front Matter
│       └── progress.ts                 # 进度文件管理
└── types/
    ├── zhihu.ts                        # 领域类型定义
    └── messages.ts                     # 消息协议类型
```

## 权限说明

| 权限 | 用途 |
|------|------|
| `activeTab` | 读取当前知乎页面内容 |
| `storage` | 缓存收藏夹/专栏目录数据 |
| `unlimitedStorage` | 支持大型收藏夹的目录缓存 |
| `scripting` | 在已授权的知乎页面中执行导出与同步桥接逻辑 |
| `nativeMessaging` | 与用户本机安装的增量归档组件通信 |
| `host_permissions` (zhihu.com) | 从导出管理器页面访问知乎 API |

扩展只声明知乎域名权限，不读取其他网站。普通浏览器导出不要求安装 Native host；
使用本机增量归档时，扩展会在专用 Edge 配置中与本地归档组件通信。Cookie 留在浏览器中，
项目不收集或上传用户数据。

## 发布流程(维护者)

当前 Release 默认标记为 Developer Preview，并附带扩展 ZIP、完整源码快照、npm tarball
和 `SHA256SUMS`。npm 预览版以 `next` dist-tag 发布；首次发布时 npm 同时将唯一版本设为
`latest`，因此在稳定版发布前仍建议显式安装 `zhihu-sync@next`。

首次 npm 包已经人工发布并完成安装验证。后续版本由 npm Trusted Publisher 仅授权
`Michael-Han0608/zhihu-sync` 的 `release.yml`，在仓库变量 `NPM_PUBLISH_ENABLED=true`
时通过 OIDC 自动发布到 `next`；仓库不保存长期 npm Token。若要暂停 npm 自动发布，
将该变量设为 `false` 即可，不影响 GitHub Release。

1. 在下方「更新日志」新增 `### vX.Y.Z` 小节并写明本次变更（CI 会直接复用为 GitHub Release 正文；缺失则发布失败）。
2. 提交改动:`git commit -am "docs: vX.Y.Z 更新日志"`。
3. 升版本并打 tag(三选一):`npm version patch` / `npm version minor` / `npm version major` —— 自动 bump `package.json`、提交并打好 `vX.Y.Z` tag(`src/manifest.ts` 版本由 `package.json` 自动派生,无需手改)。
4. 推送:`git push --follow-tags`。
5. 其余交给 CI：校验版本 == tag → 测试构建 → 生成四类附件与校验文件 → 发布 GitHub Pre-release → 通过 OIDC 同步 npm `next`。浏览器商店发布不在当前工作流中。

## 更新日志

### v3.3.0

- 新增 `zhihu-sync` 本机增量归档命令和 Native Messaging 桥接。
- 支持白名单收藏夹与“赞同的回答”只增不减归档。
- 正文更新时保存旧版本；评论改为显式 `--comments`、覆盖保存且不保留版本。
- 新增断点续传、磁盘空间安全线、运行超时、只读预检和每日 macOS LaunchAgent。
- Windows 适配使用专用 Edge 配置、Native Messaging 注册表和 Windows Task Scheduler，
  并已完成真实 `dry-run` 与临时 vault 写入 smoke test。

### v3.1.0

- **新增个人主页导出**：支持导出知乎个人主页(`/people/:token`)的文章、回答、想法;仅允许导出已登录用户**本人**主页,防止滥用
- **性能**：操作日志仅保留最近 500 条,修复大批量导出时日志累积导致的界面卡顿(单次追加与渲染量由 O(N) 降为常数级,整场导出由 O(N²) 降为 O(N))
- **Word 公式导出重构**：改用 OMML 直接注入(temml → mml2omml → `ImportedXmlComponent`),替换有损的手写 OMML→docx 转换器
- 修复多行公式(`\begin{equation}`/`\begin{split}` 等)在 Word 中导出为空白
- 修复 `\oint`(环路积分)、`\prod`(连乘)被错误渲染为求和号 Σ
- 修复 `\mathbf`/`\mathcal`/`\text`/`\operatorname` 等样式丢失为默认斜体
- 修复 `\dot`/`\vec`/`\hat` 等重音渲染异常(改为正确的 `m:acc`/`m:groupChr`)
- 还原 `\boxed{}` 公式方框
- 消除 ∑/∏/∫ 等算符后的空白方框
- 引入 Vitest + jsdom 测试体系:含 96 条真实公式回归测试与端到端 `.docx` 校验

### v3.0.0

- **全面重构**：从原生 JavaScript 迁移至 React 19 + Ant Design 5 + TypeScript + Zustand
- **构建工具**：使用 Vite 8 + CRXJS 插件，支持热更新开发和代码分割
- **UI 升级**：Content Script 使用 Shadow DOM 隔离样式，导出管理器采用 Ant Design 组件
- **评论导出表格化**：评论导出改用 Antd Table，支持按收藏时间排序和多选
- **收藏时间记录**：区分文章创建时间与收藏时间，Front Matter 新增 `collected` 字段
- **CI 适配**：GitHub Actions release workflow 适配 Vite 构建流程

### v2.1.3

- 修复收藏夹/专栏批量导出时缺少创建时间和修改时间的问题

### v2.1.2

- 修复 Markdown 导出公式丢失：兼容知乎新版 `<span data-eeimg>` 公式格式
- 提取共享 HTML 识别模块 `zhihu-html-utils.js`，统一公式、图片、脚注、视频、链接卡片的检测逻辑
- Markdown 导出跳过知乎目录导航和参考文献列表
- Front Matter 新增创建时间和修改时间，原日期字段改为下载日期
- 修复单篇导出时 id 和时间信息缺失的问题

### v2.1.1

- 升级 docx 库至 v9.6.1，引用改用尾注，减少页面空间占用
- 改进 Word 排版：标题加粗加大、引用块楷体灰色背景、正文 1.5 倍行距
- 跳过知乎目录导航区域的导出
- 改进评论区样式：增大字号、优化间距和背景色
- 插件更新后自动检测版本不匹配，提示刷新页面
- 已导出评论的文章允许重新导出，支持评论更新

### v2.1.0

- 新增 Word (.docx) 导出格式，支持单篇和批量导出
- 支持图片嵌入或外部链接两种模式
- 数学公式导出为 Word 原生公式（OMML），转换失败时降级为 LaTeX 文本
- 评论可独立导出为 .docx 文件
- docx 库按需加载，不影响普通页面性能

### v2.0.2

- 新增"保存到文件夹"功能：单篇导出时可直接写入指定文件夹（适配 Obsidian vault 等场景），文件夹路径自动记忆
- 新增长文章内容补全：收藏夹导出时自动检测截断内容，请求完整页面补全
- 新增付费内容检测：自动识别付费文章并检查购买状态，未购买内容使用截断版本
- 新增 `zhuanlan.zhihu.com/{id}` 格式专栏 URL 识别
- 内容提取改为 initialData + DOM 双源取长，解决部分长文章截断问题
- 代理请求改为逐标签页尝试，单个标签页失败不阻塞整体
- 收藏夹导出增加单篇失败容错和详细日志汇总
- 单篇导出面板增加调试日志区域

### v2.0.1

- 修复专栏 URL 识别：支持任意格式的专栏 ID（如 `AndyLee`），不再限制为 `c_数字` 格式
- 导出管理器改为流式处理：逐页拉取逐页导出，无需等待全部目录加载完成
- 修复文件名含零宽字符（如零宽空格）导致文件写入失败的问题
- 移除目录缓存机制和刷新缓存按钮，简化导出流程

### v2.0.0

- 全新导出管理器，支持收藏夹和专栏的批量导出
- 评论区导出：勾选式选择文章，批量导出评论
- 进度持久化：中断后可继续导出
- 请求节流与 403 自动重试
- 图片本地化：自动下载文章和评论中的图片

## 许可证

[MIT](LICENSE)。本项目基于
[chouheiwa/download-zhihu](https://github.com/chouheiwa/download-zhihu) 二次开发；
上游归属及历史许可证元数据差异见 [NOTICE.md](NOTICE.md)。

## Use at your own risk

本项目是非官方社区工具，按“现状”提供，不保证持续可用、数据完整或与知乎后续改动兼容。
自动化访问可能受到平台规则、频率限制、接口变化或账号风控影响。请控制使用频率、先执行
`--dry-run`、妥善备份本地资料，并确保你有权保存和使用相关内容。因使用本项目造成的账号限制、
数据丢失、内容权利纠纷或其他损失，由使用者自行承担风险和责任。
