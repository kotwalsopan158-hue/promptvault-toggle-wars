import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const site = new URL(process.argv[2])
const browser = await chromium.launch({ channel: 'chrome' })
try {
  const page = await browser.newPage()
  assert.equal((await page.goto(site.href)).status(), 200)
  await page.getByRole('button', { name: 'Create workflow', exact: true }).waitFor()
  await page.goto(new URL('#results', site).href)
  await page.reload()
  await page.getByRole('heading', { name: 'Did the guided start help?' }).waitFor()
  await page.getByText('88.9%').waitFor()
  assert.equal((await page.goto(new URL('watch/', site).href)).status(), 200)
  await page.locator('video').evaluate(async video => { video.muted = true; await video.play() })
  await page.waitForFunction(() => document.querySelector('video').currentTime > 0.3, null, { timeout: 25000 })
  const media = await page.locator('video').evaluate(video => ({ duration: video.duration, width: video.videoWidth, height: video.videoHeight }))
  assert(media.duration > 55 && media.duration < 180 && media.width === 1280 && media.height === 720)
  console.log('Public app, evidence link and video playback verified.', JSON.stringify(media))
} finally { await browser.close() }
