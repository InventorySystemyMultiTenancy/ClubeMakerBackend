# 🎨 Integração Frontend - Guia Completo

## 📋 Passo a Passo para o Frontend React/Next.js

---

## 1️⃣ Configurar Variável de Ambiente

### `.env.local` (Vercel)

```bash
NEXT_PUBLIC_STORE_ID=pastel1
NEXT_PUBLIC_API_URL=https://backendkioskpro.onrender.com
```

**Importante:**

- `NEXT_PUBLIC_` permite acesso no lado do cliente
- `pastel1` deve corresponder ao `id` da loja no banco de dados

---

## 2️⃣ Criar Instância Axios com Interceptor

### `src/api/axios.js`

```javascript
import axios from "axios";

// Criar instância do Axios com baseURL
const api = axios.create({
  baseURL:
    process.env.NEXT_PUBLIC_API_URL || "https://backendkioskpro.onrender.com",
  timeout: 30000, // 30 segundos
  headers: {
    "Content-Type": "application/json",
  },
});

// Interceptor de REQUEST: Adiciona x-store-id automaticamente
api.interceptors.request.use(
  (config) => {
    const storeId = process.env.NEXT_PUBLIC_STORE_ID || "loja-padrao";

    // Adiciona header em TODAS as requisições
    config.headers["x-store-id"] = storeId;

    // Log para debug (remover em produção)
    console.log(`[API] ${config.method.toUpperCase()} ${config.url}`, {
      storeId,
      data: config.data,
    });

    return config;
  },
  (error) => {
    console.error("[API] Erro no interceptor de request:", error);
    return Promise.reject(error);
  }
);

// Interceptor de RESPONSE: Trata erros globalmente
api.interceptors.response.use(
  (response) => {
    // Log para debug (remover em produção)
    console.log(`[API] ✅ ${response.config.url}`, response.data);
    return response;
  },
  (error) => {
    // Trata erros de forma amigável
    if (error.response) {
      console.error(`[API] ❌ ${error.response.status}:`, error.response.data);

      // Erros específicos
      if (
        error.response.status === 404 &&
        error.response.data.error?.includes("Loja não encontrada")
      ) {
        alert(
          "Erro: Loja não configurada no sistema. Entre em contato com o suporte."
        );
      }

      if (
        error.response.status === 400 &&
        error.response.data.error?.includes("Credenciais")
      ) {
        alert(
          "Erro: Credenciais do Mercado Pago não configuradas para esta loja."
        );
      }
    } else if (error.request) {
      console.error("[API] ❌ Sem resposta do servidor:", error.request);
      alert(
        "Erro: Não foi possível conectar ao servidor. Verifique sua conexão."
      );
    } else {
      console.error("[API] ❌ Erro desconhecido:", error.message);
    }

    return Promise.reject(error);
  }
);

export default api;
```

---

## 3️⃣ Atualizar Chamadas de API

### ❌ ANTES (Sem x-store-id)

```javascript
import axios from "axios";

// Problema: Não envia x-store-id
const response = await axios.post(
  "https://backendkioskpro.onrender.com/api/payment/create-pix",
  {
    amount: 25.5,
    description: "Pedido #123",
    orderId: "123",
  }
);
```

---

### ✅ DEPOIS (Com interceptor)

```javascript
import api from "./api/axios"; // Importar instância customizada

// Automático: x-store-id adicionado pelo interceptor
const response = await api.post("/api/payment/create-pix", {
  amount: 25.5,
  description: "Pedido #123",
  orderId: "123",
  email: "cliente@email.com",
  payerName: "João Silva",
});

console.log("Payment ID:", response.data.paymentId);
console.log("QR Code:", response.data.qrCodeBase64);
```

---

## 4️⃣ Criar Serviço de Pagamento

### `src/services/paymentService.js`

```javascript
import api from "../api/axios";

/**
 * Criar pagamento PIX (QR Code)
 */
export async function createPixPayment(paymentData) {
  try {
    const response = await api.post("/api/payment/create-pix", {
      amount: paymentData.amount,
      description: paymentData.description || "Pedido",
      orderId: paymentData.orderId,
      email: paymentData.email,
      payerName: paymentData.payerName,
    });

    return {
      success: true,
      paymentId: response.data.paymentId,
      qrCode: response.data.qrCodeBase64,
      qrCodeCopyPaste: response.data.qrCodeCopyPaste,
      status: response.data.status,
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || "Erro ao criar pagamento PIX",
    };
  }
}

/**
 * Criar pagamento com Cartão (Point)
 */
export async function createCardPayment(paymentData) {
  try {
    const response = await api.post("/api/payment/create", {
      amount: paymentData.amount,
      description: paymentData.description || "Pedido",
      orderId: paymentData.orderId,
    });

    return {
      success: true,
      paymentId: response.data.paymentId,
      status: response.data.status,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error.response?.data?.error || "Erro ao criar pagamento com cartão",
    };
  }
}

/**
 * Verificar status de pagamento
 */
export async function checkPaymentStatus(paymentId) {
  try {
    const response = await api.get(`/api/payment/status/${paymentId}`);

    return {
      success: true,
      id: response.data.id,
      status: response.data.status,
      statusDetail: response.data.status_detail,
      amount: response.data.transaction_amount,
      orderId: response.data.external_reference,
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || "Erro ao verificar status",
    };
  }
}

/**
 * Cancelar pagamento
 */
export async function cancelPayment(paymentId) {
  try {
    const response = await api.delete(`/api/payment/cancel/${paymentId}`);

    return {
      success: true,
      id: response.data.id,
      status: response.data.status,
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || "Erro ao cancelar pagamento",
    };
  }
}

/**
 * Configurar Point em modo PDV
 */
export async function configurePoint() {
  try {
    const response = await api.post("/api/payment/point/configure");

    return {
      success: true,
      deviceId: response.data.device_id,
      operatingMode: response.data.operating_mode,
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || "Erro ao configurar Point",
    };
  }
}

/**
 * Obter status da Point
 */
export async function getPointStatus() {
  try {
    const response = await api.get("/api/payment/point/status");

    return {
      success: true,
      id: response.data.id,
      operatingMode: response.data.operating_mode,
      status: response.data.status,
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || "Erro ao consultar Point",
    };
  }
}

/**
 * Limpar fila de pagamentos
 */
export async function clearPaymentQueue() {
  try {
    const response = await api.post("/api/payment/clear-queue");

    return {
      success: true,
      message: response.data.message,
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || "Erro ao limpar fila",
    };
  }
}
```

---

## 5️⃣ Exemplo de Uso em Componente React

### `src/components/Checkout.jsx`

```javascript
import React, { useState } from "react";
import {
  createPixPayment,
  checkPaymentStatus,
} from "../services/paymentService";

export default function Checkout({ orderId, totalAmount }) {
  const [qrCode, setQrCode] = useState(null);
  const [paymentId, setPaymentId] = useState(null);
  const [status, setStatus] = useState("pending");
  const [loading, setLoading] = useState(false);

  /**
   * Criar pagamento PIX
   */
  const handleCreatePix = async () => {
    setLoading(true);

    const result = await createPixPayment({
      amount: totalAmount,
      description: `Pedido #${orderId}`,
      orderId: orderId,
      email: "cliente@loja.com",
      payerName: "Cliente",
    });

    setLoading(false);

    if (result.success) {
      setQrCode(result.qrCode);
      setPaymentId(result.paymentId);
      setStatus(result.status);

      // Iniciar polling de status
      startStatusPolling(result.paymentId);
    } else {
      alert(`Erro: ${result.error}`);
    }
  };

  /**
   * Polling de status a cada 3 segundos
   */
  const startStatusPolling = (paymentId) => {
    const interval = setInterval(async () => {
      const result = await checkPaymentStatus(paymentId);

      if (result.success) {
        setStatus(result.status);

        // Se aprovado ou rejeitado, parar polling
        if (result.status === "approved" || result.status === "rejected") {
          clearInterval(interval);

          if (result.status === "approved") {
            alert("Pagamento aprovado! 🎉");
            // Redirecionar para página de sucesso
          } else {
            alert("Pagamento rejeitado.");
          }
        }
      }
    }, 3000);

    // Limpar após 5 minutos
    setTimeout(() => clearInterval(interval), 300000);
  };

  return (
    <div className="checkout">
      <h2>Checkout - Pedido #{orderId}</h2>
      <p>Total: R$ {totalAmount.toFixed(2)}</p>

      {!qrCode && (
        <button onClick={handleCreatePix} disabled={loading}>
          {loading ? "Gerando QR Code..." : "Pagar com PIX"}
        </button>
      )}

      {qrCode && (
        <div className="qr-code-container">
          <h3>Escaneie o QR Code</h3>
          <img src={`data:image/png;base64,${qrCode}`} alt="QR Code PIX" />
          <p>
            Status:{" "}
            {status === "pending" ? "⏳ Aguardando pagamento..." : status}
          </p>
          <p className="payment-id">Payment ID: {paymentId}</p>
        </div>
      )}
    </div>
  );
}
```

---

## 6️⃣ Substituir Endpoints Antigos

### Procurar e Substituir em Todo o Projeto

**1. PIX:**

```javascript
// ❌ ANTES
"/api/pix/create";
"/api/payment/create-pix";

// ✅ DEPOIS
"/api/payment/create-pix";
```

**2. Cartão:**

```javascript
// ❌ ANTES
"/api/payment/create";

// ✅ DEPOIS
"/api/payment/create";
```

**3. Status:**

```javascript
// ❌ ANTES
"/api/pix/status/:id";
"/api/payment/status-pix/:orderId";

// ✅ DEPOIS
"/api/payment/status/:paymentId";
```

**4. Cancelar:**

```javascript
// ❌ ANTES
"/api/payment/cancel/:id";

// ✅ DEPOIS
"/api/payment/cancel/:paymentId";
```

**5. Point:**

```javascript
// ❌ ANTES
"/api/point/configure";
"/api/point/status";

// ✅ DEPOIS
"/api/payment/point/configure";
"/api/payment/point/status";
```

**6. Fila:**

```javascript
// ❌ ANTES
"/api/payment/clear-all";
"/api/payment/clear-queue";

// ✅ DEPOIS
"/api/payment/clear-queue";
```

---

## 7️⃣ Validação e Testes

### Checklist de Integração

- [ ] Variável `NEXT_PUBLIC_STORE_ID` configurada em `.env.local`
- [ ] Arquivo `src/api/axios.js` criado com interceptor
- [ ] Todas as requisições usando `import api from './api/axios'`
- [ ] Endpoints antigos substituídos pelos novos
- [ ] Console mostrando logs: `[API] POST /api/payment/create-pix { storeId: 'pastel1' }`
- [ ] Pagamento PIX criado com sucesso
- [ ] QR Code exibido corretamente
- [ ] Polling de status funcionando
- [ ] Mensagem de erro amigável se loja não configurada

---

## 8️⃣ Troubleshooting Frontend

### Erro: "Loja não identificada"

**Sintoma:** API retorna 400 com mensagem "Envie o header x-store-id"

**Solução:**

1. Verificar se `NEXT_PUBLIC_STORE_ID` está definido em `.env.local`
2. Verificar se interceptor está sendo executado (adicionar `console.log` no interceptor)
3. Verificar se está usando `import api from './api/axios'` (não `axios` diretamente)

---

### Erro: "Loja não encontrada"

**Sintoma:** API retorna 404 com "Loja não encontrada: xxx"

**Solução:**

1. Verificar se loja existe no banco de dados:
   ```sql
   SELECT * FROM stores WHERE id = 'pastel1';
   ```
2. Se não existir, criar:
   ```sql
   INSERT INTO stores (id, name, mp_access_token, mp_device_id)
   VALUES ('pastel1', 'Pastelaria 1', 'TOKEN', 'DEVICE_ID');
   ```

---

### Erro: "Credenciais não configuradas"

**Sintoma:** API retorna 400 com "Credenciais do Mercado Pago não configuradas"

**Solução:**

1. Loja existe no DB, mas `mp_access_token` está NULL
2. Atualizar credenciais:
   ```sql
   UPDATE stores SET mp_access_token = 'APP_USR-XXX' WHERE id = 'pastel1';
   ```

---

### QR Code não aparece

**Sintoma:** Pagamento criado, mas `qrCode` é `null`

**Solução:**

1. Verificar resposta da API no Network (DevTools)
2. Verificar se `qrCodeBase64` está presente em `response.data`
3. Se não estiver, verificar logs do backend (pode ser erro na API do MP)

---

### Polling não funciona

**Sintoma:** Status não atualiza após pagar

**Solução:**

1. Verificar se `setInterval` está sendo executado (adicionar `console.log`)
2. Verificar se `paymentId` está correto
3. Verificar se endpoint `/api/payment/status/:paymentId` retorna status atualizado

---

## 9️⃣ Deploy no Vercel

### Adicionar Variável de Ambiente

1. Acessar: https://vercel.com/seu-projeto/settings/environment-variables
2. Adicionar:
   - **Nome:** `NEXT_PUBLIC_STORE_ID`
   - **Valor:** `pastel1` (ou o ID da loja)
   - **Ambiente:** Production, Preview, Development
3. Clicar em **Save**
4. Fazer novo deploy ou redeploar o projeto

---

## 🎓 Boas Práticas

### ✅ DO (Fazer)

- Sempre usar instância `api` do Axios (com interceptor)
- Adicionar `try/catch` em todas as chamadas de API
- Retornar objetos estruturados (`{ success, data, error }`)
- Adicionar loading states em botões de pagamento
- Exibir mensagens de erro amigáveis ao usuário
- Fazer polling de status para PIX (atualização automática)

### ❌ DON'T (Não fazer)

- Não usar `axios` diretamente (sem interceptor)
- Não expor erros técnicos ao usuário (ex: stack traces)
- Não fazer polling infinito (limite de tempo)
- Não confiar apenas em status visual (sempre verificar no backend)
- Não hardcodar `storeId` no código (usar variável de ambiente)

---

## 📚 Recursos Adicionais

- **Documentação Backend:** `MULTI_TENANT_PAYMENT_ARCHITECTURE.md`
- **Resumo da Implementação:** `IMPLEMENTATION_SUMMARY.md`
- **API Mercado Pago:** https://www.mercadopago.com.br/developers/pt/docs

---

**Pronto para integração!** 🚀

Se tiver dúvidas, consulte os logs do backend ou abra uma issue no repositório.
