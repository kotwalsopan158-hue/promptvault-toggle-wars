import { useSyncExternalStore } from 'react'
import { Download, ListChecks } from 'lucide-react'
import { EVENT } from './experiment'
import { visitorTrace } from './runtime'
import { EXPOSURE } from './visitor-trace'
import example from '../evidence/visitor-trace.json'

const rows = [[EXPOSURE, 'Onboarding exposure'], [EVENT, 'First workflow saved']]
const states = { waiting: 'Waiting', queued: 'Queued by SDK', acknowledged: 'Acknowledged', rejected: 'Rejected', unconfirmed: 'Unconfirmed' }
const time = iso => new Date(iso).toISOString().slice(11, 23)
const exampleDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
}).format(new Date(example.trace.events[EXPOSURE].queued_at))

export default function TracePanel() {
  const current = useSyncExternalStore(visitorTrace.subscribe, visitorTrace.snapshot)
  const trace = current || example.trace
  return <section className="inspect-section visitor-trace">
    <h3><ListChecks size={18} />First-save event trace</h3>
    {current ? <p>This tab’s visitor. Times are UTC. The warehouse confirms the final counts.</p> :
      <p><strong>Recorded example · {exampleDate}</strong><br />A scripted visitor received both acknowledgments below. Connect a running demo experiment to follow your own visit. Times are UTC.</p>}
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
      {Object.keys(trace.events).length > 0 && <a className="button secondary fill" download={current ? 'promptvault-visitor-trace.json' : 'promptvault-recorded-trace.json'}
        href={'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(current || example, null, 2))}>
        <Download size={16} />{current ? 'Download visitor trace' : 'Download recorded trace'}</a>}
      {!current && <p><a className="trace-source" href={example.ci_url} target="_blank" rel="noreferrer">Verify the recorded trace</a></p>}
  </section>
}
