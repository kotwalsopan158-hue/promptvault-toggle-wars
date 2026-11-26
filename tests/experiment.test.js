import test from 'node:test'
import assert from 'node:assert/strict'
import { CONTROL, GUIDED, FLAG, EVENT, createExperimentClient, simulateVisitors } from '../src/experiment.js'

function sdkFixture(flagFor = () => ({ enabled: true, value: GUIDED, variant: GUIDED, experiment: { id: 7, inExperiment: true } })) {
  const log = { inits: [], exposures: [], saves: [], ids: [], flushes: 0 }
  let id
  const sdk = {
    loadingState: { source: 'SERVER', error: null },
    async init(options) { log.inits.push(options); id = options.identity },
    async identify(value) { id = value; log.ids.push(value) },
    getContext() { return { identity: { identifier: id } } },
    getAllFlags() { return { [FLAG]: flagFor(id) } },
    getValue(key) { assert.equal(key, FLAG); return flagFor(id)?.value },
    getExperimentFlag(key) { assert.equal(key, FLAG); log.exposures.push(id); return flagFor(id) },
    trackEvent(name, options) { assert.equal(name, EVENT); log.saves.push(options) },
    async flushEvents() { log.flushes++ },
  }
  return { sdk, log }
}

test('assignment is read-only until the visible experience calls expose', async () => {
  const { sdk, log } = sdkFixture()
  const api = createExperimentClient(sdk, 'unit-environment')
  const arm = await api.assign('a')
  assert.equal(arm.variant, GUIDED)
  assert.equal(log.exposures.length, 0)
  assert.equal(log.inits[0].enableAnalytics, true)
  assert.equal(log.inits[0].enableEvents, true)
  assert.equal(api.expose('a', arm), true)
  assert.equal(api.convert('a', arm, 'human'), true)
  assert.equal(log.saves[0].identifier, log.exposures[0])
  await api.assign('b')
  assert.equal(api.expose('a', arm), false)
  assert.equal(api.convert('a', arm, 'human'), false)
})

test('missing key, transport errors, cache, bad variation keys and disabled flags suppress enrollment', async () => {
  const brokenFlags = [undefined, { enabled: false, value: CONTROL },
    { enabled: true, value: 'unexpected' }, { enabled: true, value: GUIDED, experiment: { inExperiment: true } }]
  for (const flag of brokenFlags) {
    const { sdk, log } = sdkFixture(() => flag)
    const api = createExperimentClient(sdk, 'unit-environment')
    const result = await api.assign('z')
    assert.equal(result.variant, CONTROL)
    assert.equal(result.source, 'fallback')
    assert.equal(api.expose('z', result), false)
    assert.deepEqual(log.exposures, [])
  }
  const { sdk, log } = sdkFixture()
  assert.equal((await createExperimentClient(sdk, '').assign('offline')).source, 'fallback')
  assert.equal(log.inits.length, 0)
  sdk.loadingState.source = 'CACHE'
  assert.equal((await createExperimentClient(sdk, 'unit-environment').assign('a')).source, 'fallback')
  sdk.init = async () => { throw Error('transport') }
  assert.equal((await createExperimentClient(sdk, 'unit-environment').assign('a')).source, 'fallback')
})

test('a connected identity outside rollout can render its flag without an exposure', async () => {
  const { sdk } = sdkFixture(() => ({ enabled: true, value: CONTROL, experiment: { inExperiment: false } }))
  const api = createExperimentClient(sdk, 'unit-environment')
  const arm = await api.assign('a')
  assert.equal(arm.source, 'live')
  assert.equal(api.expose('a', arm), false)
})

test('one hundred unique synthetic visitors use assigned arms, their own IDs, and a final flush', async () => {
  const { sdk, log } = sdkFixture(id => {
    const variant = Number(id.slice(4)) % 2 ? GUIDED : CONTROL
    return { variant, value: variant, enabled: true, experiment: { id: 2, inExperiment: true } }
  })
  let i = 0
  const stats = await simulateVisitors(createExperimentClient(sdk, 'unit-environment'), () => {},
    () => 'sim_' + i++, () => 0.2)
  assert.equal(new Set(log.exposures).size, 100)
  assert.equal(log.ids.length, 99)
  assert.equal(log.flushes, 4)
  assert.equal(stats.variants.control.conversions, 0)
  assert.equal(stats.variants.guided_templates.conversions, 50)
  assert.equal(log.saves.every(x => log.exposures.includes(x.identifier) && x.metadata.traffic_kind === 'synthetic'), true)
})

test('the simulator stops and flushes partial work when an assignment cannot be verified', async () => {
  const { sdk, log } = sdkFixture()
  sdk.identify = async () => { throw Error('offline') }
  let i = 0
  const stats = await simulateVisitors(createExperimentClient(sdk, 'unit-environment'), () => {}, () => 'sim_' + i++, () => 1)
  assert.equal(stats.attempted, 2)
  assert.equal(stats.skipped, 1)
  assert.equal(log.exposures.length, 1)
  assert.equal(log.flushes, 1)
})
