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
  const [angle, setAngle] = useState(0);

  const cumulated = useMemo(() => {
    let acc = 0;
    return segments.map((s) => {
      const start = acc; // в градусах 0..360
      const sweep = (s.percent / 100) * 360;
      acc += sweep;
      return { ...s, start, sweep };
    });
  }, [segments]);

  // вычисляем финальный угол так, чтобы стрелка (сверху) попала в середину целевого сегмента
  useEffect(() => {
    if (!isSpinning || !targetId || cumulated.length === 0) return;
    const seg = cumulated.find((s) => s.id === targetId);
    if (!seg) return;
    const center = seg.start + seg.sweep / 2; // градусы

    // крутим несколько полных оборотов + приводим центр под стрелку (0° сверху)
    const fullTurns = 5; // можно увеличить для драматичности
    const final = fullTurns * 360 + (360 - center);

    // запускаем анимацию через CSS-переход
    requestAnimationFrame(() => {
      setAngle(final);
    });
  }, [isSpinning, targetId, cumulated]);

  // окончание анимации
  useEffect(() => {
    const el = wheelRef.current;
    if (!el) return;
    const handler = () => onSpinEnd?.();
    el.addEventListener("transitionend", handler);
    return () => el.removeEventListener("transitionend", handler);
  }, [onSpinEnd]);

  return (
    <div className="spin-wheel-wrap">
      <div className="wheel-pointer"/>
      <div
        ref={wheelRef}
        style={{
          width: 280,
          height: 280,
          borderRadius: "50%",
          position: "relative",
          transition: isSpinning ? "transform 2.2s cubic-bezier(.19,1,.22,1)" : "none",
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
  const pathStyle = {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    transform: `rotate(${start}deg)`,
    transformOrigin: "50% 50%",
    clipPath: `polygon(50% 50%, 0% 0%, 100% 0%)`,
  };
  const sliceStyle = {
    position: "absolute",
    width: "100%",
    height: "100%",
    background: "radial-gradient(circle at 50% 50%, rgba(255,255,255,.06), rgba(255,255,255,0) 60%)",
    transform: `skewY(${90 - sweep}deg)`,
    transformOrigin: "0% 0%",
    borderRight: "1px solid rgba(255,255,255,.06)",
  };

  return (
    <div style={pathStyle}>
      <div style={sliceStyle} />
      {/* иконка */}
      <img
        src={`/animations/${slug}.png`}
        alt={label}
        style={{
          position: "absolute",
          width: 48,
          height: 48,
          left: "50%",
          top: "14%",
          transform: `rotate(${-start - sweep / 2}deg) translate(-50%, 0)`,
          objectFit: "contain",
          pointerEvents: "none",
        }}
        onError={(e) => (e.currentTarget.style.display = "none")}
      />
      {/* подпись */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "100%",
          height: "100%",
          display: "grid",
          placeItems: "center",
          transform: `rotate(${-start - sweep / 2}deg)`,
          color: "#cdd3df",
          fontSize: 12,
          textAlign: "center",
        }}
      >
        {label}
      </div>
    </div>
  );
}

