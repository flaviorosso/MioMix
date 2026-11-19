import { LOCALE, type Lang } from '../../shared/lang';

const euroFmt: Partial<Record<Lang, Intl.NumberFormat>> = {};
const deadlineFmt: Partial<Record<Lang, Intl.DateTimeFormat>> = {};

/** 1200 → "12,00 €" (de) · "€ 12,00" (pt) · "€12.00" (en) */
export const formatCents = (cents: number, lang: Lang = 'de') =>
  (euroFmt[lang] ??= new Intl.NumberFormat(LOCALE[lang], { style: 'currency', currency: 'EUR' })).format(cents / 100);

/** ISO → "Mi., 18.11., 21:07 Uhr" (de) · "qua., 18/11, 21:07" (pt) · "Wed 18/11, 21:07" (en), sempre no horário de Berlim. */
export const formatDeadline = (iso: string, lang: Lang = 'de') => {
  const fmt = (deadlineFmt[lang] ??= new Intl.DateTimeFormat(LOCALE[lang], {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Berlin',
  }));
  return `${fmt.format(new Date(iso))}${lang === 'de' ? ' Uhr' : ''}`;
};
