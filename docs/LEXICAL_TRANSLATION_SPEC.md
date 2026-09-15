# 有限译词查询：契约规格

状态：首个契约增量已获用户确认并实现；2026-09-15。实施基线：`554eebc`，加本文件同次提交的代码。归属 lexical-knowledge 模块，承接 Task 0.2 / 1.6；不修改原任务验收标准，不代表真实查词已交付。

## 1. 目标与实施假设

为未来结果卡提供独立、可追溯的“中文译词组”结构，明确区别于 `WordAnalysis` 的完整释义。首个编码增量只新增共享契约及合成测试，不接通 Worker、API、数据库或 UI，不发布真实词库内容。

沿用用户已确认的开源优先、允许覆盖缩小路线。默认不做词形回跳、拼写修正、义项推断或简繁转换；保留源限定信息。规格确认只批准该契约增量，不等于选定数据源、批准生产展示或法律结论。

依据：[100 项结构评测](evaluations/WIKTEXTRACT_COVERAGE.md)已有 71/97 译词命中；所有译词组与完整义项的绑定仍未知。现有 `WordAnalysis` 不适合承载该数据，不能把译词填入 `zhDefinition`。

## 2. 边界与兼容性

- 新增独立 `LexicalTranslationResult`，顶层 `schemaVersion: 1`、`type: LEXICAL_TRANSLATION`，业务内容置于 `data`。
- 首个增量不将它加入现有 `LearningResult` union；否则 API 会先宣称能返回尚未被 Worker/UI 支持的类型。OpenAPI 只新增独立 component，不新增路径或现有响应变体。
- 不改变 `WordAnalysis`、fixture/disabled、任务状态、语言配置或任何现有响应。未来接入时再一起更新 union、消费者和端到端测试。
- 这是一个小切片的契约，不搭建通用词典插件、授权引擎或网络 provider。

## 3. 字段与不变量

`data` 固定 `targetLanguage: en`、`coverage: SNAPSHOT_ONLY`、`isCompleteForSource: false`；`query` 为非空、非纯空白字符串，最多 200 个 UTF-16 code units，与现有读取器一致。保留输入，不以契约解析隐式纠正拼写。

| 状态 `data.status`       | `entries` 约束                 | 产品含义                                 |
| ------------------------ | ------------------------------ | ---------------------------------------- |
| `FOUND`                  | 1–100 条，至少一条含非空译词组 | 当前快照有中文译词，不代表完整释义       |
| `NO_CHINESE_TRANSLATION` | 1–100 条，全部译词组为空       | 有英文词头，无可用中文译词               |
| `NOT_FOUND_IN_SNAPSHOT`  | 必须为空                       | 仅当前快照未收录，不能断言整个词典不存在 |

网络失败、字节摘要不符、无效格式和未启用不是上述三种成功查询状态；未来适配器须走失败通道，接入应用时沿用 `PublicError`。不能把 HTTP 404、解析失败或未查询输入转为 `NOT_FOUND_IN_SNAPSHOT`。

每条 entry：

- `headword`：非空非空白，最多 200；`partOfSpeech`：非空非空白，最多 50，保留源词性代码，不生成中文解释。
- `snapshotLine`：正整数，表示 JSONL 物理行号，不是源 entry ID。相同词头的 entry 不覆盖；结果内行号唯一。文件有空行，因此不把物理行号上限错误限定为 100。
- `incompleteTranslationCount`：0–10,000 的整数，沿用读取器“所有语言缺失记录”的口径，不代表中文错译数。
- `translationGroups`：0–10,000 组，每组 `label` 为 null 或非空非空白字符串（最多 4,000）；`senseBinding` 只能为 `UNRESOLVED`。不暴露猜测出来的 sense ID，也不复制无关联的 gloss 作为释义。
- 每组 `translations` 至少 1 条；每个 entry 跨组最多 10,000 条。每条 `text` 非空非空白且最多 4,000，`languageCode` 为 `zh` 或 `cmn`。
- 保留可选 `languageName`、`romanization`、`alternative`、`note`，各最多 4,000；保留必填 `tags`、`topics` 数组，各最多 100 项、每项最多 4,000。无源值时适配器输出空数组，不伪造标签；可选值缺省时不输出。

字符串数值上限参考读取器，但按本规格的 UTF-16 口径执行，不在契约层静默截断正文。实施时实测锁定 Zod 4.5.4 的 `.max(1)` 接受单个 emoji，按码点而非 UTF-16 计数；新契约补充 `value.length` refinement，并以代理对边界测试固定要求。该约束可能比原始读取器对部分字段更严，未来适配器遇到超限必须显式失败。数量上限不等于将来 SSE/页面的载荷预算；应用接入前还须单独限制序列化体积。

## 4. 来源与许可元数据

`data.source` 在三个状态下均必填，描述被实际查询的那一份快照：

| 字段               | 含义与校验                                                                    |
| ------------------ | ----------------------------------------------------------------------------- |
| `provider`         | 固定 `KAIKKI_WIKTEXTRACT`，本切片不声称支持其他 provider                      |
| `snapshotSha256`   | 64 位小写十六进制；必须来自同一份已验证字节                                   |
| `retrievedAt`      | ISO UTC 时间；下载时间，不是查询时间或上游修订时间                            |
| `downloadUrl`      | 已审查快照的公开 HTTPS 下载 URL                                               |
| `upstreamPageUrl`  | 对应 Wiktionary 来源页链接；可变页面不冒充不可变修订                          |
| `upstreamRevision` | 非空字符串（最多 200）或 null；未知必须 null，不以摘要或 senseid 替代         |
| `attribution`      | 非空署名文本，最多 2,000；保留来源贡献者与提取来源说明                        |
| `license`          | 非空 `name`（最多 100）及公开 HTTPS `url`；表示记录的许可，不是授权判断       |
| `changes`          | 1–20 条非空说明，每条最多 1,000，记载提取、中文过滤、分组和字段改名等实际变化 |

所有 URL 最多 2,000，只接受 HTTPS 且不带用户名/密码；UI 后续按文本渲染，不能执行源 HTML/Markdown。契约只验证格式；未来可信来源清单还必须验证主机、路径、快照与页的关联，禁止直接信任调用方提交的“已授权”元数据。本轮不实现网络抓取或链接跳转。

技术上能通过 schema 不等于可展示：应用启用前，需要独立记录所选快照的审查证据、署名/许可文案、既有版权与修改声明、第三方内容排除、衍生数据分发方式，以及结果、事件、缓存与备份的保存边界。首个契约增量仅使用合成数据测试，不在响应添加无依据的 `commercialUseAllowed` 或 `approved` 布尔值。

2026-09-15 核对的来源依据：

- [Creative Commons CC BY-SA 4.0 摘要](https://creativecommons.org/licenses/by-sa/4.0/)列出署名、许可链接、修改标记及相同方式共享等条件，并提示摘要不能替代完整条款；这里只据此制定待核对清单，不作具体数据授权结论。
- [Wiktionary 版权页面](https://en.wiktionary.org/wiki/Wiktionary:Copyrights)说明词条文本许可与第三方引用/媒体例外；页面自身标为草案，不能单独作为所有记录的授权证明。
- [Kaikki 原始数据入口](https://kaikki.org/dictionary/rawdata.html)区分原始与后处理数据；本切片继续使用已评测 raw JSONL，不切换数据集或重复下载百项探针。

## 5. 实施位置、风格与验证

沿用 pnpm workspace、TypeScript、Zod 4.5.4 和 Vitest；版本以 lockfile 为准，不新增依赖。首个增量主要文件：新增 `packages/contracts/src/lexicalTranslation.ts` 及同目录测试，修改现有 `index.ts`、`generatedContracts.ts` 与生成契约测试；生成 JSON/OpenAPI 由命令产出，禁止手改。

命名、导入及校验沿用同包模式，例如 `export type LexicalTranslationResult = z.infer<typeof lexicalTranslationResultSchema>;`，相对 ESM 导入使用 `.js`。跨字段不变量用既有 `superRefine` 模式；生成 JSON Schema 不能表达的关系需在文档说明并由运行时测试保证。

规格确认后的编码顺序：失败测试 → 最小 schema/类型 → 导出与生成 → 全仓验证 → 复审 → 随接手文档提交。验证命令：

```powershell
pnpm exec vitest run packages/contracts/src/lexicalTranslation.test.ts
pnpm --filter @english-teacher/contracts generate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

验收：三种状态正常样例通过；状态与译词矛盾、空白、越界、重复行号、缺失来源、非法摘要/时间/URL、伪造完整性或已绑定状态均拒绝；合成源限定标签保留；新增 schema 出现在生成产物，旧 API 响应及 LearningResult 变体不变，契约漂移检查通过。

始终：先测失败、保留来源不确定性、更新交接资料。先询问：额外依赖、数据库迁移、真实数据发布和采购。禁止：提交凭据/未经审查正文、硬配义项、降低 Task 1.6 原验收或把草案标为已实现。

## 6. 实施证据与后续

用户已确认本规格与首个编码范围，无需再次确认同一契约。已交付 [schema](../packages/contracts/src/lexicalTranslation.ts)、[合成测试](../packages/contracts/src/lexicalTranslation.test.ts)、导出及 JSON Schema/OpenAPI component；56 项定向测试、全仓 154 项测试及契约漂移、lint/typecheck/build 通过，独立复审无 Required。与基线生成产物逐项比较：除新增 component 外，所有旧 schema 和 API 路径完全一致。

官方实现依据：[Zod URL 校验](https://zod.dev/api#urls)、[refinement](https://zod.dev/api#superrefine)、[JSON Schema 生成](https://zod.dev/json-schema)。沿用项目锁定版本，无依赖升级。生成的 JSON Schema 不完整表达状态与 entries 的关系、行号唯一、跨组总量、URL 凭据限制和 UTF-16 refinement；消费端必须使用运行时 schema 校验，不能把单独 JSON Schema 通过当作所有不变量通过。

本轮不重跑真实词库采集、数据库/队列集成、浏览器验收和依赖审计：没有对应行为或依赖变更。Node 22.20.0 本机验证不代表 Node 24 生产验收。下一步是有限快照来源清单与离线结果适配器，先用合成数据验证映射、来源关联和明确失败；真实数据切片批准、Worker/UI 接入仍需各自门槛。原 Task 0.2 / 1.6 保持未完成。
