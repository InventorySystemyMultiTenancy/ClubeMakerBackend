#!/bin/bash

# Script de verificação antes do deploy

echo "🔍 Verificando configuração do backend..."
echo ""

# Verificar se o .env existe
if [ ! -f .env ]; then
    echo "⚠️  Arquivo .env não encontrado!"
    echo "📝 Criando .env a partir do .env.example..."
    cp .env.example .env
    echo "✅ Arquivo .env criado. Por favor, edite-o com suas configurações."
else
    echo "✅ Arquivo .env encontrado"
fi

# Verificar variáveis essenciais
echo ""
echo "📋 Variáveis de ambiente necessárias para o Render:"
echo "   - NODE_ENV=production"
echo "   - PORT=3001"
echo "   - OPENAI_API_KEY=sk-..."
echo "   - FRONTEND_URL=https://seu-app.vercel.app"
echo ""

# Verificar se node_modules existe
if [ ! -d node_modules ]; then
    echo "📦 Instalando dependências..."
    npm install
else
    echo "✅ Dependências instaladas"
fi

echo ""
echo "✅ Verificação concluída!"
echo ""
echo "📝 Próximos passos:"
echo "   1. Faça commit das alterações: git add . && git commit -m 'Deploy ready'"
echo "   2. Faça push para o GitHub: git push origin main"
echo "   3. Crie um novo Web Service no Render"
echo "   4. Configure as variáveis de ambiente no Render"
echo "   5. Copie a URL do backend e configure no frontend (Vercel)"
echo ""
