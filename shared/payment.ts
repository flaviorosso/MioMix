/** Regras de pagamento compartilhadas (página + Lambdas). */

/** Tempo para pagar no Stripe Checkout (mínimo do Stripe: 30 min). */
export const PAYMENT_WINDOW_MINUTES = 30;

/** Pedidos não pagos mais antigos que isso são cancelados pela limpeza automática. */
export const UNPAID_EXPIRY_MINUTES = 45;

/** Origens aceitas para voltar do Stripe (evita redirecionamento para sites de terceiros). */
export const ALLOWED_ORIGINS = [
  'https://main.d3coz731pa9496.amplifyapp.com',
  'http://localhost:5173',
];
export const DEFAULT_ORIGIN = ALLOWED_ORIGINS[0];
