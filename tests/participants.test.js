import test from 'node:test'
import assert from 'node:assert/strict'
import { participantUrl, routingFor, verifyStudyFlag } from '../src/study.js'
import { createVisitorTrace, EXPOSURE } from '../src/visitor-trace.js'
import { FLAG, EVENT } from '../src/experiment.js'
import { markdownTemplate, readMarkdownTemplate } from '../src/export-template.js'

const studyKey = 'R'.repeat(22)
const demoKey = 'D'.repeat(22)
const root = 'https://example.test/promptvault/?old=abc#participants'

test('participant links carry only the research key and keep workspaces separate', () => {
  const url = participantUrl(root, ' ' + studyKey + ' ', demoKey)
  assert.equal(url.href, 'https://example.test/promptvault/?study=' + studyKey)
  const participant = routingFor(url.href, 'demo', demoKey, 'an-old-demo-key')
  assert.equal(participant.demo, false)
  assert.equal(participant.environment, studyKey)
  assert.notEqual(participant.identityKey, 'user_id')
  assert.equal(routingFor(root, 'demo', '', demoKey).identityKey, 'user_id')
  assert.equal(routingFor(root, 'demo', '', demoKey).environment, demoKey)
  assert(routingFor(new URL('?study=' + demoKey, root).href, 'demo', '', demoKey).invalidLink)
  assert.equal(routingFor(url.href, 'research', 'pinned-research', demoKey).environment, 'pinned-research')
  assert.throws(() => participantUrl(root, demoKey, demoKey), /separate/)
  assert.throws(() => participantUrl(root, 'ser.' + studyKey, demoKey), /client-side/)
  assert.throws(() => participantUrl('file:///PromptVault.html', studyKey, demoKey), /hosted app/)
  for (const query of ['?study=', '?study=bad', '?study=' + demoKey, '?study=' + studyKey + '&study=' + studyKey]) {
    const route = routingFor(new URL(query, root).href, 'demo', demoKey, 'old')
    assert.equal(route.demo, false)
    assert.equal(route.environment, '')
    assert(route.invalidLink)
  }
})

test('the study-link check reads the environment flag without evaluating an identity', async () => {
  const base = 'https://example.test/api/v1'
  const request = async (url, init) => {
    assert.equal(url, base + '/flags/')
    assert.deepEqual(init.headers, { 'X-Environment-Key': studyKey })
    return Response.json([{ feature: { name: FLAG }, enabled: true, feature_state_value: 'control' }])
  }
  await verifyStudyFlag(studyKey, base, request)
  await assert.rejects(verifyStudyFlag(studyKey, base, () => Response.json([])), /Enable onboarding/)
  await assert.rejects(verifyStudyFlag(studyKey, base, () => new Response('', { status: 403 })), /could not open/)
})

test('trace matches visitor, experiment, arm and per-event delivery; successful retries prevail', () => {
  const map = new Map()
  const storage = { getItem: k => map.get(k), setItem: (k,v) => map.set(k,v), removeItem: k => map.delete(k) }
  const trace = createVisitorTrace(storage)
  const arm = { enrolled: true, experimentId: 17, variant: 'guided_templates' }
  trace.begin('pv_current', arm, demoKey)
  trace.queued(EXPOSURE)
  trace.queued(EVENT)
  const shared = { identifier: 'pv_current', metadata: { experiment_id: 17 } }
  const exposure = { ...shared, event: EXPOSURE, feature_name: FLAG, value: 'guided_templates' }
  const save = { ...shared, event: EVENT, extra: 'private content' }
  for (const e of [{ ...exposure, value: 'control' }, { ...save, identifier: 'sim_other' }, { ...save, metadata: { experiment_id: 19 } }]) {
    trace.delivery([e], 202, { accepted: 1, rejected: [] })
  }
  assert.equal(trace.snapshot().events[EVENT].status, 'queued')
  trace.delivery([exposure, save], 202, { accepted: 1, rejected: [{ index: 1 }] })
  assert.equal(trace.snapshot().events[EXPOSURE].status, 'acknowledged')
  assert.equal(trace.snapshot().events[EVENT].status, 'rejected')
  trace.delivery([save], 503, null)
  assert.equal(trace.snapshot().events[EVENT].status, 'unconfirmed')
  for (const payload of [undefined, null, { accepted: 2, rejected: [] }]) {
    trace.delivery([save], 202, payload)
    assert.equal(trace.snapshot().events[EVENT].status, 'unconfirmed')
  }
  trace.delivery([save], 202, { accepted: 1, rejected: [] })
  trace.delivery([save], 500, null)
  assert.equal(trace.snapshot().events[EVENT].status, 'acknowledged')
  const reopened = createVisitorTrace(storage)
  reopened.begin('pv_current', arm, demoKey)
  assert.deepEqual(reopened.snapshot(), trace.snapshot())
  assert(!JSON.stringify(reopened.snapshot()).includes('private content'))
  reopened.begin('pv_new', arm, demoKey)
  assert.deepEqual(reopened.snapshot().events, {})
  reopened.begin('pv_new', { enrolled: false }, demoKey)
  assert.equal(reopened.snapshot(), null)
})

test('old Markdown exports round-trip Unicode, escaping, literal code fences and line endings', () => {
  const saved = { title: 'माझे [notes] \\ test #1!', prompt: 'Summarize {{notes}}.\n````js\nconst check = "$&"\n````\n## Reusable prompt' }
  const markdown = markdownTemplate(saved)
  assert.deepEqual(readMarkdownTemplate('\uFEFF' + markdown.replace(/\n/g, '\r\n')), saved)
  assert.throws(() => readMarkdownTemplate(markdown + '\nignored content'), /exported by PromptVault/)
  assert.throws(() => readMarkdownTemplate('# title\n\nA plain note'), /exported by PromptVault/)
  assert.throws(() => readMarkdownTemplate(markdownTemplate({ title: 'x'.repeat(101), prompt: 'ok' })), /Enter a title/)
})
