# 实施状态

- 更新日期：2026-09-13
- 交付分支：`main`（基础链路与离线 FreeDict 评测已合并；功能/评测基线 `e52ffbd`）
- 新会话接手入口：[AI Agent 研发接手指南](AGENT_HANDOFF.md)。新增指南不改变任务完成度。
- 产品/架构文档整体仍为 Draft/Proposed；ADR-005 的本地运行方案已获确认，不代表生产部署获批。

## 已完成

- Task 1.1：pnpm monorepo、Node 24 生产基线、Web/Worker、strict TypeScript、环境 schema、lint/typecheck/test/build 命令。
- Task 1.2：LearningRun、LearningItem、WordAnalysis、SentenceReview、PublicError、CapabilityManifest 的 Zod/TypeScript 契约；JSON Schema 与 OpenAPI 由同一来源生成并做漂移检查。
- Task 1.5：最多 20 项/5000 Unicode code point 的输入拆分、NFKC 规范化、顺序保留、类型识别、显式意图优先和 30 条黄金解析案例。
- ADR-004 的部分 MVP 扩展点：`SpeechProvider`、`DisabledSpeechProvider`、稳定 UI slot ID 和 `/api/v1/capabilities`。
- 合并前加固：拒绝空白输入，校验 LearningItem 成功/失败状态载荷和项目顺序，并为 Web 全路由配置 CSP、点击劫持、MIME 嗅探、Referrer 与浏览器能力限制响应头。
- Task 1.3：PostgreSQL 迁移、事务 run/items/events/outbox、BullMQ 至少一次投递、尝试记录、租约续期与 token 隔离、有界崩溃恢复、到期清理。
- Task 1.4：匿名 HttpOnly 会话、原子幂等创建、查询/取消/失败项重试、单调事件 ID 与 Last-Event-ID 续传。GET 是最终状态来源。
- Checkpoint A：可操作的响应式任务表单、逐项进度、部分失败、取消、重试和刷新恢复。fixture 显式标记为演示；没有伪造真实教学结果。
- 安全边界：参数化 SQL、会话哈希与所有权校验、同源写入、JSON body 字节上限、结构化公开错误、日志不输出原文或凭据；本地数据库端口仅绑定回环地址。

## 当前验证

每个增量均运行相应 focused test 和包构建。最新全仓门禁包括：

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`（71 条单元测试）
- `pnpm test:integration`（11 条真实 PostgreSQL/Redis 测试；事务回滚、并发幂等、重复投递、租约恢复、迟到结果、取消、失败项重试、会话隔离、SSE 续传与到期清理）
- `pnpm build`
- `pnpm --filter @english-teacher/contracts check:generated`
- `pnpm audit --audit-level high --registry https://registry.npmjs.org`（无已知漏洞）

浏览器人工验证：正常批次完成、部分失败、只重试失败项、刷新恢复、排队取消、Worker 停止后排队并在重启后完成；390×844 视口无横向溢出，表单与结果可读，浏览器控制台无错误。回归测试验证重试条目不继承旧错误，并能正常转为 SUCCEEDED；客户端响应不确定时保留幂等键，确认收到任务后才清除。

本机使用 Node 22.20.0 完成验证；生产基线仍为 Node 24.20.0，不能将此次结果冒充 Node 24 或生产环境验收。本轮为手动真实浏览器验收，尚未加入自动化浏览器 E2E/CI，也未完成压力测试。

## 本地运行与数据

Docker Desktop 残留 socket 错误已通过备份运行时目录恢复，未删除镜像、数据库或命名卷。PostgreSQL/Redis 健康检查通过，迁移可重复执行。启动步骤与排障见 [本地开发](LOCAL_DEVELOPMENT.md)。

匿名任务本地默认保留 7 天，可配置为 1–30 天；这是开发默认值，不代表生产合规决策。fixture 固定失败标记为 `fixture:fail`，默认禁用处理器返回 `NOT_ENABLED`。

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
- 生产部署：本地数据库/队列方案已实现；生产限流与预算、端到端 trace/指标告警、严格 nonce CSP、TLS、备份恢复、负载/隐私/可访问性专项验收仍待完成。当前不是生产可发布版本。

## 下一实施顺序

2026-09-13：用户确认开源优先路线。交付独立的离线 FreeDict 评测工具和 [实测报告](evaluations/FREEDICT_REVIEW.md)，完成 100 项查询与字段映射边界检查。97 项有效输入中 73 项中文译词结构命中，29 项需核对义项对应，许可版本链尚待进一步核实；不是已上线的真实查词功能，Task 0.2/1.6 保持未完成。

2026-09-12 后续进展：[词典来源 Spike](LEXICAL_SOURCE_SPIKE.md)已完成公开资料比较，准备了 100 项未测探针。确认了商业候选存储许可与当前结果持久化设计之间的前置约束；Task 0.2/1.6 尚未完成，本次不增加已完成开发任务数量。

1. 确认 Task 0.1 的产品与合规决策。
2. 完成词典授权和 100 词条 Spike，再进入真实单词查询切片。
3. 获得获批模型供应商凭据与预算，完成真实质量/成本 Spike，再进入模型网关、例句和句子评改切片；凭据不提交 Git。
