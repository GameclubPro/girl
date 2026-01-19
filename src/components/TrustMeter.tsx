import type { CSSProperties } from 'react'
import type { ClientTrust } from '../types/app'
import {
  formatTrustConfidence,
  formatTrustReasonValue,
  formatTrustScoreLabel,
  getTrustLevelLabel,
  getTrustMarkerPosition,
  getTrustReasonLabel,
  getTrustScoreValue,
  getTrustTone,
} from '../utils/trustScore'

type TrustMeterProps = {
  trust?: ClientTrust | null
  tips?: string[]
}

const formatUpdatedAt = (value?: string | null) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}

export const TrustMeter = ({ trust, tips = [] }: TrustMeterProps) => {
  const tone = getTrustTone(trust)
  const score = getTrustScoreValue(trust)
  const scoreLabel = formatTrustScoreLabel(trust)
  const levelLabel = getTrustLevelLabel(trust?.confidence ?? 0)
  const confidenceLabel = formatTrustConfidence(trust)
  const updatedAtLabel = formatUpdatedAt(trust?.updatedAt ?? null)
  const reasons = trust?.reasons ?? { positive: [], negative: [] }
  const markerStyle = {
    '--trust-score': getTrustMarkerPosition(trust),
  } as CSSProperties

  return (
    <div className={`trust-meter-card ${tone}`}>
      <div className="trust-meter-head">
        <div>
          <p className="trust-meter-kicker">Добросовестность</p>
          <h3 className="trust-meter-title">Шкала доверия</h3>
        </div>
        <span className="trust-meter-level">{levelLabel}</span>
      </div>

      <div className="trust-meter-track" style={markerStyle}>
        <div className="trust-meter-gradient" aria-hidden="true" />
        <div className="trust-meter-marker" aria-hidden="true" />
      </div>

      <div className="trust-meter-values">
        <span className="trust-meter-score">{scoreLabel}</span>
        <span className="trust-meter-confidence">
          Уверенность {confidenceLabel}
        </span>
      </div>

      <div className="trust-meter-summary">
        <span className="trust-meter-summary-score">{score}</span>
        <span className="trust-meter-summary-label">из 100</span>
      </div>

      {(reasons.positive.length > 0 || reasons.negative.length > 0) && (
        <div className="trust-meter-reasons">
          {reasons.positive.length > 0 && (
            <div className="trust-meter-reason-group is-positive">
              <span className="trust-meter-reason-title">Сильные сигналы</span>
              <div className="trust-meter-reason-list" role="list">
                {reasons.positive.map((reason) => (
                  <div className="trust-meter-reason-item" key={reason.eventType}>
                    <span className="trust-meter-reason-label">
                      {getTrustReasonLabel(reason.eventType)}
                    </span>
                    <span className="trust-meter-reason-meta">
                      ×{reason.count} · {formatTrustReasonValue(reason.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {reasons.negative.length > 0 && (
            <div className="trust-meter-reason-group is-negative">
              <span className="trust-meter-reason-title">Зоны внимания</span>
              <div className="trust-meter-reason-list" role="list">
                {reasons.negative.map((reason) => (
                  <div className="trust-meter-reason-item" key={reason.eventType}>
                    <span className="trust-meter-reason-label">
                      {getTrustReasonLabel(reason.eventType)}
                    </span>
                    <span className="trust-meter-reason-meta">
                      ×{reason.count} · {formatTrustReasonValue(reason.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tips.length > 0 && (
        <div className="trust-meter-tips">
          <span className="trust-meter-tips-title">Как улучшить</span>
          <div className="trust-meter-tips-list" role="list">
            {tips.map((tip) => (
              <div className="trust-meter-tip" role="listitem" key={tip}>
                {tip}
              </div>
            ))}
          </div>
        </div>
      )}

      {updatedAtLabel && (
        <div className="trust-meter-updated">Обновлено {updatedAtLabel}</div>
      )}
    </div>
  )
}
