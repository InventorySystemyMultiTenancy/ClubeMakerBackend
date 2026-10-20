// Cadastro de clientes pelo painel admin (aba "Clientes") e permissões de cliente.
// Clientes são usuários da tabela 'users' com role 'customer' (ou sem role, nos
// cadastros mais antigos). A senha continua em texto puro porque é assim que
// POST /api/users/login compara — mudar aqui quebraria o login dos clientes.
import express from "express";
import knex from "knex";
import jwt from "jsonwebtoken";
import path from "path";
import { requireAdminPermission } from "./adminUsers.js";

const router = express.Router();

// --- Configuração do Banco (mesmo padrão de routes/superadmin.js) ---
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
const JWT_SECRET = process.env.JWT_SECRET;

// Montado antes de app.use(express.json()) no server.js: parser e auth são
// aplicados por rota pelo mesmo motivo explicado em routes/printFarm.js.
const jsonParser = express.json({ limit: "1mb" });

// Funcionalidades que o admin pode liberar para cada cliente.
// Manter em sincronia com utils/customerPermissions.ts no frontend.
export const CUSTOMER_PERMISSIONS = [
  "confirmar_entrega", // o próprio cliente registra a entrega dos seus pedidos
];

const CUSTOMER_FIELDS = [
  "id",
  "name",
  "cpf",
  "email",
  "phone",
  "cep",
  "address",
  "role",
  "customer_permissions",
];

export function parseCustomerPermissions(raw) {
  try {
    const list = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(list) ? list.filter((p) => CUSTOMER_PERMISSIONS.includes(p)) : [];
  } catch (e) {
    return [];
  }
}

function normalizePermissionsInput(permissions) {
  if (!Array.isArray(permissions)) return null;
  return [...new Set(permissions.filter((p) => CUSTOMER_PERMISSIONS.includes(p)))];
}

function serializeCustomer(user) {
  return {
    id: user.id,
    name: user.name,
    cpf: user.cpf,
    email: user.email || null,
    phone: user.phone || null,
    cep: user.cep || null,
    address: user.address || null,
    permissions: parseCustomerPermissions(user.customer_permissions),
  };
}

// Cadastros antigos podem não ter role
const whereCustomer = (query) =>
  query.where((q) => q.where("role", "customer").orWhereNull("role"));

// Token do cliente: emitido no login/cadastro (POST /api/users/login e /register)
// e exigido só nas ações sensíveis, como registrar a entrega do próprio pedido.
export function signCustomerToken(user) {
  if (!JWT_SECRET || (user.role && user.role !== "customer")) return null;
  return jwt.sign({ role: "customer", userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (token == null) {
    return res.status(401).json({ error: "Acesso negado. Token não fornecido." });
  }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(401).json({ error: "Token inválido ou expirado." });
    }
    req.user = user;
    next();
  });
}

const requireManageCustomers = requireAdminPermission("clientes");

// ========== CRIAÇÃO DE COLUNAS ==========
export async function initCustomerColumns() {
  // Mesma ressalva de initPrintFarmTables(): numa instalação nova 'users' pode
  // ainda não existir neste instante.
  if (!(await db.schema.hasTable("users"))) return;
  if (!(await db.schema.hasColumn("users", "customer_permissions"))) {
    await db.schema.table("users", (table) => {
      table.text("customer_permissions"); // JSON: lista de CUSTOMER_PERMISSIONS liberadas
    });
    console.log("✅ Coluna 'customer_permissions' adicionada à tabela users");
  }
}

// ========== CLIENTE LOGADO ==========
// Funcionalidades liberadas para o cliente logado — consultado ao abrir "Meus Pedidos",
// assim o que o admin liberar vale sem o cliente sair e entrar de novo.
router.get("/customer/me", jsonParser, authenticateToken, async (req, res) => {
  try {
    if (req.user?.role !== "customer" || !req.user.userId) {
      return res.status(403).json({ error: "Acesso negado." });
    }
    const user = await whereCustomer(db("users").where({ id: req.user.userId })).first();
    if (!user) return res.status(401).json({ error: "Cliente não encontrado." });
    res.json(serializeCustomer(user));
  } catch (e) {
    console.error("Erro ao buscar cliente logado:", e);
    res.status(500).json({ error: "Erro ao buscar cliente" });
  }
});

// ========== CRUD (admin) ==========
router.get(
  "/admin-customers",
  jsonParser,
  authenticateToken,
  requireManageCustomers,
  async (req, res) => {
    try {
      const customers = await whereCustomer(db("users").select(CUSTOMER_FIELDS)).orderBy("name");
      res.json(customers.map(serializeCustomer));
    } catch (e) {
      console.error("Erro ao listar clientes:", e);
      res.status(500).json({ error: "Erro ao listar clientes" });
    }
  },
);

router.post(
  "/admin-customers",
  jsonParser,
  authenticateToken,
  requireManageCustomers,
  async (req, res) => {
    try {
      const { name, cpf, email, phone, cep, address, password, permissions } = req.body || {};
      if (!name || !cpf || !email || !password) {
        return res.status(400).json({ error: "Nome, CPF/CNPJ, e-mail e senha são obrigatórios" });
      }
      const docClean = String(cpf).replace(/\D/g, "");
      if (docClean.length !== 11 && docClean.length !== 14) {
        return res
          .status(400)
          .json({ error: "Documento inválido. Digite 11 dígitos (CPF) ou 14 (CNPJ)." });
      }
      if (String(password).length < 4) {
        return res.status(400).json({ error: "Senha deve ter pelo menos 4 caracteres" });
      }
      const existing = await db("users").where({ cpf: docClean }).first();
      if (existing) {
        return res.status(409).json({ error: "Já existe um usuário cadastrado com esse documento" });
      }
      const id = `user_${Date.now()}`;
      await db("users").insert({
        id,
        name: String(name).trim(),
        cpf: docClean,
        email: String(email).trim(),
        phone: phone ? String(phone).trim() : null,
        cep: cep ? String(cep).trim() : null,
        address: address ? String(address).trim() : null,
        password: String(password),
        role: "customer",
        customer_permissions: JSON.stringify(normalizePermissionsInput(permissions) || []),
        historico: JSON.stringify([]),
        pontos: 0,
      });
      const customer = await db("users").select(CUSTOMER_FIELDS).where({ id }).first();
      res.status(201).json(serializeCustomer(customer));
    } catch (e) {
      console.error("Erro ao criar cliente:", e);
      res.status(500).json({ error: "Erro ao criar cliente" });
    }
  },
);

router.put(
  "/admin-customers/:id",
  jsonParser,
  authenticateToken,
  requireManageCustomers,
  async (req, res) => {
    try {
      const current = await whereCustomer(db("users").where({ id: req.params.id })).first();
      if (!current) return res.status(404).json({ error: "Cliente não encontrado" });

      const { name, cpf, email, phone, cep, address, password, permissions } = req.body || {};
      const fields = {};
      if (name !== undefined) {
        if (!String(name).trim()) return res.status(400).json({ error: "Nome é obrigatório" });
        fields.name = String(name).trim();
      }
      if (cpf !== undefined) {
        const docClean = String(cpf).replace(/\D/g, "");
        if (docClean.length !== 11 && docClean.length !== 14) {
          return res
            .status(400)
            .json({ error: "Documento inválido. Digite 11 dígitos (CPF) ou 14 (CNPJ)." });
        }
        if (docClean !== current.cpf) {
          const existing = await db("users").where({ cpf: docClean }).first();
          if (existing) {
            return res
              .status(409)
              .json({ error: "Já existe um usuário cadastrado com esse documento" });
          }
        }
        fields.cpf = docClean;
      }
      if (email !== undefined) fields.email = String(email).trim();
      if (phone !== undefined) fields.phone = phone ? String(phone).trim() : null;
      if (cep !== undefined) fields.cep = cep ? String(cep).trim() : null;
      if (address !== undefined) fields.address = address ? String(address).trim() : null;
      const normalized = normalizePermissionsInput(permissions);
      if (normalized) fields.customer_permissions = JSON.stringify(normalized);
      if (password) {
        if (String(password).length < 4) {
          return res.status(400).json({ error: "Senha deve ter pelo menos 4 caracteres" });
        }
        fields.password = String(password);
      }
      if (Object.keys(fields).length > 0) {
        await db("users").where({ id: req.params.id }).update(fields);
      }
      const customer = await db("users")
        .select(CUSTOMER_FIELDS)
        .where({ id: req.params.id })
        .first();
      res.json(serializeCustomer(customer));
    } catch (e) {
      console.error("Erro ao atualizar cliente:", e);
      res.status(500).json({ error: "Erro ao atualizar cliente" });
    }
  },
);

export default router;
