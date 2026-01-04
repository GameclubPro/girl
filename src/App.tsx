import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
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

const collectionItems = [
  {
    id: 'verified',
    badge: '✅',
    label: 'Проверено',
    title: 'Проверенные мастера',
    meta: '4.9 ★ и выше',
    tone: 'lavender',
  },
  {
    id: 'visit',
    badge: '🚗',
    label: 'Сегодня',
    title: 'Выезд сегодня',
    meta: 'Ближайшие 2 часа',
    tone: 'sun',
  },
  {
    id: 'budget',
    badge: '₽',
    label: 'Бюджет',
    title: 'До 2000 ₽',
    meta: 'Фиксированные цены',
    tone: 'mint',
  },
  {
    id: 'express',
    badge: '⚡',
    label: 'Срочно',
    title: 'Экспресс-сервис',
    meta: 'Ответ за 10 минут',
    tone: 'rose',
  },
  {
    id: 'stars',
    badge: '⭐',
    label: 'Топ недели',
    title: 'Звезды недели',
    meta: 'Лучшие отзывы',
    tone: 'sky',
  },
] as const

const collectionBaseIndex = collectionItems.length
const loopedCollectionItems = [
  ...collectionItems,
  ...collectionItems,
  ...collectionItems,
]

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

const CollectionCarousel = () => {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])
  const rafRef = useRef(0)
  const setWidthRef = useRef(0)
  const stepRef = useRef(0)
  const pauseRef = useRef(false)
  const readyRef = useRef(false)
  const hasCenteredRef = useRef(false)
  const [isReady, setIsReady] = useState(false)
  const [fontsReady, setFontsReady] = useState(false)

  const measure = useCallback(() => {
    const track = trackRef.current
    const first = cardRefs.current[0]
    const middle = cardRefs.current[collectionBaseIndex]
    if (!track || !middle) return

    const trackStyle = window.getComputedStyle(track)
    const gapValue = trackStyle.columnGap || trackStyle.gap || '0'
    const gap = Number.parseFloat(gapValue) || 0
    const cardWidth = middle.getBoundingClientRect().width
    const middleNext = cardRefs.current[collectionBaseIndex + 1]
    const offsetStep = middleNext ? middleNext.offsetLeft - middle.offsetLeft : 0
    const step = offsetStep > 0 ? offsetStep : cardWidth + gap

    if (!Number.isFinite(step) || step <= 0) return

    stepRef.current = step
    const offsetSetWidth = first ? middle.offsetLeft - first.offsetLeft : 0
    setWidthRef.current =
      offsetSetWidth > 0 ? offsetSetWidth : step * collectionItems.length
  }, [])

  const setScrollLeftInstant = useCallback((nextLeft: number) => {
    const track = trackRef.current
    if (!track) return

    const previousBehavior = track.style.scrollBehavior
    track.style.scrollBehavior = 'auto'
    track.scrollLeft = nextLeft
    track.style.scrollBehavior = previousBehavior
  }, [])

  const centerMiddle = useCallback(() => {
    const track = trackRef.current
    const middle = cardRefs.current[collectionBaseIndex]
    if (!track || !middle) return

    const nextLeft =
      middle.offsetLeft - (track.clientWidth - middle.offsetWidth) / 2
    setScrollLeftInstant(nextLeft)
  }, [setScrollLeftInstant])

  const normalizePosition = useCallback(() => {
    const track = trackRef.current
    const setWidth = setWidthRef.current
    if (!track || !setWidth) return

    if (track.scrollLeft < setWidth * 0.2) {
      setScrollLeftInstant(track.scrollLeft + setWidth)
    } else if (track.scrollLeft > setWidth * 1.8) {
      setScrollLeftInstant(track.scrollLeft - setWidth)
    }
  }, [setScrollLeftInstant])

  const markReady = useCallback(() => {
    if (readyRef.current) return
    if (!setWidthRef.current || !stepRef.current) return
    readyRef.current = true
    setIsReady(true)
  }, [])

  const handleScroll = () => {
    if (!readyRef.current) return
    if (rafRef.current) return
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = 0
      normalizePosition()
    })
  }

  useLayoutEffect(() => {
    let cancelled = false
    let layoutRaf = 0

    const applyLayout = () => {
      if (cancelled) return
      measure()
      if (!hasCenteredRef.current) {
        const track = trackRef.current
        const middle = cardRefs.current[collectionBaseIndex]
        if (track && middle) {
          centerMiddle()
          hasCenteredRef.current = true
        }
      }
      normalizePosition()
      markReady()
    }

    applyLayout()

    const scheduleLayout = () => {
      if (layoutRaf) {
        window.cancelAnimationFrame(layoutRaf)
      }
      layoutRaf = window.requestAnimationFrame(applyLayout)
    }

    window.addEventListener('resize', scheduleLayout)

    const fontsReady = document.fonts?.ready
    if (fontsReady) {
      fontsReady.then(() => {
        scheduleLayout()
      })
    }

    return () => {
      cancelled = true
      if (layoutRaf) {
        window.cancelAnimationFrame(layoutRaf)
      }
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current)
      }
      window.removeEventListener('resize', scheduleLayout)
    }
  }, [centerMiddle, markReady, measure, normalizePosition])

  useEffect(() => {
    let cancelled = false
    let fallbackTimer = 0
    const readyPromise = document.fonts?.ready

    if (readyPromise) {
      readyPromise.then(() => {
        if (!cancelled) {
          setFontsReady(true)
        }
      })
      fallbackTimer = window.setTimeout(() => {
        if (!cancelled) {
          setFontsReady(true)
        }
      }, 2000)
    } else {
      setFontsReady(true)
    }

    return () => {
      cancelled = true
      if (fallbackTimer) {
        window.clearTimeout(fallbackTimer)
      }
    }
  }, [])

  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    if (!isReady || !fontsReady) return

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    )
    if (prefersReducedMotion.matches) return

    let resumeTimer = 0
    let startTimer = 0
    let intervalId = 0
    let autoStarted = false

    const startAuto = () => {
      if (autoStarted) return
      autoStarted = true
      measure()
      normalizePosition()
      pauseRef.current = false
      intervalId = window.setInterval(() => {
        if (pauseRef.current) return
        const setWidth = setWidthRef.current
        const step = stepRef.current
        if (!setWidth || !step) {
          measure()
          normalizePosition()
          return
        }
        if (step < setWidth * 0.1 || step > setWidth * 0.4) {
          measure()
          normalizePosition()
          return
        }
        normalizePosition()
        track.scrollBy({ left: step, behavior: 'smooth' })
      }, 3200)
    }

    const pauseAuto = () => {
      if (!autoStarted) return
      pauseRef.current = true
      if (resumeTimer) {
        window.clearTimeout(resumeTimer)
      }
      resumeTimer = window.setTimeout(() => {
        pauseRef.current = false
      }, 3500)
    }

    pauseRef.current = true
    startTimer = window.setTimeout(startAuto, 1400)

    track.addEventListener('pointerdown', pauseAuto)
    track.addEventListener('touchstart', pauseAuto, { passive: true })
    track.addEventListener('wheel', pauseAuto, { passive: true })
    track.addEventListener('focusin', pauseAuto)

    return () => {
      if (startTimer) {
        window.clearTimeout(startTimer)
      }
      if (intervalId) {
        window.clearInterval(intervalId)
      }
      if (resumeTimer) {
        window.clearTimeout(resumeTimer)
      }
      track.removeEventListener('pointerdown', pauseAuto)
      track.removeEventListener('touchstart', pauseAuto)
      track.removeEventListener('wheel', pauseAuto)
      track.removeEventListener('focusin', pauseAuto)
    }
  }, [measure, normalizePosition, isReady, fontsReady])

  return (
    <div
      className="collection-carousel"
      role="region"
      aria-label="Подборки для вас"
      aria-roledescription="carousel"
    >
      <div className="collection-track" ref={trackRef} onScroll={handleScroll}>
        {loopedCollectionItems.map((item, index) => {
          const isPrimary =
            index >= collectionBaseIndex &&
            index < collectionBaseIndex + collectionItems.length
          return (
            <button
              className={`collection-card collection-card--${item.tone}`}
              key={`${item.id}-${index}`}
              type="button"
              aria-hidden={!isPrimary}
              tabIndex={isPrimary ? 0 : -1}
              ref={(element) => {
                cardRefs.current[index] = element
              }}
            >
              <span className="collection-tag">
                <span className="collection-badge" aria-hidden="true">
                  {item.badge}
                </span>
                {item.label}
              </span>
              <span className="collection-body">
                <span className="collection-title">{item.title}</span>
                <span className="collection-meta">{item.meta}</span>
              </span>
              <span className="collection-cta" aria-hidden="true">
                Смотреть <span className="collection-cta-arrow">›</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const ClientScreen = () => (
  <div className="screen screen--client">
    <div className="client-shell">
      <div className="client-top">
        <p className="client-greeting">
          Привет, Екатерина <span aria-hidden="true">👋</span>
        </p>
        <button className="bell-button" type="button" aria-label="Уведомления">
          <IconBell />
        </button>
      </div>

      <section className="client-section">
        <CollectionCarousel />
      </section>

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

      <section className="client-section">
        <div className="category-grid">
          <button className="category-card" type="button">
            <span className="category-left">
              <span className="category-icon" aria-hidden="true">
                💅
              </span>
              Красота и ногти
            </span>
            <span className="category-arrow">›</span>
          </button>
          <button className="category-card" type="button">
            <span className="category-left">
              <span className="category-icon" aria-hidden="true">
                👁️
              </span>
              Брови и ресницы
            </span>
            <span className="category-arrow">›</span>
          </button>
          <button className="category-card" type="button">
            <span className="category-left">
              <span className="category-icon" aria-hidden="true">
                💇‍♀️
              </span>
              Волосы
            </span>
            <span className="category-arrow">›</span>
          </button>
          <button className="category-card" type="button">
            <span className="category-left">
              <span className="category-icon" aria-hidden="true">
                💄
              </span>
              Макияж и образ
            </span>
            <span className="category-arrow">›</span>
          </button>
          <button className="category-card" type="button">
            <span className="category-left">
              <span className="category-icon" aria-hidden="true">
                🧴
              </span>
              Косметология и уход
            </span>
            <span className="category-arrow">›</span>
          </button>
          <button className="category-card" type="button">
            <span className="category-left">
              <span className="category-icon" aria-hidden="true">
                💆‍♀️
              </span>
              Массаж и тело
            </span>
            <span className="category-arrow">›</span>
          </button>
          <button className="category-card" type="button">
            <span className="category-left">
              <span className="category-icon" aria-hidden="true">
                🧘‍♀️
              </span>
              Фитнес и здоровье
            </span>
            <span className="category-arrow">›</span>
          </button>
          <button className="category-card" type="button">
            <span className="category-left">
              <span className="category-icon" aria-hidden="true">
                🏠
              </span>
              Дом и семья
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

  useEffect(() => {
    const webApp = window.Telegram?.WebApp
    if (!webApp) return

    const root = document.documentElement
    const updateSafeArea = () => {
      const safe = webApp.safeAreaInset
      const content = webApp.contentSafeAreaInset
      root.style.setProperty('--tg-safe-top-js', `${safe?.top ?? 0}px`)
      root.style.setProperty('--tg-content-safe-top-js', `${content?.top ?? 0}px`)
    }

    updateSafeArea()
    webApp.onEvent?.('safeAreaChanged', updateSafeArea)
    webApp.onEvent?.('contentSafeAreaChanged', updateSafeArea)
    webApp.onEvent?.('viewportChanged', updateSafeArea)

    return () => {
      webApp.offEvent?.('safeAreaChanged', updateSafeArea)
      webApp.offEvent?.('contentSafeAreaChanged', updateSafeArea)
      webApp.offEvent?.('viewportChanged', updateSafeArea)
    }
  }, [])

  if (view === 'client') {
    return <ClientScreen />
  }

  return <StartScreen onClient={() => setView('client')} />
}

export default App
