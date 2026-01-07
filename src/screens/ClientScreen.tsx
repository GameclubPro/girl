import { useMemo } from 'react'
import {
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
  activeCategoryId,
  onCategoryChange,
  onViewShowcase,
  onCreateRequest,
  onViewRequests,
}: {
  activeCategoryId: string | null
  onCategoryChange: (categoryId: string | null) => void
  onViewShowcase: () => void
  onCreateRequest: (categoryId?: string | null) => void
  onViewRequests: () => void
}) => {
  const activeCategoryLabel =
    (activeCategoryId ? categoryLabelOverrides[activeCategoryId] : '') ??
    categoryItems.find((item) => item.id === activeCategoryId)?.label ??
    ''
  const visiblePopularItems = useMemo(() => {
    if (!activeCategoryId) return popularItems
    return popularItems.filter((item) => item.categoryId === activeCategoryId)
  }, [activeCategoryId])
  const visibleCategoryItems = useMemo(() => {
    if (!activeCategoryId) return categoryItems
    return categoryItems.filter((item) => item.id === activeCategoryId)
  }, [activeCategoryId])
  const showcaseItems = useMemo(() => {
    const primary = activeCategoryId
      ? popularItems.filter((item) => item.categoryId === activeCategoryId)
      : popularItems
    const fallback = activeCategoryId ? popularItems : []
    return [...primary, ...fallback].slice(0, 4)
  }, [activeCategoryId])

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

        <section className="client-section">
          <div className="category-grid">
            {visibleCategoryItems.map((item) => {
              const isSelected = item.id === activeCategoryId

              return (
                <button
                  className={`category-card${isSelected ? ' is-selected' : ''}`}
                  type="button"
                  key={item.id}
                  aria-pressed={isSelected}
                  onClick={() => onCategoryChange(item.id)}
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
            {activeCategoryLabel
              ? `Выбрана категория: ${activeCategoryLabel}`
              : 'Выберите категорию, чтобы создать заявку'}
          </p>
          <button
            className="cta cta--primary cta--wide"
            type="button"
            onClick={() => onCreateRequest(activeCategoryId)}
            disabled={!activeCategoryId}
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
