import { useEffect, useId } from 'react'
import logoImage from './assets/kiven-logo.webp'
import girlsImage from './assets/kiven-girls.webp'
import './App.css'

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
          <img className="brand-logo" src={logoImage} alt="KIVEN GIRL" />
          <h1>KIVEN GIRL</h1>
          <p className="subtitle">Услуги от девушек для девушек</p>
        </div>

        <h2 className="animate delay-2">Какая роль вам подходит?</h2>

        <div className="illustration-wrap animate delay-3">
          <img
            className="illustration"
            src={girlsImage}
            alt="Две девушки"
          />
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
