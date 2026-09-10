# English Teacher AI Agent

面向中文学习者的英语教师 AI Agent。产品以“可靠的语言事实 + 可解释的教学反馈”为核心，支持单词释义、例句、词形/词族、英文句子纠错评分，以及一次输入多条内容的批量处理。

## 当前状态

项目已进入基础开发阶段。当前功能分支已完成 monorepo 与质量命令、核心运行时/JSON Schema/OpenAPI 契约、混合输入解析、禁用型语音端口和能力发现 API。产品文档仍为 `v0.1 Draft`；商业词典、真实模型接入、数据驻留与发布范围仍需评审后才能实施。

## 文档导航

- [能力地图](docs/CAPABILITY_MAP.md)：模块边界、依赖方向和建议建设顺序
- [产品需求文档（PRD）](docs/PRD.md)：用户、范围、功能、验收、指标与分期
- [技术设计文档](docs/TECHNICAL_DESIGN.md)：架构、数据契约、API、模型/语音/多语言/插件预留与测试方案
- [实施计划](tasks/plan.md)：里程碑、依赖、风险与检查点
- [开发任务清单](tasks/todo.md)：可执行任务、验收和验证方式
- [实施状态](docs/IMPLEMENTATION_STATUS.md)：已完成能力、验证证据、当前假设和外部阻塞
- [架构决策记录](docs/decisions/)：关键方案的背景、取舍和后果

## 技术栈

Node.js 24 LTS、pnpm workspace、TypeScript、Next.js 16、React 19、Vitest 和 Zod 4。后续按文档加入 PostgreSQL、Redis/任务队列，以及可替换的词典、LLM 和语音供应商适配器。

## 快速开始

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

生产基线为 Node.js 24；`.nvmrc` 固定了已验证的 LTS 补丁版本。

## 命令

| 命令 | 用途 |
|---|---|
| `pnpm install --frozen-lockfile` | 安装锁定依赖 |
| `pnpm dev` | 启动本地开发环境 |
| `pnpm lint` | 静态检查 |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm test` | 单元与集成测试 |
| `pnpm test:e2e` | 端到端测试 |
| `pnpm build` | 生产构建 |

## 当前模块

- `apps/web`：Next.js Web/BFF 与 `/api/v1/capabilities`。
- `apps/worker`：异步 Worker 进程入口，尚未连接队列。
- `packages/contracts`：Zod 运行时契约及同源生成的 JSON Schema/OpenAPI。
- `packages/content-intake`：Unicode 规范化、批量拆分、类型和显式意图识别。
- `packages/config`：启动环境变量校验。
- `packages/speech`：供应商无关端口与 `NOT_ENABLED` 实现。

## 评审门槛

开始编码前需要确认：目标用户年龄段、首发地区与合规要求、首个双语词典的数据授权、首批模型供应商、预算/延迟目标，以及是否首版就需要账号体系。
