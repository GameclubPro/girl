import { IconHome, IconList, IconUser } from './icons'

type ProNavKey = 'cabinet' | 'requests' | 'profile'

type ProBottomNavProps = {
  active: ProNavKey
  onCabinet: () => void
  onRequests: () => void
  onProfile: () => void
}

export const ProBottomNav = ({
  active,
  onCabinet,
  onRequests,
  onProfile,
}: ProBottomNavProps) => {
  const handleClick = (key: ProNavKey, action: () => void) => () => {
    if (active === key) return
    action()
  }

  return (
    <nav className="pro-bottom-nav" aria-label="Навигация мастера">
      <button
        className={`pro-nav-item${active === 'cabinet' ? ' is-active' : ''}`}
        type="button"
        onClick={handleClick('cabinet', onCabinet)}
        aria-current={active === 'cabinet' ? 'page' : undefined}
      >
        <span className="pro-nav-icon" aria-hidden="true">
          <IconHome />
        </span>
        Кабинет
      </button>
      <button
        className={`pro-nav-item${active === 'requests' ? ' is-active' : ''}`}
        type="button"
        onClick={handleClick('requests', onRequests)}
        aria-current={active === 'requests' ? 'page' : undefined}
      >
        <span className="pro-nav-icon" aria-hidden="true">
          <IconList />
        </span>
        Заявки
      </button>
      <button
        className={`pro-nav-item${active === 'profile' ? ' is-active' : ''}`}
        type="button"
        onClick={handleClick('profile', onProfile)}
        aria-current={active === 'profile' ? 'page' : undefined}
      >
        <span className="pro-nav-icon" aria-hidden="true">
          <IconUser />
        </span>
        Профиль
      </button>
    </nav>
  )
}
