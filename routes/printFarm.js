// Módulo de gestão da frota de impressoras 3D (admin)
// Ciclo de produção (tempo estimado x real, sucesso/falha, perda de filamento)
// + manutenção preventiva da frota (peças de desgaste, vida útil por nº de impressões)
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

// Parser próprio: este router é montado antes de app.use(express.json()) no
// server.js, então não pode depender da ordem de middlewares globais.
// Aplicado por rota (nunca via router.use() sem path) pelo mesmo motivo do
// authenticateToken logo abaixo: rodar para QUALQUER /api/* atropelaria o
// limite de payload (50mb) que outras rotas do server.js precisam, por ex.
// upload de imagem em base64.
const jsonParser = express.json({ limit: "10mb" });

// --- Autenticação (mesmo comportamento de server.js) ---
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (token == null) {
    return res
      .status(401)
      .json({ error: "Acesso negado. Token não fornecido." });
  }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(401).json({ error: "Token inválido ou expirado." });
    }
    req.user = user;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res
      .status(403)
      .json({ error: "Acesso negado. Requer permissão de administrador." });
  }
  next();
}

// Operadores só podem ver a frota/catálogo e iniciar/finalizar produções.
// Gestão de cadastros (impressoras, peças, filamentos, perfis, operadores) e relatórios são admin-only.
function requireAdminOrOperator(req, res, next) {
  if (req.user.role !== "admin" && req.user.role !== "print_operator") {
    return res.status(403).json({ error: "Acesso negado." });
  }
  next();
}

// ========== LOGIN DO OPERADOR (público — precisa vir antes do authenticateToken) ==========
router.post("/print-farm/operators/login", jsonParser, async (req, res) => {
  try {
    const { cpf, password } = req.body || {};
    if (!cpf || !password) {
      return res.status(400).json({ error: "CPF e senha são obrigatórios" });
    }
    const cpfClean = String(cpf).replace(/\D/g, "");
    if (cpfClean.length !== 11) {
      return res.status(400).json({ error: "CPF inválido. Digite 11 dígitos." });
    }
    const user = await db("users").where({ cpf: cpfClean, role: "print_operator" }).first();
    // SQLite guarda boolean como 0/1 (não true/false), então checa com !user.active
    // em vez de === false para funcionar igual em pg e sqlite3.
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
      { role: "print_operator", userId: user.id, operatorName: user.name },
      JWT_SECRET,
      { expiresIn: "8h" },
    );
    res.json({ success: true, token, operator: { id: user.id, name: user.name } });
  } catch (e) {
    console.error("Erro no login do operador:", e);
    res.status(500).json({ error: "Erro ao autenticar operador" });
  }
});

// IMPORTANTE: authenticateToken é aplicado por rota (nunca via router.use() sem path)
// porque este router é montado em app.use("/api", printFarmRoutes) logo no início do
// server.js — um router.use() sem path aqui rodaria para QUALQUER /api/*, inclusive
// rotas completamente alheias definidas mais abaixo em server.js (ex: /api/users/check-cpf),
// derrubando-as com 401 antes mesmo delas serem alcançadas.

// ========== CRIAÇÃO DE TABELAS ==========
export async function initPrintFarmTables() {
  // Operadores são usuários de verdade (tabela 'users', role 'print_operator'),
  // com cadastro completo — não um cadastro simplificado à parte. As colunas
  // abaixo já existem em produção (usadas por /api/users/register), mas nem
  // todas são criadas em initDatabase(); garante que existam antes de usá-las.
  //
  // initDatabase() (server.js) e initPrintFarmTables() (aqui) rodam em paralelo
  // via Promise.all — em produção 'users' já existe (dados reais), mas numa
  // instalação nova a tabela pode ainda não ter sido criada nesse instante.
  // Sem esse hasTable(), um ALTER TABLE aqui derrubaria o boot inteiro.
  if (await db.schema.hasTable("users")) {
    const userColumns = [
      { name: "password", type: "string" },
      { name: "cep", type: "string" },
      { name: "address", type: "string" },
      { name: "phone", type: "string" },
      { name: "role", type: "string" },
      { name: "active", type: "boolean", default: true },
    ];
    for (const col of userColumns) {
      const hasCol = await db.schema.hasColumn("users", col.name);
      if (!hasCol) {
        await db.schema.table("users", (table) => {
          if (col.type === "string") table.string(col.name);
          if (col.type === "boolean") table.boolean(col.name).defaultTo(col.default);
        });
        console.log(`✅ Coluna '${col.name}' adicionada à tabela users`);
      }
    }
  } else {
    console.warn(
      "⚠️ Tabela 'users' ainda não existe — migração de colunas para operadores será tentada na próxima subida do servidor.",
    );
  }

  if (!(await db.schema.hasTable("printers"))) {
    await db.schema.createTable("printers", (table) => {
      table.increments("id").primary();
      table.integer("number").notNullable().unique();
      table.string("nickname");
      table.string("brand");
      table.string("model");
      table.date("purchase_date");
      table.string("status").notNullable().defaultTo("idle"); // idle|running|overdue|maintenance|offline
      table.integer("total_print_count").notNullable().defaultTo(0);
      table.decimal("total_print_hours", 10, 2).notNullable().defaultTo(0);
      table.text("notes");
      table.timestamp("created_at").defaultTo(db.fn.now());
    });
    console.log("✅ Tabela 'printers' criada com sucesso");
  }

  if (!(await db.schema.hasTable("printer_parts"))) {
    await db.schema.createTable("printer_parts", (table) => {
      table.increments("id").primary();
      table
        .integer("printer_id")
        .notNullable()
        .references("id")
        .inTable("printers")
        .onDelete("CASCADE");
      table.string("part_type").notNullable();
      table.integer("lifespan_prints").notNullable();
      table.integer("installed_at_count").notNullable().defaultTo(0);
      table.date("last_replaced_at");
      table.decimal("replacement_cost", 10, 2).defaultTo(0);
      table.timestamp("created_at").defaultTo(db.fn.now());
      table.index(["printer_id"]);
    });
    console.log("✅ Tabela 'printer_parts' criada com sucesso");
  }

  if (!(await db.schema.hasTable("filaments"))) {
    await db.schema.createTable("filaments", (table) => {
      table.increments("id").primary();
      table.string("material").notNullable();
      table.string("color");
      table.string("brand");
      table.decimal("cost_per_kg", 10, 2).notNullable().defaultTo(0);
      table.decimal("stock_grams", 12, 2).defaultTo(0);
      table.timestamp("created_at").defaultTo(db.fn.now());
    });
    console.log("✅ Tabela 'filaments' criada com sucesso");
  }

  if (!(await db.schema.hasTable("print_products"))) {
    await db.schema.createTable("print_products", (table) => {
      table.increments("id").primary();
      table.string("name").notNullable();
      table.string("product_id"); // vínculo opcional com products.id (catálogo da loja)
      table.string("size_variant");
      table.integer("units_per_plate").notNullable();
      table.integer("estimated_time_minutes").notNullable();
      table
        .integer("filament_id")
        .references("id")
        .inTable("filaments")
        .onDelete("SET NULL");
      table.decimal("filament_grams_per_plate", 10, 2).notNullable().defaultTo(0);
      table.decimal("manual_unit_price", 10, 2); // usado quando não há product_id vinculado
      table.timestamp("created_at").defaultTo(db.fn.now());
    });
    console.log("✅ Tabela 'print_products' criada com sucesso");
  }

  // Um produto pode usar mais de um filamento na mesma chapa (ex: peça em duas
  // cores). filament_id/filament_grams_per_plate em print_products ficam como
  // campos legados (não usados mais na criação/edição, só não quebram bancos antigos).
  if (!(await db.schema.hasTable("print_product_filaments"))) {
    await db.schema.createTable("print_product_filaments", (table) => {
      table.increments("id").primary();
      table
        .integer("print_product_id")
        .notNullable()
        .references("id")
        .inTable("print_products")
        .onDelete("CASCADE");
      table
        .integer("filament_id")
        .notNullable()
        .references("id")
        .inTable("filaments")
        .onDelete("CASCADE");
      table.decimal("grams_per_plate", 10, 2).notNullable().defaultTo(0);
      table.index(["print_product_id"]);
    });
    console.log("✅ Tabela 'print_product_filaments' criada com sucesso");
  }

  // Migração: perfis cadastrados antes desta mudança (um filamento só, em
  // print_products.filament_id) ganham a linha correspondente na tabela nova,
  // pra não perder o vínculo quando passam a poder ter vários filamentos.
  const legacyProducts = await db("print_products")
    .whereNotNull("filament_id")
    .whereNotExists(function () {
      this.select("*")
        .from("print_product_filaments")
        .whereRaw("print_product_filaments.print_product_id = print_products.id");
    });
  for (const p of legacyProducts) {
    await db("print_product_filaments").insert({
      print_product_id: p.id,
      filament_id: p.filament_id,
      grams_per_plate: p.filament_grams_per_plate || 0,
    });
  }
  if (legacyProducts.length > 0) {
    console.log(
      `✅ ${legacyProducts.length} perfil(is) migrado(s) do esquema antigo (1 filamento) para a lista nova`,
    );
  }

  if (!(await db.schema.hasTable("print_jobs"))) {
    await db.schema.createTable("print_jobs", (table) => {
      table.increments("id").primary();
      table
        .integer("printer_id")
        .notNullable()
        .references("id")
        .inTable("printers");
      table
        .integer("print_product_id")
        .notNullable()
        .references("id")
        .inTable("print_products");
      table.integer("planned_units").notNullable();
      table.integer("filament_id");
      table.decimal("filament_grams_per_plate_snapshot", 10, 2);
      table.decimal("filament_cost_per_kg_snapshot", 10, 2);
      table.decimal("unit_sale_price_snapshot", 10, 2);
      table.timestamp("started_at").notNullable();
      table.timestamp("estimated_end_at").notNullable();
      table.timestamp("finished_at");
      table.string("status").notNullable().defaultTo("running"); // running|overdue|completed
      table.integer("success_count");
      table.integer("fail_count");
      table.decimal("loss_filament_grams", 10, 2);
      table.decimal("loss_cost", 10, 2);
      table.decimal("revenue_value", 10, 2);
      table.string("created_by_role");
      // Identificação do operador (users.id, string) que iniciou/finalizou a chapa.
      // O nome fica desnormalizado aqui para o relatório não depender de um JOIN
      // com 'users' nem quebrar se o funcionário for removido depois.
      table.string("started_by_user_id");
      table.string("started_by_operator_name");
      table.string("finished_by_user_id");
      table.string("finished_by_operator_name");
      table.timestamp("created_at").defaultTo(db.fn.now());
      table.index(["printer_id"]);
      table.index(["status"]);
    });
    console.log("✅ Tabela 'print_jobs' criada com sucesso");
  } else {
    // Migração aditiva: adiciona colunas de rastreio de operador em bancos já existentes
    const operatorColumns = [
      { name: "started_by_user_id", type: "string" },
      { name: "started_by_operator_name", type: "string" },
      { name: "finished_by_user_id", type: "string" },
      { name: "finished_by_operator_name", type: "string" },
    ];
    for (const col of operatorColumns) {
      const hasCol = await db.schema.hasColumn("print_jobs", col.name);
      if (!hasCol) {
        await db.schema.table("print_jobs", (table) => {
          table.string(col.name);
        });
        console.log(`✅ Coluna '${col.name}' adicionada à tabela print_jobs`);
      }
    }
  }

  // Snapshot de cada filamento usado num job (um job pode ter vários, espelhando
  // o perfil de produto no momento em que a produção foi iniciada). material/color
  // ficam desnormalizados para o histórico não sumir se o filamento for removido depois.
  if (!(await db.schema.hasTable("print_job_filaments"))) {
    await db.schema.createTable("print_job_filaments", (table) => {
      table.increments("id").primary();
      table
        .integer("print_job_id")
        .notNullable()
        .references("id")
        .inTable("print_jobs")
        .onDelete("CASCADE");
      table.integer("filament_id");
      table.string("filament_material");
      table.string("filament_color");
      table.decimal("grams_per_plate_snapshot", 10, 2).notNullable().defaultTo(0);
      table.decimal("cost_per_kg_snapshot", 10, 2).notNullable().defaultTo(0);
      table.decimal("loss_grams", 10, 2);
      table.decimal("loss_cost", 10, 2);
      table.index(["print_job_id"]);
    });
    console.log("✅ Tabela 'print_job_filaments' criada com sucesso");
  }
}

// ========== PRINTERS ==========
router.get("/printers", jsonParser, authenticateToken, requireAdminOrOperator, async (req, res) => {
  try {
    const printers = await db("printers").select("*").orderBy("number");
    res.json(printers);
  } catch (e) {
    console.error("Erro ao listar impressoras:", e);
    res.status(500).json({ error: "Erro ao listar impressoras" });
  }
});

router.post("/printers", jsonParser, authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { number, nickname, brand, model, purchase_date, notes } = req.body;
    if (!number) {
      return res.status(400).json({ error: "Número da impressora é obrigatório" });
    }
    const existing = await db("printers").where({ number }).first();
    if (existing) {
      return res.status(409).json({ error: `Já existe uma impressora com o número ${number}` });
    }
    const [id] = await db("printers")
      .insert({ number, nickname, brand, model, purchase_date, notes })
      .returning("id");
    const printer = await db("printers")
      .where({ id: typeof id === "object" ? id.id : id })
      .first();
    res.status(201).json(printer);
  } catch (e) {
    console.error("Erro ao criar impressora:", e);
    res.status(500).json({ error: "Erro ao criar impressora" });
  }
});

router.put("/printers/:id", jsonParser, authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { nickname, brand, model, purchase_date, notes, status } = req.body;
    const fields = {};
    if (nickname !== undefined) fields.nickname = nickname;
    if (brand !== undefined) fields.brand = brand;
    if (model !== undefined) fields.model = model;
    if (purchase_date !== undefined) fields.purchase_date = purchase_date;
    if (notes !== undefined) fields.notes = notes;
    if (status !== undefined) {
      if (!["idle", "maintenance", "offline"].includes(status)) {
        return res.status(400).json({
          error: "Status manual inválido. Use idle, maintenance ou offline (running/overdue são controlados pelo ciclo de produção).",
        });
      }
      const printer = await db("printers").where({ id: req.params.id }).first();
      if (printer && (printer.status === "running" || printer.status === "overdue")) {
        return res.status(409).json({ error: "Não é possível alterar o status manualmente enquanto há uma impressão em andamento" });
      }
      fields.status = status;
    }
    await db("printers").where({ id: req.params.id }).update(fields);
    const printer = await db("printers").where({ id: req.params.id }).first();
    if (!printer) return res.status(404).json({ error: "Impressora não encontrada" });
    res.json(printer);
  } catch (e) {
    console.error("Erro ao atualizar impressora:", e);
    res.status(500).json({ error: "Erro ao atualizar impressora" });
  }
});

router.delete("/printers/:id", jsonParser, authenticateToken, requireAdmin, async (req, res) => {
  try {
    const printer = await db("printers").where({ id: req.params.id }).first();
    if (!printer) return res.status(404).json({ error: "Impressora não encontrada" });
    if (printer.status === "running" || printer.status === "overdue") {
      return res.status(409).json({ error: "Não é possível remover uma impressora com produção em andamento" });
    }
    await db("printers").where({ id: req.params.id }).del();
    res.json({ ok: true });
  } catch (e) {
    console.error("Erro ao remover impressora:", e);
    res.status(500).json({ error: "Erro ao remover impressora" });
  }
});

// ========== PRINTER PARTS (manutenção) ==========
router.get("/printers/:id/parts", jsonParser, authenticateToken, requireAdmin, async (req, res) => {
  try {
    const parts = await db("printer_parts")
      .where({ printer_id: req.params.id })
      .orderBy("id");
    res.json(parts);
  } catch (e) {
    console.error("Erro ao listar peças:", e);
    res.status(500).json({ error: "Erro ao listar peças" });
  }
});

router.post("/printers/:id/parts", jsonParser, authenticateToken, requireAdmin, async (req, res) => {
  try {
    const printer = await db("printers").where({ id: req.params.id }).first();
    if (!printer) return res.status(404).json({ error: "Impressora não encontrada" });

    const { part_type, lifespan_prints, replacement_cost } = req.body;
    if (!part_type || !lifespan_prints) {
      return res.status(400).json({ error: "Tipo de peça e vida útil (em impressões) são obrigatórios" });
    }
    const [id] = await db("printer_parts")
      .insert({
        printer_id: req.params.id,
        part_type,
        lifespan_prints,
        installed_at_count: printer.total_print_count,
        last_replaced_at: new Date().toISOString().slice(0, 10),
        replacement_cost: replacement_cost || 0,
      })
      .returning("id");
    const part = await db("printer_parts")
      .where({ id: typeof id === "object" ? id.id : id })
      .first();
    res.status(201).json(part);
  } catch (e) {
    console.error("Erro ao cadastrar peça:", e);
    res.status(500).json({ error: "Erro ao cadastrar peça" });
  }
});

router.put("/printer-parts/:id", jsonParser, authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { part_type, lifespan_prints, replacement_cost } = req.body;
    const fields = {};
    if (part_type !== undefined) fields.part_type = part_type;
    if (lifespan_prints !== undefined) fields.lifespan_prints = lifespan_prints;
    if (replacement_cost !== undefined) fields.replacement_cost = replacement_cost;
    await db("printer_parts").where({ id: req.params.id }).update(fields);
    const part = await db("printer_parts").where({ id: req.params.id }).first();
    if (!part) return res.status(404).json({ error: "Peça não encontrada" });
    res.json(part);
  } catch (e) {
    console.error("Erro ao atualizar peça:", e);
    res.status(500).json({ error: "Erro ao atualizar peça" });
  }
});

router.post("/printer-parts/:id/replace", jsonParser, authenticateToken, requireAdmin, async (req, res) => {
  try {
    const part = await db("printer_parts").where({ id: req.params.id }).first();
    if (!part) return res.status(404).json({ error: "Peça não encontrada" });
    const printer = await db("printers").where({ id: part.printer_id }).first();
    await db("printer_parts")
      .where({ id: req.params.id })
      .update({
        installed_at_count: printer.total_print_count,
        last_replaced_at: new Date().toISOString().slice(0, 10),
      });
    const updated = await db("printer_parts").where({ id: req.params.id }).first();
    res.json(updated);
  } catch (e) {
    console.error("Erro ao registrar troca de peça:", e);
    res.status(500).json({ error: "Erro ao registrar troca de peça" });
  }
});

router.delete("/printer-parts/:id", jsonParser, authenticateToken, requireAdmin, async (req, res) => {
  try {
    await db("printer_parts").where({ id: req.params.id }).del();
    res.json({ ok: true });
  } catch (e) {
    console.error("Erro ao remover peça:", e);
    res.status(500).json({ error: "Erro ao remover peça" });
  }
});

// ========== FILAMENTS ==========
router.get("/filaments", jsonParser, authenticateToken, requireAdmin, async (req, res) => {
  try {
    const filaments = await db("filaments").select("*").orderBy("material");
    res.json(filaments);
  } catch (e) {
    console.error("Erro ao listar filamentos:", e);
    res.status(500).json({ error: "Erro ao listar filamentos" });
  }
});

router.post("/filaments", jsonParser, authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { material, color, brand, cost_per_kg, stock_grams } = req.body;
    if (!material || cost_per_kg === undefined) {
      return res.status(400).json({ error: "Material e preço por kg são obrigatórios" });
    }
    const [id] = await db("filaments")
      .insert({ material, color, brand, cost_per_kg, stock_grams: stock_grams || 0 })
      .returning("id");
    const filament = await db("filaments")
      .where({ id: typeof id === "object" ? id.id : id })
      .first();
    res.status(201).json(filament);
  } catch (e) {
    console.error("Erro ao criar filamento:", e);
    res.status(500).json({ error: "Erro ao criar filamento" });
  }
});

router.put("/filaments/:id", jsonParser, authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { material, color, brand, cost_per_kg, stock_grams } = req.body;
    const fields = {};
    if (material !== undefined) fields.material = material;
    if (color !== undefined) fields.color = color;
    if (brand !== undefined) fields.brand = brand;
    if (cost_per_kg !== undefined) fields.cost_per_kg = cost_per_kg;
    if (stock_grams !== undefined) fields.stock_grams = stock_grams;
    await db("filaments").where({ id: req.params.id }).update(fields);
    const filament = await db("filaments").where({ id: req.params.id }).first();
    if (!filament) return res.status(404).json({ error: "Filamento não encontrado" });
    res.json(filament);
  } catch (e) {
    console.error("Erro ao atualizar filamento:", e);
    res.status(500).json({ error: "Erro ao atualizar filamento" });
  }
});

router.delete("/filaments/:id", jsonParser, authenticateToken, requireAdmin, async (req, res) => {
  try {
    await db("filaments").where({ id: req.params.id }).del();
    res.json({ ok: true });
  } catch (e) {
    console.error("Erro ao remover filamento:", e);
    res.status(500).json({ error: "Erro ao remover filamento" });
  }
});

// ========== PRINT PRODUCTS (perfis de impressão) ==========
// Um perfil pode usar mais de um filamento na mesma chapa (ex: peça em duas
// cores) — validamos e gravamos como lista em print_product_filaments.
function validateFilamentsList(filaments) {
  if (!Array.isArray(filaments) || filaments.length === 0) {
    return "Informe ao menos um filamento";
  }
  for (const f of filaments) {
    if (!f || !f.filament_id || Number(f.grams_per_plate) < 0) {
      return "Cada filamento precisa de um id válido e gramas por chapa (>= 0)";
    }
  }
  return null;
}

async function attachFilamentsToProducts(products) {
  if (products.length === 0) return products;
  const ids = products.map((p) => p.id);
  const rows = await db("print_product_filaments as ppf")
    .join("filaments as f", "ppf.filament_id", "f.id")
    .whereIn("ppf.print_product_id", ids)
    .select(
      "ppf.print_product_id",
      "ppf.filament_id",
      "ppf.grams_per_plate",
      "f.material",
      "f.color",
      "f.cost_per_kg",
    );
  const byProduct = {};
  for (const row of rows) {
    (byProduct[row.print_product_id] ||= []).push({
      filament_id: row.filament_id,
      material: row.material,
      color: row.color,
      cost_per_kg: row.cost_per_kg,
      grams_per_plate: row.grams_per_plate,
    });
  }
  return products.map((p) => ({ ...p, filaments: byProduct[p.id] || [] }));
}

router.get("/print-products", jsonParser, authenticateToken, requireAdminOrOperator, async (req, res) => {
  try {
    const products = await db("print_products").select("*").orderBy("name");
    res.json(await attachFilamentsToProducts(products));
  } catch (e) {
    console.error("Erro ao listar perfis de produto:", e);
    res.status(500).json({ error: "Erro ao listar perfis de produto" });
  }
});

router.post("/print-products", jsonParser, authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      name,
      product_id,
      size_variant,
      units_per_plate,
      estimated_time_minutes,
      filaments,
      manual_unit_price,
    } = req.body;
    if (!name || !units_per_plate || !estimated_time_minutes) {
      return res.status(400).json({
        error: "Nome, quantidade por chapa e tempo estimado são obrigatórios",
      });
    }
    const filamentsError = validateFilamentsList(filaments);
    if (filamentsError) return res.status(400).json({ error: filamentsError });

    const product = await db.transaction(async (trx) => {
      const [id] = await trx("print_products")
        .insert({
          name,
          product_id: product_id || null,
          size_variant,
          units_per_plate,
          estimated_time_minutes,
          manual_unit_price: manual_unit_price || null,
        })
        .returning("id");
      const productId = typeof id === "object" ? id.id : id;
      await trx("print_product_filaments").insert(
        filaments.map((f) => ({
          print_product_id: productId,
          filament_id: f.filament_id,
          grams_per_plate: f.grams_per_plate || 0,
        })),
      );
      return trx("print_products").where({ id: productId }).first();
    });
    const [withFilaments] = await attachFilamentsToProducts([product]);
    res.status(201).json(withFilaments);
  } catch (e) {
    console.error("Erro ao criar perfil de produto:", e);
    res.status(500).json({ error: "Erro ao criar perfil de produto" });
  }
});

router.put("/print-products/:id", jsonParser, authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      name,
      product_id,
      size_variant,
      units_per_plate,
      estimated_time_minutes,
      filaments,
      manual_unit_price,
    } = req.body;

    if (filaments !== undefined) {
      const filamentsError = validateFilamentsList(filaments);
      if (filamentsError) return res.status(400).json({ error: filamentsError });
    }

    const fields = {};
    if (name !== undefined) fields.name = name;
    if (product_id !== undefined) fields.product_id = product_id || null;
    if (size_variant !== undefined) fields.size_variant = size_variant;
    if (units_per_plate !== undefined) fields.units_per_plate = units_per_plate;
    if (estimated_time_minutes !== undefined) fields.estimated_time_minutes = estimated_time_minutes;
    if (manual_unit_price !== undefined) fields.manual_unit_price = manual_unit_price || null;

    const product = await db.transaction(async (trx) => {
      if (Object.keys(fields).length > 0) {
        await trx("print_products").where({ id: req.params.id }).update(fields);
      }
      if (filaments !== undefined) {
        await trx("print_product_filaments").where({ print_product_id: req.params.id }).del();
        await trx("print_product_filaments").insert(
          filaments.map((f) => ({
            print_product_id: req.params.id,
            filament_id: f.filament_id,
            grams_per_plate: f.grams_per_plate || 0,
          })),
        );
      }
      return trx("print_products").where({ id: req.params.id }).first();
    });
    if (!product) return res.status(404).json({ error: "Perfil de produto não encontrado" });
    const [withFilaments] = await attachFilamentsToProducts([product]);
    res.json(withFilaments);
  } catch (e) {
    console.error("Erro ao atualizar perfil de produto:", e);
    res.status(500).json({ error: "Erro ao atualizar perfil de produto" });
  }
});

router.delete("/print-products/:id", jsonParser, authenticateToken, requireAdmin, async (req, res) => {
  try {
    await db("print_products").where({ id: req.params.id }).del();
    res.json({ ok: true });
  } catch (e) {
    console.error("Erro ao remover perfil de produto:", e);
    res.status(500).json({ error: "Erro ao remover perfil de produto" });
  }
});

// ========== PRINT JOBS (ciclo de produção) ==========
router.get("/print-jobs", jsonParser, authenticateToken, requireAdmin, async (req, res) => {
  try {
    let query = db("print_jobs as pj")
      .join("printers as pr", "pj.printer_id", "pr.id")
      .join("print_products as pp", "pj.print_product_id", "pp.id")
      .select(
        "pj.*",
        "pr.number as printer_number",
        "pr.nickname as printer_nickname",
        "pp.name as product_name",
      )
      .orderBy("pj.started_at", "desc");
    if (req.query.status) query = query.where("pj.status", req.query.status);
    if (req.query.printer_id) query = query.where("pj.printer_id", req.query.printer_id);
    if (req.query.operator_id) {
      query = query.where(function () {
        this.where("pj.started_by_user_id", req.query.operator_id).orWhere(
          "pj.finished_by_user_id",
          req.query.operator_id,
        );
      });
    }
    if (req.query.from) query = query.where("pj.started_at", ">=", req.query.from);
    if (req.query.to) query = query.where("pj.started_at", "<=", req.query.to);
    if (req.query.limit) query = query.limit(parseInt(req.query.limit, 10));
    const jobs = await query;
    res.json(jobs);
  } catch (e) {
    console.error("Erro ao listar jobs de produção:", e);
    res.status(500).json({ error: "Erro ao listar jobs de produção" });
  }
});

async function attachFilamentsToJobs(jobs) {
  if (jobs.length === 0) return jobs;
  const ids = jobs.map((j) => j.id);
  const rows = await db("print_job_filaments")
    .whereIn("print_job_id", ids)
    .select(
      "print_job_id",
      "filament_id",
      "filament_material",
      "filament_color",
      "grams_per_plate_snapshot",
      "cost_per_kg_snapshot",
      "loss_grams",
      "loss_cost",
    );
  const byJob = {};
  for (const row of rows) {
    (byJob[row.print_job_id] ||= []).push(row);
  }
  return jobs.map((j) => ({ ...j, filaments: byJob[j.id] || [] }));
}

// Jobs em andamento/atrasados, com os dados mínimos para o painel operar a frota
// (não expõe totais de negócio — isso fica em /print-farm/summary, admin-only).
router.get("/print-farm/active-jobs", jsonParser, authenticateToken, requireAdminOrOperator, async (req, res) => {
  try {
    const jobs = await db("print_jobs as pj")
      .join("printers as pr", "pj.printer_id", "pr.id")
      .join("print_products as pp", "pj.print_product_id", "pp.id")
      .whereIn("pj.status", ["running", "overdue"])
      .select(
        "pj.id",
        "pj.printer_id",
        "pj.print_product_id",
        "pj.planned_units",
        "pj.started_at",
        "pj.estimated_end_at",
        "pj.status",
        "pj.unit_sale_price_snapshot",
        "pj.started_by_operator_name",
        "pr.number as printer_number",
        "pr.nickname as printer_nickname",
        "pp.name as product_name",
      );
    res.json(await attachFilamentsToJobs(jobs));
  } catch (e) {
    console.error("Erro ao listar jobs ativos:", e);
    res.status(500).json({ error: "Erro ao listar jobs ativos" });
  }
});

router.post("/print-jobs/start", jsonParser, authenticateToken, requireAdminOrOperator, async (req, res) => {
  try {
    const { printer_id, print_product_id } = req.body;
    if (!printer_id || !print_product_id) {
      return res.status(400).json({ error: "Impressora e produto são obrigatórios" });
    }

    const printer = await db("printers").where({ id: printer_id }).first();
    if (!printer) return res.status(404).json({ error: "Impressora não encontrada" });
    if (printer.status !== "idle") {
      return res.status(409).json({
        error: `Impressora #${printer.number} não está disponível (status atual: ${printer.status})`,
      });
    }

    const product = await db("print_products").where({ id: print_product_id }).first();
    if (!product) return res.status(404).json({ error: "Perfil de produto não encontrado" });

    const productFilaments = await db("print_product_filaments as ppf")
      .join("filaments as f", "ppf.filament_id", "f.id")
      .where("ppf.print_product_id", product.id)
      .select("ppf.filament_id", "ppf.grams_per_plate", "f.material", "f.color", "f.cost_per_kg");
    if (productFilaments.length === 0) {
      return res.status(400).json({
        error: "Este perfil não tem filamento cadastrado. Edite o perfil antes de iniciar a produção.",
      });
    }

    let unitSalePrice = product.manual_unit_price ? Number(product.manual_unit_price) : null;
    if (product.product_id) {
      const catalogProduct = await db("products").where({ id: product.product_id }).first();
      if (catalogProduct) unitSalePrice = Number(catalogProduct.price);
    }

    const startedAt = new Date();
    const estimatedEndAt = new Date(startedAt.getTime() + product.estimated_time_minutes * 60000);

    const job = await db.transaction(async (trx) => {
      const [id] = await trx("print_jobs")
        .insert({
          printer_id,
          print_product_id,
          planned_units: product.units_per_plate,
          unit_sale_price_snapshot: unitSalePrice,
          started_at: startedAt,
          estimated_end_at: estimatedEndAt,
          status: "running",
          created_by_role: req.user.role,
          started_by_user_id: req.user.role === "print_operator" ? req.user.userId : null,
          started_by_operator_name:
            req.user.role === "print_operator" ? req.user.operatorName : "Admin",
        })
        .returning("id");
      const jobId = typeof id === "object" ? id.id : id;

      await trx("print_job_filaments").insert(
        productFilaments.map((pf) => ({
          print_job_id: jobId,
          filament_id: pf.filament_id,
          filament_material: pf.material,
          filament_color: pf.color,
          grams_per_plate_snapshot: pf.grams_per_plate,
          cost_per_kg_snapshot: pf.cost_per_kg,
        })),
      );

      await trx("printers").where({ id: printer_id }).update({ status: "running" });

      return trx("print_jobs").where({ id: jobId }).first();
    });

    const [withFilaments] = await attachFilamentsToJobs([job]);
    res.status(201).json(withFilaments);
  } catch (e) {
    console.error("Erro ao iniciar produção:", e);
    res.status(500).json({ error: "Erro ao iniciar produção" });
  }
});

router.post("/print-jobs/:id/finish", jsonParser, authenticateToken, requireAdminOrOperator, async (req, res) => {
  try {
    const { success_count, fail_count } = req.body;
    if (success_count === undefined || fail_count === undefined) {
      return res.status(400).json({ error: "Informe a quantidade de sucesso e de falha" });
    }
    const job = await db("print_jobs").where({ id: req.params.id }).first();
    if (!job) return res.status(404).json({ error: "Job de produção não encontrado" });
    if (job.status === "completed") {
      return res.status(409).json({ error: "Este job já foi finalizado" });
    }
    if (Number(success_count) + Number(fail_count) !== job.planned_units) {
      return res.status(400).json({
        error: `A soma de sucesso + falha deve ser igual a ${job.planned_units} (quantidade planejada da chapa)`,
      });
    }

    const finishedAt = new Date();
    const unitPrice = job.unit_sale_price_snapshot !== null ? Number(job.unit_sale_price_snapshot) : null;
    const revenueValue = unitPrice !== null ? Number(success_count) * unitPrice : null;
    const durationHours = (finishedAt.getTime() - new Date(job.started_at).getTime()) / 3600000;

    const jobFilaments = await db("print_job_filaments").where({ print_job_id: job.id });
    let totalLossGrams = 0;
    let totalLossCost = 0;

    await db.transaction(async (trx) => {
      for (const jf of jobFilaments) {
        const gramsPerPlate = Number(jf.grams_per_plate_snapshot || 0);
        const costPerKg = Number(jf.cost_per_kg_snapshot || 0);
        const lossGrams =
          job.planned_units > 0 ? gramsPerPlate * (Number(fail_count) / job.planned_units) : 0;
        const lossCost = (lossGrams / 1000) * costPerKg;
        totalLossGrams += lossGrams;
        totalLossCost += lossCost;

        await trx("print_job_filaments").where({ id: jf.id }).update({
          loss_grams: lossGrams,
          loss_cost: lossCost,
        });
        if (jf.filament_id && gramsPerPlate > 0) {
          await trx("filaments").where({ id: jf.filament_id }).decrement("stock_grams", gramsPerPlate);
        }
      }

      await trx("print_jobs")
        .where({ id: req.params.id })
        .update({
          finished_at: finishedAt,
          success_count,
          fail_count,
          loss_filament_grams: totalLossGrams,
          loss_cost: totalLossCost,
          revenue_value: revenueValue,
          status: "completed",
          finished_by_user_id: req.user.role === "print_operator" ? req.user.userId : null,
          finished_by_operator_name:
            req.user.role === "print_operator" ? req.user.operatorName : "Admin",
        });

      await trx("printers")
        .where({ id: job.printer_id })
        .increment("total_print_count", 1)
        .increment("total_print_hours", durationHours)
        .update({ status: "idle" });
    });

    const updated = await db("print_jobs").where({ id: req.params.id }).first();
    const [withFilaments] = await attachFilamentsToJobs([updated]);
    res.json(withFilaments);
  } catch (e) {
    console.error("Erro ao finalizar produção:", e);
    res.status(500).json({ error: "Erro ao finalizar produção" });
  }
});

// ========== MANUTENÇÃO (alertas de desgaste) ==========
router.get("/print-farm/maintenance-alerts", jsonParser, authenticateToken, requireAdmin, async (req, res) => {
  try {
    const parts = await db("printer_parts as pp")
      .join("printers as pr", "pp.printer_id", "pr.id")
      .select(
        "pp.*",
        "pr.number as printer_number",
        "pr.nickname as printer_nickname",
        "pr.total_print_count as printer_total_print_count",
      );

    const withUsage = parts.map((part) => {
      const usage = part.printer_total_print_count - part.installed_at_count;
      const ratio = part.lifespan_prints > 0 ? usage / part.lifespan_prints : 0;
      const level = ratio >= 1 ? "critical" : ratio >= 0.85 ? "warning" : "ok";
      return { ...part, usage_count: usage, usage_ratio: ratio, level };
    });

    withUsage.sort((a, b) => b.usage_ratio - a.usage_ratio);
    res.json(withUsage);
  } catch (e) {
    console.error("Erro ao calcular alertas de manutenção:", e);
    res.status(500).json({ error: "Erro ao calcular alertas de manutenção" });
  }
});

// ========== RELATÓRIOS (perda, custo, lucro) ==========
// Pode ser filtrado por uma impressora específica (?printer_id=) ou trazer a frota inteira.
router.get("/print-farm/summary", jsonParser, authenticateToken, requireAdmin, async (req, res) => {
  try {
    let query = db("print_jobs as pj")
      .join("printers as pr", "pj.printer_id", "pr.id")
      .where("pj.status", "completed");
    if (req.query.printer_id) query = query.where("pj.printer_id", req.query.printer_id);
    if (req.query.from) query = query.where("pj.finished_at", ">=", req.query.from);
    if (req.query.to) query = query.where("pj.finished_at", "<=", req.query.to);

    const jobs = await query.select("pj.*", "pr.number as printer_number", "pr.nickname as printer_nickname");

    const byPrinter = {};
    const byOperator = {};
    let totals = { jobs: 0, success: 0, fail: 0, lossCost: 0, revenue: 0, onTime: 0 };

    for (const job of jobs) {
      const printerKey = job.printer_id;
      if (!byPrinter[printerKey]) {
        byPrinter[printerKey] = {
          printer_id: job.printer_id,
          printer_number: job.printer_number,
          printer_nickname: job.printer_nickname,
          jobs: 0,
          success: 0,
          fail: 0,
          lossCost: 0,
          revenue: 0,
          onTime: 0,
        };
      }

      // Responsável pela chapa: quem finalizou (decide sucesso/falha); se não houver
      // (finalizado por admin sem conta de operador), cai para quem iniciou.
      const operatorId = job.finished_by_user_id ?? job.started_by_user_id ?? null;
      const operatorName =
        job.finished_by_operator_name || job.started_by_operator_name || "Admin";
      const operatorKey = operatorId !== null ? `op_${operatorId}` : `role_${operatorName}`;
      if (!byOperator[operatorKey]) {
        byOperator[operatorKey] = {
          operator_id: operatorId,
          operator_name: operatorName,
          jobs: 0,
          success: 0,
          fail: 0,
          lossCost: 0,
          revenue: 0,
          onTime: 0,
        };
      }

      const onTime = new Date(job.finished_at) <= new Date(job.estimated_end_at);

      for (const bucket of [byPrinter[printerKey], byOperator[operatorKey]]) {
        bucket.jobs += 1;
        bucket.success += job.success_count || 0;
        bucket.fail += job.fail_count || 0;
        bucket.lossCost += Number(job.loss_cost || 0);
        bucket.revenue += Number(job.revenue_value || 0);
        bucket.onTime += onTime ? 1 : 0;
      }

      totals.jobs += 1;
      totals.success += job.success_count || 0;
      totals.fail += job.fail_count || 0;
      totals.lossCost += Number(job.loss_cost || 0);
      totals.revenue += Number(job.revenue_value || 0);
      totals.onTime += onTime ? 1 : 0;
    }

    res.json({
      totals,
      byPrinter: Object.values(byPrinter),
      byOperator: Object.values(byOperator),
    });
  } catch (e) {
    console.error("Erro ao gerar relatório da frota:", e);
    res.status(500).json({ error: "Erro ao gerar relatório da frota" });
  }
});

// ========== OPERADORES (funcionários que ligam/desligam impressoras) ==========
// São usuários de verdade (tabela 'users', role 'print_operator'), com cadastro
// completo — não uma conta simplificada à parte. Isso é o que permite, se um dia
// fizer sentido, o mesmo funcionário também comprar como cliente com a mesma conta.
const OPERATOR_FIELDS = ["id", "name", "cpf", "email", "cep", "address", "phone", "active"];

router.get("/print-farm/operators", jsonParser, authenticateToken, requireAdmin, async (req, res) => {
  try {
    const operators = await db("users")
      .where({ role: "print_operator" })
      .select(OPERATOR_FIELDS)
      .orderBy("name");
    res.json(operators);
  } catch (e) {
    console.error("Erro ao listar operadores:", e);
    res.status(500).json({ error: "Erro ao listar operadores" });
  }
});

router.post("/print-farm/operators", jsonParser, authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, cpf, email, cep, address, phone, password } = req.body;
    if (!name || !cpf || !email || !cep || !address || !phone || !password) {
      return res.status(400).json({
        error: "Nome, CPF, e-mail, CEP, endereço, telefone e senha são obrigatórios",
      });
    }
    const cpfClean = String(cpf).replace(/\D/g, "");
    if (cpfClean.length !== 11) {
      return res.status(400).json({ error: "CPF inválido. Digite 11 dígitos." });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: "Senha deve ter pelo menos 4 caracteres" });
    }
    const existing = await db("users").where({ cpf: cpfClean }).first();
    if (existing) {
      return res.status(409).json({ error: "Já existe um usuário cadastrado com esse CPF" });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const id = `user_${Date.now()}`;
    await db("users").insert({
      id,
      name,
      cpf: cpfClean,
      email,
      cep,
      address,
      phone,
      password: passwordHash,
      role: "print_operator",
      active: true,
      historico: JSON.stringify([]),
      pontos: 0,
    });
    const operator = await db("users").select(OPERATOR_FIELDS).where({ id }).first();
    res.status(201).json(operator);
  } catch (e) {
    console.error("Erro ao criar operador:", e);
    res.status(500).json({ error: "Erro ao criar operador" });
  }
});

router.put("/print-farm/operators/:id", jsonParser, authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, email, cep, address, phone, active, password } = req.body;
    const fields = {};
    if (name !== undefined) fields.name = name;
    if (email !== undefined) fields.email = email;
    if (cep !== undefined) fields.cep = cep;
    if (address !== undefined) fields.address = address;
    if (phone !== undefined) fields.phone = phone;
    if (active !== undefined) fields.active = active;
    if (password) {
      if (password.length < 4) {
        return res.status(400).json({ error: "Senha deve ter pelo menos 4 caracteres" });
      }
      fields.password = await bcrypt.hash(password, 10);
    }
    await db("users").where({ id: req.params.id, role: "print_operator" }).update(fields);
    const operator = await db("users")
      .select(OPERATOR_FIELDS)
      .where({ id: req.params.id, role: "print_operator" })
      .first();
    if (!operator) return res.status(404).json({ error: "Operador não encontrado" });
    res.json(operator);
  } catch (e) {
    console.error("Erro ao atualizar operador:", e);
    res.status(500).json({ error: "Erro ao atualizar operador" });
  }
});

router.delete("/print-farm/operators/:id", jsonParser, authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Escopado a role 'print_operator' de propósito: essa rota nunca pode apagar
    // um cliente de verdade, mesmo que alguém passe um id errado.
    await db("users").where({ id: req.params.id, role: "print_operator" }).del();
    res.json({ ok: true });
  } catch (e) {
    console.error("Erro ao remover operador:", e);
    res.status(500).json({ error: "Erro ao remover operador" });
  }
});

export default router;
