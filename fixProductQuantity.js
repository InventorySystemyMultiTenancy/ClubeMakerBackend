/**
 * fixProductQuantity.js
 *
 * Diagnóstica e corrige a quantidade de um produto nos pedidos.
 *
 * Uso:
 *   node -r dotenv/config fixProductQuantity.js              -> só lista os pedidos com o produto
 *   node -r dotenv/config fixProductQuantity.js --fix <orderId> <novaQtd>
 *       -> atualiza a quantidade do produto no pedido especificado
 *
 * Exemplo de correção:
 *   node -r dotenv/config fixProductQuantity.js --fix abc123 100
 */

import knex from "knex";
import dotenv from "dotenv";
dotenv.config();

// ── CONFIGURAÇÃO ─────────────────────────────────────────────────────────────
// Altere SEARCH_NAME para parte do nome do produto que deseja inspecionar
const SEARCH_NAME = "Mix Prime 20/25 cm Pacote 100 UN";

// Store que contém os pedidos (deixe null para buscar em todas as stores)
const STORE_ID = null;
// ─────────────────────────────────────────────────────────────────────────────

const db = knex(
  process.env.DATABASE_URL
    ? {
        client: "pg",
        connection: {
          connectionString: process.env.DATABASE_URL,
          ssl: { rejectUnauthorized: false },
        },
      }
    : {
        client: "sqlite3",
        connection: { filename: "./data/kiosk.sqlite" },
        useNullAsDefault: true,
      },
);

const parseJSON = (data) => {
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  }
  return data || [];
};

async function listOrders() {
  // Detectar colunas disponíveis para compatibilidade SQLite/PostgreSQL
  const columnInfo = await db("orders").columnInfo();
  const hasStoreId = "store_id" in columnInfo;

  const selectCols = ["id", "items", "timestamp", "total", "paymentStatus"];
  if (hasStoreId) selectCols.splice(1, 0, "store_id");

  let query = db("orders").select(selectCols);

  if (STORE_ID && hasStoreId) {
    query = query.where("store_id", STORE_ID);
  }

  const orders = await query;

  const results = [];
  let grandTotal = 0;

  for (const order of orders) {
    const items = parseJSON(order.items);
    if (!Array.isArray(items)) continue;

    for (const item of items) {
      const name = item.name || item.productName || "";
      if (name.toLowerCase().includes(SEARCH_NAME.toLowerCase())) {
        const qty = Number(item.quantity) || 1;
        grandTotal += qty;
        results.push({
          orderId: order.id,
          storeId: order.store_id,
          timestamp: order.timestamp,
          paymentStatus: order.paymentStatus,
          orderTotal: order.total,
          productName: name,
          productId: item.productId || item.id || "(sem id)",
          quantity: qty,
          price: item.price,
        });
      }
    }
  }

  if (results.length === 0) {
    console.log(
      `\n⚠️  Nenhum pedido encontrado com o produto "${SEARCH_NAME}"`,
    );
    console.log(
      "   Verifique se o nome está correto (sem acento, capitalização, etc.)",
    );
    return { results, grandTotal };
  }

  console.log(`\n📦 Produto buscado: "${SEARCH_NAME}"`);
  console.log(`📊 Total de unidades encontradas: ${grandTotal}`);
  console.log(
    `📋 Pedidos que contêm esse produto (${results.length} entradas):\n`,
  );

  console.log(
    "Nr".padEnd(4) +
      "Order ID".padEnd(40) +
      "Store".padEnd(12) +
      "Qtd".padEnd(6) +
      "Status".padEnd(14) +
      "Data",
  );
  console.log("-".repeat(100));

  results.forEach((r, i) => {
    const date = r.timestamp
      ? new Date(r.timestamp).toLocaleString("pt-BR")
      : "—";
    console.log(
      String(i + 1).padEnd(4) +
        String(r.orderId).padEnd(40) +
        String(r.storeId || "—").padEnd(12) +
        String(r.quantity).padEnd(6) +
        String(r.paymentStatus || "—").padEnd(14) +
        date,
    );
  });

  if (grandTotal !== 600) {
    console.log(`\n⚠️  Total atual: ${grandTotal} | Esperado: 600`);
    console.log(
      `   Diferença: ${grandTotal > 600 ? "+" : ""}${grandTotal - 600} unidade(s)`,
    );
    console.log("\n💡 Para corrigir, rode:");
    console.log(
      `   node -r dotenv/config fixProductQuantity.js --fix <orderId> <novaQuantidade>`,
    );
    console.log(
      "\n   Exemplo: se o pedido 'abc123' está com qtd 101 e deve ser 100:",
    );
    console.log(
      "   node -r dotenv/config fixProductQuantity.js --fix abc123 100",
    );
  } else {
    console.log("\n✅ Total correto! Nenhuma correção necessária.");
  }

  return { results, grandTotal };
}

async function fixOrder(orderId, newQty) {
  console.log(`\n🔧 Corrigindo pedido ${orderId}...`);

  const order = await db("orders").where({ id: orderId }).first();
  if (!order) {
    console.error(`❌ Pedido "${orderId}" não encontrado.`);
    process.exit(1);
  }

  const items = parseJSON(order.items);
  if (!Array.isArray(items)) {
    console.error("❌ Não foi possível parsear os itens do pedido.");
    process.exit(1);
  }

  let found = false;
  // Se newQty === 0, remove o item do array; caso contrário, atualiza a quantidade
  const updatedItems = items
    .map((item) => {
      const name = item.name || item.productName || "";
      if (name.toLowerCase().includes(SEARCH_NAME.toLowerCase())) {
        console.log(
          `   Produto: "${item.name}" | Quantidade antiga: ${item.quantity} → ${newQty === 0 ? "REMOVIDO do pedido" : `Nova: ${newQty}`}`,
        );
        found = true;
        if (newQty === 0) return null; // marca para remoção
        return { ...item, quantity: newQty };
      }
      return item;
    })
    .filter(Boolean); // remove os null

  if (!found) {
    console.error(
      `❌ Produto "${SEARCH_NAME}" não encontrado nos itens do pedido ${orderId}.`,
    );
    process.exit(1);
  }

  // Recalcular total do pedido (soma de price * quantity de todos os itens)
  const newTotal = updatedItems.reduce((sum, item) => {
    return sum + (Number(item.price) || 0) * (Number(item.quantity) || 1);
  }, 0);

  await db("orders")
    .where({ id: orderId })
    .update({
      items: JSON.stringify(updatedItems),
      total: Number(newTotal.toFixed(2)),
    });

  console.log(`\n✅ Pedido ${orderId} atualizado com sucesso!`);
  console.log(`   Novo total do pedido: R$ ${newTotal.toFixed(2)}`);
  console.log(
    "\n🔄 Execute o script sem --fix novamente para confirmar o total de 600.",
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

try {
  if (args[0] === "--fix") {
    const orderId = args[1];
    const newQty = parseInt(args[2], 10);

    if (!orderId || isNaN(newQty) || newQty < 0) {
      console.error(
        "❌ Uso: node -r dotenv/config fixProductQuantity.js --fix <orderId> <novaQuantidade>",
      );
      process.exit(1);
    }

    await fixOrder(orderId, newQty);
  } else {
    await listOrders();
  }
} finally {
  await db.destroy();
}
