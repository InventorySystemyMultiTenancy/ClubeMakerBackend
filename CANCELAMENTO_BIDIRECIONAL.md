# Fluxo de Cancelamento Bidirecional

## ✅ Implementado - Sincronização Maquininha ↔ Site

### 1. **Cancelamento na Maquininha → Site**

Quando o usuário cancela o pagamento **diretamente na maquininha**:

#### Detecção Automática

- Frontend faz **polling** a cada 3 segundos em `/api/payment/status/:paymentId`
- Backend detecta `intent.state === "CANCELED"` no Mercado Pago
- Sistema **automaticamente**:
  - ✅ Libera o estoque reservado
  - ✅ Atualiza o pedido para `status: "canceled"`
  - ✅ Retorna para o frontend: `{ status: "canceled", reason: "canceled_by_user" }`

#### Resposta do Endpoint

```json
{
  "status": "canceled",
  "reason": "canceled_by_user",
  "orderId": "abc123",
  "message": "Pagamento cancelado na maquininha pelo usuário"
}
```

#### Frontend

O frontend detecta `status === "canceled"` e pode:

- Mostrar mensagem: "Pagamento cancelado"
- Redirecionar para página de checkout
- Permitir nova tentativa de pagamento

---

### 2. **Cancelamento no Site → Maquininha**

Quando o usuário cancela no site (botão "Cancelar"):

#### Endpoint de Cancelamento

```javascript
DELETE /api/payment/cancel/:paymentId
```

#### Fluxo

1. Frontend chama o endpoint de cancelamento
2. Backend envia `DELETE` para Mercado Pago Point Integration API
3. Maquininha recebe comando e cancela a transação
4. Retorna sucesso:
   ```json
   {
     "success": true,
     "message": "Pagamento na maquininha cancelado."
   }
   ```

#### Códigos de Resposta

- **200 OK**: Cancelamento enviado com sucesso
- **404 Not Found**: Payment Intent não existe (já foi processado ou cancelado)
- **409 Conflict**: Pagamento já está sendo processado, não pode cancelar

---

## Estados de Pagamento e Razões

### Status: `"canceled"`

| Reason               | Origem     | Descrição                                         |
| -------------------- | ---------- | ------------------------------------------------- |
| `canceled_by_user`   | Maquininha | Usuário pressionou botão cancelar na maquininha   |
| `payment_error`      | Maquininha | Erro técnico no processamento (state "ERROR")     |
| `canceled_by_system` | PIX        | Sistema cancelou pagamento PIX expirado/rejeitado |

### Status: `"rejected"`

| Reason                 | Origem     | Descrição                                |
| ---------------------- | ---------- | ---------------------------------------- |
| `rejected_by_terminal` | Maquininha | Cartão recusado, saldo insuficiente, etc |

### Status: `"approved"`

Pagamento confirmado com sucesso.

### Status: `"pending"`

Aguardando conclusão do pagamento.

---

## Exemplo de Implementação no Frontend

### Verificação de Status

```typescript
const checkPaymentStatus = async (paymentId: string) => {
  const response = await fetch(`/api/payment/status/${paymentId}`);
  const data = await response.json();

  if (data.status === "approved") {
    // ✅ Pagamento aprovado
    showSuccess("Pagamento confirmado!");
    finalizeOrder();
  } else if (data.status === "canceled") {
    // ❌ Pagamento cancelado
    if (data.reason === "canceled_by_user") {
      showWarning("Você cancelou o pagamento na maquininha.");
    } else if (data.reason === "payment_error") {
      showError("Erro ao processar pagamento. Tente novamente.");
    }
    redirectToCheckout();
  } else if (data.status === "rejected") {
    // ❌ Pagamento rejeitado
    if (data.reason === "rejected_by_terminal") {
      showError("Pagamento recusado. Verifique seu cartão.");
    }
    redirectToCheckout();
  } else if (data.status === "pending") {
    // ⏳ Ainda processando
    // Continuar polling
  }
};
```

### Botão de Cancelamento

```typescript
const cancelPayment = async (paymentId: string) => {
  try {
    const response = await fetch(`/api/payment/cancel/${paymentId}`, {
      method: "DELETE",
    });

    const data = await response.json();

    if (data.success) {
      showSuccess("Pagamento cancelado!");
      redirectToCheckout();
    } else if (response.status === 409) {
      showWarning("Pagamento em andamento, não pode ser cancelado.");
    } else {
      showError("Não foi possível cancelar o pagamento.");
    }
  } catch (error) {
    showError("Erro ao cancelar pagamento.");
  }
};
```

---

## Logs do Backend

### Cancelamento Detectado na Maquininha

```
❌ Intent CANCELED (cancelado pelo usuário na maquininha)
  -> Pedido associado: abc123. Cancelando...
  ↩️ Estoque liberado para Produto X: 5 -> 10
  ✅ Pedido abc123 e estoque atualizados com sucesso!
```

### Cancelamento Enviado para Maquininha

```
🛑 Tentando cancelar pagamento: xyz789
  -> Enviando DELETE para a maquininha: https://api.mercadopago.com/...
✅ Comando de cancelamento para a maquininha enviado com sucesso para xyz789.
```

---

## Testando o Fluxo

### Teste 1: Cancelamento na Maquininha

1. Crie um pedido e inicie o pagamento na maquininha
2. Na maquininha, pressione o botão "Cancelar"
3. **Resultado esperado**:
   - Logs mostram `Intent CANCELED (cancelado pelo usuário)`
   - Estoque é liberado automaticamente
   - Frontend recebe `status: "canceled", reason: "canceled_by_user"`
   - Site mostra mensagem de cancelamento

### Teste 2: Cancelamento no Site

1. Crie um pedido e inicie o pagamento na maquininha
2. No site, clique no botão "Cancelar Pagamento"
3. **Resultado esperado**:
   - Backend envia DELETE para MP
   - Maquininha cancela a transação
   - Frontend recebe `success: true`
   - Site redireciona para checkout

### Teste 3: Cancelamento Duplo

1. Inicie pagamento na maquininha
2. Cancele no site
3. Tente cancelar novamente
4. **Resultado esperado**:
   - Segunda tentativa retorna 404 (já foi cancelado)
   - Sistema trata graciosamente sem erros

---

## Notas Técnicas

### Polling Interval

- **Recomendado**: 3 segundos
- Balanceio entre responsividade e carga no servidor
- Pode ser ajustado no frontend conforme necessário

### Timeout de Pagamento

- Payment Intent expira após **10 minutos** (configurado no MP)
- Após expiração, `intent.state === "ERROR"`
- Sistema trata como `payment_error`

### Estoque Reservado

- Reservado no momento da criação do pedido (`POST /api/orders`)
- Liberado quando:
  - Pagamento é cancelado (CANCELED)
  - Pagamento falha (ERROR)
  - Timeout do pedido

### Cache

- Pagamentos rejeitados/cancelados são **removidos do cache**
- Evita que sejam reutilizados em novas tentativas
- Cache só mantém pagamentos `approved` ou `authorized`

---

## Compatibilidade

- ✅ Payment Intent (Maquininha Point)
- ✅ PIX Payments
- ✅ Frontend com React Query polling
- ✅ IPN/Webhook notifications
- ✅ Estoque dinâmico (reservado/disponível)
