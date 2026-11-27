import flagsmith, { createFlagsmithInstance } from '@flagsmith/flagsmith'
import { boundedFetch, createExperimentClient, simulateVisitors } from './experiment.js'
import { createBatchReceipt } from './receipts.js'
import { participantUrl, routingFor, verifyStudyFlag } from './study.js'
import { createVisitorTrace } from './visitor-trace.js'
import { visitorId } from './workspace.js'

const variables = import.meta.env
export const configuredId = (variables.VITE_FLAGSMITH_ENV_ID || '').trim()
const sessionKey = 'promptvault.demo.environment'

function demoOverride() {
  try { return sessionStorage.getItem(sessionKey) || '' } catch { return '' }
}

let activeBatch = null
let simulator
const route = routingFor(location.href, variables.VITE_TRAFFIC_MODE || 'demo', configuredId, demoOverride())
export const { demo: demoMode, environment: environmentID, identityKey, invalidLink } = route
let tabStorage
try { tabStorage = window.sessionStorage } catch { /* Use memory if storage is blocked. */ }
export const visitorTrace = createVisitorTrace(tabStorage)

export async function makeParticipantLink(input) {
  if (!demoMode) throw Error('Open the demo workspace to prepare a study link.')
  const link = participantUrl(location.href, input, environmentID)
  const api = variables.VITE_FLAGSMITH_API_URL || 'https://edge.api.flagsmith.com/api/v1/'
  await verifyStudyFlag(link.searchParams.get('study'), api, boundedFetch)
  return link.href
}

// Both SDK instances use the same transport. Only event batches acknowledged by HTTP
// and carrying this run's unique prefix contribute to the optional simulator receipt.
async function deliveryFetch(url, options) {
  if (options?.method !== 'POST' || !/\/v1\/events\/?$/.test(String(url))) return boundedFetch(url, options)
  let events
  try { events = JSON.parse(options.body).events } catch { /* Preserve the SDK request even when the observer cannot read it. */ }
  if (!Array.isArray(events)) return boundedFetch(url, options)
  let response
  try { response = await boundedFetch(url, options) }
  catch (error) {
    visitorTrace.delivery(events, 0, null)
    throw error
  }
  let acknowledgement
  try {
    const raw = await response.clone().text()
    acknowledgement = raw.trim() ? JSON.parse(raw) : undefined
  } catch { acknowledgement = null }
  if (activeBatch && response.ok) activeBatch.accept(events, acknowledgement)
  visitorTrace.delivery(events, response.status, acknowledgement)
  return response
}

const sdkOptions = { fetch: deliveryFetch }
if (variables.VITE_FLAGSMITH_API_URL) sdkOptions.api = variables.VITE_FLAGSMITH_API_URL
if (variables.VITE_FLAGSMITH_EVENTS_URL) sdkOptions.eventsApiUrl = variables.VITE_FLAGSMITH_EVENTS_URL
export const liveClient = createExperimentClient(flagsmith, environmentID, sdkOptions)

export async function runDemoBatch(onProgress) {
  if (!demoMode || !environmentID) throw new Error('Connect a dedicated demo environment first.')
  if (activeBatch) throw new Error('Another batch is already running.')
  simulator ??= createExperimentClient(createFlagsmithInstance(), environmentID, { ...sdkOptions, batchOnly: true })
  const batch = createBatchReceipt(visitorId('run'))
  activeBatch = batch
  try {
    const stats = await simulateVisitors(simulator, onProgress, batch.nextId)
    return { stats, receipt: batch.finish(stats) }
  } finally { activeBatch = null }
}

export function connectDemo(id) {
  if (!demoMode || configuredId) throw new Error('This build uses its configured environment.')
  const value = id.trim()
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(value)) throw new Error('Enter the public client-side ID from Environment Settings.')
  sessionStorage.setItem(sessionKey, value)
  location.reload()
}

window.addEventListener('pagehide', () => {
  void liveClient.flush().catch(() => {})
  if (simulator) void simulator.flush().catch(() => {})
})
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void liveClient.flush().catch(() => {})
})
