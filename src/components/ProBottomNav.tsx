import {
  IconNavCabinet,
  IconNavChat,
  IconNavProfile,
  IconNavRequests,
} from './icons'
import { useNavPreload } from '../contexts/NavPreloadContext'
import { hapticSelection } from '../utils/haptics'

type ProNavKey = 'cabinet' | 'requests' | 'chats' | 'profile'

type ProBottomNavProps = {
  active: ProNavKey
  onCabinet: () => void
  onRequests: () => void
  onChats: () => void
  onProfile: () => void
  allowActiveClick?: boolean
}

export const ProBottomNav = ({
  active,
  onCabinet,
  onRequests,
  onChats,
  onProfile,
  allowActiveClick = false,
}: ProBottomNavProps) => {
  const preload = useNavPreload()
  const handleClick = (key: ProNavKey, action: () => void) => () => {
    if (active === key && !allowActiveClick) return
    hapticSelection()
    action()
  }
  const handlePreload = (key: ProNavKey) => {
    if (!preload) return
    const target =
      key === 'cabinet'
        ? 'pro-cabinet'
        : key === 'requests'
          ? 'pro-requests'
          : key === 'chats'
            ? 'chats'
            : 'pro-profile'
    preload(target)
  }

  return (
    <nav className="pro-bottom-nav" aria-label="Навигация мастера">
      <button
        className={`pro-nav-item${active === 'profile' ? ' is-active' : ''}`}
        type="button"
        onClick={handleClick('profile', onProfile)}
        onPointerDown={() => handlePreload('profile')}
        aria-current={active === 'profile' ? 'page' : undefined}
      >
        <span className="pro-nav-icon" aria-hidden="true">
          <IconNavProfile />
        </span>
        <span className="pro-nav-label">Профиль</span>
      </button>
      <button
        className={`pro-nav-item${active === 'requests' ? ' is-active' : ''}`}
        type="button"
        onClick={handleClick('requests', onRequests)}
        onPointerDown={() => handlePreload('requests')}
        aria-current={active === 'requests' ? 'page' : undefined}
      >
        <span className="pro-nav-icon" aria-hidden="true">
          <IconNavRequests />
        </span>
        <span className="pro-nav-label">Заявки</span>
      </button>
      <button
        className={`pro-nav-item${active === 'chats' ? ' is-active' : ''}`}
        type="button"
        onClick={handleClick('chats', onChats)}
        onPointerDown={() => handlePreload('chats')}
        aria-current={active === 'chats' ? 'page' : undefined}
      >
        <span className="pro-nav-icon" aria-hidden="true">
          <IconNavChat />
        </span>
        <span className="pro-nav-label">Чаты</span>
      </button>
      <button
        className={`pro-nav-item${active === 'cabinet' ? ' is-active' : ''}`}
        type="button"
        onClick={handleClick('cabinet', onCabinet)}
        onPointerDown={() => handlePreload('cabinet')}
        aria-current={active === 'cabinet' ? 'page' : undefined}
      >
        <span className="pro-nav-icon" aria-hidden="true">
          <IconNavCabinet />
        </span>
        <span className="pro-nav-label">Кабинет</span>
      </button>
    </nav>
  )
}
