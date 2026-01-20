import { useEffect } from 'react'

type MainButtonOptions = {
  text: string
  isVisible: boolean
  isEnabled?: boolean
  isLoading?: boolean
  onClick?: () => void
  color?: string
  textColor?: string
}

export const useTelegramMainButton = ({
  text,
  isVisible,
  isEnabled = true,
  isLoading = false,
  onClick,
  color,
  textColor,
}: MainButtonOptions) => {
  useEffect(() => {
    const webApp = window.Telegram?.WebApp
    const button = webApp?.MainButton
    if (!button) return undefined

    button.setText(text)
    if (color) {
      button.color = color
    }
    if (textColor) {
      button.textColor = textColor
    }
    if (isVisible) {
      button.show()
    } else {
      button.hide()
    }

    if (isEnabled) {
      button.enable()
    } else {
      button.disable()
    }

    if (isLoading) {
      button.showProgress()
    } else {
      button.hideProgress()
    }

    const handleClick = () => {
      onClick?.()
    }

    if (onClick) {
      button.onClick(handleClick)
    }

    return () => {
      if (onClick) {
        button.offClick(handleClick)
      }
      if (isVisible) {
        button.hide()
      }
    }
  }, [color, isEnabled, isLoading, isVisible, onClick, text, textColor])
}
