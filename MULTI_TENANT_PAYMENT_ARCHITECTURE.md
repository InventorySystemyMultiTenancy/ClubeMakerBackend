# Arquitetura Multi-tenant Mercado Pago - Implementação Completa

## 🎯 Objetivo

Permitir que cada loja tenha suas próprias credenciais do Mercado Pago (Access Token e Device ID), possibilitando:

- Isolamento completo de pagamentos entre lojas
- Gestão independente de credenciais por loja
- Escalabilidade para múltiplas lojas sem conflitos

---

## 📊 Arquitetura Implementada

### Camadas

```
┌─────────────────────────────────────────────────┐
│  Frontend (React/Next.js)                       │
│  Envia header: x-store-id: pastel1              │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│  ROUTES LAYER: routes/payment.js                │
│  - Aplica middleware resolveStore                │
│  - Define endpoints REST                         │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│  MIDDLEWARE: middlewares/storeAuth.js           │
│  - Valida x-store-id                            │
│  - Busca credenciais no DB                      │
│  - Anexa req.store com mp_access_token          │
│  - Fallback para 'loja-padrao'                  │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│  CONTROLLER: controllers/paymentController.js   │
│  - Valida dados da requisição                   │
│  - Extrai storeConfig de req.store              │
│  - Chama service layer                          │
│  - Retorna resposta formatada                   │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│  SERVICE: services/paymentService.js            │
│  - Lógica de negócio pura                       │
│  - Integração com API Mercado Pago              │
│  - Usa storeConfig.mp_access_token              │
│  - Retorna dados processados                    │
└─────────────────────────────────────────────────┘
```

---

## 🗄️ Banco de Dados

### Tabela: `stores`

```sql
CREATE TABLE IF NOT EXISTS stores (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  mp_access_token TEXT,
  mp_device_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Loja padrão (migração automática)
INSERT INTO stores (id, name, mp_access_token, mp_device_id)
VALUES (
  'loja-padrao',
  'Loja Padrão',
  '<valor do .env MP_ACCESS_TOKEN>',
  '<valor do .env MP_DEVICE_ID>'
) ON CONFLICT (id) DO NOTHING;
```

**Campos:**

- `id`: Identificador único (ex: "pastel1", "loja-padrao")
- `name`: Nome amigável da loja
- `mp_access_token`: Access Token do Mercado Pago (credencial principal)
- `mp_device_id`: Device ID da Point Smart 2 (pagamentos com cartão)

---

## 🔌 Endpoints Refatorados

### Base: `/api/payment`

Todos os endpoints exigem header: `x-store-id: <store_id>`

#### 1. **PIX - Criar Pagamento QR Code**

```http
POST /api/payment/create-pix
Content-Type: application/json
x-store-id: pastel1

{
  "amount": 25.50,
  "description": "Pedido #123",
  "orderId": "123",
  "email": "cliente@email.com",
  "payerName": "João Silva"
}
```

**Response:**

```json
{
  "paymentId": "123456789",
  "status": "pending",
  "qrCodeBase64": "iVBORw0KGgoAAAANS...",
  "qrCodeCopyPaste": "00020126330014br.gov.bcb.pix...",
  "type": "pix"
}
```

---

#### 2. **Cartão - Criar Pagamento via Point**

```http
POST /api/payment/create
Content-Type: application/json
x-store-id: pastel1

{
  "amount": 35.00,
  "description": "Pedido #124",
  "orderId": "124"
}
```

**Response:**

```json
{
  "paymentId": "987654321",
  "status": "pending",
  "type": "card"
}
```

---

#### 3. **Status - Verificar Pagamento**

```http
GET /api/payment/status/:paymentId
x-store-id: pastel1
```

**Response:**

```json
{
  "id": "123456789",
  "status": "approved",
  "status_detail": "accredited",
  "transaction_amount": 25.5,
  "external_reference": "123"
}
```

---

#### 4. **Cancelar Pagamento**

```http
DELETE /api/payment/cancel/:paymentId
x-store-id: pastel1
```

---

#### 5. **Point - Configurar Modo PDV**

```http
POST /api/payment/point/configure
x-store-id: pastel1
```

---

#### 6. **Point - Obter Status**

```http
GET /api/payment/point/status
x-store-id: pastel1
```

---

#### 7. **Limpar Fila de Pagamentos**

```http
POST /api/payment/clear-queue
x-store-id: pastel1
```

---

## 🧪 Como Testar

### 1. Verificar Loja Padrão

```bash
# No PostgreSQL (Render) ou SQLite local
SELECT * FROM stores WHERE id = 'loja-padrao';
```

**Resultado esperado:**

```
id            | name         | mp_access_token      | mp_device_id
loja-padrao   | Loja Padrão  | APP_USR-12345...     | GERTEC_MP35P__ABC123
```

---

### 2. Criar Segunda Loja (Teste Multi-tenancy)

```sql
INSERT INTO stores (id, name, mp_access_token, mp_device_id)
VALUES (
  'pastel1',
  'Pastelaria 1',
  'APP_USR-XXXXXX-NOVO-TOKEN-LOJA1',
  'GERTEC_MP35P__DEVICE_LOJA1'
);
```

---

### 3. Testar com cURL

**Loja Padrão:**

```bash
curl -X POST https://backendkioskpro.onrender.com/api/payment/create-pix \
  -H "Content-Type: application/json" \
  -H "x-store-id: loja-padrao" \
  -d '{
    "amount": 10.50,
    "description": "Teste PIX",
    "orderId": "TEST001"
  }'
```

**Loja Pastel1:**

```bash
curl -X POST https://backendkioskpro.onrender.com/api/payment/create-pix \
  -H "Content-Type: application/json" \
  -H "x-store-id: pastel1" \
  -d '{
    "amount": 15.00,
    "description": "Teste PIX Loja 1",
    "orderId": "TEST002"
  }'
```

---

### 4. Testar sem x-store-id (Deve usar loja-padrao)

```bash
curl -X POST https://backendkioskpro.onrender.com/api/payment/create-pix \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 5.00,
    "description": "Teste Fallback",
    "orderId": "TEST003"
  }'
```

**Comportamento esperado:** Middleware `resolveStore` usa `loja-padrao` como fallback.

---

### 5. Testar com store-id inexistente

```bash
curl -X POST https://backendkioskpro.onrender.com/api/payment/create-pix \
  -H "Content-Type: application/json" \
  -H "x-store-id: loja-inexistente" \
  -d '{
    "amount": 20.00,
    "description": "Teste Loja Inexistente",
    "orderId": "TEST004"
  }'
```

**Resposta esperada:**

```json
{
  "error": "Loja não encontrada: loja-inexistente"
}
```

---

## 🔍 Validação em Produção

### Logs a Observar:

```
🔍 [STORE AUTH] Buscando store: pastel1
✅ [STORE AUTH] Store encontrada: Pastelaria 1 (ID: pastel1)
💚 [PIX] Criando pagamento de R$ 15 (loja: pastel1)
✅ [PIX] Criado! Payment ID: 123456789
```

### Checklist:

- ✅ Tabela `stores` existe e tem `loja-padrao`
- ✅ Middleware `resolveStore` anexa `req.store` corretamente
- ✅ Service layer usa `storeConfig.mp_access_token` (não mais `MP_ACCESS_TOKEN` global)
- ✅ Pagamentos PIX criados com credenciais corretas
- ✅ Pagamentos com cartão usam `storeConfig.mp_device_id`
- ✅ Cada loja tem pagamentos isolados (verificar via external_reference)

---

## 📝 Frontend - Integração

### Axios Interceptor (Adicionar x-store-id automaticamente)

```javascript
// src/api/axios.js
import axios from "axios";

const api = axios.create({
  baseURL:
    process.env.REACT_APP_API_URL || "https://backendkioskpro.onrender.com",
});

// Interceptor para adicionar x-store-id em todas as requisições
api.interceptors.request.use((config) => {
  const storeId = process.env.NEXT_PUBLIC_STORE_ID || "loja-padrao";
  config.headers["x-store-id"] = storeId;
  return config;
});

export default api;
```

### Exemplo de Uso:

```javascript
import api from "./api/axios";

// Criar pagamento PIX
const response = await api.post("/api/payment/create-pix", {
  amount: 25.5,
  description: "Pedido #123",
  orderId: "123",
  email: "cliente@email.com",
  payerName: "João Silva",
});

console.log("QR Code:", response.data.qrCodeBase64);
```

---

## 🚨 Migração de Endpoints Antigos

### ❌ DEPRECATED (Comentados em server.js):

```javascript
// NÃO USAR MAIS (sem Multi-tenancy):
POST /api/payment/create-pix    // ❌ Usa MP_ACCESS_TOKEN global
POST /api/payment/create        // ❌ Usa MP_DEVICE_ID global
POST /api/pix/create            // ❌ Duplicado e sem Multi-tenancy
GET  /api/pix/status/:id        // ❌ Sem controle de loja
```

### ✅ USAR (Novos endpoints Multi-tenant):

```javascript
// USAR (com x-store-id header):
POST   /api/payment/create-pix       // ✅ Multi-tenant
POST   /api/payment/create           // ✅ Multi-tenant
GET    /api/payment/status/:id       // ✅ Multi-tenant
DELETE /api/payment/cancel/:id       // ✅ Multi-tenant
POST   /api/payment/point/configure  // ✅ Multi-tenant
GET    /api/payment/point/status     // ✅ Multi-tenant
POST   /api/payment/clear-queue      // ✅ Multi-tenant
```

---

## 🔧 Troubleshooting

### Erro: "Loja não identificada. Envie o header x-store-id"

**Solução:** Frontend não está enviando header `x-store-id`. Adicionar interceptor no Axios.

### Erro: "Credenciais do Mercado Pago não configuradas para esta loja"

**Solução:** A loja existe no DB, mas `mp_access_token` está NULL. Atualizar:

```sql
UPDATE stores SET mp_access_token = 'APP_USR-XXX' WHERE id = 'pastel1';
```

### Erro: "Loja não encontrada: xxx"

**Solução:** Store ID não existe no DB. Criar com:

```sql
INSERT INTO stores (id, name, mp_access_token, mp_device_id)
VALUES ('xxx', 'Nome da Loja', 'TOKEN', 'DEVICE_ID');
```

### Pagamento criado com credenciais erradas

**Verificar:** Logs devem mostrar `(loja: <store_id>)`. Se não aparecer, `req.store` não foi anexado pelo middleware.

---

## 📦 Arquivos Criados

```
backend/
├── services/
│   └── paymentService.js         ✅ Lógica de negócio (7 funções)
├── controllers/
│   └── paymentController.js      ✅ Validação e controle (7 endpoints)
├── routes/
│   └── payment.js                ✅ Rotas REST com middleware
├── middlewares/
│   └── storeAuth.js              ✅ Resolução de store e credenciais
└── server.js                     ✅ Importação e endpoints antigos comentados
```

---

## ✅ Conclusão

A arquitetura Multi-tenant está **100% implementada** e pronta para uso. Cada loja agora:

- Usa suas próprias credenciais do Mercado Pago
- Tem isolamento completo de pagamentos
- Pode escalar para N lojas sem conflitos

**Próximos passos:**

1. Atualizar frontend para enviar `x-store-id` em todas as requisições de pagamento
2. Criar lojas no DB para cada cliente/PDV
3. Testar fluxo completo em produção
4. Remover endpoints antigos comentados após validação (1-2 semanas)

---

**Desenvolvido seguindo padrão de Arquitetura de Software Sênior** 🚀
