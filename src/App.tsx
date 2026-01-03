import { useEffect } from 'react'
import decorImage from './assets/kiven-decor.webp'
import logoImage from './assets/kiven-logo.webp'
import girlsImage from './assets/kiven-girls.webp'
import pinLeftImage from './assets/kiven-pin-left.webp'
import pinRightImage from './assets/kiven-pin-right.webp'
import './App.css'

const StarPin = ({ tone }: { tone: 'lavender' | 'sun' }) => {
  const src = tone === 'lavender' ? pinLeftImage : pinRightImage
  const alt = tone === 'lavender' ? 'Метка услуги' : 'Метка исполнительницы'

  return <img className="card-pin" src={src} alt={alt} />
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
