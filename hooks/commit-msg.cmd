@echo off
rem Windows-обёртка для commit-msg хука. См. комментарий в
rem hooks/pre-commit.cmd — зачем нужен .cmd-файл рядом со скриптом.

node "%~dp0commit-msg" %*
exit /b %ERRORLEVEL%