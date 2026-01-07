import { useMemo } from 'react'
import {
  IconBell,
  IconHome,
  IconList,
  IconUser,
  IconUsers,
} from '../components/icons'
import { categoryItems, popularItems, storyItems } from '../data/clientData'

const categoryLabelOverrides: Record<string, string> = {
  'beauty-nails': 'Маникюр',
  'makeup-look': 'Макияж',
  'cosmetology-care': 'Косметология',
  'fitness-health': 'Фитнес',
}

export const ClientScreen = ({
  clientName,
  activeCategoryId,
  onCategoryChange,
  onViewShowcase,
  onViewRequests,
}: {
  clientName?: string
  activeCategoryId: string | null
  onCategoryChange: (categoryId: string | null) => void
  onViewShowcase: () => void
  onViewRequests: () => void
}) => {
  const displayName = clientName?.trim() ?? ''
  const activeCategoryLabel =
    (activeCategoryId ? categoryLabelOverrides[activeCategoryId] : '') ??
    categoryItems.find((item) => item.id === activeCategoryId)?.label ??
    ''
  const visiblePopularItems = useMemo(() => {
    if (!activeCategoryId) return popularItems
    return popularItems.filter((item) => item.categoryId === activeCategoryId)
  }, [activeCategoryId])
  const showcaseItems = useMemo(() => {
    const primary = activeCategoryId
      ? popularItems.filter((item) => item.categoryId === activeCategoryId)
      : popularItems
    const fallback = activeCategoryId ? popularItems : []
    return [...primary, ...fallback].slice(0, 4)
  }, [activeCategoryId])
  const handleClose = () => {
    window.Telegram?.WebApp?.close?.()
  }

  return (
    <div className="screen screen--client">
      <div className="client-shell">
        <header className="client-topbar">
          <button className="client-close-button" type="button" onClick={handleClose}>
            <span className="client-close-icon" aria-hidden="true">
              ←
            </span>
            Закрыть
          </button>
          <div className="client-brand">
            KIVEN <span className="client-brand-wave">👋</span>
          </div>
          <button className="bell-button" type="button" aria-label="Уведомления">
            <IconBell />
          </button>
        </header>
        <p className="client-greeting">
          Привет, {displayName || 'друг'} <span aria-hidden="true">👋</span>
        </p>
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
              <p className="client-showcase-copy">
                Лучшие работы рядом. Выбирай стиль глазами.
              </p>
              <button
                className="client-showcase-cta"
                type="button"
                onClick={onViewShowcase}
              >
                Смотреть &gt;
              </button>
            </div>
            <div className="client-showcase-gallery" aria-label="Витрина работ">
              {showcaseItems.map((item, index) => (
                <span className="client-showcase-photo" key={`${item.id}-${index}`}>
                  <img src={item.image} alt={item.label} loading="lazy" />
                </span>
              ))}
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
        <button className="nav-item" type="button" onClick={onViewShowcase}>
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
