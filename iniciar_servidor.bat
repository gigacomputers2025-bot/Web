@echo off
echo =======================================
echo Iniciando Servidor Local TechStore
echo =======================================
echo.
echo Verificando e instalando dependencias (esto puede tardar unos segundos)...
call npm install
echo.
echo Iniciando el servidor...
call npm start
pause