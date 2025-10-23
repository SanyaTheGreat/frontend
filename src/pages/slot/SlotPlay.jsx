import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, useAnimationControls } from "framer-motion";
import "./SlotPlay.css";

const SYMBOL_MAP = { "🍒": "cherry", "🍋": "lemon", "B": "bar", "7": "seven" };
const ICONS = ["🍒", "🍋", "B", "7"]; // базовая лента

// утилита: создать длинную ленту с рандомом и финальным таргетом
function buildReel(target, loops = 8, band = ICONS) {
  const reel = [];
  const perLoop = band.length;
  const total = loops * perLoop;
  for (let i = 0; i < total; i++) {
    reel.push(band[Math.floor(Math.random() * band.length)]);
  }
  // финальный видимый символ — target
  reel.push(target);
  return reel;
}
const iconSrc = (s) => `/slot-symbols/${SYMBOL_MAP[s]}.svg`;

export default function SlotPlay() {
  const { id: slotId } = useParams();
  const nav = useNavigate();

  const [price, setPrice] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null); // { status, prize, symbols }
  const [reels, setReels] = useState([ICONS, ICONS, ICONS]);

  const r1 = useAnimationControls();
  const r2 = useAnimationControls();
  const r3 = useAnimationControls();

  const itemH = 72; // высота одной иконки (совпадает с CSS)
  const winGlow = result?.status === "win_gift" || result?.status === "win_stars";

  // подгружаем цену спина для UI
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

  // плавный скролл: считает итоговый offset (в пикселях)
  const spinAnim = async (ctrl, itemsCount, extra = 0) => {
    // старт с нуля
    await ctrl.start({ y: 0, transition: { duration: 0 } });
    // большая прокрутка (инерция)
    const duration = 1.2 + extra; // каждый следующий чуть дольше
    await ctrl.start({
      y: -itemH * (itemsCount - 1),
      transition: {
        duration,
        ease: [0.12, 0.45, 0.15, 1], // реалистичное ускорение/торможение
      },
    });
  };

  const doSpin = async () => {
    if (spinning) return;
    setResult(null);
    setSpinning(true);

    // API
    let data;
    try {
      const token = localStorage.getItem("jwt");
      const res = await fetch("https://lottery-server-waif.onrender.com/api/slots/spin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({ slot_id: slotId }),
      });
      data = await res.json();
      if (!res.ok) throw new Error(data?.error || "spin error");
    } catch (e) {
      setSpinning(false);
      return alert(e.message || "Ошибка спина");
    }

    // таргеты для трёх барабанов
    const tL = data.symbols?.l ?? ICONS[0];
    const tM = data.symbols?.m ?? ICONS[1];
    const tR = data.symbols?.r ?? ICONS[2];

    // собираем длинные ленты с нужными финалами
    const reel1 = buildReel(tL, 9);
    const reel2 = buildReel(tM, 10);
    const reel3 = buildReel(tR, 11);
    setReels([reel1, reel2, reel3]);

    // запускаем анимации с разной длительностью
    await Promise.all([
      spinAnim(r1, reel1.length, 0.0),
      spinAnim(r2, reel2.length, 0.2),
      spinAnim(r3, reel3.length, 0.35),
    ]);

    // лёгкий “bounce” (реализм)
    await Promise.all([
      r1.start({ y: `+=${12}`, transition: { duration: 0.1, ease: "easeOut" } }),
      r2.start({ y: `+=${10}`, transition: { duration: 0.1, ease: "easeOut" } }),
      r3.start({ y: `+=${8}`, transition: { duration: 0.1, ease: "easeOut" } }),
      r1.start({ y: `-=${12}`, transition: { duration: 0.12, ease: "easeIn" } }),
      r2.start({ y: `-=${10}`, transition: { duration: 0.12, ease: "easeIn" } }),
      r3.start({ y: `-=${8}`, transition: { duration: 0.12, ease: "easeIn" } }),
    ]);

    setResult({
      status: data.status, // lose | win_stars | win_gift
      prize: data.prize,
      symbols: data.symbols,
    });
    setSpinning(false);
  };

  const goBack = () => nav(-1);

  return (
    <div className="slotplay-wrapper">
      <div className="slotplay-top">
        <button className="back-btn" onClick={goBack}>← Назад</button>
        <div className="slot-title">Слот #{String(slotId).slice(0, 6)}</div>
        <div className="price-chip">{price} ⭐</div>
      </div>

      <div className={`machine ${winGlow ? "machine-win" : ""}`}>
        {/* рамка-кеис */}
        <div className="machine-head" />
        <div className="machine-body">
          {/* окна */}
          {[0, 1, 2].map((i) => (
            <div className="window" key={i}>
              <motion.div
                className="reel"
                animate={i === 0 ? r1 : i === 1 ? r2 : r3}
                style={{ y: 0 }}
              >
                {reels[i].map((sym, idx) => (
                  <div className="reel-item" key={`${i}-${idx}`}>
                    <img src={iconSrc(sym)} alt={sym} draggable="false" />
                  </div>
                ))}
              </motion.div>
              <div className="glass" />
            </div>
          ))}
          {/* shine */}
          <div className="shine" />
        </div>
        <div className="machine-foot" />
      </div>

      <button
        className="spin-btn"
        onClick={doSpin}
        disabled={spinning}
      >
        {spinning ? "КРУТИМ…" : `КРУТИТЬ ЗА ${price} ⭐`}
      </button>

      {/* Результат */}
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
