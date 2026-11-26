import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'

const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  const remote = []
  page.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()) })
  await page.context().setOffline(true)
  await page.goto(pathToFileURL(path.resolve('release/PromptVault.html')).href)
  await page.getByRole('button', { name: 'Create workflow' }).click()
  await page.getByLabel('Workflow name').fill('Offline test')
  await page.getByLabel('Reusable prompt').fill('Summarize {{notes}}.')
  await page.getByRole('button', { name: 'Save workflow' }).click()
  await page.getByRole('button', { name: 'Fill inputs for Offline test' }).waitFor()
  await page.reload()
  await page.getByRole('button', { name: 'Fill inputs for Offline test' }).click()
  await page.getByLabel('notes', { exact: true }).fill('Worked offline.')
  assert.equal(await page.getByLabel('Ready-to-use prompt').inputValue(), 'Summarize Worked offline..')
  assert.deepEqual(remote, [], 'Keyless offline demo must not request remote assets')
  console.log('Portable app passed an offline first save, reload, and prompt reuse check.')
} finally { await browser.close() }
