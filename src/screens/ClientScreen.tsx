import { useEffect, useMemo, useState } from 'react'
import {
  IconChat,
  IconHome,
  IconList,
  IconUser,
  IconUsers,
} from '../components/icons'
import { CollectionCarousel } from '../components/CollectionCarousel'
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
  const resolveCategoryLabel = (categoryId: string | null) =>
    (categoryId ? categoryLabelOverrides[categoryId] : '') ??
    categoryItems.find((item) => item.id === categoryId)?.label ??
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
  const selectedCategoryId = requestCategoryId ?? activeCategoryId
  const selectedCategoryLabel = resolveCategoryLabel(selectedCategoryId)
  const triggerHaptic = (type: 'selection' | 'light' | 'medium') => {
    const haptic = window.Telegram?.WebApp?.HapticFeedback
    if (!haptic) return
    if (type === 'selection') {
      haptic.selectionChanged?.()
      return
    }
    haptic.impactOccurred?.(type)
  }
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

  const handleIntentSelect = (categoryId: string) => {
    triggerHaptic('selection')
    const nextCategory = selectedCategoryId === categoryId ? null : categoryId
    setRequestCategoryId(nextCategory)
    onCategoryChange(nextCategory)
  }

  const handleCategoryClear = () => {
    triggerHaptic('light')
    setRequestCategoryId(null)
    onCategoryChange(null)
  }

  const handleCreateRequest = () => {
    triggerHaptic('medium')
    onCreateRequest(selectedCategoryId ?? null)
  }

  const handleViewShowcase = () => {
    triggerHaptic('light')
    onViewShowcase()
  }

  const handleViewMasters = () => {
    triggerHaptic('light')
    onViewMasters()
  }

  const handleViewChats = () => {
    triggerHaptic('light')
    onViewChats()
  }

  const handleViewRequests = () => {
    triggerHaptic('light')
    onViewRequests()
  }

  const handleViewProfile = () => {
    triggerHaptic('light')
    onViewProfile()
  }

  return (
    <div className="screen screen--client screen--client-home">
      <header className="client-topbar client-topbar--floating">
        <div className="client-brand">KIVEN</div>
      </header>
      <div className="client-shell client-home-shell">
        <section className="client-home-hero animate delay-1">
          <div className="client-home-hero-card">
            <div className="client-home-hero-text">
              <span className="client-home-hero-kicker">KIVEN / 2026</span>
              <h1 className="client-home-hero-title">Идеальный образ — сегодня.</h1>
              <p className="client-home-hero-subtitle">
                Подберём мастера рядом, покажем портфолио и свободное время за
                пару касаний.
              </p>
              <div className="client-home-hero-actions">
                <button
                  className="client-home-hero-action is-primary"
                  type="button"
                  onClick={handleCreateRequest}
                  disabled={!selectedCategoryId}
                >
                  Создать заявку
                </button>
                <button
                  className="client-home-hero-action is-ghost"
                  type="button"
                  onClick={handleViewShowcase}
                >
                  Витрина работ
                </button>
              </div>
              <span
                className={`client-home-hero-tag${
                  selectedCategoryLabel ? '' : ' is-muted'
                }`}
              >
                {selectedCategoryLabel
                  ? `Сейчас: ${selectedCategoryLabel}`
                  : 'Выберите направление ниже'}
              </span>
            </div>
            <div className="client-home-hero-media" aria-hidden="true">
              {showcaseItems.length > 0 ? (
                <div className="client-home-hero-gallery">
                  {showcaseItems.slice(0, showcaseAreas.length).map((item, index) => (
                    <span
                      className="client-home-hero-tile"
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
                  ))}
                </div>
              ) : (
                <div className="client-home-hero-fallback">Пока нет работ</div>
              )}
            </div>
          </div>
        </section>

        <section className="client-home-panel client-home-intents animate delay-2">
          <div className="client-home-section-head">
            <div>
              <p className="client-home-section-kicker">Направления</p>
              <h3 className="client-home-section-title">Что нужно сегодня?</h3>
            </div>
            {selectedCategoryId && (
              <button
                className="client-home-section-action"
                type="button"
                onClick={handleCategoryClear}
              >
                Сбросить
              </button>
            )}
          </div>
          <div className="client-home-intent-track" role="list">
            {categoryItems.map((item) => {
              const isSelected = item.id === selectedCategoryId
              return (
                <button
                  className={`client-home-intent${isSelected ? ' is-active' : ''}`}
                  type="button"
                  key={item.id}
                  role="listitem"
                  aria-pressed={isSelected}
                  onClick={() => handleIntentSelect(item.id)}
                >
                  <span className="client-home-intent-icon" aria-hidden="true">
                    <img src={item.icon} alt="" aria-hidden="true" />
                  </span>
                  <span className="client-home-intent-label">
                    {categoryLabelOverrides[item.id] ?? item.label}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="client-home-intent-footer">
            <p
              className={`client-home-intent-summary${
                selectedCategoryLabel ? '' : ' is-muted'
              }`}
            >
              {selectedCategoryLabel
                ? `Выбрано: ${selectedCategoryLabel}`
                : 'Выберите направление, чтобы создать заявку.'}
            </p>
            <button
              className="client-home-intent-cta"
              type="button"
              onClick={handleCreateRequest}
              disabled={!selectedCategoryId}
            >
              Создать заявку
            </button>
          </div>
          <button
            className="client-home-intent-link"
            type="button"
            onClick={handleViewMasters}
          >
            Смотреть всех мастеров
          </button>
        </section>

        <section className="client-section client-home-panel client-home-collections animate delay-3">
          <div className="client-home-section-head">
            <div>
              <p className="client-home-section-kicker">Коллекции</p>
              <h3 className="client-home-section-title">Подборки дня</h3>
            </div>
            <button
              className="client-home-section-action"
              type="button"
              onClick={handleViewMasters}
            >
              Все
            </button>
          </div>
          <CollectionCarousel />
        </section>

        <section className="client-section client-section--stories client-home-panel animate delay-4">
          <div className="client-home-section-head">
            <div>
              <p className="client-home-section-kicker">Сторис</p>
              <h3 className="client-home-section-title">Мастера рядом</h3>
            </div>
            <button
              className="client-home-section-action"
              type="button"
              onClick={handleViewMasters}
            >
              Все
            </button>
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
                      triggerHaptic('light')
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
              <button
                className="client-stories-cta"
                type="button"
                onClick={handleViewMasters}
              >
                Открыть мастеров
              </button>
            </div>
          )}
        </section>
      </div>

      <nav className="bottom-nav" aria-label="Навигация">
        <button className="nav-item is-active" type="button">
          <span className="nav-icon" aria-hidden="true">
            <IconHome />
          </span>
          Главная
        </button>
        <button className="nav-item" type="button" onClick={handleViewMasters}>
          <span className="nav-icon" aria-hidden="true">
            <IconUsers />
          </span>
          Мастера
        </button>
        <button className="nav-item" type="button" onClick={handleViewChats}>
          <span className="nav-icon" aria-hidden="true">
            <IconChat />
          </span>
          Чаты
        </button>
        <button className="nav-item" type="button" onClick={handleViewRequests}>
          <span className="nav-icon" aria-hidden="true">
            <IconList />
          </span>
          Мои заявки
        </button>
        <button className="nav-item" type="button" onClick={handleViewProfile}>
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
