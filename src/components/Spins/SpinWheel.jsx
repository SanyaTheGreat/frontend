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

  // ===== Предрасчёт углов секторов (0° = вправо, по часовой) =====
  const cumulated = useMemo(() => {
    let acc = 0;
    const rows = segments.map((s) => {
      const start = acc;                              // начало сектора (deg)
      const sweep = (Number(s.percent) / 100) * 360;  // угол сектора (deg)
      acc += sweep;
      const center = start + sweep / 2;               // центр сектора (deg)
      return { ...s, start, sweep, center };
    });

    if (rows.length) {
      const table = rows.map((r, i) => ({
        "#": i,
        id: r.id,
        label: r.label,
        start_deg: +r.start.toFixed(2),
        sweep_deg: +r.sweep.toFixed(2),
        center_deg: +r.center.toFixed(2),
        range: `[${(+r.start.toFixed(2))}° … ${(+(r.start + r.sweep).toFixed(2))}°]`,
      }));
      console.groupCollapsed("[WHEEL] Сектора (геометрия, 0°=right)");
      console.table(table);
      console.groupEnd();
    }

    return rows;
  }, [segments]);

  const COLORS = ["#2C7BE5","#6C5CE7","#20C997","#FFB020","#E53E3E","#0EA5E9","#10B981","#F59E0B"];

  // Фон колеса (серый для lose)
  const wheelBg = useMemo(() => {
    if (!cumulated.length) return "#0f1218";
    let from = 0;
    const stops = cumulated.map((s, i) => {
      const to = from + (s.sweep / 360) * 100;
      const color = s.label === "lose" ? "#3a3d42" : COLORS[i % COLORS.length];
      const part = `${color} ${from.toFixed(4)}% ${to.toFixed(4)}%`;
      from = to;
      return part;
    });
    return `conic-gradient(${stops.join(",")})`;
  }, [cumulated]);

  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const norm360 = (deg) => ((deg % 360) + 360) % 360;

  // ===== Запуск анимации (формула как в твоём Wheel.jsx) =====
  useEffect(() => {
    if (!isSpinning || !targetId || cumulated.length === 0) return;

    const seg = cumulated.find((s) => s.id === targetId);
    if (!seg) return;

    const center = seg.center;                // целимся центром сектора
    const current = angle;
    const spins = 5;                          // целое число оборотов
    const deltaToCenter = (360 - center) % 360;
    const final = current + 360 * spins + deltaToCenter;

    // длительность 3.2–3.6s
    const duration = 3200 + Math.random() * 400;

    // Логи: что выбрано и куда придём
    const finalNorm = norm360(final);
    console.group("[SPIN]");
    console.log("Выбран сектор:", {
      id: seg.id,
      label: seg.label,
      start_deg: +seg.start.toFixed(2),
      sweep_deg: +seg.sweep.toFixed(2),
      center_deg: +seg.center.toFixed(2),
    });
    console.log("Финальная геометрия (0°=right):", {
      delta_to_center_deg: +deltaToCenter.toFixed(2),
      final_angle_deg: +final.toFixed(2),
      final_angle_norm_deg: +finalNorm.toFixed(2),
    });
    console.groupEnd();

    cancelAnim();
    startTimeRef.current = performance.now();
    startAngleRef.current = current;
    endAngleRef.current = final;
    durationRef.current = duration;
    rafRef.current = requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpinning, targetId, cumulated]);

  // ===== Кадр анимации =====
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
      setAngle(end); // фиксируем финал
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
      {/* Стрелка рисуется в CSS справа: .wheel-pointer { right:-12px; top:50%; transform:translateY(-50%) rotate(90deg); ... } */}
      <div className="wheel-pointer" />
      <div
        ref={wheelRef}
        style={{
          width: 340,
          height: 340,
          borderRadius: "50%",
          position: "relative",
          transform: `rotate(${angle}deg)`, // 0° = вправо
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

  // Контейнер уже повернут на начало сектора (0°=вправо)
  const container = {
    position: "absolute",
    inset: 0,
    transform: `rotate(${start}deg)`,
    transformOrigin: "50% 50%",
  };

  return (
    <div style={container}>
      {/* Иконка — центр сектора: rotate(sweep/2) + translateX(R) */}
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
            rotate(${sweep / 2}deg)
            translateX(${ICON_RADIUS}px)
            rotate(${-sweep / 2}deg)
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
              rotate(${sweep / 2}deg)
              translateX(${TEXT_RADIUS}px)
              rotate(${-sweep / 2}deg)
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
