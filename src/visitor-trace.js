import { EVENT, FLAG } from './experiment.js'
import { rejectedEventIndexes } from './receipts.js'

export const EXPOSURE = '$flag_exposure'
const names = [EXPOSURE, EVENT]
const storageKey = 'promptvault.visitor.trace.v1'
const timestamp = () => new Date().toISOString()

// A tab keeps only the current manual visitor's two events. Raw SDK payloads never enter this store.
export function createVisitorTrace(storage) {
  let trace = null
  let environment = ''
  const listeners = new Set()
  function publish(next) {
    trace = next
    try {
      if (trace) storage?.setItem(storageKey, JSON.stringify({ environment, trace }))
      else storage?.removeItem(storageKey)
    } catch { /* The in-memory trace still works when tab storage is unavailable. */ }
    listeners.forEach(listener => listener())
  }
  return {
    snapshot: () => trace,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    begin(identifier, assignment, env) {
      environment = env
      if (!assignment?.enrolled) { publish(null); return }
      let previous
      try {
        const stored = JSON.parse(storage?.getItem(storageKey) || 'null')
        if (stored?.environment === env) previous = stored.trace
      } catch { /* Start a fresh trace if the tab record is unreadable. */ }
      if (previous?.identifier === identifier && previous.experiment_id === assignment.experimentId
          && previous.variant === assignment.variant && previous.events && typeof previous.events === 'object') {
        publish(previous)
      } else {
        publish({ identifier, experiment_id: assignment.experimentId, flag: FLAG, variant: assignment.variant, events: {} })
      }
    },
    queued(name) {
      if (!trace || !names.includes(name) || trace.events[name]) return
      const row = { queued_at: timestamp(), status: 'queued', response_at: null, http_status: null }
      publish({ ...trace, events: { ...trace.events, [name]: row } })
    },
    delivery(events, status, acknowledgement) {
      if (!trace) return
      const success = status >= 200 && status < 300
      const rejected = success && acknowledgement !== undefined ? rejectedEventIndexes(events, acknowledgement) : null
      const rows = { ...trace.events }
      let changed = false
      for (const [index, event] of events.entries()) {
        if (event.identifier !== trace.identifier || event.metadata?.experiment_id !== trace.experiment_id) continue
        if (!names.includes(event.event)) continue
        if (event.event === EXPOSURE && (event.feature_name !== FLAG || event.value !== trace.variant)) continue
        const row = rows[event.event]
        if (!row || row.status === 'acknowledged') continue
        const delivery = rejected ? (rejected.has(index) ? 'rejected' : 'acknowledged') : 'unconfirmed'
        rows[event.event] = { ...row, status: delivery, response_at: timestamp(), http_status: status || null }
        changed = true
      }
      if (changed) publish({ ...trace, events: rows })
    },
  }
}
