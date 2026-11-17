/**
 * Teste rápido da API como VISITANTE (sem login), usando amplify_outputs.json.
 *
 * Uso:  npx tsx scripts/smoke-test.ts            (só leitura)
 *       npx tsx scripts/smoke-test.ts --order    (também cria um pedido de teste via placeOrder)
 *
 * Gere antes o amplify_outputs.json:
 *   AWS_PROFILE=miomix npx ampx generate outputs --app-id d3coz731pa9496 --branch main
 */
import { readFileSync } from 'node:fs';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../amplify/data/resource';

const outputs = JSON.parse(readFileSync(new URL('../amplify_outputs.json', import.meta.url), 'utf8'));
Amplify.configure(outputs);
const client = generateClient<Schema>({ authMode: 'identityPool' });

let failures = 0;
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? '✅' : '❌'} ${label}`);
  if (!ok) failures++;
};

// 1. Sabores ativos + estoque
const { data: flavors, errors: fErr } = await client.models.Flavor.list({
  filter: { active: { eq: true } },
  selectionSet: ['id', 'name', 'color', 'allergens', 'sortOrder', 'stock.quantity', 'stock.stockDate'],
});
check(!fErr && flavors.length === 8, `Visitante lê sabores ativos (${flavors.length})`);
for (const f of [...flavors].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))) {
  console.log(`   ${f.name.padEnd(14)} ${f.color}  Vorrat: ${f.stock?.quantity} (${f.stock?.stockDate})  Allergene: ${f.allergens?.join(', ') || '–'}`);
}

// 2. Pontos de retirada
const { data: points, errors: pErr } = await client.models.PickupPoint.list();
check(!pErr && points.length === 2, `Visitante lê pontos de retirada (${points.length})`);
for (const p of points) console.log(`   ${p.code.padEnd(10)} ${p.name} — ${p.openingHours}`);

// 3. Pedidos e Pfand: precisam ser negados
const denied = async (label: string, fn: () => Promise<{ data: unknown; errors?: { message: string }[] }>) => {
  try {
    const r = await fn();
    const n = Array.isArray(r.data) ? r.data.length : 0;
    check(!!r.errors?.length && n === 0, `Visitante NÃO lê ${label} (${r.errors?.[0]?.message ?? `retornou ${n} registros!`})`);
  } catch (e) {
    check(true, `Visitante NÃO lê ${label} (${e instanceof Error ? e.message : String(e)})`);
  }
};
await denied('pedidos', () => client.models.Order.list());
await denied('PfandBox', () => client.models.PfandBox.list());

// 4. Pedido de teste
if (process.argv.includes('--order')) {
  const before = await client.models.Stock.get({ flavorId: 'vanille' });
  const res = await client.mutations.placeOrder({
    customerName: 'Test Kunde',
    customerEmail: 'test@example.com',
    customerPhone: '+49 151 0000000',
    pickupPointCode: 'ciaociao',
    boxSize: 4,
    items: [
      { flavorId: 'vanille', quantity: 2 },
      { flavorId: 'mango', quantity: 2 },
      // tentativa de mandar preço pelo navegador não existe no contrato da API
    ],
  });
  check(!res.errors && !!res.data, `placeOrder cria pedido ${res.data?.orderId ?? JSON.stringify(res.errors)}`);
  if (res.data) {
    console.log(`   Preis ${res.data.priceCents} + Pfand ${res.data.pfandCents} = ${res.data.totalCents} ct, Status ${res.data.status}, Abholung bis ${res.data.pickupDeadline}`);
    check(res.data.totalCents === 1500 && res.data.pfandCharged === true, 'Preço calculado no servidor (1200 + 300 Pfand)');
  }
  const after = await client.models.Stock.get({ flavorId: 'vanille' });
  check(
    (before.data?.quantity ?? 0) - (after.data?.quantity ?? 0) === 2,
    `Estoque Vanille reservado: ${before.data?.quantity} → ${after.data?.quantity}`,
  );

  check(/^MM-[A-HJ-NP-Z2-9]{6}$/.test(res.data?.orderCode ?? ''), `Código curto do pedido: ${res.data?.orderCode}`);

  // 4b. Caixinha "Pfand-Box zurückgebracht" → sem Pfand
  const swap = await client.mutations.placeOrder({
    customerName: 'Test Kunde',
    customerEmail: 'test@example.com',
    customerPhone: '+49 151 0000000',
    pickupPointCode: 'racchetta',
    boxSize: 6,
    items: [{ flavorId: 'zitrone', quantity: 6 }],
    pfandBoxReturned: true,
  });
  check(
    !swap.errors && swap.data?.pfandCharged === false && swap.data?.totalCents === 1700,
    `Pfand-Rückgabe: kein Pfand (${swap.data ? swap.data.totalCents + ' ct' : JSON.stringify(swap.errors)})`,
  );

  // 5. Validação: 3 potes numa caixa de 4
  const bad = await client.mutations.placeOrder({
    customerName: 'Test Kunde',
    customerEmail: 'test@example.com',
    customerPhone: '+49 151 0000000',
    pickupPointCode: 'ciaociao',
    boxSize: 4,
    items: [{ flavorId: 'vanille', quantity: 3 }],
  });
  check(!!bad.errors?.length, `Validação rejeita caixa incompleta: "${bad.errors?.[0]?.message}"`);
}

console.log(failures === 0 ? '\nTudo OK.' : `\n${failures} verificação(ões) falharam.`);
process.exit(failures === 0 ? 0 : 1);
