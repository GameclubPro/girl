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
  'makeup-look': [
    { title: 'Дневной макияж', subtitle: 'Легкий и свежий' },
    { title: 'Вечерний макияж', subtitle: 'Акцент / сияние' },
    { title: 'Свадебный образ', subtitle: 'Стойкий макияж' },
    { title: 'Макияж для фото', subtitle: 'Тон + свет' },
    { title: 'Экспресс-макияж', subtitle: '20–30 минут' },
    { title: 'Укладка', subtitle: 'Локоны / гладко' },
    { title: 'Образ для события', subtitle: 'Макияж + волосы' },
    { title: 'Стилистика', subtitle: 'Подбор образа' },
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
  'massage-body': [
    { title: 'Массаж спины', subtitle: 'Расслабление / тонус' },
    { title: 'Общий массаж', subtitle: 'Все тело' },
    { title: 'Антицеллюлитный', subtitle: 'Коррекция' },
    { title: 'Лимфодренаж', subtitle: 'Легкость' },
    { title: 'Спортивный массаж', subtitle: 'Восстановление' },
    { title: 'Обертывание', subtitle: 'Детокс' },
    { title: 'Массаж шеи', subtitle: 'Снятие спазма' },
    { title: 'SPA-ритуал', subtitle: 'Масла / релакс' },
  ],
  'fitness-health': [
    { title: 'Персональная тренировка', subtitle: 'Зал / дом' },
    { title: 'Йога', subtitle: 'Баланс / растяжка' },
    { title: 'Растяжка', subtitle: 'Гибкость' },
    { title: 'Пилатес', subtitle: 'Стабилизация' },
    { title: 'ЛФК', subtitle: 'Спина / осанка' },
    { title: 'Функциональная', subtitle: 'Сила / выносливость' },
    { title: 'Для похудения', subtitle: 'Кардио / тонус' },
    { title: 'Мягкий старт', subtitle: 'Здоровая спина' },
  ],
  'home-family': [
    { title: 'Генеральная уборка', subtitle: 'Кухня / санузлы' },
    { title: 'Поддерживающая уборка', subtitle: 'Регулярно' },
    { title: 'Уборка после ремонта', subtitle: 'Глубокая' },
    { title: 'Няня', subtitle: 'Дети / игры' },
    { title: 'Сиделка', subtitle: 'Уход / помощь' },
    { title: 'Домашний помощник', subtitle: 'Быт / поручения' },
    { title: 'Выгул собак', subtitle: 'Прогулки' },
    { title: 'Сопровождение детей', subtitle: 'Школа / кружки' },
  ],
}

export const requestBudgetOptions = [
  'до 1500 ₽',
  'до 2000 ₽',
  'до 3000 ₽',
  'не важно',
] as const
