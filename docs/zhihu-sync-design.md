# Zhihu Sync 本机归档设计

> 非官方社区项目。本项目与知乎没有隶属、授权或背书关系。

## 当前阶段

自动归档系统当前以 Developer Preview 形式交付：GitHub Release 提供扩展成品、
完整源码快照和 npm 安装包；npm 的 `next` 渠道提供已构建 CLI、Native Host 与扩展资源。
正式稳定渠道和自包含安装器尚未发布。

本机版已经实现完整的收藏夹增量归档：

1. `sync --dry-run` 通过专用 Edge 登录会话读取白名单收藏夹，只生成远端/本地差异报告。
2. `sync` 新增文章或回答；`updated_time` 变化时先保存旧正文，再原子覆盖主文件。
3. `--comments` 仅对本次新增或更新的条目抓取评论，评论文件原子覆盖、不保留历史版本。
4. `calibrate --dry-run` 只读比对旧 `export-progress-{id}.json` 与实际 Markdown Front Matter。
5. macOS LaunchAgent 每天 04:30 运行一次无评论同步。

## 安全边界

- Native host 仅接受配置中确切的扩展 ID。
- Cookie 始终留在 Edge 中。
- Native host 的 stdout 仅用于 Chrome/Edge 长度前缀 JSON 协议，日志只能输出到 stderr 或文件。
- 扩展只能接收配置白名单收藏夹 ID，不允许 Native Messaging 消息指定任意收藏夹 URL。
- 本地存在而远端目录没有的内容一律保留，绝不据此删除文件。
- 只处理文章和回答；付费内容与其他类型默认跳过。
- 图片下载失败时保留远端图片链接，不以空的本地链接污染正文。

## 使用

```text
zhihu-sync setup --vault /absolute/path/to/knowledge-base
zhihu-sync sync --dry-run          # 只读预检
zhihu-sync sync                    # 正式增量同步，默认无界面、不抓评论
zhihu-sync sync --comments         # 新增/更新正文时同时覆盖评论
zhihu-sync votes --dry-run         # 只读预检赞同回答（每批最多 100 页）
zhihu-sync votes                   # 归档赞同回答，自动断点续跑
zhihu-sync votes --comments        # 同步赞同回答并覆盖相关评论
zhihu-sync sync --show-browser     # 排障时显示专用 Edge
zhihu-sync login                   # 登录失效时重新登录
zhihu-sync doctor                  # 检查本机配置
zhihu-sync schedule status         # 查看每日任务
```

旧正文保存在每个收藏夹的 `articles/versions/<知乎ID>/`；评论文件不进入版本目录。
赞同回答保存到 `赞同的回答/articles/`，断点位于 `赞同的回答/vote-state.json`。

## 许可证与上游

本项目基于 [chouheiwa/download-zhihu](https://github.com/chouheiwa/download-zhihu)
二次开发，并保留完整 Git 历史。上游 README 标注 MIT，而历史 `package.json`
标注 ISC；两者均为宽松开源许可证。本仓库以根目录 `LICENSE` 中的 MIT
许可证发布，详细归属说明见 `NOTICE.md`。

本机归档扩展使用固定公开密钥，开发 ID 为
`epeaegmdchjfdoiibjojilapfeobibog`。该公开密钥不包含任何账号或签名凭据。

专用 Edge 数据目录默认为
`~/Library/Application Support/Zhihu Sync/Edge`，Native Messaging manifest 放在该数据目录的
`NativeMessagingHosts/` 子目录，不污染日常 Edge 配置。

当前自动归档 CLI、Native Messaging 注册和定时任务只在 macOS（Apple Silicon、
Microsoft Edge、Node.js 22）上验证。浏览器扩展本体可以在 Chromium 系浏览器中构建和加载，
Windows 自动归档支持尚未完成。
