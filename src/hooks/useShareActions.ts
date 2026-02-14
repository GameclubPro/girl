import { useCallback, useEffect, useRef, useState } from 'react'
import {
  copyToClipboard,
  openShareLink,
  resolveShareEnvHint,
} from '../utils/telegramShare'

type UseShareActionsParams = {
  shareLink: string
  shareConfigured: boolean
}

export const useShareActions = ({
  shareLink,
  shareConfigured,
}: UseShareActionsParams) => {
  const [status, setStatus] = useState('')
  const timerRef = useRef<number | null>(null)

  const setMessage = useCallback((message: string) => {
    setStatus(message)
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
    }
    timerRef.current = window.setTimeout(() => {
      setStatus('')
    }, 2400)
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
      }
    }
  }, [])

  const guardLink = useCallback(() => {
    if (shareLink) return true
    setMessage(
      shareConfigured
        ? 'Ссылка пока недоступна.'
        : resolveShareEnvHint()
    )
    return false
  }, [setMessage, shareConfigured, shareLink])

  const openShare = useCallback(
    (text: string) => {
      if (!guardLink()) return
      void openShareLink(shareLink, text)
      setMessage('Открываем шаринг...')
    },
    [guardLink, setMessage, shareLink]
  )

  const copyShare = useCallback(
    async (text: string) => {
      if (!guardLink()) return
      const payload = `${text}\n${shareLink}`.trim()
      const success = await copyToClipboard(payload)
      setMessage(success ? 'Текст скопирован.' : 'Не удалось скопировать.')
    },
    [guardLink, setMessage, shareLink]
  )

  return {
    status,
    openShare,
    copyShare,
  }
}
