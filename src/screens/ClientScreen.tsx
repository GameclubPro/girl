import { useState } from 'react'
import { CollectionCarousel } from '../components/CollectionCarousel'
import { IconBell, IconHome, IconList, IconUser, IconUsers } from '../components/icons'
import { categoryItems, popularItems } from '../data/clientData'

export const ClientScreen = ({
  clientName,
  onCreateRequest,
  onViewRequests,
}: {
  clientName: string
  onCreateRequest: (categoryId?: string | null) => void
  onViewRequests: () => void
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const selectedCategoryLabel =
    categoryItems.find((item) => item.id === selectedCategory)?.label ?? ''

  return (
    <div className="screen screen--client">
      <div className="client-shell">
        <header className="client-brand-row">
          <div className="client-brand">KIVEN</div>
        </header>

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
          <CollectionCarousel />
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
            <div className="popular-track" role="list">
              {popularItems.map((item) => {
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
                  >
                    <span className="popular-media" aria-hidden="true">
                      <img className="popular-image" src={item.image} alt="" />
                    </span>
                    <span className={labelClassName}>{item.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        <section className="client-section">
          <div className="category-grid">
            {categoryItems.map((item) => {
              const isSelected = item.id === selectedCategory

              return (
                <button
                  className={`category-card${isSelected ? ' is-selected' : ''}`}
                  type="button"
                  key={item.id}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedCategory(item.id)}
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
                    {item.label}
                  </span>
                  <span className="category-arrow">›</span>
                </button>
              )
            })}
          </div>
          <p className="category-helper">
            {selectedCategoryLabel
              ? `Выбрана категория: ${selectedCategoryLabel}`
              : 'Выберите категорию, чтобы создать заявку'}
          </p>
          <button
            className="cta cta--primary cta--wide"
            type="button"
            onClick={() => onCreateRequest(selectedCategory)}
            disabled={!selectedCategory}
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
        <button className="nav-item" type="button" onClick={onViewRequests}>
          <span className="nav-icon" aria-hidden="true">
            <IconUsers />
          </span>
          Мастера
        </button>
        <button className="nav-item" type="button">
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
