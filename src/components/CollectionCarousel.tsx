import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { collectionItems, type CollectionItem } from '../data/clientData'

type CollectionCarouselProps = {
  items?: CollectionItem[]
  onSelect?: (item: CollectionItem) => void
}

export const CollectionCarousel = ({ items, onSelect }: CollectionCarouselProps) => {
  const carouselItems =
    items && items.length > 0 ? items : collectionItems
  const collectionBaseIndex = carouselItems.length
  const loopedCollectionItems = useMemo(
    () => [...carouselItems, ...carouselItems, ...carouselItems],
    [carouselItems]
  )
  const trackRef = useRef<HTMLDivElement | null>(null)
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])
  const rafRef = useRef(0)
  const setWidthRef = useRef(0)
  const stepRef = useRef(0)
  const pauseRef = useRef(false)
  const readyRef = useRef(false)
  const hasCenteredRef = useRef(false)
  const [isReady, setIsReady] = useState(false)
  const [fontsReady, setFontsReady] = useState(false)

  const measure = useCallback(() => {
    const track = trackRef.current
    const first = cardRefs.current[0]
    const middle = cardRefs.current[collectionBaseIndex]
    if (!track || !middle) return

    const trackStyle = window.getComputedStyle(track)
    const gapValue = trackStyle.columnGap || trackStyle.gap || '0'
    const gap = Number.parseFloat(gapValue) || 0
    const cardWidth = middle.getBoundingClientRect().width
    const middleNext = cardRefs.current[collectionBaseIndex + 1]
    const offsetStep = middleNext ? middleNext.offsetLeft - middle.offsetLeft : 0
    const step = offsetStep > 0 ? offsetStep : cardWidth + gap

    if (!Number.isFinite(step) || step <= 0) return

    stepRef.current = step
    const offsetSetWidth = first ? middle.offsetLeft - first.offsetLeft : 0
    setWidthRef.current =
      offsetSetWidth > 0 ? offsetSetWidth : step * carouselItems.length
  }, [carouselItems.length, collectionBaseIndex])

  const setScrollLeftInstant = useCallback((nextLeft: number) => {
    const track = trackRef.current
    if (!track) return

    const previousBehavior = track.style.scrollBehavior
    track.style.scrollBehavior = 'auto'
    track.scrollLeft = nextLeft
    track.style.scrollBehavior = previousBehavior
  }, [])

  const centerMiddle = useCallback(() => {
    const track = trackRef.current
    const middle = cardRefs.current[collectionBaseIndex]
    if (!track || !middle) return

    const nextLeft =
      middle.offsetLeft - (track.clientWidth - middle.offsetWidth) / 2
    setScrollLeftInstant(nextLeft)
  }, [collectionBaseIndex, setScrollLeftInstant])

  const normalizePosition = useCallback(() => {
    const track = trackRef.current
    const setWidth = setWidthRef.current
    if (!track || !setWidth) return

    if (track.scrollLeft < setWidth * 0.2) {
      setScrollLeftInstant(track.scrollLeft + setWidth)
    } else if (track.scrollLeft > setWidth * 1.8) {
      setScrollLeftInstant(track.scrollLeft - setWidth)
    }
  }, [setScrollLeftInstant])

  useEffect(() => {
    cardRefs.current = []
    setWidthRef.current = 0
    stepRef.current = 0
    readyRef.current = false
    hasCenteredRef.current = false
    setIsReady(false)
  }, [carouselItems])

  const markReady = useCallback(() => {
    if (readyRef.current) return
    if (!setWidthRef.current || !stepRef.current) return
    readyRef.current = true
    setIsReady(true)
  }, [])

  const handleScroll = () => {
    if (!readyRef.current) return
    if (rafRef.current) return
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = 0
      normalizePosition()
    })
  }

  useLayoutEffect(() => {
    let cancelled = false
    let layoutRaf = 0

    const applyLayout = () => {
      if (cancelled) return
      measure()
      if (!hasCenteredRef.current) {
        const track = trackRef.current
        const middle = cardRefs.current[collectionBaseIndex]
        if (track && middle) {
          centerMiddle()
          hasCenteredRef.current = true
        }
      }
      normalizePosition()
      markReady()
    }

    applyLayout()

    const scheduleLayout = () => {
      if (layoutRaf) {
        window.cancelAnimationFrame(layoutRaf)
      }
      layoutRaf = window.requestAnimationFrame(applyLayout)
    }

    window.addEventListener('resize', scheduleLayout)

    const fontsReady = document.fonts?.ready
    if (fontsReady) {
      fontsReady.then(() => {
        scheduleLayout()
      })
    }

    return () => {
      cancelled = true
      if (layoutRaf) {
        window.cancelAnimationFrame(layoutRaf)
      }
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current)
      }
      window.removeEventListener('resize', scheduleLayout)
    }
  }, [centerMiddle, markReady, measure, normalizePosition, loopedCollectionItems])

  useEffect(() => {
    let cancelled = false
    let fallbackTimer = 0
    const readyPromise = document.fonts?.ready

    if (readyPromise) {
      readyPromise.then(() => {
        if (!cancelled) {
          setFontsReady(true)
        }
      })
      fallbackTimer = window.setTimeout(() => {
        if (!cancelled) {
          setFontsReady(true)
        }
      }, 2000)
    } else {
      setFontsReady(true)
    }

    return () => {
      cancelled = true
      if (fallbackTimer) {
        window.clearTimeout(fallbackTimer)
      }
    }
  }, [])

  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    if (!isReady || !fontsReady) return

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    )
    if (prefersReducedMotion.matches) return

    let resumeTimer = 0
    let startTimer = 0
    let intervalId = 0
    let autoStarted = false

    const startAuto = () => {
      if (autoStarted) return
      autoStarted = true
      measure()
      normalizePosition()
      pauseRef.current = false
      intervalId = window.setInterval(() => {
        if (pauseRef.current) return
        const setWidth = setWidthRef.current
        const step = stepRef.current
        if (!setWidth || !step) {
          measure()
          normalizePosition()
          return
        }
        if (step < setWidth * 0.1 || step > setWidth * 0.4) {
          measure()
          normalizePosition()
          return
        }
        normalizePosition()
        track.scrollBy({ left: step, behavior: 'smooth' })
      }, 3200)
    }

    const pauseAuto = () => {
      if (!autoStarted) return
      pauseRef.current = true
      if (resumeTimer) {
        window.clearTimeout(resumeTimer)
      }
      resumeTimer = window.setTimeout(() => {
        pauseRef.current = false
      }, 3500)
    }

    pauseRef.current = true
    startTimer = window.setTimeout(startAuto, 1400)

    track.addEventListener('pointerdown', pauseAuto)
    track.addEventListener('touchstart', pauseAuto, { passive: true })
    track.addEventListener('wheel', pauseAuto, { passive: true })
    track.addEventListener('focusin', pauseAuto)

    return () => {
      if (startTimer) {
        window.clearTimeout(startTimer)
      }
      if (intervalId) {
        window.clearInterval(intervalId)
      }
      if (resumeTimer) {
        window.clearTimeout(resumeTimer)
      }
      track.removeEventListener('pointerdown', pauseAuto)
      track.removeEventListener('touchstart', pauseAuto)
      track.removeEventListener('wheel', pauseAuto)
      track.removeEventListener('focusin', pauseAuto)
    }
  }, [measure, normalizePosition, isReady, fontsReady])

  return (
    <div
      className="collection-carousel"
      role="region"
      aria-label="Подборки для вас"
      aria-roledescription="carousel"
    >
      <div className="collection-track" ref={trackRef} onScroll={handleScroll}>
        {loopedCollectionItems.map((item, index) => {
          const isPrimary =
            index >= collectionBaseIndex &&
            index < collectionBaseIndex + carouselItems.length
          const cardLabel = `Открыть подборку: ${item.title}`
          return (
            <button
              className={`collection-card collection-card--${item.tone}`}
              key={`${item.id}-${index}`}
              type="button"
              aria-hidden={!isPrimary}
              aria-label={cardLabel}
              tabIndex={isPrimary ? 0 : -1}
              onClick={() => onSelect?.(item)}
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
              {item.cornerImage && (
                <span className="collection-card-art" aria-hidden="true">
                  <img src={item.cornerImage} alt="" loading="lazy" />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
