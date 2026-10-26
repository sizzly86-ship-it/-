@echo off
rem ClipCheck: run without installing (compiles on the fly via PowerShell)
cd /d "%~dp0"
start "" powershell -NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Add-Type -TypeDefinition (Get-Content -Raw -Encoding UTF8 ClipCheck.cs) -ReferencedAssemblies System.Windows.Forms,System.Drawing; [ClipCheck.Program]::Main()"
