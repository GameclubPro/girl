import { useMemo } from 'react'
import { CollectionCarousel } from '../components/CollectionCarousel'
import { IconBell, IconHome, IconList, IconUser, IconUsers } from '../components/icons'
import { categoryItems, collectionItems, popularItems } from '../data/clientData'

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

export const ClientScreen = ({
  clientName,
  activeCategoryId,
  onCategoryChange,
  onCreateRequest,
  onViewRequests,
}: {
  clientName: string
  activeCategoryId: string | null
  onCategoryChange: (categoryId: string | null) => void
  onCreateRequest: (categoryId?: string | null) => void
  onViewRequests: () => void
}) => {
  const activeCategoryLabel =
    categoryChips.find((chip) => chip.id === activeCategoryId)?.label ??
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
  const visibleCollectionItems = useMemo(() => {
    const filtered = activeCategoryId
      ? collectionItems.filter(
          (item) => !item.categoryId || item.categoryId === activeCategoryId
        )
      : collectionItems
    if (!activeCategoryId || !activeCategoryLabel) return filtered
    const focusItem = {
      id: `focus-${activeCategoryId}`,
      badge: '✨',
      label: activeCategoryLabel,
      title: `${activeCategoryLabel} сегодня`,
      meta: 'Подборка мастеров',
      tone: 'rose' as const,
      categoryId: activeCategoryId,
    }
    return [focusItem, ...filtered]
  }, [activeCategoryId, activeCategoryLabel])

  return (
    <div className="screen screen--client">
      <div className="client-shell">
        <header className="client-brand-row">
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

        <div className="client-top">
          <p className="client-greeting">
            Привет{clientName ? `, ${clientName}` : ''}{' '}
            <span aria-hidden="true">👋</span>
          </p>
          <button className="bell-button" type="button" aria-label="Уведомления">
            <IconBell />
          </button>
        </div>

        <section className="client-section">
          <CollectionCarousel items={visibleCollectionItems} />
        </section>

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
        <button className="nav-item" type="button">
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
