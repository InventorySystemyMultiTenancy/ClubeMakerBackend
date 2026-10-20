// Cadastro de administradores com acesso personalizado por aba do painel.
// São usuários de verdade (tabela 'users', role 'admin'), com senha em hash e
// login por CPF + senha — o mesmo modelo dos operadores de impressora.
// O administrador principal (senha compartilhada ADMIN_PASSWORD) continua
// existindo e sempre tem acesso total; o token dele não carrega userId.
import express from "express";
import knex from "knex";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import path from "path";

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

// Abas do painel admin que podem ser liberadas/bloqueadas por administrador.
// "admins" não é uma aba: é a permissão de criar/editar outros administradores.
// Manter em sincronia com utils/adminPermissions.ts no frontend.
export const ADMIN_PERMISSIONS = [
  "painel",
  "nova_venda",
  "categorias",
  "cadastro_cliente",
  "clientes",
  "historico",
  "orcamentos",
  "impressoras",
  "relatorio_gestao",
  "relatorios_ia",
  "admins",
];

const ADMIN_FIELDS = ["id", "name", "cpf", "email", "phone", "active", "admin_permissions"];

function parsePermissions(raw) {
  try {
    const list = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(list) ? list.filter((p) => ADMIN_PERMISSIONS.includes(p)) : [];
  } catch (e) {
    return [];
  }
}

function serializeAdmin(user) {
  return {
    id: user.id,
    name: user.name,
    cpf: user.cpf,
    email: user.email,
    phone: user.phone,
    // SQLite guarda boolean como 0/1
    active: Boolean(user.active),
    permissions: parsePermissions(user.admin_permissions),
  };
}

function normalizePermissionsInput(permissions) {
  if (!Array.isArray(permissions)) return null;
  return [...new Set(permissions.filter((p) => ADMIN_PERMISSIONS.includes(p)))];
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

// Token de admin cadastrado (com userId) cujo cadastro foi desativado ou excluído.
// O token continua válido por até 8h, então os middlewares de admin consultam isto.
export async function isRevokedAdminToken(tokenUser) {
  if (tokenUser?.role !== "admin" || !tokenUser.userId) return false;
  const user = await db("users").where({ id: tokenUser.userId, role: "admin" }).first();
  return !user || !user.active;
}

// Admin principal (sem userId no token) ou admin cadastrado ativo com a permissão "admins"
async function requireManageAdmins(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Acesso negado." });
  }
  if (!req.user.userId) return next();
  try {
    const me = await db("users").where({ id: req.user.userId, role: "admin" }).first();
    if (!me || !me.active || !parsePermissions(me.admin_permissions).includes("admins")) {
      return res
        .status(403)
        .json({ error: "Você não tem permissão para gerenciar administradores." });
    }
    next();
  } catch (e) {
    console.error("Erro ao verificar permissão de admin:", e);
    res.status(500).json({ error: "Erro ao verificar permissão" });
  }
}

// Admin principal (sem userId no token) ou admin cadastrado ativo com a permissão
// informada. Usado pelas rotas de outros módulos (ex.: routes/adminCustomers.js).
export function requireAdminPermission(permission) {
  return async (req, res, next) => {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ error: "Acesso negado." });
    }
    if (!req.user.userId) return next();
    try {
      const me = await db("users").where({ id: req.user.userId, role: "admin" }).first();
      if (!me || !me.active) {
        return res.status(401).json({ error: "Acesso de administrador revogado." });
      }
      if (!parsePermissions(me.admin_permissions).includes(permission)) {
        return res.status(403).json({ error: "Você não tem permissão para esta aba." });
      }
      next();
    } catch (e) {
      console.error("Erro ao verificar permissão de admin:", e);
      res.status(500).json({ error: "Erro ao verificar permissão" });
    }
  };
}

// ========== CRIAÇÃO DE COLUNAS ==========
export async function initAdminUsersColumns() {
  // Mesma ressalva de initPrintFarmTables(): numa instalação nova 'users' pode
  // ainda não existir neste instante.
  if (!(await db.schema.hasTable("users"))) return;
  if (!(await db.schema.hasColumn("users", "admin_permissions"))) {
    await db.schema.table("users", (table) => {
      table.text("admin_permissions"); // JSON: lista de ADMIN_PERMISSIONS liberadas
    });
    console.log("✅ Coluna 'admin_permissions' adicionada à tabela users");
  }
}

// ========== LOGIN (público) ==========
router.post("/admin-users/login", jsonParser, async (req, res) => {
  try {
    const { cpf, password } = req.body || {};
    if (!cpf || !password) {
      return res.status(400).json({ error: "CPF e senha são obrigatórios" });
    }
    const cpfClean = String(cpf).replace(/\D/g, "");
    const user = await db("users").where({ cpf: cpfClean, role: "admin" }).first();
    if (!user || !user.active) {
      return res.status(401).json({ error: "CPF ou senha inválidos" });
    }
    const ok = await bcrypt.compare(password, user.password || "");
    if (!ok) {
      return res.status(401).json({ error: "CPF ou senha inválidos" });
    }
    if (!JWT_SECRET) {
      console.error("🚨 JWT_SECRET não está configurado!");
      return res.status(500).json({ error: "Erro de configuração no servidor." });
    }
    const token = jwt.sign(
      { role: "admin", userId: user.id, adminName: user.name },
      JWT_SECRET,
      { expiresIn: "8h" },
    );
    res.json({ success: true, token, admin: serializeAdmin(user) });
  } catch (e) {
    console.error("Erro no login do administrador:", e);
    res.status(500).json({ error: "Erro ao autenticar administrador" });
  }
});

// Permissões atuais de quem está logado — o frontend consulta ao abrir o painel,
// assim mudanças de acesso valem sem precisar sair e entrar de novo.
router.get("/admin-users/me", jsonParser, authenticateToken, async (req, res) => {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ error: "Acesso negado." });
    }
    if (!req.user.userId) {
      return res.json({ master: true, permissions: ADMIN_PERMISSIONS });
    }
    const user = await db("users").where({ id: req.user.userId, role: "admin" }).first();
    if (!user || !user.active) {
      return res.status(401).json({ error: "Acesso de administrador revogado." });
    }
    res.json({ master: false, ...serializeAdmin(user) });
  } catch (e) {
    console.error("Erro ao buscar administrador logado:", e);
    res.status(500).json({ error: "Erro ao buscar administrador" });
  }
});

// ========== CRUD ==========
router.get("/admin-users", jsonParser, authenticateToken, requireManageAdmins, async (req, res) => {
  try {
    const admins = await db("users").where({ role: "admin" }).select(ADMIN_FIELDS).orderBy("name");
    res.json(admins.map(serializeAdmin));
  } catch (e) {
    console.error("Erro ao listar administradores:", e);
    res.status(500).json({ error: "Erro ao listar administradores" });
  }
});

router.post("/admin-users", jsonParser, authenticateToken, requireManageAdmins, async (req, res) => {
  try {
    const { name, cpf, email, phone, password, permissions } = req.body || {};
    if (!name || !cpf || !email || !password) {
      return res.status(400).json({ error: "Nome, CPF, e-mail e senha são obrigatórios" });
    }
    const cpfClean = String(cpf).replace(/\D/g, "");
    if (cpfClean.length !== 11) {
      return res.status(400).json({ error: "CPF inválido. Digite 11 dígitos." });
    }
    if (String(password).length < 4) {
      return res.status(400).json({ error: "Senha deve ter pelo menos 4 caracteres" });
    }
    const existing = await db("users").where({ cpf: cpfClean }).first();
    if (existing) {
      return res.status(409).json({ error: "Já existe um usuário cadastrado com esse CPF" });
    }
    const id = `user_${Date.now()}`;
    await db("users").insert({
      id,
      name: String(name).trim(),
      cpf: cpfClean,
      email: String(email).trim(),
      phone: phone ? String(phone).trim() : null,
      password: await bcrypt.hash(String(password), 10),
      role: "admin",
      active: true,
      admin_permissions: JSON.stringify(normalizePermissionsInput(permissions) || []),
      historico: JSON.stringify([]),
      pontos: 0,
    });
    const admin = await db("users").select(ADMIN_FIELDS).where({ id }).first();
    res.status(201).json(serializeAdmin(admin));
  } catch (e) {
    console.error("Erro ao criar administrador:", e);
    res.status(500).json({ error: "Erro ao criar administrador" });
  }
});

router.put("/admin-users/:id", jsonParser, authenticateToken, requireManageAdmins, async (req, res) => {
  try {
    const { name, email, phone, active, password, permissions } = req.body || {};
    const isSelf = req.user.userId && req.user.userId === req.params.id;
    const fields = {};
    if (name !== undefined) fields.name = String(name).trim();
    if (email !== undefined) fields.email = String(email).trim();
    if (phone !== undefined) fields.phone = phone ? String(phone).trim() : null;
    if (active !== undefined) {
      if (isSelf && !active) {
        return res.status(400).json({ error: "Você não pode desativar o próprio acesso." });
      }
      fields.active = Boolean(active);
    }
    const normalized = normalizePermissionsInput(permissions);
    if (normalized) {
      if (isSelf && !normalized.includes("admins")) {
        return res
          .status(400)
          .json({ error: "Você não pode remover a própria permissão de gerenciar administradores." });
      }
      fields.admin_permissions = JSON.stringify(normalized);
    }
    if (password) {
      if (String(password).length < 4) {
        return res.status(400).json({ error: "Senha deve ter pelo menos 4 caracteres" });
      }
      fields.password = await bcrypt.hash(String(password), 10);
    }
    if (Object.keys(fields).length > 0) {
      await db("users").where({ id: req.params.id, role: "admin" }).update(fields);
    }
    const admin = await db("users")
      .select(ADMIN_FIELDS)
      .where({ id: req.params.id, role: "admin" })
      .first();
    if (!admin) return res.status(404).json({ error: "Administrador não encontrado" });
    res.json(serializeAdmin(admin));
  } catch (e) {
    console.error("Erro ao atualizar administrador:", e);
    res.status(500).json({ error: "Erro ao atualizar administrador" });
  }
});

router.delete("/admin-users/:id", jsonParser, authenticateToken, requireManageAdmins, async (req, res) => {
  try {
    if (req.user.userId && req.user.userId === req.params.id) {
      return res.status(400).json({ error: "Você não pode excluir o próprio cadastro." });
    }
    // Escopado a role 'admin': esta rota nunca apaga cliente ou operador.
    await db("users").where({ id: req.params.id, role: "admin" }).del();
    res.json({ ok: true });
  } catch (e) {
    console.error("Erro ao remover administrador:", e);
    res.status(500).json({ error: "Erro ao remover administrador" });
  }
});

export default router;
