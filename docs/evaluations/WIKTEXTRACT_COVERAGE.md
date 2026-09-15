# Wiktextract 100 项结构覆盖评测

采集日期：2026-09-14；最终回放与验证：2026-09-15。基于固定 [100 项输入探针](../../tests/golden/lexical-probes.json)，使用原始 Wiktextract 单词 JSONL，而非网页后处理数据。用途是评估有限英汉译词查询，不是释义准确率、完整性、授权或生产验收。

## 结果

| 指标                         | 结果                                                             |
| ---------------------------- | ---------------------------------------------------------------- |
| 查询探针                     | 100（97 有效输入 + 3 负向控制）                                  |
| 成功下载并校验               | 98 个快照；所有 97 项有效输入均通过                              |
| 有中文译词的有效输入         | 71 / 97（73.20%）                                                |
| 有词条但无中文译词的有效输入 | 26 / 97                                                          |
| 有效输入的下载/解析未决项    | 0                                                                |
| 负向控制                     | `qzxvblorp123`、`recieive` 为 HTTP 404；`teh` 有词条但无中文译词 |

`HTTP_NOT_FOUND` 仅表示该下载端点返回 404，不等于证明所有 Wiktionary 数据都不收录。`NO_CHINESE_TRANSLATION` 不等于英文词头缺失。中文字段按 `zh`/`cmn` 非空译词计数，包含简繁混合；不将译词当作完整中文定义。

只有所有有效输入均完成读取验证时才计算覆盖比例；若有下载/解析未决项，`translatedPercentOfValidInputs` 为 `null`，不把错误当成未命中。回放对有快照与无快照观测都按白名单重建字段，避免沿用旧解析诊断；HTTP 状态若存在，必须是 100–599 的整数。

| 分组       | 中文译词命中 / 有效探针 |
| ---------- | ----------------------- |
| 常见词     | 10 / 10                 |
| 多义词     | 10 / 10                 |
| 动词形式   | 3 / 10                  |
| 不规则形式 | 3 / 10                  |
| 功能词     | 9 / 10                  |
| 派生词     | 9 / 10                  |
| 拼写变体   | 4 / 10                  |
| 短语       | 8 / 10                  |
| 领域词     | 10 / 10                 |
| 边界输入   | 5 / 7                   |

没有中文译词的有效输入：went、gone、ate、eaten、wrote、written、bought、children、mice、feet、teeth、geese、women、best、an、unkind、colour、centre、organise、travelling、traveling、learnt、put up with、state-of-the-art、naïve、résumé。读取器没有跨词形或拼写变体跳转，因此这些结果不代表跳转后的基础词也无译词。

与 [FreeDict](FREEDICT_REVIEW.md) 的 73/97 相比，这次直接译词命中为 71/97，没有提升。优势是保留义项层级、译词组、限定标签及部分源 senseid；所有译词组仍标记 `UNRESOLVED`，没有宣称已解决逐义项对齐。

## 可复现证据

[机器报告](wiktextract-2026-09-14.json)保存每项 ID、原查询、标准化下载 URL、HTTP 状态、文件字节数、SHA-256、字段计数及排除标记，不含词典正文。输入探针摘要固定为 `55e4f18d10d9f64bf585037687c8289a776678ee02e6ce88759908de662a19d1`。

报告采集时间为 `2026-09-14T12:07:04.049Z`。URL 是可变的，摘要才标识本轮确切字节；收集程序不会把刚计算的摘要当作已经审核的授权证明。上游版本、许可与原始/后处理数据差别见 [前置报告](WIKTEXTRACT_REVIEW.md)。本轮没有把完整词库提交到 Git。

在仓库根目录执行（使用已锁定的 tsx，不依赖旧 dist 文件）：

```powershell
# 联网收集：100 次顺序请求；只使用固定公共主机，每次最多 20 秒、2MB，不跟随重定向
pnpm exec tsx scripts/lexical/evaluate-wiktextract.mjs collect
# 根据上一命令返回的 directory 离线重算，不联网、不覆盖数据
pnpm exec tsx scripts/lexical/evaluate-wiktextract.mjs replay '<本地快照目录>'
```

`collect` 创建新的系统临时目录，保存按探针 ID 命名的 JSONL 与每步更新的 `report.json`；不读取用户环境凭据，也不连接应用数据库。`replay` 校验探针与每份已下载字节的摘要，再重新执行当前读取逻辑。网络失败记录只保留原观测，不伪称已离线重现 HTTP 响应。未完成的采集会保留部分报告；当前 replay 只接受完整 100 项报告，不支持自动断点续传。

跨机器复现需要保存的快照目录，或按报告 URL 重新取得每份 JSONL、校验报告中的摘要并按 `<probeId>.jsonl` 命名，同时将报告放为 `report.json`。上游内容变化导致摘要不同，应作为新版本重新评测，不能关闭校验。临时目录只供可信本地人工评测，不是文件上传或生产导入服务；不要把本机临时路径当作永久依赖。

## 本轮修复与验证边界

首次回放有 26 个有效探针被读取器拒绝，定位到部分翻译记录缺少 `word` / `lang_code`。上游 [TranslationData 定义](https://github.com/tatuylonen/wiktextract/blob/master/src/wiktextract/extractor/en/type_utils.py)使用可缺省字段。补充失败回归测试后，改为跳过并计数这些不完整记录，不丢弃同一 entry 中的有效译词；字段类型错误仍拒绝。`incompleteTranslationCount` 包括所有语言的缺失/空译词，按探针计数，不能解读成独立中文错译数量。

新增测试覆盖 HTTP 错误与端点 404、重定向禁止、流式大小上限、传输错误脱敏、固定分母与负向排除；运行器合成集测试覆盖 100 项采集、离线回放、清除过时错误字段和字节篡改失败。真实报告离线复算与提交 JSON 一致，不以合成测试代替真实采集。

2026-09-15 全仓 `pnpm test`（100 条及契约漂移检查）、`pnpm lint`、`pnpm typecheck`、`pnpm build` 通过；独立复审通过。未改应用、数据库/队列或 UI，未重跑集成/浏览器验收；Node 22 本机结果不代表 Node 24 或生产验收。

下一步是有限译词查询契约、来源/署名/许可展示与结果卡；当前 Web/Worker 仍是 fixture/disabled。Task 0.2 的最终数据选择/许可审查、Task 1.6 的完整义项及 UI 验收仍未完成，不增加整项完成数。
