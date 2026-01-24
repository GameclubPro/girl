export type City = {
  id: number
  name: string
}

export type District = {
  id: number
  cityId: number
  name: string
}

export type UserLocation = {
  lat: number
  lng: number
  accuracy?: number | null
  updatedAt?: string | null
  shareToClients?: boolean
  shareToMasters?: boolean
}

export type TrustReason = {
  eventType: string
  count: number
  value: number
  lastAt?: string | null
}

export type ClientTrust = {
  score: number
  confidence: number
  level?: string | null
  updatedAt?: string | null
  reasons?: {
    positive: TrustReason[]
    negative: TrustReason[]
  } | null
}

export type Role = 'client' | 'pro'

export type ProfileStatus = 'draft' | 'ready' | 'complete'

export type ProProfileSection =
  | 'basic'
  | 'media'
  | 'services'
  | 'location'
  | 'availability'
  | 'policies'
  | 'certificates'
  | 'portfolio'

export type MasterCertificate = {
  id: string
  title?: string | null
  issuer?: string | null
  year?: number | null
  url?: string | null
  verifyUrl?: string | null
}

export type MasterProfile = {
  userId: string
  displayName: string
  about?: string | null
  cityId?: number | null
  districtId?: number | null
  cityName?: string | null
  districtName?: string | null
  experienceYears?: number | null
  priceFrom?: number | null
  priceTo?: number | null
  worksAtClient: boolean
  worksAtMaster: boolean
  categories: string[]
  services: string[]
  portfolioUrls: string[]
  showcaseUrls?: string[]
  certificates?: MasterCertificate[]
  avatarUrl?: string | null
  hasAvatar?: boolean
  coverUrl?: string | null
  isActive?: boolean
  scheduleDays?: string[]
  scheduleStart?: string | null
  scheduleEnd?: string | null
  cancelWindowHours?: number | null
  depositPercent?: number | null
  depositType?: 'none' | 'percent' | 'fixed' | null
  depositFixed?: number | null
  depositDetails?: string | null
  depositQrUrl?: string | null
  lateCancelFeePercent?: number | null
  updatedAt?: string | null
  reviewsCount?: number | null
  reviewsAverage?: number | null
  distanceKm?: number | null
  followersCount?: number | null
}

export type StoryItem = {
  id: number
  mediaUrl: string | null
  mediaType: 'image' | 'video'
  caption?: string | null
  createdAt: string
  expiresAt: string
  isSeen?: boolean
  viewsCount?: number
}

export type StoryGroup = {
  masterId: string
  masterName: string
  masterAvatarUrl?: string | null
  categories?: string[]
  updatedAt?: string | null
  latestStoryAt?: string | null
  unseenCount?: number
  hasUnseen?: boolean
  items: StoryItem[]
}

export type MasterReview = {
  id: number
  rating: number
  comment?: string | null
  serviceName?: string | null
  reviewerFirstName?: string | null
  reviewerLastName?: string | null
  reviewerUsername?: string | null
  createdAt: string
}

export type MasterReviewSummary = {
  count: number
  average: number
  distribution: { rating: number; count: number }[]
}

export type RequestTimeWindow = {
  date: string
  start: string
  end: string
  label?: string | null
  exact?: boolean | null
}

export type ServiceRequest = {
  id: number
  userId: string
  clientName?: string | null
  clientTrust?: ClientTrust | null
  cityId: number | null
  districtId: number | null
  cityName?: string | null
  districtName?: string | null
  address?: string | null
  categoryId: string
  serviceName: string
  tags: string[]
  locationType: 'client' | 'master' | 'any'
  dateOption: 'today' | 'tomorrow' | 'choose'
  dateTime?: string | null
  timeWindows?: RequestTimeWindow[] | null
  budget?: string | null
  details?: string | null
  photoUrls: string[]
  status: 'open' | 'closed'
  createdAt: string
  responsesCount?: number
  distanceKm?: number | null
  dispatchedCount?: number | null
  dispatchBatch?: number | null
  dispatchExpiresAt?: string | null
  dispatchStatus?: string | null
  dispatchSentAt?: string | null
  leadScore?: number | null
  leadReasons?: string[] | null
  leadScoreVariant?: string | null
  responsePreview?: {
    masterId: string
    displayName?: string | null
    avatarUrl?: string | null
  }[]
  chatId?: number | null
}

export type BookingStatus =
  | 'pending'
  | 'price_pending'
  | 'price_proposed'
  | 'confirmed'
  | 'declined'
  | 'cancelled'

export type DepositStatus =
  | 'not_required'
  | 'pending'
  | 'submitted'
  | 'confirmed'
  | 'rejected'
  | 'expired'

export type Booking = {
  id: number
  clientId: string
  masterId: string
  masterName?: string | null
  masterAvatarUrl?: string | null
  clientName?: string | null
  clientTrust?: ClientTrust | null
  categoryId: string
  serviceName: string
  servicePrice?: number | null
  proposedPrice?: number | null
  serviceDuration?: number | null
  locationType: 'client' | 'master'
  cityId: number | null
  districtId: number | null
  cityName?: string | null
  districtName?: string | null
  address?: string | null
  scheduledAt: string
  cancelWindowHours?: number | null
  depositPercent?: number | null
  depositAmount?: number | null
  depositStatus?: DepositStatus | null
  depositHoldExpiresAt?: string | null
  depositPaidAt?: string | null
  depositProofUrl?: string | null
  depositDetails?: string | null
  depositQrUrl?: string | null
  lateCancelFeePercent?: number | null
  status: BookingStatus
  outcome?: string | null
  attendanceAt?: string | null
  lateMinutes?: number | null
  outcomePromptedAt?: string | null
  chatId?: number | null
  photoUrls: string[]
  comment?: string | null
  createdAt: string
  updatedAt?: string | null
  distanceKm?: number | null
  reviewId?: number | null
}

export type RequestResponse = {
  id: number
  requestId: number
  masterId: string
  displayName?: string | null
  experienceYears?: number | null
  priceFrom?: number | null
  priceTo?: number | null
  price?: number | null
  comment?: string | null
  proposedTime?: string | null
  proposedSlotAt?: string | null
  holdExpiresAt?: string | null
  status: 'sent' | 'accepted' | 'rejected' | 'expired'
  createdAt: string
  avatarUrl?: string | null
  reviewsAverage?: number | null
  reviewsCount?: number | null
  previewUrls?: string[]
  chatId?: number | null
}

export type ChatContextType = 'request' | 'booking' | 'support'

export type ChatMessage = {
  id: number
  chatId: number
  senderId?: string | null
  type:
    | 'text'
    | 'image'
    | 'system'
    | 'offer_price'
    | 'offer_time'
    | 'offer_location'
  body?: string | null
  meta?: Record<string, unknown> | null
  attachmentUrl?: string | null
  createdAt: string
}

export type ChatContextSummary = {
  contextType: Exclude<ChatContextType, 'support'>
  contextId: number
  serviceName?: string | null
  status?: string | null
  createdAt?: string | null
  dateOption?: ServiceRequest['dateOption']
  dateTime?: string | null
  timeWindows?: RequestTimeWindow[] | null
  locationType?: ServiceRequest['locationType']
  scheduledAt?: string | null
  serviceDuration?: number | null
  servicePrice?: number | null
  outcome?: string | null
  lateMinutes?: number | null
}

export type ChatSummary = {
  id: number
  contextType: ChatContextType
  contextId: number
  requestId?: number | null
  bookingId?: number | null
  status: string
  unreadCount: number
  lastReadMessageId?: number | null
  lastMessage?: {
    id: number
    senderId?: string | null
    type: ChatMessage['type']
    body?: string | null
    createdAt?: string | null
    attachmentUrl?: string | null
  } | null
  counterpart: {
    id: string
    role: 'client' | 'master'
    name: string
    avatarUrl?: string | null
    trust?: ClientTrust | null
  }
  request?: {
    id: number
    serviceName?: string | null
    categoryId?: string | null
    locationType?: ServiceRequest['locationType']
    dateOption?: ServiceRequest['dateOption']
    dateTime?: string | null
    timeWindows?: RequestTimeWindow[] | null
    status?: string | null
    createdAt?: string | null
  } | null
  booking?: {
    id: number
    serviceName?: string | null
    categoryId?: string | null
    status?: string | null
    scheduledAt?: string | null
    serviceDuration?: number | null
    servicePrice?: number | null
    outcome?: string | null
    lateMinutes?: number | null
    createdAt?: string | null
  } | null
  contexts?: ChatContextSummary[]
}

export type ChatDetail = {
  chat: {
    id: number
    contextType: ChatContextType
    contextId: number
    requestId?: number | null
    bookingId?: number | null
    status: string
    lastMessageId?: number | null
    lastMessageAt?: string | null
    memberRole?: 'client' | 'master'
    unreadCount?: number | null
    lastReadMessageId?: number | null
    counterpartLastReadMessageId?: number | null
  }
  counterpart: {
    id: string
    role: 'client' | 'master'
    name: string
    avatarUrl?: string | null
    trust?: ClientTrust | null
  }
  request?: {
    id: number
    serviceName?: string | null
    categoryId?: string | null
    locationType?: ServiceRequest['locationType']
    dateOption?: ServiceRequest['dateOption']
    dateTime?: string | null
    timeWindows?: RequestTimeWindow[] | null
    budget?: string | null
    details?: string | null
    photoUrls?: string[]
    status?: string | null
    createdAt?: string | null
  } | null
  booking?: {
    id: number
    serviceName?: string | null
    categoryId?: string | null
    locationType?: ServiceRequest['locationType']
    scheduledAt?: string | null
    serviceDuration?: number | null
    servicePrice?: number | null
    status?: string | null
    outcome?: string | null
    lateMinutes?: number | null
    attendanceAt?: string | null
    createdAt?: string | null
  } | null
  contexts?: ChatContextSummary[]
}
