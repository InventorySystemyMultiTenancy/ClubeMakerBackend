/**
 * Script de teste para verificar a configuração da loja
 */

import knex from "knex";
import dotenv from "dotenv";

dotenv.config();

const db = knex({
  client: "pg",
  connection: {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  },
});

async function testStore() {
  try {
    console.log("🔍 Testando configuração da loja sushiman1...\n");

    // Buscar a loja
    // Loja única: não busca mais na tabela stores

    if (!store) {
      console.error("❌ Loja 'sushiman1' não encontrada no banco!");
      return;
    }

    console.log("✅ Loja encontrada:");
    console.log(`   ID: ${store.id}`);
    console.log(`   Nome: ${store.name}`);
    console.log(
      `   Token: ${
        store.mp_access_token
          ? store.mp_access_token.substring(0, 30) + "..."
          : "❌ NÃO CONFIGURADO"
      }`,
    );
    console.log(`   Device: ${store.mp_device_id || "❌ NÃO CONFIGURADO"}`);

    // Validar token
    if (!store.mp_access_token) {
      console.error("\n❌ Token do Mercado Pago não configurado!");
      return;
    }

    console.log("\n✅ Token configurado corretamente");

    // Testar token com API do Mercado Pago
    console.log("\n🔄 Testando token na API do Mercado Pago...");

    const response = await fetch(
      "https://api.mercadopago.com/v1/payments/search?limit=1",
      {
        headers: {
          Authorization: `Bearer ${store.mp_access_token}`,
        },
      },
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("\n❌ Token inválido ou expirado!");
      console.error("Resposta da API:", errorData);
      return;
    }

    console.log("✅ Token válido e funcionando!");

    // Teste de criação de pagamento PIX (simulado)
    console.log("\n🔄 Simulando criação de pagamento PIX...");

    const pixPayload = {
      transaction_amount: 10.0,
      description: "Teste Sushi Man",
      payment_method_id: "pix",
      payer: {
        email: "teste@sushiman.com",
        first_name: "Cliente Teste",
      },
      external_reference: "TEST001",
    };

    const pixResponse = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${store.mp_access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pixPayload),
    });

    const pixData = await pixResponse.json();

    if (!pixResponse.ok) {
      console.error("\n❌ Erro ao criar pagamento PIX:");
      console.error(pixData);

      if (pixData.message?.includes("invalid")) {
        console.error("\n⚠️  Token inválido ou expirado!");
        console.error(
          "Obtenha um novo token em: https://www.mercadopago.com.br/developers/panel",
        );
      }
      return;
    }

    console.log("\n✅ Pagamento PIX criado com sucesso!");
    console.log(`   Payment ID: ${pixData.id}`);
    console.log(`   Status: ${pixData.status}`);
    console.log(
      `   QR Code: ${
        pixData.point_of_interaction?.transaction_data?.qr_code
          ? "✅ Gerado"
          : "❌ Não gerado"
      }`,
    );

    console.log("\n" + "=".repeat(60));
    console.log("✅ TUDO FUNCIONANDO CORRETAMENTE!");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("\n❌ Erro durante o teste:", error.message);
    console.error(error);
  } finally {
    await db.destroy();
  }
}

testStore();
