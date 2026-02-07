import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

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

const args = parseArgs(process.argv.slice(2))
const url = args.get('url')
const wait = args.get('wait')
const userId = args.get('userId')
const apiBase = args.get('apiBase')
const height = args.get('height')
const scenario = args.get('scenario')
const outPrefix = resolve(
  args.get('outPrefix') ?? `.logs/booking-item-${new Date().toISOString().replace(/[:.]/g, '-')}`
)

mkdirSync(dirname(outPrefix), { recursive: true })

for (const width of [360, 390, 430]) {
  const output = `${outPrefix}-w${width}.png`
  const cliArgs = [
    'scripts/booking-item-autoshot.mjs',
    '--width',
    String(width),
    '--out',
    output,
  ]
  if (url) cliArgs.push('--url', url)
  if (wait) cliArgs.push('--wait', wait)
  if (userId) cliArgs.push('--userId', userId)
  if (apiBase) cliArgs.push('--apiBase', apiBase)
  if (height) cliArgs.push('--height', height)
  if (scenario) cliArgs.push('--scenario', scenario)

  const result = spawnSync('node', cliArgs, { stdio: 'inherit' })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

console.log(`Booking screenshot suite saved with prefix: ${outPrefix}`)
