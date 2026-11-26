import { useEffect, useRef, useState } from 'react'
import { Braces, Copy } from 'lucide-react'
import { fillPrompt, promptFields } from './prompt-inputs'

export default function PromptFill({ prompt, initiallyOpen, copy }) {
  const fields = promptFields(prompt)
  const [values, setValues] = useState(() => new Map())
  const disclosure = useRef(null)
  const output = useRef(null)
  const ready = fields.every(key => values.get(key)?.trim())
  const resolved = fillPrompt(prompt, values)

  useEffect(() => {
    if (initiallyOpen) {
      disclosure.current.open = true
      disclosure.current.querySelector('textarea')?.focus()
    }
  }, [initiallyOpen])

  return <details ref={disclosure} className="use-panel">
    <summary><Braces size={18} />Use this prompt</summary>
    <div className="use-content">
      {fields.length ? <p>Fill in the inputs for this copy. Your saved workflow keeps its reusable fields.</p>
        : <p>Add a field such as <code>{'{{notes}}'}</code> to the prompt above to reuse it with different inputs.</p>}
      {fields.map(key => <label key={key} className="use-field">{key}
        <textarea rows={2} maxLength={12000} value={values.get(key) || ''} onChange={event => {
          const value = event.target.value
          setValues(previous => new Map(previous).set(key, value))
        }} />
      </label>)}
      <label className="use-field">Ready-to-use prompt
        <textarea ref={output} rows={4} value={resolved} readOnly />
      </label>
      <button type="button" disabled={!ready || !prompt.trim()} className="button secondary" onClick={async () => {
        if (!await copy(resolved)) { output.current.focus(); output.current.select() }
      }}><Copy size={16} />Copy finished prompt</button>
    </div>
  </details>
}
