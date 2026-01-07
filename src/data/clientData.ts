import categoryBeautyNails from '../assets/categories/beauty-nails.webp'
import categoryBrowsLashes from '../assets/categories/brows-lashes.webp'
import categoryHair from '../assets/categories/hair.webp'
import categoryMakeupLook from '../assets/categories/makeup-look.webp'
import categoryCosmetologyCare from '../assets/categories/cosmetology-care.webp'
import categoryMassageBody from '../assets/categories/massage-body.webp'
import categoryFitnessHealth from '../assets/categories/fitness-health.webp'
import categoryHomeFamily from '../assets/categories/home-family.webp'
import popularNails from '../assets/popular/nails.webp'
import popularBrowsLashes from '../assets/popular/brows-lashes.webp'
import popularCleaning from '../assets/popular/cleaning.webp'
import popularNanny from '../assets/popular/nanny.webp'

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

export const categoryItems = [
  { id: 'beauty-nails', icon: categoryBeautyNails, label: 'Красота и ногти' },
  { id: 'brows-lashes', icon: categoryBrowsLashes, label: 'Брови и ресницы' },
  { id: 'hair', icon: categoryHair, label: 'Волосы' },
  { id: 'makeup-look', icon: categoryMakeupLook, label: 'Макияж и образ' },
  {
    id: 'cosmetology-care',
    icon: categoryCosmetologyCare,
    label: 'Косметология и уход',
  },
  { id: 'massage-body', icon: categoryMassageBody, label: 'Массаж и тело' },
  { id: 'fitness-health', icon: categoryFitnessHealth, label: 'Фитнес и здоровье' },
  { id: 'home-family', icon: categoryHomeFamily, label: 'Дом и семья' },
] as const
