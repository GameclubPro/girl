import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { collectionItems, type CollectionItem } from '../data/clientData'

type CollectionCarouselProps = {
  items?: CollectionItem[]
  onSelect?: (item: CollectionItem) => void
}

const DRAG_START_PX = 6
const DRAG_THRESHOLD_PX = 44
const MAX_SWIPE_ITEMS = 1
const TRANSITION_MS = 260

const clampIndex = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const clampValue = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

type LayoutMetrics = {
  step: number
  cardWidth: number
  trackWidth: number
  startOffset: number
}

export const CollectionCarousel = ({ items, onSelect }: CollectionCarouselProps) => {
  const baseItems = items && items.length > 0 ? items : collectionItems
  const carouselItems = useMemo(() => [...baseItems].reverse(), [baseItems])
  const loopItems = useMemo(() => {
    if (carouselItems.length <= 1) return carouselItems
    const first = carouselItems[0]
    const last = carouselItems[carouselItems.length - 1]
    return [last, ...carouselItems, first]
  }, [carouselItems])
  const itemsSignature = useMemo(
    () => carouselItems.map((item) => item.id).join('|'),
    [carouselItems]
  )
  const trackRef = useRef<HTMLDivElement | null>(null)
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])
  const pointerIdRef = useRef<number | null>(null)
  const dragStartXRef = useRef(0)
  const dragDeltaRef = useRef(0)
  const isPointerDownRef = useRef(false)
  const hasDraggedRef = useRef(false)
  const snapTimerRef = useRef(0)
  const [visualIndex, setVisualIndex] = useState(
    carouselItems.length > 1 ? 1 : 0
  )
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [isTransitionEnabled, setIsTransitionEnabled] = useState(true)
  const [layout, setLayout] = useState<LayoutMetrics>({
    step: 0,
    cardWidth: 0,
    trackWidth: 0,
    startOffset: 0,
  })

  const updateLayout = useCallback(() => {
    const track = trackRef.current
    const first = cardRefs.current[0]
    const second = cardRefs.current[1]
    if (!track || !first) return

    const trackStyle = window.getComputedStyle(track)
    const gapValue = trackStyle.columnGap || trackStyle.gap || '0'
    const gap = Number.parseFloat(gapValue) || 0
    const cardWidth = first.getBoundingClientRect().width
    const step = second ? second.offsetLeft - first.offsetLeft : cardWidth + gap
    const trackWidth = track.clientWidth
    const startOffset = first.offsetLeft

    if (!Number.isFinite(step) || step <= 0) return

    setLayout((prev) => {
      if (
        prev.step === step &&
        prev.cardWidth === cardWidth &&
        prev.trackWidth === trackWidth &&
        prev.startOffset === startOffset
      ) {
        return prev
      }
      return { step, cardWidth, trackWidth, startOffset }
    })
  }, [])

  useLayoutEffect(() => {
    updateLayout()
  }, [itemsSignature, updateLayout])

  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      updateLayout()
    })
    observer.observe(track)
    return () => observer.disconnect()
  }, [updateLayout])

  useEffect(() => {
    setVisualIndex(carouselItems.length > 1 ? 1 : 0)
    setDragOffset(0)
    dragDeltaRef.current = 0
    hasDraggedRef.current = false
  }, [itemsSignature])

  useEffect(() => {
    if (carouselItems.length === 0) return
    setVisualIndex((prev) => {
      const maxIndex = loopItems.length > 0 ? loopItems.length - 1 : 0
      return clampIndex(prev, 0, maxIndex)
    })
  }, [carouselItems.length, loopItems.length])

  const baseOffset =
    layout.trackWidth && layout.cardWidth
      ? layout.trackWidth / 2 - (layout.startOffset + layout.cardWidth / 2)
      : 0
  const maxDrag = layout.step ? layout.step * 1.1 : 0

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 && event.pointerType !== 'touch') return
      const track = trackRef.current
      if (!track) return
      pointerIdRef.current = event.pointerId
      isPointerDownRef.current = true
      hasDraggedRef.current = false
      dragStartXRef.current = event.clientX
      dragDeltaRef.current = 0
      setIsDragging(false)
      track.setPointerCapture(event.pointerId)
    },
    []
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isPointerDownRef.current) return
      if (pointerIdRef.current !== event.pointerId) return
      if (!layout.step) return

      const delta = event.clientX - dragStartXRef.current
      dragDeltaRef.current = delta
      const absDelta = Math.abs(delta)
      if (absDelta > DRAG_START_PX) {
        hasDraggedRef.current = true
        setIsDragging(true)
      }

      const nextOffset = clampValue(delta, -maxDrag, maxDrag)
      setDragOffset(nextOffset)
      event.preventDefault()
    },
    [layout.step, maxDrag]
  )

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isPointerDownRef.current) return
      if (pointerIdRef.current !== event.pointerId) return
      const track = trackRef.current
      if (track) {
        track.releasePointerCapture(event.pointerId)
      }
      isPointerDownRef.current = false
      pointerIdRef.current = null

      const delta = dragDeltaRef.current
      const threshold = Math.max(DRAG_THRESHOLD_PX, layout.step * 0.18)
      const canMove = Math.abs(delta) > threshold

      let nextIndex = visualIndex
      if (canMove) {
        const direction = delta < 0 ? 1 : -1
        nextIndex = clampIndex(
          visualIndex + clampIndex(direction, -MAX_SWIPE_ITEMS, MAX_SWIPE_ITEMS),
          0,
          Math.max(0, loopItems.length - 1)
        )
      }

      setVisualIndex(nextIndex)
      setDragOffset(0)
      setIsDragging(false)
      dragDeltaRef.current = 0
    },
    [loopItems.length, layout.step, visualIndex]
  )

  const handleCardClick = (item: CollectionItem) => {
    if (hasDraggedRef.current) return
    onSelect?.(item)
  }

  useEffect(() => {
    if (snapTimerRef.current) {
      window.clearTimeout(snapTimerRef.current)
    }
    if (carouselItems.length <= 1) return
    if (isDragging) return
    const maxIndex = loopItems.length - 1
    if (visualIndex !== 0 && visualIndex !== maxIndex) return
    snapTimerRef.current = window.setTimeout(() => {
      setIsTransitionEnabled(false)
      setVisualIndex(visualIndex === 0 ? carouselItems.length : 1)
      window.requestAnimationFrame(() => {
        setIsTransitionEnabled(true)
      })
    }, TRANSITION_MS)
    return () => {
      if (snapTimerRef.current) {
        window.clearTimeout(snapTimerRef.current)
      }
    }
  }, [carouselItems.length, isDragging, loopItems.length, visualIndex])

  useEffect(() => {
    return () => {
      if (snapTimerRef.current) {
        window.clearTimeout(snapTimerRef.current)
      }
    }
  }, [])

  const trackStyle: CSSProperties = {
    transform: `translate3d(${baseOffset - visualIndex * layout.step + dragOffset}px, 0, 0)`,
  }

  return (
    <div
      className="collection-carousel"
      role="region"
      aria-label="Подборки для вас"
      aria-roledescription="carousel"
    >
      <div
        className={`collection-track${isDragging ? ' is-dragging' : ''}${
          isTransitionEnabled ? '' : ' is-jumping'
        }`}
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={trackStyle}
      >
        {loopItems.map((item, index) => {
          const cardLabel = `Открыть подборку: ${item.title}`
          const cardStyle = item.cornerImage
            ? ({
                '--collection-card-art-image': `url("${item.cornerImage}")`,
                '--collection-card-art-size':
                  item.cornerImageSize ?? 'clamp(120px, 44vw, 190px)',
                '--collection-card-art-right': item.cornerImageRight ?? '-6px',
                '--collection-card-art-top':
                  item.cornerImagePosition === 'right' ? '50%' : 'auto',
                '--collection-card-art-bottom':
                  item.cornerImagePosition === 'right'
                    ? 'auto'
                    : item.cornerImageBottom ?? '-6px',
                '--collection-card-art-translate':
                  item.cornerImagePosition === 'right'
                    ? 'translateY(-50%)'
                    : 'translateY(0)',
                '--collection-card-art-rotate': item.cornerImageRotate ?? '0deg',
              } as CSSProperties)
            : undefined
          return (
            <button
              className={`collection-card collection-card--${item.tone}`}
              key={`${item.id}-${index}`}
              type="button"
              aria-label={cardLabel}
              onClick={() => handleCardClick(item)}
              style={cardStyle}
              ref={(element) => {
                cardRefs.current[index] = element
              }}
            >
              <span className="collection-body">
                <span className="collection-title">
                  <span className="collection-title-badge" aria-hidden="true">
                    {item.badge}
                  </span>
                  {item.title}
                </span>
                <span className="collection-meta">{item.meta}</span>
              </span>
              <span className="collection-cta" aria-hidden="true">
                Смотреть <span className="collection-cta-arrow">›</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
