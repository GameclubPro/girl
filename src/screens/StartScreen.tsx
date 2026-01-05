import decorImage from '../assets/kiven-decor.webp'
import logoImage from '../assets/kiven-logo.webp'
import girlsImage from '../assets/kiven-girls.webp'
import { StarPin } from '../components/StarPin'
import type { Role } from '../types/app'

export const StartScreen = ({
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
        <p className="subtitle">
          <span className="subtitle-intro">Услуги</span>
          <span className="subtitle-stack">
            <span className="subtitle-strong">ДЕВУШЕК</span>
            <span className="subtitle-middle-row">
              <span className="subtitle-accent">от</span>
              <span className="subtitle-accent">для</span>
            </span>
            <span className="subtitle-strong">ДЕВУШЕК</span>
          </span>
        </p>
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
          <span>Я Мастер</span>
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
