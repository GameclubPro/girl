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
const EDGE_RESISTANCE = 0.35
const MAX_SWIPE_ITEMS = 1

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
  const carouselItems: CollectionItem[] =
    items && items.length > 0 ? items : collectionItems
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
  const [activeIndex, setActiveIndex] = useState(0)
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
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
    setActiveIndex(0)
    setDragOffset(0)
    dragDeltaRef.current = 0
    hasDraggedRef.current = false
  }, [itemsSignature])

  useEffect(() => {
    if (carouselItems.length === 0) return
    setActiveIndex((prev) => clampIndex(prev, 0, carouselItems.length - 1))
  }, [carouselItems.length])

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

      let nextOffset = clampValue(delta, -maxDrag, maxDrag)
      if (activeIndex === 0 && nextOffset > 0) {
        nextOffset *= EDGE_RESISTANCE
      }
      if (activeIndex === carouselItems.length - 1 && nextOffset < 0) {
        nextOffset *= EDGE_RESISTANCE
      }
      setDragOffset(nextOffset)
      event.preventDefault()
    },
    [activeIndex, carouselItems.length, layout.step, maxDrag]
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

      let nextIndex = activeIndex
      if (canMove) {
        const direction = delta < 0 ? 1 : -1
        nextIndex = clampIndex(
          activeIndex + clampIndex(direction, -MAX_SWIPE_ITEMS, MAX_SWIPE_ITEMS),
          0,
          Math.max(0, carouselItems.length - 1)
        )
      }

      setActiveIndex(nextIndex)
      setDragOffset(0)
      setIsDragging(false)
      dragDeltaRef.current = 0
    },
    [activeIndex, carouselItems.length, layout.step]
  )

  const handleCardClick = (item: CollectionItem) => {
    if (hasDraggedRef.current) return
    onSelect?.(item)
  }

  const trackStyle: CSSProperties = {
    transform: `translate3d(${baseOffset - activeIndex * layout.step + dragOffset}px, 0, 0)`,
  }

  return (
    <div
      className="collection-carousel"
      role="region"
      aria-label="Подборки для вас"
      aria-roledescription="carousel"
    >
      <div
        className={`collection-track${isDragging ? ' is-dragging' : ''}`}
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={trackStyle}
      >
        {carouselItems.map((item, index) => {
          const cardLabel = `Открыть подборку: ${item.title}`
          const cardStyle = item.cornerImage
            ? ({
                '--collection-card-art-image': `url(${item.cornerImage})`,
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
              key={item.id}
              type="button"
              aria-label={cardLabel}
              onClick={() => handleCardClick(item)}
              style={cardStyle}
              ref={(element) => {
                cardRefs.current[index] = element
              }}
            >
              <span className="collection-tag">
                <span className="collection-badge" aria-hidden="true">
                  {item.badge}
                </span>
                {item.label}
              </span>
              <span className="collection-body">
                <span className="collection-title">{item.title}</span>
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
