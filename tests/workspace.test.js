import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { listWorkflows, saveWorkflow, visitorId } from '../src/workspace.js'

function workflow() { return { id: visitorId('wf'), title: '  Brief  ', prompt: '  Summarize these notes.  ' } }

test('concurrent saves commit both records and return exactly one first save', async () => {
  const id = visitorId()
  const pair = await Promise.all([saveWorkflow(id, workflow()), saveWorkflow(id, workflow())])
  assert.equal(pair.filter(x => x.first).length, 1)
  const rows = await listWorkflows(id)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].title, 'Brief')
  assert.equal((await saveWorkflow(id, { ...rows[0], title: 'Edited' })).first, false)
  assert.equal((await listWorkflows(id)).length, 2)
  assert.deepEqual(await listWorkflows(visitorId()), [])
})

test('invalid saves do not consume activation and a visitor cannot overwrite another owner', async () => {
  const owner = visitorId()
  const form = workflow()
  await assert.rejects(saveWorkflow(owner, { ...form, prompt: '   ' }))
  assert.equal((await saveWorkflow(owner, form)).first, true)
  const other = visitorId()
  await assert.rejects(saveWorkflow(other, { ...form, title: 'Overwrite' }))
  assert.equal((await listWorkflows(owner))[0].title, 'Brief')
  assert.deepEqual(await listWorkflows(other), [])
})
