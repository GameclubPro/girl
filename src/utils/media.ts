export type BuildImageOptions = {
  width?: number
  quality?: number
  format?: string
}

type PrefetchOptions = BuildImageOptions & {
  limit?: number
  delayMs?: number
}

const clampNumber = (value: number | undefined, min: number, max: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.min(max, Math.max(min, Math.round(value)))
}

const isLoadableUrl = (url: string) =>
  Boolean(url) && !url.startsWith('data:') && !url.startsWith('blob:')

const isAbsoluteHttpUrl = (url: string) => /^https?:\/\//i.test(url)

const isTransformableUrl = (url: string) => {
  if (!isLoadableUrl(url)) return false
  if (isAbsoluteHttpUrl(url)) return url.includes('/uploads/')
  return true
}

const shouldSkipTransform = (url: string) => !isTransformableUrl(url)

export const buildImageUrl = (url: string, options: BuildImageOptions = {}) => {
  if (shouldSkipTransform(url)) return url
  const [base, hash] = url.split('#')
  const [path, query = ''] = base.split('?')
  const params = new URLSearchParams(query)
  const width = clampNumber(options.width, 24, 2048)
  const quality = clampNumber(options.quality, 40, 90)
  if (width) params.set('w', String(width))
  if (quality) params.set('q', String(quality))
  if (options.format) params.set('format', options.format)
  const next = params.toString() ? `${path}?${params.toString()}` : path
  return hash ? `${next}#${hash}` : next
}

export const buildImageSrcSet = (
  url: string,
  widths: number[] | null | undefined,
  options: BuildImageOptions = {}
) => {
  if (!widths || widths.length === 0 || shouldSkipTransform(url)) {
    return undefined
  }
  return widths
    .filter((width) => Number.isFinite(width) && width > 0)
    .map((width) => `${buildImageUrl(url, { ...options, width })} ${Math.round(width)}w`)
    .join(', ')
}

export const prefetchImages = (
  urls: string[],
  options: PrefetchOptions = {}
) => {
  if (typeof window === 'undefined') return
  const unique = new Set<string>()
  const limit = options.limit ?? 4
  const queue = urls
    .filter(Boolean)
    .filter((url) => isLoadableUrl(url))
    .filter((url) => {
      if (unique.has(url)) return false
      unique.add(url)
      return true
    })
    .slice(0, Math.max(0, limit))

  if (queue.length === 0) return

  const run = () => {
    queue.forEach((url) => {
      const image = new Image()
      image.decoding = 'async'
      image.src = buildImageUrl(url, options)
    })
  }

  const idle = (window as Window & {
    requestIdleCallback?: (cb: () => void, options?: { timeout?: number }) => void
  }).requestIdleCallback

  if (idle) {
    idle(run, { timeout: 1200 })
  } else {
    window.setTimeout(run, options.delayMs ?? 120)
  }
}
