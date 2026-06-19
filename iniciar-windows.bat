@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo No se ha encontrado Node.js.
  echo Instala Node.js LTS desde https://nodejs.org/
  pause
  exit /b 1
)
echo Iniciando Metas OBS...
start "" http://localhost:3000/admin
node server.js
pause
