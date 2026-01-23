export type RequestServiceOption = {
  title: string
  subtitle: string
}

export const requestServiceCatalog: Record<string, RequestServiceOption[]> = {
  'beauty-nails': [
    { title: 'Маникюр', subtitle: 'Комби / аппаратный' },
    { title: 'Укрепление', subtitle: 'Гель / акрил / био' },
    { title: 'Педикюр', subtitle: 'Стопы / пальчики' },
    { title: 'Дизайн / френч', subtitle: 'Минимализм / арт' },
    { title: 'Гель-лак', subtitle: 'Однотон / нюд' },
    { title: 'Снятие / коррекция', subtitle: 'Снятие + форма' },
    { title: 'Наращивание', subtitle: 'Гель / полигель' },
    { title: 'SPA-уход', subtitle: 'Парафин / скраб' },
  ],
  'brows-lashes': [
    { title: 'Оформление бровей', subtitle: 'Форма + воском' },
    { title: 'Ламинирование бровей', subtitle: 'Укладка + питание' },
    { title: 'Окрашивание бровей', subtitle: 'Хна / краска' },
    { title: 'Коррекция бровей', subtitle: 'Пинцет / воск' },
    { title: 'Наращивание ресниц', subtitle: 'Классика / 2D' },
    { title: 'Ламинирование ресниц', subtitle: 'Изгиб + уход' },
    { title: 'Снятие ресниц', subtitle: 'Аккуратно и быстро' },
    { title: 'Окрашивание ресниц', subtitle: 'Краска / уход' },
  ],
  hair: [
    { title: 'Стрижка', subtitle: 'Женская / мужская' },
    { title: 'Окрашивание', subtitle: 'Тон / блонд' },
    { title: 'Укладка', subtitle: 'Повседневная / вечерняя' },
    { title: 'Уход', subtitle: 'Ботокс / кератин' },
    { title: 'Тонирование', subtitle: 'Блонд / глянец' },
    { title: 'Наращивание', subtitle: 'Капсулы / ленты' },
    { title: 'Сложное окрашивание', subtitle: 'Шатуш / балаяж' },
    { title: 'Полировка', subtitle: 'Уход + длина' },
  ],
  'cosmetology-care': [
    { title: 'Чистка лица', subtitle: 'УЗ / механика' },
    { title: 'Пилинг', subtitle: 'Поверхностный / средний' },
    { title: 'Уходовый комплекс', subtitle: 'Очищение + маска' },
    { title: 'Массаж лица', subtitle: 'Лимфодренаж' },
    { title: 'Микротоки', subtitle: 'Тонус / лифтинг' },
    { title: 'Карбокситерапия', subtitle: 'Сияние кожи' },
    { title: 'Эпиляция лица', subtitle: 'Воск / сахар' },
    { title: 'SOS-уход', subtitle: 'Перед событием' },
  ],
}

export type RequestBudgetPreset = {
  label: string
  min: number | null
  max: number | null
  isCustom?: boolean
}

export const requestBudgetPresets: RequestBudgetPreset[] = [
  { label: 'до 1500 ₽', min: null, max: 1500 },
  { label: 'до 2500 ₽', min: null, max: 2500 },
  { label: 'до 4000 ₽', min: null, max: 4000 },
  { label: '3000–6000 ₽', min: 3000, max: 6000 },
  { label: 'не важно', min: null, max: null },
  { label: 'Свой диапазон', min: null, max: null, isCustom: true },
]
