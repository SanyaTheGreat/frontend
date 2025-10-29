// src/components/spins/WinsTicker.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../supabaseClient";

// исключаем эти призы (фильтр по нормализованному виду)
const EXCLUDED = new Set(["lose", "2stars", "5stars", "10stars", "23stars","20stars","35stars",]);
const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

// PNG-иконка подарка
function GiftIcon({ slug }) {
  const src = useMemo(() => `/animations/${slug}.png`, [slug]);
  return (
    <img
      src={src}
      alt={slug}
      width={28}
      height={28}
      style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover", display: "block" }}
      onError={(e) => {
        console.warn("[WinsTicker] image not found:", e.currentTarget.src);
        e.currentTarget.style.display = "none";
      }}
    />
  );
}

export default function WinsTicker({
  initialLimit = 30,   // сколько грузим на старте
  bufferMax = 60,      // максимум элементов в памяти/DOM
  speedPxPerSec = 40,  // скорость скролла (px/s)
  gap = 10,            // расстояние между иконками
}) {
  const [items, setItems] = useState([]); // [{id, slug}]
  const trackRef = useRef(null);

  // стартовая загрузка
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("wins_feed")
          .select("id, slug, created_at")
          .order("created_at", { ascending: false })
          .limit(initialLimit);

        if (error) {
          console.warn("[WinsTicker] initial fetch error:", error);
          return;
        }
        if (!alive) return;

        const cleaned = (data || [])
          .map((r) => ({ id: r.id, slug: r.slug || "" })) // сохраняем исходный регистр
          .filter((r) => r.slug && !EXCLUDED.has(norm(r.slug)));

        cleaned.reverse(); // старые -> новые для естественного скролла
        setItems(cleaned.slice(-bufferMax));
      } catch (e) {
        console.warn("[WinsTicker] unexpected:", e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [initialLimit, bufferMax]);

  // realtime подписка
  useEffect(() => {
    const channel = supabase
      .channel("wins_feed_ticker")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "wins_feed" },
        (payload) => {
          const slug = String(payload.new?.slug || "");
          if (!slug || EXCLUDED.has(norm(slug))) return;

          setItems((prev) => {
            const next = [...prev, { id: payload.new.id, slug }];
            if (next.length > bufferMax) next.splice(0, next.length - bufferMax);
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [bufferMax]);

  // длительность анимации из ширины дорожки
  const animationDuration = useMemo(() => {
    const el = trackRef.current;
    if (!el) return "20s";
    const totalWidth = el.scrollWidth;
    const pxPerSec = Math.max(20, speedPxPerSec);
    const seconds = Math.max(10, Math.round(totalWidth / pxPerSec));
    return `${seconds}s`;
  }, [items, speedPxPerSec]);

  if (!items.length) return null;

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

  return (
    <div className="wins-ticker__wrap">
      <div className="wins-ticker__track" style={{ animationDuration }}>
        {renderRow("first")}
        {renderRow("second")}
      </div>

      {/* локальные стили компонента */}
      <style>{`
        .wins-ticker__wrap{
          position: relative;
          overflow: hidden;
          height: 40px;
          padding: 4px 0;
          background: transparent;
          z-index: 2;
          margin: 4px 0 6px;
        }
        .wins-ticker__track{
          display: flex;
          align-items: center;
          width: max-content;
          animation-name: winsTickerScroll;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
          will-change: transform;
          pointer-events: none;
        }
        .wins-ticker__track > .wins-ticker__row{
          margin-right: 24px; /* промежуток между дубликатами дорожки */
        }
        @keyframes winsTickerScroll {
          from { transform: translate3d(0,0,0); }
          to   { transform: translate3d(-50%,0,0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .wins-ticker__track{ animation: none; }
        }
      `}</style>
    </div>
  );
}
