# 三词有限译词切片：来源复核与离线复验

- 日期：2026-09-16；代码基线：`82a0ef2`。
- 范围：teacher、apple、bank 的 Kaikki **原始 JSONL**，不是后处理聚合词库。
- 结论：三词通过真实字节到独立译词契约的离线验证；完成公开条款初核及评测来源清单，**不是应用数据源获批或法律意见**。没有提交词库正文，也没有启用 Worker/UI。
- 清单：[lexical-slice-2026-09-16.manifest.json](lexical-slice-2026-09-16.manifest.json)。固定 `OFFLINE_EVALUATION_ONLY`，应用没有加载它。

## 1. 许可证据与实现约束

以下为本次访问的一手资料；网页会变化，日期是审查日期，不是词条修订号。

| 一手来源                                                                                                       | 核对结果                                                                                                                      | 对本项目的约束                                                                                                            |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [Wikimedia 使用条款第 7 节](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use#7._Licensing_of_Content) | 文本再利用的署名可通过原页面及其作者历史；外部导入内容可能有额外署名要求；修改和分发需保留许可及修改说明                      | 清单同时记录上游页面、贡献者、下载来源、许可和修改；不能只标 Kaikki 或 MIT                                                |
| [CC BY-SA 4.0 正式文本第 2–4 节](https://creativecommons.org/licenses/by-sa/4.0/legalcode.en)                  | 许可允许复制/改编，未限定非商业用途；分享时有署名、许可链接、修改标记及适用的相同方式共享义务；数据库权利和其他权利有独立条件 | 是可商用候选，不是“随意使用”。应用结果、导出、缓存/数据库和备份需按实际使用方式评审；不据此推断整个应用代码必须更换许可证 |
| [Wiktextract README 的 License](https://github.com/tatuylonen/wiktextract#license)                             | MIT 声明针对软件包                                                                                                            | 不把解析器的软件许可移植到提取出的词典数据                                                                                |
| [Kaikki rawdata](https://kaikki.org/dictionary/rawdata.html)                                                   | 区分 raw 与后处理数据；页面声明 dump 为 2026-09-02、提取为 2026-09-09                                                         | 使用单词页明确标为 raw 的下载链接；上述日期只作为页面声明，不能证明每条记录的精确上游修订                                 |

此次以 Wikimedia 正式使用条款为主，不把标为草案的 Wiktionary Copyrights 页面单独作为批准依据。上述是工程使用约束整理；生产商用/分发仍需针对最终交付形态复核。

词条页脚均提示文本使用 CC BY-SA，且可能有额外条款：

- [teacher](https://en.wiktionary.org/wiki/teacher#English) 的 Translations 指向独立 [teacher/translations](https://en.wiktionary.org/wiki/teacher/translations)。两处贡献者入口都进入清单 `attribution`；只展示顶层词头链接会遗漏翻译子页的署名入口。
- [apple](https://en.wiktionary.org/wiki/apple#English)、[bank](https://en.wiktionary.org/wiki/bank#English) 页面中有翻译区。本次页面文本检索未发现同名 `/translations` 子页链接，不能推广成其他词也没有子页。
- [Kaikki teacher 原始下载入口](https://kaikki.org/dictionary/English/meaning/t/te/teacher.html) 与后处理展示分开；提取器曾记录翻译模板解析诊断，因此不能将 `FOUND` 宣称为完整或无误。

本次没有逐一追溯历史导入、讨论页及模板依赖，也没有证实每个字段不存在特殊权利条件。清单 `license` 是选定文本的审查声明，不覆盖原 JSONL 中的引文、音频或图片等字段。`upstreamRevision` 保持 `null`；当前网页的 oldid 不应冒充 dump 中实际使用的修订号。

## 2. 本地采集及时间精度

旧百项报告的 `collectedAt` 来自整批开始时间，不能伪装成逐文件下载时间。因此只对这三个公开 raw URL 重新获取一次，保留旧文件，没有重采集百项。

复用 [fetchKaikkiSample](../../packages/lexical-knowledge/src/evaluation.ts)：固定 Kaikki HTTPS、禁止重定向、20 秒超时、2,000,000 字节上限；新建系统临时目录，以 `wx` 保存下载，不覆盖已有文件。未关闭 TLS 验证。

| 词头    | 请求开始（UTC）          | 完整响应读取结束（UTC，清单 retrievedAt） | HTTP / 字节   | 摘要比对               |
| ------- | ------------------------ | ----------------------------------------- | ------------- | ---------------------- |
| teacher | 2026-09-16T13:30:19.751Z | 2026-09-16T13:30:21.456Z                  | 200 / 83,428  | 与旧三词及百项样本一致 |
| apple   | 2026-09-16T13:30:21.457Z | 2026-09-16T13:30:22.018Z                  | 200 / 172,372 | 与旧三词及百项样本一致 |
| bank    | 2026-09-16T13:30:22.019Z | 2026-09-16T13:30:22.377Z                  | 200 / 167,990 | 与旧三词及百项样本一致 |

SHA-256 完整值在清单中。时间由本机时钟记录，不是上游发布时间，也不是可信时间戳服务签名。原始正文只在本地临时目录；清单与此报告可提交 Git，下载文件及映射后的译词正文不提交。

## 3. 离线复验结果

调用 [lookupOfflineTranslation](../../packages/lexical-knowledge/src/offlineTranslation.ts)，而非只调用旧读取器。每个结果经过共享契约运行时校验。

| 查询    | 状态  | 英文条目 | 中文译词组 | 译词记录 |
| ------- | ----- | -------- | ---------- | -------- |
| teacher | FOUND | 1        | 1          | 4        |
| apple   | FOUND | 2        | 1          | 5        |
| bank    | FOUND | 7        | 3          | 5        |

三词共 14 条译词记录，不代表 14 条已验证标准中文释义。所有组仍为 `UNRESOLVED`，覆盖 `SNAPSHOT_ONLY`，`isCompleteForSource=false`。来源对象与清单深度相等；teacher 的翻译子页 URL 目前只是 attribution 文本的一部分，并非经 schema 关联验证的结构化来源链接。每份字节翻转一位后均返回 `INVALID_SOURCE_SNAPSHOT`；清单外 book 返回 `SNAPSHOT_NOT_CONFIGURED`，不是词典未收录。

以下命令在仓库根目录 PowerShell 执行。先准备三份**摘要一致**的文件，命名为 `teacher.jsonl`、`apple.jsonl`、`bank.jsonl`，将最后的目录占位符替换为实际路径。离线复验不下载、不写文件、不输出词典正文。未来下载内容变更时应建立新版本记录，不能为了通过而修改旧清单摘要或伪造旧下载时间。

```powershell
pnpm --filter @english-teacher/contracts build
if ($LASTEXITCODE -ne 0) { throw 'contracts build failed' }
@'
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseOfflineSourceManifest, lookupOfflineTranslation } from './packages/lexical-knowledge/src/offlineTranslation.ts';
const manifest = parseOfflineSourceManifest(JSON.parse(await readFile('docs/evaluations/lexical-slice-2026-09-16.manifest.json', 'utf8')));
const directory = process.argv[2];
const expected = { teacher: [83428,1,1,4], apple: [172372,2,1,5], bank: [167990,7,3,5] };
for (const item of manifest.snapshots) {
  const bytes = await readFile(join(directory, `${item.headword}.jsonl`));
  const { data } = lookupOfflineTranslation(manifest, item.headword, bytes);
  const groups = data.entries.flatMap(entry => entry.translationGroups);
  const counts = [bytes.length,data.entries.length,groups.length,groups.reduce((n,g) => n+g.translations.length,0)];
  assert.deepEqual(counts,expected[item.headword]);
  assert.equal(data.status,'FOUND');
  assert.equal(data.coverage,'SNAPSHOT_ONLY');
  assert.equal(data.isCompleteForSource,false);
  assert.ok(groups.every(group => group.senseBinding === 'UNRESOLVED'));
  assert.deepEqual(data.source,item.source);
  const changed = Buffer.from(bytes); changed[0] ^= 1;
  assert.throws(() => lookupOfflineTranslation(manifest,item.headword,changed),/^Error: INVALID_SOURCE_SNAPSHOT$/);
  console.log(JSON.stringify({query:item.headword,status:data.status,counts,sourcePreserved:true,tamperRejected:true}));
}
assert.throws(() => lookupOfflineTranslation(manifest,'book',new Uint8Array()),/^Error: SNAPSHOT_NOT_CONFIGURED$/);
console.log('UNCONFIGURED_QUERY_REJECTED');
'@ | pnpm exec tsx --input-type=module - '替换为本地三份快照所在目录'
if ($LASTEXITCODE -ne 0) { throw 'slice replay failed' }
```

本轮实际执行：contracts 构建、上述三词复验、JSON/Markdown 格式与 66 个本地链接/差异检查；独立只读复审无 Required，并采纳了 attribution 文本不等于结构化链接验证的澄清。仅新增审查资料与评测元数据，没有修改业务代码；未重跑全仓 lint/typecheck/test/build、数据库/队列集成、浏览器或依赖审计。前轮 179 项测试是历史证据，不是本轮重跑。运行时仍为 Node 22.20.0，非生产 Node 24 验收。

## 4. 下一步与数据使用门槛

此增量把“完全没有真实清单”推进为“有固定真实样本的离线评测清单”。Task 0.2/1.6 不勾选；没有扩大有限契约到完整 `WordAnalysis`。

1. **先补多出处署名展示契约与合成测试。** 现有 `attribution` 文本可保存多个 URL，但没有结构化可点击链接列表；结果卡需要同时保留主词条、翻译子页、Kaikki、许可、修改说明与未知修订提示。不能只展示 `upstreamPageUrl`，也不能把来源字符串直接注入 HTML。
2. **限定真实数据试用范围后再启用。** 提交这三词本地试用的明确范围、来源复核遗留项和持久化说明给用户确认；包括本地任务结果/事件可能含译词、默认 7 天保留。确认不等于生产商用/公开分发获批，也不能替代未完成的来源核查。
3. **接入时重验。** 明确清单外输入“不在本地样本范围”；共享契约、Worker、保存/恢复及 UI 一起验收。按影响运行集成与桌面/移动浏览器测试，验证所有署名链接可用。不用模型补齐缺失义项。

没有必要重建读取器、重新跑 FreeDict 结构 Spike 或再次询问是否采用开源优先路线。原始临时文件丢失时，先用清单 URL 获取并校验；摘要不一致即停止旧版本回放，不自动用新数据替换。
