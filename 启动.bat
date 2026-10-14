@echo off
chcp 65001 >nul
title 禾禾小冒险 Web 服务器

echo.
echo ╔══════════════════════════════════╗
echo ║     禾禾小冒险 Web 服务器        ║
echo ╚══════════════════════════════════╝
echo.

cd /d "%~dp0"

:: 从 .env 文件加载环境变量（如果存在）
if exist ".env" for /f "usebackq tokens=1,2 delims==" %%a in (".env") do (
    echo %%a | findstr /r "^#" >nul || set %%a=%%b
)

node server/index.js

pause
