import { expect, test } from '@playwright/test'
import path from 'node:path'
import { readFile } from 'node:fs/promises'

test('compares two warehouse intervals and exports a loaded batch without Bayesian estimates', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Compare runs', exact: true }).click()
  const desk = page.getByRole('dialog', { name: 'Rehearsal desk' })
  await expect(desk.getByRole('cell', { name: '+81.7%', exact: true })).toBeVisible()
  await desk.getByText('View credible intervals', { exact: true }).click()
  await expect(desk.locator('.pv-range-band')).toHaveCount(2)
  await desk.getByText('Compare my own run', { exact: true }).click()
  await desk.getByLabel('Simulator receipt or lab warehouse JSON').setInputFiles(path.resolve('examples/Recorded-100-visitors.json'))
  await expect(desk.getByText('Comparison updated.', { exact: true })).toBeVisible()
  await expect(desk.getByRole('cell', { name: 'See Flagsmith results' })).toHaveCount(2)
  await expect(desk.locator('.pv-range-band')).toHaveCount(1)
  const downloading = page.waitForEvent('download')
  await desk.getByRole('button', { name: 'Download comparison CSV' }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toBe('PromptVault-comparison.csv')
  const csv = await readFile(await download.path(), 'utf8')
  expect(csv).toContain('"acknowledged_receipt","control",54,8,')
  expect(csv.trim().split(/\r?\n/).at(-1)).toMatch(/,,,$/)
  await desk.getByRole('button', { name: 'Restore release rehearsal' }).click()
  await expect(desk.locator('.pv-range-band')).toHaveCount(2)
  await page.goto('/?study=invalid')
  await expect(page.getByRole('heading', { name: 'Workflow library' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Compare runs' })).toHaveCount(0)
})
