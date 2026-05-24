# ── Bricks Agent Backend — Deploy & Seed Script ─────────────────────────────
# Run this from:  C:\Users\keert\bricks_agent_adminpanel_nodejs-main
#   powershell -ExecutionPolicy Bypass -File .\deploy_and_seed.ps1
# ─────────────────────────────────────────────────────────────────────────────

Set-Location $PSScriptRoot
Write-Host "`n🔧 Bricks Agent — Deploy & Seed" -ForegroundColor Cyan

# 1. Remove stale git locks
Write-Host "`n[1/5] Removing stale git locks..." -ForegroundColor Yellow
@(".git\index.lock", ".git\HEAD.lock", ".git\MERGE_HEAD.lock") | ForEach-Object {
    if (Test-Path $_) { Remove-Item $_ -Force; Write-Host "   Removed $_" }
}

# 2. Stage changes
Write-Host "`n[2/5] Staging changes..." -ForegroundColor Yellow
git add seed.js public\materials\ .gitignore
if ($LASTEXITCODE -ne 0) { Write-Host "git add failed" -ForegroundColor Red; exit 1 }

# 3. Commit
Write-Host "`n[3/5] Committing..." -ForegroundColor Yellow
git commit -m "feat: SVG construction material assets + new seed.js

- 47 SVG product images in public/materials/{category}/
  Served as static files: GET /public/materials/{category}/{file}.svg
- seed.js rewritten: 56 products across 4 categories
    Structural Materials (18), Finishing & Flooring (11)
    Plumbing & Electrical (14), Doors Windows & Wood (11)
- No hardcoded prices - min_price/max_price=0 (sellers set dynamically)
- Images self-hosted via Express static middleware"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Nothing to commit or commit failed" -ForegroundColor Yellow
}

# 4. Push to GitHub (triggers Render auto-deploy)
Write-Host "`n[4/5] Pushing to GitHub..." -ForegroundColor Yellow
git push origin main
if ($LASTEXITCODE -ne 0) { Write-Host "git push failed" -ForegroundColor Red; exit 1 }
Write-Host "   Pushed! Render will auto-deploy in ~2 minutes." -ForegroundColor Green

# 5. Run seed against MongoDB
Write-Host "`n[5/5] Running seed.js against MongoDB..." -ForegroundColor Yellow
Write-Host "   (This populates categories + products with correct image URLs)" -ForegroundColor Gray
node seed.js
if ($LASTEXITCODE -ne 0) { Write-Host "Seed failed - check output above" -ForegroundColor Red; exit 1 }

Write-Host "`n✅ All done! Backend deployed + database seeded." -ForegroundColor Green
Write-Host "   Products are live at: https://bricksagent.onrender.com/api/product" -ForegroundColor Cyan
Write-Host "   Images served at:     https://bricksagent.onrender.com/public/materials/" -ForegroundColor Cyan
