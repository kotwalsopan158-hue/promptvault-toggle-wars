import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from '@playwright/test'
import { managementClient } from './setup.mjs'
import { verifyStudyLink } from './verify-study.mjs'

const lab = JSON.parse(readFileSync('.promptvault-lab/experiment.json', 'utf8'))
const auth = JSON.parse(readFileSync('.promptvault-lab/credentials.json', 'utf8'))
const manage = await managementClient(auth)
const url = 'http://127.0.0.1:4174'
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4174', '--strictPort'], { stdio: 'inherit' })
let browser
try {
  let ready = false
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) { ready = true; break } } catch { /* Starting Vite. */ }
    await delay(250)
  }
  assert(ready, 'Production preview did not start')
  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 840 } })
  page.setDefaultTimeout(18000)
  const intake = e => /\/v1\/events\/?$/.test(e.url()) && e.request().method() === 'POST'
  page.on('response', r => {
    if (!r.ok() && new URL(r.url()).hostname === '127.0.0.1') console.error('HTTP', r.status(), new URL(r.url()).pathname)
  })
  page.on('requestfailed', request => {
    if (request.url().includes('/events')) console.error('Ingestion transport failed', request.failure()?.errorText)
  })
  page.on('response', async r => {
    if (!intake(r)) return
    const events = r.request().postDataJSON()?.events || []
    console.log('Ingestion POST', r.status(), 'events:', events.length, 'response:', (await r.text().catch(() => '')).slice(0, 200))
  })
  const tracked = type => page.waitForResponse(r => intake(r) && r.ok() && r.request().postDataJSON()?.events?.some(e => e.event === type))
  const exposure = tracked('$flag_exposure')
  await page.goto(url)
  await exposure
  const identity = await page.evaluate(() => localStorage.getItem('user_id'))
  const variant = await page.getByRole('button', { name: /^(Create workflow|Use decision brief)$/ }).textContent()
  const refreshExposure = tracked('$flag_exposure')
  await page.reload()
  await refreshExposure
  assert.equal(await page.evaluate(() => localStorage.getItem('user_id')), identity)
  await page.getByRole('button', { name: variant }).click()
  await page.getByLabel('Workflow name').fill('Release handoff')
  await page.getByLabel('Reusable prompt').fill('Turn {{notes}} into a release handoff.')
  const conversion = tracked('first_workflow_created')
  await page.getByRole('button', { name: 'Save workflow' }).click()
  await conversion

  await page.getByRole('button', { name: 'Experiment inspector', exact: true }).click()
  await page.getByRole('button', { name: 'Event trace' }).click()
  await page.getByText('Acknowledged', { exact: true }).nth(1).waitFor()
  const traceUri = await page.getByRole('link', { name: 'Download visitor trace' }).getAttribute('href')
  const trace = JSON.parse(decodeURIComponent(traceUri.slice(traceUri.indexOf(',') + 1)))
  assert.equal(trace.identifier, identity)
  assert.equal(trace.experiment_id, lab.experiment)
  assert.equal(trace.events.first_workflow_created.status, 'acknowledged')
  const proof = {
    source: 'Scripted visitor in an isolated self-hosted Flagsmith experiment',
    ci_url: process.env.GITHUB_RUN_ID ? 'https://github.com/' + process.env.GITHUB_REPOSITORY + '/actions/runs/' + process.env.GITHUB_RUN_ID : null,
    trace,
  }
  console.log('VISITOR_TRACE_EVIDENCE ' + JSON.stringify(proof))
  await page.getByRole('button', { name: 'Visitor & traffic' }).click()
  const receipts = []
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Simulate 100 Visitors' }).click()
    await page.getByRole('button', { name: 'Simulate 100 Visitors', exact: true }).waitFor({ timeout: 120000 })
    await page.getByRole('link', { name: 'Download run receipt' }).waitFor({ timeout: 120000 })
    const href = await page.getByRole('link', { name: 'Download run receipt' }).getAttribute('href')
    const receipt = JSON.parse(decodeURIComponent(href.slice(href.indexOf(',') + 1)))
    console.log('Batch totals', JSON.stringify({ attempted: receipt.visitors_attempted, skipped: receipt.visitors_skipped, queued: receipt.sdk_queued_by_arm, accepted: receipt.http_accepted_distinct_ids }))
    assert.equal(receipt.http_accepted_distinct_ids.exposures, 100, 'Ingestion must acknowledge every synthetic exposure')
    assert(receipt.all_queued_events_acknowledged, 'Every queued exposure and first save needs an HTTP acknowledgment')
    assert.equal(receipt.visitors_skipped, 0)
    receipts.push(receipt)
  }
  const detail = 'environments/' + lab.environment + '/experiments/' + lab.experiment + '/'
  await delay(1200)
  await manage(detail + 'results/refresh/', {})
  let result
  for (let i = 0; i < 90; i++) {
    result = (await manage(detail + 'results/')).results
    if (result?.last_error_at) throw Error('Flagsmith reported a warehouse refresh error.')
    if (result?.payload?.metrics?.length) break
    await delay(1000)
  }
  assert(result?.payload?.metrics?.length, 'Flagsmith did not return warehouse metrics in time')
  const metric = result.payload.metrics.find(row => row.metric_id === lab.metric)
  const arms = metric.variants
  const totalN = arms.control.n + arms.guided_templates.n
  const totalC = arms.control.sum + arms.guided_templates.sum
  const acceptedC = receipts.reduce((sum, r) => sum + r.http_accepted_distinct_ids.conversions, 0)
  assert.equal(totalN, 301, 'The refresh must deduplicate the repeated exposure of the UI visitor')
  assert.equal(totalC, 1 + acceptedC, 'Warehouse converters must match accepted events')
  const evidence = {
    source: 'Self-hosted Flagsmith 2.295.2 with its PostgreSQL warehouse',
    traffic: 'Automated demonstration: one scripted first save and three batches of 100 synthetic visitors. No human observations.',
    as_of: result.as_of,
    ci_url: process.env.GITHUB_RUN_ID ? 'https://github.com/' + process.env.GITHUB_REPOSITORY + '/actions/runs/' + process.env.GITHUB_RUN_ID : null,
    flag: 'onboarding_empty_state', event: 'first_workflow_created',
    enrolled: totalN, converted: totalC, variants: arms, inference: metric.inference, srm_p_value: result.payload.srm_p_value,
  }
  mkdirSync('lab-output', { recursive: true })
  writeFileSync('lab-output/flagsmith-results.json', JSON.stringify(evidence, null, 2) + '\n')
  writeFileSync('lab-output/run-receipts.json', JSON.stringify(receipts, null, 2) + '\n')
  console.log('FLAGSMITH_EVIDENCE ' + JSON.stringify(evidence))
  const participant = JSON.parse(readFileSync('.promptvault-lab/participant.json', 'utf8'))
  assert.notEqual(participant.environment, lab.environment)
  await verifyStudyLink(browser, page, participant, manage)
} finally {
  await browser?.close()
  server.kill()
}
