import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Check, Database, Layers3, Monitor, X } from 'lucide-react'
import '@fontsource-variable/dm-sans/latin.css'
import './styles.css'
import Editor from './Editor'
import Inspector from './Inspector'
import Library from './Library'
import { CONTROL, EVENT, GUIDED, fallback } from './experiment'
import { demoMode, liveClient } from './runtime'
import { decisionBrief } from './templates'
import { listWorkflows, saveWorkflow, visitor, visitorId } from './workspace'

const loading = { variant: CONTROL, enrolled: false, source: 'loading', reason: 'Resolving your visitor assignment.' }

function App() {
  const [identity, setIdentity] = useState(null)
  const [assignment, setAssignment] = useState(loading)
  const [items, setItems] = useState([])
  const [ready, setReady] = useState(false)
  const [draft, setDraft] = useState(null)
  const [preview, setPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [storageError, setStorageError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [toast, setToast] = useState(null)
  const [lastEvent, setLastEvent] = useState('')
  const generation = useRef(0)
  const saveLock = useRef(false)
  const exposure = useRef(null)
  const notifier = useRef(null)

  const notify = useCallback(message => setToast({ message, key: performance.now() }), [])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 6500)
    return () => clearTimeout(timer)
  }, [toast])

  const startSession = useCallback(async (fresh = false) => {
    const current = ++generation.current
    setReady(false); setAssignment(loading); setPreview(null); setDraft(null); setItems([])
    setLastEvent(''); setStorageError(''); setToast(null); setSaveError('')
    exposure.current = null
    const who = await visitor(fresh)
    if (current !== generation.current) return
    setIdentity(who)
    const [library, evaluated] = await Promise.allSettled([
      listWorkflows(who.id),
      who.persistent ? liveClient.assign(who.id) : fallback('Browser identity storage is unavailable. Tracking is paused.'),
    ])
    if (current !== generation.current) return
    if (library.status === 'fulfilled') setItems(library.value)
    else setStorageError('Browser storage could not open your library. Enable site storage and reload to save workflows.')
    setAssignment(evaluated.status === 'fulfilled' ? evaluated.value : fallback('Could not load the experiment.'))
    setReady(true)
  }, [])

  useEffect(() => {
    void startSession()
    return () => { generation.current++ }
  }, [startSession])

  useEffect(() => {
    if (!ready || !identity || !assignment.enrolled || items.length || draft || storageError || preview) return
    function seen() {
      if (document.visibilityState !== 'visible' || exposure.current?.id === identity.id) return
      if (liveClient.expose(identity.id, assignment)) {
        exposure.current = { id: identity.id, assignment }
        setLastEvent('$flag_exposure')
        notify('Exposure queued � ' + assignment.variant)
        void liveClient.flush().catch(() => {})
      }
    }
    seen()
    document.addEventListener('visibilitychange', seen)
    return () => document.removeEventListener('visibilitychange', seen)
  }, [ready, identity, assignment, items.length, draft, storageError, preview, notify])

  // Other tabs can save to the same visitor's library. The database owns first-save ordering.
  useEffect(() => {
    if (!identity || !ready || typeof BroadcastChannel === 'undefined') return
    let active = true
    const channel = new BroadcastChannel('promptvault-library')
    notifier.current = channel
    channel.onmessage = async event => {
      if (event.data !== identity.id) return
      try {
        const updated = await listWorkflows(identity.id)
        if (active) setItems(updated)
      } catch { if (active) setStorageError('Library refresh failed. Reload to read the latest saved workflows.') }
    }
    return () => { active = false; channel.close(); notifier.current = null }
  }, [identity, ready])

  const displayedVariant = preview || assignment.variant
  function openEditor(record) {
    setSaveError(''); setToast(null)
    if (record) setDraft(record)
    else {
      const seed = !items.length && displayedVariant === GUIDED ? decisionBrief : { title: '', prompt: '' }
      setDraft({ ...seed, id: visitorId('wf') })
    }
    window.scrollTo(0, 0)
  }

  async function save(form) {
    if (saveLock.current || !identity || !ready) return
    saveLock.current = true
    setSaving(true); setSaveError('')
    try {
      const { record, first } = await saveWorkflow(identity.id, form)
      setItems(old => [record, ...old.filter(item => item.id !== record.id)])
      setStorageError(''); setDraft(null)
      notifier.current?.postMessage(identity.id)
      let message = 'Workflow saved on this device.'
      if (first && !preview && exposure.current?.id === identity.id) {
        try {
          const tracked = liveClient.convert(identity.id, exposure.current.assignment, demoMode ? 'demo_manual' : 'human')
          if (tracked) {
            setLastEvent(EVENT)
            message = 'Workflow saved � ' + EVENT + ' queued.'
            void liveClient.flush().catch(() => {})
          }
        } catch { message = 'Workflow saved. Event tracking was unavailable.' }
      } else if (first) message = 'Workflow saved locally. No experiment event was queued.'
      notify(message)
      window.scrollTo(0, 0)
    } catch (err) {
      setSaveError(err.message?.startsWith('Enter a title') ? err.message : 'Could not save to this device. Your draft is still open. Check site storage and try again.')
    } finally { saveLock.current = false; setSaving(false) }
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); notify('Prompt copied to clipboard.') }
    catch { notify('Clipboard unavailable. Open the workflow and select the prompt to copy it.') }
  }

  return (
    <>
      <a className="skip" href="#main">Skip to workspace</a>
      <header className="topbar"><div className="topbar-inner">
        <div className="wordmark"><span className="brand-symbol"><Layers3 size={23} strokeWidth={2.3} /></span>Prompt<span>Vault</span></div>
        <span className="top-separator" /><span className="workspace-nav">Workspace</span>
        <div className="device-label"><Monitor size={15} /><span>On this device</span></div>
      </div></header>
      {storageError && <div className="notice" role="alert"><Database size={16} />{storageError}</div>}
      {!ready ? <main id="main" className="page loading-page" aria-busy="true"><div className="context">Personal workspace</div>
        <h1>Workflow library</h1><p role="status">Opening your workspace.</p></main>
        : draft ? <Editor key={draft.id} draft={draft} editing={items.some(i => i.id === draft.id)} onCancel={() => setDraft(null)} onSave={save} saving={saving} error={saveError} />
        : <Library items={items} variant={displayedVariant} preview={preview} create={() => openEditor()} edit={openEditor} copy={copy} />}
      <Inspector identity={identity} assignment={assignment} preview={preview} setPreview={setPreview}
        canPreview={demoMode && ready && assignment.source === 'fallback' && !draft && items.length === 0}
        canReset={ready && !draft && !saving} newVisitor={() => { void startSession(true) }}
        notify={notify} lastEvent={lastEvent} />
      <div className="toast-region" role="status" aria-live="polite" aria-atomic="true">
        {toast && <div className="toast" key={toast.key}><Check size={17} /><span>{toast.message}</span>
          <button className="dismiss" type="button" aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={15} /></button></div>}
      </div>
    </>
  )
}

createRoot(document.getElementById('root')).render(<App />)
