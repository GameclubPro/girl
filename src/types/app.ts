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

export type Role = 'client' | 'pro'

export type ProfileStatus = 'draft' | 'ready' | 'complete'

export type ProProfileSection =
  | 'basic'
  | 'media'
  | 'services'
  | 'location'
  | 'availability'
  | 'portfolio'

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
  avatarUrl?: string | null
  coverUrl?: string | null
  isActive?: boolean
  scheduleDays?: string[]
  scheduleStart?: string | null
  scheduleEnd?: string | null
  updatedAt?: string | null
  reviewsCount?: number | null
  reviewsAverage?: number | null
  distanceKm?: number | null
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

export type ServiceRequest = {
  id: number
  userId: string
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
  budget?: string | null
  details?: string | null
  photoUrls: string[]
  status: 'open' | 'closed'
  createdAt: string
  responsesCount?: number
  distanceKm?: number | null
}

export type BookingStatus =
  | 'pending'
  | 'price_pending'
  | 'price_proposed'
  | 'confirmed'
  | 'declined'
  | 'cancelled'

export type Booking = {
  id: number
  clientId: string
  masterId: string
  masterName?: string | null
  masterAvatarUrl?: string | null
  clientName?: string | null
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
  status: BookingStatus
  photoUrls: string[]
  comment?: string | null
  createdAt: string
  distanceKm?: number | null
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
  status: 'sent' | 'accepted' | 'rejected' | 'expired'
  createdAt: string
}
