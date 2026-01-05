export type City = {
  id: number
  name: string
}

export type District = {
  id: number
  cityId: number
  name: string
}

export type Role = 'client' | 'pro'

export type MasterProfile = {
  userId: string
  displayName: string
  about?: string | null
  cityId?: number | null
  districtId?: number | null
  experienceYears?: number | null
  priceFrom?: number | null
  priceTo?: number | null
  worksAtClient: boolean
  worksAtMaster: boolean
  categories: string[]
  services: string[]
  portfolioUrls: string[]
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
