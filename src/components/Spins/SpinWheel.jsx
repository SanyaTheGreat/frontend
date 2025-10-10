import React, { useEffect, useMemo, useRef, useState } from "react";
import "./spins.css";

export default function SpinWheel({ segments, targetId, isSpinning, onSpinEnd }) {
  const wheelRef = useRef(null);
  const [angle, setAngle] = useState(0);

  const rafRef = useRef(null);
  const startTimeRef = useRef(0);
  const startAngleRef = useRef(0);
  const endAngleRef = useRef(0);
  const durationRef = useRef(0);

  const cumulated = useMemo(() => {
    let acc = 0;
    return segments.map((s) => {
      const start = acc;
      const sweep = (s.percent / 100) * 360;
      acc += sweep;
      return { ...s, start, sweep };
    });
  }, [segments]);

  const COLORS = [
    "#2C7BE5",
    "#6C5CE7",
    "#20C997",
    "#FFB020",
    "#E53E3E",
    "#0EA5E9",
    "#10B981",
    "#F59E0B",
  ];

  // серый фон для lose
  const wheelBg = useMemo(() => {
    if (!cumulated.length) return "#0f1218";
    let from = 0;
    const stops = cumulated.map((s, i) => {
      const to = from + (s.sweep / 360) * 100;
      const color =
        s.label === "lose" ? "#3a3d42" : COLORS[i % COLORS.length];
      const part = `${color} ${from.toFixed(4)}% ${to.toFixed(4)}%`;
      from = to;
      return part;
    });
    return `conic-gradient(${stops.join(",")})`;
  }, [cumulated]);

  const normalize360 = (deg) => ((deg % 360) + 360) % 360;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  useEffect(() => {
    if (!isSpinning || !targetId || cumulated.length === 0) return;
    const seg = cumulated.find((s) => s.id === targetId);
    if (!seg) return;
    const center = seg.start + seg.sweep / 2;
    const current = angle;
    const deltaToCenter = 360 - center;
    const fullTurns = 5 + Math.random() * 1;
    const final = current + fullTurns * 360 + deltaToCenter;
    const duration = 3200 + Math.random() * 400;

    cancelAnim();
    startTimeRef.current = performance.now();
    startAngleRef.current = current;
    endAngleRef.current = final;
    durationRef.current = duration;
    rafRef.current = requestAnimationFrame(tick);
  }, [isSpinning, targetId, cumulated]);

  const tick = (now) => {
    const start = startTimeRef.current;
    const end = endAngleRef.current;
    const dur = durationRef.current;
    const t = Math.min(1, (now - start) / dur);
    const k = easeOutCubic(t);
    const value = startAngleRef.current + (end - startAngleRef.current) * k;
    setAngle(value);
    if (t < 1) rafRef.current = requestAnimationFrame(tick);
    else {
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
          transform: `rotate(${angle}deg)`,
          background: wheelBg,
          border: "6px solid #1f2229",
          boxShadow: "0 6px 30px rgba(0,0,0,.45)",
          overflow: "hidden",
        }}
      >
        {cumulated.map((s, i) => (
          <Segment
            key={s.id || i}
            start={s.start}
            sweep={s.sweep}
            label={s.label}
            slug={s.slug}
          />
        ))}
      </div>
    </div>
  );
}

function Segment({ start, sweep, label, slug }) {
  const ICON_RADIUS = 130;
  const TEXT_RADIUS = 105;

  const container = {
    position: "absolute",
    inset: 0,
    transform: `rotate(${start}deg)`,
    transformOrigin: "50% 50%",
  };

  // небольшой поправочный сдвиг (чтобы иконки не уплывали)
  const offset = -sweep * 0.25; // примерно 2% сектора влево

  return (
    <div style={container}>
      {/* Иконка */}
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
            rotate(${sweep / 2 + offset}deg)
            translateY(-${ICON_RADIUS}px)
            rotate(${-(start + sweep / 2 + offset)}deg)
          `,
          transformOrigin: "center",
          objectFit: "contain",
          pointerEvents: "none",
        }}
        onError={(e) => (e.currentTarget.style.display = "none")}
      />

      {/* Текст только для lose */}
      {label === "lose" && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: `
              rotate(${sweep / 2 + offset}deg)
              translateY(-${TEXT_RADIUS}px)
              rotate(${-(start + sweep / 2 + offset)}deg)
            `,
            width: 140,
            marginLeft: -70,
            textAlign: "center",
            color: "#b0b3b8",
            fontSize: 18,
            fontWeight: 700,
            textShadow: "0 1px 3px rgba(0,0,0,.4)",
            pointerEvents: "none",
          }}
        >
          Next one
        </div>
      )}
    </div>
  );
}
