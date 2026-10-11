@echo off
cd /d "%~dp0"
python scripts\preview.py
if errorlevel 1 pause
