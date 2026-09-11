export default function HomePage() {
  return (
    <main className="shell">
      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">English Teacher AI Agent</p>
        <h1 id="page-title">把英语问题讲清楚，也把依据说清楚。</h1>
        <p className="lede">
          项目基础架构已经就绪。单词释义、例句、句子评改和批量学习流程将按文档中的纵向切片逐步接入。
        </p>
        <dl className="status-list">
          <div>
            <dt>当前阶段</dt>
            <dd>基础与契约</dd>
          </div>
          <div>
            <dt>事实来源</dt>
            <dd>版本化词典端口</dd>
          </div>
          <div>
            <dt>生成能力</dt>
            <dd>可替换模型网关</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
