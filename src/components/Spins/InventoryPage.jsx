import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchInventory, getTelegramId, postClaim, postReroll } from "./spinsApi";
import { supabase } from "../../supabaseClient";
import "./spins.css";

export default function InventoryPage() {
  const navigate = useNavigate();

  // данные
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // балансы
  const [balance, setBalance] = useState({ stars: 0, tickets: 0 });

  // курсы (для пересчёта при продаже)
  const [fx, setFx] = useState({ stars_per_ton: 0, fee_markup: 0 });

  // тост
  const [toast, setToast] = useState(null); // {text}

  // защита от повторов: id спинов "в процессе"
  const [processing, setProcessing] = useState(new Set());
  const isBusy = (id) => processing.has(id);
  const lock = (id) => setProcessing((prev) => {
    const s = new Set(prev); s.add(id); return s;
  });
  const unlock = (id) => setProcessing((prev) => {
    const s = new Set(prev); s.delete(id); return s;
  });

  // telegram_id: TG → ?tgid= → localStorage (чтобы в dev работало в браузере)
  const queryId = new URLSearchParams(window.location.search).get("tgid");
  const storedId = window.localStorage.getItem("tgid") || null;
  const effectiveId = getTelegramId() || queryId || storedId || null;
  if (queryId && queryId !== storedId) window.localStorage.setItem("tgid", queryId);
  const tgIdRef = useRef(effectiveId);

  // helpers
  function showToast(text) {
    setToast({ text });
    setTimeout(() => setToast(null), 2000);
  }

  const loadFx = useMemo(
    () => async () => {
      try {
        const { data } = await supabase
          .from("fx_rates")
          .select("stars_per_ton, fee_markup")
          .eq("id", 1)
          .maybeSingle();
        if (data) {
          setFx({
            stars_per_ton: Number(data.stars_per_ton || 0),
            fee_markup: Number(data.fee_markup || 0),
          });
        }
      } catch {
        /* noop */
      }
    },
    []
  );

  const loadInventory = useMemo(
    () => async () => {
      setLoading(true);
      setError("");
      const tgId = tgIdRef.current;
      try {
        if (!tgId) {
          setItems([]);
          setError("Telegram ID не найден. Откройте /inventory?tgid=ВАШ_ID для dev.");
          return;
        }
        const list = await fetchInventory(tgId); // ожидаем массив
        setItems(Array.isArray(list) ? list : (list?.items || []));
      } catch (e) {
        setError(e?.message || "Не удалось загрузить инвентарь");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const loadBalance = useMemo(
    () => async () => {
      const tgId = tgIdRef.current;
      if (!tgId) return;
      try {
        const { data } = await supabase
          .from("users")
          .select("stars, tickets")
          .eq("telegram_id", tgId)
          .single();
        if (data) {
          setBalance({
            stars: Number(data.stars || 0),
            tickets: Number(data.tickets || 0),
          });
        }
      } catch {
        /* noop */
      }
    },
    []
  );

  useEffect(() => {
    loadFx();
    loadInventory();
    loadBalance();
  }, [loadFx, loadInventory, loadBalance]);

  // действия
  async function handleClaim(spin_id) {
    if (isBusy(spin_id)) return;       // защита от дабл-клика
    lock(spin_id);
    try {
      const resp = await postClaim(spin_id);
      if (resp?.status === "reward_sent") {
        setItems((xs) => xs.filter((x) => x.spin_id !== spin_id));
        showToast("Подарок отправлен! 🎁");
        loadBalance();
      }
    } catch (e) {
      setError(e?.message || "Ошибка при выводе приза");
    } finally {
      unlock(spin_id);
    }
  }

  async function handleReroll(item) {
    const spin_id = item.spin_id;
    if (isBusy(spin_id)) return;       // защита от дабл-клика
    lock(spin_id);
    try {
      const resp = await postReroll(spin_id);
      if (resp) {
        setItems((xs) => xs.filter((x) => x.spin_id !== spin_id));
        const baseTon = Number(item.payout_value || item.price || 0);
        const starsAmount = Math.max(
          0,
          Math.ceil(baseTon * (fx.stars_per_ton || 0) * (1 - (fx.fee_markup || 0)))
        );
        showToast(
          starsAmount ? `Успешно зачислено: ${starsAmount} ⭐` : `Успешно зачислено: ${baseTon} TON`
        );
        loadBalance();
      }
    } catch (e) {
      setError(e?.message || "Ошибка при продаже");
    } finally {
      unlock(spin_id);
    }
  }

  // отображаемые балансы
  const displayTickets = (Number(balance.tickets) || 0).toFixed(2);
  const displayStars = Math.floor(Number(balance.stars) || 0);

  return (
    <div className="spins-page" style={{ paddingTop: 56 }}>
      {/* Верхняя панель: Назад слева, балансы справа */}
      <div
        style={{
          position: "fixed",
          top: 12,
          left: 12,
          right: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          zIndex: 1000,
        }}
      >
        <button
          className="inventory-badge"
          onClick={() => navigate(-1)}
          aria-label="Назад"
          style={{ padding: "6px 10px" }}
        >
          ←
        </button>

        <div
          style={{
            position: "fixed",
            top: 12,
            right: 12,
            zIndex: 1000,
            background: "rgba(0,0,0,0.5)",
            borderRadius: 20,
            padding: "6px 12px",
            color: "#fff",
            fontWeight: 700,
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            💎 {displayTickets} TON
          </span>
          <span style={{ opacity: 0.5 }}>•</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            ⭐ {displayStars} Stars
          </span>
        </div>
      </div>

      {/* Контент */}
      <div className="spins-header" style={{ justifyContent: "space-between" }}>
        <div />
        <button className="ghost-btn" onClick={loadInventory}>
          Обновить
        </button>
      </div>

      {loading && <div className="result-banner">Загрузка…</div>}

      {error && !loading && (
        <div className="result-banner" style={{ background: "#3b1e1e", color: "#ffb4b4" }}>
          {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="result-banner">Здесь пусто. Выигрывай призы и решай позже 🙂</div>
      )}

      {!loading && items.length > 0 && (
        <div style={{ display: "grid", gap: 10 }}>
          {items.map((it) => {
            const baseTon = Number(it.payout_value || it.price || 0);
            const starsAmount = Math.max(
              0,
              Math.ceil(baseTon * (fx.stars_per_ton || 0) * (1 - (fx.fee_markup || 0)))
            );
            const exchangeLabel = starsAmount
              ? `Продать за ${starsAmount} ⭐`
              : `Продать за ${baseTon} TON`;
            const busy = isBusy(it.spin_id);

            return (
              <div key={it.spin_id} className="result-banner" style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <img src={`/animations/${it.slug}.png`} alt="" width={40} height={40} />
                  <div style={{ fontWeight: 700 }}>{it.nft_name}</div>
                </div>
                <div className="result-cta">
                  <button className="primary-btn" onClick={() => handleClaim(it.spin_id)} disabled={busy}>
                    Вывести
                  </button>
                  <button className="ghost-btn" onClick={() => handleReroll(it)} disabled={busy}>
                    {busy ? "Обработка…" : exchangeLabel}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Тост */}
      {toast && <div className="spin-toast">{toast.text}</div>}
    </div>
  );
}
