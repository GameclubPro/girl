import categoryBeautyNails from '../assets/categories/beauty-nails.webp'
import categoryBrowsLashes from '../assets/categories/brows-lashes.webp'
import categoryHair from '../assets/categories/hair.webp'
import categoryCosmetologyCare from '../assets/categories/cosmetology-care.webp'
import popularNails from '../assets/popular/nails.webp'
import popularBrowsLashes from '../assets/popular/brows-lashes.webp'
import popularCleaning from '../assets/popular/cleaning.webp'
import popularNanny from '../assets/popular/nanny.webp'
import storyAvatarOne from '../assets/kiven-girls.webp'
import storyAvatarTwo from '../assets/kiven-girls1.webp'

export type CollectionItem = {
  id: string
  badge: string
  label: string
  title: string
  meta: string
  tone: 'lavender' | 'sun' | 'mint' | 'rose' | 'sky'
  categoryId?: string | null
}

export type PopularItem = {
  id: string
  image: string
  label: string
  categoryId: string
}

export type StoryItem = {
  id: string
  name: string
  specialty: string
  avatar: string
}

export const collectionItems = [
  {
    id: 'verified',
    badge: '✅',
    label: 'Проверено',
    title: 'Проверенные мастера',
    meta: '4.9 ★ и выше',
    tone: 'lavender',
    categoryId: null,
  },
  {
    id: 'visit',
    badge: '🚗',
    label: 'Сегодня',
    title: 'Выезд сегодня',
    meta: 'Ближайшие 2 часа',
    tone: 'sun',
    categoryId: null,
  },
  {
    id: 'budget',
    badge: '₽',
    label: 'Бюджет',
    title: 'До 2000 ₽',
    meta: 'Фиксированные цены',
    tone: 'mint',
    categoryId: null,
  },
  {
    id: 'express',
    badge: '⚡',
    label: 'Срочно',
    title: 'Экспресс-сервис',
    meta: 'Ответ за 10 минут',
    tone: 'rose',
    categoryId: null,
  },
  {
    id: 'stars',
    badge: '⭐',
    label: 'Топ недели',
    title: 'Звезды недели',
    meta: 'Лучшие отзывы',
    tone: 'sky',
    categoryId: null,
  },
] satisfies CollectionItem[]

export const popularItems = [
  {
    id: 'manicure',
    image: popularNails,
    label: 'Маникюр',
    categoryId: 'beauty-nails',
  },
  {
    id: 'brow-shaping',
    image: popularCleaning,
    label: 'Оформление бровей',
    categoryId: 'brows-lashes',
  },
  {
    id: 'haircut',
    image: popularNanny,
    label: 'Стрижка',
    categoryId: 'hair',
  },
  {
    id: 'lash-extensions',
    image: popularBrowsLashes,
    label: 'Наращивание ресниц',
    categoryId: 'brows-lashes',
  },
] satisfies PopularItem[]

export const storyItems = [
  { id: 'anna', name: 'Анна', specialty: 'Брови', avatar: storyAvatarOne },
  { id: 'maria-1', name: 'Мария', specialty: 'Маникюр', avatar: storyAvatarTwo },
  { id: 'maria-2', name: 'Мария', specialty: 'Маникюр', avatar: storyAvatarOne },
  { id: 'elena-1', name: 'Елена', specialty: 'Косметология', avatar: storyAvatarTwo },
  { id: 'elena-2', name: 'Елена', specialty: 'Косметология', avatar: storyAvatarOne },
  { id: 'elena-3', name: 'Елена', specialty: 'Косметология', avatar: storyAvatarTwo },
] satisfies StoryItem[]

export const categoryItems = [
  { id: 'beauty-nails', icon: categoryBeautyNails, label: 'Ногти' },
  { id: 'brows-lashes', icon: categoryBrowsLashes, label: 'Брови и ресницы' },
  { id: 'hair', icon: categoryHair, label: 'Волосы' },
  {
    id: 'cosmetology-care',
    icon: categoryCosmetologyCare,
    label: 'Уход за лицом',
  },
] as const
