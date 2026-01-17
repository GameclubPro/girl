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

const AUTO_RESUME_DELAY_MS = 5000
const USER_INPUT_WINDOW_MS = 1500
const SCROLL_IDLE_DELAY_MS = 200

export const CollectionCarousel = ({ items, onSelect }: CollectionCarouselProps) => {
  const carouselItems: CollectionItem[] =
    items && items.length > 0 ? items : collectionItems
  const collectionBaseIndex = carouselItems.length
  const loopedCollectionItems = useMemo(
    () => [...carouselItems, ...carouselItems, ...carouselItems],
    [carouselItems]
  )
  const itemsSignature = useMemo(
    () => carouselItems.map((item) => item.id).join('|'),
    [carouselItems]
  )
  const trackRef = useRef<HTMLDivElement | null>(null)
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])
  const rafRef = useRef(0)
  const programmaticScrollRafRef = useRef(0)
  const setWidthRef = useRef(0)
  const stepRef = useRef(0)
  const pauseRef = useRef(false)
  const readyRef = useRef(false)
  const hasCenteredRef = useRef(false)
  const lastCenteredLeftRef = useRef<number | null>(null)
  const resumeTimerRef = useRef(0)
  const userScrollTimerRef = useRef(0)
  const lastUserInputRef = useRef(0)
  const isUserScrollingRef = useRef(false)
  const isProgrammaticScrollRef = useRef(false)
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

    isProgrammaticScrollRef.current = true
    if (programmaticScrollRafRef.current) {
      window.cancelAnimationFrame(programmaticScrollRafRef.current)
    }
    programmaticScrollRafRef.current = window.requestAnimationFrame(() => {
      isProgrammaticScrollRef.current = false
      programmaticScrollRafRef.current = 0
    })

    const previousBehavior = track.style.scrollBehavior
    track.style.scrollBehavior = 'auto'
    track.scrollLeft = nextLeft
    track.style.scrollBehavior = previousBehavior
  }, [])

  const centerMiddle = useCallback(() => {
    const track = trackRef.current
    const middle = cardRefs.current[collectionBaseIndex]
    if (!track || !middle) return false

    const nextLeft =
      middle.offsetLeft - (track.clientWidth - middle.offsetWidth) / 2
    setScrollLeftInstant(nextLeft)
    lastCenteredLeftRef.current = nextLeft
    return true
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

  useLayoutEffect(() => {
    setWidthRef.current = 0
    stepRef.current = 0
    readyRef.current = false
    hasCenteredRef.current = false
    lastCenteredLeftRef.current = null
    setIsReady(false)
  }, [itemsSignature])

  const markReady = useCallback(() => {
    if (readyRef.current) return
    if (!setWidthRef.current || !stepRef.current) return
    readyRef.current = true
    setIsReady(true)
  }, [])

  const pauseAuto = useCallback((delay = AUTO_RESUME_DELAY_MS) => {
    pauseRef.current = true
    if (resumeTimerRef.current) {
      window.clearTimeout(resumeTimerRef.current)
    }
    resumeTimerRef.current = window.setTimeout(() => {
      pauseRef.current = false
    }, delay)
  }, [])

  const handleUserInput = useCallback(() => {
    lastUserInputRef.current = Date.now()
    pauseAuto()
  }, [pauseAuto])

  const handleScroll = () => {
    if (!readyRef.current) return
    if (isProgrammaticScrollRef.current) return
    const now = Date.now()
    const isUserScroll = now - lastUserInputRef.current < USER_INPUT_WINDOW_MS

    if (isUserScroll) {
      lastUserInputRef.current = now
      isUserScrollingRef.current = true
      pauseAuto()
      if (userScrollTimerRef.current) {
        window.clearTimeout(userScrollTimerRef.current)
      }
      userScrollTimerRef.current = window.setTimeout(() => {
        isUserScrollingRef.current = false
        normalizePosition()
      }, SCROLL_IDLE_DELAY_MS)
    }

    if (rafRef.current) return
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = 0
      if (!isUserScrollingRef.current) {
        normalizePosition()
      }
    })
  }

  useLayoutEffect(() => {
    let cancelled = false
    let layoutRaf = 0
    let resizeObserver: ResizeObserver | null = null

    const applyLayout = () => {
      if (cancelled) return
      measure()
      const track = trackRef.current
      const step = stepRef.current
      const lastCentered = lastCenteredLeftRef.current
      const isNearLastCenter =
        track &&
        step > 0 &&
        typeof lastCentered === 'number' &&
        Math.abs(track.scrollLeft - lastCentered) < step * 0.5

      if (!hasCenteredRef.current || isNearLastCenter) {
        if (centerMiddle()) {
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
    const trackEl = trackRef.current
    if (trackEl && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        scheduleLayout()
      })
      resizeObserver.observe(trackEl)
    }

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
      if (resizeObserver) {
        resizeObserver.disconnect()
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
    return () => {
      if (resumeTimerRef.current) {
        window.clearTimeout(resumeTimerRef.current)
      }
      if (userScrollTimerRef.current) {
        window.clearTimeout(userScrollTimerRef.current)
      }
      if (programmaticScrollRafRef.current) {
        window.cancelAnimationFrame(programmaticScrollRafRef.current)
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
    const supportsSmoothScroll =
      typeof document !== 'undefined' &&
      'scrollBehavior' in document.documentElement.style

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
        if (supportsSmoothScroll && typeof track.scrollBy === 'function') {
          track.scrollBy({ left: step, behavior: 'smooth' })
        } else {
          track.scrollLeft += step
        }
      }, 3200)
    }

    pauseRef.current = true
    startTimer = window.setTimeout(startAuto, 1400)

    track.addEventListener('pointerdown', handleUserInput)
    track.addEventListener('touchstart', handleUserInput, { passive: true })
    track.addEventListener('wheel', handleUserInput, { passive: true })
    track.addEventListener('focusin', pauseAuto)

    return () => {
      if (startTimer) {
        window.clearTimeout(startTimer)
      }
      if (intervalId) {
        window.clearInterval(intervalId)
      }
      track.removeEventListener('pointerdown', handleUserInput)
      track.removeEventListener('touchstart', handleUserInput)
      track.removeEventListener('wheel', handleUserInput)
      track.removeEventListener('focusin', pauseAuto)
    }
  }, [handleUserInput, measure, normalizePosition, pauseAuto, isReady, fontsReady])

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
              key={`${item.id}-${index}`}
              type="button"
              aria-hidden={!isPrimary}
              aria-label={cardLabel}
              tabIndex={isPrimary ? 0 : -1}
              onClick={() => onSelect?.(item)}
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
