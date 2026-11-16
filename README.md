# Task Sprite

像素桌面任务伙伴，支持macOS与Windows。本地任务、提醒、工作时段计时和CSV导出免费使用；有效授权开启扩展装扮与微信小程序同步。

官网与下载：https://tbtparent.me/task-sprite/

## 功能

- 新增、编辑、开始、暂停、继续、完成、恢复和删除任务；同一工作区最多一项正在进行。
- 北京时间每天08:30–12:00、14:00–18:00累计有效活动时间（最多7.5小时），显示及统计到分钟，暂停和非工作时段不计；原活动历史完整保留。
- 四位免费伙伴；授权用户可使用赤狐、团子熊猫、薄荷幽灵、落日机器人、霜雪柴犬、奶油橘猫六位专属精灵，以及四款整体界面皮肤（角色与皮肤独立选择，任务、设置和桌宠气泡统一风格），具有待机、工作、休息、提醒、庆祝和互动动作。
- 同一授权码连接桌宠与小程序，任务变更自动同步、联网后自动重试；首次合并需主动确认，不需要日常手动同步。
- 通知、免打扰、减少动态效果、任务导出、托盘及浮动任务面板。

## 授权与数据

默认只在本机保存任务。授权码由运营方提供，当前没有官网支付或自动发码入口；每码默认3台电脑，小程序不占名额。暂停同步不释放授权名额，停用此电脑释放名额，两者均保留本地任务。离线有效授权可使用扩展装扮；授权到期/停用后展示免费外观，保留偏好以便续期恢复。

macOS任务数据库：`~/Library/Application Support/io.jojoshine.tasksprite/tasks.sqlite3`。Windows使用系统应用数据目录。完整备份需退出应用后备份应用数据目录；CSV用于查阅，不替代完整备份。升级保留任务、原安装身份及授权；删除任务无回收站。

macOS设备凭据由固定受保护组件保存在系统钥匙串，UI更新沿用原签名身份。Windows设备凭据由系统凭据管理器保存，不写入明文配置。公开的`release-bootstrap`只包含原组件及公开校验元数据，不含任何授权或私钥。

## 开发与验证

需要Node.js22.12+、Rust稳定版和对应平台的Tauri开发依赖。

```sh
npm ci
npm test
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run desktop
```

macOS签名构建使用`npm run bundle:local`连接本机Docker，`npm run bundle:production`连接正式服务。本机原有`.tooling/signing`保持私有且跨版本保留；不要删除或发布。Windows使用`npm run tauri -- build --bundles nsis`。macOS本机构建工具要求macOS15+，应用最低系统要求见Tauri配置。

## 发布

`.github/workflows/checks.yml`运行两平台测试、候选打包和安装/启动冒烟检查；版本标签`v*`或手动触发`release-candidates.yml`生成候选包与日志。macOS云端候选包使用公开固定凭据组件，最终安装包在本机沿用原受保护签名完成签名后才发布。Windows首次发布尚无商业代码签名，macOS现有本机签名不等于Apple公证。

OSS按`task-sprite/releases/<version>/`保存安装包和校验值，全部目标验证后更新`latest.json`；官网从该清单显示实际可用下载。发布/回退脚本位于官网仓库，密钥仅存私有环境文件。公开仓库不包含真实任务、QA截图、数据库、授权码、签名私钥或本机备份。
