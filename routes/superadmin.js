import express from "express";
import knex from "knex";
import path from "path";
const router = express.Router();

// 1. Configuração do Banco
const dbConfig = process.env.DATABASE_URL
  ? {
      client: "pg",
      connection: {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      },
    }
  : {
      client: "sqlite3",
      connection: {
        filename: path.join(process.cwd(), "data", "kiosk.sqlite"),
      },
      useNullAsDefault: true,
    };

const db = knex(dbConfig);

// 2. Middleware de autenticação
function superAdminAuth(req, res, next) {
  const password = req.headers["x-super-admin-password"];
  if (!password || password !== process.env.SUPER_ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// 3. Endpoint POST - Marcar como recebido
router.post(
  "/super-admin/receivables/mark-received",
  superAdminAuth,
  async (req, res) => {
    try {
      const { orderIds } = req.body;
      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ error: "orderIds obrigatório (array)" });
      }

      const now = new Date().toISOString();
      let valorRecebidoTotal = 0;
      let valorRecebidoDetalhado = [];
      for (const orderId of orderIds) {
        const order = await db("orders").where({ id: orderId }).first();
        if (!order) continue;
        let items = [];
        try {
          items = Array.isArray(order.items)
            ? order.items
            : JSON.parse(order.items || "[]");
        } catch (e) {
          items = [];
        }
        let valorRecebido = 0;
        items.forEach((item) => {
          let precoBruto = item.precoBruto || item.priceRaw || 0;
          let precoVenda = item.price || 0;
          let quantity = item.quantity || 1;
          valorRecebido += (precoVenda - precoBruto) * quantity;
        });
        valorRecebidoTotal += valorRecebido;
        valorRecebidoDetalhado.push({ orderId, valorRecebido });
        await db("orders").where({ id: orderId }).update({
          repassadoSuperAdmin: 1,
          dataRepasseSuperAdmin: now,
          valorRecebido: valorRecebido,
        });
      }

      // Salva o valor recebido total e detalhado na tabela de repasses
      await db("super_admin_receivables").insert({
        amount: valorRecebidoTotal,
        order_ids: JSON.stringify(orderIds),
        received_at: now,
        valorRecebidoDetalhado: JSON.stringify(valorRecebidoDetalhado),
      });

      return res.json({
        success: true,
        message: "Recebíveis marcados como recebidos",
        receivedOrderIds: orderIds,
        dataRepasse: now,
        valorRecebidoTotal,
        valorRecebidoDetalhado,
      });
    } catch (err) {
      console.error("[DEBUG] Erro no POST:", err);
      return res
        .status(500)
        .json({ error: "Erro interno", details: err.message });
    }
  },
);

// 4. Endpoint GET - Listar recebíveis
router.get("/super-admin/receivables", superAdminAuth, async (req, res) => {
  try {
    // A. Buscar IDs já processados na tabela de repasses
    const receivablesRows = await db("super_admin_receivables").select(
      "order_ids",
    );
    let alreadyProcessedIds = [];
    receivablesRows.forEach((row) => {
      if (row.order_ids) {
        try {
          const ids = JSON.parse(row.order_ids);
          if (Array.isArray(ids)) alreadyProcessedIds.push(...ids);
        } catch (e) {
          /* ignore */
        }
      }
    });

    // B. Buscar pedidos pagos que ainda não foram processados
    const paidOrders = await db("orders")
      .whereIn("paymentStatus", ["paid", "authorized"])
      .andWhere(function () {
        this.where("hiddenFromHistory", false).orWhereNull("hiddenFromHistory");
      })
      .whereNotIn(
        "id",
        alreadyProcessedIds.length > 0 ? alreadyProcessedIds : [""],
      )
      .orderBy("timestamp", "desc");

    let totalBrutoReceber = 0;
    const detailedOrders = [];

    // C. Processar detalhes de cada pedido pendente
    for (const order of paidOrders) {
      let items = [];
      try {
        items = Array.isArray(order.items)
          ? order.items
          : JSON.parse(order.items || "[]");
      } catch (e) {
        items = [];
      }

      const detailedItems = [];
      let orderValueToReceive = 0;

      for (const item of items) {
        const prodId = item.productId || item.id;
        let precoBruto = 0;

        if (prodId) {
          const prod = await db("products").where({ id: prodId }).first();
          precoBruto = prod && prod.priceRaw ? parseFloat(prod.priceRaw) : 0;
        }

        const price = Number(item.price) || 0;
        const quantity = Number(item.quantity) || 1;
        const profit = (price - precoBruto) * quantity;

        orderValueToReceive += profit;
        detailedItems.push({
          name: item.name || "Produto",
          price,
          precoBruto,
          quantity,
          valueToReceive: profit,
        });
      }

      totalBrutoReceber += orderValueToReceive;
      detailedOrders.push({
        id: order.id,
        timestamp: order.timestamp,
        userName: order.userName || "Cliente",
        total: parseFloat(order.total) || 0,
        orderValueToReceive,
        items: detailedItems,
        paymentStatus: order.paymentStatus,
      });
    }

    // D. Buscar Histórico de Repasses
    const historyRows = await db("super_admin_receivables")
      .select(
        "id",
        "amount",
        "received_at",
        "order_ids",
        "valorRecebidoDetalhado",
      )
      .orderBy("received_at", "desc")
      .limit(20);

    const history = [];
    for (const h of historyRows) {
      let orderIds = [];
      let valorRecebidoDetalhado = [];
      try {
        orderIds = JSON.parse(h.order_ids || "[]");
      } catch (e) {
        orderIds = [];
      }
      try {
        valorRecebidoDetalhado = h.valorRecebidoDetalhado
          ? JSON.parse(h.valorRecebidoDetalhado)
          : [];
      } catch (e) {
        valorRecebidoDetalhado = [];
      }

      if (orderIds.length > 0) {
        const relatedOrders = await db("orders").whereIn("id", orderIds);
        relatedOrders.forEach((o) => {
          let valorRecebido = null;
          let items = [];
          try {
            items = Array.isArray(o.items)
              ? o.items
              : JSON.parse(o.items || "[]");
          } catch (e) {
            items = [];
          }
          valorRecebido = 0;
          items.forEach((item) => {
            let precoBruto = item.precoBruto || item.priceRaw || 0;
            let precoVenda = item.price || 0;
            let quantity = item.quantity || 1;
            valorRecebido += (precoVenda - precoBruto) * quantity;
          });
          const valorTotal = o.total ? parseFloat(o.total) : 0;
          history.push({
            repasseId: h.id,
            pedidoId: o.id,
            cliente: o.userName || "-",
            valorTotal,
            dataPedido: o.timestamp,
            dataRepasse: o.dataRepasseSuperAdmin || h.received_at,
            valorRecebido,
          });
        });
      } else {
        history.push({
          repasseId: h.id,
          pedidoId: "-",
          cliente: "N/A",
          valorTotal: parseFloat(h.amount) || 0,
          dataPedido: "-",
          dataRepasse: h.received_at,
          valorRecebido: parseFloat(h.amount),
        });
      }
    }

    const totalSum = await db("super_admin_receivables")
      .sum("amount as total")
      .first();

    return res.json({
      success: true,
      stats: {
        totalToReceive: Math.max(0, totalBrutoReceber),
        alreadyReceived: parseFloat(totalSum.total) || 0,
      },
      history,
      orders: detailedOrders,
    });
  } catch (err) {
    console.error("[ERROR GET]:", err);
    return res
      .status(500)
      .json({ error: "Erro ao buscar dados", details: err.message });
  }
});

// Endpoint para marcar pedido como entregue ao cliente
router.put("/orders/:id/mark-delivered", async (req, res) => {
  try {
    const { id } = req.params;

    const order = await db("orders").where({ id }).first();
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Pedido não encontrado." });
    }

    // Só desconta estoque se ainda não foi descontado via pagamento
    const alreadyPaid =
      order.paymentStatus === "paid" || order.paymentStatus === "authorized";
    if (!alreadyPaid) {
      let items = [];
      try {
        items =
          typeof order.items === "string"
            ? JSON.parse(order.items)
            : order.items;
      } catch (err) {
        console.error("[mark-delivered] Erro ao parsear itens:", err);
      }

      for (const item of items) {
        const product = await db("products").where({ id: item.id }).first();
        if (product && product.stock !== null) {
          const newStock = Math.max(0, product.stock - item.quantity);
          const newReserved = Math.max(
            0,
            (product.stock_reserved || 0) - item.quantity,
          );
          await db("products").where({ id: item.id }).update({
            stock: newStock,
            stock_reserved: newReserved,
          });
          console.log(
            `  ✅ [mark-delivered] ${item.name}: ${product.stock} → ${newStock} (-${item.quantity})`,
          );
        }
      }
    } else {
      console.log(
        `⚠️ [mark-delivered] Estoque já descontado via pagamento. Pulando dedução.`,
      );
    }

    const updated = await db("orders")
      .where({ id })
      .update({ entregueCliente: 1 });
    if (updated) {
      return res.json({
        success: true,
        message: "Pedido marcado como entregue ao cliente.",
      });
    } else {
      return res
        .status(404)
        .json({ success: false, message: "Pedido não encontrado." });
    }
  } catch (err) {
    console.error("[ERRO] PUT /orders/:id/mark-delivered", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
