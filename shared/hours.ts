/**
 * Horário de funcionamento dos pontos de retirada e cálculo do prazo de retirada.
 * Todos os horários são no fuso de Berlim. Usado pelas Lambdas e pelo site.
 */

export const TIME_ZONE = 'Europe/Berlin';

/** Dias da semana: 0 = segunda … 6 = domingo. */
export const WEEKDAYS_DE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;
export const WEEKDAYS_DE_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'] as const;
export const WEEKDAYS_PT_LONG = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'] as const;

/** Abreviações e "todos os dias" por idioma, para o texto do horário. */
const SHORT_DAYS = {
  de: WEEKDAYS_DE,
  pt: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
} as const;
const DAILY = { de: 'Täglich', pt: 'Todos os dias', en: 'Daily' } as const;
type HoursLang = keyof typeof SHORT_DAYS;

/** Um dia aberto. Dias que não aparecem na lista estão fechados. */
export interface OpeningDay {
  day: number; // 0 = Mo … 6 = So
  open: string; // "HH:MM"
  close: string; // "HH:MM" (depois de open, no mesmo dia)
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Lê o horário vindo do banco (pode chegar como texto JSON ou já como lista) e descarta entradas inválidas. */
export function parseWeeklyHours(raw: unknown): OpeningDay[] {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const days = new Map<number, OpeningDay>();
  for (const d of value) {
    if (!d || typeof d !== 'object') continue;
    const { day, open, close } = d as Record<string, unknown>;
    if (typeof day !== 'number' || day < 0 || day > 6 || !Number.isInteger(day)) continue;
    if (typeof open !== 'string' || typeof close !== 'string') continue;
    if (!TIME_RE.test(open) || !TIME_RE.test(close) || close <= open) continue;
    days.set(day, { day, open, close });
  }
  return [...days.values()].sort((a, b) => a.day - b.day);
}

/** Valida o horário antes de salvar; devolve uma mensagem em alemão ou null se estiver ok. */
export function validateWeeklyHours(days: OpeningDay[]): string | null {
  for (const d of days) {
    if (!TIME_RE.test(d.open) || !TIME_RE.test(d.close)) return `${WEEKDAYS_DE_LONG[d.day]}: Uhrzeit im Format HH:MM angeben.`;
    if (d.close <= d.open) return `${WEEKDAYS_DE_LONG[d.day]}: Schließzeit muss nach der Öffnungszeit liegen.`;
  }
  return null;
}

/** Texto curto para o cliente, agrupando dias seguidos com o mesmo horário: "Mi–Mo 16:00–22:00". */
export function formatWeeklyHours(days: OpeningDay[], lang: HoursLang = 'de'): string {
  if (days.length === 0) return '';
  const names = SHORT_DAYS[lang];
  const byDay = new Map(days.map((d) => [d.day, `${d.open}–${d.close}`]));
  if (byDay.size === 7 && new Set(byDay.values()).size === 1) return `${DAILY[lang]} ${days[0].open}–${days[0].close}`;

  // Começa a contagem logo depois de um dia fechado, para "Mi–Mo" sair inteiro (atravessando o domingo).
  let start = 0;
  for (let i = 0; i < 7; i++) {
    if (!byDay.has(i)) {
      start = (i + 1) % 7;
      break;
    }
  }
  const groups: { from: number; to: number; time: string }[] = [];
  for (let k = 0; k < 7; k++) {
    const day = (start + k) % 7;
    const time = byDay.get(day);
    if (!time) continue;
    const last = groups[groups.length - 1];
    if (last && last.time === time && (last.to + 1) % 7 === day) last.to = day;
    else groups.push({ from: day, to: day, time });
  }
  return groups
    .map((g) => {
      const span = g.from === g.to ? names[g.from] : `${names[g.from]}–${names[g.to]}`;
      return `${span} ${g.time}`;
    })
    .join(', ');
}

// ---------------------------------------------------------------------------
// Fuso horário sem bibliotecas: converte entre UTC e a hora local de Berlim.
// ---------------------------------------------------------------------------

interface LocalParts {
  year: number;
  month: number; // 1–12
  dayOfMonth: number;
  weekday: number; // 0 = Mo
  minutes: number; // minutos desde 00:00
}

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
});
const WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

function localParts(date: Date): LocalParts {
  const p = Object.fromEntries(partsFormatter.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    dayOfMonth: Number(p.day),
    weekday: WEEKDAY_INDEX[p.weekday],
    minutes: Number(p.hour) * 60 + Number(p.minute),
  };
}

/** Instante UTC correspondente a uma data/hora local de Berlim (trata horário de verão). */
function berlinToUtc(year: number, month: number, dayOfMonth: number, minutes: number): Date {
  const guess = Date.UTC(year, month - 1, dayOfMonth, 0, minutes);
  // Diferença entre o que Berlim mostra nesse instante e o valor desejado = deslocamento do fuso.
  const offset = (d: number) => {
    const p = localParts(new Date(d));
    return Date.UTC(p.year, p.month - 1, p.dayOfMonth, 0, p.minutes) - d;
  };
  const first = guess - offset(guess);
  return new Date(guess - offset(first));
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * Prazo de retirada: `paidAt + windowHours`. Se esse momento cair com o ponto fechado,
 * o prazo passa a ser o horário de fechamento do próximo dia aberto.
 * Sem horário cadastrado, devolve simplesmente `paidAt + windowHours`.
 */
export function computePickupDeadline(paidAt: Date, rawHours: unknown, windowHours: number): Date {
  const target = new Date(paidAt.getTime() + windowHours * 3600_000);
  const days = parseWeeklyHours(rawHours);
  if (days.length === 0) return target;
  const byDay = new Map(days.map((d) => [d.day, d]));

  const t = localParts(target);
  const today = byDay.get(t.weekday);
  if (today && t.minutes >= toMinutes(today.open) && t.minutes < toMinutes(today.close)) return target;

  // Procura o próximo dia aberto (hoje, se ainda não abriu, ou os dias seguintes).
  // Aritmética de calendário (não de 24 h), para não pular dias na troca de horário de verão.
  for (let offset = 0; offset <= 7; offset++) {
    const day = byDay.get((t.weekday + offset) % 7);
    if (!day) continue;
    if (offset === 0 && t.minutes >= toMinutes(day.open)) continue; // hoje já fechou
    const cal = new Date(Date.UTC(t.year, t.month - 1, t.dayOfMonth + offset));
    return berlinToUtc(cal.getUTCFullYear(), cal.getUTCMonth() + 1, cal.getUTCDate(), toMinutes(day.close));
  }
  return target;
}
