import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchCases,
  fetchCaseChance,
  getTelegramId,
  postClaim,
  postReroll,
  postSpin,
  fetchInventory,
  fetchFreeSpinAvailability,
} from "./spinsApi";
import { supabase } from "../../supabaseClient";
import SpinWheel from "./SpinWheel";
import SpinControls from "./SpinControls";
import "./spins.css";
import WinsTicker from "./WinsTicker";

export default function SpinPage() {
  const [cases, setCases] = useState([]);
  const [index, setIndex] = useState(0); // активный кейс
  const [chances, setChances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const [spinning, setSpinning] = useState(false);
  const [animDone, setAnimDone] = useState(false); // флаг конца анимации
  const [targetId, setTargetId] = useState(null);
  const [spinId, setSpinId] = useState(null);
  const [result, setResult] = useState(null); // {status, prize?}
  const [showModal, setShowModal] = useState(false);

  const [balance, setBalance] = useState({ stars: 0, tickets: 0 });

  // курс конвертации из таблицы fx_rates
  const [fx, setFx] = useState({ stars_per_ton: 0, ton_per_100stars: 0, fee_markup: 0 });

  // тост после обмена
  const [toast, setToast] = useState(null); // { text: string } | null

  // инвентарь: счётчик и флаг (пока только кнопка)
  const [invCount, setInvCount] = useState(0);

  // Блокировка повторных кликов на кнопках результата
  const [actionBusy, setActionBusy] = useState(false);

  // Показ панели шансов
  const [showChances, setShowChances] = useState(false);

  // Доступность бесплатного спина
  const [freeInfo, setFreeInfo] = useState({
    available: false,
    cheapest_case_id: null,
    next_at: null,
  });

  // Готовность сегментов для текущего колеса (страховка от гонок)
  const [segmentsReady, setSegmentsReady] = useState(false);

  const activeCase = cases[index] || null;

  // =========================
  //  TELEGRAM_ID (унификация)
  // =========================

  // безопасный декодер JWT → telegram_id
  function decodeJwtTelegramId() {
    try {
      const jwt = localStorage.getItem("jwt");
      if (!jwt) return null;
      const [, payloadB64] = jwt.split(".");
      if (!payloadB64) return null;
      const json = JSON.parse(
        decodeURIComponent(
          escape(window.atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")))
        )
      );
      return json?.telegram_id || json?.tg_id || json?.user?.telegram_id || null;
    } catch {
      return null;
    }
  }

  // 1) из JWT (главный источник)
  const jwtTelegramId = decodeJwtTelegramId();

  // 2) из Telegram WebApp (если открыто внутри TG) или helper из spinsApi
  const tgApiId = getTelegramId?.() || window?.Telegram?.WebApp?.initDataUnsafe?.user?.id || null;

  // 3) dev-фоллбек: query/localStorage
  const queryId = new URLSearchParams(window.location.search).get("tgid");
  const storedId = window.localStorage.getItem("tgid") || null;
  if (queryId && queryId !== storedId) window.localStorage.setItem("tgid", queryId);

  // итоговый id: JWT → TG API → ?tgid → stored
  const effectiveId = jwtTelegramId || tgApiId || queryId || storedId || null;

  // ref с текущим значением (используем во всех async-функциях)
  const telegramIdRef = useRef(effectiveId);
  useEffect(() => {
    telegramIdRef.current = effectiveId;
  }, [effectiveId]);

  // =========================

  // загрузка кейсов
  useEffect(() => {
    (async () => {
      try {
        const cs = await fetchCases();
        // сортируем активные кейсы по цене по возрастанию
        const activeSorted = cs
          .filter((c) => c.is_active)
          .sort((a, b) => Number(a.price) - Number(b.price));
        setCases(activeSorted);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, []);

  // загрузка доступности бесплатного спина (1 раз при монтировании)
  useEffect(() => {
    (async () => {
      try {
        const tgId = telegramIdRef.current;
        if (!tgId) return;
        const info = await fetchFreeSpinAvailability(tgId);
        setFreeInfo(info);
      } catch (e) {
        console.warn("[free-spin] availability:", e?.message || e);
      }
    })();
  }, []);

  // загрузка курсов
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("fx_rates")
          .select("stars_per_ton, ton_per_100stars, fee_markup")
          .eq("id", 1)
          .maybeSingle();

        if (error) {
          console.warn("[fx_rates] select error:", error);
          return;
        }
        if (!data) {
          console.warn("[fx_rates] no rows (RLS policy?)");
          return;
        }

        setFx({
          stars_per_ton: Number(data.stars_per_ton || 0),
          ton_per_100stars: Number(data.ton_per_100stars || 0),
          fee_markup: Number(data.fee_markup || 0),
        });
      } catch (e) {
        console.warn("[fx_rates] unexpected error:", e);
      }
    })();
  }, []);

  // Жёсткий reset UI при смене активного кейса
  useEffect(() => {
    setLoading(true);
    setSegmentsReady(false);
    setSpinning(false);
    setAnimDone(false);
    setResult(null);
    setTargetId(null);
    setSpinId(null);
    setShowModal(false);
    setActionBusy(false);
  }, [activeCase?.id]);

  // загрузка шансов для активного кейса
  useEffect(() => {
    (async () => {
      if (!activeCase) return;
      try {
        const list = await fetchCaseChance(activeCase.id);
        const onlyActive = list.filter((x) => x.is_active);

        onlyActive.sort((a, b) => (Number(a.chance) || 0) - (Number(b.chance) || 0));

        setChances(
          onlyActive.map((x) => ({
            id: x.id,
            label: x.nft_name,
            slug: x.slug || (x.nft_name || "").toLowerCase().replaceAll(" ", "-"),
            percent: Number(x.percent || 0),
            chance: Number.isFinite(Number(x.chance)) ? Number(x.chance) : null,
            price: Number(x.price || 0), // TON (fallback)
            payout_value: Number(x.payout_value || 0), // TON для обмена
          }))
        );
        setSegmentsReady(true);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [activeCase?.id]);

  // баланс пользователя
  useEffect(() => {
    (async () => {
      const tgId = telegramIdRef.current;
      if (!tgId) return;
      const { data } = await supabase
        .from("users")
        .select("stars, tickets")
        .eq("telegram_id", tgId)
        .single();
      if (data) setBalance({ stars: Number(data.stars || 0), tickets: Number(data.tickets || 0) });
    })();
    // следим за effectiveId — если сменился пользователь, обновим баланс
  }, [effectiveId]);

  const priceTon = useMemo(() => Number(activeCase?.price || 0), [activeCase]);
  const priceStars = useMemo(() => Number(activeCase?.price_in_stars || 0), [activeCase]);
  const allowStars = !!activeCase?.allow_stars;

  // модалка: открывать только когда есть результат и анимация завершилась
  useEffect(() => {
    if (animDone && result) setShowModal(true);
  }, [animDone, result]);

  // загрузка счётчика инвентаря
  const loadInvCount = useMemo(
    () => async () => {
      const tgId = telegramIdRef.current;
      if (!tgId) return;
      try {
        const items = await fetchInventory(tgId);
        setInvCount(items.length || 0);
      } catch (e) {
        console.warn("[inventory] count failed:", e?.message || e);
      }
    },
    []
  );

  useEffect(() => {
    loadInvCount();
  }, [loadInvCount, effectiveId]);

  // доступен ли фриспин для текущего выбранного кейса
  const freeEnabledForActiveCase =
    freeInfo.available && activeCase && activeCase.id === freeInfo.cheapest_case_id;

  // безопасное определение targetId, если сегмент пропал/не найден
  function resolveTargetIdSafe(chanceId) {
    const exists = chanceId && chances.some((c) => c.id === chanceId);
    if (exists) return chanceId;
    const loseSeg =
      chances.find(
        (s) => s.label?.toLowerCase() === "lose" || s.slug?.toLowerCase() === "lose"
      ) || chances[0];
    return loseSeg?.id ?? null;
  }

  // ===== star-canvas init for SpinPage (реалистичное небо) =====
  useEffect(() => {
    const canvas = document.getElementById("spin-stars");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const DPR = Math.min(2, window.devicePixelRatio || 1);

    let raf = 0;
    const stars = [];
    const TAU = Math.PI * 2;

    function resize() {
      const { innerWidth: w, innerHeight: h } = window;
      canvas.width = Math.floor(w * DPR);
      canvas.height = Math.floor(h * DPR);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      stars.length = 0;
      const density = 0.08; // звёзд на 1000px^2
      const count = Math.floor((w * h) / 1000 * density);

      for (let i = 0; i < count; i++) {
        const r = (Math.random() < 0.25 ? 1.3 : 1) * (0.5 + Math.random() * 1.2);
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          r: r * DPR,
          a: 0.6 + Math.random() * 0.4,
          twAmp: 0.25 + Math.random() * 0.4,
          twSpd: 0.4 + Math.random() * 0.9,
          phi: Math.random() * TAU,
        });
      }
    }

    function draw(t) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const s of stars) {
        const tw = Math.sin(t * 0.001 * s.twSpd + s.phi) * s.twAmp;
        const alpha = Math.max(0, Math.min(1, s.a + tw));

        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 2.2, 0, TAU);
        ctx.fillStyle = `rgba(255,255,255,${alpha * 0.08})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, TAU);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    }

    resize();
    raf = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);
  // ===== end star-canvas init =====

  // запуск спина (обычный)
  async function handleSpin() {
    if (!activeCase) return;

    // защита: не крутить, пока колесо/сегменты не готовы
    if (loading || !segmentsReady || !chances.length) {
      setError("Подождите, колесо обновляется…");
      return;
    }

    // если нет авторизации/id — подскажем
    if (!telegramIdRef.current) {
      setError("Не найден Telegram ID: открой Mini App в Telegram или авторизуйся заново.");
      return;
    }

    setError("");
    setResult(null);
    setSpinning(true);
    setAnimDone(false); // сбрасываем флаг перед стартом
    setTargetId(null);
    setSpinId(null);
    setShowModal(false); // сбрасываем модалку
    setActionBusy(false); // сбрасываем защиту для нового результата

    // фиксируем id кейса на момент нажатия (чтобы игнорить поздние ответы)
    const caseIdAtClick = activeCase.id;

    try {
      const payload = {
        case_id: activeCase.id,
        telegram_id: telegramIdRef.current,
        pay_with: allowStars ? "stars" : "tickets",
      };
      const resp = await postSpin(payload);
      // если пользователь успел переключить колесо — игнорируем этот ответ
      if (!activeCase || activeCase.id !== caseIdAtClick) return;

      setSpinId(resp.spin_id);

      if (resp.status === "lose") {
        setTargetId(resolveTargetIdSafe(null));
        setResult({ status: "lose" });
      } else {
        const tid = resolveTargetIdSafe(resp.prize?.chance_id || null);
        setTargetId(tid);
        setResult({ status: "pending", prize: resp.prize });
      }

      // обновляем баланс после списания
      const { data } = await supabase
        .from("users")
        .select("stars, tickets")
        .eq("telegram_id", telegramIdRef.current)
        .single();
      if (data) setBalance({ stars: Number(data.stars || 0), tickets: Number(data.tickets || 0) });
    } catch (e) {
      setError(e.message);
      setSpinning(false);
      setAnimDone(true); // аварийно считаем анимацию завершённой, чтобы не зависнуть
    }
  }

  // отдельный запуск БЕСПЛАТНОГО спина
  async function handleFreeSpin() {
    if (!activeCase || !freeEnabledForActiveCase) return;

    if (loading || !segmentsReady || !chances.length) {
      setError("Подождите, колесо обновляется…");
      return;
    }

    if (!telegramIdRef.current) {
      setError("Не найден Telegram ID: открой Mini App в Telegram или авторизуйся заново.");
      return;
    }

    setError("");
    setResult(null);
    setSpinning(true);
    setAnimDone(false);
    setTargetId(null);
    setSpinId(null);
    setShowModal(false);
    setActionBusy(false);

    const caseIdAtClick = activeCase.id;

    try {
      const payload = {
        case_id: activeCase.id,
        telegram_id: telegramIdRef.current,
        pay_with: "free",
      };
      const resp = await postSpin(payload);

      if (!activeCase || activeCase.id !== caseIdAtClick) return;

      setSpinId(resp.spin_id);

      if (resp.status === "lose") {
        setTargetId(resolveTargetIdSafe(null));
        setResult({ status: "lose" });
      } else {
        const tid = resolveTargetIdSafe(resp.prize?.chance_id || null);
        setTargetId(tid);
        setResult({ status: "pending", prize: resp.prize });
      }

      // free израсходован — выключаем кнопку локально
      setFreeInfo((x) => ({ ...x, available: false }));
    } catch (e) {
      setError(e.message);
      setSpinning(false);
      setAnimDone(true);
    }
  }

  // конец анимации от колеса
  function handleSpinEnd() {
    setSpinning(false);
    setAnimDone(true);
  }

  async function _handleClaim() {
    if (!spinId || actionBusy) return;
    setActionBusy(true);
    try {
      const resp = await postClaim(spinId);
      if (resp?.status === "reward_sent") {
        setResult((r) => ({ ...r, status: "reward_sent" }));
        setShowModal(false); // закрыть после успешной выдачи
        loadInvCount(); // обновить счётчик
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setActionBusy(false);
    }
  }

  // принимаем текст на кнопке, чтобы показать его в тосте
  async function handleReroll(labelFromUI) {
    if (!spinId || actionBusy) return;
    setActionBusy(true);
    try {
      const resp = await postReroll(spinId);
      setResult((r) => ({ ...r, status: "reroll", reroll: resp }));
      setShowModal(false); // закрыть после обмена

      // тост: "Успешно обменяли на N ..." — берём N из текста кнопки
      if (labelFromUI) {
        const amountText = String(labelFromUI).replace(/^Обменять на\s*/i, "").trim();
        setToast({ text: `Успешно обменяли на ${amountText}` });
      }
      setTimeout(() => setToast(null), 2000);

      loadInvCount(); // обновить счётчик

      // обновить баланс
      const { data } = await supabase
        .from("users")
        .select("stars, tickets")
        .eq("telegram_id", telegramIdRef.current)
        .single();
      if (data) setBalance({ stars: Number(data.stars || 0), tickets: Number(data.tickets || 0) });
    } catch (e) {
      setError(e.message);
    } finally {
      setActionBusy(false);
    }
  }

  // оставить приз pending и просто закрыть модалку
  function handleKeepPending() {
    setShowModal(false);
    setActionBusy(false);
    loadInvCount();
  }

  // сегменты для колеса
  const wheelSegments = useMemo(() => chances, [chances]);

  // баланс для отображения: звёзды только целые
  const displayBalance = allowStars ? Math.floor(balance.stars) : `${balance.tickets} TON`;

  const wheelKey = activeCase ? `wheel-${activeCase.id}` : "wheel-none";

  return (
    <>
      {/* ===== фоновые слои: градиент + canvas со звёздами ===== */}
      <div className="space-bg" aria-hidden="true" />
      <canvas id="spin-stars" className="star-canvas" aria-hidden="true" />

      {/* Инвентарь слева сверху (напротив баланса) */}
      <button
        type="button"
        className="inventory-badge"
        onClick={() => navigate("/inventory")}
        aria-label="Инвентарь"
      >
        🧰 Инвентарь{invCount ? ` (${invCount})` : ""}
      </button>

      {/* Баланс в правом верхнем углу */}
      <div
        style={{
          position: "fixed",
          top: 12,
          right: 12,
          zIndex: 1000,
          background: "rgba(0,0,0,0.5)",
          borderRadius: 20,
          padding: "6px 12px",
          color: "#fff",
          fontWeight: 700,
          fontSize: 14,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {allowStars ? `⭐ ${displayBalance}` : displayBalance}
      </div>

      <div className="spins-page">
        <div
          style={{
            color: "#fff",
            fontWeight: 700,
            fontSize: 14,
            marginBottom: 4,
            opacity: 0.85,
            textAlign: "center",
          }}
        >
          Лента недавних призов:
        </div>

        <WinsTicker />

        {/* Header */}
        <div className="spins-header">
          <div style={{ fontWeight: 800, fontSize: 18 }}></div>
        </div>

        {/* Колесо + тост поверх него */}
        <div className="wheel-zone">
          <SpinWheel
            key={wheelKey}
            segments={wheelSegments}
            targetId={targetId}
            isSpinning={spinning}
            onSpinEnd={handleSpinEnd}
          />
          {toast && <div className="spin-toast spin-toast--on-wheel">{toast.text}</div>}
        </div>

        {/* Кнопка "Показать шансы" справа под колесом */}
        <div style={{ padding: "6px 8px 0", display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={() => setShowChances((v) => !v)}
            className="ghost-btn"
            style={{
              fontSize: 13,
              padding: "6px 10px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.25)",
              background: "rgba(0,0,0,0.35)",
              color: "#fff",
              cursor: "pointer",
            }}
            aria-expanded={showChances}
            aria-controls="chances-panel"
          >
            {showChances ? "Скрыть шансы" : "Показать шансы"}
          </button>
        </div>

        {/* Панель со шансами — справа под колесом */}
        {showChances && (
          <div
            id="chances-panel"
            style={{
              margin: "6px 8px 8px",
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <div
              style={{
                maxWidth: 360,
                width: "100%",
                background: "rgba(0,0,0,0.55)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 14,
                padding: 10,
                color: "#fff",
                boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 14 }}>
                Шансы текущего колеса
              </div>

              {loading ? (
                <div style={{ opacity: 0.8, fontSize: 13 }}>Загрузка…</div>
              ) : chances && chances.length ? (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
                  {chances.map((c) => {
                    const hasChance = Number.isFinite(c.chance);
                    const display = hasChance ? `${c.chance.toFixed(2)}%` : "—";
                    return (
                      <li
                        key={c.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                          padding: "6px 8px",
                          borderRadius: 10,
                          background: "rgba(255,255,255,0.05)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                          <img
                            src={`/animations/${c.slug}.png`}
                            alt=""
                            width={28}
                            height={28}
                            style={{ borderRadius: 6, objectFit: "cover" }}
                            onError={(e) => {
                              e.currentTarget.style.visibility = "hidden";
                              e.currentTarget.width = 0;
                              e.currentTarget.height = 0;
                            }}
                          />
                          <span
                            title={c.label}
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              maxWidth: 220,
                            }}
                          >
                            {c.label}
                          </span>
                        </div>
                        <span
                          style={{
                            fontVariantNumeric: "tabular-nums",
                            fontWeight: 800,
                            fontSize: 13,
                            opacity: hasChance ? 1 : 0.6,
                          }}
                          title={hasChance ? `${c.chance}%` : "Шанс не указан"}
                        >
                          {display}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div style={{ opacity: 0.8, fontSize: 13 }}>Шансы пока не указаны</div>
              )}
            </div>
          </div>
        )}

        {/* Ползунок выбора кейса */}
        <CaseRange
          count={cases.length}
          index={index}
          onChange={setIndex}
          disabled={spinning || loading}
        />

        {/* Управление */}
        <SpinControls
          allowStars={allowStars}
          priceTon={priceTon}
          priceStars={priceStars}
          balanceStars={balance.stars}
          balanceTickets={balance.tickets}
          spinning={spinning}
          onSpin={handleSpin}
          freeAvailable={freeEnabledForActiveCase}
          onSpinFree={handleFreeSpin}
        />

        {/* Результат */}
        {result && showModal && (
          <ResultBlock
            result={result}
            chances={chances}
            allowStars={allowStars}
            starsPerTon={fx.stars_per_ton}
            feeMarkup={fx.fee_markup}
            onKeep={handleKeepPending}
            onReroll={handleReroll}
            actionBusy={actionBusy}
          />
        )}

        {error && (
          <div className="result-banner" style={{ background: "#3b1e1e", color: "#ffb4b4" }}>
            {error}
          </div>
        )}
      </div>
    </>
  );
}

/* Ползунок выбора кейса — точки вместо названий */
function CaseRange({ count, index, onChange, disabled }) {
  if (!count) return null;
  return (
    <div style={{ padding: "6px 8px 2px" }}>
      <input
        type="range"
        min={0}
        max={count - 1}
        step={1}
        value={index}
        onChange={(e) => onChange(Number(e.target.value))}
        className="case-range"
        disabled={disabled}
      />
      <div className="case-range-dots">
        {Array.from({ length: count }).map((_, i) => (
          <span key={i} className={`dot ${i === index ? "active" : ""} ${disabled ? "dim" : ""}`} />
        ))}
      </div>
    </div>
  );
}

/* Блок результата со встроенной логикой обмена */
function ResultBlock({
  result,
  chances,
  allowStars,
  starsPerTon,
  feeMarkup = 0,
  onKeep,
  onReroll,
  actionBusy,
}) {
  if (result.status === "lose") {
    return <div className="result-banner">Не повезло. Попробуй ещё!</div>;
  }

  if (result.status === "pending") {
    const ch = chances.find((x) => x.id === result.prize?.chance_id);

    // базовая сумма в TON: берём первое валидное > 0 из списка кандидатов
    const candidates = [ch?.payout_value, ch?.price, result.prize?.payout_value, result.prize?.price].map(
      (v) => Number(v)
    );
    const baseTon = candidates.find((v) => Number.isFinite(v) && v > 0) || 0;

    // конвертация TON -> ⭐ с учётом fee_markup (уменьшаем выдачу)
    const starsAmount = Math.max(0, Math.ceil(baseTon * (starsPerTon || 0) * (1 - (feeMarkup || 0))));

    const exchangeLabel = allowStars ? `Обменять на ${starsAmount} ⭐` : `Обменять на ${baseTon} TON`;

    return (
      <div className="result-banner" style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src={`/animations/${ch?.slug}.png`} alt="prize" width={40} height={40} />
          <div style={{ fontWeight: 700 }}>Выпало: {ch?.label || result.prize?.nft_name}</div>
        </div>
        <div className="result-cta">
          <button className="primary-btn" onClick={onKeep} disabled={actionBusy}>
            {actionBusy ? "Обработка..." : "В инвентарь"}
          </button>
          <button className="ghost-btn" onClick={() => onReroll(exchangeLabel)} disabled={actionBusy}>
            {actionBusy ? "Обработка..." : exchangeLabel}
          </button>
        </div>
      </div>
    );
  }

  if (result.status === "reward_sent") {
    return <div className="result-banner">Подарок отправлен! Проверь Telegram 🎁</div>;
  }

  if (result.status === "reroll") return null;

  return null;
}
