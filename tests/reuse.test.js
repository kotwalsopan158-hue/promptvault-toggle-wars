import test from 'node:test'
import assert from 'node:assert/strict'
import { fillPrompt, promptFields } from '../src/prompt-inputs.js'
import { createBatchReceipt } from '../src/receipts.js'
import { FLAG, EVENT } from '../src/experiment.js'

test('one input fills every exact field and treats pasted notes as literal text', () => {
  const original = '{{ notes }} then {{notes}} for {{audience}} and {{constructor}}'
  const value = '$&\n{{audience}}'
  assert.deepEqual(promptFields(original), ['notes', 'audience', 'constructor'])
  assert.equal(fillPrompt(original, new Map([['notes', value], ['audience', 'builders']])),
    value + ' then ' + value + ' for builders and {{constructor}}')
  assert.equal(fillPrompt('No variables', new Map()), 'No variables')
})

test('receipt counts only acknowledged identities in its own batch and deduplicates retries', () => {
  const report = createBatchReceipt('run_test')
  const a = report.nextId()
  const b = report.nextId()
  assert.notEqual(a, b)
  const exposure = { identifier: a, feature_name: FLAG, event: '$flag_exposure', value: 'control', metadata: { experiment_id: 5 } }
  const save = { identifier: a, event: EVENT }
  report.accept([exposure, exposure, save, save, { ...save, identifier: 'pv_browser' }, { ...exposure, identifier: 'sim_other_1' }])
  const data = report.finish({ attempted: 2, skipped: 1, error: 'Disconnected', variants: {} })
  assert.deepEqual(data.http_accepted_distinct_ids, { exposures: 1, conversions: 1 })
  assert.deepEqual(data.experiment_ids, [5])
  assert.equal(data.traffic, 'synthetic')
  assert.equal(data.visitors_skipped, 1)
  assert.equal(JSON.stringify(data).includes(a), false)
})

test('a partial acceptance excludes rejected event indexes from the receipt', () => {
  const report = createBatchReceipt('partial')
  const id = report.nextId()
  const events = [
    { identifier: id, event: '$flag_exposure', feature_name: FLAG, value: 'control' },
    { identifier: id, event: EVENT },
  ]
  report.accept(events, { accepted: 1, rejected: [{ index: 1, error: 'Rejected' }] })
  report.accept(events, { accepted: 2, rejected: [{ index: 1 }] })
  const result = report.finish({ variants: { control: { exposures: 1, conversions: 1 } } })
  assert.deepEqual(result.http_accepted_distinct_ids, { exposures: 1, conversions: 0 })
  assert.equal(result.all_queued_events_acknowledged, false)
})
