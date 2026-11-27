import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'

export async function verifyStudyLink(browser, judge, participant, manage) {
  await judge.getByRole('button', { name: 'Participant links' }).click()
  await judge.getByLabel('Public research environment ID').fill(participant.environment)
  await judge.getByRole('button', { name: 'Check flag and create link' }).click()
  const link = judge.getByLabel('Participant link', { exact: true })
  await link.waitFor()
  const url = await link.inputValue()
  assert.equal(new URL(url).searchParams.get('study'), participant.environment)

  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    page.setDefaultTimeout(18000)
    const receipt = type => page.waitForResponse(r => r.request().method() === 'POST' && /\/v1\/events\/?$/.test(r.url())
      && r.ok() && r.request().postDataJSON().events.some(e => e.event === type))
    async function acknowledged(response, type) {
      const ack = await response.json()
      const events = response.request().postDataJSON().events
      assert.equal(ack.accepted, events.length)
      assert.deepEqual(ack.rejected, [])
      return events.find(e => e.event === type)
    }
    const exposed = receipt('$flag_exposure')
    await page.goto(url)
    const first = await acknowledged(await exposed, '$flag_exposure')
    assert.equal(first.metadata.experiment_id, participant.experiment)
    assert.equal(await page.getByRole('button', { name: 'Experiment inspector' }).count(), 0)
    const again = receipt('$flag_exposure')
    await page.reload()
    const second = await acknowledged(await again, '$flag_exposure')
    assert.equal(second.identifier, first.identifier)
    assert.equal(second.value, first.value)
    await page.getByRole('button', { name: /^(Create workflow|Use decision brief)$/ }).click()
    await page.getByLabel('Workflow name').fill('Participant rehearsal')
    await page.getByLabel('Reusable prompt').fill('Summarize {{notes}}.')
    const saved = receipt('first_workflow_created')
    await page.getByRole('button', { name: 'Save workflow' }).click()
    const conversion = await acknowledged(await saved, 'first_workflow_created')
    assert.equal(conversion.identifier, first.identifier)
    assert.equal(conversion.metadata.experiment_id, participant.experiment)
    assert.equal(conversion.metadata.traffic_kind, 'human')
    const detail = 'environments/' + participant.environment + '/experiments/' + participant.experiment + '/results/'
    await manage(detail + 'refresh/', {})
    for (let i = 0; i < 60; i++) {
      const result = (await manage(detail)).results
      if (result?.last_error_at) throw Error('The participant rehearsal warehouse reported a refresh error.')
      const metric = result?.payload?.metrics?.find(m => m.metric_id === participant.metric)
      if (metric) {
        const arms = Object.values(metric.variants)
        assert.equal(arms.reduce((n, a) => n + a.n, 0), 1)
        assert.equal(arms.reduce((n, a) => n + a.sum, 0), 1)
        console.log('PARTICIPANT REHEARSAL VERIFIED: 1 scripted visitor, 2 acknowledged exposures across refresh, 1 first save; warehouse counted 1 exposed and 1 converted. No demo traffic in this experiment.')
        return
      }
      await delay(1000)
    }
    throw Error('The participant rehearsal warehouse did not return its first-save counts.')
  } finally { await context.close() }
}
