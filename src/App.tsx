import { useEffect, useId } from 'react'
import decorImage from './assets/kiven-decor.webp'
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
          <img
            className="footer-image"
            src={decorImage}
            alt=""
            aria-hidden="true"
          />
        </div>
      </main>
    </div>
  )
}

export default App
