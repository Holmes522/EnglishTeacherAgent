# English Teacher AI Agent

面向中文学习者的英语教师 AI Agent。产品以“可靠的语言事实 + 可解释的教学反馈”为核心，支持单词释义、例句、词形/词族、英文句子纠错评分，以及一次输入多条内容的批量处理。

## 当前状态

已完成基础链路 Checkpoint A：浏览器提交 → PostgreSQL/outbox → BullMQ Worker → SSE 进度，支持会话隔离、刷新恢复、取消和失败项重试。当前为明确标注的 fixture 演示，不包含真实释义或评分。产品文档仍为 `v0.1 Draft`；商业词典、真实模型接入、数据驻留与发布范围仍需评审。

## 文档导航

- [AI Agent 接手指南](docs/AGENT_HANDOFF.md)：当前研发断点、已确认决策、代码导航、验证与下一步；Agent 从根目录 [AGENTS.md](AGENTS.md) 开始
- [能力地图](docs/CAPABILITY_MAP.md)：模块边界、依赖方向和建议建设顺序
- [产品需求文档（PRD）](docs/PRD.md)：用户、范围、功能、验收、指标与分期
- [技术设计文档](docs/TECHNICAL_DESIGN.md)：架构、数据契约、API、模型/语音/多语言/插件预留与测试方案
- [实施计划](tasks/plan.md)：里程碑、依赖、风险与检查点
- [开发任务清单](tasks/todo.md)：可执行任务、验收和验证方式
- [实施状态](docs/IMPLEMENTATION_STATUS.md)：已完成能力、验证证据、当前假设和外部阻塞
- [本地开发与排障](docs/LOCAL_DEVELOPMENT.md)：Docker、数据库迁移、演示场景和集成测试
- [开源词库实测](docs/evaluations/FREEDICT_REVIEW.md)：FreeDict 的 100 项覆盖率、字段限制与复现命令
- [Wiktextract 读取切片](docs/evaluations/WIKTEXTRACT_REVIEW.md)：三词真实样本、离线读取包与未绑定译词组边界
- [架构决策记录](docs/decisions/)：关键方案的背景、取舍和后果

## 技术栈

Node.js 24 LTS、pnpm workspace、TypeScript、Next.js 16、React 19、Vitest、Zod 4、PostgreSQL 17、Redis 7 和 BullMQ 6。后续接入获批的词典、LLM 和语音供应商适配器。

## 快速开始

先启动 Docker Desktop（Linux containers），在 PowerShell 执行；已有 `.env` 时合并配置，不要覆盖：

```powershell
corepack enable
pnpm install --frozen-lockfile
Copy-Item .env.example .env
pnpm infra:up
pnpm build:packages
pnpm db:migrate
pnpm dev
```

生产基线为 Node.js 24；`.nvmrc` 固定 LTS 补丁版本。本轮本机验证使用 Node 22.20.0，完整验证边界见实施状态。

## 命令

| 命令                                | 用途                           |
| ----------------------------------- | ------------------------------ |
| `pnpm install --frozen-lockfile`    | 安装锁定依赖                   |
| `pnpm dev`                          | 启动本地开发环境               |
| `pnpm lint`                         | 静态检查                       |
| `pnpm typecheck`                    | TypeScript 类型检查            |
| `pnpm test`                         | 单元测试与生成契约漂移检查     |
| `pnpm test:integration`             | 真实 PostgreSQL/Redis 集成测试 |
| `pnpm infra:up` / `pnpm infra:down` | 启停本地容器，保留数据卷       |
| `pnpm db:migrate`                   | 执行数据库迁移                 |
| `pnpm build`                        | 生产构建                       |

## 当前模块

- `apps/web`：Next.js Web/BFF、任务表单、SSE 进度与会话隔离 API。
- `apps/worker`：BullMQ 消费、outbox 发布、租约恢复与到期清理。
- `packages/runtime`：数据库迁移、事务 repository、状态机、队列与 fixture 处理器。
- `packages/contracts`：Zod 运行时契约及同源生成的 JSON Schema/OpenAPI。
- `packages/content-intake`：Unicode 规范化、批量拆分、类型和显式意图识别。
- `packages/lexical-knowledge`：小型 Wiktextract JSONL 快照的离线校验与查询，尚未接入 Web/Worker。
- `packages/config`：启动环境变量校验。
- `packages/speech`：供应商无关端口与 `NOT_ENABLED` 实现。

## 评审门槛

进入真实教学和生产发布前需要确认：目标用户年龄段、首发地区与合规要求、首个双语词典的数据授权、首批模型供应商、预算/延迟目标，以及是否首版就需要账号体系。当前本地基础设施方案已获确认，见 ADR-005。
