import trashIcon from '../assets/trash-icon.webp'
import lockClosedIcon from '../assets/lock-closed.webp'
import {
  BadgeCheck,
  Calendar,
  Car,
  ChatLines,
  Coins,
  Community,
  DotsGrid3x3,
  GraphUp,
  HeadsetHelp,
  HomeSimple,
  HomeUser,
  MediaImage,
  Megaphone,
  Medal,
  MessageText,
  MultiplePages,
  Pin,
  ProfileCircle,
  Settings,
  TaskList,
  User,
} from 'iconoir-react'

const PRO_ICON_STROKE = 1.45
const PRO_ICON_STROKE_SOFT = 1.25

export const IconBell = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M6.4 16.2V10a5.6 5.6 0 1 1 11.2 0v6.2l1.6 2H4.8l1.6-2Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M9.8 18.2a2.2 2.2 0 0 0 4.4 0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
)

export const IconHome = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M4 11.4 12 5l8 6.4V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-8.6Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
)

export const IconDashboard = () => (
  <GraphUp strokeWidth={1.9} aria-hidden="true" />
)

export const IconUsers = () => (
  <Community strokeWidth={1.9} aria-hidden="true" />
)

export const IconList = () => (
  <TaskList strokeWidth={1.9} aria-hidden="true" />
)

export const IconCertificate = () => (
  <BadgeCheck strokeWidth={1.9} aria-hidden="true" />
)

export const IconInbox = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M5 6.5h14l-1.6 9.6a2 2 0 0 1-2 1.7H8.6a2 2 0 0 1-2-1.7L5 6.5Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M9.2 12h5.6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
)

export const IconChat = () => (
  <ChatLines strokeWidth={1.9} aria-hidden="true" />
)

export const IconNavHome = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M4.6 11.3 12 5l7.4 6.3v7.1a1.7 1.7 0 0 1-1.7 1.7H13.2v-5.4h-2.6v5.4H6.3a1.7 1.7 0 0 1-1.7-1.7v-7.1Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
  </svg>
)

export const IconNavChat = () => (
  <MessageText strokeWidth={1.9} aria-hidden="true" />
)

export const IconNavRequests = () => (
  <TaskList strokeWidth={1.9} aria-hidden="true" />
)

export const IconNavProfile = () => (
  <User strokeWidth={1.9} aria-hidden="true" />
)

export const IconNavCabinet = () => (
  <DotsGrid3x3 strokeWidth={1.9} aria-hidden="true" />
)

export const IconSupport = () => (
  <HeadsetHelp strokeWidth={1.9} aria-hidden="true" />
)

export const IconEdit = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M5 16.6V19h2.4l9.2-9.2-2.4-2.4L5 16.6Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M13.8 7.2 16.2 4.8a1.7 1.7 0 0 1 2.4 2.4l-2.4 2.4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
)

export const IconFilter = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M4 7h16M4 12h16M4 17h16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <circle cx="9" cy="7" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="15" cy="12" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="12" cy="17" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
  </svg>
)

export const IconUser = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle
      cx="12"
      cy="8.8"
      r="3.2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <path
      d="M6 20c1.6-3 4-4.6 6-4.6s4.4 1.6 6 4.6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
)

export const IconPin = () => (
  <Pin strokeWidth={1.9} aria-hidden="true" />
)

export const IconPrice = () => (
  <Coins strokeWidth={1.9} aria-hidden="true" />
)

export const IconExperience = () => (
  <Medal strokeWidth={1.9} aria-hidden="true" />
)

export const IconHomeMaster = () => (
  <HomeSimple strokeWidth={1.9} aria-hidden="true" />
)

export const IconClientVisit = () => (
  <HomeUser strokeWidth={1.9} aria-hidden="true" />
)

export const IconFormatMaster = () => (
  <HomeSimple strokeWidth={1.9} aria-hidden="true" />
)

export const IconFormatClientVisit = () => (
  <Car strokeWidth={1.9} aria-hidden="true" />
)

export const IconFormatBoth = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M12.8 11.2 16.9 7.8l4.1 3.4V18H18v-2.7h-2.2V18h-3v-6.8Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path
      d="M2.1 16.2h8.2a1.1 1.1 0 0 1 1.1 1.1V18H1v-.7a1.1 1.1 0 0 1 1.1-1.1Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path
      d="m3 16.2 1-1.8h4.5l1 1.8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
    <circle
      cx="3.8"
      cy="18.9"
      r="0.9"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    />
    <circle
      cx="8.8"
      cy="18.9"
      r="0.9"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    />
  </svg>
)

export const IconFormat = () => (
  <IconFormatBoth />
)

export const IconClock = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle
      cx="12"
      cy="12"
      r="8.2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <path
      d="M12 7.8v4.6l3.4 1.8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const IconCalendar = () => (
  <Calendar strokeWidth={1.9} aria-hidden="true" />
)

export const IconRadius = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle
      cx="12"
      cy="12"
      r="6.8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
  </svg>
)

export const IconRefresh = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M19.6 12a7.6 7.6 0 1 1-2.6-5.8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M19.6 6.2v4.4h-4.4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const IconPhoto = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect
      x="4"
      y="5.2"
      width="16"
      height="13.6"
      rx="2.4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    />
    <circle
      cx="9"
      cy="10"
      r="1.6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    />
    <path
      d="m6.8 17 4.2-4 2.6 2.4 3.6-3.4 1.8 1.8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
  </svg>
)

export const IconShowcase = () => (
  <MediaImage strokeWidth={1.9} aria-hidden="true" />
)

export const IconStories = () => (
  <MultiplePages strokeWidth={1.9} aria-hidden="true" />
)

export const IconMegaphone = () => (
  <Megaphone strokeWidth={1.9} aria-hidden="true" />
)

export const IconCity = () => (
  <Pin strokeWidth={1.9} aria-hidden="true" />
)

export const IconDistrict = () => (
  <Pin strokeWidth={1.9} aria-hidden="true" />
)

export const IconSettings = () => (
  <Settings strokeWidth={1.9} aria-hidden="true" />
)

export const IconProfileAbout = () => (
  <ProfileCircle strokeWidth={1.9} aria-hidden="true" />
)

export const IconSchedule = () => (
  <Calendar strokeWidth={1.9} aria-hidden="true" />
)

export const IconServices = () => (
  <TaskList strokeWidth={1.9} aria-hidden="true" />
)

export const IconAddress = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M4 11.4 12 5l8 6.4V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-8.6Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
)

export const IconStar = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="m12 4.4 2.4 4.8 5.3.8-3.9 3.8.9 5.3-4.7-2.5-4.7 2.5.9-5.3-3.9-3.8 5.3-.8L12 4.4Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
)

export const IconCheck = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M5.5 12.6 10 17l8.5-9"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const IconSwap = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M7 7h10l-2.6-2.6M17 17H7l2.6 2.6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const IconClose = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M6 6l12 12M18 6l-12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
)

export const IconChevron = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M6 9l6 6 6-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const IconTrash = () => <img src={trashIcon} alt="" aria-hidden="true" />

export const IconLock = () => (
  <img src={lockClosedIcon} alt="" aria-hidden="true" />
)

export const IconUnlock = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect
      x="6"
      y="11"
      width="12"
      height="8"
      rx="2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <path
      d="M9 11V8a3.5 3.5 0 0 1 6.6-1.6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
)

export const IconProPhoto = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect
      x="4.4"
      y="5.4"
      width="15.2"
      height="13.2"
      rx="2.8"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE}
    />
    <circle
      cx="9.3"
      cy="10"
      r="1.75"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE}
    />
    <path
      d="m6.8 16 3.6-3.5 2.4 2.2 3.6-3.2 1.8 1.8"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M15.8 8h2.1M16.85 6.95v2.1"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE_SOFT}
      strokeLinecap="round"
    />
  </svg>
)

export const IconProProfileAbout = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle
      cx="12"
      cy="8"
      r="3"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE}
    />
    <path
      d="M6.2 18.4c1.5-2.8 3.6-4.3 5.8-4.3s4.3 1.5 5.8 4.3"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE}
      strokeLinecap="round"
    />
    <path
      d="m16.8 6.1 1 1 2-2"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE_SOFT}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const IconProLocation = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M12 20c-3.3-3.8-5-6.5-5-9.1a5 5 0 1 1 10 0c0 2.6-1.7 5.3-5 9.1Z"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE}
      strokeLinejoin="round"
    />
    <circle
      cx="12"
      cy="10.8"
      r="1.9"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE}
    />
    <path
      d="M9 16.9h6"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE_SOFT}
      strokeLinecap="round"
    />
  </svg>
)

export const IconProSchedule = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect
      x="4.3"
      y="6.3"
      width="15.4"
      height="12.8"
      rx="2.9"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE}
    />
    <path
      d="M8 4.7v2.7M16 4.7v2.7M4.3 10.1h15.4"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE}
      strokeLinecap="round"
    />
    <circle
      cx="12"
      cy="14.8"
      r="2.8"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE_SOFT}
    />
    <path
      d="M12 13.6v1.4l1.2.8"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE_SOFT}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const IconProPrice = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <ellipse
      cx="12"
      cy="7.1"
      rx="4.9"
      ry="2.2"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE}
    />
    <path
      d="M7.1 7.1v4.2c0 1.2 2.2 2.2 4.9 2.2s4.9-1 4.9-2.2V7.1"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE}
      strokeLinejoin="round"
    />
    <path
      d="M7.1 11.3c0 1.2 2.2 2.2 4.9 2.2s4.9-1 4.9-2.2"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE_SOFT}
      strokeLinecap="round"
    />
    <path
      d="M8.6 15.8c.8.5 2 .9 3.4 1M15.5 15.8c-.3.2-.6.3-.9.4"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE_SOFT}
      strokeLinecap="round"
    />
  </svg>
)

export const IconProExperience = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle
      cx="12"
      cy="8.9"
      r="4.1"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE}
    />
    <path
      d="m10 15.2-1.2 3.6 3.2-1.7 3.2 1.7-1.2-3.6"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="m10.4 8.9 1.2 1.2 2.3-2.3"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE_SOFT}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const IconProServices = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect
      x="4.6"
      y="5"
      width="14.8"
      height="14"
      rx="2.7"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE}
    />
    <path
      d="m7.2 9.1.9.9 1.4-1.4M10.8 9.3h5.1M7.2 12.7l.9.9 1.4-1.4M10.8 12.9h5.1M7.2 16.2l.9.9 1.4-1.4M10.8 16.4h3.3"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE_SOFT}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const IconProCertificate = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle
      cx="12"
      cy="9.1"
      r="4.4"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE}
    />
    <path
      d="m10 14.8-1 3.4 3-1.6 3 1.6-1-3.4"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="m10.4 9.2 1.2 1.2 2.2-2.2"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE_SOFT}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const IconProSettings = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle
      cx="12"
      cy="12"
      r="4.9"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE}
    />
    <circle
      cx="12"
      cy="12"
      r="2.1"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE_SOFT}
    />
    <path
      d="M12 4.5v2M12 17.5v2M4.5 12h2M17.5 12h2M6.8 6.8l1.4 1.4M15.8 15.8l1.4 1.4M6.8 17.2l1.4-1.4M15.8 8.2l1.4-1.4"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE_SOFT}
      strokeLinecap="round"
    />
  </svg>
)

export const IconProFormatMaster = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M4.8 11.2 12 5.4l7.2 5.8V19a1.5 1.5 0 0 1-1.5 1.5h-3.9v-5h-3.6v5H6.3A1.5 1.5 0 0 1 4.8 19v-7.8Z"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE}
      strokeLinejoin="round"
    />
    <path
      d="M9 11.8h1.8"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE_SOFT}
      strokeLinecap="round"
    />
  </svg>
)

export const IconProHomeMaster = () => (
  <IconProFormatMaster />
)

export const IconProClientVisit = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M3.9 14.3h9.5a1.3 1.3 0 0 1 1.2.8l.7 1.5H3.2l.7-1.5a1.3 1.3 0 0 1 1.2-.8Z"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE}
      strokeLinejoin="round"
    />
    <path
      d="m5 14.3 1.1-2h5.1l1.1 2"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle
      cx="5.8"
      cy="17.5"
      r="0.9"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE_SOFT}
    />
    <circle
      cx="11.5"
      cy="17.5"
      r="0.9"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE_SOFT}
    />
    <path
      d="m16.2 5.2 4.6-1.4-2 4.4-1-1-1.8 1.9"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE_SOFT}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const IconProFormatClientVisit = () => (
  <IconProClientVisit />
)

export const IconProFormatBoth = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M12.7 11.2 16.7 8l4 3.2V18h-2.9v-2.6h-2.1V18h-3v-6.8Z"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE}
      strokeLinejoin="round"
    />
    <path
      d="M2.3 16.1h8.2a1 1 0 0 1 1 1V18H1.3v-.9a1 1 0 0 1 1-1Z"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE}
      strokeLinejoin="round"
    />
    <path
      d="m3.1 16.1 1-1.7h4.4l1 1.7"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle
      cx="3.9"
      cy="18.8"
      r="0.8"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE_SOFT}
    />
    <circle
      cx="8.7"
      cy="18.8"
      r="0.8"
      fill="none"
      stroke="currentColor"
      strokeWidth={PRO_ICON_STROKE_SOFT}
    />
  </svg>
)
