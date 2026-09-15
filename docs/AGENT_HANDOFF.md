# AI Agent 研发接手指南

## 1. 当前快照：先读这一节

- 更新时间：2026-09-15。
- 核对基线：`554eebc`，加本指南同次提交的有限译词契约实现；接手时必须检查实际 Git 状态。
- 远程仓库：[Holmes522/EnglishTeacherAgent](https://github.com/Holmes522/EnglishTeacherAgent)。规格文档 `554eebc` 已同步 main。本轮分支为 `codex/lexical-translation-contract`，同步结果以实际 Git 状态为准；没有关闭 TLS 验证。
- 当前阶段：基础链路 Checkpoint A 已交付，正在做 Task 0.2 词典来源验证，尚未完成 Task 1.6 真实查词。
- 最近增量：用户已确认 [有限译词契约规格](LEXICAL_TRANSLATION_SPEC.md)，完成独立 schema、类型、合成测试与生成 component；不进入 LearningResult，所有旧 API/schema 不变。
- 恢复断点：契约已完成，不重复实现或再请求确认；下一步有限快照来源清单与离线结果适配器。真实数据许可、来源关联和 Worker/UI 门槛仍未关闭；百项评测仍为 71/97 译词命中，见 [100 项报告](evaluations/WIKTEXTRACT_COVERAGE.md)。不增加整项完成数。

一句话：**异步任务底座可用，真实英语教学能力还未接入；下一步是验证词典数据，而不是重建底座。**

## 2. 进度与边界

| 范围               | 当前事实                                                                         | 证据入口                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Task 1.1–1.5       | 已完成脚手架、契约、持久化/队列、API/SSE、输入解析                               | [实施状态](IMPLEMENTATION_STATUS.md)、[任务清单](../tasks/todo.md)                                       |
| Checkpoint A       | 浏览器提交、逐项进度、部分失败、取消、失败项重试、刷新恢复；仅 fixture           | [本地演示](LOCAL_DEVELOPMENT.md)                                                                         |
| Task 0.2           | FreeDict 与 Wiktextract 各 100 项结构实测完成；最终来源选择及许可/语义验证未完成 | [FreeDict 报告](evaluations/FREEDICT_REVIEW.md)、[Wiktextract 报告](evaluations/WIKTEXTRACT_COVERAGE.md) |
| Task 1.6           | 未交付真实查词适配器和结果卡                                                     | [词典结果契约](../packages/contracts/src/results.ts) 只是契约，不是实现                                  |
| Task 0.3、1.7–1.10 | 真实模型评测、网关、例句、句子评分纠错、词形词族未交付                           | [任务清单](../tasks/todo.md)                                                                             |
| Task 1.11–1.13     | 批量底座和部分扩展端口已有；真实教学批量、反馈、观测预算及发布验收未完成         | [实施状态](IMPLEMENTATION_STATUS.md)                                                                     |
| 后续阶段           | 账号/学习闭环、真实 TTS、第二语言、插件运行时未交付                              | [实施计划](../tasks/plan.md)                                                                             |

按阶段 1 的 13 个任务计，完成 5 个，约 38%；这是任务计数，不是工作量百分比或上线成熟度。不要因为页面能操作就报告 MVP 已完成。

## 3. 已确认决策与尚未批准事项

已确认，继续沿用：

- 按项目文档增量开发，并同步上述 GitHub 仓库。
- 后续每次实质研发增量必须同步更新本指南，与代码一起提交；不能只在聊天里汇报进度。
- 本地 Docker Desktop + PostgreSQL + Redis/BullMQ，见 [ADR-005](decisions/0005-local-postgres-redis-runtime.md)。
- 优先审查可商用开源词库，允许缩小覆盖范围。无需再次询问是否走开源路线。
- 未配置真实能力时使用明确标注的 fixture 或 `NOT_ENABLED`，不伪造教学结果。
- 2026-09-15 已确认独立有限译词契约增量；实现不包含真实词库发布或 Worker/UI 接入。

尚未确认，不得自行视为获批：

- 产品/架构文档整体仍为 Draft/Proposed；首发地区、数据驻留、目标用户细分、预算及生产数据保留期等待正式决策。
- 开源路线不等于某个词库已满足许可要求；需要核实署名、修改、分发、缓存及持久化条件。数据库结果、事件和备份也可能保存词典内容。
- 真实模型供应商、凭据、付费预算和地区可用性未确认；不凭空新增可用模型或声称已评测。
- 生产部署未获验收。不得将本地端口、示例凭据、静态 CSP 和历史健康检查当作生产安全保证。

## 4. 词库工作：不要重复踩坑

FreeDict `eng-zho/2025.11.23` 已跑完固定 100 项查询，其中 97 项有效输入、3 项负向控制：

- 73/97 有标注中文的非空译词，结构命中率 75.26%；不是中文释义准确率。
- 29 项出现一个翻译组关联多条英文解释的结构；不能按数组顺序硬配为一一对应义项。
- 命中条目没有可用的源 `xml:id`；内部生成 ID 不能冒称原始源 ID。
- 包声明与当前上游版权页存在待核实的许可版本链问题；尚未批准作为应用数据源。

版本、校验摘要、下载与复现命令只维护在 [FreeDict 报告](evaluations/FREEDICT_REVIEW.md)，逐项计数在 [JSON 报告](evaluations/freedict-eng-zho-2025.11.23.json)。不要依赖前一会话的临时下载路径；完整词库未提交进仓库。

已有候选比较包括 Cambridge、Oxford、ECDICT：前两者的存储授权需确认，ECDICT 不能仅凭软件 MIT 标记推定聚合数据来源全部可商用。具体证据见 [来源 Spike](LEXICAL_SOURCE_SPIKE.md)。

Kaikki 原始 JSONL 已完成 100 探针实测，摘要和限制见 [Wiktextract 报告](evaluations/WIKTEXTRACT_COVERAGE.md)。读取器有意不把简短翻译标签绑定到完整 gloss；`FOUND` 只表示快照有中文译词。不要重做三词初查或重复收集 100 项；继续应用来源/许可展示与有限查询结果设计。新上游版本需要重新评测，不要关闭摘要校验。

## 5. 下一步如何接着做

按 [现有增量计划](../tasks/plan.md) 的 0.2b/0.2c → 1.6a → 1.6b 推进：

当前优先断点：[有限译词契约](LEXICAL_TRANSLATION_SPEC.md)已确认并实现；下一步对已有读取器增加有限快照的来源清单及离线结果映射。先用合成数据证明状态、字段、摘要/来源关联与超限失败；来源审查通过前不接应用。批准契约不代表批准具体词库发布。

1. **落实有限数据切片的许可与来源展示。** 100 项结构评测已完成，选择明确范围的原始词条，记录版本/快照、署名、许可链接和修改说明；不要把结构命中报告当作授权证明。
2. **实现有限译词组查询的离线适配器。** 独立结果契约已完成，保留未知/缺失与 UNRESOLVED，不将其硬塞入 `WordAnalysis.zhDefinition`。新契约采用显式 UTF-16 上限，可能严于原始读取器的码点上限；超限应失败，不截断。需要完整义项绑定的部分另补可审计映射，不静默降低原 Task 1.6 验收。
3. **通过数据门槛后接入 Worker 和结果卡。** 先阅读下节代码；明确有限覆盖，不伪造全部标准义项。需要新增契约字段时同步 schema 生成及测试，再做桌面/移动浏览器 E2E。
4. **若数据仍不可用，记录具体阻塞与替代验证。** 不反复重做已完成的 FreeDict 结构评测；不为了展示结果而用模型编造词典事实。需要新的采购、发布决定或材料时说明所需用户行动。

这一顺序是下一步计划，不是已执行结果。有限样本成功不能直接勾选 Task 1.6 原有的 100 词条、来源及 UI 验收。

## 6. 按需代码导航

| 要改什么                       | 先读哪里                                                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 产品目标与模块边界             | [PRD](PRD.md)、[能力地图](CAPABILITY_MAP.md)、[技术设计](TECHNICAL_DESIGN.md)                                                                         |
| 结果结构、义项、错误与语言字段 | [results.ts](../packages/contracts/src/results.ts)、[learningRun.ts](../packages/contracts/src/learningRun.ts) 及同目录测试                           |
| 处理器接入与模式开关           | [processor.ts](../packages/runtime/src/processor.ts)、[settings.ts](../packages/runtime/src/settings.ts)、[Worker](../apps/worker/src/main.ts)        |
| 持久化、幂等、取消、重试和租约 | [repository.ts](../packages/runtime/src/repository.ts)、[queue.ts](../packages/runtime/src/queue.ts)、[状态机](../packages/runtime/src/state.ts)      |
| API、匿名会话和 SSE            | [路由目录](../apps/web/app/api/v1/)、[server.ts](../apps/web/lib/server.ts)、[HTTP 校验](../packages/runtime/src/http.ts)                             |
| 用户界面与刷新恢复             | [composer.tsx](../apps/web/app/composer.tsx)、[page.tsx](../apps/web/app/page.tsx)、[幂等键](../apps/web/lib/request-key.ts)                          |
| 输入规范化与拆分               | [parseLearningInput.ts](../packages/content-intake/src/parseLearningInput.ts) 及同目录测试                                                            |
| 离线词典验证                   | [脚本目录](../scripts/lexical/)、[黄金集目录](../tests/golden/)                                                                                       |
| Wiktextract 离线读取与查词     | [wiktextract.ts](../packages/lexical-knowledge/src/wiktextract.ts) 及同目录合成测试；尚未被应用加载                                                   |
| 100 项采集与离线重算           | [运行器](../scripts/lexical/evaluate-wiktextract.mjs)、[评测边界](../packages/lexical-knowledge/src/evaluation.ts)；使用 `pnpm exec tsx`，不依赖 dist |

当前 `PROCESSOR_MODE` 只接受 `fixture` / `disabled`，未设置时为 disabled。fixture 正常返回 `CLARIFICATION`；精确输入 `fixture:fail` 会持续产生演示失败。`packages/lexical-knowledge` 已有离线读取器，但没有联网 provider 或 `WordAnalysis` 结果适配器。

## 7. 环境与验证

在仓库根目录使用 PowerShell。先检查，不假设旧进程仍在：

```powershell
git status --short --branch
git log -5 --oneline
node --version
pnpm --version
docker compose ps
```

生产 Node 基线由 `.nvmrc` 固定为 24.20.0，pnpm 固定为 11.19.0。此前本机实际使用 Node 22.20.0；这是已知验证差距，不是建议降级。详细启动/迁移步骤见 [本地开发](LOCAL_DEVELOPMENT.md)，已有 `.env` 只补缺失配置，不覆盖、不打印其内容。

容器端口仅回环暴露：PostgreSQL 55432、Redis 56379。Docker 曾有残留 socket 错误，已恢复过；现在是否健康须重新检查，不要默认复发或自动重命名运行时目录。不要清空命名卷。

历史验证证据（**不是每次接手自动有效的结果**）：

本轮契约实现：56 项定向测试、全仓 154 项测试及契约漂移、lint/typecheck/build 通过；旧生成 schema/API 与基线完全一致（仅增加独立 component），独立复审无 Required。生成 JSON Schema 不能表达全部运行时 refinement，需用 Zod schema 校验。未改应用、数据库/队列、UI 或依赖，未重跑集成、浏览器、词库采集和依赖审计。仍在 Node 22.20.0 验证，不代表 Node 24 或生产验收。

- 基础链路：71 条 Vitest 单元测试、11 条真实 PostgreSQL/Redis 集成测试、lint/typecheck/build/契约漂移检查通过；人工浏览器验证过刷新、重试、取消和 Worker 重启恢复。
- FreeDict 增量：24 项独立 PowerShell 断言通过，固定文件重算报告一致；重新运行过 71 条单元测试、lint/typecheck/build/契约漂移检查。这 24 项不包含在 `pnpm test` 中。
- 没有自动化浏览器 E2E/CI、压力测试和完整生产验收；历史依赖审计结果不代表当前永远无漏洞。
- 2026-09-14 Wiktextract 增量：全仓 89 条单元测试（含新增 18 条）、契约漂移、lint/typecheck/build 通过；三词真实快照验证通过。数据库/队列和 UI 未改，未重跑集成/浏览器验收与依赖审计，不声称 Docker 当前健康。
- 2026-09-15 百项评测增量：全仓 100 条测试、契约漂移、lint/typecheck/build 通过，真实快照离线重算与本次 JSON 报告完全一致。独立复审通过：未决输入不发布完整覆盖比例，回放以白名单重建观测并清除旧诊断。未修改应用、数据库/队列或 UI，未重跑集成/浏览器验收与依赖审计；仍为 Node 22 本机验证，不代表 Node 24 或生产验收。

代码修改后的常用验证：

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
# 修改数据库/队列行为时，先确认真实本地依赖可用
pnpm test:integration
# 修改离线 FreeDict 工具时另行执行；完整数据评测见专门报告
& ./scripts/lexical/Test-FreeDict.ps1
```

## 8. 保持交接资料可用

文档分工：本指南保存“下一位怎么接手”；[实施状态](IMPLEMENTATION_STATUS.md)保存交付事实和验证边界；[任务清单](../tasks/todo.md)保存验收；[ADR](decisions/)保存决策原因。链接到详细证据，不在多处复制完整报告。

每次实质进展结束后更新：

- 日期与已核对代码提交；不能把还没 push 的工作写成远端已有。
- 本轮完成/未完成内容、实际验证命令和结果、未运行项及原因。
- 用户新增决定、尚待批准事项、精确的下一步与验收入口。
- 未提交文件、未推送提交或未完成后台任务；会话 ID 和临时路径不能当作可移植依赖。

更新时覆盖已过期的当前快照，而不是无限追加流水账；历史实现详情由 Git、实施状态和专项报告保留。提交前确认本指南已随本轮代码更新。尚未完成也要记录真实断点，不能为了交接而将其标为完成。

如果收到的只有“继续”，先核对当前工作区及本指南断点，再提出并执行一个可验证的小增量；不要重新搭建项目，也不要把历史计划当成用户刚刚批准的新权限。
