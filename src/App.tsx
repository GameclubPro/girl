import { useEffect, useId } from 'react'
import './App.css'

const BrandPin = () => {
  const gradientId = useId()
  return (
    <svg
      className="brand-pin"
      viewBox="0 0 64 76"
      role="img"
      aria-label="KIVEN GIRL"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f8d07a" />
          <stop offset="100%" stopColor="#f0b84c" />
        </linearGradient>
      </defs>
      <path
        d="M32 3C20.4 3 11 12.4 11 24c0 16.4 21 46 21 46s21-29.6 21-46C53 12.4 43.6 3 32 3Z"
        fill={`url(#${gradientId})`}
      />
      <circle cx="32" cy="25" r="13.2" fill="#fff5e3" />
      <circle cx="32" cy="22" r="4.6" fill="#f0b84c" />
      <path
        d="M22.5 36.5c2.7-4.3 6.7-6.5 9.5-6.5s6.8 2.2 9.5 6.5"
        fill="#f0b84c"
      />
    </svg>
  )
}

const StarPin = ({ tone }: { tone: 'lavender' | 'sun' }) => {
  const gradientId = useId()
  const fillStart = tone === 'lavender' ? '#d5b7ff' : '#ffd86c'
  const fillEnd = tone === 'lavender' ? '#bba4ff' : '#f7b244'
  const starFill = tone === 'lavender' ? '#7b4db8' : '#9b5c00'

  return (
    <svg className="card-pin" viewBox="0 0 70 80" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={fillStart} />
          <stop offset="100%" stopColor={fillEnd} />
        </linearGradient>
      </defs>
      <path
        d="M35 4C23.1 4 13.5 13.6 13.5 25.5c0 16.9 21.5 45.5 21.5 45.5s21.5-28.6 21.5-45.5C56.5 13.6 46.9 4 35 4Z"
        fill={`url(#${gradientId})`}
      />
      <circle cx="35" cy="27" r="13" fill="#fff6e4" />
      <path
        d="M35 20.2l2.5 5.5 6 .5-4.6 4 1.4 5.8-5.3-3-5.3 3 1.4-5.8-4.6-4 6-.5 2.5-5.5Z"
        fill={starFill}
      />
    </svg>
  )
}

const Illustration = () => {
  const glowId = useId()
  return (
    <svg className="illustration" viewBox="0 0 420 260" aria-hidden="true">
      <defs>
        <radialGradient id={glowId} cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#f2e6e2" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="210" cy="120" rx="150" ry="90" fill={`url(#${glowId})`} />

      <g opacity="0.8">
        <path
          d="M225 64c12 0 22 8 22 18s-8 18-18 18-22-8-22-18c0-7 7-18 18-18Z"
          fill="#ceb3ef"
        />
        <path
          d="M195 78c6 0 10 4 10 9s-4 9-9 9-10-4-10-9c0-4 4-9 9-9Z"
          fill="#b999e9"
        />
        <path
          d="M270 72l3 6.5 7 .6-5.3 4.6 1.6 6.7-6.3-3.6-6.3 3.6 1.6-6.7-5.3-4.6 7-.6 3-6.5Z"
          fill="#f6c35d"
        />
        <path
          d="M130 86l2.6 5.4 5.8.5-4.3 3.9 1.3 5.7-5.4-3.1-5.4 3.1 1.3-5.7-4.3-3.9 5.8-.5 2.6-5.4Z"
          fill="#f6c35d"
        />
      </g>

      <g transform="translate(65 95)">
        <path
          d="M40 30c0-18 14-32 32-32 20 0 37 14 40 32-10 8-25 14-39 14-14 0-27-6-33-14Z"
          fill="#f6d08d"
        />
        <circle cx="72" cy="30" r="18" fill="#f6c9a5" />
        <path
          d="M50 30c6-12 16-18 22-18 9 0 20 7 24 18-7 7-15 10-24 10-9 0-16-3-22-10Z"
          fill="#efb977"
        />
        <path d="M62 48h20c4 0 10 5 10 12v42H52V60c0-7 6-12 10-12Z" fill="#f7f1f3" />
        <path d="M52 78c12 8 26 8 40 0v18H52V78Z" fill="#f1d6df" />
        <rect x="66" y="56" width="22" height="30" rx="6" fill="#f27823" />
        <circle cx="77" cy="62" r="2.6" fill="#1b1b1b" />
        <circle cx="83" cy="66" r="2.6" fill="#1b1b1b" />
        <circle cx="71" cy="66" r="2.6" fill="#1b1b1b" />
      </g>

      <g transform="translate(215 90)">
        <path
          d="M40 18c8-10 24-16 34-12 8 3 14 10 16 18-9 9-22 15-35 15-13 0-23-5-30-13 4-2 10-6 15-8Z"
          fill="#8f5a46"
        />
        <circle cx="62" cy="34" r="18" fill="#f2c3a4" />
        <path d="M46 30c3-6 10-12 16-12 7 0 15 6 18 12-6 6-12 9-18 9-6 0-11-3-16-9Z" fill="#7b4b3a" />
        <path d="M38 54h48c8 0 15 6 15 14v42H23V68c0-8 7-14 15-14Z" fill="#d3b2d8" />
        <path d="M28 72h68v36H28z" fill="#b89ac6" />
        <rect x="44" y="66" width="30" height="24" rx="6" fill="#f5e4b8" />
        <circle cx="52" cy="78" r="3.5" fill="#d56f5f" />
        <circle cx="64" cy="76" r="3.5" fill="#c172b4" />
        <rect x="84" y="48" width="8" height="30" rx="3" fill="#7b4b3a" />
        <path d="M84 42l10 6-4 8-10-6 4-8Z" fill="#f6d4c3" />
      </g>
    </svg>
  )
}

const PlantDecor = () => (
  <svg className="decor decor--plant" viewBox="0 0 140 120" aria-hidden="true">
    <path d="M34 88c0-24 14-40 26-44-2 12-6 22-6 40 0 8 3 18 8 24-11 4-28 2-28-20Z" fill="#8ab47b" />
    <path d="M62 92c0-18 10-34 22-40-3 16-4 26-2 38 2 12 6 18 10 24-12 5-30 0-30-22Z" fill="#6aa179" />
    <path d="M80 88c6-18 16-30 28-34-2 14-2 22 2 34 3 10 6 16 10 22-12 6-32 4-40-22Z" fill="#8fbf8b" />
    <path d="M18 90h70c10 0 18 8 18 18v8H0v-8c0-10 8-18 18-18Z" fill="#8d76a8" />
    <path d="M20 90h66c8 0 14 6 14 14v6H6v-6c0-8 6-14 14-14Z" fill="#a38ac2" />
  </svg>
)

const BeautyDecor = () => (
  <svg className="decor decor--beauty" viewBox="0 0 170 120" aria-hidden="true">
    <circle cx="110" cy="46" r="34" fill="#f4d3dd" />
    <circle cx="110" cy="46" r="26" fill="#ffffff" />
    <rect x="98" y="80" width="24" height="28" rx="10" fill="#e7b5c7" />
    <path d="M20 94h70c8 0 14 6 14 14v8H6v-8c0-8 6-14 14-14Z" fill="#e8d7c8" />
    <rect x="30" y="72" width="34" height="14" rx="6" fill="#f0c3a6" />
    <rect x="70" y="66" width="22" height="28" rx="6" fill="#d9c0a8" />
    <rect x="132" y="60" width="28" height="10" rx="5" fill="#c79ab0" />
    <rect x="140" y="44" width="8" height="18" rx="4" fill="#a97a93" />
  </svg>
)

function App() {
  useEffect(() => {
    const webApp = window.Telegram?.WebApp
    if (!webApp) return

    webApp.ready()
    webApp.expand()
    webApp.requestFullscreen?.()
    webApp.disableVerticalSwipes?.()
    webApp.setHeaderColor?.('#f7f2ef')
    webApp.setBackgroundColor?.('#f7f2ef')
  }, [])

  return (
    <div className="screen">
      <div className="topbar">
        <button className="lang-pill" type="button" aria-label="Сменить язык">
          RU <span className="chev">›</span>
        </button>
      </div>

      <main className="content">
        <div className="title-block animate delay-1">
          <BrandPin />
          <h1>KIVEN GIRL</h1>
          <p className="subtitle">Услуги от девушек для девушек</p>
        </div>

        <h2 className="animate delay-2">Какая роль вам подходит?</h2>

        <div className="illustration-wrap animate delay-3">
          <Illustration />
        </div>

        <div className="role-cards animate delay-4">
          <button className="role-card role-card--client" type="button">
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
          <PlantDecor />
          <BeautyDecor />
        </div>
      </main>
    </div>
  )
}

export default App
