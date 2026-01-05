import { ProBottomNav } from '../components/ProBottomNav'
import type { ProProfileSection } from '../types/app'

type ProCabinetScreenProps = {
  onEditProfile: (section?: ProProfileSection) => void
  onViewRequests: () => void
}

export const ProCabinetScreen = ({
  onEditProfile,
  onViewRequests,
}: ProCabinetScreenProps) => (
  <div className="screen screen--pro-cabinet">
    <ProBottomNav
      active="cabinet"
      onCabinet={() => {}}
      onRequests={onViewRequests}
      onProfile={() => onEditProfile()}
    />
  </div>
)
