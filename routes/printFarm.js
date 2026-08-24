// Módulo de gestão da frota de impressoras 3D (admin)
// Ciclo de produção (tempo estimado x real, sucesso/falha, perda de filamento)
// + manutenção preventiva da frota (peças de desgaste, vida útil por nº de impressões)
import express from "express";
import knex from "knex";
import jwt from "jsonwebtoken";
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
router.use(express.json({ limit: "10mb" }));

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

function authorizeAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res
      .status(403)
      .json({ error: "Acesso negado. Requer permissão de administrador." });
  }
  next();
}

router.use("/printers", authenticateToken, authorizeAdmin);
router.use("/printer-parts", authenticateToken, authorizeAdmin);
router.use("/filaments", authenticateToken, authorizeAdmin);
router.use("/print-products", authenticateToken, authorizeAdmin);
router.use("/print-jobs", authenticateToken, authorizeAdmin);
router.use("/print-farm", authenticateToken, authorizeAdmin);

// ========== CRIAÇÃO DE TABELAS ==========
export async function initPrintFarmTables() {
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
      table.timestamp("created_at").defaultTo(db.fn.now());
      table.index(["printer_id"]);
      table.index(["status"]);
    });
    console.log("✅ Tabela 'print_jobs' criada com sucesso");
  }
}

// ========== PRINTERS ==========
router.get("/printers", async (req, res) => {
  try {
    const printers = await db("printers").select("*").orderBy("number");
    res.json(printers);
  } catch (e) {
    console.error("Erro ao listar impressoras:", e);
    res.status(500).json({ error: "Erro ao listar impressoras" });
  }
});

router.post("/printers", async (req, res) => {
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

router.put("/printers/:id", async (req, res) => {
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

router.delete("/printers/:id", async (req, res) => {
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
router.get("/printers/:id/parts", async (req, res) => {
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

router.post("/printers/:id/parts", async (req, res) => {
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

router.put("/printer-parts/:id", async (req, res) => {
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

router.post("/printer-parts/:id/replace", async (req, res) => {
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

router.delete("/printer-parts/:id", async (req, res) => {
  try {
    await db("printer_parts").where({ id: req.params.id }).del();
    res.json({ ok: true });
  } catch (e) {
    console.error("Erro ao remover peça:", e);
    res.status(500).json({ error: "Erro ao remover peça" });
  }
});

// ========== FILAMENTS ==========
router.get("/filaments", async (req, res) => {
  try {
    const filaments = await db("filaments").select("*").orderBy("material");
    res.json(filaments);
  } catch (e) {
    console.error("Erro ao listar filamentos:", e);
    res.status(500).json({ error: "Erro ao listar filamentos" });
  }
});

router.post("/filaments", async (req, res) => {
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

router.put("/filaments/:id", async (req, res) => {
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

router.delete("/filaments/:id", async (req, res) => {
  try {
    await db("filaments").where({ id: req.params.id }).del();
    res.json({ ok: true });
  } catch (e) {
    console.error("Erro ao remover filamento:", e);
    res.status(500).json({ error: "Erro ao remover filamento" });
  }
});

// ========== PRINT PRODUCTS (perfis de impressão) ==========
router.get("/print-products", async (req, res) => {
  try {
    const products = await db("print_products as pp")
      .leftJoin("filaments as f", "pp.filament_id", "f.id")
      .select(
        "pp.*",
        "f.material as filament_material",
        "f.color as filament_color",
        "f.cost_per_kg as filament_cost_per_kg",
      )
      .orderBy("pp.name");
    res.json(products);
  } catch (e) {
    console.error("Erro ao listar perfis de produto:", e);
    res.status(500).json({ error: "Erro ao listar perfis de produto" });
  }
});

router.post("/print-products", async (req, res) => {
  try {
    const {
      name,
      product_id,
      size_variant,
      units_per_plate,
      estimated_time_minutes,
      filament_id,
      filament_grams_per_plate,
      manual_unit_price,
    } = req.body;
    if (!name || !units_per_plate || !estimated_time_minutes) {
      return res.status(400).json({
        error: "Nome, quantidade por chapa e tempo estimado são obrigatórios",
      });
    }
    const [id] = await db("print_products")
      .insert({
        name,
        product_id: product_id || null,
        size_variant,
        units_per_plate,
        estimated_time_minutes,
        filament_id: filament_id || null,
        filament_grams_per_plate: filament_grams_per_plate || 0,
        manual_unit_price: manual_unit_price || null,
      })
      .returning("id");
    const product = await db("print_products")
      .where({ id: typeof id === "object" ? id.id : id })
      .first();
    res.status(201).json(product);
  } catch (e) {
    console.error("Erro ao criar perfil de produto:", e);
    res.status(500).json({ error: "Erro ao criar perfil de produto" });
  }
});

router.put("/print-products/:id", async (req, res) => {
  try {
    const {
      name,
      product_id,
      size_variant,
      units_per_plate,
      estimated_time_minutes,
      filament_id,
      filament_grams_per_plate,
      manual_unit_price,
    } = req.body;
    const fields = {};
    if (name !== undefined) fields.name = name;
    if (product_id !== undefined) fields.product_id = product_id || null;
    if (size_variant !== undefined) fields.size_variant = size_variant;
    if (units_per_plate !== undefined) fields.units_per_plate = units_per_plate;
    if (estimated_time_minutes !== undefined) fields.estimated_time_minutes = estimated_time_minutes;
    if (filament_id !== undefined) fields.filament_id = filament_id || null;
    if (filament_grams_per_plate !== undefined) fields.filament_grams_per_plate = filament_grams_per_plate;
    if (manual_unit_price !== undefined) fields.manual_unit_price = manual_unit_price || null;
    await db("print_products").where({ id: req.params.id }).update(fields);
    const product = await db("print_products").where({ id: req.params.id }).first();
    if (!product) return res.status(404).json({ error: "Perfil de produto não encontrado" });
    res.json(product);
  } catch (e) {
    console.error("Erro ao atualizar perfil de produto:", e);
    res.status(500).json({ error: "Erro ao atualizar perfil de produto" });
  }
});

router.delete("/print-products/:id", async (req, res) => {
  try {
    await db("print_products").where({ id: req.params.id }).del();
    res.json({ ok: true });
  } catch (e) {
    console.error("Erro ao remover perfil de produto:", e);
    res.status(500).json({ error: "Erro ao remover perfil de produto" });
  }
});

// ========== PRINT JOBS (ciclo de produção) ==========
router.get("/print-jobs", async (req, res) => {
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

router.post("/print-jobs/start", async (req, res) => {
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

    let filament = null;
    if (product.filament_id) {
      filament = await db("filaments").where({ id: product.filament_id }).first();
    }

    let unitSalePrice = product.manual_unit_price ? Number(product.manual_unit_price) : null;
    if (product.product_id) {
      const catalogProduct = await db("products").where({ id: product.product_id }).first();
      if (catalogProduct) unitSalePrice = Number(catalogProduct.price);
    }

    const startedAt = new Date();
    const estimatedEndAt = new Date(startedAt.getTime() + product.estimated_time_minutes * 60000);

    const [id] = await db("print_jobs")
      .insert({
        printer_id,
        print_product_id,
        planned_units: product.units_per_plate,
        filament_id: product.filament_id || null,
        filament_grams_per_plate_snapshot: product.filament_grams_per_plate,
        filament_cost_per_kg_snapshot: filament ? filament.cost_per_kg : null,
        unit_sale_price_snapshot: unitSalePrice,
        started_at: startedAt,
        estimated_end_at: estimatedEndAt,
        status: "running",
        created_by_role: req.user.role,
      })
      .returning("id");

    await db("printers").where({ id: printer_id }).update({ status: "running" });

    const job = await db("print_jobs")
      .where({ id: typeof id === "object" ? id.id : id })
      .first();
    res.status(201).json(job);
  } catch (e) {
    console.error("Erro ao iniciar produção:", e);
    res.status(500).json({ error: "Erro ao iniciar produção" });
  }
});

router.post("/print-jobs/:id/finish", async (req, res) => {
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
    const gramsPerPlate = Number(job.filament_grams_per_plate_snapshot || 0);
    const costPerKg = Number(job.filament_cost_per_kg_snapshot || 0);
    const unitPrice = job.unit_sale_price_snapshot !== null ? Number(job.unit_sale_price_snapshot) : null;

    const lossGrams = job.planned_units > 0
      ? gramsPerPlate * (Number(fail_count) / job.planned_units)
      : 0;
    const lossCost = (lossGrams / 1000) * costPerKg;
    const revenueValue = unitPrice !== null ? Number(success_count) * unitPrice : null;
    const durationHours = (finishedAt.getTime() - new Date(job.started_at).getTime()) / 3600000;

    await db("print_jobs")
      .where({ id: req.params.id })
      .update({
        finished_at: finishedAt,
        success_count,
        fail_count,
        loss_filament_grams: lossGrams,
        loss_cost: lossCost,
        revenue_value: revenueValue,
        status: "completed",
      });

    await db("printers")
      .where({ id: job.printer_id })
      .increment("total_print_count", 1)
      .increment("total_print_hours", durationHours)
      .update({ status: "idle" });

    if (job.filament_id && gramsPerPlate > 0) {
      await db("filaments")
        .where({ id: job.filament_id })
        .decrement("stock_grams", gramsPerPlate);
    }

    const updated = await db("print_jobs").where({ id: req.params.id }).first();
    res.json(updated);
  } catch (e) {
    console.error("Erro ao finalizar produção:", e);
    res.status(500).json({ error: "Erro ao finalizar produção" });
  }
});

// ========== MANUTENÇÃO (alertas de desgaste) ==========
router.get("/print-farm/maintenance-alerts", async (req, res) => {
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
router.get("/print-farm/summary", async (req, res) => {
  try {
    let query = db("print_jobs as pj")
      .join("printers as pr", "pj.printer_id", "pr.id")
      .where("pj.status", "completed");
    if (req.query.from) query = query.where("pj.finished_at", ">=", req.query.from);
    if (req.query.to) query = query.where("pj.finished_at", "<=", req.query.to);

    const jobs = await query.select("pj.*", "pr.number as printer_number", "pr.nickname as printer_nickname");

    const byPrinter = {};
    let totals = { jobs: 0, success: 0, fail: 0, lossCost: 0, revenue: 0, onTime: 0 };

    for (const job of jobs) {
      const key = job.printer_id;
      if (!byPrinter[key]) {
        byPrinter[key] = {
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
      const onTime = new Date(job.finished_at) <= new Date(job.estimated_end_at);
      byPrinter[key].jobs += 1;
      byPrinter[key].success += job.success_count || 0;
      byPrinter[key].fail += job.fail_count || 0;
      byPrinter[key].lossCost += Number(job.loss_cost || 0);
      byPrinter[key].revenue += Number(job.revenue_value || 0);
      byPrinter[key].onTime += onTime ? 1 : 0;

      totals.jobs += 1;
      totals.success += job.success_count || 0;
      totals.fail += job.fail_count || 0;
      totals.lossCost += Number(job.loss_cost || 0);
      totals.revenue += Number(job.revenue_value || 0);
      totals.onTime += onTime ? 1 : 0;
    }

    res.json({ totals, byPrinter: Object.values(byPrinter) });
  } catch (e) {
    console.error("Erro ao gerar relatório da frota:", e);
    res.status(500).json({ error: "Erro ao gerar relatório da frota" });
  }
});

export default router;
