# Task Sprite

独立运行的像素桌面任务伙伴。Tauri 2 + React + TypeScript + Rust + SQLite，无需账号、后台服务或 FlowCraft。

暖白像素便笺，内置橘猫、柴犬、机器人、小幽灵；支持本地任务新增、编辑、完成与恢复、当前专注、延期显示、每日汇总、稍后提醒与免打扰。

## macOS 使用

可直接打开：`release/Task Sprite.app`。原始构建产物位于 `src-tauri/target/release/bundle/macos/Task Sprite.app`。双击启动；点击精灵展开任务面板，拖动精灵可移动；菜单栏图标可以找回窗口或退出。关闭面板不退出应用。

首次进入「提醒设置」点击「发送一条测试提醒」，允许系统通知。macOS 端使用 UserNotifications 原生接口检查授权及提交结果，系统专注模式、横幅设置仍可能影响实际展示。未授权或提交失败时保留待提醒记录，任务气泡继续可用。应用退出后停止调度；重新启动只补当天汇总。

本地构建采用完整 ad-hoc 签名以绑定应用身份；暂未使用 Developer ID 签名和公证，尚不是公开发行包。Windows 构建入口保留，但未在 Windows 实机验证；macOS 多显示器和 Spaces 行为需按实际设备进一步验收。

## 数据与备份

数据文件：`~/Library/Application Support/io.jojoshine.tasksprite/tasks.sqlite3`。

任务、角色、窗口位置、提醒偏好和通知去重均写入 SQLite。备份前退出应用，复制整个上述目录；恢复时同样先退出应用。升级不删除数据，遇到高于本应用版本的数据结构会拒绝打开；执行数据库迁移前保留备份。

首版不包含任务删除、云同步、小程序、AI、养成、自动操作电脑或 Agent/Harness 接入。

## 开发

要求 Node.js 22.12+、Rust 稳定版与 Xcode。此次使用项目内 `.tooling` Rust 工具链，未修改 shell 配置。

```sh
npm ci --registry=https://registry.npmjs.org
export CARGO_HOME="$PWD/.tooling/cargo"
export RUSTUP_HOME="$PWD/.tooling/rustup"
export PATH="$CARGO_HOME/bin:$PATH"
npm run desktop
```

如果使用自行安装的全局 Rust，可省略这三个环境变量。

```sh
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run bundle
```

## 设计与验证

- [独立版设计](docs/specs/2026-11-13-standalone-design.md)
- [实施计划](docs/plans/2026-11-13-macos.md)
- [验证记录](docs/progress.md)
- [原图与生成说明](assets/prompts.md)

## 动作与任务录入

任务只需一段文本，可选截止日期，优先级直接点击「高／中／低」。已有标题与补充说明会合并显示，保存时保留全文。

面板底部点击「试试动作」，可分别预览待机、提醒、庆祝、休息，5秒后恢复；预览不会修改任务或发送通知。自然触发：完成任务庆祝4秒；提醒提交成功后进入提醒态10秒；配置的免打扰时段进入休息态。启用「减少动态效果」或系统减少动态效果时，以静态姿势为主。
