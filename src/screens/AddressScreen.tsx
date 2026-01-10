import { useState } from 'react'
import { IconCity, IconDistrict, IconPin } from '../components/icons'
import { isCityAvailable } from '../data/cityAvailability'
import type { City, District, Role, UserLocation } from '../types/app'

export const AddressScreen = ({
  role,
  cities,
  districts,
  cityId,
  districtId,
  cityQuery,
  isSaving,
  isLoading,
  saveError,
  location,
  isLocating,
  locationError,
  shareDistanceToMasters,
  onCityQueryChange,
  onCitySelect,
  onDistrictChange,
  onContinue,
  onRequestLocation,
  onClearLocation,
  onShareDistanceChange,
}: {
  role: Role
  cities: City[]
  districts: District[]
  cityId: number | null
  districtId: number | null
  cityQuery: string
  isSaving: boolean
  isLoading: boolean
  saveError: string
  location: UserLocation | null
  isLocating: boolean
  locationError: string
  shareDistanceToMasters: boolean
  onCityQueryChange: (value: string) => void
  onCitySelect: (city: City) => void
  onDistrictChange: (value: number | null) => void
  onContinue: () => void
  onRequestLocation: () => void
  onClearLocation: () => void
  onShareDistanceChange: (value: boolean) => void
}) => {
  const [isCityFocused, setIsCityFocused] = useState(false)
  const roleLabel = role === 'client' ? 'Заказчик' : 'Исполнительница'
  const hasCity = cityId !== null
  const hasDistrict = districtId !== null
  const canContinue = hasCity && hasDistrict && !isSaving && !isLoading
  const normalizedQuery = cityQuery.trim().toLowerCase()
  const matchedCity = cities.find(
    (city) => city.name.toLowerCase() === normalizedQuery
  )
  const isMatchedUnavailable = matchedCity
    ? !isCityAvailable(matchedCity.name)
    : false
  const filteredCities = normalizedQuery
    ? cities.filter((city) =>
        city.name.toLowerCase().includes(normalizedQuery)
      )
    : cities
  const showSuggestions =
    isCityFocused && normalizedQuery.length >= 2 && cities.length > 0
  const hasLocation =
    typeof location?.lat === 'number' && typeof location?.lng === 'number'
  const updatedLabel = location?.updatedAt
    ? new Date(location.updatedAt).toLocaleString('ru-RU', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''
  const accuracyLabel =
    typeof location?.accuracy === 'number'
      ? `Точность ~${location.accuracy} м`
      : ''

  return (
    <div className="screen screen--address">
      <div className="address-shell">
        <div className="address-top">
          <span className="address-role">{roleLabel}</span>
        </div>

        <h2 className="address-title">Город и район</h2>
        <p className="address-subtitle">
          Выберите город и район. Точный адрес можно уточнить позже.
        </p>
        {isLoading && <p className="address-status">Загружаем данные...</p>}

        <div className="address-card">
          <div className="address-field">
            <label className="address-label" htmlFor="city-input">
              Город
            </label>
            <div className="address-input-wrap">
              <span className="address-input-icon" aria-hidden="true">
                <IconCity />
              </span>
              <input
                id="city-input"
                className="address-input address-input--icon"
                type="text"
                value={cityQuery}
                onChange={(event) => onCityQueryChange(event.target.value)}
                onFocus={() => setIsCityFocused(true)}
                onBlur={() => setIsCityFocused(false)}
                placeholder="Начните вводить город"
                autoComplete="address-level2"
              />
            </div>
            {showSuggestions && (
              <div className="address-suggest" role="listbox">
                {filteredCities.length > 0 ? (
                  filteredCities.slice(0, 8).map((city) => {
                    const isUnavailable = !isCityAvailable(city.name)
                    const isActive = !isUnavailable && cityId === city.id

                    return (
                      <button
                        className={`suggest-item${
                          isActive ? ' is-active' : ''
                        }${isUnavailable ? ' is-disabled' : ''}`}
                        key={city.id}
                        type="button"
                        disabled={isUnavailable}
                        aria-disabled={isUnavailable}
                        onMouseDown={(event) => {
                          event.preventDefault()
                          if (isUnavailable) return
                          onCitySelect(city)
                          setIsCityFocused(false)
                        }}
                      >
                        <span>{city.name}</span>
                        {isUnavailable && (
                          <span className="suggest-badge">Скоро</span>
                        )}
                      </button>
                    )
                  })
                ) : (
                  <span className="suggest-empty">Город не найден</span>
                )}
              </div>
            )}
            {isMatchedUnavailable && (
              <p className="address-unavailable">
                Этот город пока недоступен. Мы скоро откроемся там.
              </p>
            )}
          </div>
          <div className="address-field">
            <label className="address-label" htmlFor="district-select">
              Район
            </label>
            <div className="address-input-wrap">
              <span className="address-input-icon" aria-hidden="true">
                <IconDistrict />
              </span>
              <select
                id="district-select"
                className="address-select address-select--icon"
                value={districtId ?? ''}
                onChange={(event) => {
                  const nextValue = event.target.value
                  const parsedValue = Number(nextValue)
                  onDistrictChange(
                    Number.isInteger(parsedValue) ? parsedValue : null
                  )
                }}
                disabled={!hasCity || districts.length === 0}
              >
                <option value="">
                  {hasCity ? 'Выберите район' : 'Сначала выберите город'}
                </option>
                {districts.map((district) => (
                  <option key={district.id} value={district.id}>
                    {district.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="address-card address-card--geo">
          <div className="address-geo-head">
            <div>
              <span className="address-label">Геолокация (по желанию)</span>
              <p className="address-helper">
                Нужна для подбора ближайших мастеров.
              </p>
            </div>
            <span className="address-geo-icon" aria-hidden="true">
              <IconPin />
            </span>
          </div>

          <div className="address-geo-status">
            <span>{hasLocation ? 'Геолокация сохранена' : 'Геолокация не задана'}</span>
            {hasLocation && (
              <span className="address-geo-meta">
                {updatedLabel ? `Обновлено ${updatedLabel}` : ''}
                {accuracyLabel ? ` • ${accuracyLabel}` : ''}
              </span>
            )}
          </div>

          <div className="address-geo-actions">
            <button
              className="address-secondary"
              type="button"
              onClick={onRequestLocation}
              disabled={isLocating}
            >
              {isLocating
                ? 'Определяем...'
                : hasLocation
                  ? 'Обновить геолокацию'
                  : 'Поделиться геолокацией'}
            </button>
            {hasLocation && (
              <button
                className="address-geo-clear"
                type="button"
                onClick={onClearLocation}
                disabled={isLocating}
              >
                Удалить
              </button>
            )}
          </div>

          <button
            className={`address-geo-toggle${
              shareDistanceToMasters ? ' is-active' : ''
            }`}
            type="button"
            onClick={() => onShareDistanceChange(!shareDistanceToMasters)}
            disabled={!hasLocation || isLocating}
            aria-pressed={shareDistanceToMasters}
          >
            Показывать расстояние мастерам
          </button>
          <p className="address-helper">
            Мастера увидят только примерное расстояние.
          </p>
          {locationError && <p className="address-error">{locationError}</p>}
        </div>

        <div className="address-actions">
          <button
            className="address-primary"
            type="button"
            onClick={onContinue}
            disabled={!canContinue}
          >
            {isSaving ? 'Сохраняем...' : 'Сохранить'}
          </button>
        </div>

        {saveError && <p className="address-error">{saveError}</p>}

        <p className="address-hint">Город и район можно изменить позже.</p>
      </div>
    </div>
  )
}
