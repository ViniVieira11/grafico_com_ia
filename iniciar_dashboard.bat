@echo off
REM Sobe um servidor local nesta pasta e abre o dashboard no navegador.
REM (Necessario para o navegador conseguir ler data/Base_Consolidada.xlsx automaticamente.)
cd /d "%~dp0"
start "" "http://localhost:8765/index.html"
python -m http.server 8765
