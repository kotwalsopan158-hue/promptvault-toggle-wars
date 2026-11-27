import { ExternalLink } from 'lucide-react'
import run from '../evidence/synthetic-flagsmith.json'

const format = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 1 })
const rate = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 2 })
const signed = value => (value > 0 ? '+' : '') + format.format(value)
const analysis = run.inference.guided_templates
const scale = Math.ceil(Math.max(1, Math.abs(analysis.ci_low), Math.abs(analysis.ci_high), Math.abs(analysis.lift)))
const position = value => ((value / scale + 1) * 50) + '%'
const arms = [['Control', run.variants.control], ['Guided', run.variants.guided_templates]]
const recordedOn = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(run.as_of))
const interpretation = analysis.ci_low > 0 ? 'The full interval favors guided.'
  : analysis.ci_high < 0 ? 'The full interval favors control.'
    : 'The interval crosses zero. A loss and a gain both fit the data.'

export default function RecordedResult() {
  return <section className="inspect-section evidence" aria-labelledby="evidence-title">
    <p className="evidence-date">Synthetic traffic · {recordedOn}</p>
    <h3 id="evidence-title">Did the guided start help?</h3>
    <p>Flagsmith counted {run.converted} first saves across {run.enrolled} distinct visitors in this recorded run.</p>
    <table><caption className="sr-only">First workflow saves in the recorded experiment</caption>
      <thead><tr><th scope="col">Arm</th><th scope="col">Saved / exposed</th><th scope="col">Save rate</th></tr></thead>
      <tbody>{arms.map(([label, arm]) => <tr key={label}><th scope="row">{label}</th><td>{arm.sum} / {arm.n}</td><td>{rate.format(arm.sum / arm.n)}</td></tr>)}</tbody>
    </table>
    <dl className="evidence-metrics">
      <div><dt>Relative lift</dt><dd>{signed(analysis.lift)}</dd></div>
      <div><dt>Probability guided beats control</dt><dd>{format.format(analysis.chance_to_win)}</dd></div>
    </dl>
    <figure className="interval">
      <figcaption><strong>95% credible interval for lift</strong><span>{signed(analysis.ci_low)} to {signed(analysis.ci_high)}</span></figcaption>
      <div aria-hidden="true" className="interval-axis">
        <i className="interval-zero" /><i className="interval-range" style={{ left: position(analysis.ci_low), right: position(-analysis.ci_high) }} />
        <i className="interval-estimate" style={{ left: position(analysis.lift) }} />
      </div>
      <div className="interval-labels" aria-hidden="true"><span>{signed(-scale)}</span><span>0%</span><span>{signed(scale)}</span></div>
    </figure>
    <p><strong>{interpretation}</strong> The simulator programs the chance of saving. Human impact is unmeasured.</p>
    <a href={run.ci_url} target="_blank" rel="noreferrer">Verify the warehouse run <ExternalLink size={14} /></a>
  </section>
}
