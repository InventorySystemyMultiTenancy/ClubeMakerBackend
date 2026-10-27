import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import axios from "axios";

function getFrontendCandidates() {
  const allOrigins = (process.env.FRONTEND_URL || "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);

  // Prioriza domínios da ClubeMaker quando FRONTEND_URL possui múltiplas origens
  const prioritizedOrigins = [
    ...allOrigins.filter((url) => /club(e|s)?maker/i.test(url)),
    ...allOrigins.filter((url) => !/club(e|s)?maker/i.test(url)),
  ];

  return prioritizedOrigins.flatMap((baseUrl) => {
    const sanitized = baseUrl.replace(/\/$/, "");
    return [
      `${sanitized}/logo-clubemaker.png`,
      `${sanitized}/clubemaker-logo.png`,
      `${sanitized}/logo.png`,
      `${sanitized}/images/logo.png`,
      `${sanitized}/assets/logo.png`,
      `${sanitized}/_next/static/media/logo.png`,
    ];
  });
}

function getLocalLogoCandidates() {
  const customLogoPath = process.env.CLUBEMAKER_LOGO_PATH || process.env.PDF_LOGO_PATH;
  const basePublic = path.join(process.cwd(), "public");
  const modulePublic = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "public",
  );

  return [
    customLogoPath,
    path.join(modulePublic, "clubemaker-logo.png"),
    path.join(basePublic, "logo-clubemaker.png"),
    path.join(basePublic, "clubemaker-logo.png"),
    path.join(basePublic, "clubemaker.png"),
    path.join(basePublic, "logo.png"),
  ].filter(Boolean);
}

async function resolveLogoSource() {
  // 1) Prioridade para logos locais da ClubeMaker
  const localCandidates = getLocalLogoCandidates();
  for (const logoPath of localCandidates) {
    if (fs.existsSync(logoPath)) {
      return { type: "path", value: logoPath };
    }
  }

  // 2) Se não existir localmente, tenta buscar do frontend
  const explicitLogoUrls = [
    process.env.CLUBEMAKER_LOGO_URL,
    process.env.PDF_LOGO_URL,
  ].filter(Boolean);

  const remoteCandidates = [...explicitLogoUrls, ...getFrontendCandidates()];
  for (const logoUrl of remoteCandidates) {
    try {
      const response = await axios.get(logoUrl, {
        responseType: "arraybuffer",
        timeout: 4000,
      });

      if (response?.status >= 200 && response?.status < 300 && response.data) {
        return { type: "buffer", value: Buffer.from(response.data) };
      }
    } catch (error) {
      // Ignora falhas individuais e tenta a próxima URL
    }
  }

  return null;
}

export async function generateStyledOrderPdf(order, res) {
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  doc.pipe(res);
  // Observações precisam de ~60pt; abre página nova se o resumo da entrega encheu esta
  const ensureObservationSpace = () => {
    if (y + 60 > doc.page.height - 50) {
      doc.addPage();
      y = 40;
    }
  };

  // Centralizar logo com espaçamento adequado
  const logoSource = await resolveLogoSource();
  let y = 40;
  if (logoSource) {
    const logoWidth = 120;
    const logoHeight = 120;
    const pageWidth = doc.page.width;
    const xLogo = (pageWidth - logoWidth) / 2;
    doc.image(logoSource.value, xLogo, y, {
      width: logoWidth,
      height: logoHeight,
    });
    y += logoHeight + 30; // Mais espaço após logo
  }

  // Título
  doc
    .fontSize(18)
    .font("Helvetica-Bold")
    .text("ORÇAMENTO", 0, y, { align: "center" });
  y += 30;

  // Datas de emissão e entrega
  const formatDateTime = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };
  const isDelivered =
    order.entregueCliente == 1 || order.deliveryStatus === "delivered";
  const emissao = formatDateTime(order.timestamp) || "-";
  const entrega = isDelivered
    ? formatDateTime(order.deliveredAt) || "Entregue (data não registrada)"
    : "Não entregue ainda";

  doc
    .fontSize(11)
    .font("Helvetica")
    .text(`Data de emissão: ${emissao}`, 0, y, { align: "center" });
  y += 16;
  doc.text(`Data de entrega: ${entrega}`, 0, y, { align: "center" });
  y += 30;

  // Dados do cliente
  const nomeCliente =
    order.userName ||
    order.name ||
    order.cliente ||
    order.customerName ||
    order.customer ||
    "-";
  const emailCliente =
    order.email ||
    order.customerEmail ||
    order.userEmail ||
    order.contactEmail ||
    "-";
  const telefoneCliente =
    order.phone ||
    order.telefone ||
    order.customerPhone ||
    order.userPhone ||
    order.contactPhone ||
    "-";
  const enderecoCliente =
    order.address ||
    order.endereco ||
    order.customerAddress ||
    order.userAddress ||
    order.contactAddress ||
    "-";
  const cepCliente =
    order.cep ||
    order.zip ||
    order.customerCep ||
    order.userCep ||
    order.contactCep ||
    "-";
  // Blocos lado a lado com altura dinâmica (evita sobreposição)
  const leftX = 40;
  const rightX = 340;
  const blocoY = y;
  const leftWidth = rightX - leftX - 20;
  const rightWidth = doc.page.width - rightX - 40;

  // --- CPF/CNPJ ---
  let docLabel = "CPF";
  let docValue = "-";
  if (order.cpf && typeof order.cpf === "string") {
    const cleanDoc = order.cpf.replace(/\D/g, "");
    if (cleanDoc.length === 14) docLabel = "CNPJ";
    docValue = order.cpf;
  }

  doc.fontSize(12).font("Helvetica-Bold");
  doc.text("DADOS DO CLIENTE", leftX, blocoY, {
    width: leftWidth,
  });

  let leftCurrentY =
    blocoY + doc.heightOfString("DADOS DO CLIENTE", { width: leftWidth }) + 6;
  const customerLines = [
    `Nome: ${nomeCliente}`,
    `Telefone: ${telefoneCliente}`,
    `E-mail: ${emailCliente}`,
    `Endereço: ${enderecoCliente}`,
    `CEP: ${cepCliente}`,
    `${docLabel}: ${docValue}`,
  ];

  customerLines.forEach((line) => {
    doc.font("Helvetica").fontSize(11);
    doc.text(line, leftX, leftCurrentY, {
      width: leftWidth,
    });
    leftCurrentY += doc.heightOfString(line, { width: leftWidth }) + 4;
  });

  doc.fontSize(12).font("Helvetica-Bold");
  doc.text("FORMA DE PAGAMENTO", rightX, blocoY, { width: rightWidth });

  let rightCurrentY =
    blocoY +
    doc.heightOfString("FORMA DE PAGAMENTO", { width: rightWidth }) +
    6;
  const paymentMain =
    order.paymentType ||
    order.payment_method ||
    order.payment_method_id ||
    order.paymentStatus ||
    "-";

  doc.font("Helvetica").fontSize(11);
  doc.text(paymentMain, rightX, rightCurrentY, {
    width: rightWidth,
  });
  rightCurrentY += doc.heightOfString(paymentMain, { width: rightWidth }) + 4;

  // Detalhes extra para pagamento presencial
  if (paymentMain === "presencial") {
    const tipoPagamento =
      order.paymentMethod ||
      order.payment_method ||
      order.payment_method_id ||
      "-";
    const vezes =
      order.installments ||
      order.parcelas ||
      order.qtdParcelas ||
      order.paymentInstallments ||
      1;

    let tipoDesc = "";
    if (typeof tipoPagamento === "string") {
      if (tipoPagamento.toLowerCase().includes("pix")) tipoDesc = "PIX";
      else if (tipoPagamento.toLowerCase().includes("debito"))
        tipoDesc = "Cartão Débito";
      else if (tipoPagamento.toLowerCase().includes("credito"))
        tipoDesc = "Cartão Crédito";
      else tipoDesc = tipoPagamento;
    }

    const tipoText = `Tipo: ${tipoDesc}`;
    doc.fontSize(11).font("Helvetica").text(tipoText, rightX, rightCurrentY, {
      width: rightWidth,
    });
    rightCurrentY += doc.heightOfString(tipoText, { width: rightWidth }) + 4;

    if (vezes > 1) {
      const parceladoText = `Parcelado: ${vezes}x`;
      doc
        .fontSize(11)
        .font("Helvetica")
        .text(parceladoText, rightX, rightCurrentY, {
          width: rightWidth,
        });
      rightCurrentY +=
        doc.heightOfString(parceladoText, { width: rightWidth }) + 4;
    }
  }

  y = Math.max(leftCurrentY, rightCurrentY) + 16;

  // Tabela de produtos
  doc.font("Helvetica-Bold").fontSize(14).text("PRODUTOS", 40, y);
  y += 24;
  doc
    .fontSize(11)
    .font("Helvetica-Bold")
    .text("Produto", 40, y)
    .text("Qtd", 200, y)
    .text("Valor Unit.", 250, y)
    .text("Subtotal", 350, y);
  y += 18;
  // Exibe produtos comprados. Pedido finalizado na entrega cobra só o que foi
  // entregue: item que não teve nenhuma unidade entregue fica fora da lista.
  (order.items || [])
    .filter((item) => item.quantity === undefined || item.quantity === null || Number(item.quantity) > 0)
    .forEach((item) => {
    const nome =
      item.name ||
      item.produto ||
      item.title ||
      item.product ||
      item.descricao ||
      item.description ||
      "-";
    const qtd = item.quantity || item.qtd || item.amount || 1;
    const valor =
      item.price !== undefined
        ? item.price
        : item.valor_unit || item.unit_price || 0;
    const originalUnitPrice =
      item.originalUnitPrice !== undefined && item.originalUnitPrice !== null
        ? Number(item.originalUnitPrice)
        : null;
    const customUnitPrice =
      item.customUnitPrice !== undefined && item.customUnitPrice !== null
        ? Number(item.customUnitPrice)
        : null;
    const discountPercent =
      item.discountPercent !== undefined && item.discountPercent !== null
        ? Number(item.discountPercent)
        : 0;
    doc
      .font("Helvetica")
      .fontSize(11)
      .text(nome, 40, y)
      .text(qtd, 200, y)
      .text(`R$ ${(valor || 0).toFixed(2)}`, 250, y)
      .text(`R$ ${(valor * qtd).toFixed(2)}`, 350, y);
    y += 16;
    if (
      (originalUnitPrice && originalUnitPrice > Number(valor || 0)) ||
      (customUnitPrice && customUnitPrice !== Number(valor || 0)) ||
      discountPercent > 0
    ) {
      const details = [
        customUnitPrice && customUnitPrice !== Number(valor || 0)
          ? `Valor admin: R$ ${customUnitPrice.toFixed(2)}`
          : null,
        discountPercent > 0
          ? `Desconto: ${discountPercent.toFixed(2)}%`
          : null,
        originalUnitPrice && originalUnitPrice > Number(valor || 0)
          ? `Original: R$ ${originalUnitPrice.toFixed(2)}`
          : null,
      ]
        .filter(Boolean)
        .join(" | ");
      doc.font("Helvetica").fontSize(9).fillColor("#666").text(details, 40, y);
      doc.fillColor("#000");
      y += 12;
    }
  });

  // Total
  y += 10;
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("TOTAL:", 250, y)
    .text(
      `R$ ${Number(order.total !== undefined ? order.total : order.valor_total || 0).toFixed(2)}`,
      350,
      y,
    );
  y += 20;

  // Acréscimo por unidades entregues a mais (já incluído no total)
  const extraTotal = Number(order.extraTotal) || 0;
  const extraChargeDue = Number(order.extraChargeDue) || 0;
  if (extraTotal > 0) {
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#1d4ed8")
      .text(`Inclui acréscimo de R$ ${extraTotal.toFixed(2)} por itens entregues a mais`, 250, y);
    y += 14;
    if (extraChargeDue > 0) {
      doc
        .font("Helvetica-Bold")
        .text(`Acréscimo a pagar: R$ ${extraChargeDue.toFixed(2)}`, 250, y);
      y += 14;
    }
    doc.fillColor("#000");
  }
  y += 12;

  // Resumo da entrega: o que foi entregue, a mais, o que faltou e perdas, por item
  const summary = order.deliverySummary;
  if (Array.isArray(summary) && summary.length > 0) {
    const ensureSpace = (needed) => {
      if (y + needed > doc.page.height - 50) {
        doc.addPage();
        y = 40;
      }
    };
    const totalPending = summary.reduce((sum, row) => sum + row.pending, 0);
    const totalLost = summary.reduce((sum, row) => sum + row.lost, 0);
    const totalExtra = summary.reduce((sum, row) => sum + row.extra, 0);

    ensureSpace(80);
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#000").text("RESUMO DA ENTREGA", 40, y);
    y += 20;
    const statusText = isDelivered
      ? "Pedido finalizado na entrega — valores apenas dos itens entregues"
      : `Entrega parcial — faltam ${totalPending} unidade(s)`;
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor(isDelivered ? "#15803d" : "#b45309")
      .text(statusText, 40, y);
    doc.fillColor("#000");
    y += 18;

    const cols = [
      { label: "Produto", x: 40, width: 190 },
      { label: "Pedido", x: 235, width: 55 },
      { label: "Entregue", x: 290, width: 60 },
      { label: "A mais", x: 355, width: 55 },
      { label: isDelivered ? "Não entr." : "Faltou", x: 415, width: 55 },
      { label: "Perda", x: 475, width: 55 },
    ];
    doc.font("Helvetica-Bold").fontSize(10);
    cols.forEach((col) => doc.text(col.label, col.x, y, { width: col.width }));
    y += 16;

    summary.forEach((row) => {
      doc.font("Helvetica").fontSize(10);
      const nameHeight = doc.heightOfString(row.name, { width: cols[0].width });
      ensureSpace(nameHeight + 6);
      const values = [
        { text: row.name, color: "#000" },
        { text: String(row.ordered), color: "#000" },
        { text: String(row.delivered), color: "#000" },
        { text: row.extra > 0 ? `+${row.extra}` : "-", color: row.extra > 0 ? "#1d4ed8" : "#999" },
        { text: row.pending > 0 ? String(row.pending) : "-", color: row.pending > 0 ? "#b45309" : "#999" },
        { text: row.lost > 0 ? String(row.lost) : "-", color: row.lost > 0 ? "#b91c1c" : "#999" },
      ];
      values.forEach((value, i) =>
        doc.fillColor(value.color).text(value.text, cols[i].x, y, { width: cols[i].width }),
      );
      doc.fillColor("#000");
      y += Math.max(nameHeight, 12) + 6;
    });

    const totalsLine = [
      totalExtra > 0 ? `${totalExtra} un. a mais` : null,
      totalPending > 0
        ? `${totalPending} un. ${isDelivered ? "não entregue(s)" : "faltando"}`
        : null,
      totalLost > 0 ? `${totalLost} un. de perda` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    if (totalsLine) {
      ensureSpace(20);
      doc.font("Helvetica").fontSize(9).fillColor("#666").text(`Total: ${totalsLine}`, 40, y);
      doc.fillColor("#000");
      y += 16;
    }
    y += 12;
  }

  // Observações da entrega (e motivo da perda) registradas por quem entregou
  const deliveryNotes = Array.isArray(order.deliveryNotes) ? order.deliveryNotes : [];
  if (deliveryNotes.length > 0) {
    ensureObservationSpace();
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#000").text("OBSERVAÇÕES DA ENTREGA", 40, y);
    y += 18;
    deliveryNotes.forEach((entry) => {
      const date = entry.createdAt ? new Date(entry.createdAt) : null;
      const header = [
        date && !Number.isNaN(date.getTime())
          ? date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
          : null,
        entry.createdByName,
      ]
        .filter(Boolean)
        .join(" · ");
      const lines = [
        entry.lossReason ? `Motivo da perda: ${entry.lossReason}` : null,
        entry.note ? `Observação: ${entry.note}` : null,
      ].filter(Boolean);
      doc.font("Helvetica").fontSize(10);
      const body = lines.join("\n");
      const needed = (header ? 14 : 0) + doc.heightOfString(body, { width: 500 }) + 8;
      if (y + needed > doc.page.height - 50) {
        doc.addPage();
        y = 40;
      }
      if (header) {
        doc.fontSize(9).fillColor("#666").text(header, 40, y, { width: 500 });
        y += 14;
      }
      doc.fontSize(10).fillColor("#000").text(body, 40, y, { width: 500 });
      y += doc.heightOfString(body, { width: 500 }) + 8;
    });
    y += 8;
  }

  ensureObservationSpace();

  // Observações
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .text("OBSERVAÇÕES", 40, y)
    .font("Helvetica")
    .fontSize(11)
    .text(
      order.observation || order.observacoes || order.observacao || "-",
      40,
      y + 18,
      { width: 500 },
    );
  y += 44;

  doc.end();
}
