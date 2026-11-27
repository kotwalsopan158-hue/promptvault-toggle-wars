import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const inspect = page => page.getByRole('button', { name: 'Experiment inspector', exact: true }).click()
const close = page => page.getByRole('button', { name: 'Close inspector' }).click()
const savedEvent = 'first_workflow_created'

async function mockCloud(page, choose, { enrolled = true, outage = false, rejectSave = false } = {}) {
  const events = []
  await page.addInitScript(key => sessionStorage.setItem('promptvault.demo.environment', key), randomUUID())
  await page.route('https://**.flagsmith.com/**', async route => {
    const url = new URL(route.request().url())
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' }
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (url.pathname.endsWith('/v1/events')) {
      const batch = route.request().postDataJSON().events
      events.push(...batch)
      const rejected = batch.flatMap((e, index) => rejectSave && e.event === savedEvent ? [{ index }] : [])
      return route.fulfill({ status: 202, json: { accepted: batch.length - rejected.length, rejected }, headers })
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
    if (/\/flags\/?$/.test(url.pathname)) return route.fulfill({ headers, json: [
      { feature: { name: 'onboarding_empty_state' }, enabled: true, feature_state_value: 'control' },
    ] })
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
  await expect(page.getByText('Fallback · local control')).toBeVisible()
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
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export saved template (.md)' }).click()
  const file = await downloading
  expect(file.suggestedFilename()).toBe('promptvault-meeting-notes.md')
  const markdown = await readFile(await file.path(), 'utf8')
  expect(markdown).toContain('Summarize {{notes}} for {{audience}}.')
  expect(markdown).not.toContain('The launch is Friday')
  await page.reload()
  await page.getByRole('button', { name: 'Fill inputs for Meeting notes' }).click()
  await expect(page.getByLabel('notes', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Reusable prompt')).toHaveValue('Summarize {{notes}} for {{audience}}.')
})

test('recorded evidence works offline and identifies synthetic traffic and uncertainty', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/')
  await inspect(page)
  await page.getByRole('button', { name: 'Recorded result' }).click()
  await expect(page.getByRole('heading', { name: 'Did the guided start help?' })).toBeVisible()
  await expect(page.getByText(/Synthetic traffic/)).toBeVisible()
  await expect(page.getByRole('row', { name: /Control 28 \/ 145 19.31%/ })).toBeVisible()
  await expect(page.getByText('88.9%')).toBeVisible()
  await expect(page.getByText(/The interval crosses zero/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Verify the warehouse run' })).toHaveAttribute('href', /actions\/runs\/45919688828$/)
  await page.getByRole('button', { name: 'Visitor & traffic' }).click()
  await expect(page.getByRole('button', { name: 'New Visitor Session' })).toBeVisible()
  await page.goto('/#results')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Did the guided start help?' })).toBeVisible()
})

test('public trace shows a verified scripted example without a demo key', async ({ page }) => {
  await page.goto('/#trace')
  await expect(page.getByText(/Recorded example/)).toBeVisible()
  await expect(page.getByText('Acknowledged', { exact: true })).toHaveCount(2)
  const link = page.getByRole('link', { name: 'Download recorded trace' })
  const uri = await link.getAttribute('href')
  const receipt = JSON.parse(decodeURIComponent(uri.slice(uri.indexOf(',') + 1)))
  expect(receipt.source).toContain('Scripted')
  expect(receipt.trace.events.first_workflow_created.http_status).toBe(202)
  await expect(page.getByRole('link', { name: 'Verify the recorded trace' })).toHaveAttribute('href', receipt.ci_url)
})

test('an invitation enrolls in the research environment and leaves the demo library and ID alone', async ({ page }) => {
  const key = 'R'.repeat(22)
  const events = await mockCloud(page, () => 'guided_templates')
  const evaluatedIn = []
  page.on('request', req => {
    if (new URL(req.url()).pathname.includes('/identities')) evaluatedIn.push(req.headers()['x-environment-key'])
  })
  await page.goto('/#participants')
  await expect(page.getByRole('heading', { name: 'Invite real participants' })).toBeVisible()
  const demoId = await page.evaluate(() => localStorage.getItem('user_id'))
  await page.getByLabel('Public research environment ID').fill(key)
  await page.getByRole('button', { name: 'Check flag and create link' }).click()
  const link = page.getByLabel('Participant link', { exact: true })
  await expect(link).toHaveValue(/\/\?study=R{22}$/)
  expect(events).toHaveLength(0)
  const href = await link.inputValue()
  await page.goto(href)
  const start = page.getByRole('button', { name: 'Use decision brief' })
  await expect(start).toBeVisible()
  await expect(page.getByRole('button', { name: 'Experiment inspector' })).toHaveCount(0)
  await expect.poll(() => events.length).toBe(1)
  const participantId = events[0].identifier
  expect(participantId).not.toBe(demoId)
  await page.reload()
  await start.click()
  await page.getByLabel('Workflow name').fill('Participant notebook')
  await page.getByRole('button', { name: 'Save workflow' }).click()
  await expect.poll(() => events.filter(e => e.event === savedEvent)).toHaveLength(1)
  const conversion = events.find(e => e.event === savedEvent)
  expect(conversion.identifier).toBe(participantId)
  expect(conversion.metadata.traffic_kind).toBe('human')
  expect(events.every(e => e.identifier === participantId)).toBe(true)
  expect(evaluatedIn.slice(-2)).toEqual([key, key])
  await page.goto('/')
  await expect(page.getByText('No saved workflows yet')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('user_id'))).toBe(demoId)
  await page.goto(href)
  await expect(page.getByRole('button', { name: 'Fill inputs for Participant notebook' })).toBeVisible()
})

for (const rejectSave of [false, true]) {
  test('visitor trace keeps an ' + (rejectSave ? 'explicit rejection' : 'acknowledgment') + ' across refresh', async ({ page }) => {
    await mockCloud(page, () => 'guided_templates', { rejectSave })
    await page.goto('/')
    await page.getByRole('button', { name: 'Use decision brief' }).click()
    await page.getByLabel('Workflow name').fill('Private title')
    await page.getByRole('button', { name: 'Save workflow' }).click()
    await inspect(page)
    await page.getByRole('button', { name: 'Event trace' }).click()
    const trace = page.getByRole('link', { name: 'Download visitor trace' })
    const report = async () => {
      const href = await trace.getAttribute('href')
      return JSON.parse(decodeURIComponent(href.slice(href.indexOf(',') + 1)))
    }
    const expected = rejectSave ? 'rejected' : 'acknowledged'
    await expect.poll(async () => (await report()).events[savedEvent]?.status).toBe(expected)
    const saved = await report()
    expect(saved.events.$flag_exposure.status).toBe('acknowledged')
    expect(saved.events[savedEvent].http_status).toBe(202)
    expect(saved.identifier).toBe(await page.evaluate(() => localStorage.getItem('user_id')))
    expect(JSON.stringify(saved)).not.toContain('Private title')
    await page.reload()
    await inspect(page)
    await page.getByRole('button', { name: 'Event trace' }).click()
    expect(await report()).toEqual(saved)
  })
}

test('an exported file moves between browser profiles through a reviewable draft', async ({ browser, page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Create workflow' }).click()
  const name = 'Release [check]'
  const prompt = 'Summarize {{notes}}.\n```js\nlog("ok")\n```'
  await page.getByLabel('Workflow name').fill(name)
  await page.getByLabel('Reusable prompt').fill(prompt)
  await page.getByRole('button', { name: 'Save workflow' }).click()
  await page.getByRole('button', { name: 'Fill inputs for ' + name }).click()
  await page.getByLabel('notes', { exact: true }).fill('Private observations')
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export saved template (.md)' }).click()
  const file = await downloading
  const path = await file.path()
  const other = await browser.newContext()
  try {
    const recipient = await other.newPage()
    const events = await mockCloud(recipient, () => 'control')
    await recipient.goto(page.url())
    await recipient.getByRole('button', { name: 'Create workflow' }).click()
    await recipient.getByLabel('Workflow name').fill('Existing draft')
    await recipient.getByText('Import a template', { exact: true }).click()
    const picker = recipient.getByLabel('PromptVault Markdown file')
    await picker.setInputFiles({ name: 'broken.md', mimeType: 'text/markdown', buffer: Buffer.from('A plain note') })
    await expect(recipient.getByRole('alert')).toContainText('exported by PromptVault')
    await picker.setInputFiles(path)
    await expect(recipient.getByRole('heading', { name })).toBeVisible()
    await recipient.getByRole('button', { name: 'Cancel import' }).click()
    await expect(recipient.getByLabel('Workflow name')).toHaveValue('Existing draft')
    await picker.setInputFiles(path)
    await recipient.getByRole('button', { name: 'Use imported template' }).click()
    await expect(recipient.getByLabel('Workflow name')).toHaveValue(name)
    await expect(recipient.getByLabel('Reusable prompt')).toHaveValue(prompt)
    expect(events.filter(e => e.event === savedEvent)).toHaveLength(0)
    await recipient.getByRole('button', { name: 'Save workflow' }).click()
    await expect.poll(() => events.filter(e => e.event === savedEvent)).toHaveLength(1)
    await recipient.getByRole('button', { name: 'Fill inputs for ' + name }).click()
    await expect(recipient.getByLabel('notes', { exact: true })).toHaveValue('')
  } finally { await other.close() }
})
