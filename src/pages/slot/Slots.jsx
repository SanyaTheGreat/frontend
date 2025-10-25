// src/pages/slot/Slots.jsx
import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import lottie from "lottie-web";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./Slots.css";

const asset = (p) => `${import.meta.env.BASE_URL || "/"}${p.replace(/^\/+/, "")}`;

function Slots() {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();

  const containerRefs = useRef({});
  const animRefs = useRef({});
  const observerRef = useRef(null);
  const animCacheRef = useRef(new Map()); // slug -> json | "missing"
  const playedOnceRef = useRef({});       // slotId -> true

  // --- загрузка активных слотов ---
  useEffect(() => {
    const fetchSlots = async () => {
      try {
        const res = await fetch("https://lottery-server-waif.onrender.com/api/slots/active");
        const data = await res.json();
        setSlots(data || []);
      } catch (e) {
        console.error("Ошибка загрузки слотов", e);
        toast.error("Ошибка загрузки слотов");
      } finally {
        setLoading(false);
      }
    };
    fetchSlots();
  }, []);

  // helper: показать PNG и остановить наблюдение
  function showPngAndUnobserve(el, slug, name) {
    if (!el.querySelector("img")) {
      const img = document.createElement("img");
      img.src = asset(`animations/${slug}.png`);
      img.alt = name || slug;
      img.onerror = () => { img.src = asset("animations/fallback.png"); };
      Object.assign(img.style, { width: "100%", height: "100%", objectFit: "contain" });
      el.appendChild(img);
    }
    observerRef.current?.unobserve?.(el);
  }

  // --- анимации Lottie (по SLUG), как на Home: кэш + play-once ---
  useEffect(() => {
    if (loading || !slots.length) return;

    lottie.setQuality("low");

    const destroyAll = () => {
      Object.values(animRefs.current).forEach((a) => { try { a?.destroy?.(); } catch {} });
      animRefs.current = {};
    };

    const getAnimationJSONBySlug = async (slug) => {
      if (animCacheRef.current.has(slug)) return animCacheRef.current.get(slug);
      const url = asset(`animations/${slug}.json`);
      const res = await fetch(url, { cache: "force-cache" });
      const ct = res.headers.get("content-type") || "";
      if (!res.ok || !ct.includes("application/json")) {
        animCacheRef.current.set(slug, "missing");
        throw new Error("animation json not found");
      }
      const json = await res.json();
      animCacheRef.current.set(slug, json);
      return json;
    };

    observerRef.current = new IntersectionObserver(async (entries) => {
      for (const entry of entries) {
        const el = entry.target;
        const slotId = el.getAttribute("data-slotid");
        const nftName = el.getAttribute("data-nftname");
        const nftSlug = el.getAttribute("data-nftslug");
        if (!slotId || !nftSlug) continue;

        if (!entry.isIntersecting) {
          animRefs.current[slotId]?.pause?.();
          continue;
        }

        if (!animRefs.current[slotId]) {
          try {
            const cached = animCacheRef.current.get(nftSlug);
            if (cached === "missing") {
              showPngAndUnobserve(el, nftSlug, nftName);
              continue;
            }

            const data = cached || (await getAnimationJSONBySlug(nftSlug));

            const inst = lottie.loadAnimation({
              container: el,
              renderer: "canvas",
              loop: false,
              autoplay: false,
              animationData: data,
              rendererSettings: { progressiveLoad: true, clearCanvas: true },
            });
            inst.setSpeed(1);
            inst.addEventListener("complete", () => {
              playedOnceRef.current[slotId] = true;
              inst.pause();
            });
            animRefs.current[slotId] = inst;
          } catch {
            showPngAndUnobserve(el, nftSlug, nftName);
            continue;
          }
        }

        if (!playedOnceRef.current[slotId]) {
          animRefs.current[slotId].goToAndStop(0, true);
          animRefs.current[slotId].play();
        }
      }
    }, { threshold: 0.2, rootMargin: "120px 0px" });

    Object.values(containerRefs.current).forEach((el) => {
      if (el) observerRef.current.observe(el);
    });

    return () => {
      observerRef.current?.disconnect();
      destroyAll();
    };
  }, [slots, loading]);

  const handleOpenSlot = (id) => navigate(`/slots/${id}`);

  if (loading) {
    return (
      <div className="slots-wrapper">
        <p className="loading-text">Загрузка...</p>
        <ToastContainer theme="dark" position="top-right" autoClose={3000} />
      </div>
    );
  }

  return (
    <div className="slots-wrapper">
      {slots.length === 0 ? (
        <p className="loading-text">Нет доступных слотов</p>
      ) : (
        <div className="slots-grid">
          {slots.map((slot) => (
            <div
              key={slot.id}
              className={`slot-card ${slot.available ? "" : "slot-disabled"}`}
              onClick={() => slot.available && handleOpenSlot(slot.id)}
            >
              <div className="slot-animation">
                <div
                  ref={(el) => {
                    if (!el) return;
                    containerRefs.current[slot.id] = el;
                    el.setAttribute("data-slotid", String(slot.id));
                    el.setAttribute("data-nftname", slot.nft_name);
                    el.setAttribute("data-nftslug", slot.slug); // файлы ищем по slug
                    if (observerRef.current) observerRef.current.observe(el);
                  }}
                  className="anim-container"
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
                />
              </div>

              <div className="slot-title">{slot.nft_name}</div>
              <div className="slot-price">{slot.price} ⭐</div>
            </div>
          ))}
        </div>
      )}

      <ToastContainer theme="dark" position="top-right" autoClose={3000} />
    </div>
  );
}

export default Slots;
