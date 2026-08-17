# DeepSeek ZhuoMian（DSH 桌面）

> 🐋 Unofficial · 非官方项目 ｜ 基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（MIT）的 Windows 桌面客户端
>
> 目标：**双击即用，不用打开终端，不用复制粘贴链接**。
>
> 仓库：<https://github.com/Jialin-Eddie/DeepSeek-ZhuoMian>（public，自动更新源）

## 功能（第一批 MVP）

- 流式对话 + 工具调用卡片 + Diff 高亮（规划中接入真实引擎）
- 权限五档：**只读 / 工作区写 / 全权限 / 自动 / 计划**（前三个为 DSH 沙箱等级）
- 会话列表 + 时间轴导航（悬停预览 prompt，点击跳转）
- B4 界面：**终端风 ⇄ 聊天风** 一键切换
- 本地引擎：自动拉起 DeepSeek Harness 后端（`dsh web`）
- **Ctrl+S 提示词便签**：输入框有字 = 存入当前工作区便签并**清空输入框**；空 = 弹出列表恢复（↑↓ Enter 插入 / × 删除）；按工作区分文件，存于 `~/.dsh/stash/`
- **Ctrl + 放大页面**：`Ctrl+= / Ctrl+- / Ctrl+0` 缩放并提示百分比
- **右边的 prompt 轨道**：对话右侧竖条，每条横线 = 一条用户提示词，悬停预览、点击跳转；轮数多时自动加高并滚动（官方模式注入式实现）
- **/btw 旁注**：composer 输入 `/btw 内容` + Enter → 存本机旁注（`~/.dsh/stash/btw-*.json`），不发给模型、不打断任务；兼容全角斜杠 `／btw`
- **/checkpoint + /rewind 回退**：`/checkpoint 名字` 记录当前进度（`~/.dsh/checkpoints/`）；`/rewind` 弹出提示词列表，选中后从该轮**开新分支**继续（引擎 `session.fork atSeq` 真实实现，原会话保留）；支持 `/rewind 3` 直接回退到第 3 条
- **自动更新**：electron-updater + GitHub Releases（仅安装版生效；便携版/开发模式自动跳过）

### v0.1.2 新功能

- **↑ 历史提示词（功能1）**：输入框为空时按 `↑` 弹出本对话历史提示词（引擎真实历史，分页拉取），`↑↓` 选择、`Enter` 回填、`Esc` 关闭；输入框有内容时 `↑` 仍为正常光标移动
- **右侧参照对话分栏（功能2）**：左侧会话行悬停出现「参照」按钮，点击在右侧打开该对话（类似 split），可滚动阅读问/答；每条消息可「☆ 收藏」句子（存 `~/.dsh/reference/`，跨会话保留）；底部「复制全部收藏」一键复制；`✕` 关闭
- **会话停留位置（功能3）**：模型响应结束后，画面自动滚动让**本次提示词停在屏幕中间**（从这里开始阅读）；切换回会话时同理；用户主动滚动时 1.5s 内不抢
- **右下角通知（功能4）**：每轮响应完成在右下角弹提醒（含提示词摘要+时间），**点击跳转到该提示词**，约 3 秒自动消失，多条可堆叠（最多 5 条）
- **全量 prompt 轨道（功能5）**：右侧轨道从**引擎 API 分页拉取该对话全部提示词节点**（不再受官方「加载更早」增量加载限制），悬停预览、点击跳转（未加载部分自动点「加载更早」补齐）

> 边界说明（详见 BUGS.md F 节）：`/rewind` 的语义是**分叉**（引擎没有"删除后续消息"的 API，官方"分叉"即正道）；`auto mode` 需要引擎级开发（审批无 per-tool 自动批准），不提供伪造版本；mock 界面含演示实现。

## 质量门禁（每次 push 前强制，两道）

```bash
npm run security    # ① 安全检查：密钥/边界/个人信息（scripts/security-check.cjs）
npm run test        # ② 功能测试：语法 + 单元 + 端到端探针（scripts/run-tests.cjs）
```

- 已安装 git pre-push 钩子：`git push` 自动先跑**安全检查 + 功能测试**，任一不过关自动中止（紧急跳过：`SKIP_SECURITY_CHECK=1 git push`，危险，慎用）
- 功能测试组成：
  - 语法检查：所有注入页面脚本（READ/CLEAR/CLOSE/TOAST/RAIL/BTW/REWIND/OVERLAY + v0.1.2 的 SCROLL/HISTORY/NOTIFY/RAIL_ALL/REFERENCE）能通过 JS 解析
  - 单元测试：便签/检查点/参照收藏存储（增删去重上限）+ 引擎 RPC（`listSessions`/`resolveActiveWorkspace`/`historyTail`，引擎在线时）
  - 端到端探针（需引擎 3099 在线，否则 WARN 跳过）：
    - `probe-v011`：/btw（含全角斜杠/空内容）、Ctrl+S 清空、/rewind 浮层与 fork 请求构造、/checkpoint、prompt 轨道尺寸
    - `probe-v012-scroll`：功能3 响应结束滚动定位（turn-tail 信号 → 提示词居中）+ 防打扰
    - `probe-v012-history`：功能1 ↑ 历史提示词（浮层/回填/选择/关闭/不干扰光标）
    - `probe-v012-notify`：功能4 右下角通知（弹出/堆叠/点击跳转/3s 消失）
    - `probe-v012-railall`：功能5 全量节点轨道（节点数 > DOM 已渲染数 + 跳转）
    - `probe-v012-reference`：功能2 参照分栏（按钮注入/面板/收藏/复制/关闭）
  - fork 用 fetch 桩拦截，无副作用
- 检查项与依据见 [SECURITY_CHECKLIST.md](./SECURITY_CHECKLIST.md)
- 新克隆仓库后先执行 `node scripts/install-git-hooks.cjs` 重装钩子
- **约定：任何关键功能改动，必须 `npm run test` 全绿（含引擎在线时的端到端探针）才允许打新版本/发版**

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
