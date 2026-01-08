import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, PointerEvent } from 'react'
import { ProBottomNav } from '../components/ProBottomNav'
import type { MasterProfile, ProProfileSection } from '../types/app'
import {
  isImageUrl,
  parsePortfolioItems,
  toPortfolioStrings,
  type PortfolioItem,
} from '../utils/profileContent'

type ProCabinetScreenProps = {
  apiBase: string
  userId: string
  displayNameFallback: string
  onEditProfile: (section?: ProProfileSection) => void
  onViewRequests: () => void
}

type ProfilePayload = {
  userId: string
  displayName: string
  about: string | null
  cityId: number | null
  districtId: number | null
  experienceYears: number | null
  priceFrom: number | null
  priceTo: number | null
  isActive: boolean
  scheduleDays: string[]
  scheduleStart: string | null
  scheduleEnd: string | null
  worksAtClient: boolean
  worksAtMaster: boolean
  categories: string[]
  services: string[]
  portfolioUrls: string[]
  showcaseUrls: string[]
}

const MAX_PORTFOLIO_ITEMS = 6
const MAX_MEDIA_BYTES = 3 * 1024 * 1024
const allowedImageTypes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])

const showcaseAreas = ['a', 'b', 'c', 'd', 'e', 'f']

const clampUnit = (value: number) => Math.min(1, Math.max(0, value))

const resolveFocusPoint = (item?: PortfolioItem | null) => {
  const rawX = typeof item?.focusX === 'number' ? item.focusX : 0.5
  const rawY = typeof item?.focusY === 'number' ? item.focusY : 0.5
  const x = clampUnit(rawX)
  const y = clampUnit(rawY)
  return {
    x,
    y,
    position: `${x * 100}% ${y * 100}%`,
  }
}

export const ProCabinetScreen = ({
  apiBase,
  userId,
  displayNameFallback,
  onEditProfile,
  onViewRequests,
}: ProCabinetScreenProps) => {
  const [profile, setProfile] = useState<MasterProfile | null>(null)
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const portfolioUploadInputRef = useRef<HTMLInputElement>(null)
  const portfolioReplaceInputRef = useRef<HTMLInputElement>(null)
  const portfolioReplaceIndexRef = useRef<number | null>(null)
  const portfolioDragIndexRef = useRef<number | null>(null)
  const [portfolioDragOverIndex, setPortfolioDragOverIndex] = useState<
    number | null
  >(null)
  const [portfolioFocusIndex, setPortfolioFocusIndex] = useState<number | null>(
    null
  )
  const portfolioFocusPointerRef = useRef(false)
  const portfolioFocusIndexRef = useRef<number | null>(null)
  const lastSavedRef = useRef('')
  const saveTimerRef = useRef<number | null>(null)
  const isSavingRef = useRef(false)
  const queuedSaveRef = useRef(false)
  const hasLoadedRef = useRef(false)

  const displayNameValue =
    profile?.displayName?.trim() || displayNameFallback.trim() || 'Мастер'
  const portfolioKey = useMemo(
    () => JSON.stringify(toPortfolioStrings(portfolioItems)),
    [portfolioItems]
  )
  const hasShowcase = portfolioItems.length > 0
  const showAddTile =
    hasShowcase && portfolioItems.length < MAX_PORTFOLIO_ITEMS
  const mosaicItems = showAddTile ? [...portfolioItems, null] : portfolioItems
  const isBusy = isSaving || isUploading
  const showcaseSubtitle = hasShowcase
    ? `Работ в витрине: ${portfolioItems.length} из ${MAX_PORTFOLIO_ITEMS}`
    : `Добавьте до ${MAX_PORTFOLIO_ITEMS} лучших работ`
  const focusItem =
    portfolioFocusIndex !== null ? portfolioItems[portfolioFocusIndex] ?? null : null
  const focusPoint = resolveFocusPoint(focusItem)
  const focusIndex = portfolioFocusIndex ?? 0

  useEffect(() => {
    portfolioFocusIndexRef.current = portfolioFocusIndex
  }, [portfolioFocusIndex])

  useEffect(() => {
    if (portfolioFocusIndex !== null && !portfolioItems[portfolioFocusIndex]) {
      setPortfolioFocusIndex(null)
      portfolioFocusPointerRef.current = false
    }
  }, [portfolioFocusIndex, portfolioItems])

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    const loadProfile = async () => {
      setIsLoading(true)
      setLoadError('')

      try {
        const response = await fetch(`${apiBase}/api/masters/${userId}`)
        if (response.status === 404) {
          if (!cancelled) {
            const emptyProfile: MasterProfile = {
              userId,
              displayName: displayNameFallback.trim() || 'Мастер',
              about: null,
              cityId: null,
              districtId: null,
              experienceYears: null,
              priceFrom: null,
              priceTo: null,
              worksAtClient: true,
              worksAtMaster: false,
              categories: [],
              services: [],
              portfolioUrls: [],
              showcaseUrls: [],
              isActive: true,
              scheduleDays: [],
              scheduleStart: null,
              scheduleEnd: null,
            }
            setProfile(emptyProfile)
            setPortfolioItems([])
            lastSavedRef.current = JSON.stringify([])
          }
          return
        }
        if (!response.ok) {
          throw new Error('Load profile failed')
        }
        const data = (await response.json()) as MasterProfile
        if (!cancelled) {
          const parsedPortfolio = parsePortfolioItems(
            data.showcaseUrls ?? data.portfolioUrls ?? []
          ).slice(0, MAX_PORTFOLIO_ITEMS)
          setProfile(data)
          setPortfolioItems(parsedPortfolio)
          lastSavedRef.current = JSON.stringify(toPortfolioStrings(parsedPortfolio))
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError('Не удалось загрузить витрину работ.')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
          hasLoadedRef.current = true
        }
      }
    }

    loadProfile()

    return () => {
      cancelled = true
    }
  }, [apiBase, displayNameFallback, userId])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current)
      }
    }
  }, [])

  const buildPayload = (base: MasterProfile): ProfilePayload => ({
    userId: base.userId ?? userId,
    displayName:
      base.displayName?.trim() || displayNameFallback.trim() || 'Мастер',
    about: base.about?.trim() || null,
    cityId: base.cityId ?? null,
    districtId: base.districtId ?? null,
    experienceYears: base.experienceYears ?? null,
    priceFrom: base.priceFrom ?? null,
    priceTo: base.priceTo ?? null,
    isActive: base.isActive ?? true,
    scheduleDays: base.scheduleDays ?? [],
    scheduleStart: base.scheduleStart ?? null,
    scheduleEnd: base.scheduleEnd ?? null,
    worksAtClient: Boolean(base.worksAtClient),
    worksAtMaster: Boolean(base.worksAtMaster),
    categories: base.categories ?? [],
    services: base.services ?? [],
    portfolioUrls: Array.isArray(base.portfolioUrls) ? base.portfolioUrls : [],
    showcaseUrls: toPortfolioStrings(portfolioItems),
  })

  const savePortfolio = async () => {
    if (!profile) return
    if (isSavingRef.current) {
      queuedSaveRef.current = true
      return
    }
    if (portfolioKey === lastSavedRef.current) return

    const payload = buildPayload(profile)
    setSaveError('')
    setIsSaving(true)
    isSavingRef.current = true

    try {
      const response = await fetch(`${apiBase}/api/masters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error('Save profile failed')
      }

      lastSavedRef.current = portfolioKey
      setProfile((current) =>
        current
          ? {
              ...current,
              portfolioUrls: payload.portfolioUrls,
              showcaseUrls: payload.showcaseUrls,
            }
          : current
      )
    } catch (error) {
      setSaveError('Не удалось сохранить витрину. Попробуйте еще раз.')
    } finally {
      setIsSaving(false)
      isSavingRef.current = false
      if (queuedSaveRef.current) {
        queuedSaveRef.current = false
        void savePortfolio()
      }
    }
  }

  useEffect(() => {
    if (!hasLoadedRef.current) return
    if (portfolioKey === lastSavedRef.current) return
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current)
    }
    saveTimerRef.current = window.setTimeout(() => {
      void savePortfolio()
    }, 600)
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current)
      }
    }
  }, [portfolioKey])

  const validatePortfolioFile = (file: File) => {
    if (!allowedImageTypes.has(file.type)) {
      return 'Поддерживаются только PNG, JPG или WebP.'
    }
    if (file.size > MAX_MEDIA_BYTES) {
      return 'Файл слишком большой. Максимум 3 МБ.'
    }
    return ''
  }

  const readImageFileAsync = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : ''
        if (!result) {
          reject(new Error('read_failed'))
          return
        }
        resolve(result)
      }
      reader.onerror = () => reject(new Error('read_failed'))
      reader.readAsDataURL(file)
    })

  const resolveUploadError = (payload: { error?: string } | null) => {
    if (payload?.error === 'image_too_large') {
      return 'Файл слишком большой. Максимум 3 МБ.'
    }
    if (payload?.error === 'invalid_image') {
      return 'Формат изображения не поддерживается.'
    }
    if (payload?.error === 'userId_required') {
      return 'Не удалось загрузить файл. Нет пользователя.'
    }
    return 'Не удалось загрузить файл.'
  }

  const uploadPortfolioDataUrl = async (dataUrl: string) => {
    if (!userId) {
      throw new Error('Не удалось загрузить файл. Нет пользователя.')
    }
    const response = await fetch(`${apiBase}/api/masters/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, dataUrl }),
    })
    const payload = (await response.json().catch(() => null)) as {
      url?: string
      error?: string
    } | null
    if (!response.ok) {
      throw new Error(resolveUploadError(payload))
    }
    if (!payload?.url) {
      throw new Error('Не удалось загрузить файл.')
    }
    return payload.url
  }

  const uploadPortfolioFile = async (file: File) => {
    const dataUrl = await readImageFileAsync(file)
    return uploadPortfolioDataUrl(dataUrl)
  }

  const handlePortfolioUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    if (portfolioItems.length >= MAX_PORTFOLIO_ITEMS) {
      setSaveError(`Можно добавить максимум ${MAX_PORTFOLIO_ITEMS} работ.`)
      return
    }
    const remaining = MAX_PORTFOLIO_ITEMS - portfolioItems.length
    const selection = Array.from(files).slice(0, remaining)
    for (const file of selection) {
      const errorMessage = validatePortfolioFile(file)
      if (errorMessage) {
        setSaveError(errorMessage)
        return
      }
    }
    setIsUploading(true)
    setSaveError('')
    try {
      const uploadedUrls: string[] = []
      for (const file of selection) {
        const url = await uploadPortfolioFile(file)
        uploadedUrls.push(url)
      }
      setPortfolioItems((current) => {
        const next = [
          ...uploadedUrls.map((url) => ({
            url,
            title: null,
            focusX: 0.5,
            focusY: 0.5,
          })),
          ...current,
        ]
        return next.slice(0, MAX_PORTFOLIO_ITEMS)
      })
      setSaveError('')
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : 'Не удалось загрузить файл.'
      )
    } finally {
      setIsUploading(false)
    }
  }

  const handlePortfolioReplace = async (file: File, index: number) => {
    const errorMessage = validatePortfolioFile(file)
    if (errorMessage) {
      setSaveError(errorMessage)
      return
    }
    setIsUploading(true)
    setSaveError('')
    try {
      const url = await uploadPortfolioFile(file)
      setPortfolioItems((current) =>
        current.map((item, itemIndex) =>
          itemIndex === index ? { ...item, url, focusX: 0.5, focusY: 0.5 } : item
        )
      )
      setSaveError('')
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : 'Не удалось загрузить файл.'
      )
    } finally {
      setIsUploading(false)
    }
  }

  const handleAddClick = () => {
    if (isBusy) return
    portfolioUploadInputRef.current?.click()
  }

  const handleUploadChange = (event: ChangeEvent<HTMLInputElement>) => {
    void handlePortfolioUpload(event.target.files)
    event.target.value = ''
  }

  const handleReplaceClick = (index: number) => {
    portfolioReplaceIndexRef.current = index
    portfolioReplaceInputRef.current?.click()
  }

  const handleReplaceChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    const index = portfolioReplaceIndexRef.current
    if (!file || index === null || index === undefined) {
      event.target.value = ''
      return
    }
    void handlePortfolioReplace(file, index)
    event.target.value = ''
  }

  const removePortfolio = (index: number) => {
    setPortfolioItems((current) =>
      current.filter((_, itemIndex) => itemIndex !== index)
    )
    setSaveError('')
  }

  const handleDragStart = (
    event: DragEvent<HTMLButtonElement>,
    index: number
  ) => {
    portfolioDragIndexRef.current = index
    event.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (
    event: DragEvent<HTMLButtonElement>,
    index: number
  ) => {
    event.preventDefault()
    setPortfolioDragOverIndex(index)
  }

  const handleDragLeave = () => {
    setPortfolioDragOverIndex(null)
  }

  const handleDrop = (index: number, hasItem: boolean) => {
    const fromIndex = portfolioDragIndexRef.current
    const targetIndex = hasItem ? index : portfolioItems.length
    if (fromIndex === null || fromIndex === targetIndex) {
      setPortfolioDragOverIndex(null)
      return
    }
    setPortfolioItems((current) => {
      if (fromIndex < 0 || fromIndex >= current.length) return current
      const next = [...current]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(targetIndex, 0, moved)
      return next
    })
    portfolioDragIndexRef.current = null
    setPortfolioDragOverIndex(null)
  }

  const handleDragEnd = () => {
    portfolioDragIndexRef.current = null
    setPortfolioDragOverIndex(null)
  }

  const openFocusEditor = (index: number) => {
    const item = portfolioItems[index]
    if (!item || !isImageUrl(item.url)) return
    setPortfolioFocusIndex(index)
  }

  const closeFocusEditor = () => {
    setPortfolioFocusIndex(null)
    portfolioFocusPointerRef.current = false
  }

  const updateFocusFromEvent = (
    event: PointerEvent<HTMLDivElement>,
    index: number
  ) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = clampUnit((event.clientX - rect.left) / rect.width)
    const y = clampUnit((event.clientY - rect.top) / rect.height)
    setPortfolioItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, focusX: x, focusY: y } : item
      )
    )
  }

  const handleFocusPointerDown = (
    event: PointerEvent<HTMLDivElement>,
    index: number
  ) => {
    portfolioFocusPointerRef.current = true
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    updateFocusFromEvent(event, index)
  }

  const handleFocusPointerMove = (
    event: PointerEvent<HTMLDivElement>,
    index: number
  ) => {
    if (!portfolioFocusPointerRef.current) return
    updateFocusFromEvent(event, index)
  }

  const handleFocusPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    portfolioFocusPointerRef.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const handleTileClick = (index: number) => {
    const item = portfolioItems[index]
    if (!item) return
    if (!isImageUrl(item.url)) {
      window.open(item.url, '_blank', 'noopener,noreferrer')
      return
    }
    openFocusEditor(index)
  }

  return (
    <div className="screen screen--pro screen--pro-cabinet">
      <div className="pro-cabinet-shell">
        <section className="pro-cabinet-showcase animate delay-1">
          <div className="pro-cabinet-showcase-head">
            <div>
              <p className="pro-cabinet-showcase-eyebrow">{displayNameValue}</p>
              <h1 className="pro-cabinet-showcase-title">Витрина работ</h1>
              <p className="pro-cabinet-showcase-subtitle">{showcaseSubtitle}</p>
            </div>
          </div>
          {isLoading && <p className="pro-status">Загружаем витрину...</p>}
          {loadError && <p className="pro-error">{loadError}</p>}
          {saveError && <p className="pro-error">{saveError}</p>}
          <input
            ref={portfolioUploadInputRef}
            className="pro-file-input"
            type="file"
            accept="image/*"
            multiple
            onChange={handleUploadChange}
            aria-hidden="true"
            tabIndex={-1}
          />
          <input
            ref={portfolioReplaceInputRef}
            className="pro-file-input"
            type="file"
            accept="image/*"
            onChange={handleReplaceChange}
            aria-hidden="true"
            tabIndex={-1}
          />
          {!hasShowcase ? (
            <div className="pro-cabinet-showcase-panel">
              <div className="pro-cabinet-showcase-empty">
                <button
                  className="pro-cabinet-showcase-add"
                  type="button"
                  onClick={handleAddClick}
                  disabled={isBusy}
                >
                  + Добавить работу
                </button>
                <div className="pro-cabinet-showcase-preview">
                  <div className="pro-cabinet-showcase-sample">
                    <span className="pro-cabinet-showcase-sample-icon">✦</span>
                    <span className="pro-cabinet-showcase-sample-label">
                      Пример витрины
                    </span>
                  </div>
                  <p className="pro-cabinet-showcase-hint">
                    Перетащите, чтобы задать порядок. Нажмите на фото, чтобы
                    выбрать фокус кадра.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="pro-cabinet-showcase-panel">
              <div className="pro-cabinet-showcase-grid animate delay-2">
                {mosaicItems.map((item, index) => {
                  const gridArea = showcaseAreas[index]
                  const hasItem = Boolean(item?.url)
                  const isImage = item?.url ? isImageUrl(item.url) : false
                  const caption = item?.title?.trim() || 'Работа'
                  const focus = resolveFocusPoint(item)
                  const cardClassName = [
                    'pro-cabinet-showcase-card',
                    portfolioDragOverIndex === index ? 'is-drag-over' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')
                  const mediaClassName = [
                    'pro-cabinet-showcase-media',
                    hasItem ? 'is-draggable' : '',
                    !isImage && hasItem ? 'is-link' : '',
                    !hasItem ? 'is-add' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')

                  return (
                    <article
                      className={cardClassName}
                      key={`${item?.url ?? 'add'}-${index}`}
                      style={gridArea ? { gridArea } : undefined}
                    >
                      {hasItem ? (
                        <button
                          className={mediaClassName}
                          type="button"
                          onClick={() => handleTileClick(index)}
                          draggable
                          onDragStart={(event) => handleDragStart(event, index)}
                          onDragOver={(event) => handleDragOver(event, index)}
                          onDragLeave={handleDragLeave}
                          onDrop={() => handleDrop(index, true)}
                          onDragEnd={handleDragEnd}
                        >
                          {isImage ? (
                            <img
                              src={item?.url ?? ''}
                              alt={caption}
                              loading="lazy"
                              style={{ objectPosition: focus.position }}
                            />
                          ) : (
                            <span className="pro-cabinet-showcase-link">LINK</span>
                          )}
                        </button>
                      ) : (
                        <button
                          className={mediaClassName}
                          type="button"
                          onClick={handleAddClick}
                          onDragOver={(event) => handleDragOver(event, index)}
                          onDrop={() => handleDrop(index, false)}
                        >
                          <span className="pro-cabinet-showcase-add-icon">+</span>
                        </button>
                      )}
                    </article>
                  )
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      {focusItem && (
        <div className="pro-portfolio-focus-overlay" role="dialog" aria-modal="true">
          <div className="pro-portfolio-focus-card">
            <div className="pro-portfolio-focus-header">
              <div>
                <p className="pro-portfolio-focus-kicker">Кадрирование</p>
                <h3 className="pro-portfolio-focus-title">Выберите фокус</h3>
              </div>
              <button
                className="pro-portfolio-focus-close"
                type="button"
                onClick={closeFocusEditor}
              >
                Готово
              </button>
            </div>
            <div
              className="pro-portfolio-focus-preview"
              onPointerDown={(event) => handleFocusPointerDown(event, focusIndex)}
              onPointerMove={(event) => handleFocusPointerMove(event, focusIndex)}
              onPointerUp={handleFocusPointerUp}
              onPointerLeave={handleFocusPointerUp}
              role="presentation"
            >
              <img
                src={focusItem.url}
                alt={focusItem.title ?? 'Фокус'}
                style={{ objectPosition: focusPoint.position }}
              />
              <span
                className="pro-portfolio-focus-point"
                style={{
                  left: `${focusPoint.x * 100}%`,
                  top: `${focusPoint.y * 100}%`,
                }}
                aria-hidden="true"
              />
            </div>
            <div className="pro-portfolio-focus-actions">
              <button
                className="pro-portfolio-focus-action"
                type="button"
                onClick={() => handleReplaceClick(focusIndex)}
              >
                Заменить
              </button>
              <button
                className="pro-portfolio-focus-action is-danger"
                type="button"
                onClick={() => {
                  removePortfolio(focusIndex)
                  closeFocusEditor()
                }}
              >
                Удалить
              </button>
            </div>
            <p className="pro-portfolio-focus-hint">
              Перетащите точку, чтобы выбрать главный фокус кадра.
            </p>
          </div>
        </div>
      )}

      <ProBottomNav
        active="cabinet"
        onCabinet={() => {}}
        onRequests={onViewRequests}
        onProfile={() => onEditProfile()}
      />
    </div>
  )
}
