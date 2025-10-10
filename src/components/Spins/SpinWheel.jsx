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
    // 0° = вправо
    return `conic-gradient(from 90deg, ${stops.join(",")})`;
  }, [cumulated]);

  // Более плавное, «инерционное» замедление
  const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
  const norm360 = (deg) => ((deg % 360) + 360) % 360;

  // ===== Запуск анимации с учётом текущего угла, рандом внутри сектора =====
  useEffect(() => {
    if (!isSpinning || !targetId || cumulated.length === 0) return;

    const seg = cumulated.find((s) => s.id === targetId);
    if (!seg) return;

    const current = angle;
    const currentNorm = norm360(current);
    const POINTER_DEG = 0; // стрелка вправо (0°)

    // Случайная точка ВНУТРИ сектора, не по центру:
    // берём +-30% ширины сектора относительно центра
    const maxOffset = seg.sweep * 0.30;
    const randomOffset = (Math.random() * 2 - 1) * maxOffset;
    const targetAngleInWheel = seg.center + randomOffset; // цель в системе колеса (0°=вправо)

    // Сколько довернуть от текущего, чтобы цель стала под указателем:
    // (currentNorm + delta + target) % 360 == POINTER_DEG
    const deltaToTarget = norm360(POINTER_DEG - (currentNorm + targetAngleInWheel));

    // Реалистично: 5..6 оборотов (слегка варьируем)
    const spins = 5 + Math.random();
    const final = current + 360 * spins + deltaToTarget;

    // Длительность: 3.0–4.2s (живее)
    const duration = 3000 + Math.random() * 1200;

    // Логи
    console.group("[SPIN]");
    console.log("Выбран сектор:", {
      id: seg.id,
      label: seg.label,
      start_deg: +seg.start.toFixed(2),
      sweep_deg: +seg.sweep.toFixed(2),
      center_deg: +seg.center.toFixed(2),
      random_offset_deg: +randomOffset.toFixed(2),
      target_in_wheel_deg: +targetAngleInWheel.toFixed(2),
    });
    console.log("Геометрия доводки:", {
      current_norm_deg: +currentNorm.toFixed(2),
      delta_to_target_deg: +deltaToTarget.toFixed(2),
      rotate_by_deg: +(final - current).toFixed(2),
      spins: +spins.toFixed(2),
      duration_ms: Math.round(duration),
      final_angle_deg: +final.toFixed(2),
      final_angle_norm_deg: +norm360(final).toFixed(2),
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
    const k = easeOutQuint(t); // новый easing
    const value = startAngleRef.current + (end - startAngleRef.current) * k;
    setAngle(value);
    if (t < 1) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      setAngle(end);
      rafRef.current = null;
      onSpinEnd?.(); // модалка должна открываться ТОЛЬКО здесь
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
            angle={angle} // чтобы иконки/текст оставались вертикальными
          />
        ))}
      </div>
    </div>
  );
}

function Segment({ start, sweep, label, slug, angle }) {
  const ICON_RADIUS = 110;
  const TEXT_RADIUS = 105;
  const ICON_OFFSET = -7; // тонкая подстройка по дуге (против часовой)

  // Контейнер уже повёрнут на начало сектора (0°=вправо)
  const container = {
    position: "absolute",
    inset: 0,
    transform: `rotate(${start}deg)`,
    transformOrigin: "50% 50%",
  };

  return (
    <div style={container}>
      {/* Иконка — центр сектора, остаётся вертикальной благодаря rotate(-angle) */}
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
            rotate(${sweep / 2 + ICON_OFFSET}deg)
            translateX(${ICON_RADIUS}px)
            rotate(${-sweep / 2}deg)
            rotate(${-angle}deg)                /* компенсация вращения колеса */
          `,
          transformOrigin: "center",
          objectFit: "contain",
          pointerEvents: "none",
        }}
        onError={(e) => (e.currentTarget.style.display = "none")}
      />

      {/* Текст только для lose — тоже компенсируем вращение */}
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
              rotate(${-angle}deg)              /* компенсация вращения */
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
