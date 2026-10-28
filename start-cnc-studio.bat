@echo off
title CNC WoodCraft Studio PWA
cd /d "%~dp0"
echo ========================================================
echo        Pornire CNC WoodCraft Studio PWA Offline
echo ========================================================
echo.
echo Se porneste serverul local PWA...
echo Aplicatia va fi accesibila la adresa: http://localhost:5173
echo.
start http://localhost:5173
npm run dev -- --host
pause
