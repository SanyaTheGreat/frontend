import React, { useEffect, useMemo, useRef, useState } from "react";
import "./spins.css";

/**
 * props:
 *  - segments: [{ id, label, slug, percent }]
 *  - targetId: id выигравшего сегмента (chance_id) или null
 *  - isSpinning: bool
 *  - onSpinEnd: () => void
 */
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

  const normalize360 = (deg) => ((deg % 360) + 360) % 360;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  useEffect(() => {
    if (!isSpinning || !targetId || cumulated.length === 0) return;

    const seg = cumulated.find((s) => s.id === targetId);
    if (!seg) return;
    const center = seg.start + seg.sweep / 2;

    const current = angle;
    const currentNorm = normalize360(current);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpinning, targetId, cumulated]);

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
          background: "#0f1218",
          border: "6px solid #1f2229",
          boxShadow: "0 6px 30px rgba(0,0,0,.45)",
          overflow: "hidden",
        }}
      >
        {cumulated.map((s, i) => (
          <Segment
            key={s.id || i}
            index={i}
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

function Segment({ index, start, sweep, label, slug }) {
  const ICON_RADIUS = 135;
  const TEXT_RADIUS = 105;

  const PALETTE = [
    "#2C7BE5",
    "#6C5CE7",
    "#20C997",
    "#FFB020",
    "#E53E3E",
    "#0EA5E9",
    "#10B981",
    "#F59E0B",
  ];
  const base = PALETTE[index % PALETTE.length];

  const container = {
    position: "absolute",
    inset: 0,
    transform: `rotate(${start}deg)`,
    transformOrigin: "50% 50%",
  };

  const slice = {
    position: "absolute",
    inset: 0,
    clipPath: `polygon(50% 50%, 0% 0%, 100% 0%)`,
  };

  const tint = {
    position: "absolute",
    inset: 0,
    background: `linear-gradient(135deg, ${base}, ${base})`,
    transform: `skewY(${90 - sweep}deg)`,
    transformOrigin: "0% 0%",
    borderRight: "1px solid rgba(0,0,0,.25)",
    boxShadow: "inset 0 0 60px rgba(0,0,0,.18)",
    opacity: 0.96,
  };

  return (
    <div style={container}>
      <div style={slice}>
        <div style={tint} />
      </div>

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
          color: "#e9eef9",
          fontSize: 12,
          fontWeight: 600,
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
