import { defineFunction, secret } from '@aws-amplify/backend';

export const placeOrder = defineFunction({
  name: 'place-order',
  entry: './handler.ts',
  timeoutSeconds: 20,
  // Mesmo stack da API de dados: a API chama a função e a função acessa as tabelas.
  resourceGroupName: 'data',
  environment: {
    STRIPE_SECRET_KEY: secret('STRIPE_SECRET_KEY'),
  },
});
