import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import sharp from 'sharp'
import {
  buildHostProfileUrl,
  parseHostsCsv,
} from './miniapp-host-profile.mjs'

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

const toBoolean = (value, fallback = false) => {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

const parseMatrix = (value) => {
  const chunks = String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const parsed = chunks
    .map((chunk) => chunk.match(/^(\d{3,4})x(\d{3,4})$/i))
    .filter(Boolean)
    .map((match) => {
      const width = toInt(match[1], 390, 320, 430)
      const height = toInt(match[2], 844, 640, 1600)
      return {
        width,
        height,
        key: `${width}x${height}`,
      }
    })

  if (parsed.length > 0) return parsed
  return [
    { width: 360, height: 780, key: '360x780' },
    { width: 390, height: 844, key: '390x844' },
    { width: 430, height: 932, key: '430x932' },
  ]
}

const sanitizeSegment = (value) =>
  String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'current'

const listPngFiles = (dir) => {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
    .map((entry) => entry.name)
    .sort()
}

const resolveHostSizeDir = (baseDir, host, sizeKey) => {
  const primary = join(baseDir, host, sizeKey)
  if (existsSync(primary)) {
    return { path: primary, usedLegacy: false }
  }

  if (host === 'telegram') {
    const legacy = join(baseDir, sizeKey)
    if (existsSync(legacy)) {
      return { path: legacy, usedLegacy: true }
    }
  }

  return { path: primary, usedLegacy: false }
}

const args = parseArgs(process.argv.slice(2))
const mode = (args.get('mode') ?? 'capture').toLowerCase()
const stage = (args.get('stage') ?? 'baseline').toLowerCase()
const session = sanitizeSegment(args.get('session') ?? 'current')
const rootDir = resolve(args.get('rootDir') ?? `.logs/visual-audit/${session}`)
const baselineDir = resolve(args.get('baselineDir') ?? join(rootDir, 'baseline'))
const afterDir = resolve(args.get('afterDir') ?? join(rootDir, 'after'))
const reportDir = resolve(args.get('reportDir') ?? join(rootDir, 'report'))
const userId = args.get('userId') ?? '100001'
const urlBase = args.get('urlBase') ?? args.get('url') ?? 'http://127.0.0.1:4173/'
const runtimeLibs = args.get('runtimeLibs')
const browserExecutable = args.get('browserExecutable')
const cleanCapture = toBoolean(args.get('clean'), true)
const cleanReport = toBoolean(args.get('cleanReport'), true)
const pixelThreshold = toInt(args.get('pixelThreshold'), 14, 0, 255)
const parallel = toInt(args.get('parallel'), 2, 1, 8)
const failOnDelta = toBoolean(args.get('failOnDelta'), false)
const maxMeanDelta = toFloat(args.get('maxMeanDelta'), 0.8, 0, 100)
const maxScreenDelta = toFloat(args.get('maxScreenDelta'), 2.5, 0, 100)
const matrix = parseMatrix(args.get('matrix') ?? '360x780,390x844,430x932')
const hosts = parseHostsCsv(args.get('hosts') ?? 'telegram,vk,max', [
  'telegram',
  'vk',
  'max',
])

if (!['capture', 'compare', 'workflow'].includes(mode)) {
  console.error(`Unsupported mode: ${mode}. Use capture | compare | workflow.`)
  process.exit(1)
}
if (!['baseline', 'after'].includes(stage)) {
  console.error(`Unsupported stage: ${stage}. Use baseline | after.`)
  process.exit(1)
}

const buildAuditUrl = ({ host, width, height }) =>
  buildHostProfileUrl({
    urlBase,
    host,
    userId,
    width,
    height,
  })

const runNodeScript = (cliArgs) =>
  new Promise((resolveRun, rejectRun) => {
    const child = spawn('node', cliArgs, { stdio: 'inherit' })
    child.on('error', (error) => rejectRun(error))
    child.on('close', (code) => {
      if (code === 0) {
        resolveRun()
        return
      }
      const error = new Error(`Capture child failed with exit code ${code ?? 'unknown'}`)
      error.exitCode = code ?? 1
      rejectRun(error)
    })
  })

const runWithConcurrency = async (items, limit, worker) => {
  if (items.length === 0) return []
  const results = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= items.length) {
        return
      }
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

const runCapture = async (targetDir, stageName) => {
  if (cleanCapture && existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true, force: true })
  }
  mkdirSync(targetDir, { recursive: true })

  const captureItems = hosts.flatMap((host) =>
    matrix.map((size) => ({
      host,
      ...size,
    }))
  )

  const startedAt = new Date().toISOString()
  const shots = await runWithConcurrency(captureItems, parallel, async (item, index) => {
    const outDir = join(targetDir, item.host, item.key)
    mkdirSync(outDir, { recursive: true })
    const url = buildAuditUrl(item)
    const cliArgs = [
      'scripts/design-redesign-audit.mjs',
      '--host',
      item.host,
      '--width',
      String(item.width),
      '--height',
      String(item.height),
      '--url',
      url,
      '--outDir',
      outDir,
    ]
    if (runtimeLibs) {
      cliArgs.push('--runtimeLibs', runtimeLibs)
    }
    if (browserExecutable) {
      cliArgs.push('--browserExecutable', browserExecutable)
    }

    console.log(
      `[visual-capture ${stageName}] ${index + 1}/${captureItems.length} host=${item.host} size=${item.key} (parallel=${parallel})`
    )
    await runNodeScript(cliArgs)

    return {
      host: item.host,
      size: item.key,
      width: item.width,
      height: item.height,
      url,
      outDir,
      screenshots: listPngFiles(outDir),
    }
  })

  const manifest = {
    mode: 'capture',
    stage: stageName,
    session,
    rootDir,
    startedAt,
    finishedAt: new Date().toISOString(),
    hosts,
    matrix: matrix.map((size) => ({ ...size })),
    shots,
  }
  writeFileSync(
    join(targetDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  )

  console.log(`Capture saved: ${targetDir}`)
}

const compareTwoScreens = async (baselinePath, afterPath, comparePath) => {
  const baselineRaw = await sharp(baselinePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const width = baselineRaw.info.width
  const height = baselineRaw.info.height
  const afterRaw = await sharp(afterPath)
    .ensureAlpha()
    .resize(width, height, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true })

  let diffPixels = 0
  let channelDeltaSum = 0
  const totalPixels = width * height
  for (let index = 0; index < baselineRaw.data.length; index += 4) {
    const dr = Math.abs(baselineRaw.data[index] - afterRaw.data[index])
    const dg = Math.abs(baselineRaw.data[index + 1] - afterRaw.data[index + 1])
    const db = Math.abs(baselineRaw.data[index + 2] - afterRaw.data[index + 2])
    const da = Math.abs(baselineRaw.data[index + 3] - afterRaw.data[index + 3])
    channelDeltaSum += dr + dg + db + da
    if (Math.max(dr, dg, db, da) > pixelThreshold) {
      diffPixels += 1
    }
  }

  const baselineBuffer = await sharp(baselinePath)
    .resize(width, height, { fit: 'fill' })
    .png()
    .toBuffer()
  const afterBuffer = await sharp(afterPath)
    .resize(width, height, { fit: 'fill' })
    .png()
    .toBuffer()

  mkdirSync(dirname(comparePath), { recursive: true })
  await sharp({
    create: {
      width: width * 2,
      height,
      channels: 4,
      background: { r: 243, g: 247, b: 255, alpha: 1 },
    },
  })
    .composite([
      { input: baselineBuffer, left: 0, top: 0 },
      { input: afterBuffer, left: width, top: 0 },
    ])
    .png()
    .toFile(comparePath)

  return {
    width,
    height,
    diffPixels,
    totalPixels,
    deltaPercent: Number(((diffPixels / totalPixels) * 100).toFixed(3)),
    meanChannelDelta: Number((channelDeltaSum / (totalPixels * 4)).toFixed(3)),
  }
}

const buildCompareMarkdown = (summary) => {
  const lines = []
  lines.push('# Visual Audit Summary')
  lines.push('')
  lines.push(`- Session: \`${summary.session}\``)
  lines.push(`- Hosts: \`${summary.hosts.join(', ')}\``)
  lines.push(`- Baseline: \`${summary.baselineDir}\``)
  lines.push(`- After: \`${summary.afterDir}\``)
  lines.push(`- Report: \`${summary.reportDir}\``)
  lines.push(`- Compared pairs: **${summary.totalCompared}**`)
  lines.push(
    `- Mean visual delta: **${summary.meanDeltaPercent.toFixed(3)}%** (pixel threshold ${summary.pixelThreshold})`
  )
  lines.push(`- Max single-screen delta: **${summary.maxScreenDeltaObserved.toFixed(3)}%**`)
  lines.push(
    `- Visual gate: **${summary.gate.failed ? 'failed' : 'passed'}** (enabled=${summary.gate.failOnDelta ? 'yes' : 'no'})`
  )
  lines.push(
    `- Gate thresholds: mean <= ${summary.gate.maxMeanDelta.toFixed(3)}%, screen <= ${summary.gate.maxScreenDelta.toFixed(3)}%`
  )
  lines.push(`- Stability score: **${summary.stabilityScore}/100**`)
  if (summary.gate.reasons.length > 0) {
    lines.push(`- Gate reasons: ${summary.gate.reasons.join('; ')}`)
  }
  lines.push('')

  for (const hostBlock of summary.byHost) {
    lines.push(`## Host: ${hostBlock.host}`)
    lines.push('')
    lines.push(`- Compared pairs: **${hostBlock.totalCompared}**`)
    lines.push(`- Mean visual delta: **${hostBlock.meanDeltaPercent.toFixed(3)}%**`)
    lines.push(`- Max single-screen delta: **${hostBlock.maxScreenDeltaObserved.toFixed(3)}%**`)
    lines.push('')

    hostBlock.bySize.forEach((sizeBlock) => {
      lines.push(`### ${sizeBlock.size}`)
      lines.push('')
      if (sizeBlock.notes.length > 0) {
        sizeBlock.notes.forEach((note) => lines.push(`- ${note}`))
        lines.push('')
      }
      if (sizeBlock.rows.length === 0) {
        lines.push('- Нет общих скриншотов для сравнения.')
        lines.push('')
        return
      }
      lines.push('| Screen | Delta % | Mean channel delta | Status | Compare |')
      lines.push('| --- | ---: | ---: | --- | --- |')
      sizeBlock.rows.forEach((row) => {
        lines.push(
          `| \`${row.screen}\` | ${row.deltaPercent.toFixed(3)} | ${row.meanChannelDelta.toFixed(3)} | ${row.status} | \`${row.comparePath}\` |`
        )
      })
      lines.push('')
    })
  }

  return `${lines.join('\n')}\n`
}

const runCompare = async () => {
  if (cleanReport && existsSync(reportDir)) {
    rmSync(reportDir, { recursive: true, force: true })
  }
  mkdirSync(reportDir, { recursive: true })

  const byHost = []
  let compared = 0
  let deltaSum = 0
  let maxScreenDeltaObserved = 0

  for (const host of hosts) {
    const hostBySize = []
    let hostCompared = 0
    let hostDeltaSum = 0
    let hostMaxScreenDeltaObserved = 0

    for (const size of matrix) {
      const baselineRef = resolveHostSizeDir(baselineDir, host, size.key)
      const afterRef = resolveHostSizeDir(afterDir, host, size.key)
      const baselineSizeDir = baselineRef.path
      const afterSizeDir = afterRef.path
      const notes = []
      const rows = []

      if (baselineRef.usedLegacy) {
        notes.push(`Использован legacy baseline путь: \`${baselineSizeDir}\``)
      }
      if (afterRef.usedLegacy) {
        notes.push(`Использован legacy after путь: \`${afterSizeDir}\``)
      }
      if (!existsSync(baselineSizeDir)) {
        notes.push(`Нет baseline-директории: \`${baselineSizeDir}\``)
      }
      if (!existsSync(afterSizeDir)) {
        notes.push(`Нет after-директории: \`${afterSizeDir}\``)
      }

      const baselineFiles = listPngFiles(baselineSizeDir)
      const afterFiles = listPngFiles(afterSizeDir)

      const afterSet = new Set(afterFiles)
      const baselineSet = new Set(baselineFiles)
      const common = baselineFiles.filter((name) => afterSet.has(name))
      const missingAfter = baselineFiles.filter((name) => !afterSet.has(name))
      const missingBaseline = afterFiles.filter((name) => !baselineSet.has(name))

      if (missingAfter.length > 0) {
        notes.push(`Нет в after: ${missingAfter.join(', ')}`)
      }
      if (missingBaseline.length > 0) {
        notes.push(`Нет в baseline: ${missingBaseline.join(', ')}`)
      }

      for (const file of common) {
        const baselinePath = join(baselineSizeDir, file)
        const afterPath = join(afterSizeDir, file)
        const comparePath = join(reportDir, host, size.key, file.replace(/\.png$/i, '.compare.png'))
        const metrics = await compareTwoScreens(baselinePath, afterPath, comparePath)
        const status =
          metrics.deltaPercent <= 0.1
            ? 'stable'
            : metrics.deltaPercent <= 1
              ? 'minor'
              : metrics.deltaPercent <= 5
                ? 'changed'
                : 'major'

        compared += 1
        hostCompared += 1
        deltaSum += metrics.deltaPercent
        hostDeltaSum += metrics.deltaPercent

        if (metrics.deltaPercent > maxScreenDeltaObserved) {
          maxScreenDeltaObserved = metrics.deltaPercent
        }
        if (metrics.deltaPercent > hostMaxScreenDeltaObserved) {
          hostMaxScreenDeltaObserved = metrics.deltaPercent
        }

        rows.push({
          screen: file,
          comparePath,
          ...metrics,
          status,
        })
      }

      hostBySize.push({
        size: size.key,
        notes,
        rows,
      })
    }

    byHost.push({
      host,
      totalCompared: hostCompared,
      meanDeltaPercent: hostCompared > 0 ? hostDeltaSum / hostCompared : 0,
      maxScreenDeltaObserved: hostMaxScreenDeltaObserved,
      bySize: hostBySize,
    })
  }

  const meanDeltaPercent = compared > 0 ? deltaSum / compared : 0
  const stabilityScore = Math.max(0, Math.round(100 - meanDeltaPercent * 8))
  const gateReasons = []
  if (compared === 0) {
    gateReasons.push('Нет ни одной общей пары baseline/after для сравнения')
  }
  if (meanDeltaPercent > maxMeanDelta) {
    gateReasons.push(
      `Mean delta ${meanDeltaPercent.toFixed(3)}% > threshold ${maxMeanDelta.toFixed(3)}%`
    )
  }
  if (maxScreenDeltaObserved > maxScreenDelta) {
    gateReasons.push(
      `Max screen delta ${maxScreenDeltaObserved.toFixed(3)}% > threshold ${maxScreenDelta.toFixed(3)}%`
    )
  }

  const summary = {
    mode: 'compare',
    session,
    hosts,
    baselineDir,
    afterDir,
    reportDir,
    pixelThreshold,
    totalCompared: compared,
    meanDeltaPercent,
    maxScreenDeltaObserved,
    stabilityScore,
    generatedAt: new Date().toISOString(),
    gate: {
      failOnDelta,
      maxMeanDelta,
      maxScreenDelta,
      failed: gateReasons.length > 0,
      reasons: gateReasons,
    },
    byHost,
  }

  writeFileSync(join(reportDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  writeFileSync(join(reportDir, 'SUMMARY.md'), buildCompareMarkdown(summary), 'utf8')

  console.log(`Compare report saved: ${reportDir}`)
  console.log(
    `Compared: ${compared} | Mean delta: ${meanDeltaPercent.toFixed(3)}% | Stability: ${stabilityScore}/100`
  )
  if (failOnDelta && gateReasons.length > 0) {
    console.error(`Visual gate failed: ${gateReasons.join(' | ')}`)
    process.exit(1)
  }
}

try {
  if (mode === 'capture') {
    await runCapture(stage === 'after' ? afterDir : baselineDir, stage)
  } else if (mode === 'compare') {
    await runCompare()
  } else {
    await runCapture(baselineDir, 'baseline')
    await runCapture(afterDir, 'after')
    await runCompare()
  }
} catch (error) {
  console.error(error?.message ?? String(error))
  process.exit(error?.exitCode ?? 1)
}
