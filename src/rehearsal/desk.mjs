const control = 'control'
const guided = 'guided_templates'
const flag = 'onboarding_empty_state'
const event = 'first_workflow_created'
const validCount = n => Number.isSafeInteger(n) && n >= 0
const decimal = new Intl.NumberFormat('en', { maximumFractionDigits: 1 })
const rateFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 2 })
const percent = n => Number.isFinite(n) ? decimal.format(n * 100) + '%' : 'Unavailable'
const signed = (n, formatter = decimal) => (n > 0 ? '+' : '') + formatter.format(n)
const when = value => typeof value === 'string' && Number.isFinite(Date.parse(value))

function check(value, message) {
  if (!value) throw Error(message)
}

function readArm(data, denominator, numerator) {
  const seen = data?.[denominator]
  const saved = data?.[numerator]
  check(validCount(seen) && validCount(saved) && saved <= seen, 'The file has invalid exposure or save counts.')
  return { seen, saved }
}

export function measurement(input) {
  check(input?.flag === flag && input?.event === event, 'Choose a PromptVault simulator receipt or a synthetic warehouse result for first_workflow_created.')
  if (input.sdk_queued_by_arm) {
    check(input.traffic === 'synthetic', 'Choose a synthetic rehearsal receipt.')
    const arms = {}
    for (const name of [control, guided]) arms[name] = readArm(input.sdk_queued_by_arm[name], 'exposures', 'conversions')
    const seen = arms[control].seen + arms[guided].seen
    const saved = arms[control].saved + arms[guided].saved
    const attempted = input.visitors_attempted
    const skipped = input.visitors_skipped
    const accepted = input.http_accepted_distinct_ids
    check(validCount(attempted) && attempted <= 100 && validCount(skipped) && seen + skipped === attempted &&
      validCount(accepted?.exposures) && validCount(accepted?.conversions) && accepted.exposures <= seen && accepted.conversions <= saved &&
      when(input.finished_at), 'The receipt totals or timestamp are inconsistent.')
    const usable = attempted === 100 && !skipped && !input.stopped_reason && input.all_queued_events_acknowledged === true &&
      accepted.exposures === seen && accepted.conversions === saved && Array.isArray(input.experiment_ids) && input.experiment_ids.length === 1
    return { kind: 'receipt', arms, seen, saved, date: input.finished_at, usable, accepted, attempted, skipped, inference: null }
  }
  check(typeof input.traffic === 'string' && /synthetic|scripted|automated demonstration/i.test(input.traffic) &&
    when(input.as_of) && input.variants, 'Choose the synthetic flagsmith-results.json produced by the PromptVault lab.')
  const arms = {}
  for (const name of [control, guided]) arms[name] = readArm(input.variants[name], 'n', 'sum')
  const seen = arms[control].seen + arms[guided].seen
  const saved = arms[control].saved + arms[guided].saved
  check(seen === input.enrolled && saved === input.converted, 'The warehouse totals do not match its variation counts.')
  const inference = input.inference?.[guided] ?? null
  if (inference) check([inference.chance_to_win, inference.ci_low, inference.ci_high].every(Number.isFinite) &&
    inference.chance_to_win >= 0 && inference.chance_to_win <= 1 && inference.ci_low <= inference.ci_high,
    'The warehouse probability or interval is invalid.')
  return { kind: 'warehouse', arms, seen, saved, date: input.as_of, usable: true, inference }
}

export function changes(run) {
  if (!run.usable || !run.arms[control].seen || !run.arms[guided].seen) return { difference: null, lift: null }
  const base = run.arms[control].saved / run.arms[control].seen
  const treatment = run.arms[guided].saved / run.arms[guided].seen
  return { difference: treatment - base, lift: base ? (treatment - base) / base : null }
}

function valueRows(run) {
  const data = changes(run)
  const rates = [control, guided].map(name => {
    const { seen, saved } = run.arms[name]
    if (!run.usable) return 'Delivery incomplete'
    return saved + ' / ' + seen + (seen ? ' · ' + rateFormat.format(saved / seen * 100) + '%' : '')
  })
  const inference = run.inference
  const pending = run.kind === 'receipt' ? 'See Flagsmith results' : 'Collecting data'
  return [...rates,
    data.difference == null ? 'Unavailable' : signed(data.difference * 100, rateFormat) + ' pp',
    data.lift == null ? 'Unavailable' : signed(data.lift * 100) + '%',
    inference ? percent(inference.chance_to_win) : pending,
    inference ? signed(inference.ci_low * 100) + '% to ' + signed(inference.ci_high * 100) + '%' : pending]
}

// Both intervals use the same relative-lift axis. Include zero and the measured
// estimates even when a posterior is asymmetric.
export function intervalScale(runs) {
  const points = [0]
  for (const run of runs) {
    if (!run.inference) continue
    points.push(run.inference.ci_low, run.inference.ci_high)
    const estimate = changes(run).lift
    if (estimate !== null) points.push(estimate)
  }
  const min = Math.min(...points), max = Math.max(...points)
  const pad = Math.max((max - min) * .06, .01)
  const low = min - pad, high = max + pad
  return value => 100 * (value - low) / (high - low)
}

export function comparisonCsv(namedRuns) {
  const columns = ['source', 'traffic', 'as_of_utc', 'delivery_or_source', 'arm',
    'exposed', 'first_saves', 'save_rate', 'absolute_gain_pp', 'relative_lift',
    'guided_win_probability', 'relative_lift_ci_low', 'relative_lift_ci_high']
  const rows = [columns]
  for (const [name, run] of namedRuns) {
    const { difference, lift } = changes(run)
    for (const arm of [control, guided]) {
      const { seen, saved } = run.arms[arm]
      const compare = arm === guided && run.usable
      const posterior = compare ? run.inference : null
      rows.push([name, 'synthetic', new Date(run.date).toISOString(),
        run.kind === 'warehouse' ? 'warehouse' : run.usable ? 'acknowledged_receipt' : 'incomplete_receipt', arm,
        run.usable ? seen : null, run.usable ? saved : null, run.usable && seen ? saved / seen : null,
        compare && difference !== null ? difference * 100 : null, compare ? lift : null,
        posterior?.chance_to_win, posterior?.ci_low, posterior?.ci_high])
    }
  }
  return rows.map(row => row.map(value => {
    if (value == null) return ''
    if (typeof value === 'number') return Number(value.toFixed(8)).toString()
    return '"' + String(value).replace(/"/g, '""') + '"'
  }).join(',')).join('\r\n') + '\r\n'
}

function drawIntervals(container, runs) {
  const position = intervalScale(runs.map(([, run]) => run))
  const zero = position(0)
  container.replaceChildren()
  for (const [name, run] of runs) {
    const row = cell('div', '')
    row.className = 'pv-range-row'
    row.append(cell('span', name))
    if (!run.inference) {
      row.append(cell('span', 'Awaiting warehouse interval'))
    } else {
      const track = cell('div', '')
      track.className = 'pv-range-track'
      const centre = cell('i', '')
      centre.className = 'pv-range-zero'
      centre.style.left = zero + '%'
      const band = cell('i', '')
      band.className = 'pv-range-band'
      band.style.left = position(run.inference.ci_low) + '%'
      band.style.width = (position(run.inference.ci_high) - position(run.inference.ci_low)) + '%'
      track.append(band, centre)
      const observed = changes(run).lift
      if (observed !== null) {
        const dot = cell('i', '')
        dot.className = 'pv-range-dot'; dot.style.left = position(observed) + '%'
        track.append(dot)
      }
      row.append(track)
    }
    container.append(row)
  }
}

const rowNames = ['Control · saves / exposed', 'Guided · saves / exposed', 'Absolute change', 'Relative lift', 'Probability guided wins', '95% interval for lift']

export function recordingLine(run) {
  if (!run.usable) return 'The simulator receipt is incomplete. I will check delivery before interpreting arm rates.'
  const a = run.arms[control], b = run.arms[guided], { difference, lift } = changes(run)
  let text = 'In this synthetic ' + (run.kind === 'receipt' ? 'batch' : 'warehouse run') + ', control had ' + a.saved + ' first saves from ' + a.seen +
    ' exposed visitors. Guided had ' + b.saved + ' from ' + b.seen + '. '
  if (difference != null) text += 'The difference was ' + signed(difference * 100, rateFormat) + ' percentage points. '
  if (lift != null) text += 'The observed relative lift was ' + signed(lift * 100) + '%. '
  if (run.inference) {
    const { chance_to_win: chance, ci_low: low, ci_high: high } = run.inference
    text += 'Flagsmith reported a ' + percent(chance) + ' win probability and a 95% credible interval for lift from ' +
      signed(low * 100) + '% to ' + signed(high * 100) + '%. '
    if (low <= 0 && high >= 0) text += 'The interval includes zero. '
  } else text += 'The Bayesian result must come from the warehouse. '
  return text + 'Human impact is still unmeasured.'
}

function cell(tag, text, scope) {
  const node = document.createElement(tag)
  node.textContent = text
  if (scope) node.scope = scope
  return node
}

function download(text, name, type) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export function mountRehearsal({ archive, repeat, sampleMarkdown }) {
  const root = document.getElementById('root')
  if (!root || document.getElementById('pv-record-tools') || new URL(location.href).searchParams.has('study')) return
  const archived = measurement(archive), released = measurement(repeat)
  const bar = document.createElement('aside')
  bar.id = 'pv-record-tools'
  bar.className = 'pv-film-bar'
  bar.setAttribute('aria-label', 'Experiment recording tools')
  bar.innerHTML = '<div><strong>Recording tools</strong><button type="button" data-open="compare" aria-haspopup="dialog">Compare runs</button><button type="button" data-open="sample" aria-haspopup="dialog">Bench template</button></div>'
  root.before(bar)
  const dialog = document.createElement('dialog')
  dialog.className = 'pv-film-dialog'
  dialog.setAttribute('aria-labelledby', 'pv-film-title')
  dialog.innerHTML = [
    '<header><div><p class="pv-eyebrow">Experiment tools</p><h2 id="pv-film-title">Rehearsal desk</h2></div><button type="button" class="pv-close" aria-label="Close rehearsal desk">Close</button></header>',
    '<nav aria-label="Rehearsal views"><button type="button" data-view="compare">Compare runs</button><button type="button" data-view="sample">Bench template</button></nav>',
    '<section data-panel="compare"><h3>How much can the same simulation vary?</h3><p data-intro></p>',
    '<div class="pv-comparison"><table><caption>First workflow save rate · synthetic visitors</caption><thead><tr><th scope="col">Measure</th><th scope="col">Archived run</th><th scope="col" data-current></th></tr></thead><tbody></tbody></table></div>',
    '<p class="pv-status" data-result></p><p class="pv-note">pp means percentage points. A 95% interval crossing zero allows both a loss and a gain.</p>',
    '<details class="pv-ranges"><summary>View credible intervals</summary><p>The line marks zero lift. Bars show the 95% credible intervals. Dots show observed relative lift. The table gives the exact values.</p><div aria-hidden="true" data-ranges></div></details>',
    '<div class="pv-actions"><button type="button" data-line>Copy result summary</button><button type="button" data-csv>Download comparison CSV</button><button type="button" data-reset hidden>Restore release rehearsal</button></div>',
    '<textarea class="pv-manual" aria-label="Select and copy" rows="3" readonly hidden></textarea>',
    '<details class="pv-import"><summary>Compare my own run</summary><label>Simulator receipt or lab warehouse JSON<input type="file" accept=".json,application/json" data-file></label><p>Run the simulator, then use Download run receipt. A receipt shows delivery and observed rates. Bayesian results come from Flagsmith.</p></details>',
    '<p class="pv-errors" role="alert" data-error></p><p class="pv-sources"><a data-archive target="_blank" rel="noreferrer">Archived warehouse run</a><a data-repeat target="_blank" rel="noreferrer">Release warehouse run</a></p></section>',
    '<section data-panel="sample" hidden><h3>Bench-test handoff</h3><p>Turn a board name and test observations into a short handoff for the next builder.</p>',
    '<div class="pv-template"><p class="pv-eyebrow">Reusable prompt</p><pre data-prompt></pre></div>',
    '<div class="pv-actions"><button type="button" data-template>Download bench template</button></div>',
    '<p>Open either onboarding editor, expand <strong>Import a template</strong>, and choose the downloaded file. Review it, use it, then choose <strong>Save workflow</strong>.</p>',
    '<div class="pv-sample-notes"><p><strong>Example board</strong> · ESP32 remote</p><p data-notes></p><button type="button" data-copy-notes>Copy sample observations</button></div>',
    '<textarea class="pv-manual" aria-label="Select and copy example notes" rows="2" readonly hidden></textarea></section>',
    '<p class="pv-feedback" role="status" aria-live="polite"></p>'
  ].join('')
  const one = s => dialog.querySelector(s)
  const all = s => [...dialog.querySelectorAll(s)]
  const feedback = one('.pv-feedback')
  const safeLink = (element, href) => {
    if (/^https:\/\/github\.com\/kotwalsopan158-hue\/promptvault-toggle-wars\/actions\/runs\/[0-9]+$/.test(href)) element.href = href
  }
  safeLink(one('[data-archive]'), archive.ci_url)
  safeLink(one('[data-repeat]'), repeat.ci_url)
  const sampleNotes = 'After reset, the OLED showed READY in two seconds. On the second run the text stayed readable.'
  one('[data-notes]').textContent = sampleNotes
  const prompt = sampleMarkdown.split('\n```text\n')[1]?.split('\n```')[0]
  one('[data-prompt]').textContent = prompt || sampleMarkdown
  let current = released
  let importSequence = 0
  let opener
  function render() {
    const receipt = current.kind === 'receipt'
    const imported = current !== released
    one('[data-intro]').textContent = receipt
      ? 'The archived column shows a warehouse result. Your batch column uses the counts in the selected simulator receipt.'
      : 'Compare two independent synthetic runs. Flagsmith computed their warehouse results separately.'
    one('[data-current]').textContent = imported ? (receipt ? 'Your batch' : 'Your warehouse run') : 'Release rehearsal'
    drawIntervals(one('[data-ranges]'), [['Archive', archived], [one('[data-current]').textContent, current]])
    const body = one('tbody')
    body.replaceChildren()
    const left = valueRows(archived), right = valueRows(current)
    rowNames.forEach((label, i) => {
      const row = document.createElement('tr')
      row.append(cell('th', label, 'row'), cell('td', left[i]), cell('td', right[i]))
      body.append(row)
    })
    const stamp = new Date(current.date).toISOString().replace('T', ' ').slice(0,19) + ' UTC'
    one('[data-result]').textContent = receipt
      ? (current.usable ? 'Ingestion acknowledged this complete batch. ' : 'Incomplete delivery or enrollment. Arm rates are withheld. ') +
        current.accepted.exposures + ' exposures and ' + current.accepted.conversions + ' saves acknowledged. ' + stamp + '.'
      : 'Right column measured ' + stamp + '. Both datasets here contain synthetic traffic.'
    one('[data-reset]').hidden = !imported
    one('[data-repeat]').hidden = imported
    one('[data-panel="compare"] .pv-manual').hidden = true
  }
  function view(which) {
    all('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== which })
    all('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === which)))
    feedback.textContent = ''
  }
  async function copy(text, selector, message) {
    const manual = one(selector)
    manual.hidden = true
    try { await navigator.clipboard.writeText(text); feedback.textContent = message }
    catch {
      manual.hidden = false; manual.value = text; manual.focus(); manual.select()
      feedback.textContent = 'Text selected. Use your browser’s Copy command.'
    }
  }
  bar.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => {
    opener = b
    document.body.append(dialog)
    view(b.dataset.open)
    dialog.showModal()
    one('.pv-close').focus()
  }))
  all('[data-view]').forEach(b => b.addEventListener('click', () => view(b.dataset.view)))
  one('.pv-close').addEventListener('click', () => dialog.close())
  dialog.addEventListener('close', () => {
    dialog.remove()
    opener?.focus()
  })
  one('[data-line]').addEventListener('click', () => copy(recordingLine(current), '[data-panel="compare"] .pv-manual', 'Result summary copied.'))
  one('[data-csv]').addEventListener('click', () => {
    download(comparisonCsv([['Archived run', archived], [one('[data-current]').textContent, current]]),
      'PromptVault-comparison.csv', 'text/csv;charset=utf-8')
    feedback.textContent = 'Comparison CSV prepared for download.'
  })
  one('[data-copy-notes]').addEventListener('click', () => copy(sampleNotes, '[data-panel="sample"] .pv-manual', 'Sample observations copied.'))
  one('[data-template]').addEventListener('click', () => {
    download(sampleMarkdown, 'Bench-test-handoff.md', 'text/markdown;charset=utf-8')
    feedback.textContent = 'Bench-test template prepared for download.'
  })
  one('[data-file]').addEventListener('change', async e => {
    const id = ++importSequence, file = e.target.files?.[0]
    one('[data-error]').textContent = ''; feedback.textContent = ''
    if (!file) return
    try {
      check(file.size <= 128 * 1024, 'Choose a JSON file of 128 KiB or less.')
      let data
      try { data = JSON.parse((await file.text()).replace(/^\uFEFF/, '')) }
      catch { throw Error('The selected file could not be read as JSON.') }
      const run = measurement(data)
      if (id !== importSequence) return
      current = run; render(); feedback.textContent = 'Comparison updated.'
    } catch (err) { if (id === importSequence) one('[data-error]').textContent = err.message }
    finally { if (id === importSequence) e.target.value = '' }
  })
  one('[data-reset]').addEventListener('click', () => {
    ++importSequence; current = released; render(); one('[data-error]').textContent = ''; feedback.textContent = 'Release rehearsal restored.'
  })
  render(); view('compare')
}
