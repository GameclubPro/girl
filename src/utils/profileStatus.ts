import type { MasterProfile, ProfileStatus } from '../types/app'

export type ProfileStatusSummary = {
  profileStatus: ProfileStatus
  missingFields: string[]
  completeness: number
  isFilterReady: boolean
  isResponseReady: boolean
}

const hasText = (value?: string | null) =>
  typeof value === 'string' && value.trim().length > 0

const toNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

export const getProfileStatusSummary = (
  profile?: Partial<MasterProfile> | null
): ProfileStatusSummary => {
  const safeProfile = profile ?? {}
  const displayName = hasText(safeProfile.displayName)
  const categories = Array.isArray(safeProfile.categories)
    ? safeProfile.categories.filter(Boolean)
    : []
  const worksAtClient = Boolean(safeProfile.worksAtClient)
  const worksAtMaster = Boolean(safeProfile.worksAtMaster)
  const parsedCityId = toNumber(safeProfile.cityId)
  const parsedDistrictId = toNumber(safeProfile.districtId)
  const hasCity =
    parsedCityId !== null && Number.isInteger(parsedCityId) && parsedCityId > 0
  const hasDistrict =
    parsedDistrictId !== null &&
    Number.isInteger(parsedDistrictId) &&
    parsedDistrictId > 0
  const hasLocation = hasCity && hasDistrict

  const missingFields: string[] = []
  if (!displayName) missingFields.push('displayName')
  if (categories.length === 0) missingFields.push('categories')
  if (!worksAtClient && !worksAtMaster) missingFields.push('workFormat')
  if (!hasCity) missingFields.push('cityId')
  if (!hasDistrict) missingFields.push('districtId')

  const hasAbout = hasText(safeProfile.about) || toNumber(safeProfile.experienceYears) !== null
  const hasPrice = toNumber(safeProfile.priceFrom) !== null || toNumber(safeProfile.priceTo) !== null
  const hasServices = Array.isArray(safeProfile.services) && safeProfile.services.length > 0
  const hasPortfolio =
    Array.isArray(safeProfile.portfolioUrls) && safeProfile.portfolioUrls.length > 0

  const checklist = [
    displayName,
    categories.length > 0,
    worksAtClient || worksAtMaster,
    hasLocation,
    hasAbout,
    hasPrice,
    hasServices,
    hasPortfolio,
  ]
  const completed = checklist.filter(Boolean).length
  const completeness = Math.round((completed / checklist.length) * 100)
  const profileStatus: ProfileStatus =
    missingFields.length === 0
      ? completeness === 100
        ? 'complete'
        : 'ready'
      : 'draft'

  const isFilterReady = categories.length > 0 && (worksAtClient || worksAtMaster) && hasLocation
  const isResponseReady = isFilterReady && displayName

  return {
    profileStatus,
    missingFields,
    completeness,
    isFilterReady,
    isResponseReady,
  }
}
