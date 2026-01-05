import { useState } from 'react'
import type { City, District, Role } from '../types/app'

export const AddressScreen = ({
  role,
  cities,
  districts,
  cityId,
  districtId,
  cityQuery,
  address,
  isSaving,
  isLoading,
  saveError,
  onCityQueryChange,
  onCitySelect,
  onDistrictChange,
  onAddressChange,
  onBack,
  onContinue,
}: {
  role: Role
  cities: City[]
  districts: District[]
  cityId: number | null
  districtId: number | null
  cityQuery: string
  address: string
  isSaving: boolean
  isLoading: boolean
  saveError: string
  onCityQueryChange: (value: string) => void
  onCitySelect: (city: City) => void
  onDistrictChange: (value: number | null) => void
  onAddressChange: (value: string) => void
  onBack: () => void
  onContinue: () => void
}) => {
  const [isCityFocused, setIsCityFocused] = useState(false)
  const roleLabel = role === 'client' ? 'Заказчик' : 'Исполнительница'
  const hasCity = cityId !== null
  const hasDistrict = districtId !== null
  const hasAddress = address.trim().length > 0
  const canContinue = hasCity && hasDistrict && hasAddress && !isSaving && !isLoading
  const normalizedQuery = cityQuery.trim().toLowerCase()
  const filteredCities = normalizedQuery
    ? cities.filter((city) =>
        city.name.toLowerCase().includes(normalizedQuery)
      )
    : cities
  const showSuggestions =
    isCityFocused && normalizedQuery.length >= 2 && cities.length > 0

  return (
    <div className="screen screen--address">
      <div className="address-shell">
        <div className="address-top">
          <button className="back-pill" type="button" onClick={onBack}>
            <span className="chev">‹</span>
            Назад
          </button>
          <span className="address-role">{roleLabel}</span>
        </div>

        <h2 className="address-title">Ваш адрес</h2>
        <p className="address-subtitle">
          Выберите город и район, затем укажите точный адрес для сохранения.
        </p>
        {isLoading && <p className="address-status">Загружаем данные...</p>}

        <div className="address-card">
          <div className="address-field">
            <label className="address-label" htmlFor="city-input">
              Город
            </label>
            <input
              id="city-input"
              className="address-input"
              type="text"
              value={cityQuery}
              onChange={(event) => onCityQueryChange(event.target.value)}
              onFocus={() => setIsCityFocused(true)}
              onBlur={() => setIsCityFocused(false)}
              placeholder="Начните вводить город"
              autoComplete="address-level2"
              autoFocus
            />
            {showSuggestions && (
              <div className="address-suggest" role="listbox">
                {filteredCities.length > 0 ? (
                  filteredCities.slice(0, 8).map((city) => (
                    <button
                      className={`suggest-item${
                        cityId === city.id ? ' is-active' : ''
                      }`}
                      key={city.id}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault()
                        onCitySelect(city)
                        setIsCityFocused(false)
                      }}
                    >
                      {city.name}
                    </button>
                  ))
                ) : (
                  <span className="suggest-empty">Город не найден</span>
                )}
              </div>
            )}
          </div>
          <div className="address-field">
            <label className="address-label" htmlFor="district-select">
              Район
            </label>
            <select
              id="district-select"
              className="address-select"
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

        <div className="address-card">
          <label className="address-label" htmlFor="address-input">
            Адрес
          </label>
          <input
            id="address-input"
            className="address-input"
            type="text"
            value={address}
            onChange={(event) => onAddressChange(event.target.value)}
            placeholder="Улица, дом, квартира"
            autoComplete="street-address"
          />
          <p className="address-helper">Нужен точный адрес для выезда.</p>
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

        <p className="address-hint">Адрес можно изменить в профиле позже.</p>
      </div>
    </div>
  )
}
