import { useRef, useState } from 'react'
import { FileUp } from 'lucide-react'
import { maxTemplateBytes, readMarkdownTemplate } from './export-template'
import { promptFields } from './prompt-inputs'

export default function ImportTemplate({ onApply }) {
  const [template, setTemplate] = useState(null)
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)
  const fileInput = useRef(null)
  const disclosure = useRef(null)
  async function read(event) {
    const file = event.target.files[0]
    setTemplate(null); setError('')
    if (!file) return
    if (file.size > maxTemplateBytes) { setError('Choose a PromptVault Markdown file of 128 KiB or less.'); return }
    setReading(true)
    try { setTemplate(readMarkdownTemplate(await file.text())) }
    catch (err) { setError(err.message || 'The selected file could not be read.') }
    finally { setReading(false) }
  }
  function reset() {
    fileInput.current.value = ''
    setTemplate(null); setError('')
  }
  const fields = template ? promptFields(template.prompt) : []
  return <details className="use-panel import-panel" ref={disclosure}>
    <summary><FileUp size={18} />Import a template</summary>
    <div className="use-content">
      <label htmlFor="template-file">PromptVault Markdown file</label>
      <input ref={fileInput} id="template-file" type="file" accept=".md,.markdown,text/markdown,text/plain" disabled={reading} onChange={read} />
      {reading && <p role="status">Reading your file…</p>}
      {error && <p role="alert" className="form-error">{error}</p>}
      {template && <div className="import-preview">
        <h3>{template.title}</h3>
        <p>{fields.length ? 'Inputs: ' + fields.join(', ') : 'Plain prompt'}</p>
        <pre>{template.prompt}</pre>
        <p>Use this template to replace the two draft fields. Choose Save workflow when you’re ready.</p>
        <div className="import-actions">
          <button type="button" className="button secondary" onClick={reset}>Cancel import</button>
          <button type="button" className="button primary" onClick={() => {
            onApply(template); reset(); disclosure.current.open = false
          }}>Use imported template</button>
        </div>
      </div>}
    </div>
  </details>
}
