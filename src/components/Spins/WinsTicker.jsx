// src/components/spins/WinsTicker.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../supabaseClient";

// слуги, которые не показываем (на всякий случай фильтруем и на фронте)
const EXCLUDED = new Set(["lose", "2stars", "5stars", "10stars", "23stars"]);

// нормализация slug для сравнения
const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

// элемент-иконка подарка (PNG)
function GiftIcon({ slug }) {
  const src = useMemo(() => `/animations/${slug}.png`, [slug]);
  return (
    <img
      src={src}
      alt={slug}
      width={28}
      height={28}
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        objectFit: "cover",
        display: "block",
      }}
      onError={(e) => {
        // если PNG отсутствует — просто скрываем элемент
        e.currentTarget.style.display = "none";
      }}
    />
  );
}

export default function WinsTicker({
  initialLimit = 30,      // сколько грузим на старте
  bufferMax = 60,         // максимальное число в памяти/DOM
  speedPxPerSec = 40,     // скорость скролла (px/s)
  gap = 10,               // отступ между иконками
}) {
  const [items, setItems] = useState([]); // [{id, slug}]
  const trackRef = useRef(null);

  // загрузка последних побед
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        console.log("[WinsTicker] fetch initial…");
        const { data, error } = await supabase
          .from("wins_feed")
          .select("id, slug, created_at")
          .order("created_at", { ascending: false })
          .limit(initialLimit);

        if (error) {
          console.warn("[WinsTicker] initial fetch error:", error);
          return;
        }
        if (!isMounted) return;

        const cleaned =
          (data || [])
            .map((r) => ({ id: r.id, slug: (r.slug || "").toLowerCase() }))
            .filter((r) => !EXCLUDED.has(norm(r.slug)));

        // показываем в прямом порядке (старые -> новые), чтобы скролл был естественным
        cleaned.reverse();
        setItems(cleaned.slice(-bufferMax));
      } catch (e) {
        console.warn("[WinsTicker] unexpected:", e);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [initialLimit, bufferMax]);

  // realtime подписка
  useEffect(() => {
    console.log("[WinsTicker] subscribe realtime…");
    const channel = supabase
      .channel("wins_feed_ticker")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "wins_feed" },
        (payload) => {
          const slug = String(payload.new?.slug || "").toLowerCase();
          if (!slug || EXCLUDED.has(norm(slug))) return;

          setItems((prev) => {
            const next = [...prev, { id: payload.new.id, slug }];
            // ограничиваем буфер
            if (next.length > bufferMax) next.splice(0, next.length - bufferMax);
            return next;
          });
        }
      )
      .subscribe((status) => {
        console.log("[WinsTicker] realtime status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [bufferMax]);

  // расчитываем длительность анимации исходя из ширины дорожки
  const animationDuration = useMemo(() => {
    const el = trackRef.current;
    if (!el) return "20s";
    const totalWidth = el.scrollWidth;      // ширина одной дорожки
    const pxPerSec = Math.max(20, speedPxPerSec);
    const seconds = Math.max(10, Math.round(totalWidth / pxPerSec));
    return `${seconds}s`;
  }, [items, speedPxPerSec]);

  // рендерим две одинаковые дорожки подряд для бесшовного скролла
  const renderRow = (key) => (
    <div
      key={key}
      className="wins-ticker__row"
      ref={key === "first" ? trackRef : undefined}
      style={{ display: "flex", alignItems: "center", gap }}
      aria-hidden={key !== "first" ? true : undefined}
    >
      {items.map((it) => (
        <GiftIcon key={`${key}-${it.id}`} slug={it.slug} />
      ))}
    </div>
  );

  // если нет элементов — ничего не показываем
  if (!items.length) return null;

  return (
    <div className="wins-ticker__wrap">
      <div
        className="wins-ticker__track"
        style={{
          animationDuration,
        }}
      >
        {renderRow("first")}
        {renderRow("second")}
      </div>

      {/* локальные стили компонента */}
      <style>{`
        .wins-ticker__wrap{
          position: relative;
          overflow: hidden;
          height: 40px;             /* компактно по высоте */
          padding: 4px 0;            /* минимальные вертикальные отступы */
          background: transparent;   /* фон прозрачный */
          z-index: 1;
        }
        .wins-ticker__track{
          display: flex;
          width: max-content;
          align-items: center;
          animation-name: winsTickerScroll;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
          will-change: transform;
          pointer-events: none;      /* не перехватываем клики */
        }
        /* две строки подряд — делаем их в один ряд */
        .wins-ticker__track > .wins-ticker__row{
          margin-right: 24px; /* зазор между дубликатами дорожки */
        }
        @keyframes winsTickerScroll {
          from { transform: translate3d(0,0,0); }
          to   { transform: translate3d(-50%,0,0); } /* уезжаем на ширину первой дорожки */
        }

        /* уважение к reduced-motion */
        @media (prefers-reduced-motion: reduce) {
          .wins-ticker__track{
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
