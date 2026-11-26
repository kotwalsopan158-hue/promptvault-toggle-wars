import { CONTROL, EVENT, FLAG, GUIDED, SIMULATED_RATES } from './experiment.js'

export function createBatchReceipt(runId, startedAt = new Date().toISOString()) {
  const prefix = 'sim_' + runId + '_'
  let ordinal = 0
  const exposures = new Set()
  const conversions = new Set()
  const experimentIds = new Set()

  return {
    nextId() { ordinal++; return prefix + ordinal.toString(36) },
    accept(events) {
      for (const e of events) {
        if (typeof e.identifier !== 'string' || !e.identifier.startsWith(prefix)) continue
        if (e.event === '$flag_exposure' && e.feature_name === FLAG && [CONTROL, GUIDED].includes(e.value)) {
          exposures.add(e.identifier)
          if (e.metadata?.experiment_id != null) experimentIds.add(e.metadata.experiment_id)
        }
        if (e.event === EVENT) conversions.add(e.identifier)
      }
    },
    finish(stats) {
      return {
        run_id: runId,
        traffic: 'synthetic',
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        flag: FLAG,
        event: EVENT,
        experiment_ids: [...experimentIds],
        assumed_save_probabilities: SIMULATED_RATES,
        visitors_attempted: stats.attempted,
        visitors_skipped: stats.skipped,
        sdk_queued_by_arm: structuredClone(stats.variants),
        http_accepted_distinct_ids: { exposures: exposures.size, conversions: conversions.size },
        stopped_reason: stats.error || null,
        interpretation: 'HTTP totals count identities in batches acknowledged by ingestion. Verify warehouse counts and Bayesian results in Flagsmith. This batch contains synthetic visitors.',
      }
    },
  }
}
