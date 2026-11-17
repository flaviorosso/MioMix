const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

/** 1200 → "12,00 €" */
export const formatCents = (cents: number) => euro.format(cents / 100);

const deadlineFmt = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Berlin',
});

/** ISO → "Mi., 18.11., 21:07 Uhr" */
export const formatDeadline = (iso: string) => `${deadlineFmt.format(new Date(iso))} Uhr`;
