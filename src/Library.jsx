import { BookOpen, Braces, Copy, FileText, Folder, Layers3, Plus, Sparkles, SquarePen } from 'lucide-react'
import { GUIDED } from './experiment'

function PaperStack() {
  return (
    <div className="paper-scene" aria-hidden="true">
      <div className="scene-grid" />
      <div className="paper-stack">
        <div className="sheet sheet-back"><span className="page-tab" /></div>
        <div className="sheet sheet-middle"><span className="binding" /></div>
        <div className="sheet sheet-front">
          <div className="paper-header"><span><Braces size={20} strokeWidth={2.5} /></span><i /><i /></div>
          <div className="paper-line long" /><div className="paper-line mid" />
          <div className="paper-line short" />
          <div className="paper-footer"><span /><span /><span /></div>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ variant, create, preview }) {
  const guided = variant === GUIDED
  return (
    <section className="start-card" aria-labelledby="start-title">
      <div className="start-copy">
        <div className="card-label">{guided ? <Sparkles size={16} /> : <SquarePen size={16} />}
          {preview ? 'Local preview' : 'Getting started'}
        </div>
        <h2 id="start-title">{guided ? 'Start with a decision brief.' : 'Create your first workflow.'}</h2>
        <p>{guided ? 'Turn rough notes into a clear recommendation. A ready-to-edit prompt gives you a place to start.'
          : 'Give a useful prompt a name and a home. Start with a blank workflow and make it yours.'}</p>
        <button type="button" className="button primary" onClick={create}>
          {guided ? <Sparkles size={17} /> : <Plus size={18} />}{guided ? 'Use decision brief' : 'Create workflow'}
        </button>
      </div>
      <PaperStack />
    </section>
  )
}

const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

export default function Library({ items, variant, preview, create, edit, copy }) {
  return (
    <main id="main" className="page">
      <div className="page-intro">
        <div className="context"><span className="context-mark" /> Personal workspace</div>
        <h1>Workflow library</h1>
        <p>Keep the prompts you reuse, ready for your next project.</p>
      </div>
      {!items.length && <EmptyState variant={variant} create={create} preview={preview} />}
      <section className="shelf" aria-labelledby="shelf-title">
        <div className="shelf-title flex items-center justify-between gap-3">
          <div className="flex items-center gap-3"><Folder size={21} /><h2 id="shelf-title">Saved workflows</h2>
            <span className="count">{items.length}</span></div>
          {items.length > 0 && <button type="button" className="button primary small" onClick={create}><Plus size={16} />New workflow</button>}
        </div>
        {items.length ? (
          <ul className="records">
            {items.map(item => <li key={item.id}>
              <button type="button" className="record-main" onClick={() => edit(item)}>
                <span className="record-icon"><FileText size={21} /></span>
                <span className="min-w-0"><strong>{item.title}</strong><span className="excerpt">{item.prompt.split('\n')[0]}</span></span>
              </button>
              <time dateTime={new Date(item.updated).toISOString()}>{dateFormat.format(item.updated)}</time>
              <button type="button" onClick={() => copy(item.prompt)} className="icon-button" aria-label={'Copy prompt for ' + item.title}><Copy size={17} /></button>
            </li>)}
          </ul>
        ) : (
          <div className="empty-shelf"><span className="empty-icon"><Layers3 size={22} /></span>
            <div><strong>No saved workflows yet</strong><p>Your first saved prompt will appear here.</p></div>
          </div>
        )}
      </section>
      <div className="workspace-foot"><BookOpen size={15} /><span>Personal library</span><span className="foot-line" /></div>
    </main>
  )
}
