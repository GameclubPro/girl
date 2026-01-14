import { ProBottomNav } from '../components/ProBottomNav'
import {
  IconBell,
  IconCalendar,
  IconChat,
  IconDashboard,
  IconShowcase,
  IconUsers,
} from '../components/icons'
import type { ProProfileSection } from '../types/app'

type ProCabinetScreenProps = {
  onEditProfile: (section?: ProProfileSection) => void
  onViewRequests: () => void
  onViewChats: () => void
  onOpenAnalytics: () => void
  onOpenClients: () => void
  onOpenCampaigns: () => void
  onOpenReminders: () => void
  onOpenCalendar: () => void
  onOpenShowcase: () => void
}

export const ProCabinetScreen = ({
  onEditProfile,
  onViewRequests,
  onViewChats,
  onOpenAnalytics,
  onOpenClients,
  onOpenCampaigns,
  onOpenReminders,
  onOpenCalendar,
  onOpenShowcase,
}: ProCabinetScreenProps) => {
  return (
    <div className="screen screen--pro screen--pro-cabinet">
      <div className="pro-cabinet-shell pro-cabinet-shell--icons">
        <div className="pro-cabinet-nav-grid">
          <button
            className="pro-cabinet-nav-card is-analytics animate delay-1"
            type="button"
            onClick={onOpenAnalytics}
          >
            <span className="pro-cabinet-nav-icon" aria-hidden="true">
              <IconDashboard />
            </span>
            <span className="pro-cabinet-nav-title">Аналитика</span>
          </button>
          <button
            className="pro-cabinet-nav-card is-calendar animate delay-2"
            type="button"
            onClick={onOpenCalendar}
          >
            <span className="pro-cabinet-nav-icon" aria-hidden="true">
              <IconCalendar />
            </span>
            <span className="pro-cabinet-nav-title">Календарь</span>
          </button>
          <button
            className="pro-cabinet-nav-card is-clients animate delay-3"
            type="button"
            onClick={onOpenClients}
          >
            <span className="pro-cabinet-nav-icon" aria-hidden="true">
              <IconUsers />
            </span>
            <span className="pro-cabinet-nav-title">Клиенты</span>
          </button>
          <button
            className="pro-cabinet-nav-card is-showcase animate delay-4"
            type="button"
            onClick={onOpenShowcase}
          >
            <span className="pro-cabinet-nav-icon" aria-hidden="true">
              <IconShowcase />
            </span>
            <span className="pro-cabinet-nav-title">Витрина</span>
          </button>
          <button
            className="pro-cabinet-nav-card is-campaigns animate delay-5"
            type="button"
            onClick={onOpenCampaigns}
          >
            <span className="pro-cabinet-nav-icon" aria-hidden="true">
              <IconChat />
            </span>
            <span className="pro-cabinet-nav-title">Рассылка</span>
          </button>
          <button
            className="pro-cabinet-nav-card is-reminders animate delay-6"
            type="button"
            onClick={onOpenReminders}
          >
            <span className="pro-cabinet-nav-icon" aria-hidden="true">
              <IconBell />
            </span>
            <span className="pro-cabinet-nav-title">Напоминания</span>
          </button>
        </div>
      </div>

      <ProBottomNav
        active="cabinet"
        onCabinet={() => {}}
        onRequests={onViewRequests}
        onChats={onViewChats}
        onProfile={() => onEditProfile()}
      />
    </div>
  )
}
