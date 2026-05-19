// Retorna todos os pedidos pagos ou autorizados do banco de dados
// (deve ser adaptado se o acesso ao banco for diferente)
import knex from "knex";
import path from "path";

// Detecta config igual ao server.js
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

export async function getAllOrders() {
  // Busca todos os pedidos pagos ou autorizados
  return db("orders")
    .whereIn("paymentStatus", ["paid", "authorized"])
    .orderBy("timestamp", "desc");
}
