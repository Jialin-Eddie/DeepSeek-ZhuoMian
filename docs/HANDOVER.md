# DeepSeek ZhuoMian 开发交接文档（HANDOVER）

> 给下一个接手的人 / 未来的自己。目标：读完这份文档 + README + BUGS.md，就能安全地改代码、测、发版、更新用户正在用的版本。
> 最近更新：v0.1.3 批次（斜杠菜单 / 命令反馈 / ↑ 自动填充 / 浅色轨道）。

---

## 1. 项目是什么

- **DeepSeek ZhuoMian（DSH 桌面）**：非官方 Electron 桌面客户端，把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（MIT）打包成 Windows 双击即用，不用开终端。
- 仓库（**注意拼写，有 h**）：`Jialin-Eddie/DeepSeek-ZhuoMian`（public，自动更新源）。
- 用户：**非技术背景**。所有沟通用中文、直接、可执行；信任敏感——之前多次更新失败，所以**一切交付必须先测试、先征得同意再动他正在用的版本**。

## 2. 架构总览

```
electron/main.ts          主进程：启动引擎(dsh web, 端口3099) → 加载官方UI → 注入功能脚本
electron/preload.ts       contextBridge 桥：dshDesktop.*（btwNote/checkpointSave/reference*/diagLog…）
electron/featuresPage.ts  注入脚本源码：RAIL_SCRIPT / BTW_SCRIPT / REWIND_SCRIPT / SLASH_MENU_SCRIPT
electron/featuresV012.ts  注入脚本源码：SCROLL / HISTORY / NOTIFY / RAIL_ALL / REFERENCE
electron/*Store.ts        本机存储：stash（便签）/ checkpoint / reference，都在 ~/.dsh/ 下按工作区分文件
electron/engineRpc.ts     引擎 RPC 封装（session.list / session.history / session.fork…）
scripts/probe-*.cjs       端到端探针（真实官方 UI DOM 上验证注入脚本）
scripts/run-tests.cjs     测试门禁入口（npm run test）
scripts/security-check.cjs 安全门禁（npm run security）
release/                  打包产物（electron-builder 输出）
release-v2/win-unpacked   用户正在用的便携版副本（永远从这里启动，见 §7）
```

- **双模式**：官方模式（默认，加载 `http://127.0.0.1:3099/` 官方 UI，注入脚本增强）与 mock 模式（`UI_MODE=mock`，自绘 UI，仅演示）。
- **引擎**：`resources/node.exe`（Node 24）spawn 运行 dsh；Electron 自带的 Node 20 太旧，不能直接用。
- **注入机制**：`did-finish-load` 后用 `webContents.executeJavaScript(script, true)` 把脚本注入官方页面（page world）。脚本幂等（`window.__dshXxxInstalled` 守卫）。
- **注入顺序（重要）**：SLASH_MENU_SCRIPT 必须先于 BTW/REWIND_SCRIPT 注入——斜杠菜单的 Enter 处理要在命令执行之前跑。

## 3. 功能清单与实现位置

| 功能 | 脚本/文件 | 交互 | 探针 |
|---|---|---|---|
| Ctrl+S 提示词便签 | main.ts + stashPage.ts | 有字=存并清空；空=弹列表恢复 | probe-v011 |
| 页面缩放 Ctrl+=/-/0 | main.ts | — | — |
| prompt 轨道（旧，随加载） | RAIL_SCRIPT | 右侧竖条节点 | probe-v011 |
| /btw 旁注 | BTW_SCRIPT → `~/.dsh/stash/btw-*.json` | `/btw 内容` + Enter；**成功后浅色 toast「旁注已保存」** | probe-v011 / probe-v012-slash |
| /checkpoint 检查点 | REWIND_SCRIPT → `~/.dsh/checkpoints/` | `/checkpoint 名字` + Enter；**成功后 toast** | probe-v011 / probe-v012-slash |
| /rewind 回退 | REWIND_SCRIPT → `session.fork {sessionId, atSeq}` | `/rewind` 弹**浅色**选择框（检查点★+提示词）；`/rewind 3` 直达第 3 条 | probe-v011 / probe-v012-slash |
| **斜杠菜单（v0.1.3）** | SLASH_MENU_SCRIPT | 输入 `/` 弹浅色命令菜单，↑↓ 选择、Enter/Tab/点击填入；完整命令+Enter 直接执行 | probe-v012-slash |
| ↑ 历史自动填充（v0.1.3 重写） | HISTORY_SCRIPT | 空框按 ↑ 填最近一条；未修改再按 ↑ 填更早一条；↓ 往回；最新一条再 ↓ 清空；自己打字时不打扰 | probe-v012-history |
| 右侧参照分栏（功能2） | REFERENCE_SCRIPT → `~/.dsh/reference/` | 会话行悬停「参照」→ 右侧分栏；☆ 收藏；底部复制全部 | probe-v012-reference |
| 滚动定位（功能3） | SCROLL_SCRIPT | turn-tail 信号 → 本次提示词滚到屏幕中间；用户滚动 1.5s 内不抢 | probe-v012-scroll |
| 右下角通知（功能4） | NOTIFY_SCRIPT | 每轮完成弹气泡，点击跳转，3s 消失，堆叠≤5 | probe-v012-notify |
| 全量 prompt 轨道（功能5） | RAIL_ALL_SCRIPT | 分页拉全部提示词节点，**浅色底 + 长条节点**（v0.1.3 样式） | probe-v012-railall |

所有脚本都带 `window.__dshXxxDiag` 诊断对象和 `xxx: installed` 自检日志（写进 `~/.dsh/stash/diag.log`）——用户说"功能没了"时先看 diag.log，不要猜。

## 4. 引擎 RPC 关键点（踩过的坑）

- 请求信封：`POST /api/<method>`，body `{type:'client-request', rpcId, method, params:{}, payload:{}}`，响应取 `result.value`。
- `session.history {sessionId, beforeSeq?, maxMessages?}`：`maxMessages` 数的是**消息数**；事件按 seq 升序；`hasMore` 时用最早事件 seq 继续翻页。
- **user 消息两种格式**：老格式 `{type:'text',text}` 或数组；新格式 `{content:[{type:'text',text}],source:{kind:'user'}}`。`extractText` 必须两种都处理；`source.kind !== 'user'` 是系统注入（如 AGENTS.md 提醒），**必须过滤**。
- `session.fork {sessionId, atSeq}` → `result.value.sessionId`；语义是**分叉**（引擎没有"删除后续消息"）。
- **多窗口时 `session.list` 的"活动会话"启发式不可靠**（running:true 优先，否则 max updatedAt）——换包后/多窗口时 checkpoint、↑ 历史可能打到别的会话。已知问题，见 BUGS.md。

## 5. 开发纪律（~/.dsh/AGENTS.md 全量规则，每会话自动加载）

- 诚实第一；复杂指令先复述确认；简单指令直接做。
- **写代码必须带测试**：关键功能（命令、注入脚本、IPC、存储、打包）先写/同步更新测试；e2e 用探针实测，不许"看着对"。
- **门禁不过 = 不声称完成、不提交、不发布**。
- push/发布前过 `npm run security`；测试门禁全绿（含引擎在线 e2e）才允许打新版本。
- 翻车必须复盘进 BUGS.md。
- **破坏性操作（关窗、重启、换包、删数据）先测试通过 + 征得用户明确同意。**

## 6. 测试与发版流水线

```bash
npm run test        # ① 自动编译 tsc → ② 注入脚本语法 → ③ 单元测试 → ④ 引擎在线时 7 个 e2e 探针
npm run security    # 密钥/边界/个人信息检查
npm run dist        # 打包：release/DeepSeek ZhuoMian Setup <ver>.exe + win.zip
```

- pre-push 钩子已装：`git push` 自动先跑 security + test，任一不过就中止（约 10–15 分钟）。
- 探针需要**引擎 3099 在线**（用户 App 开着就行）；不在线会 WARN 跳过 e2e，此时不算全量通过。
- 探针窗口 `show:false`，**hidden 窗口不跑 rAF**：注入脚本里滚动必须用即时 `scrollTop=`，不能用 `scrollTo({behavior:'smooth'})`，否则测不出来。
- **tsc 坑**：必须 `node node_modules/typescript/bin/tsc -p tsconfig.electron.json`（用 npx 且不设 workdir 会捡到错误的 tsc@2.0.4）。
- 发 GitHub Release（electron-updater 需要）：上传 Setup exe + win.zip + **latest.yml**（漏传 latest.yml → 安装版自动更新报 404，v0.1.2 就漏了，v0.1.3 修复）。

## 7. 更新"用户正在用的版本"（换包 SOP）

用户从 `release-v2\win-unpacked` 的便携版启动（桌面快捷方式「DeepSeek ZhuoMian (新版)」）。换包 = 关他一次窗口，**必须先征得同意**。

**为什么不能直接杀进程换包**（v0.1.2 换包失败复盘，三层根因）：
1. 杀掉 App 会连带杀掉引擎（window-all-closed → backend.kill()），而我是从引擎里跑的 agent 后台任务 → 任务把自己杀了，换包做到一半就死。
2. Windows 定时任务里的 PowerShell 5.1 **会把 UTF-8 无 BOM 的中文路径（`其他文件`）解码成乱码** → Test-Path 失败、脚本静默跳过。
3. 任务建好但用户没点同意也会失败。

**正确 SOP**（已验证成功）：
1. 先 `npm run dist`，确认 `release\win-unpacked\resources\app.asar` 里有新代码（用 §9 的 asar 检查脚本）。
2. 写换包脚本（**UTF-8 带 BOM**）`dsh-swap-<ver>.ps1`：
   ```powershell
   Start-Sleep -Seconds 6                     # 等父进程把话说完
   Stop-Process -Name 'DeepSeek ZhuoMian' -Force
   Move-Item <release-v2\win-unpacked> <...win-unpacked.old> -Force   # 先备份
   Copy-Item <release\win-unpacked> <release-v2\win-unpacked> -Recurse -Force
   Start-Process '<release-v2\win-unpacked\DeepSeek ZhuoMian.exe>'
   ```
3. `schtasks /Create /TN DSH-Swap<ver> /TR "powershell -ExecutionPolicy Bypass -File <脚本>" /SC ONCE /ST 23:59 /F`（路径引号用反引号转义）。
4. 用户同意后 `schtasks /Run /TN DSH-Swap<ver>`，任务**脱离父进程**运行，杀掉 App 不影响换包本身。
5. 换完验证：`Get-Process 'DeepSeek ZhuoMian'` 的 Path 指向 release-v2；diag.log 出现新版本的自检日志（如 `slash: installed`）；**让用户确认**后才删 `.old` 备份。
6. 别忘了清理旧的 `release-v3`、`release-v2\win-unpacked.new` 等残留目录。

## 8. v0.1.3 批次的背景（为什么做这些）

- 用户抱怨"没有 /rewind /checkpoint /btw 命令"——**代码其实一直在**（v0.1.1 就有），问题是：界面上没有任何入口（看不见）、/btw 和 /checkpoint 成功后无任何提示（以为没生效）、/rewind 选择框是黑底（用户讨厌黑底）。→ 斜杠菜单 + 成功 toast + 全部浅色化。
- 用户要的 ↑ 是**自动填充**（按一次填一条，再按填更早一条），不是选择列表。→ HISTORY_SCRIPT 重写为终端式；**只有空框时才开始**，填完后没改过才能继续 ↑，改了字就不打扰（用户确认过的口径）。
- 右侧 prompt 轨道要"浅色背景 + 长条节点"→ RAIL_ALL_SCRIPT 样式（源码早已改好，v0.1.3 才真正打包给用户）。

## 9. 排查速查

| 想看什么 | 怎么查 |
|---|---|
| 主进程/页面脚本日志 | `~/.dsh/stash/diag.log`（tail 即可；含 Ctrl+S、注入失败、命令触发、installed 自检） |
| 用户 App 版本/代码 | asar 检查：`runtime\node.exe` + `node_modules\@electron\asar`，`extractFile(p,'dist-electron/featuresPage.js')` 搜 `__dshBtwInstalled`、`dsh-slash-menu` 等标记 |
| 运行中的进程 | `Get-Process 'DeepSeek ZhuoMian' \| Select Path`（应全部指向 release-v2） |
| 引擎会话/历史 | `/api/session.list`、`/api/session.history`（信封见 §4） |
| 官方 UI 结构 | `div[data-conversation-scroll]` 滚动容器、`div[data-chat-flow-kind="user"|"turn-tail"]`、`textarea[data-phase]` 输入框、`YDXeBa_sessionRow` 会话行 |

**历史怪事**：package.json 曾在工作区凭空消失（git 显示 D），已 `git checkout -- package.json` 恢复——如果构建突然报找不到 package.json，先查 git status。

## 10. 下一步候选（未做，仅记录）

- auto mode 的 per-tool 自动批准（需引擎级 hooks 插件）。
- `~/.dsh/AGENTS.md` 的设置页入口（目前只能手改文件）。
- 多窗口活动会话定位：给 checkpoint / ↑ 历史 / 滚动定位加显式会话绑定，摆脱 `session.list` 启发式。
- 代码签名证书（去掉 SmartScreen 警告）。
