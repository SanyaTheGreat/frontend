// Центральный источник адреса бэкенда.
// Локально задаётся в .env.local (VITE_API_BASE=http://localhost:3000),
// в проде — переменной окружения на Vercel; фолбэк — прод-URL на Render.
export const API_BASE =
  import.meta.env.VITE_API_BASE || 'https://two048-3vjx.onrender.com';

// Dev-авторизация без Telegram (только когда VITE_DEV_AUTH=true).
// Позволяет получить JWT через POST /auth/dev для локальной отладки в браузере.
export const DEV_AUTH = import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH === 'true';

export const LUDO_ENABLED = import.meta.env.VITE_LUDO_ENABLED === 'true';
