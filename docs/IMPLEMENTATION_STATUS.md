# 实施状态

- 更新日期：2026-09-16
- 离线适配器已同步 GitHub main（`82a0ef2`）；本轮为 `codex/lexical-slice-review`，接手时核对实际 Git HEAD。
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

2026-09-16 三词来源复核：新增[评测清单、条款初核及复验报告](evaluations/LEXICAL_SLICE_REVIEW.md)，teacher/apple/bank 新采字节与旧样本摘要一致。补足逐文件下载时间；真实适配器输出均 FOUND，共 14 条译词记录，仍未绑定完整义项。contracts 构建、来源保留、3 份字节篡改拒绝和清单外输入拒绝通过；本地链接、定向 Prettier 与 `git diff --check` 通过。正文仅本地保存，应用未加载清单。仅元数据/文档改动，未重跑全仓门禁、集成、浏览器和依赖审计；历史导入/讨论页/模板依赖未完成逐一追溯，不声称数据源正式获批。

上一轮离线适配器文档验证：70 个本地链接有效，定向 Prettier 与 `git diff --check` 通过。

2026-09-16 离线适配器：新增 25 项合成测试，定向 34 项、全仓 179 项及契约漂移、lint/typecheck/build 通过，独立复审无 Required。实现清单词头/URL/摘要关联、离线字段映射和固定失败码；不包含真实获批清单、Worker/UI 或完整 WordAnalysis。仅添加 contracts workspace 依赖，lockfile 无新第三方版本；使用 `pnpm install --offline --ignore-scripts`，没有下载包或运行安装脚本。未改应用/数据库/队列/UI，未重跑集成、浏览器、真实词库采集和依赖审计。Node 22.20.0 本机结果不代表 Node 24 或生产验收。

2026-09-15 独立译词契约：用户已确认，交付 [schema、测试与生成 component](LEXICAL_TRANSLATION_SPEC.md)。56 项定向测试、全仓 154 项测试及契约漂移、lint/typecheck/build 全部通过；独立复审通过。与基线逐项比较，除新增 component 外旧生成 schema/API 路径完全一致。未接入 LearningResult、Worker/UI 或真实数据，不勾选 Task 0.2/1.6。没有对应行为/依赖变更，未重跑集成、浏览器、词库采集和依赖审计；Node 22.20.0 本机结果不代表 Node 24 验收。

此前规格文档增量：54 个本地链接、定向 Prettier 与差异检查通过，未运行业务测试。用户随后确认了首个编码范围。

上一轮契约文档检查：66 个本地链接有效，定向 Prettier 与 `git diff --check` 通过；进度与代码一起提交。

2026-09-15 百项评测增量：`pnpm lint`、`pnpm typecheck`、`pnpm test`（100 条，含契约漂移检查）、`pnpm build` 全部通过。98 份真实快照离线重算与本次提交的 JSON 报告完全一致，97 项有效输入没有未决项。独立复审已关闭覆盖比例和旧诊断残留两项问题。未修改应用、数据库/队列或 UI，本轮未重跑集成测试、浏览器验收和依赖审计；lockfile 未新增依赖版本。验证运行时仍为 Node 22.20.0，不代表 Node 24 验收。

上一轮 2026-09-14 读取器增量：89 条测试、契约漂移、lint/typecheck/build、三个真实快照及 66 个本地文档链接验证通过。

上一轮百项评测文档检查：入口与更新文档的 74 个本地链接有效，定向 Prettier 与 `git diff --check` 通过。

以下是此前基础链路验证记录，不应当作本轮重跑结果：

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

当前断点：[三词真实清单及离线复验](evaluations/LEXICAL_SLICE_REVIEW.md)已交付，仅作评测。teacher 翻译子页需独立署名，下一步补多出处链接展示契约及合成测试，再确认三词本地试用/持久化范围与对应来源遗留项；不重复建设映射机制或百项采集。尚未接入 LearningResult/Worker/UI，Task 0.2/1.6 原验收不变。

2026-09-15：完成 [Wiktextract 100 项采集与离线重算](evaluations/WIKTEXTRACT_COVERAGE.md)（快照采集于 09-14），97 项有效输入全部校验，71 项存在中文译词，26 项无中文译词；读取器按上游可缺省字段跳过并计数不完整翻译记录，未降低错误类型校验。尚未接入应用，不勾选 Task 0.2/1.6 的整体验收。

2026-09-14：新增 `packages/lexical-knowledge` 离线 Wiktextract 读取器，三词真实快照通过摘要与结构校验；分别保留英文义项层级和中文译词组，不自动绑定。详情与复现见 [Wiktextract 小样本报告](evaluations/WIKTEXTRACT_REVIEW.md)。未接入 Web/Worker，Task 0.2/1.6 保持未完成。

2026-09-13：用户确认开源优先路线。交付独立的离线 FreeDict 评测工具和 [实测报告](evaluations/FREEDICT_REVIEW.md)，完成 100 项查询与字段映射边界检查。97 项有效输入中 73 项中文译词结构命中，29 项需核对义项对应，许可版本链尚待进一步核实；不是已上线的真实查词功能，Task 0.2/1.6 保持未完成。

2026-09-12 后续进展：[词典来源 Spike](LEXICAL_SOURCE_SPIKE.md)已完成公开资料比较，准备了 100 项未测探针。确认了商业候选存储许可与当前结果持久化设计之间的前置约束；Task 0.2/1.6 尚未完成，本次不增加已完成开发任务数量。

1. 确认 Task 0.1 的产品与合规决策。
2. 完成词典授权和 100 词条 Spike，再进入真实单词查询切片。
3. 获得获批模型供应商凭据与预算，完成真实质量/成本 Spike，再进入模型网关、例句和句子评改切片；凭据不提交 Git。
