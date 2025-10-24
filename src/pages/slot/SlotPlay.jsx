import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, useAnimationControls } from "framer-motion";
import { supabase } from "../../supabaseClient";
import "./SlotPlay.css";

const API_BASE = "https://lottery-server-waif.onrender.com";
const asset = (p) => `${import.meta.env.BASE_URL || "/"}${p.replace(/^\/+/, "")}`;

// ==== эмодзи и соответствия ====
const SYMBOL_FILES = {
  "🍒": "cherry.png",
  "🍋": "lemon.png",
  "B": "bar.png",
  "7": "seven.png",
};

// нормализация: превращаем эмодзи и текстовые формы в стандартный ключ
function normalizeSymbol(s) {
  const raw = (s ?? "").toString().trim();
  const low = raw.toLowerCase();

  if (raw === "🍒" || low === "cherry") return "🍒";
  if (raw === "🍋" || low === "lemon") return "🍋";

  // оба варианта твоего B
  if (raw === "B" || low === "bar" || raw === "🅱️") return "B";

  // все формы 7
  if (raw === "7" || low === "seven" || raw === "7️⃣") return "7";

  return raw;
}

// безопасный выбор src с fallback
function iconSrcSafe(s) {
  const key = normalizeSymbol(s);
  const file = SYMBOL_FILES[key];
  return file ? asset(`slot-symbols/${file}`) : null;
}

// ===== утилиты =====
function buildReel(target, loops = 8, band = Object.keys(SYMBOL_FILES)) {
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
  return (
    crypto?.randomUUID?.() ||
    ([1e7] + -1e3 + -4e3 + -8e3 + -1e11)
      .replace(/[018]/g, (c) =>
        (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
      )
  );
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
  const [reels, setReels] = useState([["🍒", "🍋", "B", "7"], ["🍒", "🍋", "B", "7"], ["🍒", "🍋", "B", "7"]]);
  const [balance, setBalance] = useState({ stars: 0, tickets: 0 });

  const r1 = useAnimationControls();
  const r2 = useAnimationControls();
  const r3 = useAnimationControls();

  const tgIdRef = useRef(resolveTelegramId());
  const itemH = 120;
  const spinLockRef = useRef(false);
  const lastIdemRef = useRef(null);

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

  // загрузка баланса
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

  const spinAnim = async (ctrl, itemsCount, extra = 0) => {
    await ctrl.start({ y: 0, transition: { duration: 0 } });
    await ctrl.start({
      y: -itemH * (itemsCount - 1),
      transition: { duration: 1.2 + extra, ease: [0.12, 0.45, 0.15, 1] },
    });
  };

  const doSpin = async () => {
    if (spinning || spinLockRef.current) return;
    if (!tgIdRef.current) {
      alert("Не найден Telegram ID. Открой Mini App в Telegram или авторизуйся заново.");
      return;
    }

    setResult(null);
    setSpinning(true);
    spinLockRef.current = true;

    let data;
    const idem = lastIdemRef.current || randomUUID();
    lastIdemRef.current = idem;

    try {
      const res = await fetchWithTimeout(
        `${API_BASE}/api/slots/spin`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
          body: JSON.stringify({ slot_id: slotId, idempotency_key: idem }),
          credentials: "include",
        },
        18000
      );

      const status = res?.status ?? 0;
      const body = await res.json().catch(() => ({}));

      if (status === 401) {
        alert("Сессия истекла. Войдите заново.");
        nav("/auth");
        return;
      }
      if (status === 402) {
        alert("Не хватает ⭐. Пополните баланс.");
        return;
      }
      if (!res.ok) throw new Error(body?.error || `HTTP ${status}`);

      data = body;
    } catch (e) {
      alert(e?.name === "AbortError" ? "Сеть медленная. Попробуйте ещё раз." : e?.message || "Ошибка спина");
      return;
    } finally {
      if (!data) lastIdemRef.current = null;
    }

    const tL = normalizeSymbol(data.symbols?.l ?? "🍒");
    const tM = normalizeSymbol(data.symbols?.m ?? "🍋");
    const tR = normalizeSymbol(data.symbols?.r ?? "B");

    const reel1 = buildReel(tL, 9);
    const reel2 = buildReel(tM, 10);
    const reel3 = buildReel(tR, 11);
    setReels([reel1, reel2, reel3]);

    try {
      await Promise.all([
        spinAnim(r1, reel1.length, 0.0),
        spinAnim(r2, reel2.length, 0.2),
        spinAnim(r3, reel3.length, 0.35),
      ]);
    } catch (e) {
      console.error("❌ spinAnim phase1 failed:", e);
    }

    setResult({ status: data.status, prize: data.prize, symbols: data.symbols });
    await loadBalance();

    lastIdemRef.current = null;
  };

  const goBack = () => nav(-1);

  const displayTickets = (Number(balance.tickets) || 0).toFixed(2);
  const displayStars = Math.floor(Number(balance.stars) || 0);

  return (
    <div className="slotplay-wrapper">
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
        <img src={asset("slot-assets/machine.png")} alt="slot-machine" className="machine-frame" />
        <div className="machine-body">
          {[0, 1, 2].map((i) => (
            <div className="window" key={i}>
              <motion.div className="reel" animate={i === 0 ? r1 : i === 1 ? r2 : r3} style={{ y: 0 }}>
                {reels[i].map((sym, idx) => {
                  const src = iconSrcSafe(sym);
                  return (
                    <div className="reel-item" key={`${i}-${idx}`}>
                      {src ? (
                        <img
                          src={src}
                          alt={String(sym)}
                          draggable="false"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = asset("slot-symbols/fallback.png");
                          }}
                        />
                      ) : (
                        <span style={{ fontSize: 48, lineHeight: 1 }}>{String(sym)}</span>
                      )}
                    </div>
                  );
                })}
              </motion.div>
            </div>
          ))}
        </div>
      </div>

      <button
        className="spin-btn"
        onClick={async () => {
          try {
            await doSpin();
          } finally {
            setSpinning(false);
            spinLockRef.current = false;
          }
        }}
        disabled={spinning || spinLockRef.current}
      >
        {spinning || spinLockRef.current ? "КРУТИМ…" : `КРУТИТЬ ЗА ${price} ⭐`}
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
