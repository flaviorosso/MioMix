import { formatWeeklyHours, parseWeeklyHours } from '../../shared/hours';
import type { Lang } from '../../shared/lang';

/** Horário do ponto no idioma do cliente; se não houver horário estruturado, usa o texto salvo. */
export const pickupHoursText = (weeklyHours: unknown, fallback: string | null | undefined, lang: Lang) =>
  formatWeeklyHours(parseWeeklyHours(weeklyHours), lang) || (fallback ?? '');
