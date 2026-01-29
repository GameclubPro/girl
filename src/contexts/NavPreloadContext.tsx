import { createContext, useContext } from 'react'

type NavPreloadHandler = (view: string) => void

export const NavPreloadContext = createContext<NavPreloadHandler | null>(null)

export const useNavPreload = () => useContext(NavPreloadContext)
