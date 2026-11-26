import { useEffect, useRef, useState } from 'react'
import { Activity, Download, FlaskConical, Layers3, Play, Radio, UserRoundPlus, X } from 'lucide-react'
import { CONTROL, GUIDED } from './experiment'
import { configuredId, connectDemo, demoMode, environmentID, runDemoBatch } from './runtime'

function Simulator({ busy, setBusy, notify }) {
  const [stats, setStats] = useState(null)
  const [receipt, setReceipt] = useState(null)
  const [failure, setFailure] = useState('')
  const running = useRef(false)
  const canRun = demoMode && Boolean(environmentID)
  async function start() {
    if (running.current || !canRun) return
    running.current = true
    setBusy(true)
    setFailure('')
    setStats(null)
    setReceipt(null)
    try {
      const { stats: result, receipt: report } = await runDemoBatch(setStats)
      setReceipt(report)
      notify(result.error ? 'Simulation stopped. See the inspector.' : 'Simulation finished. Check ingestion in Flagsmith.')
    } catch {
      setFailure('The run stopped. Check the demo environment and try again.')
    } finally {
      running.current = false
      setBusy(false)
    }
  }
  return (
    <section className="inspect-section">
      <h3><Activity size={17} />Traffic simulator</h3>
      <p>100 synthetic identities. Each save is sampled at 16% for control or 29% for guided templates.</p>
      <button className="button secondary fill" type="button" disabled={!canRun || busy} onClick={start}>
        <Play size={15} />{busy ? 'Simulating visitors.' : 'Simulate 100 Visitors'}</button>
      {!canRun && <small>{demoMode ? 'Connect a demo environment to send traffic.' : 'Simulation is disabled in research mode.'}</small>}
      {(stats || busy) && <div className="run-stats" aria-busy={busy}>
        <div><strong>{busy ? 'Running' : stats?.error || failure ? 'Stopped early' : 'Batch finished'}</strong><span>{stats?.attempted || 0} / 100</span></div>
        <progress max="100" value={stats?.attempted || 0} aria-label="Visitors processed" />
        <table><caption>Events queued by the SDK</caption><thead><tr><th>Arm</th><th>Exposed</th><th>Saved</th></tr></thead>
          <tbody>{[CONTROL, GUIDED].map(v => <tr key={v}><th>{v === CONTROL ? 'Control' : 'Guided'}</th>
            <td>{stats?.variants[v].exposures ?? 0}</td><td>{stats?.variants[v].conversions ?? 0}</td></tr>)}</tbody></table>
        {stats && !busy && <p>{stats.skipped} skipped. Final flush requested. Confirm receipt in the demo dashboard.</p>}
      </div>}
      {receipt && <div className="delivery-receipt">
        <p>Ingestion acknowledged <strong>{receipt.http_accepted_distinct_ids.exposures}</strong> exposures and <strong>{receipt.http_accepted_distinct_ids.conversions}</strong> saves from this synthetic batch.</p>
        <a className="button secondary fill" href={'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(receipt, null, 2))}
          download={'promptvault-' + receipt.run_id + '.json'}><Download size={16} />Download run receipt</a>
      </div>}
      {(failure || stats?.error) && <p className="form-error" role="alert">{failure || stats.error}</p>}
    </section>
  )
}

export default function Inspector({ identity, assignment, preview, setPreview, canPreview, newVisitor, canReset, notify, lastEvent }) {
  const dialog = useRef(null)
  const opener = useRef(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    const el = dialog.current
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])
  return (
    <>
      <button type="button" ref={opener} className="inspector-launch" aria-haspopup="dialog" aria-expanded={open}
        onClick={() => setOpen(true)}><FlaskConical size={17} /><span>Experiment inspector</span></button>
      <dialog ref={dialog} aria-labelledby="inspect-title" className="inspector"
        onClose={() => { setOpen(false); opener.current?.focus() }}
        onClick={e => { if (e.target === e.currentTarget) {
          const box = e.currentTarget.getBoundingClientRect()
          if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) setOpen(false)
        } }}>
        <header className="inspect-header"><div><div className="context"><FlaskConical size={14} />{demoMode ? 'Demo environment' : 'Research environment'}</div>
          <h2 id="inspect-title">Experiment Inspector &amp; Traffic Simulator</h2></div>
          <button type="button" aria-label="Close inspector" className="icon-button" onClick={() => setOpen(false)}><X size={19} /></button></header>
        <div className="inspect-body">
          <section className="inspect-section"><h3><Radio size={17} />Visitor assignment</h3>
            <dl><div><dt>Connection</dt><dd>{assignment.source === 'live' ? 'Live � Flagsmith' : assignment.source === 'loading' ? 'Connecting' : 'Fallback � local control'}</dd></div>
              <div><dt>user_id</dt><dd className="mono">{identity?.id || 'Loading.'}</dd></div>
              <div><dt>Assigned variant</dt><dd className="mono">{assignment.source === 'loading' ? 'Pending' : assignment.variant}</dd></div>
              <div><dt>Enrollment</dt><dd>{assignment.enrolled ? 'Enrolled' : 'Outside experiment'}</dd></div>
              <div><dt>Last event</dt><dd className="mono">{lastEvent || 'None this session'}</dd></div></dl>
            <p>{assignment.reason}</p>
            <button className="button secondary fill" type="button" disabled={!canReset || !demoMode} onClick={newVisitor}><UserRoundPlus size={16} />New Visitor Session</button>
            {!canReset && <small>Return to the library and finish any save to switch visitors.</small>}
            {!demoMode && <small>Visitor resets are disabled for research traffic.</small>}
          </section>
          {canPreview && <section className="inspect-section"><h3><Layers3 size={17} />Offline variant preview</h3>
            <p>Inspect the empty state and editor locally. Preview interactions produce no experiment events.</p>
            <div className="segmented">{[CONTROL, GUIDED].map(v => <button type="button" key={v} aria-pressed={(preview || CONTROL) === v}
              onClick={() => { setPreview(v === CONTROL ? null : v); setOpen(false) }}>{v === CONTROL ? 'Control' : 'Guided template'}</button>)}</div></section>}
          {demoMode && !configuredId && <details className="demo-connect" open={!environmentID || undefined}><summary>Connect a Flagsmith demo environment</summary>
            <form onSubmit={e => { e.preventDefault(); try { connectDemo(input) } catch (err) { setError(err.message) } }}>
              <label htmlFor="demo-key">Public client-side environment ID</label>
              <input id="demo-key" value={input} onChange={e => setInput(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck="false" required />
              <small>Use a dedicated demo environment. This tab reloads on connection.</small>
              {error && <small role="alert" className="form-error">{error}</small>}
              <button type="submit" className="button secondary fill" disabled={!input.trim() || !canReset || busy}>Connect environment</button>
            </form></details>}
          <Simulator busy={busy} setBusy={setBusy} notify={notify} />
        </div>
      </dialog>
    </>
  )
}
