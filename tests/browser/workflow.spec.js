import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'

const inspect = page => page.getByRole('button', { name: 'Experiment inspector', exact: true }).click()
const close = page => page.getByRole('button', { name: 'Close inspector' }).click()
const savedEvent = 'first_workflow_created'

async function mockCloud(page, choose, { enrolled = true, outage = false } = {}) {
  const events = []
  await page.addInitScript(key => sessionStorage.setItem('promptvault.demo.environment', key), randomUUID())
  await page.route('https://**.flagsmith.com/**', async route => {
    const url = new URL(route.request().url())
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' }
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (url.pathname.endsWith('/v1/events')) {
      events.push(...route.request().postDataJSON().events)
      return route.fulfill({ json: {}, headers })
    }
    if (url.pathname.includes('/identities')) {
      if (outage) return route.abort('failed')
      const identifier = url.searchParams.get('identifier')
      const variant = choose(identifier)
      return route.fulfill({ headers, json: { identifier, traits: [], flags: [{
        feature: { id: 9, name: 'onboarding_empty_state' }, enabled: true, feature_state_value: variant,
        variant, metadata: { experiment: { id: 11, name: 'First save', in_experiment: enrolled } },
      }] } })
    }
    return route.fulfill({ headers, json: {} })
  })
  return events
}

test('offline mobile flow saves locally and can preview the guided arm explicitly', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Create your first workflow.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create workflow' })).toBeInViewport()
  await inspect(page)
  await expect(page.getByText('Fallback � local control')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Simulate 100 Visitors' })).toBeDisabled()
  await page.getByRole('button', { name: 'Guided template', exact: true }).click()
  await page.getByRole('button', { name: 'Use decision brief' }).click()
  await expect(page.getByLabel('Workflow name')).toHaveValue('Decision brief')
  await page.getByRole('button', { name: 'Save workflow' }).click()
  await expect(page.getByRole('status')).toContainText('No experiment event')
  await page.reload()
  await expect(page.getByRole('button', { name: /Decision brief Turn my notes/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
})

for (const arm of ['control', 'guided_templates']) {
  test(arm + ' uses one identifier for exposure and first save across reload, edits and later saves', async ({ page }) => {
    const events = await mockCloud(page, () => arm)
    await page.goto('/')
    const button = page.getByRole('button', { name: arm === 'control' ? 'Create workflow' : 'Use decision brief' })
    await expect(button).toBeVisible()
    await expect.poll(() => events.filter(e => e.event === '$flag_exposure').length).toBe(1)
    const id = await page.evaluate(() => localStorage.getItem('user_id'))
    await page.reload()
    await expect(button).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('user_id'))).toBe(id)
    await button.click()
    await expect(page.getByLabel('Workflow name')).toHaveValue(arm === 'control' ? '' : 'Decision brief')
    await page.getByLabel('Workflow name').fill('My brief')
    await page.getByLabel('Reusable prompt').fill('Compare the options.')
    await page.getByRole('button', { name: 'Save workflow' }).click()
    await expect(page.getByRole('status')).toContainText(savedEvent)
    await expect.poll(() => events.filter(e => e.event === savedEvent).length).toBe(1)
    await page.getByRole('button', { name: /My brief Compare the options/ }).click()
    await page.getByRole('button', { name: 'Save workflow' }).click()
    await page.getByRole('button', { name: 'New workflow', exact: true }).click()
    await page.getByLabel('Workflow name').fill('Second')
    await page.getByLabel('Reusable prompt').fill('Draft a reply.')
    await page.getByRole('button', { name: 'Save workflow' }).click()
    await expect(page.getByRole('button', { name: /Second Draft a reply/ })).toBeVisible()
    expect(events.filter(e => e.event === savedEvent)).toHaveLength(1)
    expect(events.every(e => e.identifier === id)).toBeTruthy()
    expect(events.filter(e => e.event === '$flag_exposure').every(e => e.value === arm)).toBeTruthy()
    const before = events.length
    await page.reload()
    await expect(page.getByRole('button', { name: /Second Draft a reply/ })).toBeVisible()
    expect(events).toHaveLength(before)
  })
}

test('simulator sends 100 distinct SDK exposures and leaves the manual visitor intact', async ({ page }) => {
  const events = await mockCloud(page, id => parseInt(id.slice(-1), 16) % 2 ? 'guided_templates' : 'control')
  await page.goto('/')
  await inspect(page)
  const original = await page.evaluate(() => localStorage.getItem('user_id'))
  await page.getByRole('button', { name: 'Simulate 100 Visitors' }).click()
  await expect(page.getByText('Batch finished')).toBeVisible({ timeout: 55000 })
  const synthetic = events.filter(e => e.identifier.startsWith('sim_'))
  const exposed = new Set(synthetic.filter(e => e.event === '$flag_exposure').map(e => e.identifier))
  expect(exposed.size).toBe(100)
  const receiptLink = page.getByRole('link', { name: 'Download run receipt' })
  const url = await receiptLink.getAttribute('href')
  const receipt = JSON.parse(decodeURIComponent(url.slice(url.indexOf(',') + 1)))
  expect(receipt.http_accepted_distinct_ids.exposures).toBe(100)
  expect(receipt.http_accepted_distinct_ids.conversions).toBe(synthetic.filter(e => e.event === savedEvent).length)
  expect(receipt.traffic).toBe('synthetic')
  expect(synthetic.filter(e => e.event === savedEvent).every(e => exposed.has(e.identifier) && e.metadata.traffic_kind === 'synthetic')).toBe(true)
  expect(await page.evaluate(() => localStorage.getItem('user_id'))).toBe(original)
  await page.getByRole('button', { name: 'New Visitor Session' }).click()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('user_id'))).not.toBe(original)
  await close(page)
  await expect(page.getByRole('heading', { name: /Create your first workflow|Start with a decision brief/ })).toBeVisible()
})

for (const condition of ['outage', 'unassigned']) {
  test(condition + ' leaves first save usable and telemetry silent', async ({ page }) => {
    const events = await mockCloud(page, () => 'control', { enrolled: false, outage: condition === 'outage' })
    await page.goto('/')
    await page.getByRole('button', { name: 'Create workflow' }).click()
    await page.getByLabel('Workflow name').fill('Offline')
    await page.getByLabel('Reusable prompt').fill('Summarize.')
    await page.getByRole('button', { name: 'Save workflow' }).click()
    await expect(page.getByRole('status')).toContainText('No experiment event')
    expect(events).toHaveLength(0)
  })
}


test('a saved prompt fills reusable fields locally while retaining its template', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Create workflow' }).click()
  await page.getByLabel('Workflow name').fill('Meeting notes')
  await page.getByLabel('Reusable prompt').fill('Summarize {{notes}} for {{audience}}.')
  await page.getByRole('button', { name: 'Save workflow' }).click()
  await page.getByRole('button', { name: 'Fill inputs for Meeting notes' }).click()
  await page.getByLabel('notes', { exact: true }).fill('The launch is Friday')
  await page.getByLabel('audience', { exact: true }).fill('the design team')
  await expect(page.getByLabel('Ready-to-use prompt')).toHaveValue('Summarize The launch is Friday for the design team.')
  await expect(page.getByRole('button', { name: 'Copy finished prompt' })).toBeEnabled()
  await page.reload()
  await page.getByRole('button', { name: 'Fill inputs for Meeting notes' }).click()
  await expect(page.getByLabel('notes', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Reusable prompt')).toHaveValue('Summarize {{notes}} for {{audience}}.')
})
