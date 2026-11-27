import { useRef, useState } from 'react'
import { ClipboardCopy, Link2 } from 'lucide-react'
import { makeParticipantLink } from './runtime'

export default function StudyLinks() {
  const [key, setKey] = useState('')
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const result = useRef(null)
  async function check(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(''); setLink(''); setStatus('')
    try { setLink(await makeParticipantLink(key)) }
    catch (err) {
      setError(err instanceof TypeError || err.name === 'AbortError' ? 'Could not reach Flagsmith. Check your connection and try again.' : err.message)
    } finally { setBusy(false) }
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(link); setStatus('Participant link copied.') }
    catch { result.current.focus(); result.current.select(); setStatus('Link selected. Use your browser’s copy command.') }
  }
  return <section className="inspect-section study-links">
    <h3><Link2 size={17} />Invite real participants</h3>
    <p>Use a dedicated research environment. Each participant gets a stable browser ID and the onboarding experience Flagsmith assigns.</p>
    <form onSubmit={check}>
      <label htmlFor="research-key">Public research environment ID</label>
      <input id="research-key" value={key} disabled={busy} onChange={e => {
        setKey(e.target.value); setError(''); setLink(''); setStatus('')
      }} autoComplete="off" autoCapitalize="none" spellCheck="false" required />
      <small>Copy the client-side ID from Environment Settings. Set the experiment to Running before sharing.</small>
      <button className="button secondary fill" type="submit" disabled={!key.trim() || busy}>{busy ? 'Checking flag…' : 'Check flag and create link'}</button>
    </form>
    {error && <p className="form-error" role="alert">{error}</p>}
    {link && <div className="link-result">
      <label htmlFor="participant-link">Participant link</label>
      <input id="participant-link" ref={result} value={link} readOnly onFocus={e => e.target.select()} />
      <small>Flag verified. This link opens the participant workspace. Only opening the link can enroll a visitor.</small>
      <button type="button" className="button secondary fill" onClick={copyLink}><ClipboardCopy size={16} />Copy participant link</button>
    </div>}
    {status && <p role="status">{status}</p>}
  </section>
}
