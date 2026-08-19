@echo off
echo ========================================================
echo   Backing up WebApp to Google Drive (Excluding node_modules)
echo ========================================================
cd /d "%~dp0"

REM Use Windows built-in tar to zip everything except node_modules and .git
tar.exe -a -c -f "G:\My Drive\PyExcel\Truck\Container_V3\Container_WebApp_Backup.zip" --exclude=node_modules --exclude=.git *

echo.
echo Backup successfully created at:
echo G:\My Drive\PyExcel\Truck\Container_V3\Container_WebApp_Backup.zip
echo.
pause
