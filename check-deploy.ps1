# Script de verificação antes do deploy (Windows PowerShell)

Write-Host "🔍 Verificando configuração do backend..." -ForegroundColor Cyan
Write-Host ""

# Verificar se o .env existe
if (-not (Test-Path .env)) {
    Write-Host "⚠️  Arquivo .env não encontrado!" -ForegroundColor Yellow
    Write-Host "📝 Criando .env a partir do .env.example..." -ForegroundColor Yellow
    Copy-Item .env.example .env
    Write-Host "✅ Arquivo .env criado. Por favor, edite-o com suas configurações." -ForegroundColor Green
} else {
    Write-Host "✅ Arquivo .env encontrado" -ForegroundColor Green
}

# Verificar variáveis essenciais
Write-Host ""
Write-Host "📋 Variáveis de ambiente necessárias para o Render:" -ForegroundColor Cyan
Write-Host "   - NODE_ENV=production"
Write-Host "   - PORT=3001"
Write-Host "   - OPENAI_API_KEY=sk-..."
Write-Host "   - FRONTEND_URL=https://seu-app.vercel.app"
Write-Host ""

# Verificar se node_modules existe
if (-not (Test-Path node_modules)) {
    Write-Host "📦 Instalando dependências..." -ForegroundColor Yellow
    npm install
} else {
    Write-Host "✅ Dependências instaladas" -ForegroundColor Green
}

Write-Host ""
Write-Host "✅ Verificação concluída!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Próximos passos:" -ForegroundColor Cyan
Write-Host "   1. Faça commit das alterações: git add . ; git commit -m 'Deploy ready'"
Write-Host "   2. Faça push para o GitHub: git push origin main"
Write-Host "   3. Crie um novo Web Service no Render"
Write-Host "   4. Configure as variáveis de ambiente no Render"
Write-Host "   5. Copie a URL do backend e configure no frontend (Vercel)"
Write-Host ""
