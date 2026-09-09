# 能力地图：English Teacher AI Agent

- 状态：Draft，待产品/技术评审
- 版本：v0.1
- 日期：2026-09-09

## 模块边界

| 模块 ID | 职责 | 依赖 |
|---|---|---|
| `learning-contracts` | 语言、请求项、结果、评分和错误的稳定数据契约 | — |
| `content-intake` | 输入规范化、语言识别、单词/句子/批量项目拆分、意图识别 | `learning-contracts` |
| `lexical-knowledge` | 双语释义、词性、音标、词形变化、派生词族及词典证据 | `learning-contracts` |
| `model-gateway` | 多家大模型接入、能力注册、路由、重试、降级、成本统计 | `learning-contracts` |
| `teaching-engine` | 例句生成、句子评分纠错、解释策略和输出结构化 | `lexical-knowledge`, `model-gateway`, `content-intake` |
| `batch-orchestrator` | 多项目并发、顺序保持、部分成功、取消、进度与结果聚合 | `teaching-engine` |
| `learning-experience` | Web 对话界面、结果卡片、批量进度、复制/反馈与无障碍体验 | `batch-orchestrator` |
| `platform-runtime` | 会话、存储、缓存、限流、审计、可观测性和配置 | `learning-contracts` |
| `speech-platform` | TTS/STT 抽象、播放元数据、音频缓存；首版只完成接口准备 | `learning-contracts`, `platform-runtime` |
| `language-platform` | UI 国际化与“被学语言”的语言包/规则包扩展 | `learning-contracts`, `lexical-knowledge`, `teaching-engine` |
| `ui-extension-platform` | 主题令牌、组件槽位、插件清单、权限和沙箱；后续阶段实现 | `learning-experience`, `platform-runtime` |
| `quality-and-operations` | 黄金数据集、模型评测、质量看板、成本/延迟告警与回归门槛 | `teaching-engine`, `platform-runtime` |

## 依赖方向

```text
learning-contracts
  ├─ content-intake
  ├─ lexical-knowledge ─┐
  ├─ model-gateway ─────┼─ teaching-engine ─ batch-orchestrator ─ learning-experience
  └─ platform-runtime ──┘           │                                 │
         ├─ speech-platform         ├─ language-platform              └─ ui-extension-platform
         └──────────────────────────┴─ quality-and-operations
```

## 建议建设顺序

1. `learning-contracts` → `content-intake` → `platform-runtime`
2. `lexical-knowledge` 与 `model-gateway` 可并行
3. `teaching-engine` → `batch-orchestrator` → `learning-experience`
4. `quality-and-operations` 从第一阶段同步建设，而不是上线后补做
5. `speech-platform` 的接口在 MVP 中预留，完整能力在第二阶段实现
6. `language-platform` 在第三阶段增加第二种被学语言进行验证
7. `ui-extension-platform` 在核心体验稳定后进入第四阶段

## 边界说明

- “所有中文意思”定义为：指定且有授权的词典版本中，该词条的全部标准义项；不承诺覆盖所有历史、方言、极罕见或无限扩展的专业用法。
- `lexical-knowledge` 是单词事实的权威来源，大模型不得凭空补写词性、词形或义项。
- `teaching-engine` 可以生成解释、例句和建议，但每个结构化输出都要通过契约校验。
- 多语言不是在提示词中替换语言名称，而是替换语言包、词典、形态规则、评分量表和语音能力。
- 界面插件第一版只允许声明式主题和受控槽位；不允许未经审核的任意脚本进入主页面上下文。

## 评审问题

1. 首要用户是中学生、大学生、考试人群，还是成人通用学习者？
2. “所有中文意思”是否需要覆盖专业词典与短语/习语？
3. 首发地区是否包含中国大陆，数据跨境和模型可用性要求是什么？
4. 首版是否需要账号、历史记录和生词本，还是允许匿名会话？
5. 免费/付费产品的单次批量上限与月度成本上限是多少？

