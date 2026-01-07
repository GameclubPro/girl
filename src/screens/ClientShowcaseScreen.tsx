import { useEffect, useMemo, useState } from 'react'
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

type ShowcaseMedia = {
  id: string
  url: string
  focusX: number
  focusY: number
  categories: string[]
}

const SHOWCASE_SLOTS = 6
const showcaseAreas = ['a', 'b', 'c', 'd', 'e', 'f']

const fallbackShowcasePool: ShowcaseMedia[] = popularItems.map((item) => ({
  id: `fallback-${item.id}`,
  url: item.image,
  focusX: 0.5,
  focusY: 0.5,
  categories: item.categoryId ? [item.categoryId] : [],
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
  const activeCategoryLabel =
    categoryChips.find((chip) => chip.id === activeCategoryId)?.label ??
    categoryItems.find((item) => item.id === activeCategoryId)?.label ??
    ''
  const [showcasePool, setShowcasePool] = useState<ShowcaseMedia[]>([])

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

  const showcaseItems = useMemo(() => {
    const pool = activeCategoryId
      ? showcasePool.filter((item) => item.categories.includes(activeCategoryId))
      : showcasePool
    const basePool =
      pool.length > 0
        ? pool
        : showcasePool.length > 0
          ? showcasePool
          : fallbackShowcasePool
    if (basePool.length === 0) return []
    const shuffled = shuffleItems(basePool)
    return Array.from({ length: SHOWCASE_SLOTS }, (_, index) =>
      shuffled[index % shuffled.length]
    )
  }, [activeCategoryId, showcasePool])

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
          <div className="client-work-grid" aria-label="Витрина работ">
            {showcaseItems.map((item, index) => (
              <article
                className="client-work-card"
                key={`${item.id}-${index}`}
                style={{ gridArea: showcaseAreas[index % showcaseAreas.length] }}
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
