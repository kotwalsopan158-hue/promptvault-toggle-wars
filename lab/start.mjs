import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { ensureExperiment, waitForApi } from './setup.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
process.chdir(root)
const stateDir = '.promptvault-lab'
const stateFile = stateDir + '/credentials.json'
const stopping = process.argv.includes('--stop')
if (stopping && !existsSync(stateFile)) process.exit(0)
mkdirSync(stateDir, { recursive: true, mode: 0o700 })
if (!existsSync(stateFile)) {
  const generate = () => randomBytes(32).toString('hex')
  const state = {
    email: 'builder@promptvault.test', password: generate(),
    PROMPTVAULT_DB_PASSWORD: generate(), PROMPTVAULT_DJANGO_KEY: generate(),
    PROMPTVAULT_WAREHOUSE_KEY: generate(),
  }
  writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
}
const state = JSON.parse(readFileSync(stateFile, 'utf8'))
const dockerEnv = { ...process.env,
  PROMPTVAULT_DB_PASSWORD: state.PROMPTVAULT_DB_PASSWORD,
  PROMPTVAULT_DJANGO_KEY: state.PROMPTVAULT_DJANGO_KEY,
  PROMPTVAULT_WAREHOUSE_KEY: state.PROMPTVAULT_WAREHOUSE_KEY,
}
function compose(...args) {
  const result = spawnSync('docker', ['compose', '-f', 'lab/compose.yml', ...args], { stdio: 'inherit', env: dockerEnv })
  if (result.status !== 0) throw Error('Docker Compose failed. Start Docker Desktop or Docker Engine and check local port 8000.')
}
if (stopping) {
  compose('stop')
} else {
  compose('up', '-d')
  await waitForApi()
  const lab = await ensureExperiment(state)
  const participant = await ensureExperiment(state, 'Participant rehearsal')
  const browser = {
    VITE_FLAGSMITH_ENV_ID: lab.environment,
    VITE_TRAFFIC_MODE: 'demo',
    VITE_FLAGSMITH_API_URL: 'http://127.0.0.1:8000/api/v1/',
    VITE_FLAGSMITH_EVENTS_URL: 'http://127.0.0.1:8000/api/',
  }
  writeFileSync(stateDir + '/browser.env', Object.entries(browser).map(([k, v]) => k + '=' + v).join('\n') + '\n')
  writeFileSync(stateDir + '/experiment.json', JSON.stringify(lab, null, 2))
  writeFileSync(stateDir + '/participant.json', JSON.stringify(participant, null, 2))
  chmodSync(stateFile, 0o600)
  console.log('Flagsmith is running at http://localhost:8000. Local dashboard login details are in ' + stateFile + '.')
  if (!process.argv.includes('--prepare')) {
    console.log('Open http://localhost:5173 for PromptVault. The demo environment allows synthetic traffic.')
    console.log('Open http://localhost:5173/?study=' + participant.environment + ' for the isolated participant rehearsal.')
    await delay(30)
    const child = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
      stdio: 'inherit', env: { ...process.env, ...browser },
    })
    process.exitCode = child.status ?? 0
  }
}
