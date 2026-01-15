import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { StoryGroup } from '../types/app'

const STORY_DURATION_MS = 6000
const STORY_TICK_MS = 80

const formatTimeAgo = (value?: string | null) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const diffMs = Date.now() - parsed.getTime()
  if (diffMs < 60_000) return 'только что'
  if (diffMs < 60 * 60_000) {
    const minutes = Math.max(1, Math.round(diffMs / 60_000))
    return `${minutes} мин назад`
  }
  if (diffMs < 24 * 60 * 60_000) {
    const hours = Math.max(1, Math.round(diffMs / (60 * 60_000)))
    return `${hours} ч назад`
  }
  const days = Math.max(1, Math.round(diffMs / (24 * 60 * 60_000)))
  return `${days} дн назад`
}

type StoryViewerProps = {
  groups: StoryGroup[]
  initialGroupIndex: number
  initialStoryIndex?: number
  onClose: () => void
  onSeen?: (storyId: number, masterId: string) => void
  actionLabel?: string
  onAction?: (masterId: string) => void
}

export const StoryViewer = ({
  groups,
  initialGroupIndex,
  initialStoryIndex,
  onClose,
  onSeen,
  actionLabel,
  onAction,
}: StoryViewerProps) => {
  const [groupIndex, setGroupIndex] = useState(() =>
    Math.max(0, Math.min(initialGroupIndex, groups.length - 1))
  )
  const [storyIndex, setStoryIndex] = useState(() => initialStoryIndex ?? 0)
  const [progress, setProgress] = useState(0)
  const [isHolding, setIsHolding] = useState(false)
  const progressRef = useRef(0)
  const holdRef = useRef(false)
  const canAction = Boolean(onAction)

  const group = groups[groupIndex]
  const items = group?.items ?? []
  const story = items[storyIndex] ?? null
  const masterInitial = group?.masterName?.trim().slice(0, 1) || 'М'
  const isFirstStory = storyIndex <= 0
  const isLastStory = storyIndex >= items.length - 1
  const isLastGroup = groupIndex >= groups.length - 1
  const isFirstGroup = groupIndex <= 0
  const topLabel = useMemo(() => formatTimeAgo(story?.createdAt), [story?.createdAt])

  useEffect(() => {
    const nextGroupIndex = Math.max(
      0,
      Math.min(initialGroupIndex, groups.length - 1)
    )
    const groupItems = groups[nextGroupIndex]?.items ?? []
    const nextStoryIndex = Math.max(
      0,
      Math.min(initialStoryIndex ?? 0, Math.max(0, groupItems.length - 1))
    )
    setGroupIndex(nextGroupIndex)
    setStoryIndex(nextStoryIndex)
  }, [groups.length, initialGroupIndex, initialStoryIndex])

  useEffect(() => {
    holdRef.current = isHolding
  }, [isHolding])

  useEffect(() => {
    if (!story?.id || !group?.masterId) return
    onSeen?.(story.id, group.masterId)
  }, [group?.masterId, onSeen, story?.id])

  useEffect(() => {
    if (!story?.id) return
    progressRef.current = 0
    setProgress(0)

    const isLastStoryLocal = storyIndex >= items.length - 1
    const isLastGroupLocal = groupIndex >= groups.length - 1

    const advance = () => {
      if (!isLastStoryLocal) {
        setStoryIndex((current) => Math.min(current + 1, items.length - 1))
        return
      }
      if (!isLastGroupLocal) {
        setGroupIndex((current) => Math.min(current + 1, groups.length - 1))
        setStoryIndex(0)
        return
      }
      onClose()
    }

    const interval = window.setInterval(() => {
      if (holdRef.current) return
      const next = Math.min(
        1,
        progressRef.current + STORY_TICK_MS / STORY_DURATION_MS
      )
      progressRef.current = next
      setProgress(next)
      if (next >= 1) {
        advance()
      }
    }, STORY_TICK_MS)

    return () => window.clearInterval(interval)
  }, [groupIndex, groups.length, items.length, onClose, story?.id, storyIndex])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  const handlePrev = () => {
    if (!group) return
    if (!isFirstStory) {
      setStoryIndex((current) => Math.max(0, current - 1))
      return
    }
    if (!isFirstGroup) {
      const previousGroup = groups[groupIndex - 1]
      setGroupIndex((current) => Math.max(0, current - 1))
      setStoryIndex(Math.max(0, (previousGroup?.items.length ?? 1) - 1))
      return
    }
    onClose()
  }

  const handleNext = () => {
    if (!group) return
    if (!isLastStory) {
      setStoryIndex((current) => Math.min(current + 1, items.length - 1))
      return
    }
    if (!isLastGroup) {
      setGroupIndex((current) => Math.min(current + 1, groups.length - 1))
      setStoryIndex(0)
      return
    }
    onClose()
  }

  if (!group || !story) return null

  return (
    <div className={`story-viewer${isHolding ? ' is-paused' : ''}`}>
      <div className="story-viewer-media">
        {story.mediaType === 'image' ? (
          <img src={story.mediaUrl ?? ''} alt="" loading="eager" />
        ) : (
          <div className="story-viewer-fallback">Видео недоступно</div>
        )}
      </div>
      <div className="story-viewer-overlay" aria-hidden="true" />
      <div className="story-viewer-header">
        <div className="story-viewer-progress">
          {items.map((item, index) => {
            const value =
              index < storyIndex ? 1 : index === storyIndex ? progress : 0
            return (
              <span
                className="story-viewer-progress-bar"
                key={`story-progress-${item.id}`}
                style={{ '--progress': value } as CSSProperties}
              />
            )
          })}
        </div>
        <div className="story-viewer-top">
          <button
            className="story-viewer-profile"
            type="button"
            onClick={() => onAction?.(group.masterId)}
            disabled={!canAction}
            aria-disabled={!canAction}
          >
            <span className="story-viewer-avatar" aria-hidden="true">
              {group.masterAvatarUrl ? (
                <img src={group.masterAvatarUrl} alt="" />
              ) : (
                <span>{masterInitial}</span>
              )}
            </span>
            <span className="story-viewer-meta">
              <span className="story-viewer-name">{group.masterName}</span>
              <span className="story-viewer-time">{topLabel}</span>
            </span>
          </button>
          <button
            className="story-viewer-close"
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
      </div>
      <div className="story-viewer-nav">
        <button
          className="story-viewer-nav-button is-prev"
          type="button"
          onClick={handlePrev}
          onPointerDown={() => setIsHolding(true)}
          onPointerUp={() => setIsHolding(false)}
          onPointerLeave={() => setIsHolding(false)}
          onPointerCancel={() => setIsHolding(false)}
          aria-label="Предыдущая история"
        />
        <button
          className="story-viewer-nav-button is-next"
          type="button"
          onClick={handleNext}
          onPointerDown={() => setIsHolding(true)}
          onPointerUp={() => setIsHolding(false)}
          onPointerLeave={() => setIsHolding(false)}
          onPointerCancel={() => setIsHolding(false)}
          aria-label="Следующая история"
        />
      </div>
      {(story.caption || (actionLabel && onAction)) && (
        <div className="story-viewer-footer">
          {story.caption && (
            <p className="story-viewer-caption">{story.caption}</p>
          )}
          {actionLabel && onAction && (
            <button
              className="story-viewer-action"
              type="button"
              onClick={() => onAction(group.masterId)}
            >
              {actionLabel}
            </button>
          )}
        </div>
      )}
      <div className="story-viewer-hint">
        {isHolding ? 'Пауза' : 'Удерживайте для паузы'}
      </div>
    </div>
  )
}
