import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, CSSProperties, PointerEvent } from 'react'

type CropperKind = 'avatar' | 'cover'

type MediaCropperProps = {
  src: string
  kind: CropperKind
  maxBytes: number
  isBusy?: boolean
  error?: string
  onCancel: () => void
  onConfirm: (dataUrl: string) => Promise<boolean> | boolean
}

const AVATAR_TARGET_SIZE = 1024
const COVER_TARGET_WIDTH = 1440
const COVER_BASE_HEIGHT = 180
const COVER_ASPECT_MIN = 2
const COVER_ASPECT_MAX = 2.6

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const estimateDataUrlBytes = (dataUrl: string) => {
  const base64 = dataUrl.split(',')[1]
  if (!base64) return 0
  return Math.floor((base64.length * 3) / 4)
}

const getCoverAspect = () => {
  if (typeof window === 'undefined') return 2.2
  const width = clamp(window.innerWidth, 320, 430)
  const aspect = width / COVER_BASE_HEIGHT
  return clamp(aspect, COVER_ASPECT_MIN, COVER_ASPECT_MAX)
}

const getDistance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y)

export const MediaCropper = ({
  src,
  kind,
  maxBytes,
  isBusy = false,
  error = '',
  onCancel,
  onConfirm,
}: MediaCropperProps) => {
  const [coverAspect, setCoverAspect] = useState(getCoverAspect)
  const [cropRect, setCropRect] = useState<{ width: number; height: number } | null>(
    null
  )
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(
    null
  )
  const [minScale, setMinScale] = useState(1)
  const [maxScale, setMaxScale] = useState(3)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [localError, setLocalError] = useState('')
  const [isRendering, setIsRendering] = useState(false)
  const imageRef = useRef<HTMLImageElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const lastDragRef = useRef<{ x: number; y: number } | null>(null)
  const lastDistanceRef = useRef<number | null>(null)
  const scaleRef = useRef(1)
  const offsetRef = useRef({ x: 0, y: 0 })

  const aspect = useMemo(() => (kind === 'avatar' ? 1 : coverAspect), [
    kind,
    coverAspect,
  ])
  const isLocked = isBusy || isRendering
  const canRender = Boolean(imageSize && cropRect)
  const zoomValue = Math.max(minScale, Math.min(maxScale, scale))
  const zoomLabel = minScale ? (scale / minScale).toFixed(2) : '1.00'
  const title = kind === 'avatar' ? 'Новый аватар' : 'Новая шапка'
  const hint =
    kind === 'avatar'
      ? 'Перетащите фото и масштабируйте, чтобы лицо было в центре.'
      : 'Сместите кадр так, чтобы ключевая зона была ближе к середине.'

  useEffect(() => {
    scaleRef.current = scale
    offsetRef.current = offset
  }, [scale, offset])

  useEffect(() => {
    setLocalError('')
  }, [src, kind])

  useEffect(() => {
    setImageSize(null)
  }, [src])

  useEffect(() => {
    const handleResize = () => {
      setCoverAspect(getCoverAspect())
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const measureCropRect = useCallback(() => {
    const frame = frameRef.current
    if (!frame) return
    const rect = frame.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    setCropRect({ width: rect.width, height: rect.height })
  }, [])

  useEffect(() => {
    measureCropRect()
    const raf = window.requestAnimationFrame(measureCropRect)
    const handleResize = () => measureCropRect()
    window.addEventListener('resize', handleResize)
    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', handleResize)
    }
  }, [aspect, measureCropRect])

  useEffect(() => {
    if (!imageSize || !cropRect) return
    const nextMinScale = Math.max(
      cropRect.width / imageSize.width,
      cropRect.height / imageSize.height
    )
    const nextMaxScale = nextMinScale * 4
    setMinScale(nextMinScale)
    setMaxScale(nextMaxScale)
    setScale(nextMinScale)
    setOffset({ x: 0, y: 0 })
  }, [cropRect, imageSize, src])

  const clampOffset = useCallback(
    (next: { x: number; y: number }, nextScale: number) => {
      if (!imageSize || !cropRect) return next
      const boundX = Math.max(0, (imageSize.width * nextScale - cropRect.width) / 2)
      const boundY = Math.max(0, (imageSize.height * nextScale - cropRect.height) / 2)
      return {
        x: clamp(next.x, -boundX, boundX),
        y: clamp(next.y, -boundY, boundY),
      }
    },
    [cropRect, imageSize]
  )

  const getLocalPoint = useCallback(
    (clientX: number, clientY: number) => {
      const frame = frameRef.current
      if (!frame) return { x: 0, y: 0 }
      const rect = frame.getBoundingClientRect()
      return {
        x: clientX - rect.left - rect.width / 2,
        y: clientY - rect.top - rect.height / 2,
      }
    },
    []
  )

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (isLocked) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })
    if (pointersRef.current.size === 1) {
      lastDragRef.current = getLocalPoint(event.clientX, event.clientY)
    }
    if (pointersRef.current.size === 2) {
      const points = Array.from(pointersRef.current.values())
      lastDistanceRef.current = getDistance(points[0], points[1])
      lastDragRef.current = null
    }
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (isLocked) return
    if (!pointersRef.current.has(event.pointerId)) return
    event.preventDefault()
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })
    const pointers = Array.from(pointersRef.current.values())
    if (pointers.length === 1) {
      const next = getLocalPoint(event.clientX, event.clientY)
      const prev = lastDragRef.current ?? next
      const dx = next.x - prev.x
      const dy = next.y - prev.y
      setOffset((current) =>
        clampOffset({ x: current.x + dx, y: current.y + dy }, scaleRef.current)
      )
      lastDragRef.current = next
      return
    }
    if (pointers.length === 2) {
      const distance = getDistance(pointers[0], pointers[1])
      if (!lastDistanceRef.current) {
        lastDistanceRef.current = distance
        return
      }
      const scaleFactor = distance / lastDistanceRef.current
      const currentScale = scaleRef.current
      const nextScale = clamp(currentScale * scaleFactor, minScale, maxScale)
      const centerClient = {
        x: (pointers[0].x + pointers[1].x) / 2,
        y: (pointers[0].y + pointers[1].y) / 2,
      }
      const center = getLocalPoint(centerClient.x, centerClient.y)
      const currentOffset = offsetRef.current
      const imgX = (center.x - currentOffset.x) / currentScale
      const imgY = (center.y - currentOffset.y) / currentScale
      const nextOffset = {
        x: center.x - imgX * nextScale,
        y: center.y - imgY * nextScale,
      }
      setScale(nextScale)
      setOffset(clampOffset(nextOffset, nextScale))
      lastDistanceRef.current = distance
    }
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    pointersRef.current.delete(event.pointerId)
    if (pointersRef.current.size < 2) {
      lastDistanceRef.current = null
    }
    if (pointersRef.current.size === 1) {
      const remaining = Array.from(pointersRef.current.values())[0]
      lastDragRef.current = getLocalPoint(remaining.x, remaining.y)
    } else {
      lastDragRef.current = null
    }
  }

  const handleZoomChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextScale = Number(event.target.value)
    const currentScale = scaleRef.current
    const currentOffset = offsetRef.current
    const imgX = (0 - currentOffset.x) / currentScale
    const imgY = (0 - currentOffset.y) / currentScale
    const nextOffset = {
      x: 0 - imgX * nextScale,
      y: 0 - imgY * nextScale,
    }
    setScale(nextScale)
    setOffset(clampOffset(nextOffset, nextScale))
  }

  const handleReset = () => {
    if (!canRender) return
    setScale(minScale)
    setOffset({ x: 0, y: 0 })
    setLocalError('')
  }

  const renderCroppedDataUrl = () => {
    if (!imageRef.current || !cropRect || !imageSize) return ''
    const currentScale = scaleRef.current
    const currentOffset = offsetRef.current
    const cropWidth = cropRect.width / currentScale
    const cropHeight = cropRect.height / currentScale
    const cropLeft =
      imageSize.width / 2 - cropWidth / 2 - currentOffset.x / currentScale
    const cropTop =
      imageSize.height / 2 - cropHeight / 2 - currentOffset.y / currentScale
    const safeLeft = clamp(cropLeft, 0, imageSize.width - cropWidth)
    const safeTop = clamp(cropTop, 0, imageSize.height - cropHeight)
    const targetWidth =
      kind === 'avatar' ? AVATAR_TARGET_SIZE : COVER_TARGET_WIDTH
    let outputWidth = Math.min(targetWidth, Math.round(cropWidth))
    let outputHeight = Math.round(outputWidth / aspect)
    let quality = 0.92
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    let dataUrl = ''
    for (let attempt = 0; attempt < 8; attempt += 1) {
      canvas.width = Math.max(1, outputWidth)
      canvas.height = Math.max(1, outputHeight)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(
        imageRef.current,
        safeLeft,
        safeTop,
        cropWidth,
        cropHeight,
        0,
        0,
        canvas.width,
        canvas.height
      )
      dataUrl = canvas.toDataURL('image/jpeg', quality)
      if (estimateDataUrlBytes(dataUrl) <= maxBytes) {
        break
      }
      if (quality > 0.72) {
        quality -= 0.07
      } else if (outputWidth > 720) {
        outputWidth = Math.round(outputWidth * 0.9)
        outputHeight = Math.round(outputWidth / aspect)
      } else {
        break
      }
    }
    return dataUrl
  }

  const handleConfirm = async () => {
    if (isLocked || !canRender) return
    setLocalError('')
    setIsRendering(true)
    const dataUrl = renderCroppedDataUrl()
    if (!dataUrl) {
      setLocalError('Не удалось подготовить изображение.')
      setIsRendering(false)
      return
    }
    if (estimateDataUrlBytes(dataUrl) > maxBytes) {
      setLocalError('Файл слишком большой. Попробуйте уменьшить масштаб.')
      setIsRendering(false)
      return
    }
    try {
      const ok = await onConfirm(dataUrl)
      if (ok === false) {
        setIsRendering(false)
        return
      }
    } catch (err) {
      setLocalError('Не удалось загрузить изображение.')
    } finally {
      setIsRendering(false)
    }
  }

  const frameStyle = useMemo(
    () => ({ '--crop-aspect': aspect } as CSSProperties),
    [aspect]
  )
  const imageStyle = useMemo(
    () =>
      ({
        '--crop-x': `${offset.x}px`,
        '--crop-y': `${offset.y}px`,
        '--crop-scale': scale,
      }) as CSSProperties,
    [offset.x, offset.y, scale]
  )

  return (
    <div
      className="pro-cropper-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pro-cropper-title"
    >
      <div className="pro-cropper-shell">
        <div className="pro-cropper-header">
          <button
            className="pro-cropper-action"
            type="button"
            onClick={onCancel}
            disabled={isLocked}
          >
            Отмена
          </button>
          <div className="pro-cropper-title" id="pro-cropper-title">
            {title}
          </div>
          <button
            className="pro-cropper-action is-primary"
            type="button"
            onClick={handleConfirm}
            disabled={isLocked || !canRender}
          >
            {isLocked ? 'Сохраняем...' : 'Готово'}
          </button>
        </div>
        <div
          className="pro-cropper-viewport"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerUp}
          role="presentation"
        >
          <img
            ref={imageRef}
            className="pro-cropper-image"
            src={src}
            alt=""
            style={imageStyle}
            onLoad={(event) => {
              const { naturalWidth, naturalHeight } = event.currentTarget
              if (naturalWidth && naturalHeight) {
                setImageSize({ width: naturalWidth, height: naturalHeight })
              }
            }}
          />
          <div
            className={`pro-cropper-frame is-${kind}`}
            ref={frameRef}
            style={frameStyle}
          >
            <span className={`pro-cropper-grid is-${kind}`} aria-hidden="true" />
          </div>
        </div>
        <div className="pro-cropper-controls">
          <div className="pro-cropper-zoom">
            <span className="pro-cropper-zoom-mark" aria-hidden="true">
              -
            </span>
            <input
              className="pro-cropper-zoom-range"
              type="range"
              min={minScale}
              max={maxScale}
              step={0.01}
              value={zoomValue}
              onChange={handleZoomChange}
              aria-label="Масштаб"
            />
            <span className="pro-cropper-zoom-mark" aria-hidden="true">
              +
            </span>
          </div>
          <div className="pro-cropper-footer">
            <button
              className="pro-cropper-secondary"
              type="button"
              onClick={handleReset}
              disabled={isLocked}
            >
              Сброс
            </button>
            <span className="pro-cropper-scale">x{zoomLabel}</span>
          </div>
          <p className="pro-cropper-hint">{hint}</p>
          {(localError || error) && (
            <p className="pro-cropper-error">{localError || error}</p>
          )}
        </div>
      </div>
    </div>
  )
}
