import { CONTROL, FLAG, GUIDED } from './experiment.js'

// Flagsmith generates 22-character, public client environment IDs. Its server keys use a different format.
const clientKey = /^[A-Za-z0-9]{22}$/

export function routingFor(href, buildMode, configuredId, demoOverride) {
  const params = new URL(href).searchParams
  if (buildMode !== 'demo') {
    return { demo: false, environment: configuredId, identityKey: 'user_id' }
  }
  if (!params.has('study')) {
    return { demo: true, environment: configuredId || demoOverride, identityKey: 'user_id' }
  }
  const keys = params.getAll('study')
  const valid = keys.length === 1 && clientKey.test(keys[0]) && keys[0] !== configuredId && keys[0] !== demoOverride
  return {
    demo: false,
    environment: valid ? keys[0] : '',
    identityKey: 'promptvault.study.' + (valid ? keys[0] : 'offline') + '.user_id',
    invalidLink: !valid,
  }
}

export function participantUrl(href, input, demoEnvironment) {
  const id = input.trim()
  if (!clientKey.test(id)) throw Error('Enter the public client-side ID from your research Environment Settings.')
  if (id === demoEnvironment) throw Error('Choose a separate research environment. This ID is in use for the demo.')
  const link = new URL(href)
  if (!['http:', 'https:'].includes(link.protocol)) throw Error('Open the hosted app or a local web server to create a working participant link.')
  link.search = ''
  link.hash = ''
  link.searchParams.set('study', id)
  return link
}

export async function verifyStudyFlag(environment, base, request) {
  const endpoint = new URL('flags/', base.replace(/\/?$/, '/'))
  const response = await request(endpoint.href, {
    headers: { 'X-Environment-Key': environment },
    referrerPolicy: 'no-referrer',
  })
  if (!response.ok) throw Error('Flagsmith could not open this environment. Check the public client-side ID.')
  const flags = await response.json()
  const flag = Array.isArray(flags) && flags.find(row => row.feature?.name === FLAG)
  if (!flag?.enabled || ![CONTROL, GUIDED].includes(flag.feature_state_value)) {
    throw Error('Enable onboarding_empty_state with a supported value in this research environment, then try again.')
  }
}
