import { setTimeout as delay } from 'node:timers/promises'

const base = 'http://127.0.0.1:8000/api/v1/'
const flag = 'onboarding_empty_state'
const variant = 'guided_templates'
export const hypothesis = 'A ready-to-edit decision brief will lift first workflow saves among new, exposed library visitors by at least five percentage points during 72 hours.'

export async function waitForApi() {
  for (let i = 0; i < 90; i++) {
    try {
      const health = await fetch('http://127.0.0.1:8000/health/liveness/', { signal: AbortSignal.timeout(2000) })
      if (health.ok) return
    } catch { /* The process is still booting. */ }
    await delay(2000)
  }
  throw Error('The local Flagsmith API did not become ready.')
}

function client(token) {
  return async (path, body) => {
    const response = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Token ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(45000),
    })
    const raw = await response.text()
    if (!response.ok) {
      // Authentication bodies can contain sensitive fields. Keep them out of logs.
      const detail = path.startsWith('auth/') || !raw.startsWith('{') ? '' : raw.slice(0,500)
      throw Error('Local setup failed on ' + path.replace(/environments\/[^/]+\//, 'environments/…/') + ' (' + response.status + ') ' + detail)
    }
    return raw ? JSON.parse(raw) : null
  }
}

export async function managementClient(credentials) {
  const anon = client()
  const { email, password } = credentials
  const version = await (await fetch('http://127.0.0.1:8000/version/')).json()
  const first = version.self_hosted_data?.has_users === false
  const login = first
    ? await anon('auth/users/', { email, password, re_password: password, first_name: 'Demo', last_name: 'Owner', superuser: true })
    : await anon('auth/login/', { email, password })
  if (!login?.key) throw Error('Local dashboard login did not return an authentication key.')
  return client(login.key)
}

export async function ensureExperiment(credentials) {
  const api = await managementClient(credentials)
  async function ensure(path, match, body) {
    const response = await api(path)
    const list = Array.isArray(response) ? response : response.results
    return list.find(match) || await api(path, body)
  }
  const named = name => resource => resource.name === name
  const org = await ensure('organisations/', named('PromptVault Lab'), { name: 'PromptVault Lab' })
  const project = await ensure('projects/', named('PromptVault'), { name: 'PromptVault', organisation: org.id })
  const env = await ensure('environments/?project=' + project.id, named('Demo'), { name: 'Demo', project: project.id })
  const scope = 'environments/' + env.api_key + '/'
  await ensure(scope + 'warehouse-connections/', item => item.warehouse_type === 'postgres',
    { warehouse_type: 'postgres', config: { source: 'flagsmith_database' } })
  const featurePath = 'projects/' + project.id + '/features/'
  const feature = await ensure(featurePath, named(flag), { name: flag, type: 'MULTIVARIATE', default_enabled: true, initial_value: 'control' })
  const option = await ensure(featurePath + feature.id + '/mv-options/', item => item.key === variant,
    { feature: feature.id, type: 'unicode', string_value: variant, key: variant, default_percentage_allocation: 0 })
  const metricName = 'First workflow save rate'
  const metric = await ensure(scope + 'experiment-metrics/', named(metricName), { name: metricName, aggregation: 'occurrence',
    direction: 'up', definition: { version: 1, event: 'first_workflow_created' } })
  const expName = 'First workflow onboarding'
  let experiment = await ensure(scope + 'experiments/', named(expName), { feature: feature.id, name: expName, hypothesis,
    metrics: [{ metric: metric.id, expected_direction: 'increase' }], experiment_rollout: {
      enabled: true, rollout_percentage: 100, feature_state_value: { type: 'string', value: 'control' },
      multivariate_feature_state_values: [{ multivariate_feature_option: option.id, percentage_allocation: 50 }],
    } })
  const detail = scope + 'experiments/' + experiment.id + '/'
  if (experiment.status === 'created') await api(detail + 'start/', {})
  experiment = await api(detail)
  if (experiment.status !== 'running') throw Error('The local experiment did not enter its running state.')
  return { project: project.id, environment: env.api_key, experiment: experiment.id, metric: metric.id }
}
