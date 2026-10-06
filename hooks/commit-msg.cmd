@echo off
rem Windows-обёртка для commit-msg хука. См. комментарий в
rem hooks/pre-commit.cmd — зачем нужен .cmd-файл рядом со скриптом.
rem Расширение .cjs важно из-за "type": "module" в package.json.

node "%~dp0commit-msg.cjs" %*
exit /b %ERRORLEVEL%