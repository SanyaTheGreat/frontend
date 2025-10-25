import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import lottie from "lottie-web";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./Slots.css";

const asset = (p) => `${import.meta.env.BASE_URL || "/"}${p.replace(/^\/+/, "")}`;

function slugify(s) {
  return (s || "")
    .toString()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-_.]/g, "")
    .replace(/\-+/g, "-")
    .replace(/^\-+|\-+$/g, "");
}

function Slots() {
  const [slots, setSlots] = useState([]);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [animCache] = useState(new Map());
  const navigate = useNavigate();

  const containerRefs = useRef({});
  const animRefs = useRef({});
  const observerRef = useRef(null);

  // временная защита
  useEffect(() => {
    const localFlag = localStorage.getItem("slots_access");
    if (localFlag === "1") {
      setAuthorized(true);
    } else {
      const pass = prompt("🔒 Страница в разработке. Введите пароль:");
      if (pass === "devslots123") {
        localStorage.setItem("slots_access", "1");
        setAuthorized(true);
      } else {
        toast.error("Неверный пароль");
      }
    }
  }, []);

  // активные слоты
  useEffect(() => {
    if (!authorized) return;
    (async () => {
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
    })();
  }, [authorized]);

  // Lottie по slug
  useEffect(() => {
    if (!authorized || loading || !slots.length) return;

    const destroyAll = () => {
      Object.values(animRefs.current).forEach((a) => { try { a?.destroy?.(); } catch {} });
      animRefs.current = {};
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
            const key = nftSlug;
            let json;
            if (animCache.has(key)) {
              json = animCache.get(key);
            } else {
              const url = asset(`animations/${nftSlug}.json`);
              const res = await fetch(url, { cache: "force-cache" });
              const ct = res.headers.get("content-type") || "";
              if (!res.ok || !ct.includes("application/json")) {
                throw new Error("animation json not found");
              }
              json = await res.json();
              animCache.set(key, json);
            }

            const inst = lottie.loadAnimation({
              container: el,
              renderer: "canvas",
              loop: true,
              autoplay: true,
              animationData: json,
            });
            inst.setSpeed(0.8);
            animRefs.current[slotId] = inst;
          } catch (e) {
            console.warn("Ошибка анимации", nftName, e);
            // PNG по slug
            if (!el.querySelector("img")) {
              const img = document.createElement("img");
              img.src = asset(`animations/${nftSlug}.png`);
              img.alt = nftName || nftSlug;
              img.onerror = () => { img.src = asset("animations/fallback.png"); };
              img.style.width = "100%";
              img.style.height = "100%";
              img.style.objectFit = "contain";
              el.appendChild(img);
            }
          }
        }
      }
    }, { threshold: 0.2 });

    Object.values(containerRefs.current).forEach((el) => {
      if (el) observerRef.current.observe(el);
    });

    return () => {
      observerRef.current?.disconnect();
      destroyAll();
    };
  }, [slots, authorized, loading, animCache]);

  const handleOpenSlot = (id) => navigate(`/slots/${id}`);

  if (!authorized) {
    return (
      <div className="slots-wrapper locked">
        <p>🔒 Доступ запрещён</p>
        <ToastContainer theme="dark" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="slots-wrapper">
        <p className="loading-text">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="slots-wrapper">
      {slots.length === 0 ? (
        <p className="loading-text">Нет доступных слотов</p>
      ) : (
        <div className="slots-grid">
          {slots.map((slot) => {
            const slug = slugify(slot.nft_name);
            return (
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
                      el.setAttribute("data-nftname", slot.nft_name || "");
                      el.setAttribute("data-nftslug", slug);
                      if (observerRef.current) observerRef.current.observe(el);
                    }}
                    className="anim-container"
                  />
                </div>

                <div className="slot-title">{slot.nft_name}</div>
                <div className="slot-price">{slot.price} ⭐</div>
              </div>
            );
          })}
        </div>
      )}

      <ToastContainer theme="dark" position="top-right" autoClose={3000} />
    </div>
  );
}

export default Slots;
