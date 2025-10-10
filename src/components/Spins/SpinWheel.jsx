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

  // ===== Предрасчёт углов секторов =====
  const cumulated = useMemo(() => {
    let acc = 0;
    const rows = segments.map((s) => {
      const start = acc;                        // начало сектора (градусы, 0° = вправо)
      const sweep = (Number(s.percent) / 100) * 360; // дуга сектора
      acc += sweep;
      const center = start + sweep / 2;         // центр сектора
      return { ...s, start, sweep, center };
    });

    // Логи по секторам: кто что занимает
    if (rows.length) {
      const table = rows.map((r, i) => ({
        '#': i,
        id: r.id,
        label: r.label,
        start_deg: +r.start.toFixed(2),
        sweep_deg: +r.sweep.toFixed(2),
        center_deg: +r.center.toFixed(2),
        range: `[${(+r.start.toFixed(2))}° … ${(+(r.start + r.sweep).toFixed(2))}°]`,
      }));
      console.groupCollapsed("[WHEEL] Сектора (геометрия)");
      console.table(table);
      console.groupEnd();
    }

    return rows;
  }, [segments]);

  const COLORS = ["#2C7BE5","#6C5CE7","#20C997","#FFB020","#E53E3E","#0EA5E9","#10B981","#F59E0B"];

  // Серый фон для lose + раскраска остального
  const wheelBg = useMemo(() => {
    if (!cumulated.length) return "#0f1218";
    let from = 0;
    const stops = cumulated.map((s, i) => {
      const to = from + (s.sweep / 360) * 100; // в проценты круга
      const color = s.label === "lose" ? "#3a3d42" : COLORS[i % COLORS.length];
      const part = `${color} ${from.toFixed(4)}% ${to.toFixed(4)}%`;
      from = to;
      return part;
    });
    return `conic-gradient(${stops.join(",")})`;
  }, [cumulated]);

  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const norm360 = (deg) => ((deg % 360) + 360) % 360;

  // ===== Запуск анимации под целевой сектор =====
  useEffect(() => {
    if (!isSpinning || !targetId || cumulated.length === 0) return;

    const seg = cumulated.find((s) => s.id === targetId);
    if (!seg) return;

    const center = seg.center; // центр выбранного сектора (до вращения)
    const current = angle;

    // Нужно поставить центр под указатель (указатель сверху = 0°),
    // значит крутим так, чтобы центр стал в 0°: delta = 360 - center.
    const deltaToCenter = 360 - center;

    // 5–6 оборотов для реалистичности
    const fullTurns = 5 + Math.random() * 1; // 5..6
    const final = current + fullTurns * 360 + deltaToCenter;

    // Длительность 3.2–3.6s
    const duration = 3200 + Math.random() * 400;

    // ЛОГИ для спина: что выбрано и куда придём
    const pointerAfterSpin = 0; // указатель фиксирован сверху = 0°
    const finalNorm = norm360(final);
    const afterRangeStart = norm360(0 - seg.sweep / 2);
    const afterRangeEnd   = norm360(0 + seg.sweep / 2);

    console.group("[SPIN]");
    console.log("Выбран сектор:", {
      id: seg.id,
      label: seg.label,
      start_deg: +seg.start.toFixed(2),
      sweep_deg: +seg.sweep.toFixed(2),
      center_deg: +seg.center.toFixed(2),
    });
    console.log("Финальная геометрия:", {
      target_center_to_pointer_deg: 0,
      pointer_after_spin_deg: pointerAfterSpin,
      sector_under_pointer_after_spin: seg.label,
      sector_range_after_spin_deg: `[${afterRangeStart.toFixed(2)}° … ${afterRangeEnd.toFixed(2)}°]`,
      final_wheel_angle_deg: final.toFixed(2),
      final_wheel_angle_norm_deg: finalNorm.toFixed(2),
    });
    console.groupEnd();

    // Запуск rAF
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
      setAngle(end);           // фиксируем финал без дрожания
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

  // Контейнер уже повёрнут на начало сектора
  const container = {
    position: "absolute",
    inset: 0,
    transform: `rotate(${start}deg)`,
    transformOrigin: "50% 50%",
  };

  return (
    <div style={container}>
      {/* ИКОНКА — только корректировка «прицела» (угол), без лишних правок */}
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
            rotate(${sweep / 2}deg)           /* наводимся в центр своего сектора */
            translateY(-${ICON_RADIUS}px)     /* выносим на окружность */
            rotate(${-sweep / 2}deg)          /* выравниваем картинку "вверх" */
          `,
          transformOrigin: "center",
          objectFit: "contain",
          pointerEvents: "none",
        }}
        onError={(e) => (e.currentTarget.style.display = "none")}
      />

      {/* ТЕКСТ только для lose */}
      {label === "lose" && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: `
              rotate(${sweep / 2}deg)
              translateY(-${TEXT_RADIUS}px)
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
