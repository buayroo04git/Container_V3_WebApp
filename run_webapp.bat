@echo off
echo ========================================================
echo   Starting Container OCR WebApp (Development Server)
echo   ระบบกำลังเปิดหน้าเว็บ... กรุณารอสักครู่ครับ
echo ========================================================
cd /d "%~dp0"
npm run dev -- --open
pause
