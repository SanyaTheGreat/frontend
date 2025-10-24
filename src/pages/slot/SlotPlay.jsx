import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, useAnimationControls } from "framer-motion";
import { supabase } from "../../supabaseClient";
import "./SlotPlay.css";

const API_BASE = "https://lottery-server-waif.onrender.com";
const asset = (p) => `${import.meta.env.BASE_URL || "/"}${p.replace(/^\/+/, "")}`;

/* -------------------- символы -------------------- */
const SYMBOL_FILES = {
  "🍒": "cherry.png",
  "🍋": "lemon.png",
  "B": "bar.png",
  "7": "seven.png",
};

// нормализация: эмодзи/текст → стандартный ключ
function normalizeSymbol(s) {
  const raw = (s ?? "").toString().trim();
  const low = raw.toLowerCase();

  if (raw === "🍒" || low === "cherry") return "🍒";
  if (raw === "🍋" || low === "lemon")  return "🍋";

  if (raw === "B" || low === "bar" || raw === "🅱️") return "B";
  if (raw === "7" || low === "seven" || raw === "7️⃣") return "7";

  return raw;
}

function iconSrcSafe(s) {
  const key = normalizeSymbol(s);
  const file = SYMBOL_FILES[key];
  return file ? asset(`slot-symbols/${file}`) : null;
}

/* -------------------- helpers -------------------- */
function buildReelWithLeading(currentTop, target, loops = 8, band = Object.keys(SYMBOL_FILES)) {
  // первый элемент = текущий видимый, чтобы не было «скачка» перед анимацией
  const reel = [currentTop];
  const total = loops * band.length;
  for (let i = 1; i < total; i++) {
    reel.push(band[Math.floor(Math.random() * band.length)]);
  }
  reel.push(target); // финишный символ
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

// ждём 1 кадр
const waitFrame = () => new Promise(requestAnimationFrame);

/* -------------------- DEBUG -------------------- */
const T0 = () => performance.now();
const t0 = T0();
const dbg = (...a) => console.log(`[spin ${(T0() - t0).toFixed(0)}ms]`, ...a);

/* ===================================================== */

export default function SlotPlay() {
  const { id: slotId } = useParams();
  const nav = useNavigate();

  const [price, setPrice] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [reels, setReels] = useState([
    ["🍒", "🍋", "B", "7"],
    ["🍒", "🍋", "B", "7"],
    ["🍒", "🍋", "B", "7"],
  ]);
  const [balance, setBalance] = useState({ stars: 0, tickets: 0 });

  // текущие видимые символы (для отсутствия подмены перед спином)
  const currentTopRef = useRef(["🍒", "🍋", "B"]);

  // счётчик спинов — ремоунт reel'ов по key
  const [spinSeq, setSpinSeq] = useState(0);

  const r1 = useAnimationControls();
  const r2 = useAnimationControls();
  const r3 = useAnimationControls();

  const tgIdRef = useRef(resolveTelegramId());

  // подтянуть шаг из CSS-переменной (--reel-item-h)
  const itemHRef = useRef(72);
  useEffect(() => {
    const v = parseInt(
      getComputedStyle(document.documentElement)
        .getPropertyValue("--reel-item-h")
        .trim()
        .replace("px", ""),
      10
    );
    if (!Number.isNaN(v)) itemHRef.current = v;
  }, []);

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

  // длинная прокрутка
  const spinAnim = async (ctrl, itemsCount, extra = 0) => {
    await ctrl.start({ y: 0, transition: { duration: 0 } });
    await ctrl.start({
      y: -(itemHRef.current) * (itemsCount - 1),
      transition: { duration: 1.2 + extra, ease: [0.12, 0.45, 0.15, 1] },
    });
  };

  const doSpin = async () => {
    dbg("click");
    if (spinning || spinLockRef.current) return;
    if (!tgIdRef.current) {
      alert("Не найден Telegram ID.");
      return;
    }

    setResult(null);
    setSpinning(true);
    spinLockRef.current = true;

    // стопаем любые текущие анимации (НЕ сбрасываем y:0 тут!)
    r1.stop(); r2.stop(); r3.stop();

    let data;
    const idem = lastIdemRef.current || randomUUID();
    lastIdemRef.current = idem;

    try {
      dbg("fetch start", idem);
      const res = await fetchWithTimeout(
        `${API_BASE}/api/slots/spin`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ slot_id: slotId, idempotency_key: idem }),
          credentials: "include",
        },
        18000
      );

      dbg("fetch done", res.status);
      const body = await res.json().catch(() => ({}));
      dbg("json parsed", Object.keys(body || {}).length);

      if (res.status === 401) { dbg("401"); alert("Сессия истекла"); nav("/auth"); return; }
      if (res.status === 402) { dbg("402"); alert("Не хватает ⭐"); return; }
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      data = body;
    } catch (e) {
      dbg("fetch error", e?.message);
      alert(e?.message || "Ошибка спина");
      return;
    } finally {
      if (!data) lastIdemRef.current = null;
    }

    // нормализуем символы из бэка
    dbg("prepare symbols (normalize)", data.symbols);
    const tL = normalizeSymbol(data.symbols?.l ?? "🍒");
    const tM = normalizeSymbol(data.symbols?.m ?? "🍋");
    const tR = normalizeSymbol(data.symbols?.r ?? "B");

    // текущие видимые символы — чтобы не было скачка
    const [cL, cM, cR] = currentTopRef.current;

    const reel1 = buildReelWithLeading(cL, tL, 9);
    const reel2 = buildReelWithLeading(cM, tM, 10);
    const reel3 = buildReelWithLeading(cR, tR, 11);
    setReels([reel1, reel2, reel3]);
    dbg("setReels with leading currentTop");

    // ремоунт reel'ов (чистый старт анимаций)
    setSpinSeq((n) => n + 1);

    // дать React/DOM обновиться
    await waitFrame();
    await waitFrame();

    // длинная прокрутка
    try {
      dbg("anim1 start");
      await Promise.all([
        spinAnim(r1, reel1.length, 0.0),
        spinAnim(r2, reel2.length, 0.2),
        spinAnim(r3, reel3.length, 0.35),
      ]);
      dbg("anim1 done");
    } catch (e) {
      console.error("❌ anim1 failed:", e);
    }

    // пружинка (с относительными шагами к itemH)
    try {
      dbg("anim2 start");
      const bump1 = Math.round(itemHRef.current * 0.12);
      const bump2 = Math.round(itemHRef.current * 0.10);
      const bump3 = Math.round(itemHRef.current * 0.08);

      await Promise.all([
        r1.start({ y: `+=${bump1}`, transition: { duration: 0.1, ease: "easeOut" } }),
        r2.start({ y: `+=${bump2}`, transition: { duration: 0.1, ease: "easeOut" } }),
        r3.start({ y: `+=${bump3}`, transition: { duration: 0.1, ease: "easeOut" } }),
      ]);
      await Promise.all([
        r1.start({ y: `-=${bump1}`, transition: { duration: 0.12, ease: "easeIn" } }),
        r2.start({ y: `-=${bump2}`, transition: { duration: 0.12, ease: "easeIn" } }),
        r3.start({ y: `-=${bump3}`, transition: { duration: 0.12, ease: "easeIn" } }),
      ]);
      dbg("anim2 done");
    } catch (e) {
      console.error("❌ anim2 failed:", e);
    }

    // зафиксировать финальное состояние лент (убираем «подмену» перед следующим спином)
    setReels([[tL], [tM], [tR]]);
    setSpinSeq((n) => n + 1);
    currentTopRef.current = [tL, tM, tR];
    await waitFrame();

    setResult({ status: data.status, prize: data.prize, symbols: { l: tL, m: tM, r: tR } });
    dbg("setResult", data.status, data.prize);
    await loadBalance();
    dbg("balance updated");

    lastIdemRef.current = null;
    setSpinning(false);
    spinLockRef.current = false;
    dbg("done, UI unlocked");
  };

  const goBack = () => nav(-1);

  const displayTickets = (Number(balance.tickets) || 0).toFixed(2);
  const displayStars = Math.floor(Number(balance.stars) || 0);

  return (
    <div className="slotplay-wrapper">
      {/* Верхняя панель */}
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
              <motion.div
                key={`reel-${i}-${spinSeq}`}
                className="reel"
                animate={i === 0 ? r1 : i === 1 ? r2 : r3}
                initial={false}
              >
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
            // страховка на случай любого неожиданного исключения
            setSpinning(false);
            spinLockRef.current = false;
            dbg("finally from button — force unlock");
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
