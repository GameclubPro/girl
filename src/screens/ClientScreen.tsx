import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react'
import {
  IconChat,
  IconHome,
  IconList,
  IconUser,
  IconUsers,
} from '../components/icons'
import { StoryViewer } from '../components/StoryViewer'
import { CollectionCarousel } from '../components/CollectionCarousel'
import { categoryItems, type CollectionItem } from '../data/clientData'
import type { MasterProfile, StoryGroup } from '../types/app'
import { isImageUrl, parsePortfolioItems } from '../utils/profileContent'

const categoryLabelOverrides: Record<string, string> = {
  'beauty-nails': 'Ногти',
  'cosmetology-care': 'Уход за лицом',
}

type ShowcaseMedia = {
  id: string
  url: string
  focusX: number
  focusY: number
  categories: string[]
  shape: ShowcaseShape
}

const showcaseAreas = ['a', 'b', 'c', 'd']
const collageShapes = ['is-wide', 'is-tall', 'is-small', 'is-small'] as const
type ShowcaseShape = (typeof collageShapes)[number]
const slotShapes: ShowcaseShape[] = [...collageShapes]

const shuffleItems = <T,>(items: T[]) => {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[randomIndex]] = [result[randomIndex], result[index]]
  }
  return result
}

const parseLength = (value: string) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const buildShowcaseUrl = (url: string, width: number) => {
  if (!url || url.startsWith('data:')) return url
  const [base, hash] = url.split('#')
  const [path, query = ''] = base.split('?')
  const params = new URLSearchParams(query)
  params.set('w', String(width))
  const next = `${path}?${params.toString()}`
  return hash ? `${next}#${hash}` : next
}

const buildShowcaseSrcSet = (url: string, widths: number[] | null) => {
  if (!widths || widths.length === 0 || url.startsWith('data:')) {
    return undefined
  }
  return widths.map((width) => `${buildShowcaseUrl(url, width)} ${width}w`).join(', ')
}

export const ClientScreen = ({
  apiBase,
  userId,
  activeCategoryId,
  onCategoryChange,
  onViewShowcase,
  onViewMasters,
  onViewChats,
  onViewRequests,
  onViewProfile,
  onViewMasterProfile,
  onCreateRequest,
}: {
  apiBase: string
  userId: string
  activeCategoryId: string | null
  onCategoryChange: (categoryId: string | null) => void
  onViewShowcase: () => void
  onViewMasters: () => void
  onViewChats: () => void
  onViewRequests: (tab?: 'requests' | 'bookings') => void
  onViewProfile: () => void
  onViewMasterProfile: (masterId: string) => void
  onCreateRequest: (categoryId?: string | null) => void
}) => {
  type CategoryItem = (typeof categoryItems)[number]
  const [showcasePool, setShowcasePool] = useState<ShowcaseMedia[]>([])
  const [storyGroups, setStoryGroups] = useState<StoryGroup[]>([])
  const [isStoriesLoading, setIsStoriesLoading] = useState(false)
  const [storiesError, setStoriesError] = useState('')
  const [activeStoryGroupIndex, setActiveStoryGroupIndex] = useState<number | null>(
    null
  )
  const [activeStoryIndex, setActiveStoryIndex] = useState(0)
  const showcaseGalleryRef = useRef<HTMLDivElement | null>(null)
  const [showcaseTileWidth, setShowcaseTileWidth] = useState<number | null>(null)
  const [isCategoryOverlayOpen, setIsCategoryOverlayOpen] = useState(
    () => !activeCategoryId
  )
  const [isCategoryOverlayClosing, setIsCategoryOverlayClosing] = useState(false)
  const [isCategoryOverlayExiting, setIsCategoryOverlayExiting] = useState(false)
  const closeOverlayTimerRef = useRef<number | null>(null)
  const exitOverlayTimerRef = useRef<number | null>(null)
  const categoryTargetRef = useRef<HTMLButtonElement | null>(null)
  const categoryMorphRef = useRef<HTMLElement | null>(null)
  const categoryMorphSourceRef = useRef<HTMLElement | null>(null)
  const categoryMorphSourceVisibilityRef = useRef<string>('')
  const [isCategoryAnimating, setIsCategoryAnimating] = useState(false)
  const [isCategoryPulsed, setIsCategoryPulsed] = useState(false)
  const pulseTimerRef = useRef<number[]>([])
  const activeCategoryItem = activeCategoryId
    ? categoryItems.find((item) => item.id === activeCategoryId) ?? null
    : null
  const activeCategoryLabel = activeCategoryId
    ? categoryLabelOverrides[activeCategoryId] ?? activeCategoryItem?.label ?? ''
    : ''
  const categoryPillLabel = activeCategoryLabel || 'Категория'

  useEffect(() => {
    if (activeCategoryId) return
    setIsCategoryOverlayOpen(true)
    setIsCategoryOverlayClosing(false)
  }, [activeCategoryId])

  useEffect(() => {
    if (!isCategoryOverlayOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isCategoryOverlayOpen])

  const clearPulseTimers = useCallback(() => {
    pulseTimerRef.current.forEach((timer) => window.clearTimeout(timer))
    pulseTimerRef.current = []
  }, [])

  const restoreCategoryMorphSource = useCallback(() => {
    const sourceEl = categoryMorphSourceRef.current
    if (sourceEl) {
      sourceEl.style.visibility = categoryMorphSourceVisibilityRef.current
    }
    categoryMorphSourceRef.current = null
    categoryMorphSourceVisibilityRef.current = ''
  }, [])

  const clearCategoryMorph = useCallback(() => {
    if (categoryMorphRef.current) {
      categoryMorphRef.current.remove()
      categoryMorphRef.current = null
    }
    restoreCategoryMorphSource()
  }, [restoreCategoryMorphSource])

  useEffect(() => {
    return () => {
      if (closeOverlayTimerRef.current) {
        window.clearTimeout(closeOverlayTimerRef.current)
      }
      if (exitOverlayTimerRef.current) {
        window.clearTimeout(exitOverlayTimerRef.current)
      }
      clearCategoryMorph()
      clearPulseTimers()
    }
  }, [clearCategoryMorph, clearPulseTimers])
  useEffect(() => {
    let cancelled = false

    const loadShowcase = async () => {
      try {
        const response = await fetch(`${apiBase}/api/masters`)
        if (!response.ok) {
          throw new Error('Load showcase failed')
        }
        const data = (await response.json()) as MasterProfile[]
        if (cancelled) return

        const nextPool = data.flatMap((profile) => {
          const categories = Array.isArray(profile.categories) ? profile.categories : []
          return parsePortfolioItems(profile.portfolioUrls ?? [])
            .filter((item) => isImageUrl(item.url))
            .map((item, index) => ({
              id: `${profile.userId}-${index}`,
              url: item.url,
              focusX: item.focusX ?? 0.5,
              focusY: item.focusY ?? 0.5,
              categories,
              shape: collageShapes[index % collageShapes.length],
            }))
        })
        setShowcasePool(nextPool)
      } catch (error) {
        if (!cancelled) {
          setShowcasePool([])
        }
      }
    }

    void loadShowcase()

    return () => {
      cancelled = true
    }
  }, [apiBase])

  useEffect(() => {
    let cancelled = false
    if (!userId) return

    const loadStories = async () => {
      setIsStoriesLoading(true)
      setStoriesError('')
      try {
        const response = await fetch(
          `${apiBase}/api/stories?userId=${encodeURIComponent(userId)}`
        )
        if (!response.ok) {
          throw new Error('Load stories failed')
        }
        const data = (await response.json()) as StoryGroup[]
        if (!cancelled) {
          setStoryGroups(Array.isArray(data) ? data : [])
        }
      } catch (error) {
        if (!cancelled) {
          setStoriesError('Не удалось загрузить истории.')
          setStoryGroups([])
        }
      } finally {
        if (!cancelled) {
          setIsStoriesLoading(false)
        }
      }
    }

    void loadStories()

    return () => {
      cancelled = true
    }
  }, [apiBase, userId])

  useEffect(() => {
    const gallery = showcaseGalleryRef.current
    if (!gallery || typeof ResizeObserver === 'undefined') return

    const updateSize = () => {
      const rect = gallery.getBoundingClientRect()
      if (!rect.width) return
      const styles = window.getComputedStyle(gallery)
      const paddingX =
        parseLength(styles.paddingLeft) + parseLength(styles.paddingRight)
      const borderX =
        parseLength(styles.borderLeftWidth) + parseLength(styles.borderRightWidth)
      const columnGap = parseLength(styles.columnGap)
      const gapValue = columnGap > 0 ? columnGap : parseLength(styles.gap)
      const contentWidth = rect.width - paddingX - borderX
      const next = Math.max(1, Math.round((contentWidth - gapValue) / 2))
      setShowcaseTileWidth((current) => (current === next ? current : next))
    }

    updateSize()
    const observer = new ResizeObserver(() => updateSize())
    observer.observe(gallery)
    return () => observer.disconnect()
  }, [])

  const closeCategoryOverlay = useCallback(() => {
    if (closeOverlayTimerRef.current) {
      window.clearTimeout(closeOverlayTimerRef.current)
    }
    if (exitOverlayTimerRef.current) {
      window.clearTimeout(exitOverlayTimerRef.current)
    }
    clearCategoryMorph()
    setIsCategoryOverlayExiting(false)
    setIsCategoryAnimating(false)
    setIsCategoryOverlayClosing(true)
    closeOverlayTimerRef.current = window.setTimeout(() => {
      setIsCategoryOverlayOpen(false)
      setIsCategoryOverlayClosing(false)
    }, 280)
  }, [clearCategoryMorph])

  const openCategoryOverlay = useCallback(() => {
    if (closeOverlayTimerRef.current) {
      window.clearTimeout(closeOverlayTimerRef.current)
    }
    if (exitOverlayTimerRef.current) {
      window.clearTimeout(exitOverlayTimerRef.current)
    }
    setIsCategoryOverlayOpen(true)
    setIsCategoryOverlayClosing(false)
    setIsCategoryOverlayExiting(false)
    setIsCategoryAnimating(false)
  }, [])

  const triggerCategoryPulse = useCallback((delay = 0) => {
    clearPulseTimers()
    const startTimer = window.setTimeout(() => {
      setIsCategoryPulsed(true)
      const stopTimer = window.setTimeout(() => {
        setIsCategoryPulsed(false)
      }, 620)
      pulseTimerRef.current.push(stopTimer)
    }, delay)
    pulseTimerRef.current.push(startTimer)
  }, [clearPulseTimers])

  const createCategoryMorph = useCallback((sourceEl: HTMLElement) => {
    const sourceRect = sourceEl.getBoundingClientRect()
    if (!sourceRect.width || !sourceRect.height) return null

    const morph = sourceEl.cloneNode(true) as HTMLElement
    morph.classList.add('category-morph')
    morph.style.position = 'fixed'
    morph.style.left = `${sourceRect.left}px`
    morph.style.top = `${sourceRect.top}px`
    morph.style.width = `${sourceRect.width}px`
    morph.style.height = `${sourceRect.height}px`
    morph.style.margin = '0'
    morph.style.opacity = '1'
    morph.style.transform = 'none'
    morph.style.animation = 'none'
    morph.style.pointerEvents = 'none'
    morph.style.zIndex = '140'

    const sourceStyles = window.getComputedStyle(sourceEl)
    morph.style.borderRadius = sourceStyles.borderRadius
    morph.style.boxShadow = sourceStyles.boxShadow
    morph.style.background = sourceStyles.background
    morph.style.borderColor = sourceStyles.borderColor
    morph.style.borderWidth = sourceStyles.borderWidth
    morph.style.borderStyle = sourceStyles.borderStyle
    morph.style.padding = sourceStyles.padding

    document.body.appendChild(morph)

    categoryMorphSourceRef.current = sourceEl
    categoryMorphSourceVisibilityRef.current = sourceEl.style.visibility
    sourceEl.style.visibility = 'hidden'

    return morph
  }, [])

  const animateMorphToHeader = useCallback(
    (morph: HTMLElement, targetEl: HTMLElement, onFinish?: () => void) => {
      const sourceRect = morph.getBoundingClientRect()
      const targetRect = targetEl.getBoundingClientRect()

      if (!sourceRect.width || !targetRect.width) {
        morph.remove()
        restoreCategoryMorphSource()
        onFinish?.()
        return
      }

      const startX = sourceRect.left + sourceRect.width / 2
      const startY = sourceRect.top + sourceRect.height / 2
      const endX = targetRect.left + targetRect.width / 2
      const endY = targetRect.top + targetRect.height / 2
      const deltaX = endX - startX
      const deltaY = endY - startY
      const scaleX = targetRect.width / sourceRect.width
      const scaleY = targetRect.height / sourceRect.height

      const sourceStyles = window.getComputedStyle(morph)
      const targetStyles = window.getComputedStyle(targetEl)
      const startPadding = `${sourceStyles.paddingTop} ${sourceStyles.paddingRight} ${sourceStyles.paddingBottom} ${sourceStyles.paddingLeft}`
      const endPadding = `${targetStyles.paddingTop} ${targetStyles.paddingRight} ${targetStyles.paddingBottom} ${targetStyles.paddingLeft}`

      const arrow = morph.querySelector(
        '.category-overlay-card-arrow'
      ) as HTMLElement | null
      arrow?.animate(
        [
          { opacity: 1, transform: 'translateX(0)' },
          { opacity: 0, transform: 'translateX(6px)' },
        ],
        { duration: 220, easing: 'ease', fill: 'forwards' }
      )

      const dipY = Math.max(16, Math.min(32, sourceRect.height * 0.35))
      const curveLift = Math.max(10, dipY * 0.55)
      const animation = morph.animate(
        [
          {
            transform: 'translate3d(0, 0, 0) scale(1)',
            opacity: 1,
            borderRadius: sourceStyles.borderRadius,
            boxShadow: sourceStyles.boxShadow,
            borderColor: sourceStyles.borderColor,
            background: sourceStyles.background,
            padding: startPadding,
          },
          {
            offset: 0.18,
            transform: `translate3d(${deltaX * 0.08}px, ${dipY}px, 0) scale(1)`,
            opacity: 0.98,
            borderRadius: sourceStyles.borderRadius,
            boxShadow: sourceStyles.boxShadow,
            borderColor: sourceStyles.borderColor,
            background: sourceStyles.background,
            padding: startPadding,
          },
          {
            offset: 0.55,
            transform: `translate3d(${deltaX * 0.6}px, ${deltaY * 0.55 - curveLift}px, 0) scale(1)`,
            opacity: 0.97,
            borderRadius: sourceStyles.borderRadius,
            boxShadow: sourceStyles.boxShadow,
            borderColor: sourceStyles.borderColor,
            background: sourceStyles.background,
            padding: startPadding,
          },
          {
            offset: 0.82,
            transform: `translate3d(${deltaX * 0.88}px, ${deltaY * 0.88}px, 0) scale(1)`,
            opacity: 0.96,
            borderRadius: sourceStyles.borderRadius,
            boxShadow: sourceStyles.boxShadow,
            borderColor: sourceStyles.borderColor,
            background: sourceStyles.background,
            padding: startPadding,
          },
          {
            offset: 0.92,
            transform: `translate3d(${deltaX * 0.95}px, ${deltaY * 0.95}px, 0) scale(1)`,
            opacity: 0.98,
            borderRadius: targetStyles.borderRadius,
            boxShadow: targetStyles.boxShadow,
            borderColor: targetStyles.borderColor,
            background: targetStyles.background,
            padding: endPadding,
          },
          {
            transform: `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${scaleX}, ${scaleY})`,
            opacity: 1,
            borderRadius: targetStyles.borderRadius,
            boxShadow: targetStyles.boxShadow,
            borderColor: targetStyles.borderColor,
            background: targetStyles.background,
            padding: endPadding,
          },
        ],
        {
          duration: 620,
          easing: 'cubic-bezier(0.22, 0.8, 0.2, 1)',
          fill: 'forwards',
        }
      )

      const finalize = () => {
        morph.remove()
        restoreCategoryMorphSource()
        onFinish?.()
      }

      animation.onfinish = finalize
      animation.oncancel = finalize
    },
    [restoreCategoryMorphSource]
  )

  const handleCategorySelect = useCallback(
    (item: CategoryItem, event: MouseEvent<HTMLButtonElement>) => {
      if (isCategoryOverlayExiting) return
      const targetEl = categoryTargetRef.current
      const reduceMotion = window.matchMedia?.(
        '(prefers-reduced-motion: reduce)'
      )?.matches

      if (reduceMotion || !targetEl) {
        onCategoryChange(item.id)
        setIsCategoryAnimating(false)
        triggerCategoryPulse(0)
        closeCategoryOverlay()
        return
      }

      setIsCategoryAnimating(true)
      onCategoryChange(item.id)

      if (exitOverlayTimerRef.current) {
        window.clearTimeout(exitOverlayTimerRef.current)
      }
      if (closeOverlayTimerRef.current) {
        window.clearTimeout(closeOverlayTimerRef.current)
      }
      clearCategoryMorph()

      const morph = createCategoryMorph(event.currentTarget)
      if (morph) {
        categoryMorphRef.current = morph
      }

      setIsCategoryOverlayClosing(false)
      setIsCategoryOverlayExiting(true)

      window.requestAnimationFrame(() => {
        const currentMorph = categoryMorphRef.current
        if (currentMorph && targetEl) {
          animateMorphToHeader(currentMorph, targetEl, () => {
            categoryMorphRef.current = null
            setIsCategoryAnimating(false)
            triggerCategoryPulse()
          })
        } else {
          clearCategoryMorph()
          setIsCategoryAnimating(false)
          triggerCategoryPulse()
        }
      })

      exitOverlayTimerRef.current = window.setTimeout(() => {
        setIsCategoryOverlayOpen(false)
        setIsCategoryOverlayExiting(false)
      }, 420)
    },
    [
      animateMorphToHeader,
      clearCategoryMorph,
      closeCategoryOverlay,
      createCategoryMorph,
      isCategoryOverlayExiting,
      onCategoryChange,
      triggerCategoryPulse,
    ]
  )

  const showcaseItems = useMemo<ShowcaseMedia[]>(() => {
    const pool = activeCategoryId
      ? showcasePool.filter((item) => item.categories.includes(activeCategoryId))
      : showcasePool
    const basePool = pool.length > 0 ? pool : showcasePool
    if (basePool.length === 0) return []
    const shuffled = shuffleItems(basePool)
    const poolByShape = {
      'is-small': [] as ShowcaseMedia[],
      'is-tall': [] as ShowcaseMedia[],
      'is-wide': [] as ShowcaseMedia[],
    }
    basePool.forEach((item) => {
      poolByShape[item.shape].push(item)
    })
    const used = new Set<string>()
    const pickRandom = (items: ShowcaseMedia[]) => {
      const available = items.filter((item) => !used.has(item.id))
      if (available.length === 0) return null
      const choice = available[Math.floor(Math.random() * available.length)]
      used.add(choice.id)
      return choice
    }
    return slotShapes.map((shape, index) => {
      const preferred = pickRandom(poolByShape[shape])
      if (preferred) return preferred
      const fallback = pickRandom(shuffled)
      return fallback ?? shuffled[index % shuffled.length]
    })
  }, [activeCategoryId, showcasePool])

  const showcaseResolutions = useMemo(() => {
    if (!showcaseTileWidth) return null
    const base = Math.max(1, Math.round(showcaseTileWidth))
    return [base, base * 2, base * 3]
  }, [showcaseTileWidth])

  const showcaseSizes = showcaseTileWidth ? `${showcaseTileWidth}px` : undefined
  const showcaseTileHeight = showcaseTileWidth
    ? Math.round(showcaseTileWidth * 0.75)
    : undefined

  const formatStoryRole = (categories: string[] | undefined) => {
    const primary = categories?.[0]
    if (!primary) return 'Мастер'
    return categoryLabelOverrides[primary] ??
      categoryItems.find((item) => item.id === primary)?.label ??
      'Мастер'
  }

  const handleStorySeen = async (storyId: number, masterId: string) => {
    setStoryGroups((current) =>
      current.map((group) => {
        if (group.masterId !== masterId) return group
        const items = group.items.map((item) =>
          item.id === storyId ? { ...item, isSeen: true } : item
        )
        const unseenCount = items.filter((item) => !item.isSeen).length
        return { ...group, items, unseenCount, hasUnseen: unseenCount > 0 }
      })
    )

    try {
      await fetch(`${apiBase}/api/stories/${storyId}/view`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
    } catch (error) {
      // ignore view sync errors
    }
  }

  const handleStoryAction = (masterId: string) => {
    setActiveStoryGroupIndex(null)
    setActiveStoryIndex(0)
    onViewMasterProfile(masterId)
  }

  const handleCollectionSelect = useCallback(
    (item: CollectionItem) => {
      if (item.categoryId) {
        onCategoryChange(item.categoryId)
      }
      onViewMasters()
    },
    [onCategoryChange, onViewMasters]
  )

  return (
    <div className="screen screen--client">
      <header className="client-topbar client-topbar--floating">
        <div className="client-brand">KIVEN</div>
      </header>
      <div className="client-shell">
        <div className="client-category-row">
          <button
            className={`client-category-pill${
              activeCategoryId && !isCategoryAnimating ? ' is-active' : ''
            }${isCategoryAnimating ? ' is-hidden' : ''}${
              isCategoryPulsed ? ' is-pulsed' : ''
            }`}
            type="button"
            onClick={openCategoryOverlay}
            ref={categoryTargetRef}
            aria-label={
              activeCategoryId
                ? `Категория: ${categoryPillLabel}`
                : 'Выбрать категорию'
            }
          >
            <span className="client-category-pill-icon" aria-hidden="true">
              {activeCategoryItem ? (
                <img src={activeCategoryItem.icon} alt="" />
              ) : (
                <span className="client-category-pill-plus">+</span>
              )}
            </span>
            <span className="client-category-pill-text">{categoryPillLabel}</span>
            <span className="client-category-pill-action">
              {activeCategoryId ? 'Сменить' : 'Выбрать'}
            </span>
          </button>
        </div>

        <section className="client-section">
          <div className="client-showcase-card">
            <div className="client-showcase-content">
              <span className="client-showcase-badge">✨ Вдохновение</span>
              <h2 className="client-showcase-title">Витрина работ</h2>
              <button
                className="client-showcase-cta"
                type="button"
                onClick={onViewShowcase}
              >
                Смотреть &gt;
              </button>
            </div>
            <div
              className="client-showcase-gallery"
              ref={showcaseGalleryRef}
              aria-label="Витрина работ"
            >
              {showcaseItems.length > 0 ? (
                showcaseItems.map((item, index) => (
                  <span
                    className="client-showcase-photo"
                    key={`${item.id}-${index}`}
                    style={{ gridArea: showcaseAreas[index % showcaseAreas.length] }}
                  >
                    <img
                      src={item.url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      srcSet={buildShowcaseSrcSet(item.url, showcaseResolutions)}
                      sizes={showcaseSizes}
                      width={showcaseTileWidth ?? undefined}
                      height={showcaseTileHeight ?? undefined}
                      style={{
                        objectPosition: `${item.focusX * 100}% ${item.focusY * 100}%`,
                      }}
                    />
                  </span>
                ))
              ) : (
                <span className="client-showcase-empty">Пока нет работ</span>
              )}
            </div>
          </div>
        </section>

        <section className="client-section">
          <div className="section-header">
            <h3>Подборки для вас</h3>
            <button
              className="section-action"
              type="button"
              onClick={onViewMasters}
              aria-label="Открыть подборки"
            >
              ›
            </button>
          </div>
          <CollectionCarousel onSelect={handleCollectionSelect} />
        </section>

        <section className="client-section">
          <div className="cta-row">
            <button className="cta cta--secondary" type="button" onClick={onViewMasters}>
              <span className="cta-icon cta-icon--ghost" aria-hidden="true">
                <IconUsers />
              </span>
              Найти мастера
            </button>
            <button
              className="cta cta--primary"
              type="button"
              onClick={() => onCreateRequest(activeCategoryId)}
            >
              <span className="cta-icon" aria-hidden="true">
                +
              </span>
              Создать заявку
            </button>
          </div>
        </section>

        <section className="client-section client-section--stories">
          <div className="section-header">
            <h3>Сторис от мастеров</h3>
          </div>
          {isStoriesLoading ? (
            <div className="client-stories client-stories--skeleton" role="list">
              {Array.from({ length: 5 }).map((_, index) => (
                <div className="client-story-card is-skeleton" key={index} role="listitem">
                  <span className="client-story-avatar" aria-hidden="true" />
                  <span className="client-story-name" />
                  <span className="client-story-role" />
                </div>
              ))}
            </div>
          ) : storyGroups.length > 0 ? (
            <div className="client-stories" role="list">
              {storyGroups.map((group, index) => {
                const roleLabel = formatStoryRole(group.categories)
                const unseenCount = group.unseenCount ?? 0
                const hasUnseen = group.hasUnseen ?? unseenCount > 0
                const firstUnseenIndex = group.items.findIndex((item) => !item.isSeen)
                const startIndex = firstUnseenIndex >= 0 ? firstUnseenIndex : 0
                const masterInitial = group.masterName.trim().slice(0, 1) || 'М'
                return (
                  <button
                    className={`client-story-card${hasUnseen ? '' : ' is-seen'}`}
                    key={group.masterId}
                    role="listitem"
                    type="button"
                    onClick={() => {
                      setActiveStoryIndex(startIndex)
                      setActiveStoryGroupIndex(index)
                    }}
                    aria-label={`Истории мастера ${group.masterName}`}
                  >
                    <span className="client-story-ring" aria-hidden="true">
                      <span className="client-story-avatar">
                        {group.masterAvatarUrl ? (
                          <img src={group.masterAvatarUrl} alt="" loading="lazy" />
                        ) : (
                          <span>{masterInitial}</span>
                        )}
                      </span>
                    </span>
                    <span className="client-story-name">{group.masterName}</span>
                    <span className="client-story-role">{roleLabel}</span>
                    {unseenCount > 1 && (
                      <span className="client-story-badge" aria-hidden="true">
                        +{Math.min(unseenCount - 1, 9)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="client-stories-empty">
              <p>{storiesError || 'Подпишитесь на мастеров, чтобы видеть их истории.'}</p>
              <button className="client-stories-cta" type="button" onClick={onViewMasters}>
                Открыть мастеров
              </button>
            </div>
          )}
        </section>

        <section className="client-section">
          <div className="category-focus">
            <span className="category-focus-icon" aria-hidden="true">
              {activeCategoryItem ? (
                <img src={activeCategoryItem.icon} alt="" />
              ) : (
                <span className="category-focus-placeholder">?</span>
              )}
            </span>
            <div className="category-focus-body">
              <span className="category-focus-kicker">Категория</span>
              <span className="category-focus-title">
                {activeCategoryLabel || 'Выберите категорию'}
              </span>
              <span className="category-focus-subtitle">
                {activeCategoryLabel
                  ? 'Используем для подбора мастеров и фильтрации витрины.'
                  : 'Нужно выбрать, чтобы увидеть мастеров поблизости.'}
              </span>
            </div>
            <button
              className="category-focus-action"
              type="button"
              onClick={activeCategoryId ? onViewMasters : openCategoryOverlay}
            >
              {activeCategoryId ? 'Открыть мастеров' : 'Выбрать категорию'}
            </button>
          </div>
          <p className="category-helper">
            {activeCategoryLabel
              ? `Выбрана категория: ${activeCategoryLabel}`
              : 'Выберите категорию, чтобы открыть мастеров'}
          </p>
        </section>

      </div>

      {isCategoryOverlayOpen && (
        <div
          className={`category-overlay${
            isCategoryOverlayClosing ? ' is-closing' : ''
          }${isCategoryOverlayExiting ? ' is-exiting' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-label="Выбор категории"
          onClick={() => {
            if (isCategoryOverlayExiting) return
            if (activeCategoryId) {
              closeCategoryOverlay()
            }
          }}
        >
          <div
            className="category-overlay-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="category-overlay-head">
              <span className="category-overlay-brand">KIVEN</span>
              <p className="category-overlay-kicker">Категории</p>
              <div className="category-overlay-title-row">
                <h2 className="category-overlay-title">Что нужно сегодня?</h2>
                {activeCategoryId && (
                  <button
                    className="category-overlay-close"
                    type="button"
                    onClick={closeCategoryOverlay}
                  >
                    Готово
                  </button>
                )}
              </div>
              <p className="category-overlay-subtitle">
                Выберите услугу, чтобы сразу увидеть лучших мастеров рядом.
              </p>
              <div className="category-overlay-meta">
                <span
                  className={`category-overlay-chip${
                    activeCategoryId ? ' is-active' : ''
                  }`}
                >
                  {activeCategoryId
                    ? `Выбрано: ${categoryPillLabel}`
                    : 'Выберите категорию'}
                </span>
              </div>
            </div>
            <div className="category-overlay-grid" role="list">
              {categoryItems.map((item, index) => {
                const isSelected = item.id === activeCategoryId
                const label = categoryLabelOverrides[item.id] ?? item.label
                return (
                  <button
                    className={`category-overlay-card${
                      isSelected ? ' is-selected' : ''
                    }`}
                    type="button"
                    key={item.id}
                    role="listitem"
                    onClick={(event) => handleCategorySelect(item, event)}
                    style={{ animationDelay: `${index * 45}ms` }}
                  >
                    <span className="category-overlay-card-icon" aria-hidden="true">
                      <img src={item.icon} alt="" loading="lazy" />
                    </span>
                    <span className="category-overlay-card-title">{label}</span>
                    <span className="category-overlay-card-arrow" aria-hidden="true">
                      &gt;
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <nav className="bottom-nav" aria-label="Навигация">
        <button className="nav-item is-active" type="button">
          <span className="nav-icon" aria-hidden="true">
            <IconHome />
          </span>
          Главная
        </button>
        <button className="nav-item" type="button" onClick={onViewChats}>
          <span className="nav-icon" aria-hidden="true">
            <IconChat />
          </span>
          Чаты
        </button>
        <button className="nav-item" type="button" onClick={() => onViewRequests()}>
          <span className="nav-icon" aria-hidden="true">
            <IconList />
          </span>
          Мои заявки
        </button>
        <button className="nav-item" type="button" onClick={onViewProfile}>
          <span className="nav-icon" aria-hidden="true">
            <IconUser />
          </span>
          Профиль
        </button>
      </nav>
      {activeStoryGroupIndex !== null && storyGroups[activeStoryGroupIndex] && (
        <StoryViewer
          groups={storyGroups}
          initialGroupIndex={activeStoryGroupIndex}
          initialStoryIndex={activeStoryIndex}
          onClose={() => {
            setActiveStoryGroupIndex(null)
            setActiveStoryIndex(0)
          }}
          onSeen={handleStorySeen}
          actionLabel="Профиль мастера"
          onAction={handleStoryAction}
        />
      )}
    </div>
  )
}
