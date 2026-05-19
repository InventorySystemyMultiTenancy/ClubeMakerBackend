# Kiosk Pro Backend 🍕

Backend para sistema de Kiosk de Pastelaria com Inteligência Artificial usando OpenAI (GPT-4o-mini).

## 🚀 Tecnologias

- **Node.js + Express** - Servidor HTTP
- **SQLite + Knex** - Banco de dados
- **OpenAI API** - Inteligência Artificial para sugestões e chatbot
- **CORS** - Configurado para integração com Vercel

## 📋 Funcionalidades

- ✅ CRUD de produtos (menu)
- ✅ Gerenciamento de usuários
- ✅ Sistema de pedidos
- ✅ Sugestões de upsell com IA
- ✅ Chatbot assistente
- ✅ Health check endpoint

## 🌐 Deploy no Render

### Passo 1: Preparar o Repositório

1. Faça commit das alterações:
```bash
git add .
git commit -m "Preparar backend para deploy no Render"
git push origin main
```

### Passo 2: Criar Banco de Dados PostgreSQL no Render

1. Acesse [https://render.com](https://render.com) e faça login
2. Clique em **"New +"** → **"PostgreSQL"**
3. Configure o banco:
   - **Name**: `kiosk-db`
   - **Database**: `kiosk`
   - **User**: `kiosk_user`
   - **Region**: Mesma do Web Service (ex: Oregon)
   - **Instance Type**: `Free`
4. Clique em **"Create Database"**
5. Aguarde a criação (1-2 minutos)

### Passo 3: Criar Web Service no Render

1. Clique em **"New +"** → **"Web Service"**
2. Conecte seu repositório GitHub
3. Configure o serviço:
   - **Name**: `kiosk-backend` (ou nome de sua preferência)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free` (ou plano pago para produção)

### Passo 4: Configurar Variáveis de Ambiente

No dashboard do Render, adicione as seguintes variáveis de ambiente:

| Variável | Valor | Descrição |
|----------|-------|-----------|
| `NODE_ENV` | `production` | Ambiente de execução |
| `PORT` | `3001` | Porta do servidor (Render define automaticamente) |
| `OPENAI_API_KEY` | `sk-...` | Sua chave da API OpenAI |
| `FRONTEND_URL` | `https://seu-app.vercel.app` | URL do frontend no Vercel |
| `DATABASE_URL` | *Do Banco PostgreSQL* | Conectar ao banco criado no Passo 2 |

> **DATABASE_URL**: No campo de valor, selecione o banco `kiosk-db` que você criou. O Render vai conectar automaticamente.

> **Importante**: Você pode adicionar múltiplas URLs separadas por vírgula em `FRONTEND_URL` para diferentes ambientes (produção, staging, etc.)

### Passo 5: Deploy

1. Clique em **"Create Web Service"**
2. Aguarde o build e deploy automático
3. Anote a URL do backend (ex: `https://kiosk-backend.onrender.com`)

## 🔗 Conectar com Frontend no Vercel

### Configuração Rápida:

1. **Adicione a variável no Vercel:**
   - **Vite/React**: `VITE_API_URL` = `https://kiosk-backend.onrender.com`
   - **Next.js**: `NEXT_PUBLIC_API_URL` = `https://kiosk-backend.onrender.com`
   - Marque: Production, Preview, Development

2. **No código do frontend:**
```javascript
// Vite
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Next.js
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Uso
fetch(`${API_URL}/api/menu`)
  .then(res => res.json())
  .then(data => console.log(data));
```

3. **Redeploy no Vercel**

4. **Atualizar CORS no Render:**
   - Atualize `FRONTEND_URL` com a URL do Vercel:
   ```
   FRONTEND_URL=https://seu-app.vercel.app,https://seu-app-git-main.vercel.app
   ```

> ⚠️ **Problema de conexão?** Veja o guia completo: [`VERCEL_CONNECTION_GUIDE.md`](./VERCEL_CONNECTION_GUIDE.md)

## 🧪 Testar a API

### Endpoints Principais:

```bash
# Health check
GET https://kiosk-backend.onrender.com/health

# Listar produtos
GET https://kiosk-backend.onrender.com/api/menu

# Criar pedido
POST https://kiosk-backend.onrender.com/api/orders
Content-Type: application/json
{
  "userId": "user_123",
  "userName": "João Silva",
  "items": [
    { "id": "prod_1", "name": "Pastel de Carne", "price": 8.5, "quantity": 2 }
  ],
  "total": 17.0
}

# Chat com IA
POST https://kiosk-backend.onrender.com/api/ai/chat
Content-Type: application/json
{
  "message": "Qual o pastel mais popular?"
}
```

## 🛠️ Desenvolvimento Local

1. Clone o repositório:
```bash
git clone <seu-repositorio>
cd BackendMachineToten
```

2. Instale as dependências:
```bash
npm install
```

3. Crie o arquivo `.env`:
```bash
cp .env.example .env
```

4. Edite o `.env` com suas configurações:
```env
PORT=3001
FRONTEND_URL=http://localhost:3000
OPENAI_API_KEY=sk-your-api-key-here
```

5. Inicie o servidor:
```bash
npm run dev
```

O servidor estará rodando em `http://localhost:3001`

## 📂 Estrutura do Projeto

```
BackendMachineToten/
├── server.js           # Servidor principal (configuração híbrida de banco)
├── package.json        # Dependências (inclui pg e sqlite3)
├── render.yaml         # Configuração do Render + PostgreSQL
├── .env.example        # Exemplo de variáveis de ambiente
├── data/
│   ├── menu.json      # Dados iniciais do menu
│   └── kiosk.sqlite   # Banco SQLite (apenas desenvolvimento local)
└── README.md          # Este arquivo
```

## 🗄️ Banco de Dados

O backend usa **configuração híbrida**:
- **Produção (Render)**: PostgreSQL (persistente e confiável)
- **Desenvolvimento Local**: SQLite (simples e rápido)

A escolha é automática baseada na variável `DATABASE_URL`.

## 🔐 Segurança

- ✅ CORS configurado para aceitar apenas domínios autorizados
- ✅ Variáveis de ambiente para dados sensíveis
- ✅ Validação de dados de entrada
- ✅ Tratamento de erros

## 📝 Notas Importantes

### ✅ Persistência de Dados com PostgreSQL

Usando o **PostgreSQL do Render**:
- ✅ Dados persistem entre deploys e restarts
- ✅ Plano free disponível (1GB de armazenamento)
- ✅ Backup automático em planos pagos
- ✅ SSL/TLS habilitado por padrão

O backend detecta automaticamente se está em produção (`DATABASE_URL` presente) e usa PostgreSQL, caso contrário usa SQLite localmente.

### Sleep Mode no Plano Free

O Render coloca serviços gratuitos em "sleep" após 15 minutos de inatividade:
- A primeira requisição pode demorar ~30 segundos (cold start)
- Considere usar um serviço de ping ou upgrade para plano pago

## 📚 Recursos Úteis

- [Documentação Render](https://render.com/docs)
- [Documentação OpenAI](https://platform.openai.com/docs)
- [Documentação Vercel](https://vercel.com/docs)

## 🆘 Troubleshooting

### Erro de CORS

Se receber erro de CORS, verifique:
1. A variável `FRONTEND_URL` está configurada no Render
2. A URL do frontend está correta (incluindo https://)
3. O frontend está fazendo requisições para a URL correta do backend

### IA não funciona

1. Verifique se `OPENAI_API_KEY` está configurada
2. Confirme se a chave é válida em https://platform.openai.com/api-keys
3. Verifique se há créditos disponíveis na conta OpenAI

### Banco de dados vazio após deploy

Isso é esperado no primeiro deploy. O banco será criado e populado automaticamente na primeira inicialização.

### Erro de conexão com PostgreSQL

Se receber erro de conexão com o banco:
1. Verifique se o banco PostgreSQL foi criado no Render
2. Confirme que `DATABASE_URL` está configurada corretamente
3. Verifique os logs do banco no Render Dashboard
4. Certifique-se que Web Service e Database estão na mesma região

## 📄 Licença

Este projeto é privado e proprietário.

---

Desenvolvido para Kiosk Pro 🚀
