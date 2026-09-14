# AI Agent 研发接手指南

## 1. 当前快照：先读这一节

- 更新时间：2026-09-14。
- 核对基线：本地 `codex/wiktextract-reader` 的 `253ee37`（Wiktextract 离线读取切片），加后续交接状态提交。接手时必须检查实际 Git 状态。
- 远程仓库：[Holmes522/EnglishTeacherAgent](https://github.com/Holmes522/EnglishTeacherAgent)。此前交付已同步到 `main` 的 `5459e68`；**本轮 `253ee37` 及交接状态尚未推送**，GitHub TLS 握手连续失败，远端当前状态无法重新确认。本地代码已提交且未丢失；没有合并本轮到本地 main、没有强推或关闭 TLS 验证。
- 当前阶段：基础链路 Checkpoint A 已交付，正在做 Task 0.2 词典来源验证，尚未完成 Task 1.6 真实查词。
- 最近增量：`packages/lexical-knowledge` 离线 Wiktextract 读取/查询包，校验快照摘要、保留义项层级与未绑定的中文译词组；**不是已上线的查词功能**。
- 恢复断点：Kaikki 的 teacher/apple/bank 原始样本已下载并通过读取器校验；10 个 entry、70 个 sense、5 个中文译词组。正文未提交，复现入口见 [小样本报告](evaluations/WIKTEXTRACT_REVIEW.md)。尚未扩展到 100 探针、落实应用数据许可与来源展示、接入 Worker/UI，不增加已完成任务数。

一句话：**异步任务底座可用，真实英语教学能力还未接入；下一步是验证词典数据，而不是重建底座。**

## 2. 进度与边界

| 范围               | 当前事实                                                                          | 证据入口                                                                                               |
| ------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Task 1.1–1.5       | 已完成脚手架、契约、持久化/队列、API/SSE、输入解析                                | [实施状态](IMPLEMENTATION_STATUS.md)、[任务清单](../tasks/todo.md)                                     |
| Checkpoint A       | 浏览器提交、逐项进度、部分失败、取消、失败项重试、刷新恢复；仅 fixture            | [本地演示](LOCAL_DEVELOPMENT.md)                                                                       |
| Task 0.2           | FreeDict 100 项实测与 Wiktextract 三词读取完成；最终来源选择及许可/语义验证未完成 | [FreeDict 报告](evaluations/FREEDICT_REVIEW.md)、[Wiktextract 报告](evaluations/WIKTEXTRACT_REVIEW.md) |
| Task 1.6           | 未交付真实查词适配器和结果卡                                                      | [词典结果契约](../packages/contracts/src/results.ts) 只是契约，不是实现                                |
| Task 0.3、1.7–1.10 | 真实模型评测、网关、例句、句子评分纠错、词形词族未交付                            | [任务清单](../tasks/todo.md)                                                                           |
| Task 1.11–1.13     | 批量底座和部分扩展端口已有；真实教学批量、反馈、观测预算及发布验收未完成          | [实施状态](IMPLEMENTATION_STATUS.md)                                                                   |
| 后续阶段           | 账号/学习闭环、真实 TTS、第二语言、插件运行时未交付                               | [实施计划](../tasks/plan.md)                                                                           |

按阶段 1 的 13 个任务计，完成 5 个，约 38%；这是任务计数，不是工作量百分比或上线成熟度。不要因为页面能操作就报告 MVP 已完成。

## 3. 已确认决策与尚未批准事项

已确认，继续沿用：

- 按项目文档增量开发，并同步上述 GitHub 仓库。
- 后续每次实质研发增量必须同步更新本指南，与代码一起提交；不能只在聊天里汇报进度。
- 本地 Docker Desktop + PostgreSQL + Redis/BullMQ，见 [ADR-005](decisions/0005-local-postgres-redis-runtime.md)。
- 优先审查可商用开源词库，允许缩小覆盖范围。无需再次询问是否走开源路线。
- 未配置真实能力时使用明确标注的 fixture 或 `NOT_ENABLED`，不伪造教学结果。

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

Kaikki 原始 JSONL 三词样本已实测，摘要和限制见 [Wiktextract 报告](evaluations/WIKTEXTRACT_REVIEW.md)。读取器有意不把简短翻译标签绑定到完整 gloss；`FOUND` 只表示快照有中文译词。不要重新做这三词初查；继续扩展覆盖评测与应用来源/许可展示设计。不要混淆 English 与 Simple English 版本，也不要未经大小检查就下载数 GB 全量数据。

## 5. 下一步如何接着做

按 [现有增量计划](../tasks/plan.md) 的 0.2b/0.2c → 1.6a → 1.6b 推进：

先处理同步断点：检查当前分支与 `git status`，网络恢复后读取远端分支，推送 `codex/wiktextract-reader`；确认无远端分歧且审查/验证仍适用后快进合并并推送 main。不要假定本轮已经在 GitHub，也不要覆盖他人的新提交。同步完成后删除此临时阻塞说明并更新快照。

1. **扩展 Wiktextract 固定样本评测。** 三词结构验证已完成，下一步复用 [100 项输入探针](../tests/golden/lexical-probes.json)，固定快照、记录缺失/被拒绝条目和许可溯源；不以“有中文字符串”代替义项验证。
2. **确定有限译词组的输出边界。** 基于现有读取器评估独立的有限查询契约；需要完整义项绑定的部分则补可审计映射。不得将未绑定译词组硬塞入 `WordAnalysis.zhDefinition`。本轮没有变更原 Task 1.6 验收。
3. **通过数据门槛后接入 Worker 和结果卡。** 先阅读下节代码；明确有限覆盖，不伪造全部标准义项。需要新增契约字段时同步 schema 生成及测试，再做桌面/移动浏览器 E2E。
4. **若数据仍不可用，记录具体阻塞与替代验证。** 不反复重做已完成的 FreeDict 结构评测；不为了展示结果而用模型编造词典事实。需要新的采购、发布决定或材料时说明所需用户行动。

这一顺序是下一步计划，不是已执行结果。有限样本成功不能直接勾选 Task 1.6 原有的 100 词条、来源及 UI 验收。

## 6. 按需代码导航

| 要改什么                       | 先读哪里                                                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 产品目标与模块边界             | [PRD](PRD.md)、[能力地图](CAPABILITY_MAP.md)、[技术设计](TECHNICAL_DESIGN.md)                                                                    |
| 结果结构、义项、错误与语言字段 | [results.ts](../packages/contracts/src/results.ts)、[learningRun.ts](../packages/contracts/src/learningRun.ts) 及同目录测试                      |
| 处理器接入与模式开关           | [processor.ts](../packages/runtime/src/processor.ts)、[settings.ts](../packages/runtime/src/settings.ts)、[Worker](../apps/worker/src/main.ts)   |
| 持久化、幂等、取消、重试和租约 | [repository.ts](../packages/runtime/src/repository.ts)、[queue.ts](../packages/runtime/src/queue.ts)、[状态机](../packages/runtime/src/state.ts) |
| API、匿名会话和 SSE            | [路由目录](../apps/web/app/api/v1/)、[server.ts](../apps/web/lib/server.ts)、[HTTP 校验](../packages/runtime/src/http.ts)                        |
| 用户界面与刷新恢复             | [composer.tsx](../apps/web/app/composer.tsx)、[page.tsx](../apps/web/app/page.tsx)、[幂等键](../apps/web/lib/request-key.ts)                     |
| 输入规范化与拆分               | [parseLearningInput.ts](../packages/content-intake/src/parseLearningInput.ts) 及同目录测试                                                       |
| 离线词典验证                   | [脚本目录](../scripts/lexical/)、[黄金集目录](../tests/golden/)                                                                                  |
| Wiktextract 离线读取与查词     | [wiktextract.ts](../packages/lexical-knowledge/src/wiktextract.ts) 及同目录合成测试；尚未被应用加载                                              |

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

- 基础链路：71 条 Vitest 单元测试、11 条真实 PostgreSQL/Redis 集成测试、lint/typecheck/build/契约漂移检查通过；人工浏览器验证过刷新、重试、取消和 Worker 重启恢复。
- FreeDict 增量：24 项独立 PowerShell 断言通过，固定文件重算报告一致；重新运行过 71 条单元测试、lint/typecheck/build/契约漂移检查。这 24 项不包含在 `pnpm test` 中。
- 没有自动化浏览器 E2E/CI、压力测试和完整生产验收；历史依赖审计结果不代表当前永远无漏洞。
- 2026-09-14 Wiktextract 增量：全仓 89 条单元测试（含新增 18 条）、契约漂移、lint/typecheck/build 通过；三词真实快照验证通过。数据库/队列和 UI 未改，未重跑集成/浏览器验收与依赖审计，不声称 Docker 当前健康。

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
