# 🏪 Guia de Configuração de Lojas e Maquininhas

## 📍 Onde Configurar

**Tabela do Banco de Dados:** `stores`

Cada loja tem suas próprias credenciais do Mercado Pago:

- **mp_access_token**: Token da aplicação do Mercado Pago
- **mp_device_id**: ID da maquininha Point (para pagamentos com cartão)

---

## 🗄️ Estrutura da Tabela `stores`

```sql
CREATE TABLE stores (
  id VARCHAR(255) PRIMARY KEY,        -- Identificador único (ex: "pastel1", "loja2")
  name VARCHAR(255) NOT NULL,         -- Nome amigável da loja
  mp_access_token TEXT,               -- Token do Mercado Pago
  mp_device_id VARCHAR(255),          -- ID da Point/Maquininha
  created_at TIMESTAMP                -- Data de criação
);
```

---

## 🔧 Como Configurar Cada Loja

### Opção 1: Via SQL (Recomendado para Produção)

#### 1️⃣ Conectar ao Banco (PostgreSQL no Render)

```bash
# Local (substituir pela sua connection string do Render)
psql postgresql://user:password@host:port/database
```

#### 2️⃣ Ver Lojas Existentes

```sql
SELECT id, name, mp_access_token, mp_device_id FROM stores;
```

**Resultado esperado:**

```
id            | name         | mp_access_token      | mp_device_id
--------------+--------------+----------------------+-------------------------
loja-padrao   | Loja Padrão  | APP_USR-123456...    | GERTEC_MP35P__ABC123
```

#### 3️⃣ Criar Nova Loja

```sql
INSERT INTO stores (id, name, mp_access_token, mp_device_id)
VALUES (
  'pastel1',                                    -- ID único da loja
  'Pastelaria Centro',                          -- Nome amigável
  'APP_USR-1234567890-XXXXXX-abcdef123456',    -- Token do MP da loja
  'GERTEC_MP35P__12345678'                      -- Device ID da maquininha
);
```

#### 4️⃣ Atualizar Loja Existente

```sql
-- Atualizar apenas o Token
UPDATE stores
SET mp_access_token = 'APP_USR-NOVO-TOKEN-AQUI'
WHERE id = 'pastel1';

-- Atualizar apenas a Maquininha
UPDATE stores
SET mp_device_id = 'GERTEC_MP35P__NOVO_DEVICE'
WHERE id = 'pastel1';

-- Atualizar os dois
UPDATE stores
SET mp_access_token = 'APP_USR-NOVO-TOKEN',
    mp_device_id = 'GERTEC_MP35P__NOVO_DEVICE'
WHERE id = 'pastel1';
```

#### 5️⃣ Deletar Loja

```sql
DELETE FROM stores WHERE id = 'pastel1';
```

---

### Opção 2: Via Ferramenta Visual (Para Quem Prefere Interface)

#### **Render Dashboard:**

1. Acesse: https://dashboard.render.com
2. Clique no seu banco de dados PostgreSQL
3. Vá em **"Connect"** → **"External Connection"**
4. Use uma ferramenta como:

   - **DBeaver** (grátis): https://dbeaver.io/
   - **pgAdmin** (grátis): https://www.pgadmin.org/
   - **TablePlus** (pago): https://tableplus.com/

5. Configure a conexão com os dados do Render:

   - Host: `seu-db.render.com`
   - Port: `5432`
   - Database: `nome_do_db`
   - User: `usuario`
   - Password: `senha`

6. Abra a tabela `stores` e edite diretamente

---

### Opção 3: Via Endpoint API (Futuro - Não Implementado)

**Pode ser criado um CRUD admin para gerenciar lojas via API:**

```javascript
// Exemplo de endpoints que podem ser criados:
POST   /api/admin/stores           // Criar loja
GET    /api/admin/stores           // Listar todas as lojas
GET    /api/admin/stores/:id       // Ver detalhes de uma loja
PUT    /api/admin/stores/:id       // Atualizar credenciais
DELETE /api/admin/stores/:id       // Deletar loja
```

---

## 🔑 Como Obter as Credenciais

### 1️⃣ Obter `mp_access_token` (Token do Mercado Pago)

1. Acesse: https://www.mercadopago.com.br/developers/panel
2. Faça login com a conta do Mercado Pago da loja
3. Vá em **"Suas integrações"** → **"Suas credenciais"**
4. Copie o **"Access Token de Produção"**
   - Formato: `APP_USR-1234567890-XXXXXX-abcdef123456789`

**⚠️ IMPORTANTE:**

- Cada loja deve ter sua própria conta do Mercado Pago
- Não compartilhar tokens entre lojas
- Usar tokens de **PRODUÇÃO** (não teste)

---

### 2️⃣ Obter `mp_device_id` (ID da Maquininha Point)

#### **Método 1: Via Aplicativo Point**

1. Ligue a Point Smart
2. Acesse: **Configurações** → **Sobre o dispositivo**
3. Copie o **"Device ID"** ou **"Serial Number"**
   - Formato: `GERTEC_MP35P__12345678` ou similar

#### **Método 2: Via API do Mercado Pago**

```bash
curl -X GET https://api.mercadopago.com/point/integration-api/devices \
  -H "Authorization: Bearer APP_USR-TOKEN-AQUI"
```

**Response:**

```json
{
  "devices": [
    {
      "id": "GERTEC_MP35P__12345678",
      "operating_mode": "PDV",
      "pos_id": "12345678"
    }
  ]
}
```

---

## 📋 Exemplos de Configuração

### Exemplo 1: Loja com PIX e Cartão (Point)

```sql
INSERT INTO stores (id, name, mp_access_token, mp_device_id)
VALUES (
  'loja-centro',
  'Pastelaria Centro',
  'APP_USR-1234567890-100001-abc123',
  'GERTEC_MP35P__87654321'
);
```

**Funcionalidades:**

- ✅ Pagamentos PIX (QR Code)
- ✅ Pagamentos com Cartão (Point)

---

### Exemplo 2: Loja apenas com PIX (sem maquininha)

```sql
INSERT INTO stores (id, name, mp_access_token, mp_device_id)
VALUES (
  'loja-delivery',
  'Delivery Online',
  'APP_USR-9876543210-200002-xyz789',
  NULL  -- Sem maquininha
);
```

**Funcionalidades:**

- ✅ Pagamentos PIX (QR Code)
- ❌ Pagamentos com Cartão (sem Point)

**Comportamento:**

- Endpoints de Point (`/api/payment/point/*`) retornarão erro 400
- Pagamentos PIX funcionam normalmente

---

### Exemplo 3: Múltiplas Lojas

```sql
-- Loja 1: Matriz
INSERT INTO stores (id, name, mp_access_token, mp_device_id)
VALUES ('matriz', 'Pastelaria Matriz', 'APP_USR-TOKEN-MATRIZ', 'DEVICE_MATRIZ');

-- Loja 2: Filial Shopping
INSERT INTO stores (id, name, mp_access_token, mp_device_id)
VALUES ('filial-shopping', 'Filial Shopping Center', 'APP_USR-TOKEN-SHOPPING', 'DEVICE_SHOPPING');

-- Loja 3: Filial Delivery
INSERT INTO stores (id, name, mp_access_token, mp_device_id)
VALUES ('delivery', 'Delivery Online', 'APP_USR-TOKEN-DELIVERY', NULL);
```

---

## 🎯 Como o Frontend Usa as Lojas

### 1️⃣ Configurar `.env.local` no Frontend (Vercel)

```bash
# Para a loja Matriz
NEXT_PUBLIC_STORE_ID=matriz

# Para a loja Shopping
NEXT_PUBLIC_STORE_ID=filial-shopping

# Para Delivery
NEXT_PUBLIC_STORE_ID=delivery
```

### 2️⃣ O Interceptor Axios Envia Automaticamente

```javascript
// src/api/axios.js
api.interceptors.request.use((config) => {
  const storeId = process.env.NEXT_PUBLIC_STORE_ID || "loja-padrao";
  config.headers["x-store-id"] = storeId; // Envia para o backend
  return config;
});
```

### 3️⃣ Backend Busca as Credenciais Corretas

```javascript
// middlewares/storeAuth.js
const store = await db("stores").where({ id: storeId }).first();
// store = { id: 'matriz', mp_access_token: 'TOKEN_MATRIZ', mp_device_id: 'DEVICE_MATRIZ' }

req.store = store; // Anexa ao request
```

### 4️⃣ Pagamento Usa o Token da Loja Correta

```javascript
// services/paymentService.js
const response = await fetch("https://api.mercadopago.com/v1/payments", {
  headers: {
    Authorization: `Bearer ${storeConfig.mp_access_token}`, // Token da loja específica
  },
});
```

---

## 🔍 Como Validar se Está Configurado Corretamente

### 1️⃣ Verificar Lojas no Banco

```sql
SELECT
  id,
  name,
  CASE
    WHEN mp_access_token IS NULL THEN '❌ Não configurado'
    ELSE '✅ Configurado'
  END as token_status,
  CASE
    WHEN mp_device_id IS NULL THEN '❌ Sem maquininha'
    ELSE '✅ Com maquininha'
  END as device_status
FROM stores;
```

### 2️⃣ Testar via cURL

```bash
# Testar loja específica
curl -X POST https://backendkioskpro.onrender.com/api/payment/create-pix \
  -H "Content-Type: application/json" \
  -H "x-store-id: matriz" \
  -d '{"amount": 10.00, "description": "Teste", "orderId": "T001"}'
```

**Response esperado (sucesso):**

```json
{
  "paymentId": "123456789",
  "status": "pending",
  "qrCodeBase64": "iVBORw0KGgo...",
  "type": "pix"
}
```

**Response esperado (erro - loja não existe):**

```json
{
  "error": "Loja não encontrada: matriz"
}
```

**Response esperado (erro - sem credenciais):**

```json
{
  "error": "Credenciais do Mercado Pago não configuradas para a loja: Matriz"
}
```

### 3️⃣ Verificar Logs do Backend

```bash
# Render Dashboard → Logs
🔍 [STORE AUTH] Buscando store: matriz
✅ [STORE AUTH] Store encontrada: Pastelaria Matriz (ID: matriz)
💚 [PIX] Criando pagamento de R$ 10 (loja: matriz)
✅ [PIX] Criado! Payment ID: 123456789
```

---

## 🚨 Troubleshooting

### Erro: "Loja não encontrada"

**Causa:** Store ID não existe no banco

**Solução:**

```sql
-- Verificar se existe
SELECT * FROM stores WHERE id = 'nome-da-loja';

-- Se não existir, criar
INSERT INTO stores (id, name, mp_access_token, mp_device_id)
VALUES ('nome-da-loja', 'Nome Amigável', 'TOKEN', 'DEVICE_ID');
```

---

### Erro: "Credenciais não configuradas"

**Causa:** `mp_access_token` está NULL

**Solução:**

```sql
UPDATE stores
SET mp_access_token = 'APP_USR-SEU-TOKEN-AQUI'
WHERE id = 'nome-da-loja';
```

---

### Erro: "Device ID não configurado" (apenas endpoints Point)

**Causa:** `mp_device_id` está NULL

**Solução:**

```sql
UPDATE stores
SET mp_device_id = 'GERTEC_MP35P__12345678'
WHERE id = 'nome-da-loja';
```

---

## 📊 Resumo Rápido

| O que                      | Onde                                      | Como                             |
| -------------------------- | ----------------------------------------- | -------------------------------- |
| **Token do MP**            | Tabela `stores`, coluna `mp_access_token` | Copiar do painel do Mercado Pago |
| **ID da Maquininha**       | Tabela `stores`, coluna `mp_device_id`    | Ver na Point ou via API do MP    |
| **Criar Loja**             | SQL: `INSERT INTO stores ...`             | Executar no banco PostgreSQL     |
| **Atualizar Credenciais**  | SQL: `UPDATE stores SET ...`              | Executar no banco PostgreSQL     |
| **Frontend usa qual loja** | `.env.local`: `NEXT_PUBLIC_STORE_ID`      | Variável de ambiente no Vercel   |

---

## 🎓 Exemplo Completo: Configurando a Primeira Loja

```bash
# 1. Conectar ao banco
psql postgresql://user:pass@host:port/db

# 2. Ver lojas existentes
SELECT * FROM stores;

# 3. Criar nova loja (substituir pelos valores reais)
INSERT INTO stores (id, name, mp_access_token, mp_device_id)
VALUES (
  'pastel1',                                          -- Nome curto para usar no frontend
  'Pastelaria 1',                                     -- Nome amigável
  'APP_USR-1234567890-100001-abc123def456',         -- Token do painel MP
  'GERTEC_MP35P__87654321'                           -- Serial da Point
);

# 4. Verificar criação
SELECT * FROM stores WHERE id = 'pastel1';

# 5. Configurar frontend
# No Vercel, adicionar variável de ambiente:
# NEXT_PUBLIC_STORE_ID=pastel1

# 6. Testar
curl -X POST https://sua-api.onrender.com/api/payment/create-pix \
  -H "Content-Type: application/json" \
  -H "x-store-id: pastel1" \
  -d '{"amount": 5.00, "description": "Teste", "orderId": "T001"}'
```

---

**Pronto! Agora você sabe exatamente onde e como configurar cada loja e maquininha!** 🚀
