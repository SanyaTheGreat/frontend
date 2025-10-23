import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, useAnimationControls } from "framer-motion";
import { supabase } from "../../supabaseClient";
import "./SlotPlay.css";

const API_BASE = "https://lottery-server-waif.onrender.com";
const asset = (p) => `${import.meta.env.BASE_URL || "/"}${p.replace(/^\/+/, "")}`;

const SYMBOL_MAP = { "🍒": "cherry", "🍋": "lemon", B: "bar", 7: "seven" };
const ICONS = ["🍒", "🍋", "B", "7"];

const iconSrc = (s) => asset(`slot-symbols/${SYMBOL_MAP[s]}.png`);
const frameSrc = asset("slot-assets/machine.png");

// ===== helpers =====
function buildReel(target, loops = 8, band = ICONS) {
  const reel = [];
  const total = loops * band.length;
  for (let i = 0; i < total; i++) reel.push(band[Math.floor(Math.random() * band.length)]);
  reel.push(target);
  return reel;
}
function decodeJwtTelegramId() {
  try {
    const jwt = localStorage.getItem("jwt");
    if (!jwt) return null;
    const [, payloadB64] = jwt.split(".");
    if (!payloadB64) return null;
    const json = JSON.parse(
      decodeURIComponent(escape(window.atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"))))
    );
    return json?.telegram_id || json?.tg_id || json?.user?.telegram_id || null;
  } catch {
    return null;
  }
}
function resolveTelegramId() {
  const fromJwt = decodeJwtTelegramId();
  const fromTg = window?.Telegram?.WebApp?.initDataUnsafe?.user?.id || null;
  const queryId = new URLSearchParams(window.location.search).get("tgid");
  const storedId = localStorage.getItem("tgid") || null;
  if (queryId && queryId !== storedId) localStorage.setItem("tgid", queryId);
  return fromJwt || fromTg || queryId || storedId || null;
}
function authHeaders() {
  const token = localStorage.getItem("jwt");
  return token ? { Authorization: `Bearer ${token}` } : {};
}
function randomUUID() {
  return (crypto?.randomUUID?.() ||
    ([1e7]+-1e3+-4e3+-8e3+-1e11)
      .replace(/[018]/g, (c) =>
        (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
      ));
}
async function fetchWithTimeout(url, opts = {}, ms = 18000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

export default function SlotPlay() {
  const { id: slotId } = useParams();
  const nav = useNavigate();

  const [price, setPrice] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [reels, setReels] = useState([ICONS, ICONS, ICONS]);
  const [balance, setBalance] = useState({ stars: 0, tickets: 0 });

  const r1 = useAnimationControls();
  const r2 = useAnimationControls();
  const r3 = useAnimationControls();

  const tgIdRef = useRef(resolveTelegramId());
  const itemH = 72;

  // загрузка цены
  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/slots/active`);
        const data = await res.json();
        const found = (data || []).find((s) => String(s.id) === String(slotId));
        if (!abort) setPrice(found?.price ?? 0);
      } catch (e) {
        console.warn("[SlotPlay] load price error", e);
      }
    })();
    return () => {
      abort = true;
    };
  }, [slotId]);

  // загрузка баланса (как в Spin/Inventory)
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
        if (data) setBalance({ stars: Number(data.stars || 0), tickets: Number(data.tickets || 0) });
      } catch (e) {
        console.warn("[SlotPlay] load balance error", e);
      }
    },
    []
  );
  useEffect(() => {
    loadBalance();
  }, [loadBalance]);

  // анимация
  const spinAnim = async (ctrl, itemsCount, extra = 0) => {
    await ctrl.start({ y: 0, transition: { duration: 0 } });
    await ctrl.start({
      y: -itemH * (itemsCount - 1),
      transition: { duration: 1.2 + extra, ease: [0.12, 0.45, 0.15, 1] },
    });
  };

  // основной спин с таймаутом и идемпотентностью
  const doSpin = async () => {
    if (spinning) return;
    if (!tgIdRef.current) {
      alert("Не найден Telegram ID. Открой Mini App в Telegram или авторизуйся заново.");
      return;
    }

    setResult(null);
    setSpinning(true);

    let data;
    const idem = randomUUID(); // ключ для безопасного ретрая на бэке
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/slots/spin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ slot_id: slotId, idempotency_key: idem }),
        credentials: "include",
      }, 18000);

      // если упали по таймауту — бросим осмысленную ошибку
      if (!res) throw new Error("No response");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);

      data = body;
    } catch (e) {
      setSpinning(false);
      alert(e.message === "The user aborted a request." ? "Сеть медленная. Попробуйте ещё раз." : (e.message || "Ошибка спина"));
      return;
    }

    const tL = data.symbols?.l ?? ICONS[0];
    const tM = data.symbols?.m ?? ICONS[1];
    const tR = data.symbols?.r ?? ICONS[2];

    const reel1 = buildReel(tL, 9);
    const reel2 = buildReel(tM, 10);
    const reel3 = buildReel(tR, 11);
    setReels([reel1, reel2, reel3]);

    await Promise.all([
      spinAnim(r1, reel1.length, 0.0),
      spinAnim(r2, reel2.length, 0.2),
      spinAnim(r3, reel3.length, 0.35),
    ]);

    await Promise.all([
      r1.start({ y: "+=12", transition: { duration: 0.1, ease: "easeOut" } }),
      r2.start({ y: "+=10", transition: { duration: 0.1, ease: "easeOut" } }),
      r3.start({ y: "+=8", transition: { duration: 0.1, ease: "easeOut" } }),
      r1.start({ y: "-=12", transition: { duration: 0.12, ease: "easeIn" } }),
      r2.start({ y: "-=10", transition: { duration: 0.12, ease: "easeIn" } }),
      r3.start({ y: "-=8", transition: { duration: 0.12, ease: "easeIn" } }),
    ]);

    setResult({ status: data.status, prize: data.prize, symbols: data.symbols });
    setSpinning(false);
    loadBalance(); // обновить баланс после списания/приза
  };

  const goBack = () => nav(-1);

  const displayTickets = (Number(balance.tickets) || 0).toFixed(2);
  const displayStars = Math.floor(Number(balance.stars) || 0);

  return (
    <div className="slotplay-wrapper">
      {/* Верхняя панель: назад и баланс справа */}
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
        <button className="back-btn" onClick={goBack} aria-label="Назад">←</button>
        <div className="slot-title">Слот #{String(slotId).slice(0, 6)}</div>

        <div
          style={{
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
          <span>💎 {displayTickets} TON</span>
          <span style={{ opacity: 0.5 }}>•</span>
          <span>⭐ {displayStars}</span>
        </div>
      </div>

      <div className="machine-wrapper">
        <img src={frameSrc} alt="slot-machine" className="machine-frame" />
        <div className="machine-body">
          {[0, 1, 2].map((i) => (
            <div className="window" key={i}>
              <motion.div className="reel" animate={i === 0 ? r1 : i === 1 ? r2 : r3} style={{ y: 0 }}>
                {reels[i].map((sym, idx) => (
                  <div className="reel-item" key={`${i}-${idx}`}>
                    <img src={iconSrc(sym)} alt={sym} draggable="false" />
                  </div>
                ))}
              </motion.div>
            </div>
          ))}
        </div>
      </div>

      <button className="spin-btn" onClick={doSpin} disabled={spinning}>
        {spinning ? "КРУТИМ…" : `КРУТИТЬ ЗА ${price} ⭐`}
      </button>

      {result && (
        <div className={`result ${result.status}`}>
          {result.status === "lose" && "Пусто 😔"}
          {result.status === "win_stars" && `+${result.prize?.amount ?? ""}⭐`}
          {result.status === "win_gift" && "Подарок в инвентарь 🎁"}
        </div>
      )}
    </div>
  );
}
