export const FLAG = 'onboarding_empty_state'
export const EVENT = 'first_workflow_created'
export const CONTROL = 'control'
export const GUIDED = 'guided_templates'
export const SIMULATED_RATES = Object.freeze({ [CONTROL]: 0.16, [GUIDED]: 0.29 })

export function fallback(reason) {
  return { variant: CONTROL, source: 'fallback', enrolled: false, reason }
}

// The SDK uses this fetch for both identity resolution and event delivery.
export async function boundedFetch(url, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 6000)
  try {
    const keepalive = options.method === 'POST' && typeof options.body === 'string'
      && new Blob([options.body]).size < 60000
    return await fetch(url, { ...options, keepalive, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

export function createExperimentClient(flagsmith, environmentID) {
  let initialized = false
  let assignedId = null
  let sequence = Promise.resolve()

  async function resolve(id) {
    assignedId = null
    if (!environmentID) return fallback('Add a client-side environment ID to connect.')
    try {
      if (initialized) {
        await flagsmith.identify(id)
      } else {
        await flagsmith.init({
          environmentID, identity: id, enableAnalytics: true, enableEvents: true,
          cacheFlags: false, fetch: boundedFetch,
        })
        initialized = true
      }
      if (flagsmith.getContext().identity?.identifier !== id ||
          flagsmith.loadingState?.source !== 'SERVER' || flagsmith.loadingState.error) {
        return fallback('Flagsmith could not verify this identity.')
      }
      const flag = flagsmith.getAllFlags()[FLAG]
      const value = flagsmith.getValue(FLAG, { skipAnalytics: true })
      if (!flag?.enabled || ![CONTROL, GUIDED].includes(value)) {
        return fallback('The flag is missing, disabled, or has an unsupported value.')
      }
      if (flag.experiment?.inExperiment && flag.variant !== value) {
        return fallback('The experiment variation key and its string value must match.')
      }
      assignedId = id
      return {
        variant: value, source: 'live', enrolled: Boolean(flag.experiment?.inExperiment),
        experimentId: flag.experiment?.id,
        reason: flag.experiment?.inExperiment ? 'Enrolled in the running experiment.' : 'Connected. This identity is outside a running experiment.',
      }
    } catch {
      return fallback('Flagsmith is unreachable. Reload to retry.')
    }
  }

  return {
    // Never read the previous visitor's flags while another identify request is pending.
    assign(id) {
      const result = sequence.then(() => resolve(id))
      sequence = result.catch(() => {})
      return result
    },
    expose(id, assignment) {
      if (!assignment?.enrolled || id !== assignedId) return false
      const live = flagsmith.getAllFlags()[FLAG]
      if (!live?.enabled || !live.experiment?.inExperiment || live.variant !== assignment.variant
        || live.experiment.id !== assignment.experimentId) return false
      const seen = flagsmith.getExperimentFlag(FLAG)
      return seen?.variant === assignment.variant
    },
    convert(id, assignment, trafficKind) {
      if (!assignment?.enrolled || assignedId !== id) return false
      flagsmith.trackEvent(EVENT, {
        identifier: id, metadata: { traffic_kind: trafficKind, experiment_id: assignment.experimentId },
      })
      return true
    },
    flush() { return flagsmith.flushEvents() },
  }
}

export async function simulateVisitors(client, onProgress, newId, random = Math.random) {
  const stats = { attempted: 0, skipped: 0, error: '', variants: {
    [CONTROL]: { exposures: 0, conversions: 0 }, [GUIDED]: { exposures: 0, conversions: 0 },
  } }
  try {
    for (let i = 0; i < 100; i++) {
      const id = newId()
      const assignment = await client.assign(id)
      stats.attempted++
      if (!client.expose(id, assignment)) {
        stats.skipped++
        if (assignment.source === 'fallback') {
          stats.error = assignment.reason
          break
        }
      } else {
        const arm = stats.variants[assignment.variant]
        arm.exposures++
        if (random() < SIMULATED_RATES[assignment.variant] && client.convert(id, assignment, 'synthetic')) {
          arm.conversions++
        }
      }
      onProgress(structuredClone(stats))
    }
  } finally {
    // The SDK may retry and ultimately drop a failed batch. Dashboard counts confirm ingestion.
    await client.flush()
    onProgress(structuredClone(stats))
  }
  return stats
}
