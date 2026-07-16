import { ArrowRight, ChevronRight, Database, Leaf, MapPinned, Sprout } from 'lucide-react'
import './HomePage.css'

const PLATFORM_TITLE = 'AgriLCA China'

const foundations = [
  {
    letter: 'D',
    title: 'Data',
    label: '数据基础',
    icon: Database,
    copy: '将省级农业投入、产量与排放因子整理为可追溯的核算基础',
    points: ['省级数据口径', '年度序列更新', '来源状态标记'],
  },
  {
    letter: 'M',
    title: 'Model',
    label: '模型核算',
    icon: Leaf,
    copy: '以生命周期评价框架连接投入清单、排放系数与碳足迹结果',
    points: ['边界清晰', '参数透明', '结果可复核'],
  },
  {
    letter: 'I',
    title: 'Insight',
    label: '空间洞察',
    icon: MapPinned,
    copy: '通过时间、空间与生命周期边界三个维度理解结果差异',
    points: ['省际比较', '趋势追踪', '贡献分解'],
  },
]

const pathways = [
  {
    eyebrow: 'DATASET',
    title: '看清数据从哪里来',
    copy: '输入数据、补全规则与原始来源状态在同一工作流中呈现，让每一个结果都能回到数据基础',
    action: '查看核算明细',
    icon: Database,
  },
  {
    eyebrow: 'MODEL',
    title: '让模型更容易使用',
    copy: '从省份和年份选择，到单位碳足迹、贡献分解与参数表，研究操作被组织为一个清晰的计算界面',
    action: '进入核算平台',
    icon: Sprout,
  },
  {
    eyebrow: 'INSIGHT',
    title: '把结果放回空间与时间',
    copy: '地图、年度趋势与生命周期边界并列呈现，用于识别省级农业系统碳足迹的差异与变化',
    action: '查看 TSB 分析',
    icon: MapPinned,
  },
]

function HomePage() {
  return (
    <main className="pam-home">
      <header className="pam-nav">
        <a className="pam-logo" href="/" aria-label={PLATFORM_TITLE}>
          <img className="bnu-mark" src="/bnu-emblem.jpg" alt="北京师范大学" />
          <span>Agri</span><b>LCA</b><i>China</i>
        </a>
        <nav aria-label="主页导航">
          <a href="#framework">研究框架</a>
          <a href="#workspace">研究工作台</a>
          <a href="#resources">平台能力</a>
        </nav>
        <a className="pam-nav-action" href="/workspace">进入模型 <ArrowRight size={16} /></a>
      </header>

      <section className="pam-hero">
        <div className="hero-grid" aria-hidden="true" />
        <p className="hero-kicker">PROVINCIAL AGRI-FOOD SYSTEMS · LCA</p>
        <h1><span>Data</span><span>Model</span><span>Insight</span></h1>
        <p className="hero-intro">中国省级农食系统碳足迹核算平台</p>
        <p className="hero-copy">从可追溯数据到可解释结果，为农业系统的碳足迹研究提供连续、清晰的研究工作流</p>
        <a className="hero-link" href="#framework">探索平台 <ChevronRight size={20} /></a>
      </section>

      <section className="foundation-section" id="framework">
        <div className="section-intro">
          <span className="bnu-watermark" aria-hidden="true" />
          <p>WHAT IS AGRILCA CHINA?</p>
          <h2>把复杂的研究工作<br />组织成可持续的框架</h2>
        </div>
        <div className="foundation-circles">
          {foundations.map(({ letter, title }) => (
            <a
              className={`foundation-circle circle-${letter.toLowerCase()}`}
              href={`#foundation-${title.toLowerCase()}`}
              key={letter}
            >
              <span className="circle-letter">{letter}</span>
              <span className="circle-hover-name">{title}</span>
            </a>
          ))}
        </div>
        <div className="foundation-details">
          {foundations.map(({ title, label, copy, points, icon: Icon }) => (
            <article id={`foundation-${title.toLowerCase()}`} key={title}>
              <Icon aria-hidden="true" strokeWidth={1.5} />
              <p className="detail-label">{label}</p>
              <h3>{title}</h3>
              <p>{copy}</p>
              <ul>{points.map((point) => <li key={point}>{point}</li>)}</ul>
            </article>
          ))}
        </div>
      </section>

      <section className="workspace-section" id="workspace">
        <div className="workspace-heading">
          <p>ONE PLATFORM · THREE PERSPECTIVES</p>
          <h2>为不同的研究问题<br />提供同一套语言</h2>
        </div>
        <div className="pathway-list">
          {pathways.map(({ eyebrow, title, copy, action, icon: Icon }, index) => (
            <article className="pathway" key={eyebrow}>
              <div className="pathway-number">0{index + 1}</div>
              <div className="pathway-copy"><p>{eyebrow}</p><h3>{title}</h3><span>{copy}</span><a href="/workspace">{action} <ArrowRight size={17} /></a></div>
              <div className={`pathway-visual visual-${index + 1}`}><Icon strokeWidth={1.05} /><span>{eyebrow}</span></div>
            </article>
          ))}
        </div>
      </section>

      <section className="pill-section">
        <div className="pill-copy"><p>TIME · SPACE · BOUNDARY</p><h2>从一个结果，<br />到完整的研究视角</h2><span>年度序列、省级空间与生命周期边界相互连接</span></div>
        <div className="pill-orbit" aria-hidden="true"><i /><i /><i /><strong>TSB</strong><b>TIME</b><b>SPACE</b><b>BOUNDARY</b></div>
      </section>

      <section className="resources-section" id="resources">
        <div className="resources-heading"><p>PLATFORM CAPABILITIES</p><h2>研究过程，不止于计算</h2><a href="/workspace">打开研究工作台 <ArrowRight size={18} /></a></div>
        <div className="resource-grid">
          <article><span>01</span><h3>核算结果</h3><p>单位碳足迹与各投入来源的贡献分解</p></article>
          <article><span>02</span><h3>时空分析</h3><p>省级地图和年度趋势，定位差异与变化</p></article>
          <article><span>03</span><h3>边界解释</h3><p>明确生命周期阶段，让结果具备解释基础</p></article>
          <article><span>04</span><h3>持续更新</h3><p>数据表可同步扩展，支持后续研究迭代</p></article>
        </div>
      </section>

      <section className="pam-contact"><p>AGRICULTURAL LCA RESEARCH</p><h2>开始探索<br />省级农食系统</h2><a href="/workspace">进入碳足迹核算平台 <ArrowRight size={19} /></a></section>

      <footer className="pam-footer"><a className="pam-logo" href="/"><img className="bnu-mark" src="/bnu-emblem.jpg" alt="北京师范大学" /><span>Agri</span><b>LCA</b><i>China</i></a><p>北京师范大学 · 中国省级农食系统碳足迹核算平台</p><div><a href="#framework">研究框架</a><a href="#resources">平台能力</a><a href="/workspace">进入模型</a></div><small>© 2026 AgriLCA China</small></footer>
    </main>
  )
}

export default HomePage
