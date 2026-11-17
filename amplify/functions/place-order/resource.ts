import { defineFunction } from '@aws-amplify/backend';

export const placeOrder = defineFunction({
  name: 'place-order',
  entry: './handler.ts',
  timeoutSeconds: 15,
  // Mesmo stack da API de dados: a API chama a função e a função acessa as tabelas.
  resourceGroupName: 'data',
});
