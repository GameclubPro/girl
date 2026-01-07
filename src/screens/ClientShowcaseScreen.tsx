import { useMemo } from 'react'
import { IconHome, IconList, IconUser, IconUsers } from '../components/icons'
import { categoryItems, popularItems } from '../data/clientData'

type ClientShowcaseScreenProps = {
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

const showcaseTileClasses = [
  'is-wide',
  'is-tall',
  'is-small',
  'is-tall',
  'is-wide',
  'is-small',
  'is-tall',
  'is-small',
]

export const ClientShowcaseScreen = ({
  activeCategoryId,
  onCategoryChange,
  onBack,
  onViewRequests,
}: ClientShowcaseScreenProps) => {
  const activeCategoryLabel =
    categoryChips.find((chip) => chip.id === activeCategoryId)?.label ??
    categoryItems.find((item) => item.id === activeCategoryId)?.label ??
    ''
  const baseItems = useMemo(() => {
    const filtered = activeCategoryId
      ? popularItems.filter((item) => item.categoryId === activeCategoryId)
      : popularItems
    return filtered.length > 0 ? filtered : popularItems
  }, [activeCategoryId])
  const showcaseItems = useMemo(
    () =>
      Array.from({ length: 10 }, (_, index) => ({
        ...baseItems[index % baseItems.length],
        _key: `${baseItems[index % baseItems.length]?.id ?? 'item'}-${index}`,
      })),
    [baseItems]
  )

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
                className={`client-work-card ${showcaseTileClasses[index % showcaseTileClasses.length]}`}
                key={item._key}
              >
                <img src={item.image} alt={item.label} loading="lazy" />
                <span className="client-work-label">{item.label}</span>
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
