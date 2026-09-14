# Wiktextract 原始数据读取切片

日期：2026-09-14。Task 0.2 的第二类数据候选小样本验证，同时交付 `packages/lexical-knowledge` 离线读取器。尚未接入 Web/Worker，不是 Task 1.6 验收完成。

## 实测与来源

从 Kaikki 单词页面的 **raw JSONL** 下载链接取得三个样本；读取器验证下表固定字节摘要，不能用页面展示的后处理 JSON 代替。三词是定向结构抽样，不是随机样本，不推算整体覆盖率。

| 样本    | 字节数 | 英文 entry | 英文 sense | 中文译词组 | 中文译词记录 | 原始 senseid 数量 |
| ------- | ------ | ---------- | ---------- | ---------- | ------------ | ----------------- |
| teacher | 83428  | 1          | 4          | 1          | 4            | 0                 |
| apple   | 172372 | 2          | 24         | 1          | 5            | 4                 |
| bank    | 167990 | 7          | 42         | 3          | 5            | 4                 |

译词只统计 `lang_code` 为 `zh` 或 `cmn` 的非空记录，保留源标签和简繁混合形式，不声称都是简体或完整中文解释。senseid 是源字段值数量，不等于有 ID 的义项数量，更不是 Wiktionary 页面修订号。

- [teacher 原始文件](https://kaikki.org/dictionary/English/meaning/t/te/teacher.jsonl)：`61039035e0d2377ec0c8165cd00dfb654264b8b33699f1ddca5562c3394558d8`
- [apple 原始文件](https://kaikki.org/dictionary/English/meaning/a/ap/apple.jsonl)：`6dd88494395ffa0d4b7a8b321bcbee8d557c58f6d1bd993d297f8a5f568ffd0a`
- [bank 原始文件](https://kaikki.org/dictionary/English/meaning/b/ba/bank.jsonl)：`0962a6ea8bf5e430f8dd3a6cfd32f2999ada81cb2cccd0f0dc6f38b6a2aae6c0`

[Kaikki 页面](https://kaikki.org/dictionary/English/index.html)标注提取日期 2026-09-09、enwiktionary dump 日期 2026-09-02；页面展示还经过后处理，并可能合并其他来源。这里把该日期作为页面声明，不当作单条记录的修订证明。下载 URL 可变化，复现必须验证摘要；没有保存不可变的上游下载镜像。

许可证据：[Wiktionary 版权说明](https://en.wiktionary.org/wiki/Wiktionary:Copyrights)与 [Wiktextract 项目说明](https://github.com/tatuylonen/wiktextract)。提取程序的许可证不替代词条文本许可；应用接入前需落实对应数据版本的署名、许可链接、修改说明和适用的相同方式共享要求，并排除单独授权的引用/媒体。本轮不复制例句引文或媒体，不提交样本正文，不以该报告代替法律审查。

## 接口与保守映射

`readWiktextract(bytes, expectedSha256)` 仅解析已取得的本地小快照；`lookupWiktextract(snapshot, query)` 在其中查词。没有网络、数据库或模型调用。它们不是 `WordAnalysis` 适配器，不应直接写入 LearningRun 的结果字段。

| 原始字段                              | 读取策略                                                       |
| ------------------------------------- | -------------------------------------------------------------- |
| `word`、`pos`、`lang_code`            | 保留英文记录；相同词头的不同 entry 不覆盖                      |
| `senses[].glosses`                    | 保留整个层级数组，不把父义项和子义项展平成独立定义             |
| `senses[].senseid`                    | 原样保留，缺失为空；不生成伪源 ID                              |
| `translations[].sense`                | 只在当前 entry 内分组，保留原标签；缺失标签为 null             |
| `translations[].word`、标签与限定信息 | 保留 `zh`/`cmn` 非空译词、语言、roman、alt、note、tags、topics |
| 文件摘要 + JSONL 行号                 | 定位这份快照内的 entry，不冒充跨版本稳定 ID 或上游修订号       |

所有译词组都返回 `senseBinding: UNRESOLVED`；即使标签看起来与某条 gloss 相似，也不做模糊匹配。所有查询结果都返回 `isCompleteForSource: false`。状态 `FOUND` 仅表示该快照存在中文译词，`NO_CHINESE_TRANSLATION` 表示词头存在但无可用中文记录，`NOT_FOUND` 仅表示快照未收录。

原始字段依据 [英文提取器类型定义](https://github.com/tatuylonen/wiktextract/blob/master/src/wiktextract/extractor/en/type_utils.py)；输入只验证本切片消费的字段，其他字段被丢弃。使用仓库既有 Zod 4.5.4 的对象校验模式，未新增第三方依赖版本。限制：2,000,000 字节、100 条非空记录，并限制字段/数组长度；错误不回显源内容。查询支持 NFKC、trim 和小写，不推断词形、拼写修正或义项。

## 复现

先下载上面任一样本到本地临时目录（保留文件，不执行内容）；文件读取/下载方须自行限制大小，读取器不是网络下载器。然后在仓库根目录执行，参数使用本地实际文件路径、上表摘要、查询词：

```powershell
pnpm --filter @english-teacher/lexical-knowledge build
node --input-type=module -e 'import {readFileSync,statSync} from "node:fs"; import {readWiktextract,lookupWiktextract} from "./packages/lexical-knowledge/dist/index.js"; const [path,hash,word]=process.argv.slice(1); if(statSync(path).size>2000000) throw Error("SOURCE_TOO_LARGE"); const snapshot=readWiktextract(readFileSync(path),hash); const result=lookupWiktextract(snapshot,word); console.log(JSON.stringify({sha256:snapshot.sha256,status:result.status,entries:result.entries.length,senses:result.entries.reduce((n,e)=>n+e.senses.length,0),groups:result.entries.reduce((n,e)=>n+e.translationGroups.length,0),translations:result.entries.flatMap(e=>e.translationGroups).reduce((n,g)=>n+g.translations.length,0),sourceSenseIds:result.entries.flatMap(e=>e.senses).reduce((n,s)=>n+s.senseid.length,0)}));' '<本地JSONL路径>' '<上表SHA256>' 'teacher'
```

以上仅适用于可信本地普通文件的人工复现，不是面向任意上传/并发修改文件的安全导入服务。工具按自身读取到的同一份字节校验摘要并解析，摘要不符即失败；更新数据版本必须先重新审查，不能关闭校验。

## 验证与后续

新增合成数据单元测试覆盖层级、限定标签、同形词、语言过滤、缺失、未绑定、格式错误、UTF-8、摘要和体积/数量限制。真实三样本验证与这些合成测试分开，不计作黄金集质量验收。应用处理器仍为 fixture/disabled。

本轮验证：18 条新测试通过；全仓 89 条测试及契约漂移检查、lint、typecheck、build 通过，独立代码审查通过。未修改应用与基础链路，因此未重跑数据库/队列集成或浏览器验收。首次包类型检查发现缺少显式 Node 类型加载，已在新包 tsconfig 配置 `types: ["node"]` 并通过复验。

下一步：扩展到固定 100 探针并记录未命中及许可/溯源信息；评估明确标为“有限译词组查询”的结果契约与 UI，或对需要完整义项绑定的部分增加可审计映射。不能把本轮未绑定译词塞入 `zhDefinition`，也不能据此声称全部标准义项已实现。
