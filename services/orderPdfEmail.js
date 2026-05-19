import PDFDocument from "pdfkit";
import nodemailer from "nodemailer";

export async function sendOrderPdfEmail({ order, email }) {
  // 1. Gerar PDF em memória
  const doc = new PDFDocument();
  let buffers = [];
  doc.on("data", buffers.push.bind(buffers));
  doc.on("end", async () => {
    const pdfData = Buffer.concat(buffers);
    // 2. Enviar email com PDF em anexo
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: `Comprovante do Pedido #${order.id}`,
      text: `Segue em anexo o comprovante do seu pedido.`,
      attachments: [
        {
          filename: `pedido-${order.id}.pdf`,
          content: pdfData,
        },
      ],
    });
  });

  // Conteúdo do PDF
  doc.fontSize(18).text("Comprovante de Pedido", { align: "center" });
  doc.moveDown();
  doc.fontSize(12).text(`Pedido: ${order.id}`);
  doc.text(`Cliente: ${order.userName || "-"}`);
  doc.text(`Email: ${email}`);
  doc.text(`Data/Hora: ${new Date(order.timestamp).toLocaleString()}`);
  doc.text(`Forma de Pagamento: ${order.paymentType || "-"}`);
  doc.text(`Status: ${order.paymentStatus || "-"}`);
  doc.moveDown();
  doc.text("Produtos:");
  (order.items || []).forEach((item) => {
    doc.text(`- ${item.name} x${item.quantity} - R$${item.price}`);
  });
  doc.moveDown();
  doc.text(`Total: R$${order.total}`);
  doc.end();
}
