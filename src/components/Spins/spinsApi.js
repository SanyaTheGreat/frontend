export const API_BASE = "https://lottery-server-waif.onrender.com"; // бекенд


async function http(path, opts = {}) {
const res = await fetch(`${API_BASE}${path}`, {
headers: { "Content-Type": "application/json" },
credentials: "include",
...opts,
});
if (!res.ok) {
let body = null;
try { body = await res.json(); } catch { /* ignore */ }
const msg = body?.error || `HTTP ${res.status}`;
throw new Error(msg);
}
return res.json();
}


export const fetchCases = () => http(`/api/cases`);
export const fetchCaseChance = (caseId) => http(`/api/cases/${caseId}/chance`);
export const postSpin = (payload) => http(`/api/case/spin`, { method: "POST", body: JSON.stringify(payload) });
export const postClaim = (spinId) => http(`/api/case/spin/${spinId}/claim`, { method: "POST" });
export const postReroll = (spinId) => http(`/api/case/spin/${spinId}/reroll`, { method: "POST" });

export const fetchInventory = (telegramId) =>
  http(`/api/inventory?telegram_id=${encodeURIComponent(telegramId)}`);

export function getTelegramId() {
const tg = window?.Telegram?.WebApp?.initDataUnsafe;
return tg?.user?.id || null;
}