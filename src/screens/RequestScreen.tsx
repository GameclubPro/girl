import { IconClock, IconPhoto, IconPin } from '../components/icons'
import {
  requestBudgetOptions,
  requestQuickChoices,
  requestTagChoices,
} from '../data/requestData'

export const RequestScreen = ({ onBack }: { onBack: () => void }) => {
  const locationOptions = ['У мастера', 'У меня', 'Не важно'] as const
  const dateOptions = ['Сегодня', 'Завтра', 'Выбрать'] as const
  const selectedQuick = 'Маникюр'
  const selectedLocation = 'У мастера'
  const selectedDate = 'Выбрать'
  const selectedBudget = 'до 2000 ₽'

  return (
    <div className="screen screen--request">
      <div className="request-shell">
        <header className="request-header animate delay-1">
          <button
            className="request-back"
            type="button"
            onClick={onBack}
            aria-label="Назад"
          >
            <span aria-hidden="true">‹</span>
          </button>
          <div className="request-headings">
            <h1 className="request-title">Создать заявку</h1>
            <p className="request-subtitle">Услуга • где • когда • детали</p>
          </div>
        </header>

        <section className="request-card animate delay-2">
          <h2 className="request-card-title">Услуга</h2>
          <div className="request-field">
            <span className="request-label">Категория *</span>
            <button className="request-select" type="button">
              <span className="request-select-main">Красота и ногти</span>
              <span className="request-chevron" aria-hidden="true">
                ›
              </span>
            </button>
          </div>
          <div className="request-field">
            <span className="request-label">Услуга *</span>
            <button className="request-select" type="button">
              <span className="request-select-main">Маникюр</span>
              <span className="request-chevron" aria-hidden="true">
                ›
              </span>
            </button>
          </div>
          <div className="request-field">
            <span className="request-label">Быстрый выбор</span>
            <div className="request-chips">
              {requestQuickChoices.map((choice) => (
                <button
                  className={`request-chip${
                    choice === selectedQuick ? ' is-active' : ''
                  }`}
                  key={choice}
                  type="button"
                  aria-pressed={choice === selectedQuick}
                >
                  {choice}
                </button>
              ))}
            </div>
          </div>
          <div className="request-field">
            <span className="request-label">Теги (можно несколько)</span>
            <div className="request-chips">
              {requestTagChoices.map((choice) => (
                <button className="request-chip" key={choice} type="button">
                  {choice}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="request-card animate delay-3">
          <h2 className="request-card-title">Где делать</h2>
          <div className="request-segment">
            {locationOptions.map((option) => (
              <button
                className={`request-segment-button${
                  option === selectedLocation ? ' is-active' : ''
                }`}
                key={option}
                type="button"
                aria-pressed={option === selectedLocation}
              >
                {option}
              </button>
            ))}
          </div>
          <div className="request-field">
            <span className="request-label">Город *</span>
            <button className="request-select request-select--icon" type="button">
              <span className="request-select-main">
                <span className="request-select-icon" aria-hidden="true">
                  <IconPin />
                </span>
                Москва
              </span>
              <span className="request-chevron" aria-hidden="true">
                ›
              </span>
            </button>
          </div>
          <div className="request-field">
            <span className="request-label">Район / метро *</span>
            <button className="request-select request-select--icon" type="button">
              <span className="request-select-main">
                <span className="request-select-icon" aria-hidden="true">
                  <IconPin />
                </span>
                Выбрать район
              </span>
              <span className="request-chevron" aria-hidden="true">
                ›
              </span>
            </button>
          </div>
        </section>

        <section className="request-card animate delay-4">
          <h2 className="request-card-title">Когда</h2>
          <div className="request-segment">
            {dateOptions.map((option) => (
              <button
                className={`request-segment-button${
                  option === selectedDate ? ' is-active' : ''
                }`}
                key={option}
                type="button"
                aria-pressed={option === selectedDate}
              >
                {option}
              </button>
            ))}
          </div>
          <div className="request-field">
            <span className="request-label">Дата и время *</span>
            <button className="request-select request-select--icon" type="button">
              <span className="request-select-main">
                <span className="request-select-icon" aria-hidden="true">
                  <IconClock />
                </span>
                Ср, 10 янв • 18:00
              </span>
              <span className="request-chevron" aria-hidden="true">
                ›
              </span>
            </button>
          </div>
        </section>

        <section className="request-card animate delay-5">
          <h2 className="request-card-title">Детали</h2>
          <div className="request-field">
            <span className="request-label">Бюджет</span>
            <div className="request-chips">
              {requestBudgetOptions.map((option) => (
                <button
                  className={`request-chip${
                    option === selectedBudget ? ' is-active' : ''
                  }`}
                  key={option}
                  type="button"
                  aria-pressed={option === selectedBudget}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          <div className="request-field">
            <span className="request-label">Фото примера (желательно)</span>
            <div className="request-upload">
              <div className="request-upload-media" aria-hidden="true">
                <IconPhoto />
              </div>
              <div className="request-upload-body">
                <div className="request-upload-title">Добавить фото-пример</div>
                <div className="request-upload-meta">1-5 фото • до/после</div>
              </div>
              <button className="request-upload-button" type="button">
                Добавить
              </button>
            </div>
          </div>
        </section>

        <p className="request-disclaimer">
          Нажимая «Опубликовать», вы соглашаетесь с правилами
        </p>
      </div>

      <div className="request-submit-bar">
        <button className="request-submit" type="button">
          Опубликовать заявку
        </button>
      </div>
    </div>
  )
}
