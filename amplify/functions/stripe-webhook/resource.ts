import { defineFunction, secret } from '@aws-amplify/backend';

/** Recebe os avisos do Stripe (URL pública, assinatura verificada). */
export const stripeWebhook = defineFunction({
  name: 'stripe-webhook',
  entry: './handler.ts',
  timeoutSeconds: 20,
  resourceGroupName: 'data',
  environment: {
    STRIPE_SECRET_KEY: secret('STRIPE_SECRET_KEY'),
    STRIPE_WEBHOOK_SECRET: secret('STRIPE_WEBHOOK_SECRET'),
  },
});
