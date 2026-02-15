import brandHeroImage from '../assets/start-logo.webp'
import girlOneImage from '../assets/kiven-girl-1.webp'
import girlTwoImage from '../assets/kiven-girl-2.webp'
import footerLeftImage from '../assets/start-footer-left.webp'
import footerRightImage from '../assets/start-footer-right.webp'
import type { Role } from '../types/app'
import { useNavPreload } from '../contexts/NavPreloadContext'
import { hapticSelection } from '../utils/haptics'

export const StartScreen = ({
  onRoleSelect,
  isSubmittingRole = false,
  accountCtaLabel,
  accountCtaHint = '',
  isAccountCtaDisabled = false,
  isAccountCtaPending = false,
  onAccountCtaClick,
}: {
  onRoleSelect: (role: Role) => Promise<void> | void
  isSubmittingRole?: boolean
  accountCtaLabel: string
  accountCtaHint?: string
  isAccountCtaDisabled?: boolean
  isAccountCtaPending?: boolean
  onAccountCtaClick: () => void
}) => {
  const preload = useNavPreload()

  const handleAccountCtaClick = () => {
    if (isSubmittingRole || isAccountCtaDisabled || isAccountCtaPending) return
    hapticSelection()
    onAccountCtaClick()
  }

  return (
    <div className="screen screen--start">
      <main className="content">
        <div className="title-block animate delay-1">
          <img
            className="brand-hero"
            src={brandHeroImage}
            alt="BEAUTERA"
            loading="eager"
            decoding="async"
          />
          <span className="brand-title">BEAUTERA</span>
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
            aria-label="Я Клиент"
            disabled={isSubmittingRole}
            onPointerDown={() => preload?.('address')}
            onClick={() => {
              if (isSubmittingRole) return
              hapticSelection()
              onRoleSelect('client')
            }}
          >
            <span className="role-card__inner">
              <span className="role-card__title">Я Клиент</span>
            </span>
          </button>
          <button
            className="role-card role-card--pro"
            type="button"
            aria-label="Я Мастер"
            disabled={isSubmittingRole}
            onPointerDown={() => preload?.('pro-profile')}
            onClick={() => {
              if (isSubmittingRole) return
              hapticSelection()
              onRoleSelect('pro')
            }}
          >
            <span className="role-card__inner">
              <span className="role-card__title">Я Мастер</span>
            </span>
          </button>
        </div>

        <div className="start-account-cta animate delay-5">
          <button
            className="start-account-cta__button"
            type="button"
            disabled={isSubmittingRole || isAccountCtaDisabled || isAccountCtaPending}
            onClick={handleAccountCtaClick}
          >
            {isAccountCtaPending ? 'Авторизуем...' : accountCtaLabel}
          </button>
          {accountCtaHint ? <p className="start-account-cta__hint">{accountCtaHint}</p> : null}
        </div>

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
