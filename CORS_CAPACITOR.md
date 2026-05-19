# 📱 CORS para App Android (Capacitor)

## Problema

O app Android faz requisições com origem `https://localhost` (por causa do `androidScheme: "https"` no Capacitor), mas o backend só permite as URLs do frontend web.

## Solução no Backend

No arquivo do backend onde configura CORS (geralmente `server.js`, `app.js` ou `index.js`), adicione `https://localhost` às origens permitidas:

```javascript
const cors = require("cors");

app.use(
  cors({
    origin: [
      "https://pastel1.selfmachine.com.br",
      "https://admin.selfmachine.com.br",
      "https://sushiman1.selfmachine.com.br",
      "https://localhost", // ⬅️ ADICIONE ESTA LINHA (Capacitor Android)
      "capacitor://localhost", // ⬅️ ADICIONE ESTA LINHA (Capacitor iOS)
      "http://localhost:3000", // Para desenvolvimento web local
      "http://localhost:5173", // Para Vite dev server
    ],
    credentials: true,
  })
);
```

## Ou configure CORS dinâmico:

```javascript
app.use(
  cors({
    origin: function (origin, callback) {
      const allowedOrigins = [
        "https://pastel1.selfmachine.com.br",
        "https://admin.selfmachine.com.br",
        "https://sushiman1.selfmachine.com.br",
        "https://localhost",
        "capacitor://localhost",
        "http://localhost:3000",
        "http://localhost:5173",
      ];

      // Permite requisições sem origin (apps móveis nativos)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        console.warn(`CORS bloqueado para origem: ${origin}`);
        callback(null, false);
      }
    },
    credentials: true,
  })
);
```

## Passos:

1. **Edite o arquivo de configuração CORS** no backend (Render)
2. **Adicione as linhas** acima
3. **Faça deploy** (commit e push para o repositório conectado à Render)
4. **Aguarde o redeploy** da Render (~2-3 minutos)
5. **Teste novamente** o app Android

## Verificação

Após configurar, teste se o backend permite a origem do Capacitor:

```bash
curl -H "Origin: https://localhost" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS \
     https://backendkioskpro.onrender.com/api/products
```

Se funcionar, deve retornar headers com `Access-Control-Allow-Origin: https://localhost`
