import { useEffect, useMemo, useState } from 'react'
import { ProBottomNav } from '../components/ProBottomNav'
import type { MasterProfile, ProProfileSection } from '../types/app'
import { isImageUrl, parsePortfolioItems } from '../utils/profileContent'

type ProCabinetScreenProps = {
  apiBase: string
  userId: string
  displayNameFallback: string
  onEditProfile: (section?: ProProfileSection) => void
  onViewRequests: () => void
}

const MAX_SHOWCASE_ITEMS = 7
const mosaicClasses = [
  'is-hero',
  'is-tall',
  'is-medium',
  'is-wide',
  'is-tall',
  'is-medium',
  'is-wide',
  'is-medium',
]

const resolveFocusPosition = (
  item?: { focusX?: number | null; focusY?: number | null } | null
) => {
  const rawX = typeof item?.focusX === 'number' ? item.focusX : 0.5
  const rawY = typeof item?.focusY === 'number' ? item.focusY : 0.5
  const clamp = (value: number) => Math.min(1, Math.max(0, value))
  return `${clamp(rawX) * 100}% ${clamp(rawY) * 100}%`
}

export const ProCabinetScreen = ({
  apiBase,
  userId,
  displayNameFallback,
  onEditProfile,
  onViewRequests,
}: ProCabinetScreenProps) => {
  const [profile, setProfile] = useState<MasterProfile | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    const loadProfile = async () => {
      setIsLoading(true)
      setLoadError('')

      try {
        const response = await fetch(`${apiBase}/api/masters/${userId}`)
        if (response.status === 404) {
          if (!cancelled) {
            setProfile(null)
          }
          return
        }
        if (!response.ok) {
          throw new Error('Load profile failed')
        }
        const data = (await response.json()) as MasterProfile
        if (!cancelled) {
          setProfile(data)
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError('Не удалось загрузить витрину работ.')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    loadProfile()

    return () => {
      cancelled = true
    }
  }, [apiBase, userId])

  const displayNameValue =
    profile?.displayName?.trim() || displayNameFallback.trim() || 'Мастер'
  const portfolioUrls = Array.isArray(profile?.portfolioUrls)
    ? profile?.portfolioUrls
    : []
  const portfolioItems = useMemo(
    () => parsePortfolioItems(portfolioUrls),
    [portfolioUrls]
  )
  const showcaseItems = useMemo(
    () => portfolioItems.slice(0, MAX_SHOWCASE_ITEMS),
    [portfolioItems]
  )
  const hasShowcase = showcaseItems.length > 0
  const showAddTile = hasShowcase && showcaseItems.length < MAX_SHOWCASE_ITEMS
  const mosaicItems = showAddTile ? [...showcaseItems, null] : showcaseItems
  const showcaseSubtitle = hasShowcase
    ? `Работ в витрине: ${showcaseItems.length} из ${MAX_SHOWCASE_ITEMS}`
    : 'Добавьте до 7 лучших работ'

  return (
    <div className="screen screen--pro screen--pro-cabinet">
      <div className="pro-cabinet-shell">
        <section className="pro-cabinet-showcase animate delay-1">
          <div className="pro-cabinet-showcase-head">
            <div>
              <p className="pro-cabinet-showcase-eyebrow">{displayNameValue}</p>
              <h1 className="pro-cabinet-showcase-title">Витрина работ</h1>
              <p className="pro-cabinet-showcase-subtitle">{showcaseSubtitle}</p>
            </div>
            {hasShowcase && (
              <button
                className="pro-cabinet-showcase-edit"
                type="button"
                onClick={() => onEditProfile('portfolio')}
              >
                Редактировать витрину
              </button>
            )}
          </div>
          {isLoading && <p className="pro-status">Загружаем витрину...</p>}
          {loadError && <p className="pro-error">{loadError}</p>}
          {!hasShowcase ? (
            <div className="pro-cabinet-showcase-empty">
              <button
                className="pro-cabinet-showcase-add"
                type="button"
                onClick={() => onEditProfile('portfolio')}
              >
                + Добавить работу
              </button>
              <div className="pro-cabinet-showcase-preview">
                <div className="pro-cabinet-showcase-sample">
                  <span className="pro-cabinet-showcase-sample-icon">✦</span>
                  <span className="pro-cabinet-showcase-sample-label">
                    Пример витрины
                  </span>
                </div>
                <p className="pro-cabinet-showcase-hint">
                  Одна сильная работа продает лучше, чем десять слабых. Начните с
                  любимого кейса.
                </p>
              </div>
            </div>
          ) : (
            <div className="pro-cabinet-showcase-grid animate delay-2">
              {mosaicItems.map((item, index) => {
                const sizeClass = mosaicClasses[index] ?? 'is-medium'
                const hasItem = Boolean(item?.url)
                const isImage = item?.url ? isImageUrl(item.url) : false
                const caption = item?.title?.trim() || 'Работа'
                const cardClassName = ['pro-cabinet-showcase-card', sizeClass]
                  .filter(Boolean)
                  .join(' ')
                const mediaClassName = [
                  'pro-cabinet-showcase-media',
                  !isImage && hasItem ? 'is-link' : '',
                  !hasItem ? 'is-add' : '',
                ]
                  .filter(Boolean)
                  .join(' ')

                return (
                  <article
                    className={cardClassName}
                    key={`${item?.url ?? 'add'}-${index}`}
                  >
                    {hasItem ? (
                      <a
                        className={mediaClassName}
                        href={item?.url ?? '#'}
                        target="_blank"
                        rel="noreferrer"
                      >
                      {isImage ? (
                        <img
                          src={item?.url ?? ''}
                          alt={caption}
                          loading="lazy"
                          style={{ objectPosition: resolveFocusPosition(item) }}
                        />
                      ) : (
                          <span className="pro-cabinet-showcase-link">LINK</span>
                        )}
                        {item?.title?.trim() && (
                          <span className="pro-cabinet-showcase-caption">
                            {item.title}
                          </span>
                        )}
                      </a>
                    ) : (
                      <button
                        className={mediaClassName}
                        type="button"
                        onClick={() => onEditProfile('portfolio')}
                      >
                        <span className="pro-cabinet-showcase-add-icon">+</span>
                      </button>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>

      <ProBottomNav
        active="cabinet"
        onCabinet={() => {}}
        onRequests={onViewRequests}
        onProfile={() => onEditProfile()}
      />
    </div>
  )
}
