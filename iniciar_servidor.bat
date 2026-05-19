@echo off
echo =======================================
echo Iniciando Servidor Local TechStore
echo =======================================
echo.
echo Verificando e instalando dependencias...
call cmd.exe /c npm install
echo.
echo Iniciando el servidor...
call cmd.exe /c npm start
pause