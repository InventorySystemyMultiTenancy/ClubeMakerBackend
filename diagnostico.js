import axios from "axios";

const TOKEN =
  "APP_USR-90168832543631-021309-37d571dbf06e60abe540590ed4afcbb9-3160034617";
const DEVICE_ID = "PAX_Q92__Q92-1733040244";

async function diagnosticoCompleto() {
  console.log("🔍 DIAGNÓSTICO COMPLETO - Point API\n");
  console.log("📋 Configuração Atual:");
  console.log(`   Device ID: ${DEVICE_ID}`);
  console.log(`   Token: ${TOKEN.substring(0, 30)}...\n`);

  // 1. Listar todos os devices da conta
  try {
    console.log("1️⃣ Buscando devices associados à sua conta...");
    const response = await axios.get(
      "https://api.mercadopago.com/point/integration-api/devices",
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );

    console.log("✅ Devices encontrados:");
    if (response.data.devices && response.data.devices.length > 0) {
      response.data.devices.forEach((device, index) => {
        console.log(`\n   📱 Device ${index + 1}:`);
        console.log(`      ID: ${device.id}`);
        console.log(`      Operating Mode: ${device.operating_mode}`);
        console.log(`      Store ID: ${device.store_id || "N/A"}`);
        console.log(`      External ID: ${device.external_pos_id || "N/A"}`);
      });

      console.log("\n⚠️ COMPARE O ID ACIMA COM O SEU .env");
      console.log(`   Seu .env: ${DEVICE_ID}`);
    } else {
      console.log("   ⚠️ Nenhum device encontrado na conta!");
      console.log("   📝 Você precisa associar a máquina primeiro.");
    }
  } catch (error) {
    console.error(
      "❌ Erro ao listar devices:",
      error.response?.data || error.message
    );
  }

  // 2. Testar status do device específico
  try {
    console.log(`\n2️⃣ Testando device específico: ${DEVICE_ID}...`);
    const response = await axios.get(
      `https://api.mercadopago.com/point/integration-api/devices/${DEVICE_ID}`,
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );

    console.log("✅ Device válido e acessível!");
    console.log("   Detalhes:", JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error("❌ Device não encontrado ou inválido");
    console.error("   Detalhes:", error.response?.data || error.message);
    console.log("\n💡 SOLUÇÃO: Use um dos Device IDs listados acima.");
  }

  // 3. Verificar últimos pagamentos processados
  try {
    console.log("\n3️⃣ Verificando últimos pagamentos Point...");
    const response = await axios.get(
      "https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&limit=5&payment_method_id=account_money",
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );

    if (response.data.results.length > 0) {
      console.log("✅ Últimos pagamentos Point:");
      response.data.results.forEach((p, i) => {
        console.log(`\n   💳 Pagamento ${i + 1}:`);
        console.log(`      ID: ${p.id}`);
        console.log(`      Status: ${p.status}`);
        console.log(`      Valor: R$ ${p.transaction_amount}`);
        console.log(
          `      Data: ${new Date(p.date_created).toLocaleString("pt-BR")}`
        );
      });
    } else {
      console.log("   ℹ️ Nenhum pagamento Point recente.");
    }
  } catch (error) {
    console.error(
      "❌ Erro ao buscar pagamentos:",
      error.response?.data || error.message
    );
  }

  console.log("\n" + "=".repeat(60));
  console.log("📊 RESUMO DO DIAGNÓSTICO:");
  console.log("=".repeat(60));
  console.log("1. Execute este script: node diagnostico-point.js");
  console.log("2. Compare o Device ID correto com o seu .env");
  console.log("3. Atualize MP_DEVICE_ID no .env se necessário");
  console.log("4. Reinicie o servidor: npm start");
  console.log("=".repeat(60));
}

diagnosticoCompleto();
