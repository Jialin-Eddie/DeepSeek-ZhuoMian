# 开发问题记录（坑与经验）

> 记录「DeepSeek ZhuoMian（dsh-zhuomian）」桌面端在**前端 1:1 还原官方 UI** 和 **打包分发**过程中踩过的坑，供后续维护/接手参考。
> 项目结构：Electron 33 + React 18 + Vite 5；官方引擎 `@deepseek-ai/dsh`（内置）；后端端口 3099。

---

## A. 前端 1:1 还原官方 UI

### A1. 设计令牌手抄漂移（最核心，反复踩）
**现象**：视觉"一眼不像"官方，但说不出哪里不对。
**原因**：早期手动抄官方 CSS 变量时，值填错档/主题对调：

| 令牌 | 错误值 | 正确值 |
|---|---|---|
| 暗色 `label-secondary` | 亮色的 bluish-700 `rgb(97,102,107)` | bluish-300 `rgb(207,211,214)` |
| 暗色 `label-tertiary` | bluish-600（那是 caption） | bluish-400 `rgb(173,178,184)` |
| 暗色 `state-business-primary` | deepseek-500 | **deepseek-400** `rgb(103,158,254)`（暗色主色更亮） |
| 暗色 `state-error-primary` | red-500 | red-400 `rgb(242,90,90)` |
| 暗色 `state-success-primary` | green-400 | green-500 `rgb(34,197,94)` |
| 亮色 `border-l1/l2-thin/l3/l4` | .06/.06/.14/.18 | .04/.10/.12/.16 |
| 亮色 `bg-layer-1/2/3` | 60/75/100 | 纯白 |
| 亮色 `label-primary-bluish` | bluish-1000 | deepseek-900 深蓝 `rgb(14,48,116)` |

**解决/经验**：
- 不要"照着 CSS 文件抄"，要 `getComputedStyle(document.body).getPropertyValue()` 拿**运行时计算值**（令牌定义在 `body` 上，不是 `:root`，读 `documentElement` 会全空——见 A4）。
- 权威值已归档在 `explore-out/15-tokens-dark.json`、`16-tokens-light.json`（45 项 × 双主题）。

### A2. 结构缺失（会话视图缺一大块）
官方会话视图只有 **「对话 / 轨迹」两个标签**，且头部还有一堆组件，早期 mock 全漏了：
- 面包屑（会话层级）、代理预设 chip（`SVAs4q_label`）、子代理/任务计数触发（`h8S2Va_trigger` / `QsffPG_trigger`）、Session log 按钮（`nL4_yW`）
- **上下文小圆圈 ContextMeter**（`JObwrW`，28px 圆环按钮 + 用量面板）
- 消息流：748px 列、`turnStatus` 思考 shimmer、工具调用行 `callRow`、`加载更早`
- composer 上方 **goal dock**（`nLMEza` 目标进度条）
- 轨迹页：工具栏（搜索/折叠）+ 时间轴条 + 事件账本表格

**经验**：`TABS` 里 Goals/Subagents/Jobs/Workflow/Skills 不是标签，它们以头部计数触发/菜单/斜杠命令的形式出现。

### A3. 图标用 emoji、文案用英文
**现象**：🐋🔍➤✦ 这类 emoji 渲染风格和官方 SVG 完全两样；英文文案对不上官方中文。
**解决**：官方图标全部内联 SVG（从官方运行时 DOM 抓路径），生成到 `src/components/official-icons.generated.tsx` / `official-header-icons.generated.tsx`；文案全量中文（探索未至之境 / 预览版 / 描述你想要构建的内容…）。个别保留英文：`Session log`、模式菜单 `Read Only / Workspace Write / Full access`。

### A4. 令牌读错位置
**现象**：`getComputedStyle(document.documentElement).getPropertyValue('--dsw-alias-*')` 全返回空字符串。
**原因**：dsh 的 `--dsw-alias-*` 定义在 `body[data-ds-dark-theme]` / `body` 上，不在 `:root`；自定义属性虽然可继承，但读 `documentElement` 读到的是 html 元素自身的值。
**解决**：读 `document.body`。

### A5. SVG 提取越界/截断 → 生成坏 JSX
**现象**：build 报 `Syntax error "p"`，指向生成的 `.generated.tsx`。
**原因**：
- 用 `IndexOf('</svg>', 文本索引)` 找结束标签，但该文本在 svg **之前**，导致截到整段 DOM（把 hero 全吞进去）。
- `outerHTML.slice(0, 1200)` 限长把长路径图标（preset 图标 ~6KB）截断，留下未闭合标签。
**解决**：
- 从 `<svg` 起始位置开始 `IndexOf('</svg>')`（`IndexOf('</svg>', startIndex)`）。
- 抓取不限长（或给足 6000）。
- 生成后校验：`endsWith('</svg>')`、`node --check`、`npm run build`。

### A6. Electron 无头脚本传命令行参数会静默失败
**现象**：`npx electron scripts\xxx.cjs http://127.0.0.1:3099 ...` 无任何输出、exit 1，连模块顶部的 `log()` 都不执行；但**不带参数**就正常。
**原因**：本机环境下 electron + CLI 参数组合偶发静默退出（未深究底层）。
**解决/经验**：所有探索/验证脚本的 URL、输出目录改走**环境变量**（`EXPLORE_URL`、`EXPLORE_OUT`、`SHOT_URL`），不要依赖 argv。

---

## B. 打包分发（electron-builder）

### B1. esbuild 在沙箱下 spawn 报 EPERM
**现象**：`npm run build` 报 `spawn EPERM`，卡在 vite 加载配置。
**原因**：受限沙箱禁止进程通过管道创建子进程（esbuild 服务进程）。
**解决**：升级到 `danger-full-access` 权限再跑（本会话后期权限策略放开后不再出现）。

### B2. 项目路径含空格 → node-gyp 无法重建原生模块
**现象**：`@electron/rebuild` 报 `Attempting to build a module with a space in the path`，重建 node-pty 失败。
**原因**：路径 `...\其他文件\deepseek harness\dsh-zhuomian` 含空格，node-gyp/msbuild 不兼容。
**解决**：`"npmRebuild": false` 跳过原生重建。依据：node-pty 只在用到终端功能时才加载，dsh 启动不依赖它（已验证可正常 boot）。**代价**：打包版里 node-pty 的 ABI 与 Electron 不匹配，交互式终端功能不可用（bash 工具本身走 child_process，不受影响）。

### B3. 下载 Electron headers 网络中断
**现象**：`FetchError ... ECONNRESET`（www.electronjs.org）。
**原因**：网络抖动（配合 B2 一起出现）。
**解决**：B2 的 `npmRebuild:false` 直接绕过了 headers 下载。若确实需要重建，重试或设 `ELECTRON_MIRROR`。

### B4. winCodeSign 解压要建符号链接、需管理员权限
**现象**：`ERROR: Cannot create symbolic link ... 客户端没有所需的特权`（libcrypto.dylib / libssl.dylib）。
**原因**：electron-builder 解压 winCodeSign 工具包时保留 darwin 符号链接，Windows 建符号链接需要管理员/开发者模式。
**解决**：`"signAndEditExecutable": false`（win 配置）跳过 exe 签名与元数据编辑。我们本就不签名。**代价**：exe 资源里没有版本号/图标（productName 已烘焙进 asar 不受影响）。

### B5. 【最关键】dsh 需要 Node ≥22，Electron 33 内置 Node 只有 20.18
**现象**：内置 dsh 用 Electron 运行时跑，启动即崩：
```
SyntaxError: The requested module 'node:zlib' does not provide an export named 'createZstdDecompress'
SyntaxError: The requested module 'node:module' does not provide an export named 'stripTypeScriptTypes'
```
**原因**：`@deepseek-ai/dsh`（0.1.0-rc.6）用到 Node 22.15+ 的 zlib zstd 与 Node 22.6+ 的 TS 类型剥离 API；Electron 33 内置 Node 是 20.18。**用 Electron 运行时跑 dsh 这条路根本走不通**（即便 `ELECTRON_RUN_AS_NODE=1` 也一样，它只是把 exe 切成 Node 模式，Node 版本还是 20.18）。
**解决**：内置一个**真正的 Node 24 运行时**（`runtime/node.exe`，打包进 `resources/node.exe`），用它来跑内置的 dsh `bin.js`。系统 Node 24 已实测可正常启动 dsh。
**结论/约定**：`dsh` 引擎的最低 Node 要求是 **22.15+**（建议直接用 24）；桌面壳的 Electron 版本与 dsh 的 Node 版本解耦，**不要用 Electron 内置 Node 跑 dsh**。

### B6. 打包 exe 传 JS 路径时跑的是应用本身（会递归开窗）
**现象**：早期 `spawn(process.execPath, [bin.js, ...])`，打包后启动发现跑起来的是应用主进程而非 bin.js（端口没起、窗口异常）。
**原因**：打包后的 exe 已被烘焙成应用（默认加载 app.asar），传入 JS 路径不会把它当主脚本。
**解决**：改用 B5 的独立 `node.exe` 直接跑 bin.js，彻底绕开这个问题。`ELECTRON_RUN_AS_NODE=1` 是备选（但仍受 Node 版本限制）。

### B7. 未签名 / 未换图标（遗留）
- 未签名 → 对方运行弹 SmartScreen「更多信息 → 仍要运行」。配证书：`build.win.certificateFile`。
- 图标仍是 Electron 默认。加 `build/icon.ico`。

### B8. 【分发关键】NSIS 安装器在非 ASCII 路径下崩溃（0xC0000005）
**现象**：`DeepSeek ZhuoMian Setup 0.1.0.exe` 双击/静默（`/S`）运行即崩。Windows 事件日志：出错模块 `System.dll`（NSIS System 插件），异常 0xC0000005，偏移 0x1581。
**原因**：安装器文件放在含中文的路径（`...\其他文件\deepseek harness\release-v2\`）——NSIS System 插件处理非 ASCII 路径时访问违规（与 B2 的空格/node-gyp 同族：本机项目路径对工具链不友好）。
**解决**：把 Setup exe **拷到纯 ASCII 路径**（如 `C:\dsh-setup\`）再运行 → 安装成功（静默 `/S` 装到 `%LOCALAPPDATA%\Programs\DeepSeek ZhuoMian`）。
**分发影响**：给用户的安装包如果放在中文/特殊字符目录也会崩；教程/说明应提示"先拷到英文路径再安装"，或后续改 MSI。

---

## E. 提示词便签（Ctrl+S，2026-08 新增）

实现：`electron/main.ts`（拦截+流程）+ `electron/stashStore.ts`（存储）+ `electron/engineRpc.ts`（工作区解析）+ `electron/stashPage.ts`（页面注入脚本）+ `preload.ts`（浮层→主进程 IPC）。

- **拦截必须放主进程 `before-input-event`**：页面层 keydown 会被官方 UI/Chromium 的「保存网页」抢走；主进程 `preventDefault()` 后页面根本收不到 Ctrl+S。
- **当前工作区别读 DOM**：用引擎 RPC `POST /api/session.list`（envelope：`{type:'client-request',rpcId,method,params:{},payload:{}}`），取 `running:true` 且 `updatedAt` 最新的会话的 `cwd`。服务端状态，UI 版本升级不碎。
- **页面注入**：`webContents.executeJavaScript` 注入 toast/浮层（page world，不碰官方资产）；浮层内删除走 `contextBridge` 暴露的 `window.dshDesktop.stashDelete(id)`。
- **React 受控 textarea 写入**：直接 `el.value = v` 不生效，要用原生 setter（`Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set`）+ dispatch `input` 事件。官方 composer 已确认是 textarea（`dsh-client-ui-conversation` 渲染 `jsx("textarea")`）。
- **存储**：`~/.dsh/stash/<sanitizeKey(cwd)>.json`，同文去重置顶、上限 50 条、原子写（tmp+rename）。
- **沙箱限制**：本会话沙箱下 Electron 无法启动（named pipe 拒绝访问 `platform_channel.cc FATAL`），只能单测非 electron 模块（`scripts/stash-syntax-test.cjs` + node 直跑 stashStore/engineRpc）。UI 交互需真机验证。

---

## F. 功能落地与诚实边界（2026-08-17 午间批次）

五个功能按"能否在官方模式零侵入落地"分层处理：

### 已落地（官方模式，注入式/壳层，不碰引擎）
- **Ctrl+放大页面**：主进程 `before-input-event` 拦截 Ctrl+= / Ctrl+- / Ctrl+0 → `webContents.setZoomLevel`，toast 显示百分比。
- **右边的 prompt 轨道**：注入 `RAIL_SCRIPT`，选择器 `div[data-chat-flow-kind="user"]`（官方自带类型标记，含 `user / assistant-step / tool-call / context / turn-tail`），悬停预览（`.gdEzaW_bubble` 文本）、点击 `scrollIntoView`；MutationObserver + 签名比对（flow key 首尾）防抖重建，避免打字触发重建风暴。
- **/btw 旁注**：注入 `BTW_SCRIPT`，window capture 拦截 composer 里 `/btw xxx` + Enter → `window.dshDesktop.btwNote()` → 存 `~/.dsh/stash/btw-<workspace>.json` + toast「已记录旁注（未发送给模型）」，输入框清空；不占模型轮次。（v0.1.1 修复了"用不了"，详见 G 节。）

### 官方模式做不了（如实标注，不造假）
- **/rewind 的"删除式回退"（官方）**：引擎 `dsh-session-checkpoint-policy` 是**防崩溃的自动落盘机制**（模型请求前/工具副作用前 checkpoint，fail-closed），**没有用户级恢复/回滚 API**；`session.fork` 只能分支。"删掉后面的消息、在原会话继续"做不了 —— 官方 UI 的"分叉"也是同样语义。v0.1.1 起 /rewind 用 fork 实现**分叉式回退**（见 G 节），mock 界面保留演示版回退（撤销最后一轮）。
- **auto mode（官方）**：权限预设是**配置驱动**（`dsh-base/cordis.patch.yml` 里 `presets: { read-only: {sandbox, approval}, workspace-write: {...}, danger-full-access: {sandbox, approval: never} }`），审批只有 `ask / never` 两个值，**没有 per-tool 自动批准**。"自动接受编辑、命令仍询问"在配置层表达不了，需引擎审批策略（`dsh-user-approval` answerer）级开发 → 后置。**不伪造"自动"选项**（把 workspace-write+never 包装成 auto 等于关掉所有询问，危险）。

### 工程记录
- 官方消息流选择器（探针 `scripts/probe-flow.cjs` + `shot-dom.html` 实测）：`div[data-chat-flow-kind="..."]`、工具行 `div[data-tool]`、用户气泡 `.gdEzaW_userRow .gdEzaW_bubble`。
- 探针脚本与 DOM 快照（`shot-*`、`probe*.json`）不入库（.gitignore）。

---

## G. v0.1.1 批次（2026-08-17 下午）：/btw 修复 + 存后清空 + /rewind + /checkpoint + 轨道加长 + 单实例锁

### /btw 为什么 v0.1.0 里"用不了"（已修）
- 旧 `BTW_SCRIPT` 用 `document.querySelector('textarea')` 取 DOM **第一个** textarea —— 官方 UI 的 composer 不保证排第一（其他插件可能有 textarea），`activeElement` 一不匹配拦截就永不触发。Ctrl+S 正常是因为 `READ_SCRIPT` 直接读 `document.activeElement`。
- 中文输入法两个坑：全角斜杠 `／btw`（`startsWith('/btw')` 失败）；IME 组合中第一次 Enter（`isComposing=true`）被跳过（官方 UI 同样跳过），要按第二次。
- 空内容 `/btw`：静默清空输入框、零反馈 → 用户以为"用不了"。
- 修复：composer 定位改 `textarea[data-phase]` → 最大可见 textarea → activeElement；监听改 `window` capture（传播路径最前，先于 React 根容器）；正则兼容全角斜杠；空内容弹本地提示；`window.dshDesktop` 缺失时本地提示；新增 `diag:log` IPC（`[page] btw: ...` 进 `~/.dsh/stash/diag.log`），以后每次 Enter 的匹配结果都有记录，不再盲猜。

### Ctrl+S 存后清空输入框
- 新 `CLEAR_SCRIPT`（stashPage.ts）：原生 value setter 置空 + dispatch `input`（React 受控组件才更新）+ 保持焦点；保存成功（含同句去重置顶）后执行，toast 改「已保存到提示词便签（输入已清空）」。

### /rewind + /checkpoint（官方模式，真实 API）
- 引擎 API 面（`dsh-client-connection/lib/client.js` 实测）：`session.list / history / prompt / fork / ...` 共 13 个方法，**无** rewind/restore；`session.fork {sessionId, atSeq?}` → `result.value.sessionId`。
- fork 服务端语义（`dsh-host-apiproxy` 源码）：`atSeq` 定位「seq >= atSeq 的第一个 `turn/end`」，在其后下一个 `turn/start` 处截断 → atSeq 所在轮完整保留、分支从其后开始。给 `user/message` 的 seq 即"回退到该轮之后"。
- 官方 UI 自带"分叉"（侧栏 ⋯ → fork）：`ctx.sessions.fork({sessionId, increaseTitle:true}).then(childId => ctx.sessions.open(childId))` —— fork 后自动切新分支；UI 版固定在"最后完成轮"，/rewind 是它的**任意点版本**。
- `REWIND_SCRIPT`（页面注入）：`/rewind` → 浮层（检查点 + 提示词列表，↑↓ Enter Esc，× 删检查点）→ 页面内同源 fetch `/api/session.fork` → 成功后 MutationObserver 监听侧栏树新增 `[role="treeitem"]` 并点击切换（fork 恰好新增一行；跳过 `aria-selected="true"` 的当前行）；3 秒没等到 → 兜底 toast 去左侧列表点开。`/rewind N` 直接回退第 N 条。`/checkpoint 名字` → 主进程 `historyTail`（最后事件 seq + 最后一条用户提示词做预览）→ 存 `~/.dsh/checkpoints/<ws>.json`（上限 50、同名去重置顶）。
- 失败模式：选中"当前未完成轮" → 引擎 `fork-unavailable`（toast 原样显示）；无历史 → 提示「没有可回退的提示词或检查点」。

### 轨道加长
- 线高 4→7px、间距 5→7px、容器 `maxHeight: 78vh` + `overflowY: auto`（多轮自适应滚动）；悬停预览/点击跳转/签名防抖刷新不变。

### 单实例锁
- `app.requestSingleInstanceLock()`：拿不到锁直接 `app.quit()`；`second-instance` → 还原+聚焦已有窗口。根治"便携/安装版同时开 → 抢 3099 → 黑屏"。

### 测试门禁（v0.1.1 起强制，回应"写代码没测试就上线"的教训）
- 教训：v0.1.0 只有安全门禁 + 语法解析测试，**没有行为测试** → /btw 带病上线；v0.1.1 换包流程连翻三次（任务随引擎被杀 / 计划任务中文路径解码错 / 分页覆盖 lastSeq），都是"没先测就交付"的代价。
- 新增 `npm run test`（`scripts/run-tests.cjs`）：① 语法（stash-syntax-test）→ ② 单元（unit-tests：stashStore/checkpointStore 全路径 + engineRpc 在线时）→ ③ 端到端探针（probe-v011：连真实官方 UI 注入脚本、模拟按键断言 /btw /rewind /clear /rail /checkpoint；fork 用 fetch 桩拦截无副作用）。任一失败退出码非 0。
- pre-push 钩子 = security + test 双门禁；引擎不在线时端到端 WARN 跳过（单元/语法必须过），发版前必须引擎在线跑全量。
- 探针捕获到的真 bug：historyTail 分页时 lastSeq 被后续更旧页覆盖（应只在第一页取最新；上一版"取页内最旧"也是同因）。已修并纳入断言（lastSeq 需为会话最新事件序号）。

### 工程记录
- 官方 composer 的 textarea 带 `data-phase` 属性（`dsh-client-ui-conversation`：`<textarea ... data-phase={input?.phase ?? "inert"} ...>`）；React 事件挂在根容器（bubble 阶段），window capture 先于它。
- `session.history` 事件类型实测：`user/message`（data 为 `{type:"text",text}` 或数组）、`turn/start`、`turn/end`、`assistant/chunk`、`assistant/message`、`tool/call`；分页用 `beforeSeq`（更早）+ `maxMessages`，有 `hasMore`。
- `session.list` 响应字段是 `result.value.items[]`（**不是** `.sessions`）；活动会话 = `running:true` 优先、否则 `updatedAt` 最大；`resolveActiveWorkspace` v0.1.1 重构为复用 `resolveActiveSession`。
- `checkpoint:list` 返回整个工作区的检查点，页面按 `sessionId` 过滤当前会话。
- 构建测试：`npm run build:electron` + `node scripts/stash-syntax-test.cjs`（新脚本 CLEAR/REWIND 已入清单）。

---

## C. 环境 / 工具

### C1. 并发开发流程互相杀 electron 进程
**现象**：后台任务 `npm start` 反复 `exit code 1`、无任何报错，排查半天不是代码 bug。
**原因**：同一项目有另一条开发线（`npm run dev`）在重启时执行 `Get-Process electron | Stop-Process -Force`，把**所有** electron 实例（包括本会话拉起的官方模式窗口）一起强杀；强杀即 exit 1。
**经验**：多实例/多流程并行开发时，别用全局 `Stop-Process electron`；要区分进程用窗口标题/端口/PID。数据都在 `~/.dsh`，杀进程不丢数据。

### C2. pwsh 的 `workdir` 间歇性不生效
**现象**：命令落到**父目录**（`deepseek harness`）而非 `dsh-zhuomian`，导致 `Test-Path` 误判、文件找不到。
**解决/经验**：涉及文件操作一律用**绝对路径**，不依赖 workdir/相对路径。

### C3. 判定文件/目录存在误判
**现象**：一度误以为 `node-pty` 不存在、`@deepseek-ai/dsh` 被删（其实都在）。
**原因**：C2 的 workdir 失效 + 深递归 `Get-ChildItem -Recurse` 在 800MB node_modules 上超时。
**经验**：用绝对路径 + 限深度（`-Depth`）查询；深目录递归要设足够 timeout。

---

## D. 关键结论与约定（速查）

- **dsh 引擎要求 Node ≥22.15**（建议 24），与 Electron 内置 Node 解耦。
- 打包必须：`extraResources` 带 `runtime/node.exe` + `asarUnpack` 内置 `@deepseek-ai/dsh`；`npmRebuild:false`；`signAndEditExecutable:false`（无证书时）。
- 后端端口固定 **3099**（避开官方 3080）；数据/会话/API Key 都在 **`~/.dsh`**（跨实例共享、重启不丢）。
- 双模式：默认官方 UI（`loadURL http://127.0.0.1:3099`），`UI_MODE=mock` 切自绘界面；`npm run dev` 是 mock + HMR。
- 打包前：`node scripts/fetch-node.cjs`（准备 runtime/node.exe，被 .gitignore 排除）→ `npm run dist`。
- 产物：`release/DeepSeek ZhuoMian Setup <ver>.exe`（安装器）、`release/...-win.zip`（便携版）。
- 探索/验证脚本的 URL/输出走环境变量，别走 argv（见 A6）。
