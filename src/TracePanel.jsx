import { useSyncExternalStore } from 'react'
import { Download, ListChecks } from 'lucide-react'
import { EVENT } from './experiment'
import { visitorTrace } from './runtime'
import { EXPOSURE } from './visitor-trace'

const rows = [[EXPOSURE, 'Onboarding exposure'], [EVENT, 'First workflow saved']]
const states = { waiting: 'Waiting', queued: 'Queued by SDK', acknowledged: 'Acknowledged', rejected: 'Rejected', unconfirmed: 'Unconfirmed' }
const time = iso => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export default function TracePanel() {
  const trace = useSyncExternalStore(visitorTrace.subscribe, visitorTrace.snapshot)
  return <section className="inspect-section visitor-trace">
    <h3><ListChecks size={18} />First-save event trace</h3>
    {!trace ? <p>Connect to a running demo experiment to see this visitor’s event deliveries.</p> : <>
      <p>First delivery of each event for this visitor in this tab. Check the warehouse for the final counts.</p>
      <dl className="trace-identity"><div><dt>Visitor</dt><dd className="mono">{trace.identifier}</dd></div>
        <div><dt>Assignment</dt><dd>{trace.variant}</dd></div></dl>
      <ol className="trace-list">{rows.map(([name, title]) => {
        const entry = trace.events[name]
        const status = entry?.status || 'waiting'
        return <li key={name}>
          <div><strong>{title}</strong><span className={'trace-state state-' + status}>{states[status]}</span></div>
          <code>{name}</code>
          {entry && <small>Queued {time(entry.queued_at)}{entry.response_at && <> · {entry.http_status ? 'HTTP ' + entry.http_status : 'No HTTP response'} at {time(entry.response_at)}</>}</small>}
        </li>
      })}</ol>
      {Object.keys(trace.events).length > 0 && <a className="button secondary fill" download="promptvault-visitor-trace.json"
        href={'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(trace, null, 2))}>
        <Download size={16} />Download visitor trace</a>}
    </>}
  </section>
}
