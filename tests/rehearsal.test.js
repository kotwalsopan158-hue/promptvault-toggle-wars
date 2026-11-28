import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { measurement, changes, recordingLine, intervalScale, comparisonCsv } from '../src/rehearsal/desk.mjs'
import { markdownTemplate, readMarkdownTemplate } from '../src/export-template.js'
import { createBatchReceipt } from '../src/receipts.js'
import { CONTROL, GUIDED, FLAG, EVENT } from '../src/experiment.js'

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8')
const archive = JSON.parse(read('evidence/synthetic-flagsmith.json'))
const repeat = JSON.parse(read('evidence/release-rehearsal.json'))

function receipt() {
  const batch = createBatchReceipt('test-desk')
  let stats = { attempted: 100, skipped: 0, variants: { [CONTROL]: { exposures: 50, conversions: 8 }, [GUIDED]: { exposures: 50, conversions: 15 } } }
  const events = []
  for (let i = 0; i < 100; i++) {
    const arm = i < 50 ? CONTROL : GUIDED, id = batch.nextId()
    events.push({ identifier: id, event: '$flag_exposure', feature_name: FLAG, value: arm, metadata: { experiment_id: 1 } })
    if (i % 50 < stats.variants[arm].conversions) events.push({ identifier: id, event: EVENT })
  }
  batch.accept(events, { accepted: events.length, rejected: [] })
  return batch.finish(stats)
}

test('warehouse runs report directly observed effects and retain their own inference', () => {
  const a = measurement(archive), b = measurement(repeat)
  assert.equal(a.seen, 301); assert.equal(a.saved, 69); assert.equal(b.seen, 301); assert.equal(b.saved, 64)
  assert.equal((changes(a).difference * 100).toFixed(2), '6.97')
  assert.equal((changes(b).lift * 100).toFixed(1), '81.7')
  assert.equal(b.inference.chance_to_win, repeat.inference.guided_templates.chance_to_win)
  assert.match(recordingLine(b), /97.4% win probability/)
  assert.match(recordingLine(b), /interval includes zero/)
})

test('an actual simulator receipt yields descriptive rates and defers Bayesian inference', () => {
  const run = measurement(receipt())
  assert.equal(run.usable, true)
  assert.equal(Math.round(changes(run).difference * 100), 14)
  assert.equal(run.inference, null)
  assert.match(recordingLine(run), /must come from the warehouse/)
})

test('partial, stopped or mixed-experiment delivery withholds comparative rates', () => {
  for (const patch of [
    { http_accepted_distinct_ids: { exposures: 99, conversions: 23 } },
    { experiment_ids: [1, 2] }, { stopped_reason: 'Disconnected' }, { all_queued_events_acknowledged: false },
  ]) {
    const run = measurement({ ...receipt(), ...patch })
    assert.equal(run.usable, false); assert.deepEqual(changes(run), { difference: null, lift: null })
    assert.match(recordingLine(run), /incomplete/)
  }
})

test('invalid receipts, unknown events, warehouse totals and unsupported imports are rejected', () => {
  for (const file of [null, [], { ...receipt(), event: 'other' }, { ...archive, converted: 4 },
    { ...archive, traffic: 'human' }, { ...receipt(), visitors_skipped: -1 },
    { ...receipt(), sdk_queued_by_arm: { control: { exposures: 1, conversions: 2 } } },
    { ...repeat, inference: { guided_templates: { ci_low: 8, ci_high: 1, chance_to_win: 5 } } }]) {
    assert.throws(() => measurement(file))
  }
})

test('zero baseline and empty arms cannot create an infinite lift or a made-up interval', () => {
  const zero = structuredClone(archive)
  zero.variants.control.sum = 0; zero.converted = 41; zero.inference = {}
  const run = measurement(zero)
  assert.equal(changes(run).lift, null); assert.equal(run.inference, null)
  zero.variants.control.n = 0; zero.enrolled = 156
  assert.equal(changes(measurement(zero)).difference, null)
})

test("the bench file round-trips through the app's real importer and exporter", () => {
  const file = read('examples/Bench-test-handoff.md').replace(/\r\n/g, '\n')
  const draft = readMarkdownTemplate(file)
  assert.equal(draft.title, 'Bench-test handoff')
  assert(draft.prompt.includes('{{board}}') && draft.prompt.includes('{{observations}}'))
  assert(!draft.prompt.includes('OLED showed READY'))
  assert.deepEqual(readMarkdownTemplate(markdownTemplate(draft)), draft)
})

test('intervals and point estimates share an axis with an interior zero', () => {
  const runs = [measurement(archive), measurement(repeat)]
  const pos = intervalScale(runs)
  for (const run of runs) {
    assert(pos(run.inference.ci_low) > 0 && pos(run.inference.ci_high) < 100)
    assert(pos(run.inference.ci_low) < pos(0) && pos(0) < pos(run.inference.ci_high))
    assert(pos(changes(run).lift) > pos(0))
  }
  assert.equal(intervalScale([])(0), 50)
})

test('CSV retains four rows, original arm counts and only warehouse probabilities', () => {
  const csv = comparisonCsv([['Archived run', measurement(archive)], ['Your batch', measurement(receipt())]])
  const lines = csv.trimEnd().split('\r\n').map(row => row.split(','))
  assert.equal(lines.length, 5)
  assert(lines.every(row => row.length === 13))
  assert.deepEqual(lines[1].slice(5, 7), ['145', '28'])
  assert.equal(Number(lines[2][8]).toFixed(2), '6.97')
  assert.equal(Number(lines[2][10]).toFixed(3), '0.889')
  assert.deepEqual(lines[4].slice(10), ['', '', ''])
  const partial = measurement({ ...receipt(), stopped_reason: 'Stopped' })
  assert.match(comparisonCsv([['Your batch', partial]]), /"incomplete_receipt","guided_templates",,,,,,,,/)
})
