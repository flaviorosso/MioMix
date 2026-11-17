import { defineFunction } from '@aws-amplify/backend';

export const createOrder = defineFunction({
  name: 'create-order',
  entry: './handler.ts',
  timeoutSeconds: 15,
  // Mesmo stack da API de dados: a API chama a função e a função acessa as tabelas.
  resourceGroupName: 'data',
});
