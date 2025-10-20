export const API_BASE = "https://lottery-server-waif.onrender.com"; // бекенд

// --- общие заголовки авторизации из localStorage ---
function authHeaders() {
  const token = localStorage.getItem("jwt");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// базовая обёртка над fetch с единым хэндлингом ошибок и JWT
async function http(path, opts = {}) {
  const mergedHeaders = {
    "Content-Type": "application/json",
    ...authHeaders(),                 // <-- добавили JWT сюда
    ...(opts.headers || {}),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    headers: mergedHeaders,
    credentials: "include",           // если на бэке ещё смотрите на cookie — оставил
    ...opts,
  });

  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch { /* ignore */ }
    const msg = body?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  // если пустой ответ (204), не пытаться парсить json
  if (res.status === 204) return null;
  return res.json();
}

// ---------- API ----------
export const fetchCases = () => http(`/api/cases`);

export const fetchCaseChance = (caseId) => http(`/api/cases/${caseId}/chance`);

export const postSpin = (payload) =>
  http(`/api/case/spin`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const postClaim = (spinId) =>
  http(`/api/case/spin/${spinId}/claim`, { method: "POST" });

export const postReroll = (spinId) =>
  http(`/api/case/spin/${spinId}/reroll`, { method: "POST" });

export const fetchInventory = async (telegramId) => {
  const j = await http(`/api/inventory?telegram_id=${encodeURIComponent(telegramId)}`);
  return Array.isArray(j) ? j : (j.items || []);
};

export const fetchFreeSpinAvailability = (telegramId) =>
  http(`/api/free-spin/availability?telegram_id=${encodeURIComponent(telegramId)}`);

// helper для получения id из Telegram WebApp (если открыто внутри TG)
export function getTelegramId() {
  const tg = window?.Telegram?.WebApp?.initDataUnsafe;
  return tg?.user?.id || null;
}
