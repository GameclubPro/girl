import { useEffect, useMemo, useState } from 'react'
import {
  IconHome,
  IconList,
  IconUser,
  IconUsers,
} from '../components/icons'
import { categoryItems, popularItems, storyItems } from '../data/clientData'
import type { MasterProfile } from '../types/app'
import { isImageUrl, parsePortfolioItems } from '../utils/profileContent'

const categoryLabelOverrides: Record<string, string> = {
  'beauty-nails': 'Маникюр',
  'makeup-look': 'Макияж',
  'cosmetology-care': 'Косметология',
  'fitness-health': 'Фитнес',
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

export const ClientScreen = ({
  apiBase,
  activeCategoryId,
  onCategoryChange,
  onViewShowcase,
  onViewMasters,
  onCreateRequest,
  onViewRequests,
  onViewProfile,
}: {
  apiBase: string
  activeCategoryId: string | null
  onCategoryChange: (categoryId: string | null) => void
  onViewShowcase: () => void
  onViewMasters: () => void
  onCreateRequest: (categoryId?: string | null) => void
  onViewRequests: (tab?: 'requests' | 'bookings') => void
  onViewProfile: () => void
}) => {
  const activeCategoryLabel =
    (activeCategoryId ? categoryLabelOverrides[activeCategoryId] : '') ??
    categoryItems.find((item) => item.id === activeCategoryId)?.label ??
    ''
  const [requestCategoryId, setRequestCategoryId] = useState<string | null>(null)
  const [showcasePool, setShowcasePool] = useState<ShowcaseMedia[]>([])
  const requestCategoryLabel =
    (requestCategoryId ? categoryLabelOverrides[requestCategoryId] : '') ??
    categoryItems.find((item) => item.id === requestCategoryId)?.label ??
    ''
  const visiblePopularItems = useMemo(() => {
    if (!activeCategoryId) return popularItems
    return popularItems.filter((item) => item.categoryId === activeCategoryId)
  }, [activeCategoryId])

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

  const showcaseItems = useMemo(() => {
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

  return (
    <div className="screen screen--client">
      <div className="client-shell">
        <header className="client-topbar">
          <div className="client-brand">KIVEN</div>
        </header>
        {activeCategoryId && activeCategoryLabel && (
          <button
            className="client-category-indicator"
            type="button"
            onClick={() => onCategoryChange(null)}
            aria-label="Сбросить категорию"
          >
            Категория: <strong>{activeCategoryLabel}</strong>
            <span className="client-category-indicator-close" aria-hidden="true">
              ×
            </span>
          </button>
        )}

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
            <div className="client-showcase-gallery" aria-label="Витрина работ">
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

        <section className="client-section client-section--stories">
          <div className="section-header">
            <h3>Сторис от мастеров</h3>
          </div>
          <div className="client-stories" role="list">
            {storyItems.map((story) => (
              <article className="client-story-card" key={story.id} role="listitem">
                <span className="client-story-avatar" aria-hidden="true">
                  <img src={story.avatar} alt="" loading="lazy" />
                </span>
                <span className="client-story-name">{story.name}</span>
                <span className="client-story-role">{story.specialty}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="client-section">
          <div className="category-grid">
            {categoryItems.map((item) => {
              const isSelected = item.id === requestCategoryId

              return (
                <button
                  className={`category-card${isSelected ? ' is-selected' : ''}`}
                  type="button"
                  key={item.id}
                  aria-pressed={isSelected}
                  onClick={() =>
                    setRequestCategoryId((prev) =>
                      prev === item.id ? null : item.id
                    )
                  }
                >
                  <span className="category-left">
                    <span className="category-icon" aria-hidden="true">
                      <img
                        className="category-icon-image"
                        src={item.icon}
                        alt=""
                        aria-hidden="true"
                      />
                    </span>
                    {categoryLabelOverrides[item.id] ?? item.label}
                  </span>
                  <span className="category-arrow">›</span>
                </button>
              )
            })}
          </div>
          <p className="category-helper">
            {requestCategoryLabel
              ? `Выбрана категория: ${requestCategoryLabel}`
              : 'Выберите категорию, чтобы создать заявку'}
          </p>
          <button
            className="cta cta--primary cta--wide"
            type="button"
            onClick={() => onCreateRequest(requestCategoryId)}
            disabled={!requestCategoryId}
          >
            <span className="cta-icon" aria-hidden="true">
              +
            </span>
            Создать заявку
          </button>
        </section>

        <section className="client-section" id="client-popular">
          <div className="section-header">
            <h3>Популярное сегодня</h3>
          </div>
          <div
            className="popular-carousel"
            role="region"
            aria-label="Популярное сегодня"
          >
            {visiblePopularItems.length > 0 ? (
              <div className="popular-track" role="list">
                {visiblePopularItems.map((item) => {
                  const labelClassName =
                    item.label.length <= 8
                      ? 'popular-label popular-label--short'
                      : 'popular-label'

                  return (
                    <button
                      className="popular-card"
                      type="button"
                      key={item.id}
                      role="listitem"
                      onClick={() => onCategoryChange(item.categoryId)}
                    >
                      <span className="popular-media" aria-hidden="true">
                        <img className="popular-image" src={item.image} alt="" />
                      </span>
                      <span className={labelClassName}>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="popular-empty">
                В этой категории пока нет популярных работ.
              </p>
            )}
          </div>
        </section>
      </div>

      <nav className="bottom-nav" aria-label="Навигация">
        <button className="nav-item is-active" type="button">
          <span className="nav-icon" aria-hidden="true">
            <IconHome />
          </span>
          Главная
        </button>
        <button className="nav-item" type="button" onClick={onViewMasters}>
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
        <button className="nav-item" type="button" onClick={onViewProfile}>
          <span className="nav-icon" aria-hidden="true">
            <IconUser />
          </span>
          Профиль
        </button>
      </nav>
    </div>
  )
}
