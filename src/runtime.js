import flagsmith, { createFlagsmithInstance } from '@flagsmith/flagsmith'
import { boundedFetch, createExperimentClient, simulateVisitors } from './experiment.js'
import { createBatchReceipt } from './receipts.js'
import { visitorId } from './workspace.js'

const variables = import.meta.env
export const demoMode = (variables.VITE_TRAFFIC_MODE || 'demo') === 'demo'
export const configuredId = (variables.VITE_FLAGSMITH_ENV_ID || '').trim()
const sessionKey = 'promptvault.demo.environment'

function demoOverride() {
  try { return sessionStorage.getItem(sessionKey) || '' } catch { return '' }
}

let activeBatch = null
let simulator
export const environmentID = configuredId || (demoMode ? demoOverride() : '')

// Both SDK instances use the same transport. Only event batches acknowledged by HTTP
// and carrying this run's unique prefix contribute to the optional simulator receipt.
async function deliveryFetch(url, options) {
  const response = await boundedFetch(url, options)
  if (options?.method === 'POST' && /\/v1\/events\/?$/.test(String(url))) {
    // The SDK reads only the event HTTP status. Drain the response to release
    // the connection and check whether this batch was partially accepted.
    const body = await response.text()
    if (activeBatch && response.ok) {
      try {
        activeBatch.accept(JSON.parse(options.body).events, body ? JSON.parse(body) : undefined)
      } catch { /* Unreadable acknowledgments cannot substantiate a receipt. */ }
    }
  }
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
