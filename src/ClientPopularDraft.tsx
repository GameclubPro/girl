import type { PopularItem } from './data/clientData'

type ClientPopularDraftProps = {
  items: PopularItem[]
  onSelect: (categoryId: string) => void
}

export const ClientPopularDraft = ({
  items,
  onSelect,
}: ClientPopularDraftProps) => {
  return (
    <section className="client-section popular-section is-draft" id="client-popular">
      <div className="section-header">
        <h3>Популярное сегодня</h3>
        <span className="popular-draft-badge" aria-label="Черновик">
          Черновик
        </span>
      </div>
      <div
        className="popular-carousel"
        role="region"
        aria-label="Популярное сегодня"
      >
        {items.length > 0 ? (
          <div className="popular-track" role="list">
            {items.map((item) => {
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
                  onClick={() => onSelect(item.categoryId)}
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
  )
}
