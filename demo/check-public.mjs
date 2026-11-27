import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const site = new URL(process.argv[2])
const browser = await chromium.launch({ channel: 'chrome' })
try {
  const page = await browser.newPage()
  assert.equal((await page.goto(site.href)).status(), 200)
  await page.getByRole('button', { name: 'Create workflow', exact: true }).click()
  await page.getByText('Import a template', { exact: true }).click()
  await page.getByLabel('PromptVault Markdown file').setInputFiles({
    name: 'release.md', mimeType: 'text/markdown',
    buffer: Buffer.from('# Release checklist\n\n## Reusable prompt\n\n```text\nSummarize {{notes}}.\n```\n'),
  })
  await page.getByRole('button', { name: 'Use imported template' }).click()
  assert.equal(await page.getByLabel('Workflow name').inputValue(), 'Release checklist')
  await page.goto(new URL('#participants', site).href)
  await page.getByRole('heading', { name: 'Invite real participants' }).waitFor()
  await page.goto(new URL('#trace', site).href)
  await page.getByText('Acknowledged', { exact: true }).nth(1).waitFor()
  await page.getByRole('link', { name: 'Verify the recorded trace' }).waitFor()
  await page.goto(new URL('#results', site).href)
  await page.reload()
  await page.getByRole('heading', { name: 'Did the guided start help?' }).waitFor()
  await page.getByText('88.9%').waitFor()
  assert.equal((await page.goto(new URL('watch/', site).href)).status(), 200)
  await page.locator('video').evaluate(async video => { video.muted = true; await video.play() })
  await page.waitForFunction(() => document.querySelector('video').currentTime > 0.3, null, { timeout: 25000 })
  const media = await page.locator('video').evaluate(video => ({ duration: video.duration, width: video.videoWidth, height: video.videoHeight }))
  assert(media.duration > 55 && media.duration < 180 && media.width === 1280 && media.height === 720)
  console.log('Public Markdown import, participant link builder, experiment evidence and video playback verified.', JSON.stringify(media))
} finally { await browser.close() }
