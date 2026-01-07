import { useEffect, useMemo, useState } from 'react'
import { ProBottomNav } from '../components/ProBottomNav'
import type { MasterProfile, ProProfileSection } from '../types/app'
import {
  isImageUrl,
  parsePortfolioItems,
  type PortfolioItem,
} from '../utils/profileContent'

type ProCabinetScreenProps = {
  apiBase: string
  userId: string
  displayNameFallback: string
  onEditProfile: (section?: ProProfileSection) => void
  onViewRequests: () => void
}

const sizeClasses = [
  'is-tall',
  'is-square',
  'is-wide',
  'is-tall',
  'is-square',
  'is-wide',
]
const variantClasses = ['is-sand', 'is-blush', 'is-mint']

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
  const showcaseItems = useMemo(() => {
    const slots: Array<PortfolioItem | null> = [
      ...portfolioItems.slice(0, 6),
    ]
    while (slots.length < 6) {
      slots.push(null)
    }
    return slots
  }, [portfolioItems])
  const showcaseSubtitle =
    portfolioItems.length > 0
      ? `Показаны ${Math.min(portfolioItems.length, 6)} из ${portfolioItems.length}`
      : 'Добавьте до 6 работ в витрину'

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
            <button
              className="pro-cabinet-showcase-edit"
              type="button"
              onClick={() => onEditProfile('portfolio')}
            >
              Редактировать
            </button>
          </div>
          {isLoading && <p className="pro-status">Загружаем витрину...</p>}
          {loadError && <p className="pro-error">{loadError}</p>}
          <div className="pro-cabinet-showcase-grid animate delay-2">
            {showcaseItems.map((item, index) => {
              const sizeClass = sizeClasses[index] ?? 'is-square'
              const variantClass = variantClasses[index % variantClasses.length]
              const hasItem = Boolean(item?.url)
              const isImage = item?.url ? isImageUrl(item.url) : false
              const caption =
                item?.title?.trim() || (item?.url ? 'Работа' : 'Добавьте работу')
              const mediaClassName = [
                'pro-cabinet-showcase-media',
                sizeClass,
                !hasItem ? `pro-cabinet-showcase-empty ${variantClass}` : '',
                !isImage && hasItem ? 'is-link' : '',
              ]
                .filter(Boolean)
                .join(' ')

              return (
                <article
                  className="pro-cabinet-showcase-card"
                  key={`${item?.url ?? 'empty'}-${index}`}
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
                      <span className="pro-cabinet-showcase-empty-label">
                        Добавить работу
                      </span>
                    </button>
                  )}
                </article>
              )
            })}
          </div>
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
