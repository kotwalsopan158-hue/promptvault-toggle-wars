import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, Download, FileText, Save } from 'lucide-react'

import PromptFill from './PromptFill'
import ImportTemplate from './ImportTemplate'
import { downloadTemplate } from './export-template.js'

export default function Editor({ draft, editing, onCancel, onSave, saving, error, copy }) {
  const [title, setTitle] = useState(draft.title)
  const [prompt, setPrompt] = useState(draft.prompt)
  const heading = useRef(null)
  useEffect(() => { if (!draft.openInputs) heading.current?.focus() }, [draft.openInputs])
  return (
    <main id="main" className="page editor-page">
      <button type="button" className="back" onClick={onCancel} disabled={saving}><ChevronLeft size={17} />Workflow library</button>
      <div className="page-intro compact">
        <h1 tabIndex={-1} ref={heading}>{editing ? 'Edit workflow' : 'New workflow'}</h1>
        <p>Give your prompt a name you'll recognize when you need it again.</p>
      </div>
      <form className="editor" onSubmit={event => {
        event.preventDefault()
        if (title.trim() && prompt.trim()) onSave({ ...draft, title, prompt })
      }}>
        <div className="editor-heading"><FileText size={18} /><h2>Workflow details</h2></div>
        <label htmlFor="workflow-title">Workflow name</label>
        <input id="workflow-title" required maxLength={100} autoComplete="off" placeholder="e.g. Weekly project update"
          value={title} onChange={event => setTitle(event.target.value)} />
        <div className="field-line"><label htmlFor="workflow-prompt">Reusable prompt</label>
          <span>{prompt.length.toLocaleString()} / 12,000</span></div>
        <textarea id="workflow-prompt" required maxLength={12000} rows={10} placeholder="Write the instructions you want to use again."
          value={prompt} onChange={event => setPrompt(event.target.value)} />
        {error && <p role="alert" className="form-error">{error}</p>}
        <div className="editor-actions"><button type="button" className="button secondary" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className="button primary" disabled={saving || !title.trim() || !prompt.trim()}><Save size={16} />{saving ? 'Saving.' : 'Save workflow'}</button></div>
      </form>
      {!editing && <ImportTemplate onApply={template => {
        setTitle(template.title); setPrompt(template.prompt)
        document.getElementById('workflow-title')?.focus()
      }} />}
      {editing && <>
        <PromptFill prompt={prompt} initiallyOpen={draft.openInputs} copy={copy} />
        <button type="button" className="button secondary export-saved" onClick={() => downloadTemplate(draft)}>
          <Download size={16} />Export saved template (.md)
        </button>
      </>}
    </main>
  )
}
