import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { placeOrder } from '../functions/place-order/resource';
import { staffOrders } from '../functions/staff-orders/resource';
import { orderStatus } from '../functions/order-status/resource';

const schema = a.schema({
  OrderStatus: a.enum(['aguardando_pagamento', 'pago', 'pronto', 'retirado', 'cancelado']),

  OrderItem: a.customType({
    flavorId: a.id().required(),
    flavorName: a.string().required(),
    quantity: a.integer().required(),
  }),

  /** Sabor. Visitantes leem; o site mostra só os ativos (active = true). */
  Flavor: a
    .model({
      name: a.string().required(), // nome em alemão
      description: a.string(),
      allergens: a.string().array(),
      color: a.string().required(), // hex, para o desenho do pote
      active: a.boolean().required(),
      sortOrder: a.integer(),
      stock: a.hasOne('Stock', 'flavorId'),
    })
    .authorization((allow) => [allow.guest().to(['read']), allow.authenticated('identityPool').to(['read']), allow.group('staff')]),

  /** Estoque do dia: um registro por sabor, atualizado toda manhã pela gelateria. */
  Stock: a
    .model({
      flavorId: a.id().required(),
      flavor: a.belongsTo('Flavor', 'flavorId'),
      quantity: a.integer().required(), // potes disponíveis
      stockDate: a.date().required(), // dia a que a quantidade se refere
    })
    .identifier(['flavorId'])
    .authorization((allow) => [allow.guest().to(['read']), allow.authenticated('identityPool').to(['read']), allow.group('staff')]),

  /** Ponto de retirada. "code" é usado no QR code (ex.: ciaociao, racchetta). */
  PickupPoint: a
    .model({
      code: a.string().required(),
      name: a.string().required(),
      address: a.string(),
      openingHours: a.string(), // texto para o cliente, gerado a partir de weeklyHours
      weeklyHours: a.json(), // [{ day: 0=Mo…6=So, open: 'HH:MM', close: 'HH:MM' }], dias ausentes = fechado
      active: a.boolean(),
    })
    .identifier(['code'])
    .authorization((allow) => [allow.guest().to(['read']), allow.authenticated('identityPool').to(['read']), allow.group('staff')]),

  /** Pedido. Criado só pela função placeOrder; staff lê e muda o status. */
  Order: a
    .model({
      orderCode: a.string(), // código curto para o balcão, ex.: MM-7K4Q2X
      customerName: a.string().required(),
      customerEmail: a.email().required(),
      customerPhone: a.string().required(),
      pickupPointCode: a.string().required(),
      items: a.ref('OrderItem').required().array().required(),
      boxSize: a.integer().required(), // 4, 6 ou 8
      priceCents: a.integer().required(),
      pfandCents: a.integer().required(),
      totalCents: a.integer().required(),
      pfandCharged: a.boolean().required(),
      // Cliente declarou que devolveu uma caixa: staff confere na retirada.
      pfandReturnDeclared: a.boolean(),
      pfandCreditUsedCents: a.integer(), // crédito de Pfand usado (devolvido se cancelar)
      pfandBoxReceived: a.boolean(), // na retirada: staff recebeu a caixa declarada?
      pfandCollectedOnSite: a.boolean(), // caixa não veio → Pfand cobrado no local
      updatedBy: a.string(), // último staff que mudou o status
      cancelReason: a.string(),
      // Pagamento (Stripe)
      stripeSessionId: a.string(),
      stripePaymentIntentId: a.string(),
      checkoutUrl: a.string(),
      checkoutExpiresAt: a.datetime(),
      paidAt: a.datetime(),
      paymentAfterCancel: a.boolean(), // pago depois de cancelado → staff deve estornar
      status: a.ref('OrderStatus').required(),
      pickupDeadline: a.datetime().required(),
    })
    // Staff só lê; mudanças de status passam por updateOrderStatus (estoque/Pfand consistentes).
    .authorization((allow) => [allow.group('staff').to(['read'])]),

  /** Caixas com Pfand por cliente (e-mail). */
  PfandBox: a
    .model({
      customerEmail: a.email().required(),
      boxesInUse: a.integer().required(),
      boxesReturned: a.integer().required(),
      creditCents: a.integer().required(),
    })
    .identifier(['customerEmail'])
    .authorization((allow) => [allow.group('staff')]),

  PlaceOrderItemInput: a.customType({
    flavorId: a.id().required(),
    quantity: a.integer().required(),
  }),

  PlaceOrderResult: a.customType({
    orderId: a.id().required(),
    orderCode: a.string().required(),
    checkoutUrl: a.string().required(),
    status: a.ref('OrderStatus').required(),
    boxSize: a.integer().required(),
    priceCents: a.integer().required(),
    pfandCents: a.integer().required(),
    totalCents: a.integer().required(),
    pfandCharged: a.boolean().required(),
    pickupDeadline: a.datetime().required(),
  }),

  StaffOrderUpdateResult: a.customType({
    orderId: a.id().required(),
    status: a.ref('OrderStatus').required(),
  }),

  PfandReturnResult: a.customType({
    customerEmail: a.string().required(),
    boxesInUse: a.integer().required(),
    boxesReturned: a.integer().required(),
    creditCents: a.integer().required(),
  }),

  /** Staff: muda o status do pedido. Cancelar devolve potes e desfaz o Pfand. */
  updateOrderStatus: a
    .mutation()
    .arguments({
      orderId: a.id().required(),
      status: a.ref('OrderStatus').required(),
      pfandBoxReceived: a.boolean(), // obrigatório ao marcar "retirado" com Pfand-Rückgabe
    })
    .returns(a.ref('StaffOrderUpdateResult'))
    .authorization((allow) => [allow.group('staff')])
    .handler(a.handler.function(staffOrders)),

  /** Staff: cliente devolve caixas sem pedido → crédito de Pfand. */
  registerPfandReturn: a
    .mutation()
    .arguments({
      customerEmail: a.string().required(),
      boxes: a.integer().required(),
    })
    .returns(a.ref('PfandReturnResult'))
    .authorization((allow) => [allow.group('staff')])
    .handler(a.handler.function(staffOrders)),

  /** Visão pública de um pedido (para a página de confirmação). */
  PublicOrderStatus: a.customType({
    orderId: a.id().required(),
    orderCode: a.string().required(),
    status: a.ref('OrderStatus').required(),
    customerFirstName: a.string().required(),
    pickupPointCode: a.string().required(),
    pickupPointName: a.string().required(),
    pickupPointHours: a.string(),
    pickupDeadline: a.datetime().required(),
    paid: a.boolean().required(),
    boxSize: a.integer().required(),
    items: a.ref('OrderItem').required().array().required(),
    priceCents: a.integer().required(),
    pfandCents: a.integer().required(),
    totalCents: a.integer().required(),
    pfandCharged: a.boolean().required(),
    checkoutUrl: a.string(), // só enquanto o pagamento ainda é possível
    checkoutExpiresAt: a.datetime(),
  }),

  /** Status do pedido pelo ID (UUID não adivinhável), sem login. */
  getOrderStatus: a
    .query()
    .arguments({ orderId: a.id().required() })
    .returns(a.ref('PublicOrderStatus'))
    .authorization((allow) => [allow.guest(), allow.authenticated('identityPool'), allow.group('staff')])
    .handler(a.handler.function(orderStatus)),

  /** Criação de pedido no servidor: confere estoque e preço e reserva os potes. */
  placeOrder: a
    .mutation()
    .arguments({
      customerName: a.string().required(),
      customerEmail: a.string().required(),
      customerPhone: a.string().required(),
      pickupPointCode: a.string().required(),
      boxSize: a.integer().required(),
      items: a.ref('PlaceOrderItemInput').required().array().required(),
      pfandBoxReturned: a.boolean(),
      returnOrigin: a.string(), // origem do site (validada no servidor) para voltar do Stripe
    })
    .returns(a.ref('PlaceOrderResult'))
    .authorization((allow) => [allow.guest(), allow.authenticated('identityPool'), allow.group('staff')])
    .handler(a.handler.function(placeOrder)),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'identityPool',
  },
});
