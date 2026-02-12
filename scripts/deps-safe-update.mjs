import { existsSync, renameSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const parseArgs = (tokens) => {
  const values = new Map()
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (!token.startsWith('--')) continue
    const [key, inlineValue] = token.slice(2).split('=', 2)
    if (inlineValue !== undefined) {
      values.set(key, inlineValue)
      continue
    }
    const next = tokens[index + 1]
    if (next && !next.startsWith('--')) {
      values.set(key, next)
      index += 1
      continue
    }
    values.set(key, '1')
  }
  return values
}

const runCommand = (label, cmd, commandArgs, cwd) => {
  console.log(`\n[deps-safe-update] ${label}`)
  console.log(`$ (${cwd}) ${cmd} ${commandArgs.join(' ')}`)
  const result = spawnSync(cmd, commandArgs, {
    cwd,
    encoding: 'utf8',
    timeout: commandTimeoutMs,
    killSignal: 'SIGTERM',
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.error) {
    if (result.error.code === 'ETIMEDOUT') {
      const timeoutError = new Error(
        `${label} timed out after ${Math.round(commandTimeoutMs / 1000)}s`
      )
      timeoutError.exitCode = 1
      throw timeoutError
    }
    throw result.error
  }
  return result
}

const ensureSuccess = (result, label) => {
  if ((result.status ?? 1) !== 0) {
    const error = new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`)
    error.exitCode = result.status ?? 1
    throw error
  }
}

const runNpmInstallWithFallback = (cwd) => {
  const first = runCommand('npm install', 'npm', ['install', '--no-audit', '--no-fund'], cwd)
  if ((first.status ?? 1) === 0) {
    return
  }

  const combined = `${first.stdout ?? ''}\n${first.stderr ?? ''}`
  if (!/ENOTEMPTY/i.test(combined)) {
    ensureSuccess(first, `npm install (${cwd})`)
    return
  }

  const nodeModulesPath = resolve(cwd, 'node_modules')
  if (!existsSync(nodeModulesPath)) {
    ensureSuccess(first, `npm install (${cwd})`)
    return
  }

  const backupPath = resolve(cwd, `node_modules.bak.${Date.now()}`)
  renameSync(nodeModulesPath, backupPath)
  console.warn(`[deps-safe-update] ENOTEMPTY fallback: moved node_modules -> ${backupPath}`)

  const second = runCommand(
    'npm install (retry)',
    'npm',
    ['install', '--no-audit', '--no-fund'],
    cwd
  )
  ensureSuccess(second, `npm install retry (${cwd})`)
}

const runSafeUpdate = (cwd, label) => {
  console.log(`\n=== ${label} ===`)
  runNpmInstallWithFallback(cwd)
  ensureSuccess(
    runCommand('npm update', 'npm', ['update', '--no-audit', '--no-fund'], cwd),
    `npm update (${cwd})`
  )
  ensureSuccess(
    runCommand('npm dedupe', 'npm', ['dedupe', '--no-audit', '--no-fund'], cwd),
    `npm dedupe (${cwd})`
  )
}

const args = parseArgs(process.argv.slice(2))
const rootDir = process.cwd()
const botDir = resolve(rootDir, 'bot')
const commandTimeoutMs = Math.max(
  60_000,
  Number.parseInt(args.get('timeoutMs') ?? '420000', 10) || 420000
)

runSafeUpdate(rootDir, 'Root safe update')
runSafeUpdate(botDir, 'Bot safe update')

ensureSuccess(
  runCommand('playwright install chromium', 'npx', ['playwright', 'install', 'chromium'], rootDir),
  'playwright install chromium'
)

const depsCheckArgs = ['scripts/deps-check.mjs']
if (args.get('depsOutDir')) {
  depsCheckArgs.push('--outDir', args.get('depsOutDir'))
}
ensureSuccess(runCommand('deps-check', 'node', depsCheckArgs, rootDir), 'deps-check')

console.log('\n[deps-safe-update] Completed.')
