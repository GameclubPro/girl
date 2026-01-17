import decorImage from '../assets/kiven-decor.webp'
import logoImage from '../assets/kiven-logo.webp'
import girlOneImage from '../assets/kiven-girl-1.webp'
import girlTwoImage from '../assets/kiven-girl-2.webp'
import clientRoleImage from '../../1.webp'
import proRoleImage from '../../2.webp'
import type { Role } from '../types/app'

export const StartScreen = ({
  onRoleSelect,
}: {
  onRoleSelect: (role: Role) => void
}) => (
  <div className="screen screen--start">
    <main className="content">
      <div className="title-block animate delay-1">
        <img className="brand-logo" src={logoImage} alt="KIVEN GIRL" />
        <h1>KIVEN GIRL</h1>
        <p className="subtitle">
          <span className="subtitle-intro">Услуги</span>
          <span className="subtitle-layout">
            <span className="subtitle-strong subtitle-side--left">ДЕВУШЕК</span>
            <span className="subtitle-accent subtitle-side subtitle-top">от</span>
            <span className="subtitle-accent subtitle-side subtitle-bottom">
              для
            </span>
            <span className="subtitle-strong subtitle-side--right">ДЕВУШЕК</span>
          </span>
        </p>
      </div>

      <h2 className="animate delay-2">Какая роль вам подходит?</h2>

      <div className="illustration-wrap animate delay-3">
        <div className="illustration-stack" aria-hidden="true">
          <img
            className="illustration illustration--left"
            src={girlOneImage}
            alt=""
            loading="lazy"
          />
          <img
            className="illustration illustration--right"
            src={girlTwoImage}
            alt=""
            loading="lazy"
          />
        </div>
      </div>

      <div className="role-cards animate delay-4">
        <button
          className="role-card role-card--client"
          type="button"
          onClick={() => onRoleSelect('client')}
        >
          <img
            className="role-card__image"
            src={clientRoleImage}
            alt=""
            aria-hidden="true"
          />
          <span className="role-card__label">Мне нужна услуга</span>
        </button>
        <button
          className="role-card role-card--pro"
          type="button"
          onClick={() => onRoleSelect('pro')}
        >
          <img
            className="role-card__image"
            src={proRoleImage}
            alt=""
            aria-hidden="true"
          />
          <span className="role-card__label">Я Мастер</span>
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
