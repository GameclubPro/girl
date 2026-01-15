import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ProBottomNav } from '../components/ProBottomNav'
import { StoryViewer } from '../components/StoryViewer'
import type { StoryGroup, StoryItem } from '../types/app'

const allowedImageTypes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
const MAX_STORY_BYTES = 6 * 1024 * 1024
const storyDurationOptions = [12, 24, 48]

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('file_read_failed'))
    reader.readAsDataURL(file)
  })

const formatTimeLeft = (value?: string | null) => {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  const diffMs = parsed.getTime() - Date.now()
  if (diffMs <= 0) return 'Истекло'
  const minutes = Math.ceil(diffMs / 60000)
  if (minutes < 60) return `Еще ${minutes} мин`
  const hours = Math.ceil(minutes / 60)
  if (hours < 24) return `Еще ${hours} ч`
  const days = Math.ceil(hours / 24)
  return `Еще ${days} дн`
}

type ProStoriesScreenProps = {
  apiBase: string
  userId: string
  displayNameFallback: string
  onBack: () => void
  onViewRequests: () => void
  onViewChats: () => void
  onViewProfile: () => void
}

export const ProStoriesScreen = ({
  apiBase,
  userId,
  displayNameFallback,
  onBack,
  onViewRequests,
  onViewChats,
  onViewProfile,
}: ProStoriesScreenProps) => {
  const [stories, setStories] = useState<StoryItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [draftMediaUrl, setDraftMediaUrl] = useState('')
  const [draftCaption, setDraftCaption] = useState('')
  const [draftDuration, setDraftDuration] = useState(24)
  const [isUploading, setIsUploading] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [actionError, setActionError] = useState('')
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  const displayName = displayNameFallback.trim() || 'Мастер'

  const storyGroup = useMemo<StoryGroup | null>(() => {
    if (stories.length === 0) return null
    return {
      masterId: userId,
      masterName: displayName,
      masterAvatarUrl: null,
      items: stories,
    }
  }, [displayName, stories, userId])

  const loadStories = useCallback(async () => {
    if (!userId) return
    setIsLoading(true)
    setLoadError('')
    try {
      const response = await fetch(
        `${apiBase}/api/masters/${encodeURIComponent(userId)}/stories`
      )
      if (!response.ok) {
        throw new Error('Load stories failed')
      }
      const data = (await response.json()) as StoryItem[]
      setStories(Array.isArray(data) ? data : [])
    } catch (error) {
      setLoadError('Не удалось загрузить истории.')
    } finally {
      setIsLoading(false)
    }
  }, [apiBase, userId])

  useEffect(() => {
    void loadStories()
  }, [loadStories])

  useEffect(() => {
    if (previewIndex !== null && !stories[previewIndex]) {
      setPreviewIndex(null)
    }
  }, [previewIndex, stories])

  const resetDraft = () => {
    setDraftMediaUrl('')
    setDraftCaption('')
    setDraftDuration(24)
    setActionError('')
  }

  const validateFile = (file: File) => {
    if (!allowedImageTypes.has(file.type)) {
      return 'Поддерживаются JPG, PNG или WEBP.'
    }
    if (file.size > MAX_STORY_BYTES) {
      return 'Файл слишком большой. До 6 МБ.'
    }
    return ''
  }

  const handleFileSelected = async (file?: File | null) => {
    if (!file) return
    const validationError = validateFile(file)
    if (validationError) {
      setActionError(validationError)
      return
    }

    setIsUploading(true)
    setActionError('')
    try {
      const dataUrl = await readFileAsDataUrl(file)
      const response = await fetch(`${apiBase}/api/masters/stories/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, dataUrl }),
      })
      if (!response.ok) {
        throw new Error('Upload story failed')
      }
      const data = (await response.json()) as { url?: string | null }
      if (!data?.url) {
        throw new Error('Upload story missing url')
      }
      setDraftMediaUrl(data.url)
    } catch (error) {
      setActionError('Не удалось загрузить историю.')
    } finally {
      setIsUploading(false)
    }
  }

  const handlePublish = async () => {
    if (!draftMediaUrl) {
      setActionError('Добавьте фото для истории.')
      return
    }
    setIsPublishing(true)
    setActionError('')
    try {
      const response = await fetch(
        `${apiBase}/api/masters/${encodeURIComponent(userId)}/stories`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mediaUrl: draftMediaUrl,
            caption: draftCaption.trim() || null,
            expiresInHours: draftDuration,
          }),
        }
      )
      if (!response.ok) {
        throw new Error('Create story failed')
      }
      resetDraft()
      await loadStories()
    } catch (error) {
      setActionError('Не удалось опубликовать историю.')
    } finally {
      setIsPublishing(false)
    }
  }

  const handleDelete = async (storyId: number) => {
    if (!window.confirm('Удалить историю?')) return
    try {
      const response = await fetch(
        `${apiBase}/api/masters/${encodeURIComponent(userId)}/stories/${storyId}`,
        { method: 'DELETE' }
      )
      if (!response.ok) {
        throw new Error('Delete story failed')
      }
      setStories((current) => current.filter((story) => story.id !== storyId))
    } catch (error) {
      setActionError('Не удалось удалить историю.')
    }
  }

  return (
    <div className="screen screen--pro screen--pro-detail screen--pro-stories">
      <div className="pro-detail-shell">
        <header className="pro-detail-header">
          <button className="pro-back" type="button" onClick={onBack}>
            ←
          </button>
          <div className="pro-detail-title">
            <p className="pro-detail-kicker">Истории</p>
            <h1 className="pro-detail-heading">Story-студия</h1>
            <p className="pro-detail-subtitle">
              Делитесь результатами работы и напоминайте о себе подписчикам.
            </p>
          </div>
        </header>

        {isLoading && (
          <p className="pro-cabinet-dashboard-status" role="status">
            Обновляем истории...
          </p>
        )}
        {loadError && (
          <p className="pro-cabinet-dashboard-status is-error" role="alert">
            {loadError}
          </p>
        )}

        <section className="pro-detail-card pro-stories-card animate delay-1">
          <div className="pro-detail-card-head">
            <h2>Создать историю</h2>
            <span className="pro-detail-pill">12–48 часов</span>
          </div>
          <div className="pro-stories-compose">
            <div className="pro-stories-media">
              {draftMediaUrl ? (
                <>
                  <img src={draftMediaUrl} alt="" />
                  <button
                    className="pro-stories-replace"
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                  >
                    Заменить фото
                  </button>
                </>
              ) : (
                <div className="pro-stories-upload">
                  <p>
                    {isUploading
                      ? 'Загружаем фото...'
                      : 'Добавьте фото из галереи или камеры.'}
                  </p>
                  <div className="pro-stories-upload-actions">
                    <button
                      className="pro-stories-upload-button"
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      Снять
                    </button>
                    <button
                      className="pro-stories-upload-button is-secondary"
                      type="button"
                      onClick={() => galleryInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      Загрузить
                    </button>
                  </div>
                </div>
              )}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="pro-stories-input"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0]
                  event.currentTarget.value = ''
                  void handleFileSelected(file)
                }}
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                className="pro-stories-input"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0]
                  event.currentTarget.value = ''
                  void handleFileSelected(file)
                }}
              />
            </div>
            <div className="pro-stories-fields">
              <label className="pro-stories-label">
                Подпись
                <textarea
                  className="pro-stories-textarea"
                  value={draftCaption}
                  onChange={(event) => setDraftCaption(event.target.value)}
                  placeholder="Например: свободные окна сегодня, новая техника..."
                  rows={3}
                  maxLength={200}
                />
              </label>
              <div className="pro-stories-duration">
                <span className="pro-stories-label-text">Срок показа</span>
                <div className="pro-stories-duration-options" role="group">
                  {storyDurationOptions.map((option) => (
                    <button
                      key={option}
                      className={`pro-stories-duration-option${
                        draftDuration === option ? ' is-active' : ''
                      }`}
                      type="button"
                      onClick={() => setDraftDuration(option)}
                      aria-pressed={draftDuration === option}
                    >
                      {option} ч
                    </button>
                  ))}
                </div>
              </div>
              {actionError && <p className="pro-stories-error">{actionError}</p>}
              <div className="pro-stories-actions">
                <button
                  className="cta cta--primary"
                  type="button"
                  onClick={handlePublish}
                  disabled={!draftMediaUrl || isUploading || isPublishing}
                >
                  {isPublishing ? 'Публикуем...' : 'Опубликовать'}
                </button>
                {draftMediaUrl && (
                  <button
                    className="cta cta--secondary"
                    type="button"
                    onClick={resetDraft}
                    disabled={isPublishing}
                  >
                    Сбросить
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="pro-detail-card animate delay-2">
          <div className="pro-detail-card-head">
            <h2>Активные истории</h2>
            <span className="pro-detail-pill is-ghost">
              {stories.length ? `${stories.length} шт.` : 'Пока пусто'}
            </span>
          </div>
          {stories.length > 0 ? (
            <div className="pro-stories-grid">
              {stories.map((story, index) => (
                <article className="pro-stories-item" key={story.id}>
                  <button
                    className="pro-stories-preview"
                    type="button"
                    onClick={() => setPreviewIndex(index)}
                  >
                    {story.mediaUrl ? (
                      <img src={story.mediaUrl} alt="" loading="lazy" />
                    ) : (
                      <span className="pro-stories-fallback">Фото</span>
                    )}
                  </button>
                  <div className="pro-stories-info">
                    <span className="pro-stories-time">
                      {formatTimeLeft(story.expiresAt)}
                    </span>
                    <span
                      className={`pro-stories-caption${
                        story.caption ? '' : ' is-muted'
                      }`}
                    >
                      {story.caption || 'Подпись не добавлена'}
                    </span>
                  </div>
                  <div className="pro-stories-meta">
                    <span>Просмотры: {story.viewsCount ?? 0}</span>
                    <button
                      className="pro-stories-delete"
                      type="button"
                      onClick={() => handleDelete(story.id)}
                    >
                      Удалить
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="pro-detail-empty">
              Добавьте первую историю, чтобы напомнить о себе подписчикам.
            </p>
          )}
        </section>
      </div>

      <ProBottomNav
        active="cabinet"
        onCabinet={onBack}
        onRequests={onViewRequests}
        onChats={onViewChats}
        onProfile={onViewProfile}
      />

      {previewIndex !== null && storyGroup && (
        <StoryViewer
          groups={[storyGroup]}
          initialGroupIndex={0}
          initialStoryIndex={previewIndex}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </div>
  )
}
