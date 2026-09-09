# English Teacher AI Agent 技术设计文档

| 字段 | 内容 |
|---|---|
| 状态 | Draft，待架构与安全评审 |
| 版本 | v0.1 |
| 日期 | 2026-09-09 |
| 对应需求 | [PRD v0.1](PRD.md) |

## 1. 设计目标

系统需要在不牺牲语言事实可靠性的前提下提供自然的 Agent 体验，并支持批量、可观测、可替换模型供应商。设计优先级依次为：正确性与可解释性、稳定契约、可靠批处理、可运营性、开发速度、未来扩展。

核心原则：

- 词典事实与生成式内容分离：词义、词性、词形以获批语言数据源为准；LLM 不充当事实数据库。
- 契约优先：请求、结果、错误、语言包、模型和语音接口先定义后实现。
- 模块化单体起步：一个仓库、清晰模块边界；Web/API 与 Worker 可独立部署，但暂不拆微服务。
- 异步任务统一单条与批量：单条是只有一个项目的批次，避免维护两套状态逻辑。
- 外部数据不可信：用户输入、模型响应、词典响应和插件清单都在边界校验。
- 能力发现而非硬编码：客户端根据 `/capabilities` 决定是否展示语音、语言或插件入口。

## 2. 技术栈与版本策略

### 2.1 推荐基线

| 层 | 选择 | 说明 |
|---|---|---|
| 运行时 | Node.js 24 LTS | 生产只使用仍受支持的 LTS 版本 |
| 包管理 | pnpm workspace | 单锁文件、严格依赖与 monorepo 支持 |
| 语言 | TypeScript strict | 前后端共享契约，禁止隐式 `any` |
| Web/BFF | Next.js 16.3.3+ 同一 LTS 安全补丁线 | 响应式 UI、路由和服务端边界；升级先过回归 |
| Worker | Node.js 独立进程 | 批量调度、模型/词典调用、重试与事件写入 |
| 数据库 | PostgreSQL 17+ | 任务状态、结果、反馈和版本化元数据 |
| 缓存/队列 | Redis 7.4+，配可靠队列库 | 缓存、限流、去重、任务队列；业务真相仍在 PostgreSQL |
| 契约 | OpenAPI 3.1 + JSON Schema + Zod | 文档、运行时校验与 TypeScript 类型同源生成 |
| 测试 | Vitest + Playwright + contract tests | 单元、集成、浏览器和供应商契约测试 |
| 可观测性 | OpenTelemetry | Trace、metrics、结构化日志统一关联 |

脚手架任务必须固定准确补丁版本并提交 lockfile。不得使用会自动漂移的 `latest` 作为生产模型或运行时依赖；安全补丁通过依赖机器人和 CI 回归升级。

### 2.2 为什么不先拆微服务

当前团队规模、流量和独立扩容需求未知。先拆微服务会提前引入分布式事务、跨服务契约、部署与追踪成本。模块化单体已经用 ports/adapters 隔离词典、LLM、语音和插件；只有当某模块出现独立扩容、独立数据主权或不同发布节奏时再拆分。

## 3. 系统上下文与组件

```text
Browser
  │ HTTPS / SSE
  ▼
Web + BFF (Next.js)
  ├─ Input validation / anonymous session / auth later
  ├─ Learning Runs API / capability discovery
  └─ Static UI + result cards + progress
          │
          ▼
Application Core
  ├─ Content Intake
  ├─ Batch Orchestrator
  ├─ Teaching Engine
  ├─ Lexical Knowledge
  ├─ Model Gateway
  ├─ Language Registry
  └─ Speech Port (disabled in MVP)
          │
          ├──────────────┬───────────────┐
          ▼              ▼               ▼
 PostgreSQL + Redis   Dictionary APIs   LLM Provider APIs
          │                              │
          └──────── Worker / Queue ──────┘
                         │
                         └─ TTS Provider APIs (Phase 2)
```

### 3.1 模块职责

- `content-intake`：Unicode 规范化、项目拆分、语言检测、项目类型与意图分类。不得生成教学结论。
- `lexical-knowledge`：聚合词典、形态规则和词族数据，输出带来源的事实。
- `model-gateway`：供应商 SDK 适配、结构化响应、超时、重试、熔断、路由和成本。
- `teaching-engine`：组合词典事实与模型能力，生成例句、解释和评分结果。
- `batch-orchestrator`：任务状态、并发、部分成功、取消、顺序和事件。
- `platform-runtime`：数据库、缓存、队列、会话、限流、日志和配置。
- `learning-experience`：输入框、拆分预览、流式进度和结果卡。
- `speech-platform`、`language-platform`、`ui-extension-platform`：见第 10–12 节。

## 4. 项目结构

```text
apps/
  web/                         Next.js UI、BFF route handlers、SSE
  worker/                      队列消费者和异步编排
packages/
  contracts/                   JSON Schema、OpenAPI、共享类型
  domain/                      纯领域模型和业务规则
  content-intake/              拆分、识别和规范化
  lexical-knowledge/           词典/形态端口和应用服务
  teaching-engine/             例句、评分、纠错、词形编排
  model-gateway/               LLM 端口、路由器和供应商适配器
  language-packs/
    english/                   英语分词、词性映射、评分量表
  speech/                      TTS/STT 端口及 disabled 适配器
  observability/               日志、指标、追踪和脱敏
tests/
  contract/                    API、模型、词典与事件契约
  fixtures/                    非敏感固定样例
  golden/                      版本化语言黄金数据集
  e2e/                         浏览器端到端流程
docs/                          PRD、技术设计、运行手册和 ADR
tasks/                         实施计划与任务清单
infra/                         本地容器与部署清单（后续）
```

依赖规则：`domain` 不依赖框架和供应商 SDK；适配器依赖端口，业务模块不反向依赖适配器；`apps/*` 只负责组合与传输。

## 5. 核心领域契约

以下为语义契约草案，最终由 `packages/contracts` 的 schema 生成类型和 OpenAPI。

```ts
type UiLocale = 'zh-CN' | string;
type LanguageCode = 'en' | string;
type LearningIntent = 'AUTO' | 'LOOKUP' | 'EXAMPLES' | 'REVIEW' | 'WORD_FORMS';
type InputKind = 'WORD' | 'SENTENCE' | 'INSTRUCTION' | 'UNKNOWN';

interface CreateLearningRunInput {
  rawText: string;                    // 1..5000 Unicode chars in MVP
  intent: LearningIntent;
  uiLocale: UiLocale;
  explanationLocale: UiLocale;
  targetLanguage: LanguageCode;
  preferences?: {
    cefrLevel?: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
    englishVariant?: 'AUTO' | 'UK' | 'US';
    exampleCount?: number;            // 1..10
    context?: string;                 // sanitized, bounded length
  };
}

interface LearningRun {
  runId: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'PARTIAL_SUCCESS' | 'FAILED' | 'CANCELLED';
  itemCount: number;
  completedCount: number;
  items: LearningItem[];              // original order
  createdAt: string;
  expiresAt?: string;
}

interface LearningItem {
  itemId: string;
  position: number;
  originalText: string;
  normalizedText: string;
  detectedKind: InputKind;
  detectedLanguage?: LanguageCode;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  result?: LearningResult;
  error?: PublicError;
}

type LearningResult =
  | { type: 'WORD_ANALYSIS'; data: WordAnalysis }
  | { type: 'SENTENCE_REVIEW'; data: SentenceReview }
  | { type: 'CLARIFICATION'; data: Clarification };
```

### 5.1 单词分析

```ts
interface WordAnalysis {
  headword: string;
  pronunciations: Pronunciation[];
  entries: LexicalEntry[];
  examples: ExampleSentence[];
  inflections?: WordForm[];
  derivations?: DerivedWord[];
  source: {
    provider: string;
    dictionaryVersion: string;
    retrievedAt: string;
    isCompleteForSource: boolean;
  };
  speakable: SpeakableContent[];
}

interface LexicalEntry {
  entryId: string;
  partOfSpeech: string;               // canonical UD-like code
  partOfSpeechLabel: string;          // localized display label
  grammarLabels: string[];
  senses: Array<{
    senseId: string;
    zhDefinition: string;
    enDefinition?: string;
    register?: string;
    domain?: string;
    frequencyBand?: string;
  }>;
}

interface ExampleSentence {
  exampleId: string;
  sentence: string;
  translation: string;
  senseId: string;
  cefrLevel?: string;
  highlightedRanges: Array<{ start: number; end: number }>;
  speakable: SpeakableContent;
}
```

### 5.2 句子评改

```ts
interface SentenceReview {
  original: string;
  totalScore: number;
  dimensions: {
    grammar: number;                  // 0..40
    vocabulary: number;               // 0..25
    naturalness: number;              // 0..20
    spellingAndPunctuation: number;   // 0..15
  };
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  assumptions: string[];
  issues: SentenceIssue[];
  minimalCorrection: string;
  naturalRewrite?: string;
  summary: string;
  speakable: SpeakableContent[];
  rubricVersion: string;
}

interface SentenceIssue {
  issueId: string;
  category: string;
  severity: 'ERROR' | 'WARNING' | 'STYLE';
  range: { start: number; end: number }; // Unicode code-point offset
  originalText: string;
  replacement?: string;
  explanation: string;
}
```

偏移必须采用 Unicode code point 语义，并有跨前后端契约测试，避免 emoji/组合字符导致高亮错位。

### 5.3 语音预留

```ts
interface SpeakableContent {
  contentId: string;
  text: string;
  language: LanguageCode;
  variant?: 'UK' | 'US';
  contentType: 'WORD' | 'EXAMPLE' | 'CORRECTION' | 'EXPLANATION';
  audio?: {
    status: 'NOT_ENABLED' | 'PENDING' | 'READY' | 'FAILED';
    url?: string;                     // short-lived signed URL
    expiresAt?: string;
  };
}
```

## 6. API 设计

API 前缀为 `/api/v1`。所有 JSON 错误采用同一结构；所有状态变更 POST 接受 `Idempotency-Key`。匿名会话使用 `HttpOnly`, `Secure`, `SameSite=Lax` Cookie，不能让前端自报用户 ID。

### 6.1 端点

| 方法 | 路径 | 用途 | 响应 |
|---|---|---|---|
| `POST` | `/api/v1/learning-runs` | 创建单条或批量学习任务 | `202 LearningRun` |
| `GET` | `/api/v1/learning-runs/{runId}` | 查询任务与结果 | `200 LearningRun` |
| `GET` | `/api/v1/learning-runs/{runId}/events` | SSE 订阅进度和逐项结果 | `200 text/event-stream` |
| `POST` | `/api/v1/learning-runs/{runId}/cancel` | 取消未开始项目 | `202 LearningRun` |
| `POST` | `/api/v1/learning-runs/{runId}/retries` | 只重试失败项目 | `202 LearningRun` |
| `POST` | `/api/v1/results/{resultId}/feedback` | 提交质量反馈 | `201 Feedback` |
| `GET` | `/api/v1/capabilities` | 客户端能力发现 | `200 CapabilityManifest` |
| `POST` | `/api/v1/speech-syntheses` | Phase 2 创建 TTS | `202 SpeechSynthesis` |

不把供应商模型 ID 暴露成客户端必填参数。管理员可以配置逻辑别名（如 `quality`, `balanced`, `fast`），路由器解析为经过批准的固定版本。

### 6.2 创建任务示例

```http
POST /api/v1/learning-runs
Idempotency-Key: 29f17bb2-3a7f-4ea6-835c-b8d53a59782c
Content-Type: application/json

{
  "rawText": "run\nHe go to school yesterday.",
  "intent": "AUTO",
  "uiLocale": "zh-CN",
  "explanationLocale": "zh-CN",
  "targetLanguage": "en",
  "preferences": { "cefrLevel": "B1", "englishVariant": "US" }
}
```

服务端先同步校验与拆分，再写入任务和队列，返回 `202`。幂等键与规范化请求哈希绑定；同一键不同请求体返回 `422 IDEMPOTENCY_KEY_REUSED`。处理中重复请求返回同一任务，不重复调用模型。

### 6.3 SSE 事件

```text
event: run.updated
data: {"runId":"lr_...","status":"RUNNING","completedCount":1,"itemCount":2}

event: item.completed
data: {"runId":"lr_...","item":{...}}

event: run.completed
data: {"runId":"lr_...","status":"SUCCEEDED"}
```

每个事件有单调递增 `id`，客户端用 `Last-Event-ID` 断线续传。SSE 只是通知通道，最终状态以 GET 资源为准。

### 6.4 统一错误

```ts
interface PublicError {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
    traceId: string;
  };
}
```

| HTTP | 场景 |
|---|---|
| 400 | JSON/请求格式错误 |
| 401/403 | 身份或权限错误 |
| 404 | 任务不存在或不属于当前会话 |
| 409 | 状态冲突，例如已取消任务再次取消 |
| 413 | 输入超过字符/项目限制 |
| 422 | 语义校验或幂等键重用 |
| 429 | 用户/租户限流 |
| 500 | 内部错误，不暴露供应商响应或密钥 |
| 503 | 依赖不可用且无可用降级 |

## 7. 处理流程

### 7.1 创建与拆分

1. BFF 验证会话、请求 schema、字符数和幂等键。
2. `content-intake` 做 NFKC 等安全规范化，但保留原文；识别项目边界、语言、类型和显式意图。
3. 在一个数据库事务中创建 run/items 与 outbox 事件。
4. Worker 通过 outbox/队列领取项目，原子更新 `PENDING → RUNNING`。
5. 每项完成后写结果、调用元数据与事件；聚合器计算 run 最终状态。

### 7.2 单词分析

1. 规范化词条并查询缓存。
2. 调用获批词典适配器，校验响应并映射为规范词性/义项。
3. 形态服务从词典和规则引擎生成屈折形式；词族只接受可验证条目。
4. 例句服务把允许的义项数据作为上下文传给模型，要求 schema 输出。
5. 执行语法、目标词存在性、义项引用和安全检查；失败则有界重试或降级模板例句。
6. 聚合为 `WordAnalysis`，保留来源与版本。

### 7.3 句子评改

1. 英语语言包分句、检测不可评分片段并构造代码点偏移。
2. 规则检查器先识别高置信度拼写、标点和部分语法问题。
3. 模型按固定量表返回结构化问题、维度分、最小修改和置信度。
4. 校验总分等于维度分之和、范围有效、替换后句子可构造、问题不重叠或有明确优先级。
5. 二次一致性检查验证修正句未改变核心含义；低置信度结果显示假设，不装作唯一答案。

### 7.4 批量状态机

```text
Run:  QUEUED → RUNNING → SUCCEEDED
                    ├→ PARTIAL_SUCCESS
                    ├→ FAILED
                    └→ CANCELLED

Item: PENDING → RUNNING → SUCCEEDED
                    ├→ FAILED → (retry creates linked new attempt)
                    └→ CANCELLED
```

- Worker 使用租约/心跳处理崩溃恢复；任务执行语义按“至少一次”设计，副作用必须幂等。
- 每批并发默认 4，全局/租户并发由动态配置控制。
- 取消是尽力而为：已发出的外部请求可能完成，但结果不得覆盖 `CANCELLED` 状态。
- 重试创建 attempt，不修改历史调用记录；指数退避加抖动，最多 2 次供应商重试与 1 次降级。

## 8. LLM 网关

### 8.1 端口

```ts
interface ModelGateway {
  generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<ModelResult<T>>;
  getCapabilities(): Promise<ModelCapability[]>;
}

interface StructuredGenerationRequest<T> {
  task: 'EXAMPLE_GENERATION' | 'SENTENCE_REVIEW' | 'INTENT_CLASSIFICATION';
  logicalModel: 'QUALITY' | 'BALANCED' | 'FAST';
  systemPolicyVersion: string;
  promptTemplateVersion: string;
  input: unknown;
  outputSchema: object;
  timeoutMs: number;
  maxOutputTokens: number;
  traceContext: { runId: string; itemId: string };
}
```

供应商适配器负责认证、参数和响应转换；网关统一处理超时、重试、限流、schema 校验、用量与错误映射。不得把供应商原始错误、系统提示或密钥返回客户端。

### 8.2 路由策略

能力注册表至少包含：供应商、固定模型 ID、区域、是否支持 JSON schema、最大上下文/输出、延迟档、成本档、生命周期和健康状态。

初始策略：

- 意图分类使用 `FAST`，规则可确定时不调用模型。
- 例句使用 `BALANCED`，复杂低频义项可升级 `QUALITY`。
- 句子评改默认 `QUALITY` 或经黄金集证明达标的 `BALANCED`。
- 供应商不可用时只降级到同任务已通过质量门槛的模型。

截至文档日期，候选供应商包括 OpenAI、Anthropic、Google Gemini 和 DeepSeek；实际接入顺序由部署地区、合规、质量、价格和可用性 Spike 决定，不由“热门”标签决定。

### 8.3 候选模型快照（2026-09-09）

下表用于阶段 0 建立评测矩阵，不代表最终采购或默认路由。生产配置只使用通过黄金集且在目标地区可用的固定/稳定 ID；Preview 型号仅做实验。

| 供应商 | 高质量候选 | 均衡/高吞吐候选 | 备注 |
|---|---|---|---|
| OpenAI | `gpt-5.6-sol` | `gpt-5.6-terra`, `gpt-5.6-luna` | 通过 Responses API/官方 SDK 适配 |
| Anthropic | `claude-fable-5-1`, `claude-opus-5` | `claude-sonnet-5`, `claude-haiku-4-5-20251001` | 使用固定模型 ID，并监控退役公告 |
| Google | `gemini-3.1-pro-preview` | `gemini-3.7-flash`, `gemini-3.6-flash` | Pro 为 Preview，不应在未评测时作为生产默认 |
| DeepSeek | `deepseek-v4-pro` | `deepseek-v4-flash` | 官方提供 OpenAI/Anthropic 兼容格式，但仍需独立契约校验 |

型号会变化，系统必须定期从官方 Models API/文档同步生命周期元数据并由人工批准升级，不能自动把生产别名切到最新权重。

### 8.4 提示词与注入防护

- 系统策略、评分量表、模板和用户数据分别传递；用户内容包裹为不可执行数据字段。
- 不允许用户文本改写评分权重、输出 schema、工具权限或泄露系统提示。
- 提示词存版本和哈希；日志默认只记录版本、token 与脱敏摘要，不全量保存用户正文。
- 外部词典文本同样视为不可信内容，只通过白名单字段进入模型上下文。

## 9. 词典与语言数据

### 9.1 数据源选择门槛

上线前必须确认：

- 允许商业/目标场景使用，明确缓存、再分发、展示和衍生数据权利。
- 提供中英释义、词性、义项边界、形态/词族、发音数据与版本标识中的必要集合。
- 有稳定 API 或可版本化数据包、SLA/更新策略和删除/更正机制。
- 能建立测试快照，供应商变更不会无声改变线上结果。

### 9.2 规范化

- 内部词性使用受控枚举，并保留供应商原标签。
- 每个义项生成稳定内部 `senseId`，由供应商、版本和源 ID 派生，不能用显示顺序作为 ID。
- 多词典合并属于 P1；MVP 选一个权威基准，避免无规则拼接产生重复/冲突。

## 10. 语音系统准备

MVP 实现 `SpeechProvider` 端口、`DisabledSpeechProvider`、能力发现、`SpeakableContent` 和 UI 播放槽位，不发真实请求。

```ts
interface SpeechProvider {
  synthesize(input: {
    text: string;
    language: LanguageCode;
    variant?: string;
    voiceId: string;
    speed: number;
    format: 'mp3' | 'opus';
  }): Promise<{ audio: Uint8Array; durationMs: number; providerVersion: string }>;
}
```

Phase 2 要求：

- 对比传统 TTS 与实时多模态语音供应商，单词精确朗读优先可控性和发音一致性。
- 音频写对象存储，通过短期签名 URL 返回；数据库只存元数据。
- 缓存键包含文本规范化结果、语言、变体、音色、语速、格式、供应商和版本。
- 限制文本长度并分段，自动重试供应商偶发失败；做英美音、重音和同形异音词人工测试。
- 若加入 STT/发音评分，另建 `TranscriptionProvider`/`PronunciationAssessmentProvider`，并在录音前取得明确同意。

## 11. 多语言架构

```ts
interface LanguagePack {
  targetLanguage: LanguageCode;
  supportedExplanationLocales: UiLocale[];
  segment(input: string): Segment[];
  classify(segment: Segment): InputKind;
  normalizeLexeme(input: string): string;
  mapPartOfSpeech(sourceTag: string): string;
  getScoringRubric(): ScoringRubric;
  validateResult(result: LearningResult): ValidationIssue[];
  speechCapabilities: SpeechCapability[];
}
```

- UI 文案通过 i18n 资源加载，与教学语言包分开发布。
- 不假定所有语言有空格、时态、比较级或与英语相同的词性。
- 核心结果使用通用字段 + `languageSpecific` 扩展，新增字段优先可选，避免破坏客户端。
- 第二种语言应选结构差异较大的语言来验证边界；上线必须经过母语专家和独立黄金集。

## 12. 界面插件架构

MVP 只建立设计令牌、稳定槽位 ID 和能力清单，不加载第三方代码。Phase 4 先支持声明式插件：

```json
{
  "schemaVersion": 1,
  "id": "com.example.focus-theme",
  "version": "1.0.0",
  "host": { "minVersion": "1.0.0", "maxVersionExclusive": "2.0.0" },
  "permissions": ["theme:write"],
  "contributes": {
    "themeTokens": { "color.accent": "#3157d5" },
    "slots": []
  }
}
```

安全边界：

- 优先 JSON 声明式扩展；需要代码执行时放在 sandboxed iframe/独立进程，以消息 schema 通信。
- 默认无权限，逐项授权；插件不能访问 Cookie、模型密钥、原始录音或其他插件存储。
- 清单做 schema、签名/来源和兼容性验证；资源受 CSP 和域名白名单限制。
- 插件故障可熔断，用户一键禁用并恢复默认 UI；宿主保留槽位弃用周期。

## 13. 数据模型

主要表（字段为方向性设计）：

| 表 | 关键字段 | 保留说明 |
|---|---|---|
| `learning_runs` | id, owner/session, status, locales, intent, request_hash, counts, timestamps | 匿名短期；登录用户按政策 |
| `learning_items` | id, run_id, position, original/normalized text, kind, status | 与 run 同生命周期 |
| `learning_results` | item_id, result_type, schema_version, result_json, source_versions | 支持 schema 迁移 |
| `processing_attempts` | item_id, attempt, provider, model_id, prompt_version, latency, token/cost, outcome | 正文脱敏；运营保留 |
| `idempotency_records` | owner, key, request_hash, run_id, state, expires_at | TTL 长于客户端最大重试期 |
| `outbox_events` | aggregate_id, event_type, payload, published_at | 可靠投递后清理/归档 |
| `feedback` | result_id, category, rating, comment, created_at | 限制自由文本和权限 |
| `speech_assets` | content_hash, voice/config/version, object_key, duration, expires_at | Phase 2 |

用户正文是否持久化、保留多久必须由隐私决策确认。默认建议匿名数据 7 天自动删除，诊断日志不保存全文；这只是提案，不是已接受政策。

## 14. 缓存策略

- 词典：按 `provider + dictionaryVersion + normalizedHeadword + locale` 缓存，可长 TTL；版本变更自然失效。
- 例句：默认不跨用户长期缓存，只有无个性化且经审核的模板例句可共享。
- 句子评改：包含用户文本，不放公共缓存；可在同一幂等请求内复用。
- TTS：按内容哈希和完整音频配置缓存；遵循供应商许可与删除策略。
- 缓存不是事实来源，miss/失效不会导致数据丢失。

## 15. 安全与隐私

- 在 API、供应商响应、插件和配置边界做 schema 校验；限制对象深度、数组长度和输出大小。
- 限流维度：IP、匿名会话/用户、租户、端点、批次和供应商预算。
- 密钥来自托管 secret manager，定期轮换；禁止 `.env`、前端 bundle、异常和 trace 泄露。
- 用户内容、模型输出和词典 HTML 在渲染前按类型处理；富文本采用白名单，不直接插入原始 HTML。
- 管理员后台独立授权与审计；数据导出和删除必须验证所有权。
- 插件启用前做威胁建模；语音输入上线前做录音同意、数据驻留和未成年人专项评审。

## 16. 可观测性与运行

### 16.1 Trace

一次 run 建根 span，每个 item、词典调用、模型调用、校验、队列等待为子 span。日志只用 `runId/itemId/traceId` 关联，不把原始文本作为 label。

### 16.2 指标

- RED：每端点/Worker 的请求率、错误率、耗时。
- 队列：深度、最老任务年龄、租约超时、重试/死信数。
- 质量：schema 校验失败、降级率、反馈问题率、黄金集回归。
- 成本：每任务 token、缓存命中、供应商/逻辑模型成本、预算拒绝数。

### 16.3 告警

- 5 分钟窗口任务失败率或 P95 延迟超阈。
- 队列最老任务超过 SLO。
- 供应商限流/认证失败突增。
- 结构化输出校验失败率相对基线上升。
- 每小时成本异常、词典版本意外变化或删除作业失败。

## 17. 测试与评测

### 17.1 测试层级

| 层级 | 重点 |
|---|---|
| 单元 | 拆分、规范化、评分求和、状态机、词性映射、缓存键 |
| 属性测试 | Unicode、随机空白/标点、20 项顺序、偏移范围、幂等性 |
| 集成 | PostgreSQL/Redis、outbox、Worker 重试、取消和恢复 |
| 契约 | OpenAPI、SSE、词典响应、各 LLM structured output、TTS disabled |
| E2E | 查词、例句、纠错、词形、混合批量、失败重试、移动端 |
| 离线评测 | 黄金集准确率、误报、覆盖率、一致性、成本和延迟 |
| 安全 | 提示注入、XSS、越权、限流、敏感信息泄露、插件清单攻击 |

### 17.2 黄金数据集

初始不少于 300 个可独立评分案例：

- 100 个词条：多词性、多义、不规则、同形异义、未收录与拼写错误。
- 120 个句子：正确句、单一错误、多重错误、语境歧义、风格而非错误。
- 50 个词形/词族：规则、不规则、不可转换和罕见形式。
- 30 个批量/解析：混合、编号、引号、Unicode、超限与部分失败。

每条包含期望事实、允许答案集合、禁止错误和严重度。模型升级时比较质量、延迟和成本；任何 P0 指标回退都阻止上线。

### 17.3 覆盖率与门槛

- 领域纯函数行覆盖率 ≥ 90%，关键状态机分支覆盖率 100%。
- API/适配器总行覆盖率 ≥ 80%；更重要的是关键契约与失败路径全覆盖。
- 所有 PR 必须通过 lint、typecheck、unit/integration、contract；E2E 至少覆盖核心烟雾流程。

## 18. CI/CD 与环境

- 环境：local、test、staging、production；模型/词典凭据和数据隔离。
- CI 顺序：依赖审计 → lint/typecheck → unit → integration/contract → build → E2E smoke → golden eval（影响提示词/模型/语言逻辑时）。
- 数据库迁移采用 expand/contract，发布前备份并提供向前修复方案；不做破坏性自动回滚。
- 提示词、量表、语言包和模型路由都以版本化配置发布，支持灰度与快速回退。

## 19. 编码规范与边界

### 19.1 示例

```ts
export async function reviewSentence(
  command: ReviewSentenceCommand,
  dependencies: ReviewSentenceDependencies,
): Promise<SentenceReview> {
  const lexicalHints = await dependencies.lexicalKnowledge.findRelevantHints(command.text);
  const review = await dependencies.modelGateway.generateStructured({
    task: 'SENTENCE_REVIEW',
    logicalModel: 'QUALITY',
    input: { text: command.text, lexicalHints, rubric: command.rubric },
    outputSchema: sentenceReviewSchema,
    timeoutMs: 10_000,
    maxOutputTokens: 2_000,
    systemPolicyVersion: command.systemPolicyVersion,
    promptTemplateVersion: command.promptTemplateVersion,
    traceContext: command.traceContext,
  });

  return validateAndNormalizeReview(review.value, command.text);
}
```

- 文件/变量 camelCase，类型/类 PascalCase，常量 UPPER_SNAKE_CASE。
- 领域函数显式依赖，不读取全局环境变量；配置只在 composition root 加载并校验。
- 预期业务失败用类型化错误；禁止吞异常或向客户端透传未知错误。
- 注释解释“为什么”，不复述代码。

### 19.2 开发边界

始终执行：输入/外部响应校验、测试、脱敏、版本化契约、依赖锁定。

需先评审：数据库破坏性变更、新供应商/依赖、评分权重变化、数据保留变化、开放插件权限、模型自动升级。

禁止：提交密钥、把原始用户文本作为 metrics label、让 LLM 直接写数据库、绕过词典生成“完整义项”、未经评测切换生产模型、删除失败测试来通过 CI。

## 20. 关键风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| LLM 漏错、误报或评分漂移 | 高 | 固定量表、结构化输出、规则交叉验证、黄金集、版本固定与回滚 |
| 词典授权/覆盖不足 | 高 | 阶段 0 先完成授权 Spike；明确定义“全部”的边界与来源 |
| 批量导致成本和延迟失控 | 高 | 上限、并发控制、缓存、预算、渐进返回和可取消 |
| 供应商停服/模型退役 | 高 | 多适配器、能力注册、健康路由、退役巡检和替换评测 |
| 中文解释正确但不适合水平 | 中 | CEFR 偏好、可理解性评测、用户反馈与再生成 |
| 提示注入/输出 XSS | 高 | 数据/指令隔离、schema 校验、白名单渲染、CSP |
| 语音同形异音或口音错误 | 中 | 传入词性/上下文、供应商对比、人工发音集、允许变体 |
| 多语言抽象过度英语化 | 高 | 明确 language pack 接口，用结构差异大的第二语言验证 |
| 插件越权或破坏界面 | 高 | 声明式优先、最小权限、沙箱、签名、故障隔离与兼容周期 |

## 21. 外部资料与版本依据

- [Node.js 官方发布周期](https://nodejs.org/en/about/previous-releases)
- [Next.js 2026 年 8 月安全发布](https://nextjs.org/blog)
- [OpenAI 模型目录](https://platform.openai.com/docs/models)
- [Anthropic Claude 模型概览](https://platform.claude.com/docs/en/models/overview)
- [Anthropic 模型 ID 与版本策略](https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions)
- [Google Gemini 模型目录](https://ai.google.dev/gemini-api/docs/models)
- [Google Gemini TTS](https://ai.google.dev/gemini-api/docs/speech-generation)
- [DeepSeek 模型与 API](https://api-docs.deepseek.com/quick_start/pricing)
