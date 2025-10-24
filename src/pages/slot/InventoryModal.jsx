// src/pages/slot/InventoryModal.jsx
import { useEffect, useMemo, useState } from "react";
import "./InventoryModal.css";

const API_BASE = "https://lottery-server-waif.onrender.com";
const asset = (p) => `${import.meta.env.BASE_URL || "/"}${p.replace(/^\/+/, "")}`;

function authHeaders() {
  const token = localStorage.getItem("jwt");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function slugify(s) {
  return (s || "")
    .toString()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-_.]/g, "")
    .replace(/\-+/g, "-")
    .replace(/^\-+|\-+$/g, "");
}

export default function InventoryModal({ open, onClose, onWithdrawSuccess, balanceStars = 0 }) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [withdrawing, setWithdrawing] = useState(false);

  const load = useMemo(
    () => async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`${API_BASE}/api/inventory?ts=${Date.now()}`, {
          method: "GET",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          credentials: "include",
          cache: "no-store",
        });

        if (res.status === 304) {
          setLoading(false);
          return;
        }

        const body = await res.json().catch(() => []);
        // 🔍 добавлен лог для диагностики
        console.log("[InventoryModal] status:", res.status, "len:", Array.isArray(body) ? body.length : "n/a", body);

        if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
        setItems(Array.isArray(body) ? body : []);
      } catch (e) {
        setError(e.message || "Не удалось загрузить инвентарь");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (open) {
      setSelected(null);
      load();
    }
  }, [open, load]);

  if (!open) return null;

  const withdrawCost = 25;

  async function withdraw(item) {
    if (!item?.id) return;
    if (balanceStars < withdrawCost) {
      alert("Не хватает ⭐ для вывода (нужно 25)");
      return;
    }
    setWithdrawing(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/inventory/${item.id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);

      setItems((prev) => prev.filter((x) => x.id !== item.id));
      setSelected(null);
      onWithdrawSuccess?.(item);
      alert("Заявка на вывод отправлена ✅");
    } catch (e) {
      alert(e.message || "Ошибка вывода");
    } finally {
      setWithdrawing(false);
    }
  }

  const headerTitle = selected ? "Приз" : "Инвентарь";

  return (
    <div className="inv-modal-overlay" onClick={onClose}>
      <div className="inv-modal" onClick={(e) => e.stopPropagation()}>
        <div className="inv-modal-header">
          <div className="inv-title">{headerTitle}</div>
          <button className="inv-close" onClick={onClose} aria-label="Закрыть">✕</button>
        </div>

        {!selected && (
          <>
            <div className="inv-balance">⭐ Баланс: <b>{Math.floor(balanceStars)}</b></div>
            <div className="inv-note">Вывод одного приза стоит <b>{withdrawCost} ⭐</b></div>

            {loading && <div className="inv-empty">Загрузка…</div>}
            {error && <div className="inv-error">{error}</div>}
            {!loading && !error && items.length === 0 && <div className="inv-empty">Пусто 😔</div>}

            <div className="inv-grid">
              {items.map((it) => {
                const png = asset(`prizes/${slugify(it.nft_name)}.png`);
                return (
                  <button key={it.id} className="inv-card" onClick={() => setSelected(it)}>
                    <div className="inv-thumb">
                      <img
                        src={png}
                        alt={it.nft_name}
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = asset("prizes/fallback.png");
                        }}
                      />
                    </div>
                    <div className="inv-name">{it.nft_name}</div>
                    <div className="inv-meta">
                      <span className={`inv-pill ${it.status}`}>{it.status}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {selected && (
          <div className="inv-detail">
            <div className="inv-detail-thumb">
              <img
                src={asset(`prizes/${slugify(selected.nft_name)}.png`)}
                alt={selected.nft_name}
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = asset("prizes/fallback.png");
                }}
              />
            </div>

            <div className="inv-detail-info">
              <div className="inv-detail-name">{selected.nft_name}</div>
              <div className="inv-detail-cost">Вывод: <b>{withdrawCost} ⭐</b></div>
            </div>

            <div className="inv-actions">
              <button className="inv-btn-secondary" onClick={() => setSelected(null)}>← Назад</button>
              <button className="inv-btn-primary" onClick={() => withdraw(selected)} disabled={withdrawing}>
                {withdrawing ? "Отправляем…" : `Вывести за ${withdrawCost} ⭐`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
