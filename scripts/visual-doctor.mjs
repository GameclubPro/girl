import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { homedir, platform, release } from 'node:os'
import { join, resolve } from 'node:path'
import {
  applyRuntimeLibs,
  resolveBundledChromiumExecutable,
  resolveSystemChromiumExecutable,
} from './playwright-launch.mjs'

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

const toBoolean = (value, fallback = false) => {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

const compact = (value, maxLines = 16) =>
  String(value ?? '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(0, maxLines)
    .join('\n')

const classifyIssue = (stderr, exitCode) => {
  const text = String(stderr ?? '').toLowerCase()
  if (/sandbox_host_linux\.cc:41/.test(text)) return 'sandbox-host'
  if (/crashpad.*setsockopt: operation not permitted/.test(text)) {
    return 'crashpad-permission'
  }
  if (/error while loading shared libraries/.test(text)) return 'missing-libs'
  if (exitCode === 0) return 'ok'
  return 'unknown'
}

const findHeadlessShellExecutable = () => {
  const roots = [
    resolve('.playwright-browsers'),
    join(homedir(), '.cache', 'ms-playwright'),
  ]

  for (const root of roots) {
    if (!existsSync(root)) continue
    const folders = readdirSync(root, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() && entry.name.startsWith('chromium_headless_shell-')
      )
      .map((entry) => entry.name)
      .sort()
      .reverse()

    for (const folder of folders) {
      const executable = join(
        root,
        folder,
        'chrome-headless-shell-linux64',
        'chrome-headless-shell'
      )
      if (existsSync(executable)) {
        return executable
      }
    }
  }
  return null
}

const runProbe = (name, executable, runtimeLibsDir) => {
  if (!executable || !existsSync(executable)) {
    return {
      name,
      executable: executable ?? '',
      available: false,
      issue: 'not-found',
      exitCode: null,
      stderr: '',
      stdout: '',
    }
  }

  const env = { ...process.env }
  if (runtimeLibsDir) {
    env.LD_LIBRARY_PATH = env.LD_LIBRARY_PATH
      ? `${runtimeLibsDir}:${env.LD_LIBRARY_PATH}`
      : runtimeLibsDir
  }

  const versionResult = spawnSync(executable, ['--version'], {
    env,
    encoding: 'utf8',
  })
  const smokeResult = spawnSync(
    executable,
    ['--headless', '--no-sandbox', '--disable-gpu', '--dump-dom', 'about:blank'],
    {
      env,
      encoding: 'utf8',
    }
  )

  const stderr = compact(
    [versionResult.stderr, smokeResult.stderr].filter(Boolean).join('\n')
  )
  const stdout = compact(
    [versionResult.stdout, smokeResult.stdout].filter(Boolean).join('\n')
  )

  return {
    name,
    executable,
    available: true,
    versionExitCode: versionResult.status,
    exitCode: smokeResult.status,
    issue: classifyIssue(stderr, smokeResult.status),
    stderr,
    stdout,
  }
}

const args = parseArgs(process.argv.slice(2))
const runtimeLibsInput = args.get('runtimeLibs')
const strict = toBoolean(args.get('strict'), false)
const jsonOutput = args.get('json')

const runtimeLibsDir = applyRuntimeLibs(runtimeLibsInput)
const chromiumExecutable = resolveBundledChromiumExecutable()
const systemChromiumExecutable = resolveSystemChromiumExecutable()
const headlessShellExecutable = findHeadlessShellExecutable()
const procVersion = existsSync('/proc/version')
  ? readFileSync('/proc/version', 'utf8')
  : ''
const isWsl = /microsoft/i.test(procVersion)

const probes = [
  runProbe('chromium-system', systemChromiumExecutable, runtimeLibsDir),
  runProbe('chromium-full', chromiumExecutable, runtimeLibsDir),
  runProbe('chromium-headless-shell', headlessShellExecutable, runtimeLibsDir),
]

const hasWorkingProbe = probes.some((probe) => probe.issue === 'ok')
const hasSandboxHost = probes.some((probe) => probe.issue === 'sandbox-host')
const hasCrashpadPermission = probes.some(
  (probe) => probe.issue === 'crashpad-permission'
)

console.log('=== Visual Doctor ===')
console.log(`platform: ${platform()} ${release()}`)
console.log(`wsl: ${isWsl ? 'yes' : 'no'}`)
console.log(`runtime libs: ${runtimeLibsDir ?? 'not found'}`)
console.log('')

for (const probe of probes) {
  console.log(`- ${probe.name}`)
  console.log(`  executable: ${probe.executable || 'not found'}`)
  console.log(`  issue: ${probe.issue}`)
  if (probe.issue !== 'ok') {
    if (probe.stderr) {
      console.log(`  stderr: ${probe.stderr}`)
    }
  } else if (probe.stdout) {
    console.log(`  stdout: ${probe.stdout}`)
  }
}

console.log('')
console.log('Recommendations:')
if (hasWorkingProbe) {
  console.log('- Chromium запускается. Можно продолжать visual-аудит.')
}
if (!hasWorkingProbe) {
  console.log('- В этом окружении браузер не стартует стабильно.')
  console.log(
    '- Для reliable visual-аудита запускайте команды в хостовой ОС (вне sandbox-контейнера).'
  )
}
if (hasSandboxHost) {
  console.log(
    '- Ошибка `sandbox_host_linux.cc:41` указывает на ограничения sandbox ядра/контейнера.'
  )
}
if (hasCrashpadPermission) {
  console.log(
    '- Ошибка crashpad `setsockopt: Operation not permitted` указывает на ограничение seccomp/capabilities.'
  )
}
if (!runtimeLibsDir) {
  console.log(
    '- Runtime libs не найдены. Проверьте `.local/runtime-libs` или переустановите зависимые библиотеки.'
  )
}
console.log(
  '- Если есть системный Chrome, используйте: `PW_BROWSER_EXECUTABLE=/path/to/chrome npm run visual:workflow -- --session smoke --userId 5510721194`.'
)

const summary = {
  platform: platform(),
  release: release(),
  isWsl,
  runtimeLibsDir,
  probes,
  hasWorkingProbe,
}

if (jsonOutput) {
  const outputPath = resolve(jsonOutput)
  writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  console.log(`\nJSON report: ${outputPath}`)
}

if (strict && !hasWorkingProbe) {
  process.exit(1)
}
