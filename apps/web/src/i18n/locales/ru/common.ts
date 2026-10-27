import type { common as en } from '../en/common';
import type { Translation } from '../../types';

export const common: Translation<typeof en> = {
  app: 'Buildkit',
  loading: 'Загрузка…',
  mm: 'мм',
  cancel: 'Отмена',
  ok: 'OK',
  delete: 'Удалить',
  close: 'Закрыть',
  theme: { label: 'Тема', light: 'Светлая', dark: 'Тёмная', system: 'Как в системе' },
  language: { label: 'Язык' },
  nav: { mode: 'Режим' },
  tools: { piles: { name: 'Свайное поле', description: 'Свайные поля под контейнеры: проект и разбивка на участке рулеткой.' } },
  modes: { design: 'Проект', fieldwork: 'Разбивка' },
  fitDrawing: 'Показать всё',
};
