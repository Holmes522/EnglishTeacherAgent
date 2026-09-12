import { Composer } from "./composer";

export const dynamic = "force-dynamic";
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const { run } = await searchParams;
  return (
    <main className="shell">
      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">English Teacher AI Agent</p>
        <h1 id="page-title">把英语问题讲清楚，也把依据说清楚。</h1>
        <p className="lede">
          从一个单词、一句话开始。批量提交，逐项查看处理进度。
        </p>
        <dl className="status-list">
          <div>
            <dt>当前阶段</dt>
            <dd>异步学习任务演示</dd>
          </div>
          <div>
            <dt>输入方式</dt>
            <dd>单词 · 句子 · 混合批量</dd>
          </div>
          <div>
            <dt>学习语言</dt>
            <dd>英语，中文说明</dd>
          </div>
        </dl>
        <Composer
          demo={process.env.PROCESSOR_MODE === "fixture"}
          initialRunId={run}
        />
      </section>
    </main>
  );
}
