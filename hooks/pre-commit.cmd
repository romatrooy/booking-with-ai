@echo off
rem Windows-обёртка для pre-commit хука. Git for Windows на этой
rem машине не запускает .js-файлы через shebang (`#!/usr/bin/env node`),
rem потому что `sh` отсутствует в PATH. Git предпочитает .cmd-файлы
rem для хуков и запускает их без посредников.
rem
rem Этот файл делает ровно то, что делал бы pre-commit под Linux.
rem Расширение .cjs важно: корень проекта — ESM (`"type": "module"`),
rem и без явного .cjs Node пытается интерпретировать скрипт как ESM.

node "%~dp0pre-commit.cjs" %*
exit /b %ERRORLEVEL%