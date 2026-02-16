import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const composeFile = resolve(process.cwd(), 'docker-compose.test.yml')

const runCommand = (cmd, args, options = {}) =>
  spawnSync(cmd, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    ...options,
  })

const parseArgs = (argv) => {
  const flags = new Set()
  for (const token of argv) {
    const normalized = String(token).trim().toLowerCase()
    if (!normalized) continue
    if (normalized === '--volumes' || normalized === '--with-volumes' || normalized === '--wipe') {
      flags.add('volumes')
    }
  }
  return flags
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

const main = () => {
  if (!existsSync(composeFile)) {
    throw new Error(`Missing compose file: ${composeFile}`)
  }
  const flags = parseArgs(process.argv.slice(2))
  const composeCommand = resolveComposeCommand()
  const downArgs = ['down', '--remove-orphans']
  if (flags.has('volumes')) {
    downArgs.push('--volumes')
  }
  console.log(
    `[test-db-down] stopping postgres test container${flags.has('volumes') ? ' + volumes' : ''}...`
  )
  const downResult = runCommand(composeCommand.cmd, formatComposeArgs(composeCommand, downArgs))
  if ((downResult.status ?? 1) !== 0) {
    const stderr = (downResult.stderr ?? '').trim()
    const stdout = (downResult.stdout ?? '').trim()
    const details = [stdout, stderr].filter(Boolean).join('\n')
    throw new Error(`docker compose down failed${details ? `:\n${details}` : ''}`)
  }
  console.log('[test-db-down] completed.')
}

try {
  main()
} catch (error) {
  console.error('[test-db-down] failed:', error.message)
  process.exit(1)
}
