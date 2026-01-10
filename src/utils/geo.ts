export type GeoResult = {
  lat: number
  lng: number
  accuracy: number
}

export type GeoFailureCode =
  | 'unsupported'
  | 'permission_denied'
  | 'position_unavailable'
  | 'timeout'
  | 'low_accuracy'
  | 'unknown'

export type GeoFailure = {
  code: GeoFailureCode
  accuracy?: number
}

export type GeoRequestOptions = {
  minAccuracy?: number
  maxAccuracy?: number
  maxWaitMs?: number
  timeoutMs?: number
}

const defaultOptions: Required<GeoRequestOptions> = {
  minAccuracy: 100,
  maxAccuracy: 1500,
  maxWaitMs: 20000,
  timeoutMs: 12000,
}

const pickBetter = (
  current: GeolocationPosition | null,
  next: GeolocationPosition
) => {
  if (!current) return next
  return next.coords.accuracy < current.coords.accuracy ? next : current
}

const toFailure = (code: GeoFailureCode, accuracy?: number): GeoFailure => ({
  code,
  accuracy,
})

export const isGeoFailure = (value: unknown): value is GeoFailure => {
  if (!value || typeof value !== 'object') return false
  const record = value as { code?: string }
  return (
    record.code === 'unsupported' ||
    record.code === 'permission_denied' ||
    record.code === 'position_unavailable' ||
    record.code === 'timeout' ||
    record.code === 'low_accuracy' ||
    record.code === 'unknown'
  )
}

export const requestPreciseLocation = (
  options: GeoRequestOptions = {}
): Promise<GeoResult> => {
  if (!navigator.geolocation) {
    return Promise.reject(toFailure('unsupported'))
  }

  const config = { ...defaultOptions, ...options }

  return new Promise((resolve, reject) => {
    let best: GeolocationPosition | null = null
    let done = false
    let watchId: number | null = null
    let timeoutId: number | null = null

    const cleanup = () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId)
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
    }

    const finishSuccess = (position: GeolocationPosition) => {
      if (done) return
      done = true
      cleanup()
      resolve({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
      })
    }

    const finishError = (code: GeoFailureCode, accuracy?: number) => {
      if (done) return
      done = true
      cleanup()
      reject(toFailure(code, accuracy))
    }

    const handleSuccess = (position: GeolocationPosition) => {
      if (done) return
      best = pickBetter(best, position)
      if (position.coords.accuracy <= config.minAccuracy) {
        finishSuccess(position)
      }
    }

    const handleError = (error: GeolocationPositionError) => {
      if (done) return
      if (error.code === error.PERMISSION_DENIED) {
        finishError('permission_denied')
        return
      }
      if (error.code === error.POSITION_UNAVAILABLE) {
        finishError('position_unavailable')
        return
      }
      if (error.code === error.TIMEOUT) {
        finishError('timeout')
        return
      }
      finishError('unknown')
    }

    const geoOptions: PositionOptions = {
      enableHighAccuracy: true,
      timeout: config.timeoutMs,
      maximumAge: 0,
    }

    if (typeof navigator.geolocation.watchPosition === 'function') {
      watchId = navigator.geolocation.watchPosition(
        handleSuccess,
        handleError,
        geoOptions
      )
    } else {
      navigator.geolocation.getCurrentPosition(
        handleSuccess,
        handleError,
        geoOptions
      )
    }

    timeoutId = window.setTimeout(() => {
      if (done) return
      if (!best) {
        finishError('timeout')
        return
      }
      if (best.coords.accuracy <= config.maxAccuracy) {
        finishSuccess(best)
        return
      }
      finishError('low_accuracy', best.coords.accuracy)
    }, config.maxWaitMs)
  })
}
