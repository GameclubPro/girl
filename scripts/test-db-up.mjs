import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const composeFile = resolve(process.cwd(), 'docker-compose.test.yml')
const SERVICE_NAME = 'postgres'
const HEALTH_TIMEOUT_MS = 90_000
const HEALTH_POLL_MS = 1_500

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))

const runCommand = (cmd, args, options = {}) =>
  spawnSync(cmd, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    ...options,
  })

const ensureCommandSuccess = (result, label) => {
  if ((result.status ?? 1) === 0) return
  const stderr = (result.stderr ?? '').trim()
  const stdout = (result.stdout ?? '').trim()
  const details = [stdout, stderr].filter(Boolean).join('\n')
  throw new Error(`${label} failed${details ? `:\n${details}` : ''}`)
}

const resolveComposeCommand = () => {
  const dockerComposeCheck = runCommand('docker', ['compose', 'version'])
  if (dockerComposeCheck.status === 0) {
    return { cmd: 'docker', prefixArgs: ['compose'] }
  }
  const legacyComposeCheck = runCommand('docker-compose', ['version'])
  if (legacyComposeCheck.status === 0) {
    return { cmd: 'docker-compose', prefixArgs: [] }
  }
  throw new Error('Docker compose command not found (expected `docker compose` or `docker-compose`).')
}

const formatComposeArgs = (base, args) => [...base.prefixArgs, '-f', composeFile, ...args]

const waitForHealthyContainer = async (composeCommand) => {
  const containerResult = runCommand(
    composeCommand.cmd,
    formatComposeArgs(composeCommand, ['ps', '-q', SERVICE_NAME])
  )
  ensureCommandSuccess(containerResult, 'Resolve postgres container id')
  const containerId = (containerResult.stdout ?? '').trim()
  if (!containerId) {
    throw new Error('Postgres container id is empty after docker compose up.')
  }

  const deadline = Date.now() + HEALTH_TIMEOUT_MS
  while (Date.now() < deadline) {
    const healthResult = runCommand('docker', [
      'inspect',
      '--format',
      '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}',
      containerId,
    ])
    if (healthResult.status === 0) {
      const state = (healthResult.stdout ?? '').trim().toLowerCase()
      if (state === 'healthy' || state === 'running') {
        return
      }
    }
    await sleep(HEALTH_POLL_MS)
  }
  throw new Error(`Timed out waiting for postgres health (${HEALTH_TIMEOUT_MS}ms).`)
}

const main = async () => {
  if (!existsSync(composeFile)) {
    throw new Error(`Missing compose file: ${composeFile}`)
  }
  const composeCommand = resolveComposeCommand()
  console.log('[test-db-up] starting postgres test container...')
  const upResult = runCommand(
    composeCommand.cmd,
    formatComposeArgs(composeCommand, ['up', '-d', SERVICE_NAME])
  )
  ensureCommandSuccess(upResult, 'docker compose up')
  await waitForHealthyContainer(composeCommand)
  console.log('[test-db-up] postgres is healthy.')
}

main().catch((error) => {
  console.error('[test-db-up] failed:', error.message)
  process.exit(1)
})
