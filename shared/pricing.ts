/**
 * Preços e regras do pedido — fonte única para a página e para a Lambda place-order.
 * O servidor sempre recalcula com estes valores; o navegador só exibe.
 * Valores em centavos de euro. PROVISÓRIOS.
 */
export const BOX_SIZES = [4, 6, 8] as const;
export type BoxSize = (typeof BOX_SIZES)[number];

export const PRICES_CENTS: Record<BoxSize, number> = {
  4: 1200,
  6: 1700,
  8: 2200,
};

export const PFAND_CENTS = 300;
export const CUP_GRAMS = 160;
export const PICKUP_WINDOW_HOURS = 24;

export const isBoxSize = (n: number): n is BoxSize => (BOX_SIZES as readonly number[]).includes(n);
