import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
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

const toBoolean = (value, fallback = false) => {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

const formatBytes = (value) => {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

const getPathSize = (path) => {
  const stats = statSync(path)
  if (!stats.isDirectory()) return stats.size
  let total = 0
  const stack = [path]
  while (stack.length > 0) {
    const current = stack.pop()
    const entries = readdirSync(current, { withFileTypes: true })
    entries.forEach((entry) => {
      const absolute = join(current, entry.name)
      const entryStats = statSync(absolute)
      if (entryStats.isDirectory()) {
        stack.push(absolute)
      } else {
        total += entryStats.size
      }
    })
  }
  return total
}

const args = parseArgs(process.argv.slice(2))
const root = resolve(args.get('root') ?? '.logs')
const maxAgeDays = toInt(args.get('maxAgeDays'), 10, 1, 365)
const keepLatest = toInt(args.get('keepLatest'), 30, 0, 5000)
const dryRun = toBoolean(args.get('dryRun'), false)
const prefixes = (args.get('prefixes') ??
  [
    'design-',
    'design_live',
    'miniapp-',
    'booking-item-',
    'deposit-sheet-',
    'master-cabinet-',
    'setup-design-',
    'visual-',
  ].join(','))
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

if (!existsSync(root)) {
  console.error(`Root not found: ${root}`)
  process.exit(1)
}

const now = Date.now()
const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000
const entries = readdirSync(root, { withFileTypes: true })

const isVisualCandidate = (name) =>
  prefixes.some((prefix) => name.startsWith(prefix) || name.includes(prefix))

const candidates = entries
  .filter((entry) => entry.isDirectory() && isVisualCandidate(entry.name))
  .map((entry) => {
    const absolute = join(root, entry.name)
    const stats = statSync(absolute)
    return {
      name: entry.name,
      path: absolute,
      mtimeMs: stats.mtimeMs,
      ageMs: now - stats.mtimeMs,
      sizeBytes: getPathSize(absolute),
    }
  })
  .sort((a, b) => b.mtimeMs - a.mtimeMs)

const keepSet = new Set(candidates.slice(0, keepLatest).map((entry) => entry.path))
const toRemove = candidates.filter(
  (entry) => entry.ageMs > maxAgeMs && !keepSet.has(entry.path)
)

let freedBytes = 0
toRemove.forEach((entry) => {
  freedBytes += entry.sizeBytes
  const ageDays = (entry.ageMs / (24 * 60 * 60 * 1000)).toFixed(1)
  const line = `${entry.name} | ${formatBytes(entry.sizeBytes)} | ${ageDays} days`
  if (dryRun) {
    console.log(`[dry-run] remove ${line}`)
    return
  }
  rmSync(entry.path, { recursive: true, force: true })
  console.log(`removed ${line}`)
})

const modeLabel = dryRun ? 'dry-run' : 'done'
console.log(
  `[cleanup:${modeLabel}] checked=${candidates.length} removed=${toRemove.length} freed=${formatBytes(
    freedBytes
  )}`
)
