import { IconNavChat, IconNavHome, IconNavProfile, IconNavRequests } from './icons'

type ClientNavKey = 'home' | 'chats' | 'requests' | 'profile'

type ClientBottomNavProps = {
  active: ClientNavKey
  onHome: () => void
  onChats: () => void
  onRequests: () => void
  onProfile: () => void
  allowActiveClick?: boolean
}

export const ClientBottomNav = ({
  active,
  onHome,
  onChats,
  onRequests,
  onProfile,
  allowActiveClick = false,
}: ClientBottomNavProps) => {
  const handleClick = (key: ClientNavKey, action: () => void) => () => {
    if (active === key && !allowActiveClick) return
    action()
  }

  return (
    <nav className="bottom-nav" aria-label="Навигация">
      <button
        className={`nav-item${active === 'home' ? ' is-active' : ''}`}
        type="button"
        onClick={handleClick('home', onHome)}
        aria-current={active === 'home' ? 'page' : undefined}
      >
        <span className="nav-icon" aria-hidden="true">
          <IconNavHome />
        </span>
        <span className="nav-label">Главная</span>
      </button>
      <button
        className={`nav-item${active === 'chats' ? ' is-active' : ''}`}
        type="button"
        onClick={handleClick('chats', onChats)}
        aria-current={active === 'chats' ? 'page' : undefined}
      >
        <span className="nav-icon" aria-hidden="true">
          <IconNavChat />
        </span>
        <span className="nav-label">Чаты</span>
      </button>
      <button
        className={`nav-item${active === 'requests' ? ' is-active' : ''}`}
        type="button"
        onClick={handleClick('requests', onRequests)}
        aria-current={active === 'requests' ? 'page' : undefined}
      >
        <span className="nav-icon" aria-hidden="true">
          <IconNavRequests />
        </span>
        <span className="nav-label">Заявки</span>
      </button>
      <button
        className={`nav-item${active === 'profile' ? ' is-active' : ''}`}
        type="button"
        onClick={handleClick('profile', onProfile)}
        aria-current={active === 'profile' ? 'page' : undefined}
      >
        <span className="nav-icon" aria-hidden="true">
          <IconNavProfile />
        </span>
        <span className="nav-label">Профиль</span>
      </button>
    </nav>
  )
}
