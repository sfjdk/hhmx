@echo off
chcp 65001 >nul
title Claude Code - 禾禾小冒险
echo ==============================================
echo   在当前文件夹启动 Claude Code
echo   目录: %cd%
echo ==============================================
echo.
cd /d "%~dp0"
claude
pause
