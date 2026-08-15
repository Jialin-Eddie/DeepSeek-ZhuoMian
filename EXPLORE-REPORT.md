# DSH 官方 UI 探索报告（桌面端 1:1 还原）

> 探索对象：官方 DeepSeek Harness Web UI（rev `dcccb8324e44`，端口 3080/3099 同版本）
> 探索方式：Electron 无头窗口加载官方 UI，依次进入 11+ 个状态，抓取结构大纲 / 计算样式 / 运行时 CSS
> 原始资产：`explore-out/`（11 个状态快照 + `session-styles.html` 72 个官方 `<style>` 共 202KB + 双主题 45 项令牌 JSON）、`harness-assets/`（首页抓包）

---

## 0. 一句话结论

上一轮按 CSS 文件手抄的令牌**有两处系统性偏差**（三/四级文字互换、状态色取错档），并缺**整个会话视图**（官方只有「对话 / 轨迹」两个标签 + 头部计数触发器 + 消息流 + goal dock）。官方 UI 结构比 mock 多约 40% 的组件。**想要零漂移，D1 启动器（Electron 直接加载官方 UI）完全可行**——数据、会话、主题全部落在 `~/.dsh`，跨实例共享，官方自带 onboarding 弹窗。

---

## 1. 官方架构总览

- 纯前端 SPA，由 30+ 客户端插件（`dsh-client-ui-*`）组合，CSS 全部为 CSS Modules（哈希类名 `Md3f7G_root` 等），**运行时以 `<style data-plugin=...>` 注入**。
- 布局：`.pI_x6G_frame` CSS Grid `280px minmax(0,1fr) auto`（可拖拽手柄调宽，`data-details-collapsed` 时第三列 0px）。
- 主题：`body[data-ds-dark-theme]` 属性切换，令牌定义在 **body 级**（不是 :root），由 `dsh-client-ui-theme` 注入。
- 文案：zh-CN（个别保留英文：`Session log`、模式菜单 `Read Only / Workspace Write / Full access`）。
- 数据：`~/.dsh/`（sessions/、storages/workspace.json、settings.yaml、profiles/web）——**3080 与 3099 共享同一份数据**。

---

## 2. 双主题权威令牌表（45 项，getComputedStyle(document.body) 实测）

### 暗色（默认）

| 令牌 | 值 | 上一轮 mock 是否对 |
|---|---|---|
| bg-base | rgb(21,21,23) | ✅ |
| bg-layer-1 / 2 / 3 | rgb(35,35,36) / 44,44,46 / 53,54,56 | ✅ 近似 |
| bg-module-platform | rgb(53,54,56) | ✅ |
| border-inverted | rgba(255,255,255,.06) | ✅ |
| border-l1 / l2 / l2-thin / l3 / l4 | .06 / .12 / .06 / .16 / .20 | ✅ |
| label-primary / secondary / **tertiary** / caption / dimmed | 249,250,251 / 207,211,214 / **173,178,184** / 129,133,140 / 67,69,74 | ❌ tertiary 抄成了 600（129,133,140，那是 caption） |
| label-primary-bluish / foreground / inverted | 249,250,251 / 15,17,21 / 53,54,56 | ✅ |
| state-business-primary / tertiary | rgb(103,158,254) / rgb(52,65,91) | ✅ |
| **state-error-primary** | rgb(242,90,90)（red-400） | ❌ 抄成 red-500 |
| **state-success-primary** | rgb(34,197,94)（green-500） | ❌ 抄成 green-400 |
| state-warn-primary / warn-label | 245,158,11 / 221,134,41 | ✅ |
| button-info-fill / hover | 103,158,254 / 65,118,230 | ✅ |
| elevated / floating / floating-hover / ghost-active | 67,69,74 / 44,44,46 / 53,54,56 / 67,69,74+129,133,140 | ✅ |
| interactive-hover / active / hover-solid / hover-danger | .08 / .14 / 53,54,56 / rgba(242,90,90,.15) | ✅ |
| **scrollbar-bg / hover** | rgb(84,85,87) / **rgb(101,103,107)** | ❌ hover 抄成 127,130,135 |
| markdown-code-block / inline-code | 27,27,28 / 44,44,46 | ✅ |
| sidebar-fill / input-major / menu / selector | 27,27,28 / 44,44,46 / 53,54,56 / 53,54,56 | ✅ |
| brand-primary | rgb(249,250,251) | ✅ |

### 亮色

| 令牌 | 值 | 上一轮 mock 是否对 |
|---|---|---|
| bg-base / bg-layer-1 / 2 / 3 | 白 / **白 / 白 / 白** | ❌ layer 抄成 60/75/100 |
| bg-module-platform | rgb(245,246,247) | ❌ 抄成 100 |
| **border-inverted** | **rgba(0,0,0,0)**（透明） | ❌ 抄成 .06 |
| **border-l1 / l2 / l2-thin / l3 / l4** | **.04 / .10 / .10 / .12 / .16** | ❌ l1 抄成 .06、l3/l4 抄成 .14/.18 |
| label-primary / secondary / tertiary / caption / dimmed | 15,17,21 / 97,102,107 / 129,133,140 / **173,178,184** / 225,229,238 | ✅（caption 需新增独立令牌） |
| **label-primary-bluish** | **rgb(14,48,116)**（deepseek 900 深蓝） | ❌ 未定义（hero 徽章亮色文字用它） |
| state-business-primary / tertiary | 65,118,230 / 228,237,253 | ✅ |
| state-error / success / warn | 236,19,19 / 34,197,94 / 245,158,11 | ✅ 近似 |
| button-info-fill / hover | 65,118,230 / 103,158,254 | ✅ |
| elevated / floating / floating-hover | 白 / 白 / rgb(241,243,245) | ✅ 近似 |
| ghost-active-fill / border | 235,238,242 / 151,157,166 | ✅ |
| **interactive-hover / active** | rgba(38,49,72,.06) / **.10** | ❌ active 抄成 .12 |
| **hover-danger** | **rgba(236,19,19,.05)** | ❌ 抄成 .12 |
| scrollbar-bg / hover | 229,229,229 / 212,212,212 | ✅ |
| markdown-code-block / inline-code | 249,250,251 / 235,238,242 | ✅ |
| sidebar-fill / input-major / menu / selector | 249,250,251 / 白 / 白 / 245,246,247 | ✅ |

> 新增需补充的令牌：`--dsw-specific-tip`（goal bar 底）、`--dsw-alias-fill-tsp-secondary` / `--dsw-alias-fill-l2`、`--dsh-composer-dock-inset: 8px`、`--dsh-composer-stack-gap: 6px`、`--dsh-chat-content-width: 748px`、`--dsw-font-s-strong-14` / `--dsw-font-xs-13`。

---

## 3. 各状态结构与 mock 差距清单

### 3.1 侧栏（已还原 ✅，补充 2 点）
- 官方 `hHd-Xa_root`：**280px**，logoRow(60px) + 新会话(38px 圆角12) + region + footArea。
- 区头 `qDHVXG_sectionHeader`：`工作区` label + **搜索按钮（点击才展开成输入框）** + `视图选项`（三点）+ `添加工作区`（文件夹+加号）。
- 树行 `YDXeBa_*`：项目行 34px（slot 文件夹图标，active 变 business-primary；hover 时换 chevron + 行操作三点/加号）、会话行 32px（slot + 标题 + 时间，hover 时间隐藏换三点）。列表底部有 `qDHVXG_fade` 渐变。
- footer `VOzbGW_trigger`：34px 圆角12，图标 + 设置。
- mock 差距：区头搜索未做展开动画；树行缺少 hover 行操作（已加）、slot 图标（已加）；`tree-fade` 已加。

### 3.2 Hero 首页（已还原 ✅）
- headline = 鱼形图标(34×25) + `探索未至之境` + `预览版` 徽章（bg business-tertiary、mono、圆角24，**亮色下文字用 label-primary-bluish 深蓝**）。
- 背景 `wSkVaW_heroGlow`：1051×468 椭圆（#6187D8 @8% + 高斯模糊 50），宽 135.438%、bottom 92px。
- 工作区行：`选择工作区` 按钮（文件夹 icon + 名字 + chevron）+ 三点 + 新建会话。
- composer hero 变体：`uV2eYG_hero`，card 最大宽 780px，输入区 4px 12px 0 16px，占位 `描述你想要构建的内容`，`add`(28px 圆形) + `访问模式`(盾牌 icon + `标准模式` + chevron) + 模型触发器 + 发送(34px，`button-info-fill`)。
- mock 差距：已全部对齐；仅输入框的 backdrop/mirror 高亮层（@-提及 chips）未做。

### 3.3 会话视图（❌ mock 缺失最多）
官方 `wSkVaW_header`（**hero 态隐藏**，会话态显示）：
- 面包屑 nav `aria=会话层级`：`crumbCurrent` = 会话标题。
- 头部动作区：**代理预设 chip**（`SVAs4q_label`，22px，fill-tsp-secondary，显示"标准模式/Workspace Write"）+ **子代理计数触发**（`h8S2Va_trigger`，"3 个子代理"，点击弹 336px 菜单，行 50px）+ **任务计数触发**（`QsffPG_trigger`，"1 个后台任务运行中"，菜单行 32px + 状态点）+ **Session log 按钮**（`nL4_yW_sessionLogButton`，min-width 111px 高 32 圆角 18，英文文案）。
- 标签页 tablist：**只有「对话」「轨迹」两个**。

消息流 `Md3f7G_*`（ChatView）：
- scroll padding `16px calc(16px+16px)`，column max-width **748px** gap 16 居中；`flowItem` 消息块；`callRow` 工具调用行（圆角 6）。
- `turnStatus`：**思考中状态 = 渐变 shimmer 动画**（deepseek-500→200 斜纹扫过，文字透明 clip）。
- `加载更早`（older）按钮分页。
- 工具卡内含文件路径行（点击 `打开 <path>` / `在文件夹中显示`），消息 hover 操作：`复制` / `好的回答` / `有问题的回答`（反馈）/ `在新对话中分支`。
- markdown 表格正常渲染（快照实测 2 个 table）。

Composer 上方 **goal dock**（`nLMEza_dock`，data-goal-bar）：
- 36px 高、圆角 12、`specific-tip` 底、max-width 748-32；`目标 glyph` + `进行中的目标` + objective 文本（省略号），error 态红色。

mock 差距：标签 7 个（会话/目标/子代理/任务/工作流/轨迹/技能）→ 官方 2 个（对话/轨迹）；无面包屑、无代理预设 chip、无子代理/任务计数触发、无 Session log、无 goal dock、无 turnStatus shimmer、无消息 hover 操作、无加载更早。

### 3.4 详情面板（右列）
- `ydkMvW_root`：header（`详情` + 关闭，aria=关闭详情）+ body；空态文案 `点击消息流中的工具行查看详情`；内容态 = `section`（sectionLabel 12px 500）+ `code` 块（mono、圆角12、`[data-error]` 红色）。
- mock：结构已对齐，内容态未做。

### 3.5 菜单/弹窗（已还原 ✅，文案修正）
- **模式菜单**：触发器显示 `标准模式`（aria 当前 Workspace Write）；**菜单项文案是英文**：`Read Only` / `Workspace Write` / `Full access`（每项 label+hint）。
- **模型菜单**：分组 `模型`（DeepSeek-V4-Flash…）+ `推理等级`（Max/High/Medium/Low）。
- **工作区菜单**：工作区列表 + `添加工作区…`。
- **斜杠命令菜单**：官方命令 = `compact / export / feedback / goal / permission / plan / model`（描述英文，model 描述中文"选择本会话使用的模型"），下方 `技能` 分组列出所有已装 skill（名称+完整描述）。
- API Key 弹窗：`添加一个 API Key 开始使用` / `配置 DeepSeek 官方模型，即可开始使用。` / `API 密钥` / `稍后配置` / `保存并继续`。

### 3.6 设置页
- 主题：`主题方块`（`_8HJdBW_themeCube`，180px 卡片，`暗色`/`浅色`，选中态 bg module-platform + border static-neutral-bluish-400）。
- 代理预设行（`_5QVD0a_row`：标题+描述+选择器 pill 36px 圆角18）、插件清单（`qSYn7G_*`：搜索框 36px 圆角8、卡片双列网格、状态点）。

### 3.7 主题持久化
- 切换存客户端 localStorage；**Electron 同一 userData 会跨窗口持久**（我的验证窗口切亮色后，下次启动仍是亮色）。桌面 app 若用固定 userData，主题选择会自动记住。

---

## 4. D1 启动器可行性（结论：可行，改动最小）

- `dsh web` 是自包含 HTTP 服务器（UI + API 同源），桌面 app **已实现 spawn**（`npx --yes @deepseek-ai/dsh web --port 3099`）。
- 数据落在 `~/.dsh/`（sessions/storages/settings.yaml/profiles），**多实例共享**：3080 与 3099 显示同一工作区树；重启不丢。
- Electron `BrowserWindow.loadURL('http://127.0.0.1:3099')` 即可获得官方 UI（本项目截图模式已验证两次）。无 API key 时官方自带 onboarding 弹窗，无需自研。
- 切换 = `electron/main.ts` 里 `loadURL(backendUrl)` 替换 `loadFile(dist/index.html)`，可做环境变量/设置项双模式（official / mock）。
- 局限：官方 UI 皮肤钩子很少（`--dsh-*` 布局变量、`--dsw-*` 令牌可被客户端插件 CSS 覆盖，但官方无"聊天风"）；自定义聊天风只能：a) 插件注入 CSS（dsh 客户端插件机制），b) 保留 mock 作为离线/换肤模式。
- 建议：**双模式**，默认 official（真 1:1），设置里可切 mock（练手/离线/自定义风）。

---

## 5. 修改建议（按优先级，等确认后执行）

- **P0-1 令牌修正**：按第 2 节 ❌ 列表改 `src/styles.css`（暗色 tertiary→bluish-400、error→red-400、success→green-500、scrollbar-hover→101,103,107；亮色 layer1-3 全白、border 系 .04/.10/.10/.12/.16、caption 独立、primary-bluish 深蓝、hover-danger .05、active .10）。
- **P0-2 会话视图结构**：标签改 `对话/轨迹`；头部加面包屑 + 代理预设 chip + 子代理/任务计数触发 + Session log 按钮（结构先行，菜单后续）。
- **P0-3 消息流**：按 Md3f7G 布局重排 ChatView（748 列 gap16、flowItem、callRow、turnStatus shimmer、加载更早）。
- **P0-4 goal dock**：composer 上方 36px 目标条（有目标时显示）。
- **P1-1 模式菜单文案**：Read Only / Workspace Write / Full access。
- **P1-2 消息 hover 操作**：复制 / 好的回答 / 有问题的回答 / 在新对话中分支。
- **P1-3 详情面板内容态**：sectionLabel + code 块。
- **P2-1 设置页**：主题方块切换 + 代理预设行。
- **P2-2 斜杠命令**：官方清单（compact/export/feedback/goal/permission/plan/model + 技能区）。
- **P2-3 D1 双模式壳**：main.ts 支持 `UI_MODE=official`。

---

## 6. 本轮新增资产

| 资产 | 内容 |
|---|---|
| `explore-out/01-init…11-theme-light.json` | 11 个状态快照（结构大纲+文本+部分令牌） |
| `explore-out/12-session-view.json` / `13-details-open.json` / `14-session-extra.json` | 会话视图结构（无消息正文，隐私保护） |
| `explore-out/session-styles.html` | **官方运行时全量 CSS 72 个 style 块 202KB**（消息流/头部/goal dock/菜单等） |
| `explore-out/15-tokens-dark.json` / `16-tokens-light.json` | 45 项 × 2 主题权威令牌 |
| `scripts/explore-ui.cjs` / `explore-session.cjs` / `explore-css.cjs` / `tokens.cjs` / `tokens-light.cjs` | 可复跑探索脚本（`npx electron scripts/…`，URL 走 `EXPLORE_URL` 环境变量） |
