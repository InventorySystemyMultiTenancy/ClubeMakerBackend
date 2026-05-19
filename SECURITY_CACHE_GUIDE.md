# 🔐 Guia de Segurança e Cache - Backend Kiosk

## ✅ Implementações Concluídas

### 1. Autenticação JWT (✅ Implementado)

#### Recursos Implementados:

- **Endpoint de Login**: `/api/auth/login` com validação de roles
- **Middlewares de Autenticação**:
  - `authenticateToken`: Valida tokens JWT em todas as rotas protegidas
  - `authorizeAdmin`: Apenas administradores
  - `authorizeKitchen`: Cozinha ou administradores
- **Tokens JWT**: Expiração de 8 horas, assinados com JWT_SECRET
- **Roles Suportados**: `admin` e `kitchen`

#### Rotas Protegidas:

##### Admin (Requer `ADMIN_PASSWORD`):

- `POST /api/products` - Criar produto
- `PUT /api/products/:id` - Atualizar produto
- `DELETE /api/products/:id` - Deletar produto
- `GET /api/users` - Listar usuários
- `GET /api/ai/inventory-analysis` - Análise de estoque com IA

##### Cozinha (Requer `KITCHEN_PASSWORD`):

- `GET /api/orders` - Listar pedidos ativos
- `DELETE /api/orders/:id` - Finalizar pedido

#### Como Usar:

```javascript
// 1. Fazer login
const response = await fetch("http://localhost:3001/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    role: "admin", // ou 'kitchen'
    password: "sua_senha_aqui",
  }),
});

const { token } = await response.json();

// 2. Usar o token nas requisições
const produtos = await fetch("http://localhost:3001/api/products", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    name: "Novo Produto",
    price: 10.5,
    category: "Pastel",
  }),
});
```

---

### 2. Cache Redis com Fallback (✅ Implementado)

#### Recursos Implementados:

- **Cliente Redis**: Configurável via `REDIS_URL`
- **Fallback Inteligente**: Usa Map em memória quando Redis não disponível
- **Funções Unificadas**:
  - `cachePayment(key, value)`: Salva pagamento (TTL 1 hora)
  - `getCachedPayment(key)`: Recupera pagamento
  - `deleteCachedPayment(key)`: Remove pagamento
- **Integração Mercado Pago**: IPN e Webhook usam cache

#### Vantagens do Redis:

✅ **Persistência**: Cache sobrevive a reinicializações do servidor  
✅ **Distribuído**: Múltiplas instâncias compartilham o mesmo cache  
✅ **Performance**: Mais rápido que banco de dados  
✅ **TTL Automático**: Expira automaticamente após 1 hora

#### Como Configurar:

**Opção 1: Redis Local (Desenvolvimento)**

```bash
# Windows (WSL ou Docker)
docker run -d -p 6379:6379 redis:alpine

# Adicionar ao .env
REDIS_URL=redis://localhost:6379
```

**Opção 2: Redis Cloud (Produção)**

```bash
# Render Redis (gratuito até 25MB)
# 1. Criar Redis no Render.com
# 2. Copiar o "External Redis URL"
# 3. Adicionar ao .env

REDIS_URL=redis://red-xxxxx:6379
# ou com SSL
REDIS_URL=rediss://red-xxxxx:6379
```

**Opção 3: Sem Redis (Fallback)**

```bash
# Simplesmente não configure REDIS_URL
# O sistema usará Map em memória automaticamente
```

---

## 📝 Configuração de Variáveis de Ambiente

### Arquivo `.env` Completo:

```env
# ===== SERVIDOR =====
PORT=3001
NODE_ENV=production

# ===== FRONTEND =====
# Múltiplas URLs separadas por vírgula
FRONTEND_URL=https://seu-frontend.vercel.app,https://seu-frontend-staging.vercel.app

# ===== INTELIGÊNCIA ARTIFICIAL =====
# Obtenha em: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx

# ===== BANCO DE DADOS =====
# PostgreSQL (fornecido automaticamente pelo Render)
DATABASE_URL=postgresql://user:password@host:port/database

# ===== SEGURANÇA - SENHAS DOS PAINÉIS =====
# ⚠️ IMPORTANTE: Use senhas fortes em produção!
ADMIN_PASSWORD=SuaSenhaForteAqui123!@#
KITCHEN_PASSWORD=OutraSenhaForte456!@#

# ===== SEGURANÇA - JWT =====
# Gere uma chave aleatória forte (32+ caracteres)
# Exemplo: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6

# ===== CACHE - REDIS (OPCIONAL) =====
# Se não configurado, usa Map em memória
# Redis Local: redis://localhost:6379
# Redis Cloud: redis://red-xxxxx:6379 ou rediss://red-xxxxx:6379 (SSL)
REDIS_URL=redis://red-xxxxx:6379

# ===== MERCADO PAGO =====
MP_ACCESS_TOKEN=APP_USR-xxxxxxxxxxxxxxxxxxxxxxxx
MP_DEVICE_ID=PAX_A910__SMARTPOS12345678
```

---

## 🚀 Deploy e Testes

### 1. Gerar JWT_SECRET Seguro:

```bash
# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Online: https://generate-random.org/api-key-generator
```

### 2. Testar Autenticação JWT:

```bash
# Login como Admin
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"role":"admin","password":"sua_senha"}'

# Resposta:
# {"success":true,"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}

# Usar token em requisição protegida
curl http://localhost:3001/api/users \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### 3. Testar Redis:

```bash
# Verificar logs do servidor
# ✅ "Redis conectado com sucesso!" = Redis funcionando
# ℹ️ "REDIS_URL não configurado - usando Map em memória" = Fallback ativo

# Testar conexão Redis diretamente
redis-cli -h red-xxxxx.redis.cloud.redislabs.com -p 6379 PING
# Resposta: PONG
```

---

## 🔒 Segurança em Produção

### Checklist Obrigatório:

- ✅ `JWT_SECRET` com 32+ caracteres aleatórios
- ✅ `ADMIN_PASSWORD` e `KITCHEN_PASSWORD` fortes (letras, números, símbolos)
- ✅ `REDIS_URL` com SSL (`rediss://`) em produção
- ✅ `FRONTEND_URL` configurado corretamente (evita CORS de origens não autorizadas)
- ✅ Usar HTTPS em produção (Render/Vercel fazem isso automaticamente)
- ⚠️ **NUNCA** commitar `.env` no Git (já está no `.gitignore`)

---

## 📊 Monitoramento

### Logs Importantes:

```bash
# Inicialização do Redis
✅ Redis conectado com sucesso!
💾 Cache: Redis

# Fallback para Map
⚠️ REDIS_URL não configurado - usando Map em memória
💾 Cache: Map em memória

# Autenticação JWT
✅ Login bem-sucedido para a role: admin
❌ Tentativa de login falhou para a role: admin
🔐 JWT: Configurado

# Cache de Pagamentos
✅ Pagamento 123456789 confirmado via IPN! Valor: R$ 25.00
```

---

## 🆘 Troubleshooting

### Erro: "Token não fornecido" ou "Token inválido"

- **Causa**: Token JWT não enviado ou expirado (8 horas)
- **Solução**: Fazer login novamente e obter novo token

### Erro: "Erro Redis: ECONNREFUSED"

- **Causa**: Redis não acessível ou URL incorreta
- **Solução**: Sistema ativa fallback automaticamente (Map em memória)
- **Verificar**: `REDIS_URL` está correto? Redis está rodando?

### Erro: "JWT_SECRET não está configurado!"

- **Causa**: Variável `JWT_SECRET` não definida no `.env`
- **Solução**: Adicionar `JWT_SECRET` com valor aleatório forte

### Cache não persiste entre reinicializações

- **Causa**: Usando Map em memória (fallback)
- **Solução**: Configurar `REDIS_URL` para persistência

---

## 📈 Próximos Passos Recomendados

1. **Rate Limiting**: Implementar limites de requisições por IP
2. **Refresh Tokens**: Adicionar tokens de atualização (validade maior)
3. **Logs Estruturados**: Winston ou Pino para logs em JSON
4. **Monitoring**: Sentry ou similar para tracking de erros
5. **Backup Redis**: Configurar snapshots automáticos

---

## ✅ Resumo da Implementação

| Recurso              | Status          | Configuração Necessária                            |
| -------------------- | --------------- | -------------------------------------------------- |
| **JWT Auth**         | ✅ Implementado | `JWT_SECRET`, `ADMIN_PASSWORD`, `KITCHEN_PASSWORD` |
| **Redis Cache**      | ✅ Implementado | `REDIS_URL` (opcional)                             |
| **Fallback Map**     | ✅ Automático   | Nenhuma                                            |
| **Rotas Protegidas** | ✅ Implementado | Token JWT no header                                |
| **TTL Automático**   | ✅ Implementado | 1 hora (Redis), limpeza manual (Map)               |

---

**🎉 Sistema 100% funcional com autenticação JWT e cache Redis/Map!**

Para mais detalhes, consulte:

- `server.js` - Código completo do backend
- `.env.example` - Template de configuração
- Documentação Mercado Pago: https://www.mercadopago.com.br/developers
