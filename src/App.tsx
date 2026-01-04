import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import decorImage from './assets/kiven-decor.webp'
import logoImage from './assets/kiven-logo.webp'
import girlsImage from './assets/kiven-girls.webp'
import pinLeftImage from './assets/kiven-pin-left.webp'
import pinRightImage from './assets/kiven-pin-right.webp'
import categoryBeautyNails from './assets/categories/beauty-nails.webp'
import categoryBrowsLashes from './assets/categories/brows-lashes.webp'
import categoryHair from './assets/categories/hair.webp'
import categoryMakeupLook from './assets/categories/makeup-look.webp'
import categoryCosmetologyCare from './assets/categories/cosmetology-care.webp'
import categoryMassageBody from './assets/categories/massage-body.webp'
import categoryFitnessHealth from './assets/categories/fitness-health.webp'
import categoryHomeFamily from './assets/categories/home-family.webp'
import popularNails from './assets/popular/nails.webp'
import popularBrowsLashes from './assets/popular/brows-lashes.webp'
import popularCleaning from './assets/popular/cleaning.webp'
import popularNanny from './assets/popular/nanny.webp'
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

const popularItems = [
  { id: 'manicure', image: popularNails, label: 'Маникюр' },
  { id: 'lash-extensions', image: popularBrowsLashes, label: 'Наращивание ресниц' },
  { id: 'brow-shaping', image: popularCleaning, label: 'Оформление бровей' },
  { id: 'haircut', image: popularNanny, label: 'Стрижка' },
] as const

const categoryItems = [
  { id: 'beauty-nails', icon: categoryBeautyNails, label: 'Красота и ногти' },
  { id: 'brows-lashes', icon: categoryBrowsLashes, label: 'Брови и ресницы' },
  { id: 'hair', icon: categoryHair, label: 'Волосы' },
  { id: 'makeup-look', icon: categoryMakeupLook, label: 'Макияж и образ' },
  {
    id: 'cosmetology-care',
    icon: categoryCosmetologyCare,
    label: 'Косметология и уход',
  },
  { id: 'massage-body', icon: categoryMassageBody, label: 'Массаж и тело' },
  { id: 'fitness-health', icon: categoryFitnessHealth, label: 'Фитнес и здоровье' },
  { id: 'home-family', icon: categoryHomeFamily, label: 'Дом и семья' },
] as const

const apiBase = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(
  /\/$/,
  ''
)
const getTelegramUser = () => window.Telegram?.WebApp?.initDataUnsafe?.user

type City = {
  id: number
  name: string
}

type District = {
  id: number
  cityId: number
  name: string
}

type Role = 'client' | 'pro'

const StartScreen = ({
  onRoleSelect,
}: {
  onRoleSelect: (role: Role) => void
}) => (
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
          onClick={() => onRoleSelect('client')}
        >
          <StarPin tone="lavender" />
          <span>Мне нужна услуга</span>
        </button>
        <button
          className="role-card role-card--pro"
          type="button"
          onClick={() => onRoleSelect('pro')}
        >
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

const AddressScreen = ({
  role,
  cities,
  districts,
  cityId,
  districtId,
  address,
  isSaving,
  isLoading,
  saveError,
  onCityChange,
  onDistrictChange,
  onAddressChange,
  onBack,
  onContinue,
}: {
  role: Role
  cities: City[]
  districts: District[]
  cityId: number | null
  districtId: number | null
  address: string
  isSaving: boolean
  isLoading: boolean
  saveError: string
  onCityChange: (value: number | null) => void
  onDistrictChange: (value: number | null) => void
  onAddressChange: (value: string) => void
  onBack: () => void
  onContinue: () => void
}) => {
  const roleLabel = role === 'client' ? 'Заказчик' : 'Исполнительница'
  const hasCity = cityId !== null
  const hasDistrict = districtId !== null
  const hasAddress = address.trim().length > 0
  const canContinue = hasCity && hasDistrict && hasAddress && !isSaving && !isLoading

  return (
    <div className="screen screen--address">
      <div className="address-shell">
        <div className="address-top">
          <button className="back-pill" type="button" onClick={onBack}>
            <span className="chev">‹</span>
            Назад
          </button>
          <span className="address-role">{roleLabel}</span>
        </div>

        <h2 className="address-title">Ваш адрес</h2>
        <p className="address-subtitle">
          Выберите город и район, затем укажите точный адрес для сохранения.
        </p>
        {isLoading && <p className="address-status">Загружаем данные...</p>}

        <div className="address-card">
          <div className="address-field">
            <label className="address-label" htmlFor="city-select">
              Город
            </label>
            <select
              id="city-select"
              className="address-select"
              value={cityId ?? ''}
              onChange={(event) => {
                const nextValue = event.target.value
                const parsedValue = Number(nextValue)
                onCityChange(Number.isInteger(parsedValue) ? parsedValue : null)
              }}
              autoFocus
            >
              <option value="">Выберите город</option>
              {cities.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}
                </option>
              ))}
            </select>
          </div>

          <div className="address-field">
            <label className="address-label" htmlFor="district-select">
              Район
            </label>
            <select
              id="district-select"
              className="address-select"
              value={districtId ?? ''}
              onChange={(event) => {
                const nextValue = event.target.value
                const parsedValue = Number(nextValue)
                onDistrictChange(
                  Number.isInteger(parsedValue) ? parsedValue : null
                )
              }}
              disabled={!hasCity || districts.length === 0}
            >
              <option value="">
                {hasCity ? 'Выберите район' : 'Сначала выберите город'}
              </option>
              {districts.map((district) => (
                <option key={district.id} value={district.id}>
                  {district.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="address-card">
          <label className="address-label" htmlFor="address-input">
            Адрес
          </label>
          <input
            id="address-input"
            className="address-input"
            type="text"
            value={address}
            onChange={(event) => onAddressChange(event.target.value)}
            placeholder="Улица, дом, квартира"
            autoComplete="street-address"
          />
          <p className="address-helper">Нужен точный адрес для выезда.</p>
        </div>

        <div className="address-actions">
          <button
            className="address-primary"
            type="button"
            onClick={onContinue}
            disabled={!canContinue}
          >
            {isSaving ? 'Сохраняем...' : 'Сохранить'}
          </button>
        </div>

        {saveError && <p className="address-error">{saveError}</p>}

        <p className="address-hint">Адрес можно изменить в профиле позже.</p>
      </div>
    </div>
  )
}

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

const ClientScreen = ({ clientName }: { clientName: string }) => (
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
        <div className="popular-carousel" role="region" aria-label="Популярное сегодня">
          <div className="popular-track" role="list">
            {popularItems.map((item) => (
              <button
                className="popular-card"
                type="button"
                key={item.id}
                role="listitem"
              >
                <span className="popular-media" aria-hidden="true">
                  <img className="popular-image" src={item.image} alt="" />
                </span>
                <span className="popular-label">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="client-section">
        <div className="category-grid">
          {categoryItems.map((item) => (
            <button className="category-card" type="button" key={item.id}>
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
          ))}
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
  const [view, setView] = useState<'start' | 'address' | 'client'>('start')
  const [role, setRole] = useState<Role>('client')
  const [address, setAddress] = useState('')
  const [telegramUser] = useState(() => getTelegramUser())
  const [userId] = useState(() => telegramUser?.id?.toString() ?? 'local-dev')
  const [cities, setCities] = useState<City[]>([])
  const [districts, setDistricts] = useState<District[]>([])
  const [cityId, setCityId] = useState<number | null>(null)
  const [districtId, setDistrictId] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingAddress, setIsLoadingAddress] = useState(false)
  const [isLoadingCities, setIsLoadingCities] = useState(false)
  const [isLoadingDistricts, setIsLoadingDistricts] = useState(false)
  const [saveError, setSaveError] = useState('')
  const clientName =
    [telegramUser?.first_name, telegramUser?.last_name]
      .filter(Boolean)
      .join(' ')
      .trim() || telegramUser?.username?.trim() || ''

  const handleAddressChange = (value: string) => {
    setAddress(value)
    if (saveError) {
      setSaveError('')
    }
  }

  const handleCityChange = (value: number | null) => {
    setCityId(value)
    setDistrictId(null)
    if (saveError) {
      setSaveError('')
    }
  }

  const handleDistrictChange = (value: number | null) => {
    setDistrictId(value)
    if (saveError) {
      setSaveError('')
    }
  }

  const handleSaveAddress = useCallback(async () => {
    if (!cityId || !districtId || !address.trim()) {
      setSaveError('Укажите город, район и адрес.')
      return
    }

    setIsSaving(true)
    setSaveError('')

    try {
      const response = await fetch(`${apiBase}/api/address`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          cityId,
          districtId,
          address: address.trim(),
        }),
      })

      if (!response.ok) {
        throw new Error('Save failed')
      }

      setView('client')
    } catch (error) {
      setSaveError('Не удалось сохранить адрес. Попробуйте еще раз.')
    } finally {
      setIsSaving(false)
    }
  }, [address, cityId, districtId, userId])

  useEffect(() => {
    if (!telegramUser?.id) return

    const payload = {
      userId,
      firstName: telegramUser.first_name ?? null,
      lastName: telegramUser.last_name ?? null,
      username: telegramUser.username ?? null,
      languageCode: telegramUser.language_code ?? null,
    }

    const controller = new AbortController()

    fetch(`${apiBase}/api/user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).catch(() => {})

    return () => controller.abort()
  }, [
    telegramUser?.id,
    telegramUser?.first_name,
    telegramUser?.last_name,
    telegramUser?.username,
    telegramUser?.language_code,
    userId,
  ])

  useEffect(() => {
    const webApp = window.Telegram?.WebApp
    if (!webApp) return

    webApp.ready()
    webApp.expand()
    webApp.requestFullscreen?.()
    webApp.disableVerticalSwipes?.()
    const isClient = view === 'client'
    webApp.setHeaderColor?.(isClient ? '#f3edf7' : '#f7f2ef')
    webApp.setBackgroundColor?.(isClient ? '#f3edf7' : '#f7f2ef')
  }, [view])

  useEffect(() => {
    if (view !== 'address') return
    if (!userId) return
    let cancelled = false

    const loadCities = async () => {
      setIsLoadingCities(true)
      setSaveError('')

      try {
        const response = await fetch(`${apiBase}/api/cities`)
        if (!response.ok) {
          throw new Error('Load cities failed')
        }
        const data = (await response.json()) as City[]

        if (cancelled) return

        setCities(data)
        if (data.length === 1) {
          setCityId((current) => current ?? data[0].id)
        }
      } catch (error) {
        if (!cancelled) {
          setSaveError('Не удалось загрузить города.')
        }
      } finally {
        if (!cancelled) {
          setIsLoadingCities(false)
        }
      }
    }

    const loadAddress = async () => {
      setIsLoadingAddress(true)
      setSaveError('')

      try {
        const response = await fetch(
          `${apiBase}/api/address?userId=${encodeURIComponent(userId)}`
        )

        if (response.status === 404) {
          return
        }
        if (!response.ok) {
          throw new Error('Load failed')
        }

        const data = (await response.json()) as {
          address?: string | null
          cityId?: number | null
          districtId?: number | null
        }

        if (cancelled) return

        if (typeof data.address === 'string') {
          setAddress(data.address)
        }
        if (typeof data.cityId === 'number') {
          setCityId(data.cityId)
        }
        if (typeof data.districtId === 'number') {
          setDistrictId(data.districtId)
        }
      } catch (error) {
        if (!cancelled) {
          setSaveError('Не удалось загрузить адрес.')
        }
      } finally {
        if (!cancelled) {
          setIsLoadingAddress(false)
        }
      }
    }

    loadCities()
    loadAddress()

    return () => {
      cancelled = true
    }
  }, [userId, view])

  useEffect(() => {
    if (!cityId) {
      setDistricts([])
      return
    }

    let cancelled = false
    setIsLoadingDistricts(true)
    setSaveError('')

    const loadDistricts = async () => {
      try {
        const response = await fetch(`${apiBase}/api/cities/${cityId}/districts`)
        if (!response.ok) {
          throw new Error('Load districts failed')
        }
        const data = (await response.json()) as District[]
        if (!cancelled) {
          setDistricts(data)
          setDistrictId((current) =>
            current && data.some((district) => district.id === current)
              ? current
              : null
          )
        }
      } catch (error) {
        if (!cancelled) {
          setSaveError('Не удалось загрузить районы.')
        }
      } finally {
        if (!cancelled) {
          setIsLoadingDistricts(false)
        }
      }
    }

    loadDistricts()

    return () => {
      cancelled = true
    }
  }, [cityId])

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
    return <ClientScreen clientName={clientName} />
  }

  if (view === 'address') {
    return (
      <AddressScreen
        role={role}
        cities={cities}
        districts={districts}
        cityId={cityId}
        districtId={districtId}
        address={address}
        isSaving={isSaving}
        isLoading={isLoadingAddress || isLoadingCities || isLoadingDistricts}
        saveError={saveError}
        onCityChange={handleCityChange}
        onDistrictChange={handleDistrictChange}
        onAddressChange={handleAddressChange}
        onBack={() => setView('start')}
        onContinue={handleSaveAddress}
      />
    )
  }

  return (
    <StartScreen
      onRoleSelect={(nextRole) => {
        setRole(nextRole)
        setView('address')
      }}
    />
  )
}

export default App
