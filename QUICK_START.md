# 🚀 Guia Rápido de Deploy

## Para quem tem pressa!

### 1️⃣ Prepare o código (2 minutos)

```bash
# Commit as mudanças
git add .
git commit -m "Backend pronto para Render"
git push origin main
```

### 2️⃣ Deploy no Render (8 minutos)

1. Acesse: https://render.com

**Primeiro: Crie o Banco PostgreSQL**
2. **New +** → **PostgreSQL**
3. Configure:
   - **Name**: `kiosk-db`
   - **Instance Type**: Free
4. **Create Database** → Aguarde 1-2 min

**Depois: Crie o Web Service**
5. **New +** → **Web Service**
6. Conecte seu GitHub → Selecione este repo
7. Configure:
   - **Build**: `npm install`
   - **Start**: `npm start`
8. Adicione as variáveis:
   ```
   NODE_ENV=production
   PORT=3001
   OPENAI_API_KEY=sk-sua-chave-aqui
   FRONTEND_URL=https://seu-app.vercel.app
   DATABASE_URL=<selecione o banco kiosk-db>
   ```
9. **Create Web Service**

### 3️⃣ Conecte com Vercel (2 minutos)

No seu projeto Vercel:
1. **Settings** → **Environment Variables**
2. Adicione:
   ```
   NEXT_PUBLIC_API_URL=https://seu-backend.onrender.com
   ```
3. **Redeploy**

### 4️⃣ Ajuste CORS (1 minuto)

Volte no Render e atualize `FRONTEND_URL` com a URL real do Vercel que foi gerada.

---

## ✅ Pronto!

Teste: `https://seu-backend.onrender.com/health`

Se retornar `{"status":"ok",...}` está funcionando! 🎉

---

## ⚠️ Problemas Comuns

**CORS Error?**
→ Certifique-se que `FRONTEND_URL` no Render está igual à URL do Vercel

**IA não funciona?**
→ Verifique se `OPENAI_API_KEY` está correta em https://platform.openai.com/api-keys

**Erro de banco de dados?**
→ Confirme que criou o PostgreSQL primeiro e conectou via `DATABASE_URL`

**Lento na primeira requisição?**
→ Normal! Render Free "dorme" após 15min sem uso (cold start ~30s)

---

Para mais detalhes, veja: `README.md` ou `DEPLOY_CHECKLIST.md`
