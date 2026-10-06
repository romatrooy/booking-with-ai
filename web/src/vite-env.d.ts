/// <reference types="vite/client" />

// Декларация пустого модуля для CSS-импортов. Vite клиент уже
// объявляет `*.module.css` и `*.svg`, нам нужен только голый CSS.
declare module "*.css";