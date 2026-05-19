# 🌐 Guia de Pagamento Online - MercadoPago SDK

## 📋 Índice

1. [Configuração do Backend](#configuração-do-backend)
2. [Endpoints Disponíveis](#endpoints-disponíveis)
3. [Integração no Frontend](#integração-no-frontend)
4. [Fluxos de Pagamento](#fluxos-de-pagamento)

---

## 🔧 Configuração do Backend

### SDK Instalado

```bash
npm install mercadopago
```

### Variáveis de Ambiente Necessárias

```env
MP_ACCESS_TOKEN=seu_access_token_aqui
FRONTEND_URL=https://primeplush.vercel.app
BACKEND_URL=https://backendprimeplush.onrender.com
```

### Inicialização Automática

O SDK é inicializado automaticamente no `server.js`:

```javascript
import { MercadoPagoConfig, Payment, Preference } from "mercadopago";

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
  options: { timeout: 5000 },
});
```

---

## 🌐 Endpoints Disponíveis

### 1️⃣ Checkout Pro (Página do MercadoPago)

**Redireciona o cliente para página oficial do MercadoPago**

```http
POST /api/payment-online/create-preference
Content-Type: application/json

{
  "items": [
    {
      "name": "Produto 1",
      "price": 10.50,
      "quantity": 2
    }
  ],
  "orderId": "order_123",
  "payerEmail": "cliente@email.com",
  "payerName": "João Silva"
}
```

**Resposta:**

```json
{
  "preferenceId": "1234567890",
  "initPoint": "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=...",
  "sandboxInitPoint": "https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=..."
}
```

**Como usar no frontend:**

```javascript
const response = await fetch("/api/payment-online/create-preference", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    items: cartItems,
    orderId: orderId,
    payerEmail: user.email,
    payerName: user.name,
  }),
});

const data = await response.json();
window.location.href = data.initPoint; // Redireciona para MercadoPago
```

---

### 2️⃣ PIX Direto (QR Code na Tela)

**Gera QR Code PIX para pagamento instantâneo**

```http
POST /api/payment-online/create-pix-direct
Content-Type: application/json

{
  "amount": 50.00,
  "description": "Pedido #123",
  "orderId": "order_123",
  "payerEmail": "cliente@email.com"
}
```

**Resposta:**

```json
{
  "paymentId": "987654321",
  "status": "pending",
  "qrCode": "00020101021243650016COM.MERCADOLIBRE...",
  "qrCodeBase64": "iVBORw0KGgoAAAANSUhEUgAA...",
  "ticketUrl": "https://www.mercadopago.com.br/payments/987654321/ticket"
}
```

**Como usar no frontend:**

```javascript
const response = await fetch('/api/payment-online/create-pix-direct', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    amount: total,
    description: `Pedido ${orderId}`,
    orderId: orderId,
    payerEmail: user.email
  })
});

const data = await response.json();

// Exibir QR Code na tela
<img src={`data:image/png;base64,${data.qrCodeBase64}`} />

// Ou permitir copiar código PIX
<input value={data.qrCode} readOnly />
```

---

### 3️⃣ Cartão de Crédito (Tokenizado)

**Processa pagamento com cartão usando token do MercadoPago.js**

⚠️ **Importante:** Você precisa tokenizar o cartão no frontend primeiro usando o MercadoPago.js!

```http
POST /api/payment-online/create-card-payment
Content-Type: application/json

{
  "token": "card_token_from_frontend",
  "amount": 100.00,
  "description": "Pedido #123",
  "orderId": "order_123",
  "installments": 1,
  "payerEmail": "cliente@email.com",
  "issuerId": "123",
  "paymentMethodId": "visa"
}
```

**Resposta:**

```json
{
  "paymentId": "456789123",
  "status": "approved",
  "statusDetail": "accredited",
  "approved": true
}
```

---

### 4️⃣ Verificar Status de Pagamento

```http
GET /api/payment-online/status/{paymentId}
```

**Resposta:**

```json
{
  "paymentId": "987654321",
  "status": "approved",
  "statusDetail": "accredited",
  "approved": true,
  "externalReference": "order_123"
}
```

**Polling no frontend:**

```javascript
const checkPaymentStatus = async (paymentId) => {
  const response = await fetch(`/api/payment-online/status/${paymentId}`);
  const data = await response.json();

  if (data.approved) {
    // Pagamento aprovado!
    showSuccess();
  } else if (data.status === "rejected") {
    // Pagamento rejeitado
    showError();
  } else {
    // Ainda pendente, verificar novamente em 3s
    setTimeout(() => checkPaymentStatus(paymentId), 3000);
  }
};
```

---

## 💳 Integração no Frontend

### Instalação do MercadoPago.js

```html
<!-- Adicionar no index.html -->
<script src="https://sdk.mercadopago.com/js/v2"></script>
```

### Exemplo Completo - Cartão de Crédito

```javascript
// 1. Inicializar SDK no frontend
const mp = new MercadoPago("YOUR_PUBLIC_KEY");

// 2. Criar formulário de cartão
const cardForm = mp.cardForm({
  amount: "100.0",
  iframe: true,
  form: {
    id: "form-checkout",
    cardNumber: {
      id: "form-checkout__cardNumber",
      placeholder: "Número do cartão",
    },
    expirationDate: {
      id: "form-checkout__expirationDate",
      placeholder: "MM/YY",
    },
    securityCode: {
      id: "form-checkout__securityCode",
      placeholder: "CVV",
    },
    cardholderName: {
      id: "form-checkout__cardholderName",
      placeholder: "Titular do cartão",
    },
    issuer: {
      id: "form-checkout__issuer",
      placeholder: "Banco emissor",
    },
    installments: {
      id: "form-checkout__installments",
      placeholder: "Parcelas",
    },
    identificationType: {
      id: "form-checkout__identificationType",
      placeholder: "Tipo de documento",
    },
    identificationNumber: {
      id: "form-checkout__identificationNumber",
      placeholder: "Número do documento",
    },
    cardholderEmail: {
      id: "form-checkout__cardholderEmail",
      placeholder: "E-mail",
    },
  },
  callbacks: {
    onFormMounted: (error) => {
      if (error) return console.warn("Form Mounted handling error: ", error);
      console.log("Form mounted");
    },
    onSubmit: (event) => {
      event.preventDefault();

      const {
        paymentMethodId: payment_method_id,
        issuerId: issuer_id,
        cardholderEmail: email,
        amount,
        token,
        installments,
        identificationNumber,
        identificationType,
      } = cardForm.getCardFormData();

      // 3. Enviar token para seu backend
      fetch("/api/payment-online/create-card-payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          amount: parseFloat(amount),
          installments: Number(installments),
          paymentMethodId: payment_method_id,
          issuerId: issuer_id,
          payerEmail: email,
          orderId: "order_123",
          description: "Pedido PrimePlush",
        }),
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.approved) {
            alert("Pagamento aprovado!");
          } else {
            alert("Pagamento rejeitado: " + data.statusDetail);
          }
        });
    },
  },
});
```

---

## 🔄 Fluxos de Pagamento

### Fluxo 1: Checkout Pro (Mais Simples)

1. ✅ Cliente clica em "Finalizar Pedido"
2. ✅ Frontend chama `/api/payment-online/create-preference`
3. ✅ Backend cria preferência e retorna URL
4. ✅ Frontend redireciona cliente para MercadoPago
5. ✅ Cliente paga na página do MercadoPago
6. ✅ MercadoPago redireciona de volta para seu site
7. ✅ Webhook notifica seu backend automaticamente

### Fluxo 2: PIX com QR Code

1. ✅ Cliente escolhe PIX
2. ✅ Frontend chama `/api/payment-online/create-pix-direct`
3. ✅ Backend gera QR Code e retorna
4. ✅ Frontend exibe QR Code na tela
5. ✅ Cliente escaneia e paga
6. ✅ Frontend faz polling do status ou aguarda webhook

### Fluxo 3: Cartão de Crédito (Mais Complexo)

1. ✅ Cliente preenche dados do cartão
2. ✅ Frontend tokeniza cartão com MercadoPago.js
3. ✅ Frontend envia token para `/api/payment-online/create-card-payment`
4. ✅ Backend processa pagamento
5. ✅ Retorna aprovação/rejeição imediatamente

---

## 🔐 Segurança

### ✅ O que o BACKEND faz:

- Processar pagamentos com access token (secreto)
- Validar valores e pedidos
- Receber webhooks do MercadoPago
- Atualizar status dos pedidos

### ✅ O que o FRONTEND faz:

- Tokenizar cartões (nunca enviar dados do cartão cru!)
- Exibir formulários
- Polling de status
- Mostrar QR Codes PIX

---

## 📝 Próximos Passos

1. **Obter Credenciais:**
   - Acesse: https://www.mercadopago.com.br/developers/panel/app
   - Copie Public Key (para frontend)
   - Copie Access Token (para backend)

2. **Configurar Webhook:**
   - URL: `https://backendprimeplush.onrender.com/api/webhooks/mercadopago`
   - Já existe no código!

3. **Testar:**
   - Use cartões de teste: https://www.mercadopago.com.br/developers/pt/docs/checkout-api/integration-test/test-cards

---

## 🎯 Recomendação

Para começar **RÁPIDO**, use o **Checkout Pro** (Fluxo 1):

- Mais simples
- MercadoPago cuida da segurança
- Aceita todos os meios de pagamento
- Menos código no frontend

Para **experiência personalizada**, use PIX ou Cartão direto (Fluxos 2 e 3).
