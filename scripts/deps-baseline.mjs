import { mkdirSync, writeFileSync } from 'node:fs'
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

const parseJsonOrEmpty = (raw, label) => {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return {}
  try {
    return JSON.parse(trimmed)
  } catch (error) {
    throw new Error(`Не удалось распарсить JSON (${label}): ${error.message}`)
  }
}

const runNpmJson = (cwd, npmArgs, label) => {
  const result = spawnSync('npm', npmArgs, { cwd, encoding: 'utf8' })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.error) {
    throw result.error
  }
  const parsed = parseJsonOrEmpty(result.stdout, label)
  return {
    status: result.status ?? 0,
    parsed,
  }
}

const args = parseArgs(process.argv.slice(2))
const outDir = resolve(args.get('outDir') ?? '.logs/deps-baseline')
mkdirSync(outDir, { recursive: true })

const rootOutdated = runNpmJson(process.cwd(), ['outdated', '--json'], 'root outdated')
const rootAudit = runNpmJson(process.cwd(), ['audit', '--omit=dev', '--json'], 'root audit')
const botOutdated = runNpmJson(
  resolve(process.cwd(), 'bot'),
  ['outdated', '--json'],
  'bot outdated'
)
const botAudit = runNpmJson(
  resolve(process.cwd(), 'bot'),
  ['audit', '--omit=dev', '--json'],
  'bot audit'
)

writeFileSync(
  resolve(outDir, 'root-outdated.json'),
  `${JSON.stringify(rootOutdated.parsed, null, 2)}\n`,
  'utf8'
)
writeFileSync(
  resolve(outDir, 'root-audit.json'),
  `${JSON.stringify(rootAudit.parsed, null, 2)}\n`,
  'utf8'
)
writeFileSync(
  resolve(outDir, 'bot-outdated.json'),
  `${JSON.stringify(botOutdated.parsed, null, 2)}\n`,
  'utf8'
)
writeFileSync(
  resolve(outDir, 'bot-audit.json'),
  `${JSON.stringify(botAudit.parsed, null, 2)}\n`,
  'utf8'
)

const summaryLines = [
  '# Dependency Baseline',
  '',
  `- Generated: ${new Date().toISOString()}`,
  `- Output dir: \`${outDir}\``,
  `- root outdated exit: ${rootOutdated.status}`,
  `- root audit exit: ${rootAudit.status}`,
  `- bot outdated exit: ${botOutdated.status}`,
  `- bot audit exit: ${botAudit.status}`,
]
writeFileSync(resolve(outDir, 'SUMMARY.md'), `${summaryLines.join('\n')}\n`, 'utf8')

console.log(`Dependency baseline saved: ${outDir}`)
