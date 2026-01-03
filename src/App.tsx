import { useEffect, useState } from 'react'
import decorImage from './assets/kiven-decor.webp'
import logoImage from './assets/kiven-logo.webp'
import girlsImage from './assets/kiven-girls.webp'
import pinLeftImage from './assets/kiven-pin-left.webp'
import pinRightImage from './assets/kiven-pin-right.webp'
import './App.css'

const StarPin = ({ tone }: { tone: 'lavender' | 'sun' }) => {
  const src = tone === 'lavender' ? pinLeftImage : pinRightImage
  const alt = tone === 'lavender' ? 'Метка услуги' : 'Метка исполнительницы'

  return (
    <div className={`pin-wrap pin-wrap--${tone}`}>
      <img className="card-pin" src={src} alt={alt} />
      <div className={`pin-stars pin-stars--${tone}`} aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <span className="pin-star" key={index} />
        ))}
      </div>
    </div>
  )
}

const IconBell = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M6.4 16.2V10a5.6 5.6 0 1 1 11.2 0v6.2l1.6 2H4.8l1.6-2Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M9.8 18.2a2.2 2.2 0 0 0 4.4 0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
)

const IconSearch = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle
      cx="11"
      cy="11"
      r="6.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    />
    <path
      d="M16 16l4 4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
)

const IconFilter = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M4 6h16l-6.2 7v4.4l-3.6 1.6V13L4 6Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
)

const IconHome = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M4 11.4 12 5l8 6.4V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-8.6Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
)

const IconUsers = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle
      cx="12"
      cy="9"
      r="3.6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <path
      d="M4 20c1.7-3.4 4.7-5.2 8-5.2s6.3 1.8 8 5.2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
)

const IconList = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect
      x="5"
      y="4"
      width="14"
      height="16"
      rx="2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <path
      d="M8 9h8M8 13h8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
)

const IconUser = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle
      cx="12"
      cy="8.8"
      r="3.2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <path
      d="M6 20c1.6-3 4-4.6 6-4.6s4.4 1.6 6 4.6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
)

const StartScreen = ({ onClient }: { onClient: () => void }) => (
  <div className="screen screen--start">
    <div className="topbar">
      <button className="lang-pill" type="button" aria-label="Сменить язык">
        RU <span className="chev">›</span>
      </button>
    </div>

    <main className="content">
      <div className="title-block animate delay-1">
        <img className="brand-logo" src={logoImage} alt="KIVEN GIRL" />
        <h1>KIVEN GIRL</h1>
        <p className="subtitle">Услуги от девушек для девушек</p>
      </div>

      <h2 className="animate delay-2">Какая роль вам подходит?</h2>

      <div className="illustration-wrap animate delay-3">
        <img className="illustration" src={girlsImage} alt="Две девушки" />
      </div>

      <div className="role-cards animate delay-4">
        <button
          className="role-card role-card--client"
          type="button"
          onClick={onClient}
        >
          <StarPin tone="lavender" />
          <span>Мне нужна услуга</span>
        </button>
        <button className="role-card role-card--pro" type="button">
          <StarPin tone="sun" />
          <span>Я исполнительница</span>
        </button>
      </div>

      <p className="footer-copy animate delay-5">
        Зарегистрируйтесь как заказчик или мастер
      </p>

      <div className="footer-decor" aria-hidden="true">
        <img className="footer-image" src={decorImage} alt="" aria-hidden="true" />
      </div>
    </main>
  </div>
)

const ClientScreen = () => (
  <div className="screen screen--client">
    <div className="client-shell">
      <header className="client-header">
        <div className="client-brand">KIVEN</div>
        <button className="bell-button" type="button" aria-label="Уведомления">
          <IconBell />
        </button>
      </header>

      <p className="client-greeting">
        Привет, Екатерина <span aria-hidden="true">👋</span>
      </p>

      <div className="search-bar">
        <span className="search-icon" aria-hidden="true">
          <IconSearch />
        </span>
        <input
          className="search-input"
          type="text"
          placeholder="Например: маникюр, уборка, няня..."
          aria-label="Поиск услуг"
        />
        <span className="search-divider" aria-hidden="true" />
        <button className="filter-button" type="button" aria-label="Фильтры">
          <IconFilter />
        </button>
      </div>

      <div className="cta-row">
        <button className="cta cta--primary" type="button">
          <span className="cta-icon" aria-hidden="true">
            +
          </span>
          Создать заявку
        </button>
        <button className="cta cta--secondary" type="button">
          <span className="cta-icon cta-icon--ghost" aria-hidden="true">
            <IconSearch />
          </span>
          Найти мастера <span className="cta-arrow">›</span>
        </button>
      </div>

      <section className="client-section">
        <div className="section-header">
          <h3>Популярное сегодня</h3>
        </div>
        <div className="popular-grid">
          <button className="popular-card" type="button">
            <span className="popular-icon" aria-hidden="true">
              💅
            </span>
            Маникюр
          </button>
          <button className="popular-card" type="button">
            <span className="popular-icon" aria-hidden="true">
              👁️
            </span>
            Брови и ресницы
          </button>
          <button className="popular-card" type="button">
            <span className="popular-icon" aria-hidden="true">
              🧼
            </span>
            Клининг
          </button>
          <button className="popular-card" type="button">
            <span className="popular-icon" aria-hidden="true">
              👩‍👧
            </span>
            Няня
          </button>
        </div>
      </section>

      <section className="client-section">
        <div className="section-header section-header--action">
          <h3>Подборки для вас</h3>
          <button className="section-action" type="button" aria-label="Все подборки">
            ›
          </button>
        </div>
        <div className="collection-grid">
          <button className="collection-card collection-card--verified" type="button">
            <span className="collection-badge" aria-hidden="true">
              ✅
            </span>
            <span className="collection-title">Проверенные мастера</span>
          </button>
          <button className="collection-card collection-card--visit" type="button">
            <span className="collection-badge" aria-hidden="true">
              🚗
            </span>
            <span className="collection-title">Выезд сегодня</span>
          </button>
          <button className="collection-card collection-card--budget" type="button">
            <span className="collection-badge" aria-hidden="true">
              ₽
            </span>
            <span className="collection-title">До 2000 ₽</span>
          </button>
        </div>
      </section>

      <section className="client-section">
        <div className="category-grid">
          <button className="category-card" type="button">
            <span className="category-left">
              <span className="category-icon" aria-hidden="true">
                💅
              </span>
              Красота
            </span>
            <span className="category-arrow">›</span>
          </button>
          <button className="category-card" type="button">
            <span className="category-left">
              <span className="category-icon" aria-hidden="true">
                🪷
              </span>
              Здоровье
            </span>
            <span className="category-arrow">›</span>
          </button>
          <button className="category-card" type="button">
            <span className="category-left">
              <span className="category-icon" aria-hidden="true">
                🏠
              </span>
              Дом и уют
            </span>
            <span className="category-arrow">›</span>
          </button>
          <button className="category-card" type="button">
            <span className="category-left">
              <span className="category-icon" aria-hidden="true">
                🧸
              </span>
              Дети и семья
            </span>
            <span className="category-arrow">›</span>
          </button>
          <button className="category-card" type="button">
            <span className="category-left">
              <span className="category-icon" aria-hidden="true">
                👗
              </span>
              Стиль и медиа
            </span>
            <span className="category-arrow">›</span>
          </button>
          <button className="category-card" type="button">
            <span className="category-left">
              <span className="category-icon" aria-hidden="true">
                📦
              </span>
              Доставка и помощь
            </span>
            <span className="category-arrow">›</span>
          </button>
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
      <button className="nav-item" type="button">
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

function App() {
  const [view, setView] = useState<'start' | 'client'>('start')

  useEffect(() => {
    const webApp = window.Telegram?.WebApp
    if (!webApp) return

    webApp.ready()
    webApp.expand()
    webApp.requestFullscreen?.()
    webApp.disableVerticalSwipes?.()
    webApp.setHeaderColor?.(view === 'client' ? '#f3edf7' : '#f7f2ef')
    webApp.setBackgroundColor?.(view === 'client' ? '#f3edf7' : '#f7f2ef')
  }, [view])

  if (view === 'client') {
    return <ClientScreen />
  }

  return <StartScreen onClient={() => setView('client')} />
}

export default App
