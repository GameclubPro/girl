import categoryBeautyNails from '../assets/categories/beauty-nails.webp'
import categoryBrowsLashes from '../assets/categories/brows-lashes.webp'
import categoryHair from '../assets/categories/hair.webp'
import categoryCosmetologyCare from '../assets/categories/cosmetology-care.webp'
import popularNails from '../assets/popular/nails.webp'
import popularBrowsLashes from '../assets/popular/brows-lashes.webp'
import popularCleaning from '../assets/popular/cleaning.webp'
import popularNanny from '../assets/popular/nanny.webp'
import collectionBudgetArt from '../assets/collections/collection-budget.webp'
import collectionExpressArt from '../assets/collections/collection-express.png'
import collectionStarsArt from '../../ChatGPT Image Feb 1, 2026, 01_24_43 AM (1) (1).webp'
import collectionVisitArt from '../assets/collections/collection-visit.webp'
import collectionVerifiedArt from '../assets/collections/collection-verified.webp'
import storyAvatarOne from '../assets/kiven-girl-1.webp'
import storyAvatarTwo from '../assets/kiven-girl-2.webp'

export type CollectionItem = {
  id: string
  badge: string
  label: string
  title: string
  meta: string
  tone: 'lavender' | 'sun' | 'mint' | 'rose' | 'sky'
  categoryId?: string | null
  cornerImage?: string
  cornerImagePosition?: 'bottom-right' | 'right'
  cornerImageSize?: string
  cornerImageRight?: string
  cornerImageBottom?: string
  cornerImageRotate?: string
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
    id: 'promotions',
    badge: '🔥',
    label: 'Акции',
    title: 'Спецпредложения',
    meta: 'Скидки и бонусы',
    tone: 'sky',
    categoryId: null,
    cornerImage: collectionBudgetArt,
    cornerImagePosition: 'bottom-right',
    cornerImageSize: 'clamp(120px, 42vw, 180px)',
    cornerImageRight: '0px',
    cornerImageBottom: '0px',
  },
  {
    id: 'verified',
    badge: '✅',
    label: 'Проверено',
    title: 'Проверенные мастера',
    meta: '4.9 ★ и выше',
    tone: 'lavender',
    categoryId: null,
    cornerImage: collectionVerifiedArt,
    cornerImagePosition: 'right',
    cornerImageSize: 'clamp(90px, 32vw, 140px)',
    cornerImageRight: '10px',
    cornerImageRotate: '8deg',
  },
  {
    id: 'visit',
    badge: '🚗',
    label: 'Сегодня',
    title: 'Выезд сегодня',
    meta: 'Ближайшие 2 часа',
    tone: 'sun',
    categoryId: null,
    cornerImage: collectionVisitArt,
    cornerImagePosition: 'bottom-right',
    cornerImageSize: 'clamp(120px, 40vw, 170px)',
    cornerImageRight: '0px',
    cornerImageBottom: '0px',
  },
  {
    id: 'budget',
    badge: '₽',
    label: 'Бюджет',
    title: 'До 2000 ₽',
    meta: 'Фиксированные цены',
    tone: 'mint',
    categoryId: null,
    cornerImage: collectionBudgetArt,
    cornerImagePosition: 'bottom-right',
    cornerImageSize: 'clamp(130px, 48vw, 200px)',
  },
  {
    id: 'express',
    badge: '⚡',
    label: 'Срочно',
    title: 'Экспресс-сервис',
    meta: 'Ответ за 10 минут',
    tone: 'rose',
    categoryId: null,
    cornerImage: collectionExpressArt,
    cornerImagePosition: 'bottom-right',
    cornerImageSize: 'clamp(120px, 40vw, 170px)',
    cornerImageRight: '0px',
    cornerImageBottom: '0px',
  },
  {
    id: 'stars',
    badge: '⭐',
    label: 'Топ недели',
    title: 'Звезды недели',
    meta: 'Лучшие отзывы',
    tone: 'sky',
    categoryId: null,
    cornerImage: collectionStarsArt,
    cornerImagePosition: 'bottom-right',
    cornerImageSize: 'clamp(90px, 30vw, 140px)',
    cornerImageRight: '0px',
    cornerImageBottom: '0px',
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
