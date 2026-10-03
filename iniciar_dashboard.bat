@echo off
REM Sobe um servidor local na pasta Bases e abre o dashboard no navegador.
REM (Necessario para o navegador conseguir ler Base_Consolidada.xlsx automaticamente.)
cd /d "%~dp0.."
start "" "http://localhost:8765/dashboard/index.html"
python -m http.server 8765
