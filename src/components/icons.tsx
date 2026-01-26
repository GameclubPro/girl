import {
  AlbumOpen,
  BadgeCheck,
  Bell,
  Calendar,
  ChatBubble,
  Check,
  City,
  Clock,
  Coins,
  CoinsSwap,
  Community,
  Dashboard,
  EditPencil,
  Filter,
  HeadsetHelp,
  Home,
  HomeSimple,
  HomeUser,
  InfoCircle,
  List,
  Lock,
  LockSlash,
  MailIn,
  Map,
  MapPin,
  Medal,
  MediaImage,
  NavArrowDown,
  Refresh,
  Settings,
  Star,
  TaskList,
  ThreeStars,
  Trash,
  User,
  Xmark,
} from 'iconoir-react'

const baseProps = { strokeWidth: 1.6, 'aria-hidden': true } as const
const softProps = { strokeWidth: 1.4, 'aria-hidden': true } as const

export const IconBell = () => <Bell {...baseProps} />

export const IconHome = () => <Home {...baseProps} />

export const IconDashboard = () => <Dashboard {...baseProps} />

export const IconUsers = () => <Community {...baseProps} />

export const IconList = () => <List {...baseProps} />

export const IconCertificate = () => <BadgeCheck {...baseProps} />

export const IconInbox = () => <MailIn {...baseProps} />

export const IconChat = () => <ChatBubble {...baseProps} />

export const IconSupport = () => <HeadsetHelp {...baseProps} />

export const IconEdit = () => <EditPencil {...baseProps} />

export const IconFilter = () => <Filter {...baseProps} />

export const IconUser = () => <User {...baseProps} />

export const IconPin = () => <MapPin {...baseProps} />

export const IconPrice = () => <Coins {...baseProps} />

export const IconExperience = () => <Medal {...baseProps} />

export const IconFormat = () => <HomeUser {...baseProps} />

export const IconHomeMaster = () => <HomeSimple {...baseProps} />

export const IconClientVisit = () => <MapPin {...baseProps} />

export const IconClock = () => <Clock {...baseProps} />

export const IconCalendar = () => <Calendar {...baseProps} />

export const IconRefresh = () => <Refresh {...baseProps} />

export const IconPhoto = () => <MediaImage {...softProps} />

export const IconShowcase = () => <AlbumOpen {...baseProps} />

export const IconStories = () => <ThreeStars {...baseProps} />

export const IconCity = () => <City {...baseProps} />

export const IconDistrict = () => <Map {...baseProps} />

export const IconSettings = () => <Settings {...baseProps} />

export const IconProfileAbout = () => <InfoCircle {...baseProps} />

export const IconSchedule = () => <Calendar {...baseProps} />

export const IconServices = () => <TaskList {...baseProps} />

export const IconAddress = () => <HomeSimple {...baseProps} />

export const IconStar = () => <Star {...baseProps} />

export const IconCheck = () => <Check {...baseProps} />

export const IconSwap = () => <CoinsSwap {...baseProps} />

export const IconClose = () => <Xmark {...baseProps} />

export const IconChevron = () => <NavArrowDown {...baseProps} />

export const IconTrash = () => <Trash {...baseProps} />

export const IconLock = () => <Lock {...baseProps} />

export const IconUnlock = () => <LockSlash {...baseProps} />
