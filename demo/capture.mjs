import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from '@playwright/test'

const output = 'lab-output/film'
const app = 'http://127.0.0.1:4175'
const dashboard = 'http://localhost:8000'
const lab = JSON.parse(await readFile('.promptvault-lab/experiment.json', 'utf8'))
const viewport = { width: 1120, height: 560 }
const shots = []
await mkdir(output, { recursive: true })
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4175', '--strictPort'], { stdio: 'inherit' })
let browser
const button = (page, name) => page.getByRole('button', { name, exact: true })
const inspect = page => button(page, 'Experiment inspector').click()
const ready = page => page.getByRole('heading', { name: 'Workflow library' }).waitFor()

async function demoIdentities() {
  const ids = {}
  for (let i = 0; i < 100 && !(ids.control && ids.guided_templates); i++) {
    const id = 'pv_' + randomBytes(16).toString('hex')
    const response = await fetch(dashboard + '/api/v1/identities/?identifier=' + id, { headers: { 'X-Environment-Key': lab.environment } })
    assert(response.ok, 'Could not read a demo assignment')
    const flag = (await response.json()).flags.find(f => f.feature.name === 'onboarding_empty_state')
    if (flag?.enabled && ['control', 'guided_templates'].includes(flag.feature_state_value)) ids[flag.feature_state_value] = id
  }
  assert(ids.control && ids.guided_templates, 'Both live variants are required to record')
  return ids
}

function emptyLibrary(id) {
  return { cookies: [], origins: [{ origin: app, localStorage: [{ name: 'user_id', value: id }] }] }
}

async function record(key, storageState, prepare, demonstrate) {
  const context = await browser.newContext({ viewport, storageState, recordVideo: { dir: output, size: viewport }, reducedMotion: 'reduce' })
  try {
    const page = await context.newPage()
    page.setDefaultTimeout(15000)
    await prepare(page, context)
    await page.evaluate(() => document.fonts.ready)
    await delay(250)
    const start = performance.now()
    await delay(700)
    await demonstrate(page)
    await delay(800)
    await page.screenshot({ path: output + '/' + key + '.png' })
    const state = await context.storageState({ indexedDB: true })
    const seconds = (performance.now() - start) / 1000
    const video = page.video()
    await context.close()
    shots.push({ key, file: await video.path(), seconds })
    console.log('Captured', key)
    return state
  } finally { await context.close() }
}

async function home(page) { await page.goto(app); await ready(page) }

try {
  let serving = false
  for (let i = 0; i < 60 && !serving; i++) {
    try { serving = (await fetch(app)).ok } catch { await delay(250) }
  }
  assert(serving, 'The recording preview did not start')
  browser = await chromium.launch()
  const ids = await demoIdentities()
  await record('blank', emptyLibrary(ids.control), async page => {
    await home(page)
    await button(page, 'Create workflow').waitFor()
  }, async page => {
    await delay(4100)
    await button(page, 'Create workflow').click()
    assert.equal(await page.getByLabel('Workflow name').inputValue(), '')
    await delay(2100)
  })
  const guided = await record('identity', emptyLibrary(ids.guided_templates), async page => {
    await home(page)
    await button(page, 'Use decision brief').waitFor()
    await inspect(page)
    await page.getByText(ids.guided_templates, { exact: true }).waitFor()
  }, async page => {
    await delay(1600)
    await page.reload()
    await button(page, 'Use decision brief').waitFor()
    await inspect(page)
    await page.getByText(ids.guided_templates, { exact: true }).waitFor()
    await page.getByText('guided_templates', { exact: true }).waitFor()
    await delay(1700)
  })
  const saved = await record('save', guided, async page => {
    await home(page)
    await button(page, 'Use decision brief').waitFor()
  }, async page => {
    await delay(600)
    await button(page, 'Use decision brief').click()
    const title = page.getByLabel('Workflow name')
    await title.fill('')
    await title.pressSequentially('Release handoff', { delay: 75 })
    await delay(1800)
    const sent = page.waitForResponse(r => r.ok() && r.request().method() === 'POST' && r.url().endsWith('/v1/events') &&
      r.request().postDataJSON().events.some(e => e.event === 'first_workflow_created' && e.identifier === ids.guided_templates))
    await button(page, 'Save workflow').click()
    await sent
    await page.getByText(/first_workflow_created queued/).waitFor()
    await delay(1450)
  })
  await record('reuse', saved, async page => {
    await home(page)
    await button(page, 'Fill inputs for Release handoff').click()
  }, async page => {
    await page.getByLabel('notes', { exact: true }).pressSequentially('Release on Friday. One QA slot remains.', { delay: 48 })
    const result = page.getByLabel('Ready-to-use prompt')
    assert((await result.inputValue()).includes('One QA slot remains.'))
    await result.scrollIntoViewIfNeeded()
    await delay(1500)
    const download = page.waitForEvent('download')
    await button(page, 'Export saved template (.md)').click()
    const exported = await download
    const text = await readFile(await exported.path(), 'utf8')
    assert(text.includes('{{notes}}') && !text.includes('One QA slot remains.'))
    await delay(900)
  })
  await record('traffic', saved, async page => {
    await home(page)
    await inspect(page)
    await button(page, 'Simulate 100 Visitors').scrollIntoViewIfNeeded()
  }, async page => {
    await button(page, 'Simulate 100 Visitors').click()
    const link = page.getByRole('link', { name: 'Download run receipt' })
    await link.waitFor({ timeout: 120000 })
    const href = await link.getAttribute('href')
    const receipt = JSON.parse(decodeURIComponent(href.slice(href.indexOf(',') + 1)))
    assert.equal(receipt.http_accepted_distinct_ids.exposures, 100)
    assert(receipt.all_queued_events_acknowledged)
    await link.scrollIntoViewIfNeeded()
    await delay(1600)
  })
  let dashboardView = 'Experiment dashboard'
  await record('warehouse', undefined, async (page, context) => {
    const credentials = JSON.parse(await readFile('.promptvault-lab/credentials.json', 'utf8'))
    const login = await fetch(dashboard + '/api/v1/auth/login/', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: credentials.email, password: credentials.password }) })
    assert(login.ok, 'Local dashboard login failed')
    const { key } = await login.json()
    assert(key, 'Local dashboard did not return a session')
    await context.addCookies([{ name: 't', value: key, url: dashboard }])
    const detailUrl = dashboard + '/project/' + lab.project + '/environment/' + lab.environment + '/experiments/' + lab.experiment
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded' })
    try {
      // A first dashboard visit can land on the organisation picker before the deep link is ready.
      try {
        await page.getByRole('heading', { name: 'Analysis', exact: true }).waitFor({ timeout: 9500 })
      } catch {
        await page.goto(detailUrl, { waitUntil: 'domcontentloaded' })
        await page.getByRole('heading', { name: 'Analysis', exact: true }).waitFor({ timeout: 12000 })
      }
      await page.getByRole('columnheader', { name: 'Exposures' }).first().waitFor({ timeout: 6000 })
      await page.getByRole('heading', { name: 'Results', exact: true }).scrollIntoViewIfNeeded()
    } catch {
      // Keep the live warehouse response readable when the dashboard frontend is unavailable.
      dashboardView = 'Flagsmith results API'
      const resultsUrl = dashboard + '/api/v1/environments/' + lab.environment + '/experiments/' + lab.experiment + '/results/?format=json'
      const response = await context.request.get(resultsUrl, { headers: { Authorization: 'Token ' + key } })
      const data = await response.json()
      const metric = data.results?.payload?.metrics?.find(row => row.metric_id === lab.metric)
      assert(response.ok() && metric?.variants.control.n > 0 && metric?.variants.guided_templates.n > 0, 'Measured results are required')
      await page.goto('about:blank')
      await page.setContent(await readFile('demo/warehouse.html', 'utf8'))
      await page.evaluate(({ result, metric }) => {
        const put = (id, value) => { document.getElementById(id).textContent = value }
        const percent = (fraction, signed = false) => new Intl.NumberFormat('en', {
          style: 'percent', maximumFractionDigits: 1, signDisplay: signed ? 'exceptZero' : 'auto',
        }).format(fraction)
        put('timestamp', new Date(result.as_of).toISOString().replace('T', ' ').slice(0, 19) + ' UTC')
        for (const arm of ['control', 'guided_templates']) {
          const { n, sum } = metric.variants[arm]
          put(arm + '-n', n)
          put(arm + '-sum', sum)
          put(arm + '-rate', percent(sum / n))
        }
        const inference = metric.inference?.guided_templates
        if (inference && [inference.lift, inference.chance_to_win, inference.ci_low, inference.ci_high].every(Number.isFinite)) {
          put('lift', percent(inference.lift, true))
          put('chance', percent(inference.chance_to_win))
          put('interval', percent(inference.ci_low, true) + ' to ' + percent(inference.ci_high, true))
        }
        put('source', JSON.stringify(result, null, 2))
      }, { result: data.results, metric })
    }
  }, async page => {
    await delay(1500)
    if (dashboardView === 'Experiment dashboard') await page.getByRole('heading', { name: 'Analysis', exact: true }).scrollIntoViewIfNeeded()
    else await page.getByText('95% credible interval for lift', { exact: true }).scrollIntoViewIfNeeded()
    await delay(2300)
  })
  await record('evidence', saved, async page => {
    await home(page)
    await inspect(page)
    await button(page, 'Recorded result').click()
    await page.getByRole('heading', { name: 'Did the guided start help?' }).waitFor()
  }, async page => {
    await delay(2400)
    await page.getByText('95% credible interval for lift').scrollIntoViewIfNeeded()
    await page.getByRole('link', { name: 'Verify the warehouse run' }).scrollIntoViewIfNeeded()
    await delay(2600)
  })
  await writeFile(output + '/shots.json', JSON.stringify({ shots, dashboardView }, null, 2))
} finally {
  await browser?.close()
  server.kill()
}
