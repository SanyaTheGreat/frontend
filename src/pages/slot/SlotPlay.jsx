import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, useAnimationControls } from "framer-motion";
import "./SlotPlay.css";

// корректные пути под твою структуру public/
const asset = (p) => `${import.meta.env.BASE_URL || "/"}${p.replace(/^\/+/, "")}`;

const SYMBOL_MAP = { "🍒": "cherry", "🍋": "lemon", "B": "bar", "7": "seven" };
const ICONS = ["🍒", "🍋", "B", "7"];

const iconSrc = (s) => asset(`slot-symbols/${SYMBOL_MAP[s]}.png`);
const frameSrc = asset("slot-assets/machine.png");

// генерим ленту для барабана
function buildReel(target, loops = 8, band = ICONS) {
  const reel = [];
  const perLoop = band.length;
  const total = loops * perLoop;
  for (let i = 0; i < total; i++) {
    reel.push(band[Math.floor(Math.random() * band.length)]);
  }
  reel.push(target);
  return reel;
}

export default function SlotPlay() {
  const { id: slotId } = useParams();
  const nav = useNavigate();

  const [price, setPrice] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [reels, setReels] = useState([ICONS, ICONS, ICONS]);

  const r1 = useAnimationControls();
  const r2 = useAnimationControls();
  const r3 = useAnimationControls();

  const itemH = 72;

  // грузим цену
  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        const res = await fetch("https://lottery-server-waif.onrender.com/api/slots/active");
        const data = await res.json();
        const found = (data || []).find((s) => String(s.id) === String(slotId));
        if (!abort) setPrice(found?.price ?? 0);
      } catch (e) {
        console.warn("load price error", e);
      }
    })();
    return () => {
      abort = true;
    };
  }, [slotId]);

  const spinAnim = async (ctrl, itemsCount, extra = 0) => {
    await ctrl.start({ y: 0, transition: { duration: 0 } });
    const duration = 1.2 + extra;
    await ctrl.start({
      y: -itemH * (itemsCount - 1),
      transition: {
        duration,
        ease: [0.12, 0.45, 0.15, 1],
      },
    });
  };

  const doSpin = async () => {
    if (spinning) return;
    setResult(null);
    setSpinning(true);

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
      r1.start({ y: `+=${12}`, transition: { duration: 0.1, ease: "easeOut" } }),
      r2.start({ y: `+=${10}`, transition: { duration: 0.1, ease: "easeOut" } }),
      r3.start({ y: `+=${8}`, transition: { duration: 0.1, ease: "easeOut" } }),
      r1.start({ y: `-=${12}`, transition: { duration: 0.12, ease: "easeIn" } }),
      r2.start({ y: `-=${10}`, transition: { duration: 0.12, ease: "easeIn" } }),
      r3.start({ y: `-=${8}`, transition: { duration: 0.12, ease: "easeIn" } }),
    ]);

    setResult({
      status: data.status,
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

      <div className="machine-wrapper">
        <img src={frameSrc} alt="slot-machine" className="machine-frame" />

        <div className="machine-body">
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
