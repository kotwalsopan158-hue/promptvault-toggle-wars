import flagsmith, { createFlagsmithInstance } from '@flagsmith/flagsmith'
import { createExperimentClient } from './experiment'

const variables = import.meta.env
export const demoMode = (variables.VITE_TRAFFIC_MODE || 'demo') === 'demo'
export const configuredId = (variables.VITE_FLAGSMITH_ENV_ID || '').trim()
const sessionKey = 'promptvault.demo.environment'

function demoOverride() {
  try { return sessionStorage.getItem(sessionKey) || '' } catch { return '' }
}

export const environmentID = configuredId || (demoMode ? demoOverride() : '')
export const liveClient = createExperimentClient(flagsmith, environmentID)
let simulator
export function simulationClient() {
  if (!demoMode || !environmentID) throw new Error('Connect a dedicated demo environment first.')
  simulator ??= createExperimentClient(createFlagsmithInstance(), environmentID)
  return simulator
}

export function connectDemo(id) {
  if (!demoMode || configuredId) throw new Error('This build uses its configured environment.')
  const value = id.trim()
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(value) || value.startsWith('ser.')) {
    throw new Error('Enter the public client-side ID from Environment Settings.')
  }
  sessionStorage.setItem(sessionKey, value)
  location.reload()
}

function flushPage() {
  void liveClient.flush().catch(() => {})
  if (simulator) void simulator.flush().catch(() => {})
}
window.addEventListener('pagehide', flushPage)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushPage()
})
