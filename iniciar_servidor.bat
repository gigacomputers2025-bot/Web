@echo off
title TechStore + Nexus POS
echo =======================================
echo TechStore + Nexus POS - Iniciando
echo =======================================
echo.

:: ========== TECHSTORE WEB-MAIN ==========
echo [1/2] Verificando dependencias de TechStore...
cd /d "%~dp0"
call cmd.exe /c npm install
echo.
echo [1/2] Iniciando TechStore (Web-main) en ventana separada...
start "TechStore Web-main" cmd /c "npm start"

:: ========== NEXUS POS ==========
echo.
echo [2/2] Iniciando Nexus POS en ventana separada (Puerto 3010)...
cd /d "%~dp0..\.."
start "Nexus POS" cmd /c "start-nexus-pos.bat"

echo.
echo =======================================
echo Ambos servidores iniciados:
echo   TechStore Web-main: http://localhost:3000
echo   Nexus POS:          http://localhost:3010
echo =======================================
echo.
echo Cierre las ventanas individuales para detener cada servidor.
echo.
pause