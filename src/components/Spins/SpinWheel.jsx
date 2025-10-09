import React, { useEffect, useMemo, useRef, useState } from "react";
import "./spins.css";

/**
 * props:
 *  - segments: [{ id, label, slug, percent }] — сумма percent=100
 *  - targetId: id выигравшего сегмента (по chance_id) или null
 *  - isSpinning: bool
 *  - onSpinEnd: () => void
 */
export default function SpinWheel({ segments, targetId, isSpinning, onSpinEnd }) {
  const wheelRef = useRef(null);

  // текущий угол (в градусах, 0..∞)
  const [angle, setAngle] = useState(0);

  // rAF-анимация
  const rafRef = useRef(null);
  const startTimeRef = useRef(0);
  const startAngleRef = useRef(0);
  const endAngleRef = useRef(0);
  const durationRef = useRef(0);

  // предрасчёт сегментов
  const cumulated = useMemo(() => {
    let acc = 0;
    return segments.map((s) => {
      const start = acc;
      const sweep = (s.percent / 100) * 360;
      acc += sweep;
      return { ...s, start, sweep };
    });
  }, [segments]);

  // нормализация угла в 0..360 (для вычислений)
  const normalize360 = (deg) => ((deg % 360) + 360) % 360;

  // easeOutCubic: плавная инерционная остановка
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  // запуск анимации: на каждый новый спин с целевым сегментом
  useEffect(() => {
    if (!isSpinning || !targetId || cumulated.length === 0) return;

    // вычисляем центр целевого сегмента
    const seg = cumulated.find((s) => s.id === targetId);
    if (!seg) return;
    const center = seg.start + seg.sweep / 2; // градусы

    // текущий и финальный угол:
    const current = angle; // не нормализуем — накапливаем обороты для естественности
    const currentNorm = normalize360(current);

    // куда нужно прийти (стрелка сверху => хотим поставить центр под 0°)
    const deltaToCenter = (360 - center); // в 0° сверху
    // чтобы было реалистично — крутим 5–6 полных оборотов + чуть рандома
    const fullTurns = 5 + Math.random() * 1; // 5..6 оборотов
    const final = current + fullTurns * 360 + deltaToCenter;

    // длительность с лёгкой вариативностью (3.2–3.6s)
    const duration = 3200 + Math.random() * 400;

    // подготовка анимации
    cancelAnim(); // если вдруг что-то крутилось
    startTimeRef.current = performance.now();
    startAngleRef.current = current;
    endAngleRef.current = final;
    durationRef.current = duration;

    // запуск rAF
    rafRef.current = requestAnimationFrame(tick);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpinning, targetId, cumulated]);

  // кадр анимации
  const tick = (now) => {
    const start = startTimeRef.current;
    const end = endAngleRef.current;
    const dur = durationRef.current;

    const t = Math.min(1, (now - start) / dur);
    const k = easeOutCubic(t);

    const value = startAngleRef.current + (end - startAngleRef.current) * k;
    setAngle(value);

    if (t < 1) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      // гарантируем финальное положение и вызываем коллбек
      setAngle(end);
      rafRef.current = null;
      onSpinEnd?.();
    }
  };

  const cancelAnim = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  // при размонтировании отменяем анимацию
  useEffect(() => cancelAnim, []);

  return (
    <div className="spin-wheel-wrap">
      <div className="wheel-pointer" />
      <div
        ref={wheelRef}
        style={{
          width: 340,
          height: 340,
          borderRadius: "50%",
          position: "relative",
          // никаких CSS-transition — всё на rAF
          transform: `rotate(${angle}deg)`,
          background: "#0f1218",
          border: "6px solid #1f2229",
          boxShadow: "0 6px 30px rgba(0,0,0,.45)",
          overflow: "hidden",
        }}
      >
        {cumulated.map((s, i) => (
          <Segment key={s.id || i} start={s.start} sweep={s.sweep} label={s.label} slug={s.slug} />
        ))}
      </div>
    </div>
  );
}

function Segment({ start, sweep, label, slug }) {
  const ICON_RADIUS = 135;   // подгоняй под свой размер колеса (для 340px ~ 120–140)
  const TEXT_RADIUS = 105;

  const container = {
    position: "absolute",
    inset: 0,
    transform: `rotate(${start}deg)`,
    transformOrigin: "50% 50%",
  };

  // клин из центра к окружности
  const slice = {
    position: "absolute",
    inset: 0,
    clipPath: `polygon(50% 50%, 0% 0%, 100% 0%)`,
  };

  // лёгкое чередование тона, чтобы сектора были визуальны
  const tint = {
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.06), rgba(255,255,255,0) 60%)",
    transform: `skewY(${90 - sweep}deg)`,
    transformOrigin: "0% 0%",
    borderRight: "1px solid rgba(255,255,255,.06)",
  };

  return (
    <div style={container}>
      <div style={slice}>
        <div style={tint} />
      </div>

      {/* Иконка — в центр своего сектора, «смотрит» вверх */}
      <img
        src={`/animations/${slug}.png`}
        alt={label}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 48,
          height: 48,
          transform: `
            rotate(${start + sweep / 2}deg)
            translateY(-${ICON_RADIUS}px)
            rotate(${-start - sweep / 2}deg)
          `,
          transformOrigin: "center",
          objectFit: "contain",
          pointerEvents: "none",
        }}
        onError={(e) => (e.currentTarget.style.display = "none")}
      />

      {/* Подпись — тоже по радиусу сектора */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: `
            rotate(${start + sweep / 2}deg)
            translateY(-${TEXT_RADIUS}px)
            rotate(${-start - sweep / 2}deg)
          `,
          width: 80,
          marginLeft: -40,
          textAlign: "center",
          color: "#cdd3df",
          fontSize: 12,
          fontWeight: 600,
          lineHeight: 1.15,
          whiteSpace: "nowrap",
          textShadow: "0 1px 2px rgba(0,0,0,.35)",
          pointerEvents: "none",
        }}
      >
        {label}
      </div>
    </div>
  );
}
