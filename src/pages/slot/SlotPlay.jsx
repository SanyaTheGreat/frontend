import { useEffect, useMemo, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, useAnimationControls } from "framer-motion";
import { supabase } from "../../supabaseClient";
import "./SlotPlay.css";

const SYMBOL_MAP = { "🍒": "cherry", "🍋": "lemon", "B": "bar", "7": "seven" };
const ICONS = ["🍒", "🍋", "B", "7"];

const iconName = (s) => SYMBOL_MAP[s] ?? "cherry";
const iconSrcSvg = (s) => `/slot-symbols/${iconName(s)}.svg`;
const iconSrcPng = (s) => `/slot-symbols/${iconName(s)}.png`;

function buildReel(target, loops = 8, band = ICONS) {
  const reel = [];
  const total = loops * band.length;
  for (let i = 0; i < total; i++) reel.push(band[Math.floor(Math.random() * band.length)]);
  reel.push(target);
  return reel;
}

function makeIdem() {
  try { return crypto.randomUUID(); } catch {}
  const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
  return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
}

export default function SlotPlay() {
  const { id: slotId } = useParams();
  const nav = useNavigate();

  const [price, setPrice] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [reels, setReels] = useState([ICONS, ICONS, ICONS]);
  const [stars, setStars] = useState(null);

  const r1 = useAnimationControls();
  const r2 = useAnimationControls();
  const r3 = useAnimationControls();
  const leverCtrl = useAnimationControls(); // 🔴 рычаг

  const ITEM_H = 72;
  const winGlow = result?.status === "win_gift" || result?.status === "win_stars";

  // ====== telegram_id (как в InventoryPage) ======
  function decodeJwtTelegramId() {
    try {
      const jwt = localStorage.getItem("jwt"); if (!jwt) return null;
      const [, payloadB64] = jwt.split("."); if (!payloadB64) return null;
      const json = JSON.parse(decodeURIComponent(escape(window.atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")))));
      return json?.telegram_id || json?.tg_id || json?.user?.telegram_id || null;
    } catch { return null; }
  }
  const jwtTelegramId = decodeJwtTelegramId();
  const tgApiId = window?.Telegram?.WebApp?.initDataUnsafe?.user?.id || null;
  const queryId = new URLSearchParams(window.location.search).get("tgid");
  const storedId = window.localStorage.getItem("tgid") || null;
  if (queryId && queryId !== storedId) window.localStorage.setItem("tgid", queryId);
  const effectiveId = jwtTelegramId || tgApiId || queryId || storedId || null;

  const loadStars = useMemo(() => async () => {
    if (!effectiveId) return;
    try {
      const { data } = await supabase.from("users").select("stars").eq("telegram_id", effectiveId).single();
      if (data) setStars(Math.floor(Number(data.stars || 0)));
    } catch {}
  }, [effectiveId]);

  useEffect(() => { loadStars(); }, [loadStars]);

  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        const res = await fetch("https://lottery-server-waif.onrender.com/api/slots/active");
        const data = await res.json();
        const found = (data || []).find((s) => String(s.id) === String(slotId));
        if (!abort) setPrice(found?.price ?? 0);
      } catch {}
    })();
    return () => { abort = true; };
  }, [slotId]);

  // преспин (пока ждём сервер)
  const startPreSpin = () => {
    const distance = ITEM_H * 6;
    const cfg = { y: [0, -distance], transition: { duration: 0.55, ease: "linear", repeat: Infinity } };
    r1.start(cfg);
    r2.start({ ...cfg, transition: { ...cfg.transition, duration: 0.5 } });
    r3.start({ ...cfg, transition: { ...cfg.transition, duration: 0.45 } });
  };
  const stopPreSpin = async () => {
    await Promise.all([
      r1.start({ y: 0, transition: { duration: 0 } }),
      r2.start({ y: 0, transition: { duration: 0 } }),
      r3.start({ y: 0, transition: { duration: 0 } }),
    ]);
  };
  const finalSpin = async (ctrl, itemsCount, extra = 0) => {
    const duration = 1.25 + extra;
    await ctrl.start({ y: -ITEM_H * (itemsCount - 1), transition: { duration, ease: [0.12, 0.45, 0.15, 1] } });
  };

  const pullLever = async () => {
    // анимация рычага: вниз → вверх
    await leverCtrl.start({ rotate: 28, transition: { duration: 0.18, ease: "easeOut" } });
    await leverCtrl.start({ rotate: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } });
  };

  const doSpin = async () => {
    if (spinning) return;
    setResult(null);
    setSpinning(true);

    // визуал
    pullLever();
    startPreSpin();

    // запрос
    let data;
    const idem = makeIdem();
    try {
      const token = localStorage.getItem("jwt");
      const res = await fetch("https://lottery-server-waif.onrender.com/api/slots/spin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: JSON.stringify({ slot_id: slotId, idempotency_key: idem }),
      });
      data = await res.json();
      if (!res.ok) throw new Error(data?.error || "spin error");
    } catch (e) {
      await stopPreSpin();
      setSpinning(false);
      alert(e.message || "Ошибка спина");
      loadStars();
      return;
    }

    // таргеты
    const tL = data.symbols?.l ?? ICONS[0];
    const tM = data.symbols?.m ?? ICONS[1];
    const tR = data.symbols?.r ?? ICONS[2];

    // ленты
    const reel1 = buildReel(tL, 9);
    const reel2 = buildReel(tM, 10);
    const reel3 = buildReel(tR, 11);
    setReels([reel1, reel2, reel3]);

    // финал
    await stopPreSpin();
    await finalSpin(r1, reel1.length, 0.0);
    await new Promise(r => setTimeout(r, 120));
    await finalSpin(r2, reel2.length, 0.15);
    await new Promise(r => setTimeout(r, 120));
    await finalSpin(r3, reel3.length, 0.25);

    // bounce
    await Promise.all([
      r1.start({ y: `+=${10}`, transition: { duration: 0.09, ease: "easeOut" } }),
      r2.start({ y: `+=${9}`, transition: { duration: 0.09, ease: "easeOut" } }),
      r3.start({ y: `+=${8}`, transition: { duration: 0.09, ease: "easeOut" } }),
      r1.start({ y: `-=${10}`, transition: { duration: 0.11, ease: "easeIn" } }),
      r2.start({ y: `-=${9}`, transition: { duration: 0.11, ease: "easeIn" } }),
      r3.start({ y: `-=${8}`, transition: { duration: 0.11, ease: "easeIn" } }),
    ]);

    setResult({ status: data.status, prize: data.prize, symbols: data.symbols });

    if (typeof data?.balance_after === "number") setStars(Math.floor(data.balance_after));
    else loadStars();

    setSpinning(false);
  };

  const goBack = () => nav(-1);

  return (
    <div className="slotplay-wrapper">
      <div className="slotplay-top">
        <button className="back-btn" onClick={goBack}>← Назад</button>
        <div className="slot-title">Слот #{String(slotId).slice(0, 6)}</div>
        <div className="top-right"><span className="stars-chip">{stars === null ? "—" : stars} ⭐</span></div>
      </div>

      {/* корпус автомата — фон с прозрачностью */}
      <div
        className={`machine ${winGlow ? "machine-win" : ""}`}
        style={{
          backgroundImage: "url('/slot-assets/machine.png')",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center top",
          backgroundSize: "contain",
        }}
      >
        {/* 🔴 рычаг (оверлей), крутится при спине */}
        <motion.div className="lever" animate={leverCtrl} />

        {/* окна внутри корпуса */}
        <div className="machine-windows">
          {[0, 1, 2].map((i) => (
            <div className="window" key={i}>
              <motion.div className="reel" animate={i === 0 ? r1 : i === 1 ? r2 : r3} style={{ y: 0 }}>
                {reels[i].map((sym, idx) => (
                  <div className="reel-item" key={`${i}-${idx}`}>
                    <img
                      src={iconSrcSvg(sym)}
                      alt={sym}
                      draggable="false"
                      onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = iconSrcPng(sym); }}
                    />
                  </div>
                ))}
              </motion.div>
              <div className="glass" />
            </div>
          ))}
          <div className="shine" />
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
