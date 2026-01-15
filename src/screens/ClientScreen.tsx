import { useEffect, useMemo, useState } from 'react'
import {
  IconChat,
  IconHome,
  IconList,
  IconUser,
  IconUsers,
} from '../components/icons'
import { StoryViewer } from '../components/StoryViewer'
import { categoryItems } from '../data/clientData'
import type { MasterProfile, StoryGroup } from '../types/app'
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
  userId,
  activeCategoryId,
  onCategoryChange,
  onViewShowcase,
  onViewMasters,
  onViewChats,
  onCreateRequest,
  onViewRequests,
  onViewProfile,
  onViewMasterProfile,
}: {
  apiBase: string
  userId: string
  activeCategoryId: string | null
  onCategoryChange: (categoryId: string | null) => void
  onViewShowcase: () => void
  onViewMasters: () => void
  onViewChats: () => void
  onCreateRequest: (categoryId?: string | null) => void
  onViewRequests: (tab?: 'requests' | 'bookings') => void
  onViewProfile: () => void
  onViewMasterProfile: (masterId: string) => void
}) => {
  const activeCategoryLabel =
    (activeCategoryId ? categoryLabelOverrides[activeCategoryId] : '') ??
    categoryItems.find((item) => item.id === activeCategoryId)?.label ??
    ''
  const [requestCategoryId, setRequestCategoryId] = useState<string | null>(null)
  const [showcasePool, setShowcasePool] = useState<ShowcaseMedia[]>([])
  const [storyGroups, setStoryGroups] = useState<StoryGroup[]>([])
  const [isStoriesLoading, setIsStoriesLoading] = useState(false)
  const [storiesError, setStoriesError] = useState('')
  const [activeStoryGroupIndex, setActiveStoryGroupIndex] = useState<number | null>(
    null
  )
  const [activeStoryIndex, setActiveStoryIndex] = useState(0)
  const requestCategoryLabel =
    (requestCategoryId ? categoryLabelOverrides[requestCategoryId] : '') ??
    categoryItems.find((item) => item.id === requestCategoryId)?.label ??
    ''
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

  return (
    <div className="screen screen--client">
      <header className="client-topbar client-topbar--floating">
        <div className="client-brand">KIVEN</div>
      </header>
      <div className="client-shell client-shell--home">
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
