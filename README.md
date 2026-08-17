# DeepSeek ZhuoMian（DSH 桌面）

> 🐋 Unofficial · 非官方项目 ｜ 基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（MIT）的 Windows 桌面客户端
>
> 目标：**双击即用，不用打开终端，不用复制粘贴链接**。

## 功能（第一批 MVP）

- 流式对话 + 工具调用卡片 + Diff 高亮（规划中接入真实引擎）
- 权限五档：**只读 / 工作区写 / 全权限 / 自动 / 计划**（前三个为 DSH 沙箱等级）
- 会话列表 + 时间轴导航（悬停预览 prompt，点击跳转）
- B4 界面：**终端风 ⇄ 聊天风** 一键切换
- 本地引擎：自动拉起 DeepSeek Harness 后端（`dsh web`）
- **Ctrl+S 提示词便签**：输入框有字 = 存入当前工作区便签；空 = 弹出列表恢复（↑↓ Enter 插入 / × 删除）；按工作区分文件，存于 `~/.dsh/stash/`

## UI 还原（对照官方 DeepSeek Harness Web）

设计令牌从官方运行时 CSS 逐字提取（`harness-assets/` + `explore-out/`），修复了早期手抄版本的关键错误：

- **暗色次要文字**：`label-secondary` 应为 bluish-300 `rgb(207,211,214)`（原来误用亮色的 700）
- **主色深浅倒置**：暗色 `business-primary` / 发送按钮填充为 deepseek-400（`rgb(103,158,254)`），hover 为 500；亮色相反（原实现两主题对调）
- **三/四级文字互换**：暗色 `label-tertiary` = bluish-400 `rgb(173,178,184)`、`caption` = bluish-600（原来对调）；状态色 error=red-400、success=green-500
- **亮色边框/层级修正**：border-l1/l2/l2-thin/l3/l4 = .04/.10/.10/.12/.16，bg-layer-1/2/3 全白，hover-danger = rgba(236,19,19,.05)
- **字体栈**：补充 `PingFang SC` / `Hiragino Sans GB` / `Helvetica Neue` 等官方字体
- **会话视图结构（P0）**：官方只有「对话 / 轨迹」两个标签；头部 = 面包屑 + 代理预设 chip + 子代理/后台任务计数触发器 + Session log 按钮；消息流 = 748px 列 + 思考中 shimmer + 工具调用行（圆角 6）+ 加载更早；composer 上方 goal dock 目标进度条
- **文案**：与官方一致的中文（探索未至之境 / 预览版 / 描述你想要构建的内容 / 新会话 …）

验证：`scripts/verify-ui.cjs`、`scripts/verify-p0.cjs`（Electron 加载页面导出文本与计算样式，对照官方实测值）。探索过程资产与结论见 `EXPLORE-REPORT.md`。

## 开发

```bash
npm install
npm run dev        # 开发模式（Vite + Electron，加载 mock UI 便于热更新）
npm run build      # 构建
npm run dist       # 打包 Windows 安装包（NSIS + zip）
```

## 打包分发

```bash
node scripts/fetch-node.cjs   # 准备 runtime/node.exe（Node 22+，dsh 需要；首次打包前运行一次）
npm run dist                  # 生成 release/ 下的 NSIS 安装器 + 便携 zip
```

- 产物：`release/DeepSeek ZhuoMian Setup <ver>.exe`（安装器）、`release/DeepSeek ZhuoMian-<ver>-win.zip`（便携版）
- 应用内置 Node 运行时 + 完整 dsh 引擎，**对方无需安装 Node、无需联网下载**即可使用
- 未签名（SmartScreen 会提示"更多信息→仍要运行"）；需要消除提示请配代码签名证书（`win.certificateFile`）

## 双模式（D1 启动器）

应用内置官方 DeepSeek Harness Web UI 作为默认界面（1:1、填 API Key 即可真实使用），自绘 mock 作为备选：

| 模式 | 启动方式 | 界面 |
|---|---|---|
| **官方（默认）** | `npm start` | Electron 自动拉起/连接 `dsh web`（端口 3099）并加载官方 UI；首次使用在官方弹窗里填 API Key，配置写入 `~/.dsh`（与浏览器端共享） |
| **mock** | PowerShell：`$env:UI_MODE="mock"; npm start` | 自绘还原界面（探索/换肤用），不接后端 |
| **开发** | `npm run dev` | mock + Vite 热更新 |

> 官方模式数据目录：`~/.dsh`（sessions / storages / settings.yaml / profiles），多实例共享、重启不丢。

## 许可

[MIT](./LICENSE) — 可自由下载、修改、再分发，仅需保留版权声明。
