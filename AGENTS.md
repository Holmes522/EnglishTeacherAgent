# EnglishTeacherAgent：Agent 工作入口

本仓库是面向中文学习者的英语教师 Agent。先了解现状，再继续实现；不要把设计文档中的目标能力当成已经交付的功能。

## 接手顺序

1. 完整阅读 [AI 接手指南](docs/AGENT_HANDOFF.md)，获取当前断点、已确认决策和下一步。
2. 阅读 [实施状态](docs/IMPLEMENTATION_STATUS.md)，按本次任务查阅 [任务清单](tasks/todo.md) 的验收标准。
3. 检查 `git status --short --branch`、`git log -5 --oneline`，阅读相关源码与测试，再给出本次小步计划。
4. 文档是带日期的交接快照。发现与代码或用户最新要求冲突时，先说明差异，不静默修改验收标准。

## 稳定工程约定

- 技术栈：pnpm workspace、TypeScript、Next.js/React、PostgreSQL、Redis/BullMQ；准确版本以 `.nvmrc`、`package.json` 和 lockfile 为准。
- 保留用户未提交改动；新增分支使用 `codex/` 前缀，小步实现、验证和提交。按用户当前授权同步 GitHub，不强推。
- 业务行为改动先补失败测试；参考同包既有模式，不为未实现能力搭建庞大的空抽象。
- 共享契约在 `packages/contracts/src` 修改，再运行 `pnpm --filter @english-teacher/contracts generate`；不要只手改生成的 JSON Schema/OpenAPI。
- 后端 Node ESM 相对导入沿用 `.js`；Next.js 应用内部沿用既有导入方式，不做全仓机械替换。
- 常规代码门禁：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`。数据库/队列行为还需 `pnpm test:integration`；UI 还需真实浏览器验证。
- 纯文档改动检查路径、命令、事实、差异与 Markdown 格式；无需把历史业务测试说成本轮重跑。

## 不得越过的边界

- 当前 fixture 仅证明异步链路；不能冒充真实词典、模型评分或音频。
- 词典事实必须可追溯；未收录、未测、义项关联不明时明确说明，不用 LLM 补成权威事实。
- 用户已确认优先审查可商用开源词库，并接受覆盖范围缩小；不要反复询问路线选择，也不要把此决定等同于具体数据源授权已核实。
- 不提交 `.env`、凭据、用户原文或未经审查的词库正文；不要在日志或交接文档暴露这些内容。
- 不覆盖已有 `.env`，不删除 Docker 数据卷，不把历史 socket 修复步骤当作每次启动的常规操作。
- 本地研发授权不代表采购、付费调用或生产部署授权；新权限与产品决策需向用户确认。

## 每次结束前

用户明确要求后续研发进度持续同步到接手指南：每次实质开发增量都必须更新 `docs/AGENT_HANDOFF.md` 的快照与下一步，并与该增量代码一起提交；不能只在聊天中汇报。交付能力/验证证据更新 `docs/IMPLEMENTATION_STATUS.md`，达到验收才勾选 `tasks/todo.md`。记录实际运行的验证、未运行项和原因，以及未提交/未推送的工作。保持此入口简短，不在这里堆叠每日流水账。
