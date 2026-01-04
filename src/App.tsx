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

const cityOptions = [
  { id: 'moscow', label: 'Москва' },
  { id: 'spb', label: 'Санкт-Петербург' },
  { id: 'kazan', label: 'Казань' },
  { id: 'sochi', label: 'Сочи' },
  { id: 'ekb', label: 'Екатеринбург' },
] as const

const radiusPresets = [2, 5, 8, 12, 20] as const
const defaultRadiusKm = 5

type MasterProfile = {
  id: string
  name: string
  city: string
  specialty: string
  rating: number
  reviews: number
  price: string
  distanceKm: number
  tags: string[]
  status?: string
  tone: 'lavender' | 'sun' | 'mint' | 'rose' | 'sky'
}

const masterProfiles: MasterProfile[] = [
  {
    id: 'mironova',
    name: 'Анна Миронова',
    city: 'Москва',
    specialty: 'Маникюр и педикюр',
    rating: 4.9,
    reviews: 128,
    price: 'от 1800 ₽',
    distanceKm: 2.4,
    tags: ['Маникюр', 'Гель-лак'],
    status: 'Сегодня',
    tone: 'lavender',
  },
  {
    id: 'koval',
    name: 'Мария Коваль',
    city: 'Москва',
    specialty: 'Брови и ресницы',
    rating: 4.8,
    reviews: 86,
    price: 'от 1500 ₽',
    distanceKm: 5.8,
    tags: ['Ламинирование', 'Архитектура'],
    status: 'Свободно',
    tone: 'sun',
  },
  {
    id: 'trifonova',
    name: 'Елена Трифонова',
    city: 'Москва',
    specialty: 'Массаж и тело',
    rating: 5.0,
    reviews: 54,
    price: 'от 2600 ₽',
    distanceKm: 9.2,
    tags: ['Релакс', 'Лимфодренаж'],
    status: 'Выезд',
    tone: 'mint',
  },
  {
    id: 'lukina',
    name: 'Дарья Лукина',
    city: 'Санкт-Петербург',
    specialty: 'Косметология',
    rating: 4.7,
    reviews: 74,
    price: 'от 2200 ₽',
    distanceKm: 3.1,
    tags: ['Уход за лицом', 'Чистка'],
    status: 'Сегодня',
    tone: 'rose',
  },
  {
    id: 'isaeva',
    name: 'Ольга Исаева',
    city: 'Санкт-Петербург',
    specialty: 'Макияж и образ',
    rating: 4.9,
    reviews: 112,
    price: 'от 3000 ₽',
    distanceKm: 6.7,
    tags: ['Вечерний', 'Свадебный'],
    status: 'Завтра',
    tone: 'sky',
  },
  {
    id: 'demina',
    name: 'София Дёмина',
    city: 'Казань',
    specialty: 'Волосы и укладки',
    rating: 4.8,
    reviews: 65,
    price: 'от 1700 ₽',
    distanceKm: 2.0,
    tags: ['Стрижка', 'Укладка'],
    status: 'Сегодня',
    tone: 'lavender',
  },
  {
    id: 'belova',
    name: 'Ирина Белова',
    city: 'Казань',
    specialty: 'Ногти',
    rating: 4.9,
    reviews: 93,
    price: 'от 1900 ₽',
    distanceKm: 7.5,
    tags: ['Гель-лак', 'Дизайн'],
    status: 'Выезд',
    tone: 'sun',
  },
  {
    id: 'markova',
    name: 'Валерия Маркова',
    city: 'Сочи',
    specialty: 'Фитнес и здоровье',
    rating: 4.7,
    reviews: 48,
    price: 'от 1400 ₽',
    distanceKm: 4.3,
    tags: ['Йога', 'Растяжка'],
    status: 'Утром',
    tone: 'mint',
  },
  {
    id: 'safonova',
    name: 'Наталья Сафонова',
    city: 'Сочи',
    specialty: 'Брови и ресницы',
    rating: 4.9,
    reviews: 58,
    price: 'от 1600 ₽',
    distanceKm: 8.9,
    tags: ['Ламинирование', 'Окрашивание'],
    status: 'Сегодня',
    tone: 'rose',
  },
  {
    id: 'petrova',
    name: 'Кристина Петрова',
    city: 'Екатеринбург',
    specialty: 'Косметология',
    rating: 4.8,
    reviews: 71,
    price: 'от 2100 ₽',
    distanceKm: 1.4,
    tags: ['Уход', 'Пилинг'],
    status: 'Свободно',
    tone: 'sky',
  },
  {
    id: 'grishina',
    name: 'Алина Гришина',
    city: 'Екатеринбург',
    specialty: 'Дом и семья',
    rating: 4.6,
    reviews: 39,
    price: 'от 1200 ₽',
    distanceKm: 10.0,
    tags: ['Няня', 'Сопровождение'],
    status: 'Сегодня',
    tone: 'lavender',
  },
]

const normalizeText = (value: string) => value.trim().toLowerCase()

const formatDistance = (distanceKm: number) => {
  const fixed =
    distanceKm % 1 === 0 ? distanceKm.toFixed(0) : distanceKm.toFixed(1)
  return `${fixed.replace('.', ',')} км`
}

const getInitials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

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

const LocationScreen = ({
  role,
  city,
  radiusKm,
  onCityChange,
  onRadiusChange,
  onBack,
  onContinue,
}: {
  role: Role
  city: string
  radiusKm: number
  onCityChange: (value: string) => void
  onRadiusChange: (value: number) => void
  onBack: () => void
  onContinue: () => void
}) => {
  const roleLabel = role === 'client' ? 'Заказчик' : 'Исполнительница'
  const normalizedCity = normalizeText(city)
  const hasCity = normalizedCity.length > 0
  const cityLabel =
    cityOptions.find((option) => normalizeText(option.label) === normalizedCity)
      ?.label ?? city.trim()

  const mastersInCity = hasCity
    ? masterProfiles.filter(
        (master) => normalizeText(master.city) === normalizedCity
      )
    : []
  const filteredMasters = mastersInCity
    .filter((master) => master.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)

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

        <h2 className="address-title">Город и радиус поиска</h2>
        <p className="address-subtitle">
          Сначала выберите город, затем радиус. Мы покажем анкеты мастеров рядом.
        </p>

        <div className="address-card location-card">
          <label className="address-label" htmlFor="city-input">
            Город
          </label>
          <input
            id="city-input"
            className="address-input"
            type="text"
            value={city}
            onChange={(event) => onCityChange(event.target.value)}
            placeholder="Москва, Казань, Сочи"
            autoComplete="address-level2"
            autoFocus
          />
          <div className="city-chips">
            {cityOptions.map((option) => {
              const isActive =
                normalizeText(option.label) === normalizedCity
              return (
                <button
                  className={`city-chip${isActive ? ' is-active' : ''}`}
                  key={option.id}
                  type="button"
                  onClick={() => onCityChange(option.label)}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="address-card radius-card">
          <div className="radius-header">
            <label className="address-label" htmlFor="radius-input">
              Радиус
            </label>
            <span className="radius-value">{radiusKm} км</span>
          </div>
          <input
            id="radius-input"
            className="radius-slider"
            type="range"
            min={1}
            max={30}
            step={1}
            value={radiusKm}
            onChange={(event) => onRadiusChange(Number(event.target.value))}
            disabled={!hasCity}
          />
          <div className="radius-chips">
            {radiusPresets.map((preset) => {
              const isActive = preset === radiusKm
              return (
                <button
                  className={`radius-chip${isActive ? ' is-active' : ''}`}
                  key={preset}
                  type="button"
                  onClick={() => onRadiusChange(preset)}
                  disabled={!hasCity}
                >
                  {preset} км
                </button>
              )
            })}
          </div>
          {!hasCity && (
            <p className="radius-hint">Сначала выберите город.</p>
          )}
        </div>

        <div className="address-card results-card">
          <div className="results-header">
            <div>
              <p className="results-title">Мастера рядом</p>
              <p className="results-subtitle">
                {hasCity
                  ? `${cityLabel} • до ${radiusKm} км`
                  : 'Выберите город, чтобы увидеть анкеты'}
              </p>
            </div>
            {hasCity && (
              <span className="results-count">{filteredMasters.length}</span>
            )}
          </div>

          {!hasCity && (
            <div className="results-empty">
              <p>Сначала выберите город — затем можно задать радиус.</p>
            </div>
          )}

          {hasCity && filteredMasters.length === 0 && (
            <div className="results-empty">
              <p>В радиусе {radiusKm} км пока нет мастеров.</p>
              <span>Попробуйте увеличить радиус или выбрать другой город.</span>
            </div>
          )}

          {hasCity && filteredMasters.length > 0 && (
            <div className="results-list">
              {filteredMasters.map((master) => (
                <article
                  className={`master-card master-card--${master.tone}`}
                  key={master.id}
                >
                  <div className="master-avatar" aria-hidden="true">
                    {getInitials(master.name)}
                  </div>
                  <div className="master-info">
                    <div className="master-top">
                      <div>
                        <p className="master-name">{master.name}</p>
                        <p className="master-specialty">{master.specialty}</p>
                      </div>
                      {master.status && (
                        <span className="master-status">{master.status}</span>
                      )}
                    </div>
                    <div className="master-meta">
                      <span className="master-rating">
                        {master.rating} ★
                      </span>
                      <span>{master.reviews} отзывов</span>
                      <span>{formatDistance(master.distanceKm)}</span>
                    </div>
                    <div className="master-tags">
                      {master.tags.map((tag) => (
                        <span className="master-tag" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="master-bottom">
                      <span className="master-price">{master.price}</span>
                      <button className="master-cta" type="button">
                        Анкета <span aria-hidden="true">›</span>
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="address-actions">
          <button
            className="address-primary"
            type="button"
            onClick={onContinue}
            disabled={!hasCity}
          >
            Продолжить
          </button>
          <button className="address-secondary" type="button" onClick={onContinue}>
            Укажу позже
          </button>
        </div>

        <p className="address-hint">
          Город и радиус можно изменить в профиле позже.
        </p>
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

const ClientScreen = () => (
  <div className="screen screen--client">
    <div className="client-shell">
      <header className="client-brand-row">
        <div className="client-brand">KIVEN</div>
      </header>

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
  const [city, setCity] = useState('')
  const [radiusKm, setRadiusKm] = useState(defaultRadiusKm)

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

  if (view === 'address') {
    return (
      <LocationScreen
        role={role}
        city={city}
        radiusKm={radiusKm}
        onCityChange={setCity}
        onRadiusChange={setRadiusKm}
        onBack={() => setView('start')}
        onContinue={() => setView('client')}
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
