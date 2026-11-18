import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import '../lib/amplify'; // garante Amplify.configure

/** Cliente da API com login do staff (Cognito User Pool). */
export const staffClient = generateClient<Schema>({ authMode: 'userPool' });

export type OrderStatus = 'aguardando_pagamento' | 'pago' | 'pronto' | 'retirado' | 'cancelado';
export type Order = Schema['Order']['type'];
export type PfandBox = Schema['PfandBox']['type'];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  aguardando_pagamento: 'Zahlung offen',
  pago: 'Bezahlt',
  pronto: 'Abholbereit',
  retirado: 'Abgeholt',
  cancelado: 'Storniert',
};

/** Data de hoje (Europe/Berlin) no formato YYYY-MM-DD. */
export const todayBerlin = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());

/** "2026-11-18" → "18.11.2026" */
export const formatDate = (isoDate: string) => {
  const [y, m, d] = isoDate.split('-');
  return `${d}.${m}.${y}`;
};

/** Primeira mensagem de erro de uma resposta da API (ou exceção). */
export const errorMessage = (errors?: readonly { message: string }[] | null, fallback = 'Unbekannter Fehler.') =>
  errors?.[0]?.message ?? fallback;
