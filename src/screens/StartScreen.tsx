import brandHeroImage from '../assets/start-logo.webp'
import girlOneImage from '../assets/kiven-girl-1.webp'
import girlTwoImage from '../assets/kiven-girl-2.webp'
import clientRoleImage from '../assets/start-role-client-new.webp'
import proRoleImage from '../assets/start-role-pro-new.webp'
import footerLeftImage from '../assets/start-footer-left.webp'
import footerRightImage from '../assets/start-footer-right.webp'
import type { Role } from '../types/app'
import { useNavPreload } from '../contexts/NavPreloadContext'

export const StartScreen = ({
  onRoleSelect,
}: {
  onRoleSelect: (role: Role) => void
}) => {
  const preload = useNavPreload()
  return (
    <div className="screen screen--start">
      <main className="content">
        <div className="title-block animate delay-1">
          <img
            className="brand-hero"
            src={brandHeroImage}
            alt="KIVEN GIRL"
            loading="eager"
            decoding="async"
          />
          <p className="subtitle">
            <span className="subtitle-line subtitle-line--wide">
              Создаем новую эру
            </span>
            <span className="subtitle-line subtitle-line--wide">
              красоты вместе
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
            aria-label="Мне нужна услуга"
            onPointerDown={() => preload?.('address')}
            onClick={() => onRoleSelect('client')}
          >
            <img
              className="role-card__image"
              src={clientRoleImage}
              alt=""
              aria-hidden="true"
            />
          </button>
          <button
            className="role-card role-card--pro"
            type="button"
            aria-label="Я мастер"
            onPointerDown={() => preload?.('pro-profile')}
            onClick={() => onRoleSelect('pro')}
          >
            <img
              className="role-card__image"
              src={proRoleImage}
              alt=""
              aria-hidden="true"
            />
          </button>
        </div>

        <p className="footer-copy animate delay-5">
          Зарегистрируйтесь как заказчик или мастер
        </p>

        <div className="footer-decor" aria-hidden="true">
          <img
            className="footer-image footer-image--left"
            src={footerLeftImage}
            alt=""
            aria-hidden="true"
          />
          <img
            className="footer-image footer-image--right"
            src={footerRightImage}
            alt=""
            aria-hidden="true"
          />
        </div>
      </main>
    </div>
  )
}
