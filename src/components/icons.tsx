import trashIcon from '../assets/trash-icon.webp'
import lockClosedIcon from '../assets/lock-closed.webp'
import {
  BadgeCheck,
  Calendar,
  ChatLines,
  Coins,
  Community,
  DotsGrid3x3,
  GraphUp,
  HeadsetHelp,
  Home,
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

export const IconFormat = () => (
  <Home strokeWidth={1.9} aria-hidden="true" />
)

export const IconHomeMaster = () => (
  <HomeSimple strokeWidth={1.9} aria-hidden="true" />
)

export const IconClientVisit = () => (
  <HomeUser strokeWidth={1.9} aria-hidden="true" />
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
