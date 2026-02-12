import { existsSync, readFileSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'

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

const toInt = (value, fallback, min, max) => {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed)) return fallback
  if (parsed < min) return min
  if (parsed > max) return max
  return parsed
}

const toFloat = (value, fallback, min, max) => {
  const parsed = Number.parseFloat(value ?? '')
  if (!Number.isFinite(parsed)) return fallback
  if (parsed < min) return min
  if (parsed > max) return max
  return parsed
}

const ensureSuccess = (result, label) => {
  if (result.error) {
    throw result.error
  }
  if ((result.status ?? 1) !== 0) {
    const error = new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`)
    error.exitCode = result.status ?? 1
    throw error
  }
}

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms))

const isUrlReachable = async (url) => {
  try {
    const response = await fetch(url, { method: 'GET' })
    return response.ok || response.status === 304
  } catch (error) {
    return false
  }
}

const waitForUrl = async (url, timeoutMs = 30000, intervalMs = 500) => {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await isUrlReachable(url)) return true
    await sleep(intervalMs)
  }
  return false
}

const stopProcessGracefully = async (child) => {
  if (!child) return
  if (child.exitCode !== null) return
  child.kill('SIGTERM')

  const closed = new Promise((resolveClosed) => {
    child.once('exit', () => resolveClosed(true))
  })
  const exitedByTerm = await Promise.race([
    closed,
    sleep(5000).then(() => false),
  ])

  if (!exitedByTerm && child.exitCode === null) {
    child.kill('SIGKILL')
  }
}

const args = parseArgs(process.argv.slice(2))
const session = args.get('session') ?? 'smoke-pro-cabinet'
const userId = args.get('userId') ?? '5510721194'
const parallel = toInt(args.get('parallel'), 2, 1, 8)
const maxMeanDelta = toFloat(args.get('maxMeanDelta'), 0.8, 0, 100)
const maxScreenDelta = toFloat(args.get('maxScreenDelta'), 2.5, 0, 100)
const urlBase = args.get('urlBase') ?? 'http://127.0.0.1:4173/'

const rootDir = resolve(args.get('rootDir') ?? `.logs/visual-audit/${session}`)
const baselineDir = resolve(args.get('baselineDir') ?? join(rootDir, 'baseline'))
const afterDir = resolve(args.get('afterDir') ?? join(rootDir, 'after'))
const reportDir = resolve(args.get('reportDir') ?? join(rootDir, 'report'))

const cliArgs = [
  'scripts/miniapp-visual-audit.mjs',
  '--mode',
  'workflow',
  '--session',
  session,
  '--userId',
  userId,
  '--parallel',
  String(parallel),
  '--failOnDelta',
  '1',
  '--maxMeanDelta',
  String(maxMeanDelta),
  '--maxScreenDelta',
  String(maxScreenDelta),
  '--rootDir',
  rootDir,
  '--baselineDir',
  baselineDir,
  '--afterDir',
  afterDir,
  '--reportDir',
  reportDir,
]

const passthroughKeys = [
  'runtimeLibs',
  'browserExecutable',
  'matrix',
  'pixelThreshold',
  'clean',
  'cleanReport',
]
cliArgs.push('--urlBase', urlBase)
for (const key of passthroughKeys) {
  if (args.get(key)) {
    cliArgs.push(`--${key}`, args.get(key))
  }
}

let previewProcess = null

try {
  if (!(await isUrlReachable(urlBase))) {
    console.log(`[visual-gate] URL недоступен (${urlBase}), запускаю npm run preview...`)
    previewProcess = spawn(
      'npm',
      ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173', '--strictPort'],
      {
        cwd: process.cwd(),
        stdio: 'ignore',
      }
    )

    const ready = await waitForUrl(urlBase, 45000, 600)
    if (!ready) {
      throw new Error(`Не удалось поднять preview сервер за 45s (${urlBase})`)
    }
  }

  console.log('[visual-gate] Running workflow compare with strict thresholds...')
  const workflow = spawnSync('node', cliArgs, { encoding: 'utf8', stdio: 'inherit' })
  ensureSuccess(workflow, 'visual workflow')

  const summaryPath = resolve(reportDir, 'summary.json')
  if (!existsSync(summaryPath)) {
    throw new Error(`summary.json не найден: ${summaryPath}`)
  }

  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'))
  if (Number(summary?.totalCompared ?? 0) <= 0) {
    throw new Error('Visual gate failed: totalCompared = 0 (нет пар baseline/after)')
  }
  if (summary?.gate?.failed) {
    throw new Error(`Visual gate failed: ${(summary.gate.reasons ?? []).join(' | ')}`)
  }

  console.log(
    `[visual-gate] PASSED | mean=${Number(summary.meanDeltaPercent ?? 0).toFixed(3)}% | maxScreen=${Number(summary.maxScreenDeltaObserved ?? 0).toFixed(3)}%`
  )
  console.log(`[visual-gate] Summary: ${summaryPath}`)
} finally {
  await stopProcessGracefully(previewProcess)
}
