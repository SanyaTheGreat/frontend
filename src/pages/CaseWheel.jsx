import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * CaseSpin.jsx — single-file screen for case wheel
 * - Fetches cases and chances
 * - Renders percent-based SVG wheel
 * - Spin via /api/case/spin, Claim & Reroll actions
 * - Tailwind-first styling + a few custom CSS rules (in <style>)
 */

export default function CaseSpin() {
  // ------------------------ CONFIG ------------------------
  const API_BASE = import.meta?.env?.VITE_API_BASE || ""; // e.g. "https://lottery-server-waif.onrender.com"
  const FALLBACK_TG_ID = Number(localStorage.getItem("telegram_id")) || undefined; // dev helper

  // ------------------------ STATE -------------------------
  const [cases, setCases] = useState([]);
  const [caseIdx, setCaseIdx] = useState(0);
  const [chances, setChances] = useState([]);
  const [loading, setLoading] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState(null); // { spin_id, nft_name, status, rerollInfo? }
  const [showPool, setShowPool] = useState(false);
  const wheelRef = useRef(null);

  const currentCase = cases[caseIdx];

  // ------------------------ HELPERS -----------------------
  function getTelegramId() {
    const tg = window?.Telegram?.WebApp; // works inside Telegram
    const id = tg?.initDataUnsafe?.user?.id || FALLBACK_TG_ID;
    return Number(id) || undefined;
  }

  function humanCurrencyLabel(c) {
    if (!c) return "";
    return c.allow_stars ? "⭐" : "TON";
  }

  // map nft_name -> icon path (customize paths as needed)
  function iconFor(name) {
    if (!name) return "/images/cases/placeholder.png";
    const key = name.toLowerCase().replace(/\s+/g, "");
    const map = {
      noloot: "/images/cases/no-loot.png",
      lose: "/images/cases/no-loot.png",
      cloverpin: "/images/cases/clover.png",
      boost: "/images/cases/boost.png",
      snakebox: "/images/cases/snake.png",
      hangingstar: "/images/cases/star.png",
      petsnake: "/images/cases/pet-snake.png",
    };
    return map[key] || "/images/cases/placeholder.png";
  }

  // ------------------------ FETCHERS ---------------------
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(API_BASE + "/api/cases");
        const data = await r.json();
        setCases(Array.isArray(data) ? data : []);
        setCaseIdx(0);
      } catch (e) {
        console.error("getCases failed", e);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!currentCase?.id) return;
    (async () => {
      try {
        setLoading(true);
        const r = await fetch(`${API_BASE}/api/cases/${currentCase.id}/chance`);
        const data = await r.json();
        // only active + with stock
        const filtered = (data || []).filter((c) => c.is_active && Number(c.quantity) > 0);
        setChances(filtered);
      } catch (e) {
        console.error("getChances failed", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [currentCase?.id]);

  // ------------------------ WHEEL GEOMETRY ---------------
  const segments = useMemo(() => {
    // percent is for visualization; ensure total ~100
    const total = chances.reduce((s, c) => s + Number(c.percent || 0), 0) || 0;
    if (total <= 0) return [];
    let accum = 0;
    return chances.map((c) => {
      const pct = (Number(c.percent || 0) / total) * 100; // normalized
      const angle = (pct / 100) * 360;
      const start = accum;
      const end = accum + angle;
      accum = end;
      return { ...c, pct, start, end, mid: start + angle / 2 };
    });
  }, [chances]);

  // Draw arc path helper
  function polarToCartesian(cx, cy, r, angleDeg) {
    const rad = ((angleDeg - 90) * Math.PI) / 180.0;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }
  function arcPath(cx, cy, r, startAngle, endAngle) {
    const start = polarToCartesian(cx, cy, r, endAngle);
    const end = polarToCartesian(cx, cy, r, startAngle);
    const large = endAngle - startAngle <= 180 ? 0 : 1;
    return [
      `M ${cx} ${cy}`,
      `L ${start.x} ${start.y}`,
      `A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`,
      "Z",
    ].join(" ");
  }

  // ------------------------ SPIN FLOW --------------------
  async function onSpin() {
    if (!currentCase) return;
    const telegram_id = getTelegramId();
    if (!telegram_id) {
      alert("Не найден telegram_id. Запустите через Telegram WebApp или добавьте в localStorage.");
      return;
    }
    try {
      setSpinning(true);
      setResult(null);
      const body = {
        case_id: currentCase.id,
        telegram_id,
        pay_with: currentCase.allow_stars ? "stars" : "tickets",
      };
      const r = await fetch(API_BASE + "/api/case/spin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "spin failed");

      // figure target nft_name (lose maps)
      const targetName = (data?.status === "lose")
        ? "No Loot"
        : data?.prize?.nft_name || "No Loot";

      // find segment by nft_name (case-insensitive, ignore spaces)
      const normalize = (s) => String(s || "").toLowerCase().replace(/\s+/g, "");
      const targetSeg = segments.find((s) => normalize(s.nft_name) === normalize(targetName))
        || segments.find((s) => normalize(s.nft_name) === normalize("No Loot"))
        || segments[0];

      if (!targetSeg) throw new Error("Секторы не готовы");

      // compute rotation: several full turns + align to mid of target segment under pointer (0deg)
      const baseTurns = 6; // feel free to tweak
      const finalAngle = 360 * baseTurns + (360 - targetSeg.mid) + (Math.random() * 2 - 1) * 1.5; // tiny jitter
      setRotation((prev) => prev + finalAngle);

      // wait for animation to end before enabling result buttons
      setTimeout(() => {
        setResult({
          spin_id: data?.spin_id,
          nft_name: targetName,
          status: data?.status,
          prize: data?.prize || null,
        });
        setSpinning(false);
      }, 2200); // must match animation duration below
    } catch (e) {
      console.error(e);
      alert(e.message || "Ошибка спина");
      setSpinning(false);
    }
  }

  async function onClaim() {
    if (!result?.spin_id) return;
    try {
      const r = await fetch(`${API_BASE}/api/case/spin/${result.spin_id}/claim`, {
        method: "POST",
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "claim failed");
      setResult((x) => ({ ...x, status: "reward_sent" }));
      alert("Подарок отправлен в pending_rewards");
    } catch (e) {
      alert(e.message || "Не удалось забрать приз");
    }
  }

  async function onReroll() {
    if (!result?.spin_id) return;
    try {
      const r = await fetch(`${API_BASE}/api/case/spin/${result.spin_id}/reroll`, { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "reroll failed");
      setResult((x) => ({ ...x, status: "reroll", reroll: data }));
      alert(data?.message || "Обмен выполнен");
    } catch (e) {
      alert(e.message || "Не удалось обменять приз");
    }
  }

  // ------------------------ RENDER -----------------------
  return (
    <div className="min-h-screen w-full bg-[#0b0d13] text-white flex flex-col items-center py-4">
      {/* custom CSS for pointer & glow */}
      <style>{`
        .pointer-triangle {
          width: 0; height: 0; border-left: 10px solid transparent; border-right: 10px solid transparent;
          border-bottom: 16px solid #fff; filter: drop-shadow(0 0 6px rgba(255,255,255,.7));
        }
        .ring-glow { box-shadow: 0 0 0 6px rgba(255,255,255,.06), 0 0 30px rgba(255,215,0,.2) inset; }
      `}</style>

      {/* Header */}
      <div className="w-full max-w-md px-4 flex items-center justify-between mb-4">
        <button onClick={() => setShowPool(true)} className="px-3 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-sm flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-yellow-400 text-black font-bold">{chances?.length || 0}</span>
          Призовой пул
        </button>
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 text-sm">Баланс:</span>
          <span className="px-2 py-1 rounded bg-zinc-800">{humanCurrencyLabel(currentCase)} {currentCase?.allow_stars ? ("…⭐") : ("… TON")}</span>
        </div>
      </div>

      {/* Wheel */}
      <div className="relative w-[320px] h-[320px] mb-6">
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 pointer-triangle" />
        <motion.svg
          ref={wheelRef}
          className="ring-glow rounded-full"
          width="320" height="320" viewBox="0 0 320 320"
          animate={{ rotate: rotation }}
          transition={{ type: "tween", ease: "easeOut", duration: 2.2 }}
          style={{ originX: "50%", originY: "50%" }}
        >
          {/* background circle */}
          <circle cx="160" cy="160" r="158" fill="#121520" stroke="#1f2330" strokeWidth="2" />
          {segments.map((s, i) => (
            <g key={s.id || i}>
              <path d={arcPath(160, 160, 150, s.start, s.end)} fill={`hsl(${(i*47)%360} 80% 50%)`} opacity={0.95} />
              {/* label/icon */}
              <foreignObject x="70" y="70" width="180" height="180" transform={`rotate(${s.mid},160,160)`} style={{ transformOrigin: "160px 160px" }}>
                <div className="w-full h-full flex items-center justify-end pr-6" style={{ transform: "rotate(-90deg)" }}>
                  <div className="flex flex-col items-center gap-1">
                    <img src={iconFor(s.nft_name)} alt={s.nft_name} className="h-7 w-7 object-contain drop-shadow" />
                    <span className="text-[10px] opacity-85 whitespace-nowrap">{s.nft_name}</span>
                  </div>
                </div>
              </foreignObject>
            </g>
          ))}
          {/* inner hub */}
          <circle cx="160" cy="160" r="60" fill="#0f121a" stroke="#2a2f3d"/>
          <text x="160" y="165" textAnchor="middle" className="fill-white" style={{ fontSize: 12, opacity: .8 }}>
            {spinning ? "Крутим…" : "Ожидание"}
          </text>
        </motion.svg>
      </div>

      {/* Case selector slider */}
      <div className="w-full max-w-md px-4 mb-3">
        <input type="range" min={0} max={Math.max(0, cases.length - 1)} value={caseIdx}
               onChange={(e) => setCaseIdx(Number(e.target.value))}
               className="w-full accent-yellow-400" />
        <div className="flex justify-between text-xs text-zinc-400 mt-1">
          <span>{cases[0]?.name || "—"}</span>
          <span>{currentCase?.name || "—"}</span>
          <span>{cases.at(-1)?.name || "—"}</span>
        </div>
      </div>

      {/* Price / Spin button */}
      <div className="w-full max-w-md px-4">
        <button
          disabled={spinning || loading || !segments.length}
          onClick={onSpin}
          className="w-full py-4 rounded-2xl bg-yellow-400 text-black font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-105 active:brightness-95 transition"
        >
          {loading ? "Загрузка…" : `Крутить за ${currentCase?.allow_stars ? (currentCase?.price_in_stars ?? "—") + " ⭐" : (currentCase?.price ?? "—") + " TON"}`}
        </button>
      </div>

      {/* Result actions */}
      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
                       className="w-full max-w-md px-4 mt-4">
            <div className="bg-zinc-900/70 border border-zinc-700 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={iconFor(result.nft_name)} className="h-10 w-10"/>
                <div>
                  <div className="text-sm text-zinc-400">Результат</div>
                  <div className="text-lg font-semibold">{result.nft_name}</div>
                </div>
              </div>
              <div className="flex gap-2">
                {result.status === "pending" && (
                  <>
                    <button onClick={onReroll} className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700">🔁 Обменять</button>
                    <button onClick={onClaim} className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold">🎁 Забрать</button>
                  </>
                )}
                {result.status !== "pending" && (
                  <button onClick={() => setResult(null)} className="px-3 py-2 rounded-xl bg-zinc-800">Ок</button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Prize Pool modal */}
      <AnimatePresence>
        {showPool && (
          <motion.div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowPool(false)}>
            <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-md bg-zinc-900 rounded-2xl p-4 border border-zinc-700">
              <div className="flex items-center justify-between mb-3">
                <div className="text-lg font-semibold">Призовой пул</div>
                <button onClick={() => setShowPool(false)} className="px-2 py-1 rounded bg-zinc-800">✕</button>
              </div>
              <div className="grid grid-cols-1 gap-2 max-h-[60vh] overflow-y-auto pr-1">
                {segments.map((s, i) => (
                  <div key={s.id || i} className="flex items-center justify-between bg-zinc-800/60 rounded-xl p-3">
                    <div className="flex items-center gap-3">
                      <img src={iconFor(s.nft_name)} className="h-8 w-8" />
                      <div>
                        <div className="font-medium">{s.nft_name}</div>
                        <div className="text-xs text-zinc-400">В наличии: {s.quantity}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold">{s.pct.toFixed(1)}%</div>
                      <div className="text-[10px] text-zinc-400">визуальная доля</div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
