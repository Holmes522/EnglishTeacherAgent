# FreeDict 英汉数据实测

日期：2026-09-13。用途：用户已选择“开源优先、允许缩小覆盖范围”后的离线候选评测。不是供应商上线批准，也不是教学质量验收。

## 结果

固定数据包 `eng-zho/2025.11.23`，26,660 个 entry，按 NFKC + trim + invariant lowercase 建索引后有 24,786 个不同查询键。对固定 100 项探针全部执行了本地查询，没有调用词典 API 或模型。

| 指标                     | 实测                | 含义                                                         |
| ------------------------ | ------------------- | ------------------------------------------------------------ |
| 有效输入探针             | 97                  | 另有 3 项合成 OOV/拼写错误作为负向控制                       |
| 查到 entry               | 73 / 97             | 不是去重 lemma 的覆盖率，也不代表词义正确                    |
| 查到标注 `zh` 的非空译词 | 73 / 97（75.26%）   | 只检查结构存在，不是完整释义或人工准确率                     |
| 多英文解释的翻译组       | 涉及 29 / 97 个探针 | 同一译词组有多个 def，需要核对对应关系，不直接断言每个都错误 |
| 命中条目含源 `xml:id`    | 0 个探针            | 需要另行设计基于版本和内容的稳定标识；不能伪造原始源 ID      |
| 负向控制                 | 3 / 3 未命中        | 没有实现拼写建议或自动纠正                                   |

逐项观测与各组统计见 [机器可读报告](freedict-eng-zho-2025.11.23.json)。报告不包含供应商释义正文，只保存项目探针、结构计数和数据摘要。探针文件保留为输入基线；是否实测以各候选报告为准。

常见词、多义词、功能词和领域词的结构命中均为 10/10；动词变形及不规则形式均为 4/10，拼写变体为 5/10。未命中包括 `went`、`children`、`colour`、`résumé`。这说明尚不能承诺任意词形还原或英美拼写互查。

## 数据许可和溯源

官方下载：[FreeDict eng-zho 2025.11.23](https://download.freedict.org/dictionaries/eng-zho/2025.11.23/)。已比较归档 SHA-512 与官方旁置校验文件，两者一致；包内 TEI 声明维护者/发布者为 Karl Bartel，数据经过 WikDict 自动生成，源自 Wiktionary 经 DBnary 处理。

- 归档 SHA-512：`25aed0f1d7de68919aa9da1ba92d67f566ae4ea81660f42071c81fc21e56d4b210d61df379315678648c45ca7e52c4a0ba2eec009fbaab7c72e7472489e1fc4c`。
- 解包 TEI SHA-256：`76e15cbc8497b479ebd3834259d52366f051e16eca44c3b50fced7a78f191fb3`。
- 包内 `teiHeader/fileDesc/publicationStmt/availability` 和 COPYING 声明 CC BY-SA 3.0。该许可允许商业复用，但须履行署名、许可链接、修改标记与相同方式共享等适用条件；不能改贴 MIT，也不代表有权使用商标。[许可摘要](https://creativecommons.org/licenses/by-sa/3.0/) / [完整条款](https://creativecommons.org/licenses/by-sa/3.0/legalcode)

仍需核实完整上游许可链，尤其当前 [Wiktionary 版权页](https://en.wiktionary.org/wiki/Wiktionary:Copyrights)说明 CC BY-SA 4.0，而这个下游包声明 3.0。本轮只如实记录两端声明，未推定兼容或自行改写许可证。软件与词库的许可范围应分别记录，产品发布前还需落实署名和衍生数据的分发方式。本报告不代替法律审查。

## 字段映射边界

| TEI 路径（相对 entry）                           | 可观察数据                         | 接入限制                                   |
| ------------------------------------------------ | ---------------------------------- | ------------------------------------------ |
| `form/orth`                                      | 查询词                             | 保留原词，不通过 LLM 补词                  |
| `gramGrp/pos`                                    | 原始词性                           | 需要白名单映射，未知值保留为未识别         |
| `sense/cit[@type='trans'][@xml:lang='zh']/quote` | 中文标记的译词，包含空值、简繁混合 | 过滤空值，不宣称全是简体或逐义项中文定义   |
| `sense/sense/def`                                | 英文解释组                         | 不能按数组位置把多个 def 与 quote 一一配对 |
| `form/pron`                                      | 部分发音转写，无可靠英美标记       | 不擅自映射为契约要求的 UK/US               |
| `entry/@xml:id`                                  | 测试命中条目未提供                 | 源定位与内部稳定 ID 策略待定               |

本轮没有验证词族、屈折规则、CEFR 或义项完整性，不因某个字段未测而宣布整个数据集没有该能力。`ambiguousTranslationGroupCount` 只是多解释结构标记，不是语义错误分类器。

## 复现

需要 PowerShell 7 和支持 `.tar.xz` 的 tar；不需要新增 npm 依赖。下面创建独立临时目录，只下载数据、不执行包内 Makefile 或其他程序：

```powershell
$evalDir = Join-Path ([IO.Path]::GetTempPath()) ('eta-freedict-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $evalDir | Out-Null
$archive = Join-Path $evalDir 'source.tar.xz'
Invoke-WebRequest 'https://download.freedict.org/dictionaries/eng-zho/2025.11.23/freedict-eng-zho-2025.11.23.src.tar.xz' -OutFile $archive -TimeoutSec 60
$expected = '25aed0f1d7de68919aa9da1ba92d67f566ae4ea81660f42071c81fc21e56d4b210d61df379315678648c45ca7e52c4a0ba2eec009fbaab7c72e7472489e1fc4c'
if ((Get-FileHash $archive -Algorithm SHA512).Hash.ToLowerInvariant() -ne $expected) { throw 'Archive checksum mismatch' }
tar -xf $archive -C $evalDir eng-zho/COPYING eng-zho/eng-zho.tei
if ($LASTEXITCODE -ne 0) { throw 'Extraction failed' }
& ./scripts/lexical/Test-FreeDict.ps1
& ./scripts/lexical/Measure-FreeDict.ps1 -TeiPath (Join-Path $evalDir 'eng-zho/eng-zho.tei')
```

评测命令对同一份受限字节计算摘要并解析，固定 TEI 与探针两个摘要，并断言 100/97 的评测口径；只把汇总与逐项结构计数输出到标准输出，不连接应用数据库、不上传输入、不更改源文件。不同版本必须先审查并更新摘要，不能绕过校验。

验证：24 项独立 PowerShell 断言通过（不计入原有 Vitest 的 71 条测试），覆盖空译词、语言过滤、重复词头、NFKC、源 ID 缺失、多解释标记、错误 XML/namespace、外部实体、文件体积、摘要不匹配、字节快照一致性、探针排除和重复 ID。固定文件重新运行后，逐项报告与已提交 JSON 精确一致。脚本为离线评测专用，不由 Web/Worker 加载。

XML 禁用 DTD 处理和外部解析，设置文档体积上限；查询使用索引键，不把探针拼入 XPath。[.NET DTD 行为](https://learn.microsoft.com/dotnet/api/system.xml.xmlreadersettings.dtdprocessing) / [外部解析器设置](https://learn.microsoft.com/dotnet/api/system.xml.xmlreadersettings.xmlresolver)

## 决策

保留为有限英汉翻译数据候选，但不直接接入现有 `WordAnalysis`，不勾选 Task 1.6。下一步优先评估许可链更清楚、保留义项关联和源修订信息的 Wiktionary 派生数据；若采用此包，必须先解决许可版本与语义对应问题，并把产品范围明确为有限译词查询。用户已批准开源路线，不需再次询问是否走开源；新的采购或发布决定仍需确认。
