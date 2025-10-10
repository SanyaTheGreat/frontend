import React, { useEffect, useMemo, useRef, useState } from "react";
import { fetchInventory, getTelegramId, postClaim, postReroll } from "./spinsApi";
import { supabase } from "../../supabaseClient"; // как у тебя в проекте
import "./spins.css";

export default function InventoryPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null); // {text}
  const tgIdRef = useRef(getTelegramId());

  // курсы для подсчёта "продать на N"
  const [fx, setFx] = useState({ stars_per_ton: 0, fee_markup: 0 });

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("fx_rates")
          .select("stars_per_ton, fee_markup")
          .eq("id", 1)
          .maybeSingle();
        if (!error && data) {
          setFx({
            stars_per_ton: Number(data.stars_per_ton || 0),
            fee_markup: Number(data.fee_markup || 0),
          });
        }
      } catch (e) {
        // не критично
      }
    })();
  }, []);

  const loadInventory = useMemo(
    () => async () => {
      setLoading(true);
      setError("");
      try {
        const list = await fetchInventory(tgIdRef.current);
        setItems(list);
      } catch (e) {
        setError(e.message || "Не удалось загрузить инвентарь");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  function showToast(text) {
    setToast({ text });
    setTimeout(() => setToast(null), 2000);
  }

  async function handleClaim(spin_id) {
    try {
      const resp = await postClaim(spin_id);
      if (resp?.status === "reward_sent") {
        setItems((xs) => xs.filter((x) => x.spin_id !== spin_id));
        showToast("Подарок отправлен! 🎁");
      }
    } catch (e) {
      setError(e.message || "Ошибка при выводе приза");
    }
  }

  async function handleReroll(item) {
    try {
      const resp = await postReroll(item.spin_id);
      if (resp) {
        setItems((xs) => xs.filter((x) => x.spin_id !== item.spin_id));
        const baseTon = Number(item.payout_value || item.price || 0);
        const starsAmount = Math.max(
          0,
          Math.ceil(baseTon * (fx.stars_per_ton || 0) * (1 - (fx.fee_markup || 0)))
        );
        showToast(`Успешно обменяли на ${starsAmount || baseTon} ${starsAmount ? "⭐" : "TON"}`);
      }
    } catch (e) {
      setError(e.message || "Ошибка при продаже");
    }
  }

  return (
    <div className="spins-page" style={{ paddingTop: 8 }}>
      <div className="spins-header" style={{ justifyContent: "space-between" }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>Инвентарь</div>
        <button className="ghost-btn" onClick={loadInventory}>Обновить</button>
      </div>

      {loading && <div className="result-banner">Загрузка…</div>}
      {error && (
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
            const exchangeLabel = starsAmount ? `Продать за ${starsAmount} ⭐` : `Продать за ${baseTon} TON`;

            return (
              <div key={it.spin_id} className="result-banner" style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <img src={`/animations/${it.slug}.png`} alt="" width={40} height={40} />
                  <div style={{ fontWeight: 700 }}>{it.nft_name}</div>
                </div>
                <div className="result-cta">
                  <button className="primary-btn" onClick={() => handleClaim(it.spin_id)}>
                    Вывести
                  </button>
                  <button className="ghost-btn" onClick={() => handleReroll(it)}>
                    {exchangeLabel}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {toast && <div className="spin-toast">{toast.text}</div>}
    </div>
  );
}
