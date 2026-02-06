import { IconNavChat, IconNavHome, IconNavProfile, IconNavRequests } from './icons'
import { useNavPreload } from '../contexts/NavPreloadContext'
import { hapticSelection } from '../utils/haptics'

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
  const preload = useNavPreload()
  const handleClick = (key: ClientNavKey, action: () => void) => () => {
    if (active === key && !allowActiveClick) return
    hapticSelection()
    action()
  }
  const handlePreload = (key: ClientNavKey) => {
    if (!preload) return
    const target =
      key === 'home'
        ? 'client'
        : key === 'chats'
          ? 'chats'
          : key === 'requests'
            ? 'requests'
            : 'client-profile'
    preload(target)
  }

  return (
    <nav className="bottom-nav" aria-label="Навигация">
      <button
        className={`nav-item${active === 'home' ? ' is-active' : ''}`}
        type="button"
        onClick={handleClick('home', onHome)}
        onPointerDown={() => handlePreload('home')}
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
        onPointerDown={() => handlePreload('chats')}
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
        onPointerDown={() => handlePreload('requests')}
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
        onPointerDown={() => handlePreload('profile')}
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
