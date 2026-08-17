# SECURITY_CHECKLIST — 每次 push 前必查（最高优先级）

> 依据 GitHub 官方安全实践与社区清单整理，针对本仓库（dsh-zhuomian）定制。
> 来源：
> - GitHub Docs — [Securing your repository](https://docs.github.com/en/enterprise-cloud@latest/copilot/tutorials/copilot-cookbook/analyze-security/secure-your-repository)
> - GitHub Community — [How can I prevent secrets from being exposed in a public repository?](https://github.com/orgs/community/discussions/187601)
> - GitHub Community — [How Do You Secure Sensitive Data in Public or Shared Repositories?](https://github.com/orgs/community/discussions/165225)
> - GitHub Community — [Secret Scanning Basics](https://github.com/orgs/community/discussions/149172)
> - GitHub Community — [Secret Scanning Basics in Open Source](https://github.com/orgs/community/discussions/145125)

**铁律：push 前先跑 `npm run security`，全绿才允许 push。** 该命令执行 `scripts/security-check.cjs`。

## 清单（脚本自动检查项 ✅ / 人工检查项 👁）

### A. 密钥与敏感信息（自动）
- [ ] ✅ 工作树无高置信密钥模式：`sk-*`、`ghp_/gho_/ghs_`、AWS `AKIA*`、`AIza*`、`BEGIN * PRIVATE KEY` 等
- [ ] ✅ 无 `password/secret/token/apikey = 值` 形式的赋值
- [ ] ✅ 历史提交（全部 commit）无密钥模式 —— 密钥进了历史 = 已泄露，必须换 key 而不是删文件
- [ ] ✅ `package-lock.json` 无 `_authToken` / 内嵌凭据
- [ ] ✅ 无 `.env` / `*.pem` / `*.key` / `*.pfx` / `*.p12` / `*.crt` 文件（node_modules 之外）

### B. 入库边界（自动）
- [ ] ✅ `.gitignore` 覆盖：`node_modules/`、`dist/`、`dist-electron/`、`release/`、`release-v2/`、`runtime/`、`*.log`、`*.tmp`、探索产物（`shot-*`、`probe*.json`、`verify*`）
- [ ] ✅ git status 无意外的大文件/二进制/产物待提交（只应有源码与文档）
- [ ] ✅ 无未跟踪的敏感文件（脚本列出全部 untracked 供人工确认）

### C. 个人信息与隐私（自动 + 人工）
- [ ] ✅ 已跟踪文件无 `C:\Users\<真实用户名>` 绝对路径（mock 数据已泛化为 `demo`）
- [ ] 👁 文档/截图/示例不包含真实会话内容、真实项目名（如确需示例请用假名）
- [ ] 👁 `README`/`BUGS` 中若出现本机路径，改用 `~` / 相对描述

### D. 合规与授权（人工）
- [ ] 👁 `LICENSE` 存在且与代码来源一致（本项目 MIT；引擎 `@deepseek-ai/dsh` 亦为 MIT，可随包分发）
- [ ] 👁 第三方依赖许可可接受（`node_modules` 不入库；打包产物另行分发）
- [ ] 👁 项目名/图标含 "DeepSeek" 商标 —— 属非官方项目，README 已声明 "Unofficial"，继续保留声明
- [ ] 👁 无公司/客户专有代码混入（本仓库仅限 dsh-zhuomian 自身）

### E. 发布物与更新通道（人工 + 自动）
- [ ] 👁 打包产物不含 `~/.dsh` 用户数据（会话/API Key 只在用户机器，不进安装包）
- [ ] 👁 自动更新（electron-updater）走 GitHub Releases + `latest.yml` 校验；正式发布建议加代码签名证书
- [ ] ✅ `npm audit` 无高危漏洞（或已知并记录）—— **2026-08-17 实测：生产依赖 0 漏洞；17 个已知漏洞全部位于打包工具链（electron-builder/vite 系 devDependencies），不进安装包，不影响终端用户**

### F. GitHub 仓库设置（一次性，人工，public 后做）
- [ ] 👁 开启 **Secret scanning**（仓库 Settings → Code security）
- [ ] 👁 开启 **Dependabot alerts**
- [ ] 👁 分支保护：`main` 需要 PR + 检查（可选）
- [ ] 👁 push 用的 token/凭据保持最小权限；疑似泄露立即轮换

## 泄密应急（如果某次 push 后发现密钥进了历史）
1. **立即轮换该密钥/Token**（删除+重建），泄露的 key 一律作废
2. 用 `git filter-repo` 清理历史后 force-push；或直接 `gh repo delete` 重建仓库
3. 通知可能受影响的服务（云平台/密钥托管方）

## 每次 push 流程（写进习惯）
```
npm run security   # 1. 自动检查，必须全绿
git status         # 2. 人工过目待提交清单
git push           # 3. 推送
```
