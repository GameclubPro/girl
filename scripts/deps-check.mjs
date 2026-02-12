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

const parseVersion = (value) => {
  const match = String(value ?? '').match(/(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

const compareVersions = (left, right) => {
  const leftParsed = parseVersion(left)
  const rightParsed = parseVersion(right)
  if (leftParsed && rightParsed) {
    for (let index = 0; index < 3; index += 1) {
      if (leftParsed[index] > rightParsed[index]) return 1
      if (leftParsed[index] < rightParsed[index]) return -1
    }
    return 0
  }
  return String(left ?? '').localeCompare(String(right ?? ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  })
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
  const stdout = String(result.stdout ?? '')
  const hasPayload = stdout.trim().length > 0
  const parsed = parseJsonOrEmpty(stdout, label)
  const status = result.status ?? 0
  const commandError = status !== 0 && !hasPayload
  return {
    status,
    hasPayload,
    commandError,
    parsed,
  }
}

const analyzeOutdated = (payload) => {
  const entries = Object.entries(payload ?? {})
  const safePending = []
  const majorDebt = []

  for (const [name, metaRaw] of entries) {
    const meta = metaRaw ?? {}
    const item = {
      name,
      current: String(meta.current ?? ''),
      wanted: String(meta.wanted ?? ''),
      latest: String(meta.latest ?? ''),
    }
    const currentVsWanted = compareVersions(item.current, item.wanted)
    const wantedVsLatest = compareVersions(item.wanted, item.latest)

    if (currentVsWanted < 0) {
      safePending.push(item)
    } else if (currentVsWanted === 0 && wantedVsLatest < 0) {
      majorDebt.push(item)
    }
  }

  return { safePending, majorDebt }
}

const analyzeAudit = (payload) => {
  const vulnerabilities = payload?.metadata?.vulnerabilities ?? {}
  return {
    info: Number(vulnerabilities.info ?? 0),
    low: Number(vulnerabilities.low ?? 0),
    moderate: Number(vulnerabilities.moderate ?? 0),
    high: Number(vulnerabilities.high ?? 0),
    critical: Number(vulnerabilities.critical ?? 0),
    total: Number(vulnerabilities.total ?? 0),
  }
}

const formatPackage = (item) =>
  `\`${item.name}\` (current ${item.current} -> wanted ${item.wanted} | latest ${item.latest})`

const args = parseArgs(process.argv.slice(2))
const outDir = resolve(args.get('outDir') ?? '.logs/deps-check')
mkdirSync(outDir, { recursive: true })

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')
const rootDir = process.cwd()
const botDir = resolve(process.cwd(), 'bot')

const projects = [
  { id: 'root', cwd: rootDir },
  { id: 'bot', cwd: botDir },
]

const checks = []

for (const project of projects) {
  const outdated = runNpmJson(project.cwd, ['outdated', '--json'], `${project.id} outdated`)
  const audit = runNpmJson(
    project.cwd,
    ['audit', '--omit=dev', '--json'],
    `${project.id} audit`
  )
  const outdatedPath = resolve(outDir, `${stamp}-${project.id}-outdated.json`)
  const auditPath = resolve(outDir, `${stamp}-${project.id}-audit.json`)

  writeFileSync(outdatedPath, `${JSON.stringify(outdated.parsed, null, 2)}\n`, 'utf8')
  writeFileSync(auditPath, `${JSON.stringify(audit.parsed, null, 2)}\n`, 'utf8')

  checks.push({
    ...project,
    outdated,
    audit,
    outdatedPath,
    auditPath,
    outdatedAnalysis: analyzeOutdated(outdated.parsed),
    auditAnalysis: analyzeAudit(audit.parsed),
  })
}

const failReasons = []
const warningReasons = []

for (const project of checks) {
  if (project.outdated.commandError) {
    failReasons.push(`${project.id}: npm outdated завершился с ошибкой без JSON payload`)
  }
  if (project.audit.commandError) {
    failReasons.push(`${project.id}: npm audit завершился с ошибкой без JSON payload`)
  }
  if (project.outdatedAnalysis.safePending.length > 0) {
    failReasons.push(
      `${project.id}: доступны patch/minor обновления (${project.outdatedAnalysis.safePending.length})`
    )
  }
  if (project.auditAnalysis.high > 0 || project.auditAnalysis.critical > 0) {
    failReasons.push(
      `${project.id}: high/critical уязвимости (${project.auditAnalysis.high}/${project.auditAnalysis.critical})`
    )
  }
  if (project.outdatedAnalysis.majorDebt.length > 0) {
    warningReasons.push(
      `${project.id}: есть major-долг (${project.outdatedAnalysis.majorDebt.length})`
    )
  }
}

const summaryPath = resolve(outDir, `${stamp}.md`)
const summaryLines = []
summaryLines.push('# Dependency Check')
summaryLines.push('')
summaryLines.push(`- Generated: ${new Date().toISOString()}`)
summaryLines.push(`- Output dir: \`${outDir}\``)
summaryLines.push(`- Summary file: \`${summaryPath}\``)
summaryLines.push('')
summaryLines.push('| Project | Safe pending | Major debt | High | Critical | Result |')
summaryLines.push('| --- | ---: | ---: | ---: | ---: | --- |')

for (const project of checks) {
  const projectFailed =
    project.outdated.commandError ||
    project.audit.commandError ||
    project.outdatedAnalysis.safePending.length > 0 ||
    project.auditAnalysis.high > 0 ||
    project.auditAnalysis.critical > 0
  summaryLines.push(
    `| ${project.id} | ${project.outdatedAnalysis.safePending.length} | ${project.outdatedAnalysis.majorDebt.length} | ${project.auditAnalysis.high} | ${project.auditAnalysis.critical} | ${projectFailed ? 'fail' : 'pass'} |`
  )
}

for (const project of checks) {
  summaryLines.push('')
  summaryLines.push(`## ${project.id}`)
  summaryLines.push('')
  summaryLines.push(`- cwd: \`${project.cwd}\``)
  summaryLines.push(`- outdated exit: ${project.outdated.status}`)
  summaryLines.push(`- audit exit: ${project.audit.status}`)
  summaryLines.push(`- outdated json: \`${project.outdatedPath}\``)
  summaryLines.push(`- audit json: \`${project.auditPath}\``)
  summaryLines.push('')

  if (project.outdatedAnalysis.safePending.length > 0) {
    summaryLines.push('### Safe pending (fail)')
    for (const item of project.outdatedAnalysis.safePending) {
      summaryLines.push(`- ${formatPackage(item)}`)
    }
    summaryLines.push('')
  }

  if (project.outdatedAnalysis.majorDebt.length > 0) {
    summaryLines.push('### Major debt (warn)')
    for (const item of project.outdatedAnalysis.majorDebt) {
      summaryLines.push(`- ${formatPackage(item)}`)
    }
    summaryLines.push('')
  }
}

summaryLines.push('## Verdict')
summaryLines.push('')
if (warningReasons.length > 0) {
  for (const warning of warningReasons) {
    summaryLines.push(`- WARN: ${warning}`)
  }
}
if (failReasons.length > 0) {
  for (const failure of failReasons) {
    summaryLines.push(`- FAIL: ${failure}`)
  }
  summaryLines.push('')
  summaryLines.push('Result: **FAILED**')
} else {
  summaryLines.push('- FAIL: none')
  summaryLines.push('')
  summaryLines.push('Result: **PASSED**')
}

writeFileSync(summaryPath, `${summaryLines.join('\n')}\n`, 'utf8')
console.log(`Dependency check summary: ${summaryPath}`)

const machineSummaryPath = resolve(outDir, `${stamp}.json`)
const machineSummary = {
  generatedAt: new Date().toISOString(),
  outDir,
  summaryPath,
  checks: checks.map((project) => ({
    id: project.id,
    cwd: project.cwd,
    outdated: {
      status: project.outdated.status,
      commandError: project.outdated.commandError,
      safePending: project.outdatedAnalysis.safePending,
      majorDebt: project.outdatedAnalysis.majorDebt,
      jsonPath: project.outdatedPath,
    },
    audit: {
      status: project.audit.status,
      commandError: project.audit.commandError,
      vulnerabilities: project.auditAnalysis,
      jsonPath: project.auditPath,
    },
  })),
  warnings: warningReasons,
  failures: failReasons,
}
writeFileSync(machineSummaryPath, `${JSON.stringify(machineSummary, null, 2)}\n`, 'utf8')

if (failReasons.length > 0) {
  process.exit(1)
}
