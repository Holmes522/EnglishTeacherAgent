# 实施状态

- 更新日期：2026-09-11
- 开发分支：`feature/foundation-contracts`
- 产品/架构文档状态：仍为 Draft/Proposed

## 已完成

- Task 1.1：pnpm monorepo、Node 24 生产基线、Web/Worker、strict TypeScript、环境 schema、lint/typecheck/test/build 命令。
- Task 1.2：LearningRun、LearningItem、WordAnalysis、SentenceReview、PublicError、CapabilityManifest 的 Zod/TypeScript 契约；JSON Schema 与 OpenAPI 由同一来源生成并做漂移检查。
- Task 1.5：最多 20 项/5000 Unicode code point 的输入拆分、NFKC 规范化、顺序保留、类型识别、显式意图优先和 30 条黄金解析案例。
- ADR-004 的部分 MVP 扩展点：`SpeechProvider`、`DisabledSpeechProvider`、稳定 UI slot ID 和 `/api/v1/capabilities`。
- 合并前加固：拒绝空白输入，校验 LearningItem 成功/失败状态载荷和项目顺序，并为 Web 全路由配置 CSP、点击劫持、MIME 嗅探、Referrer 与浏览器能力限制响应头。

## 当前验证

每个增量均运行相应 focused test 和包构建。最新全仓门禁包括：

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`（63 条测试）
- `pnpm build`
- `pnpm --filter @english-teacher/contracts check:generated`
- `pnpm audit --audit-level high --registry https://registry.npmjs.org`（无已知漏洞）

## 临时实施假设

这些假设只用于不依赖商业授权的基础开发，不代表产品评审已批准：

- 用户暂按中文母语、CEFR A2–B2 的成人/学生设计。
- MVP 暂按匿名会话和产品内部 100 分学习量表设计。
- 未配置真实供应商时只使用 fixture 或明确的 `NOT_ENABLED`，不伪造词典完整性、模型结果或音频。
- 三类语言字段固定分离：`uiLocale`、`explanationLocale`、`targetLanguage`。

## 外部阻塞

- Task 0.1：目标用户、首发地区/数据驻留、匿名数据保留期、预算和评分定位尚未正式批准。
- Task 0.2：需要至少两个合法双语词典候选、授权条款和 100 词条样本。
- Task 0.3：需要至少两个模型供应商的凭据、目标地区可用性和预算，才能完成真实质量/成本 Spike。
- Task 1.3/1.4：PostgreSQL、Redis/队列的本地与部署策略尚未选定；在此之前不以进程内存储冒充可靠任务系统。

## 下一实施顺序

1. 确认 Task 0.1 的产品与合规决策。
2. 在 PostgreSQL/队列方案确认后实现 Task 1.3 与 Task 1.4。
3. 并行完成词典与模型 Spike，再进入单词查询、例句和句子评改纵向切片。
