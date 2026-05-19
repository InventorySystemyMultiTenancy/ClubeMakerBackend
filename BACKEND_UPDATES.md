# 🔧 Atualizações Necessárias no Backend (server.js)

## ⚠️ IMPORTANTE: Adicione estas rotas no seu server.js

### 1. Atualizar rota POST /api/orders (linha ~398)

**Substituir:**
```javascript
app.post("/api/orders", async (req, res) => {
  const { userId, userName, items, total, paymentId } = req.body;

  const newOrder = {
    id: `order_${Date.now()}`,
    userId,
    userName: userName || "Cliente",
    items: JSON.stringify(items || []),
    total: total || 0,
    timestamp: new Date().toISOString(),
    status: "active",
    paymentStatus: "paid", // Assumimos pago pois o frontend só chama após sucesso
    paymentId: paymentId || null,
  };

  try {
    // Garante que o usuário existe (para convidados)
    const userExists = await db("users").where({ id: userId }).first();
    if (!userExists) {
      await db("users").insert({
        id: userId,
        name: userName || "Convidado",
        email: null,
        cpf: null,
        historico: "[]",
        pontos: 0,
      });
    }

    await db("orders").insert(newOrder);
    res.status(201).json({ ...newOrder, items: items || [] });
  } catch (e) {
    console.error("Erro salvar ordem:", e);
    res.status(500).json({ error: "Erro ao salvar ordem" });
  }
});
```

**Por:**
```javascript
app.post("/api/orders", async (req, res) => {
  const { userId, userName, items, total, paymentId } = req.body;

  const newOrder = {
    id: `order_${Date.now()}`,
    userId,
    userName: userName || "Cliente",
    items: JSON.stringify(items || []),
    total: total || 0,
    timestamp: new Date().toISOString(),
    status: "active",
    paymentStatus: paymentId ? "paid" : "pending", // pending se ainda não tem paymentId
    paymentId: paymentId || null,
  };

  try {
    console.log(`📦 Criando pedido ${newOrder.id}...`);
    
    // Garante que o usuário existe (para convidados)
    const userExists = await db("users").where({ id: userId }).first();
    if (!userExists) {
      await db("users").insert({
        id: userId,
        name: userName || "Convidado",
        email: null,
        cpf: null,
        historico: "[]",
        pontos: 0,
      });
    }

    // ✅ DESCONTA ESTOQUE AQUI (ANTES de inserir o pedido)
    console.log(`📉 Descontando estoque de ${items.length} produto(s)...`);
    
    for (const item of items) {
      const product = await db("products").where({ id: item.id }).first();
      
      if (!product) {
        console.warn(`⚠️ Produto ${item.id} não encontrado no estoque`);
        continue;
      }
      
      // Se stock é null = ilimitado, não precisa descontar
      if (product.stock === null) {
        console.log(`  ℹ️ ${item.name}: estoque ilimitado`);
        continue;
      }
      
      // Verifica se tem estoque suficiente
      if (product.stock < item.quantity) {
        throw new Error(`Estoque insuficiente para ${item.name}. Disponível: ${product.stock}, Solicitado: ${item.quantity}`);
      }
      
      // Desconta o estoque
      const newStock = product.stock - item.quantity;
      
      await db("products")
        .where({ id: item.id })
        .update({ stock: Math.max(0, newStock) });
      
      console.log(`  ✅ ${item.name}: ${product.stock} → ${Math.max(0, newStock)} (-${item.quantity})`);
    }
    
    console.log(`✅ Estoque atualizado com sucesso!`);

    // Salva o pedido
    await db("orders").insert(newOrder);
    
    console.log(`✅ Pedido ${newOrder.id} criado com sucesso!`);
    
    res.status(201).json({ ...newOrder, items: items || [] });
  } catch (e) {
    console.error("❌ Erro ao salvar pedido:", e);
    res.status(500).json({ error: e.message || "Erro ao salvar ordem" });
  }
});
```

### 2. Adicionar rota PUT /api/orders/:id (NOVA ROTA - adicionar após a rota POST /api/orders)

```javascript
// Atualizar pedido (adicionar paymentId após pagamento aprovado)
app.put("/api/orders/:id", async (req, res) => {
  const { id } = req.params;
  const { paymentId, paymentStatus } = req.body;

  try {
    console.log(`📝 Atualizando pedido ${id} com payment ${paymentId}...`);
    
    const exists = await db("orders").where({ id }).first();
    if (!exists) {
      return res.status(404).json({ error: "Pedido não encontrado" });
    }

    const updates = {};
    if (paymentId) updates.paymentId = paymentId;
    if (paymentStatus) updates.paymentStatus = paymentStatus;

    await db("orders").where({ id }).update(updates);
    
    const updated = await db("orders").where({ id }).first();
    console.log(`✅ Pedido ${id} atualizado!`);
    
    res.json({ 
      ...updated, 
      items: parseJSON(updated.items),
      total: parseFloat(updated.total)
    });
  } catch (e) {
    console.error("❌ Erro ao atualizar pedido:", e);
    res.status(500).json({ error: "Erro ao atualizar pedido" });
  }
});
```

## 📋 Resumo das Mudanças:

### Frontend (✅ JÁ IMPLEMENTADO):
1. Criar pedido PRIMEIRO → desconta estoque
2. Criar pagamento DEPOIS → usa orderId real
3. Atualizar pedido com paymentId após aprovação

### Backend (⚠️ VOCÊ PRECISA ADICIONAR):
1. Rota POST `/api/orders` → desconta estoque ao criar pedido
2. Rota PUT `/api/orders/:id` → atualiza paymentId após pagamento

## 🎯 Fluxo Correto Agora:

```
1. Usuário clica "Pagar"
   ↓
2. Frontend: POST /api/orders (cria pedido + desconta estoque)
   ↓
3. Frontend: POST /api/pix/create OU /api/payment/create (cria pagamento com orderId)
   ↓
4. Usuário paga (PIX ou maquininha)
   ↓
5. Frontend: PUT /api/orders/:id (atualiza pedido com paymentId)
   ↓
6. Sucesso! Estoque descontado, pedido registrado
```

## ⚠️ Importante:

- **Estoque é descontado IMEDIATAMENTE** ao criar o pedido (passo 2)
- Se o pagamento falhar, o estoque já foi descontado (comportamento intencional - evita venda duplicada)
- Se quiser reverter estoque em caso de falha, adicione lógica de rollback

#atualizado
