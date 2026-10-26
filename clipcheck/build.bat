@echo off
rem ClipCheck: build ClipCheck.exe with the C# compiler built into Windows (.NET Framework 4)
cd /d "%~dp0"
set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" set CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe
"%CSC%" /nologo /target:winexe /codepage:65001 /out:ClipCheck.exe /r:System.Windows.Forms.dll /r:System.Drawing.dll ClipCheck.cs
if errorlevel 1 (echo BUILD FAILED & pause & exit /b 1)
echo Done: ClipCheck.exe
pause
