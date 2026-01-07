import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconHome, IconList, IconUser, IconUsers } from '../components/icons'
import { categoryItems, popularItems } from '../data/clientData'
import type { MasterProfile } from '../types/app'
import { isImageUrl, parsePortfolioItems } from '../utils/profileContent'

type ClientShowcaseScreenProps = {
  apiBase: string
  activeCategoryId: string | null
  onCategoryChange: (categoryId: string | null) => void
  onBack: () => void
  onViewRequests: () => void
}

const categoryLabelOverrides: Record<string, string> = {
  'beauty-nails': 'Маникюр',
  'makeup-look': 'Макияж',
  'cosmetology-care': 'Косметология',
  'fitness-health': 'Фитнес',
}

const categoryChips = [
  { id: null, label: 'Все' },
  ...categoryItems.map((item) => ({
    id: item.id,
    label: categoryLabelOverrides[item.id] ?? item.label,
  })),
]

const collageShapes = [
  'is-large',
  'is-wide',
  'is-wide',
  'is-small',
  'is-small',
  'is-wide',
] as const

type ShowcaseShape = (typeof collageShapes)[number]

type ShowcaseMedia = {
  id: string
  url: string
  focusX: number
  focusY: number
  categories: string[]
  shape: ShowcaseShape
}

const SHOWCASE_SLOTS = 6
const INITIAL_BLOCKS = 3
const showcaseAreas = ['a', 'b', 'c', 'd', 'e', 'f']
const slotShapes: ShowcaseShape[] = [...collageShapes]

const fallbackShowcasePool: ShowcaseMedia[] = popularItems.map((item, index) => ({
  id: `fallback-${item.id}`,
  url: item.image,
  focusX: 0.5,
  focusY: 0.5,
  categories: item.categoryId ? [item.categoryId] : [],
  shape: collageShapes[index % collageShapes.length],
}))

const shuffleItems = <T,>(items: T[]) => {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[randomIndex]] = [result[randomIndex], result[index]]
  }
  return result
}

export const ClientShowcaseScreen = ({
  apiBase,
  activeCategoryId,
  onCategoryChange,
  onBack,
  onViewRequests,
}: ClientShowcaseScreenProps) => {
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const isAppendingRef = useRef(false)
  const activeCategoryLabel =
    categoryChips.find((chip) => chip.id === activeCategoryId)?.label ??
    categoryItems.find((item) => item.id === activeCategoryId)?.label ??
    ''
  const [showcasePool, setShowcasePool] = useState<ShowcaseMedia[]>([])
  const [showcaseBlocks, setShowcaseBlocks] = useState<ShowcaseMedia[][]>([])

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

  const basePool = useMemo(() => {
    const pool = activeCategoryId
      ? showcasePool.filter((item) => item.categories.includes(activeCategoryId))
      : showcasePool
    return pool.length > 0
      ? pool
      : showcasePool.length > 0
        ? showcasePool
        : fallbackShowcasePool
  }, [activeCategoryId, showcasePool])

  const poolByShape = useMemo(() => {
    const map = {
      'is-large': [] as ShowcaseMedia[],
      'is-small': [] as ShowcaseMedia[],
      'is-tall': [] as ShowcaseMedia[],
      'is-wide': [] as ShowcaseMedia[],
    }
    basePool.forEach((item) => {
      map[item.shape].push(item)
    })
    return map
  }, [basePool])

  const buildShowcaseBlock = useMemo(() => {
    return () => {
      if (basePool.length === 0) return []
      const used = new Set<string>()
      const pickRandom = (items: ShowcaseMedia[]) => {
        const available = items.filter((item) => !used.has(item.id))
        if (available.length === 0) return null
        const choice = available[Math.floor(Math.random() * available.length)]
        used.add(choice.id)
        return choice
      }
      const shuffledPool = shuffleItems(basePool)
      return slotShapes.map((shape, index) => {
        const preferred = pickRandom(poolByShape[shape])
        if (preferred) return preferred
        const fallback = pickRandom(shuffledPool)
        return fallback ?? shuffledPool[index % shuffledPool.length]
      })
    }
  }, [basePool, poolByShape])

  const appendBlock = useCallback(() => {
    if (basePool.length === 0) return
    if (isAppendingRef.current) return
    isAppendingRef.current = true
    setShowcaseBlocks((current) => [...current, buildShowcaseBlock()])
    window.setTimeout(() => {
      isAppendingRef.current = false
    }, 250)
  }, [basePool.length, buildShowcaseBlock])

  const checkNearBottom = useCallback(() => {
    if (basePool.length === 0) return
    const scrollElement = document.scrollingElement ?? document.documentElement
    const scrollTop = scrollElement.scrollTop || document.body.scrollTop
    const scrollHeight = scrollElement.scrollHeight || document.body.scrollHeight
    const clientHeight = scrollElement.clientHeight || window.innerHeight
    const distance = scrollHeight - (scrollTop + clientHeight)
    if (distance < 260) {
      appendBlock()
    }
  }, [appendBlock, basePool.length])

  useEffect(() => {
    if (basePool.length === 0) {
      setShowcaseBlocks([])
      return
    }
    setShowcaseBlocks(
      Array.from({ length: INITIAL_BLOCKS }, () => buildShowcaseBlock())
    )
  }, [basePool, buildShowcaseBlock])

  useEffect(() => {
    const node = loadMoreRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry?.isIntersecting) return
        if (basePool.length === 0) return
        appendBlock()
      },
      { rootMargin: '220px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [appendBlock, basePool.length])

  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = window.requestAnimationFrame(() => {
        raf = 0
        checkNearBottom()
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    checkNearBottom()
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [checkNearBottom])

  useEffect(() => {
    checkNearBottom()
  }, [checkNearBottom, showcaseBlocks.length])

  return (
    <div className="screen screen--client screen--client-showcase">
      <div className="client-shell">
        <header className="client-showcase-header">
          <button
            className="client-showcase-back"
            type="button"
            onClick={onBack}
            aria-label="Назад"
          >
            ←
          </button>
          <div className="client-showcase-headings">
            <p className="client-showcase-page-kicker">Витрина работ</p>
            <h1 className="client-showcase-page-title">
              {activeCategoryLabel || 'Все категории'}
            </h1>
            <p className="client-showcase-page-subtitle">
              Листай работы и выбирай стиль
            </p>
          </div>
        </header>

        <section className="client-section">
          <div className="client-category-bar" role="tablist" aria-label="Категории">
            {categoryChips.map((chip) => {
              const isActive =
                chip.id === activeCategoryId || (!activeCategoryId && chip.id === null)
              return (
                <button
                  className={`client-category-chip${isActive ? ' is-active' : ''}`}
                  key={chip.id ?? 'all'}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => onCategoryChange(chip.id)}
                >
                  {chip.label}
                </button>
              )
            })}
          </div>
        </section>

        <section className="client-section">
          <div className="client-work-feed" aria-label="Витрина работ">
            {showcaseBlocks.map((block, blockIndex) => (
              <div className="client-work-grid" key={`block-${blockIndex}`}>
                {block.map((item, index) => (
                  <article
                    className="client-work-card"
                    key={`${item.id}-${blockIndex}-${index}`}
                    style={{ gridArea: showcaseAreas[index % SHOWCASE_SLOTS] }}
                  >
                    <img
                      src={item.url}
                      alt=""
                      loading="lazy"
                      style={{
                        objectPosition: `${item.focusX * 100}% ${item.focusY * 100}%`,
                      }}
                    />
                  </article>
                ))}
              </div>
            ))}
            <div className="client-work-sentinel" ref={loadMoreRef} aria-hidden="true" />
          </div>
        </section>
      </div>

      <nav className="bottom-nav" aria-label="Навигация">
        <button className="nav-item" type="button" onClick={onBack}>
          <span className="nav-icon" aria-hidden="true">
            <IconHome />
          </span>
          Главная
        </button>
        <button className="nav-item is-active" type="button">
          <span className="nav-icon" aria-hidden="true">
            <IconUsers />
          </span>
          Мастера
        </button>
        <button className="nav-item" type="button" onClick={onViewRequests}>
          <span className="nav-icon" aria-hidden="true">
            <IconList />
          </span>
          Мои заявки
        </button>
        <button className="nav-item" type="button">
          <span className="nav-icon" aria-hidden="true">
            <IconUser />
          </span>
          Профиль
        </button>
      </nav>
    </div>
  )
}
