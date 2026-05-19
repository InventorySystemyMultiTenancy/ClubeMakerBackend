import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";

export function generateStyledOrderPdf(order, res) {
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  doc.pipe(res);

  // Centralizar logo com espaçamento adequado
  const logoPath = path.join(process.cwd(), "public", "logo.png");
  let y = 40;
  if (fs.existsSync(logoPath)) {
    const logoWidth = 120;
    const logoHeight = 120;
    const pageWidth = doc.page.width;
    const xLogo = (pageWidth - logoWidth) / 2;
    doc.image(logoPath, xLogo, y, { width: logoWidth, height: logoHeight });
    y += logoHeight + 30; // Mais espaço após logo
  }

  // Título
  doc
    .fontSize(18)
    .font("Helvetica-Bold")
    .text(
      "ORÇAMENTO (entre em contato para cotar seu frete 11-942058445)",
      0,
      y,
      {
        align: "center",
      },
    );
  y += 40;

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
  // Exibe produtos comprados
  (order.items || []).forEach((item) => {
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
    doc
      .font("Helvetica")
      .fontSize(11)
      .text(nome, 40, y)
      .text(qtd, 200, y)
      .text(`R$ ${(valor || 0).toFixed(2)}`, 250, y)
      .text(`R$ ${(valor * qtd).toFixed(2)}`, 350, y);
    y += 16;
  });

  // Total
  y += 10;
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("TOTAL:", 250, y)
    .text(
      `R$ ${(order.total !== undefined ? order.total : order.valor_total || 0).toFixed(2)}`,
      350,
      y,
    );
  y += 32;

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
