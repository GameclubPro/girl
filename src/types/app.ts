export type City = {
  id: number
  name: string
}

export type District = {
  id: number
  cityId: number
  name: string
}

export type Role = 'client' | 'pro'
