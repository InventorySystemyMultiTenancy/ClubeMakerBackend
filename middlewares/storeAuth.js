/**
 * Middleware para resolver a loja (store) baseado no header x-store-id
 * Anexa as credenciais do Mercado Pago da loja em req.store
 */

// Middleware simplificado: define uma loja fixa (single-tenant)
export function resolveStore(req, res, next) {
  req.store = {
    id: process.env.STORE_ID || "loja-unica",
    name: process.env.STORE_NAME || "Loja Única",
    mp_access_token: process.env.MP_ACCESS_TOKEN || "SUA_ACCESS_TOKEN",
    mp_device_id: process.env.MP_DEVICE_ID || "SEU_DEVICE_ID",
  };
  next();
}
