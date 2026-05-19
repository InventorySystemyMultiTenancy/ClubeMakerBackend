# 🔧 Guia de Conexão Vercel → Render

## ❌ Problema: "Failed to fetch" ou "ERR_CONNECTION_REFUSED"

Se você está vendo esse erro no console do navegador:
```
localhost:3001/api/menu:1 Failed to load resource: net::ERR_CONNECTION_REFUSED
```

**Causa**: O frontend está tentando conectar em `localhost:3001` (desenvolvimento) em vez da URL do Render (produção).

---

## ✅ Solução Rápida (5 minutos)

### Passo 1: Descobrir a URL do Backend

1. Acesse o dashboard do Render: https://dashboard.render.com
2. Clique no seu serviço (ex: `kiosk-backend`)
3. Copie a URL no topo (ex: `https://kiosk-backend.onrender.com`)

### Passo 2: Configurar no Vercel

#### Para Vite (React/Vue):

1. Acesse seu projeto no Vercel: https://vercel.com/dashboard
2. Vá em **Settings** → **Environment Variables**
3. Adicione a variável:
   - **Name**: `VITE_API_URL`
   - **Value**: `https://kiosk-backend.onrender.com`
   - **Environments**: Marque `Production`, `Preview`, `Development`
4. Clique em **Save**

#### Para Next.js:

1. Mesmos passos acima, mas use o nome:
   - **Name**: `NEXT_PUBLIC_API_URL`
   - **Value**: `https://kiosk-backend.onrender.com`

### Passo 3: Redeploy no Vercel

**Opção A - Pelo Dashboard:**
1. Vá em **Deployments**
2. Clique nos 3 pontinhos do último deploy
3. Clique em **Redeploy**

**Opção B - Por Git:**
```bash
git commit --allow-empty -m "Trigger redeploy"
git push origin main
```

### Passo 4: Atualizar CORS no Render

1. Volte ao Render
2. Vá em **Environment**
3. Encontre `FRONTEND_URL`
4. Atualize com a URL do Vercel (ex: `https://seu-app.vercel.app`)
5. Salve (vai fazer redeploy automático)

---

## 🧪 Testar a Conexão

Depois do redeploy do Vercel:

1. Abra seu app no Vercel
2. Pressione **F12** (DevTools)
3. Vá na aba **Network**
4. Recarregue a página
5. Procure por requisições para `onrender.com`
6. ✅ Se aparecer `200 OK` → Funcionando!

---

## 📝 Como o Frontend Deve Usar a Variável

### Vite (React/Vue):

```javascript
// Correto ✅
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

fetch(`${API_URL}/api/menu`)
  .then(res => res.json())
  .then(data => console.log(data));
```

### Next.js:

```javascript
// Correto ✅
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

fetch(`${API_URL}/api/menu`)
  .then(res => res.json())
  .then(data => console.log(data));
```

---

## 🐛 Troubleshooting Avançado

### ❌ Ainda recebo "ERR_CONNECTION_REFUSED"

**Causa**: A variável não foi carregada no código.

**Solução**:
1. Verifique o nome da variável no código do frontend
2. Compare com o nome configurado no Vercel
3. **Vite**: Deve começar com `VITE_`
4. **Next.js**: Deve começar com `NEXT_PUBLIC_`

### ❌ Erro "Not allowed by CORS"

**Causa**: O backend não reconhece a URL do Vercel.

**Solução**:
1. No Render, verifique `FRONTEND_URL`
2. Deve incluir TODAS as URLs do Vercel:
   ```
   https://seu-app.vercel.app,https://seu-app-git-main.vercel.app
   ```
3. Não esqueça o `https://` e sem barra no final

### ❌ Funciona localmente, mas não no Vercel

**Causa**: Variável configurada apenas para Development.

**Solução**:
1. No Vercel → Environment Variables
2. Edite a variável
3. Marque os 3 ambientes: **Production**, **Preview**, **Development**
4. Redeploy

### ❌ Vercel mostra URL errada nos logs

**Causa**: Código está usando URL hardcoded.

**Solução**:
1. Busque no código por `localhost:3001`
2. Substitua por variável de ambiente
3. Exemplo errado ❌:
   ```javascript
   fetch('http://localhost:3001/api/menu')
   ```
4. Exemplo correto ✅:
   ```javascript
   const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
   fetch(`${API_URL}/api/menu`)
   ```

---

## 📋 Checklist de Verificação

- [ ] URL do Render copiada corretamente
- [ ] Variável criada no Vercel com nome correto
- [ ] Variável marcada para Production
- [ ] Redeploy feito no Vercel
- [ ] FRONTEND_URL atualizada no Render
- [ ] Código do frontend usa variável de ambiente
- [ ] DevTools mostra requisições para onrender.com
- [ ] Sem erros de CORS no console

---

## 🎯 URLs de Referência

| Serviço | URL Dashboard | Variável |
|---------|---------------|----------|
| **Render** | https://dashboard.render.com | `FRONTEND_URL` |
| **Vercel** | https://vercel.com/dashboard | `VITE_API_URL` ou `NEXT_PUBLIC_API_URL` |

---

## ✅ Sucesso!

Quando tudo estiver funcionando, você verá no console:

```
✅ Conectado ao backend: https://kiosk-backend.onrender.com
✅ Menu carregado com sucesso
```

E no Network (DevTools):
```
GET https://kiosk-backend.onrender.com/api/menu → 200 OK
```

---

**Ainda com problemas?** Verifique:
1. Logs do Render (se o backend está rodando)
2. Logs do Vercel (se o build passou)
3. Console do navegador (erros específicos)
