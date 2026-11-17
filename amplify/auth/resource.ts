import { defineAuth } from '@aws-amplify/backend';

/**
 * Login só para a equipe (grupo "staff"). Clientes não fazem login.
 * Visitantes sem login usam o acesso "guest" do Identity Pool (criado automaticamente).
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  groups: ['staff'],
});
