export type GeoResult = {
  lat: number
  lng: number
  accuracy: number
  isApproximate: boolean
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
  fallbackAccuracy?: number
  maxWaitMs?: number
  timeoutMs?: number
}

const defaultOptions: Required<GeoRequestOptions> = {
  minAccuracy: 100,
  maxAccuracy: 1500,
  fallbackAccuracy: 20000,
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
    let coarseTimerId: number | null = null
    let lastError: GeolocationPositionError | null = null
    let coarseRequested = false

    const cleanup = () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId)
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
      if (coarseTimerId !== null) {
        window.clearTimeout(coarseTimerId)
      }
    }

    const finishSuccess = (
      position: GeolocationPosition,
      isApproximate: boolean
    ) => {
      if (done) return
      done = true
      cleanup()
      resolve({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        isApproximate,
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
        finishSuccess(position, false)
      }
    }

    const handleError = (error: GeolocationPositionError) => {
      if (done) return
      if (error.code === error.PERMISSION_DENIED) {
        finishError('permission_denied')
        return
      }
      lastError = error
      if (!coarseRequested) {
        requestCoarseLocation()
      }
    }

    const watchOptions: PositionOptions = {
      enableHighAccuracy: true,
      maximumAge: 0,
    }

    const singleOptions: PositionOptions = {
      enableHighAccuracy: true,
      timeout: config.timeoutMs,
      maximumAge: 0,
    }

    const coarseDelayMs = Math.min(
      4000,
      Math.max(1500, Math.round(config.maxWaitMs * 0.2))
    )
    const coarseOptions: PositionOptions = {
      enableHighAccuracy: false,
      timeout: Math.min(10000, config.maxWaitMs),
      maximumAge: 60000,
    }
    const requestCoarseLocation = () => {
      if (coarseRequested || done) return
      coarseRequested = true
      navigator.geolocation.getCurrentPosition(
        handleSuccess,
        handleError,
        coarseOptions
      )
    }

    if (typeof navigator.geolocation.watchPosition === 'function') {
      watchId = navigator.geolocation.watchPosition(
        handleSuccess,
        handleError,
        watchOptions
      )
    } else {
      navigator.geolocation.getCurrentPosition(
        handleSuccess,
        handleError,
        singleOptions
      )
    }

    coarseTimerId = window.setTimeout(() => {
      requestCoarseLocation()
    }, coarseDelayMs)

    timeoutId = window.setTimeout(() => {
      if (done) return
      if (!best) {
        if (lastError) {
          if (lastError.code === lastError.POSITION_UNAVAILABLE) {
            finishError('position_unavailable')
            return
          }
          if (lastError.code === lastError.TIMEOUT) {
            finishError('timeout')
            return
          }
          finishError('unknown')
          return
        }
        finishError('timeout')
        return
      }
      const fallbackAccuracy = Math.max(
        config.maxAccuracy,
        config.fallbackAccuracy
      )
      if (best.coords.accuracy <= config.maxAccuracy) {
        finishSuccess(best, false)
        return
      }
      if (best.coords.accuracy <= fallbackAccuracy) {
        finishSuccess(best, true)
        return
      }
      finishError('low_accuracy', best.coords.accuracy)
    }, config.maxWaitMs)
  })
}
