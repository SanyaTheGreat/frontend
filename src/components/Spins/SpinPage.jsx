import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchCases,
  fetchCaseChance,
  getTelegramId,
  postClaim,
  postReroll,
  postSpin,
} from "./spinsApi";
import { supabase } from "../../supabaseClient"; // как в проекте
import SpinWheel from "./SpinWheel";
import SpinControls from "./SpinControls";
import "./spins.css";

export default function SpinPage() {
  const [cases, setCases] = useState([]);
  const [index, setIndex] = useState(0); // активный кейс
  const [chances, setChances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [spinning, setSpinning] = useState(false);
  const [targetId, setTargetId] = useState(null);
  const [spinId, setSpinId] = useState(null);
  const [result, setResult] = useState(null); // {status, prize?}

  const [balance, setBalance] = useState({ stars: 0, tickets: 0 });
  const telegramIdRef = useRef(getTelegramId());

  // сторожевой таймер окончания анимации
  const spinWatchdogRef = useRef(null);

  const activeCase = cases[index] || null;

  // загрузка кейсов
  useEffect(() => {
    (async () => {
      try {
        const cs = await fetchCases();
        setCases(cs.filter((c) => c.is_active));
      } catch (e) {
        setError(e.message);
      }
    })();
  }, []);

  // загрузка шансов для активного кейса
  useEffect(() => {
    (async () => {
      if (!activeCase) return;
      setLoading(true);
      try {
        const list = await fetchCaseChance(activeCase.id);
        // ожидаем поля: id, nft_name, slug, percent, ...
        const onlyActive = list.filter((x) => x.is_active);
        // нормализуем для колеса
        setChances(
          onlyActive.map((x) => ({
            id: x.id,
            label: x.nft_name,
            slug: x.slug || (x.nft_name || "").toLowerCase().replaceAll(" ", "-"),
            percent: Number(x.percent || 0),
          }))
        );
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
  }, [telegramIdRef.current]);

  const priceTon = useMemo(() => Number(activeCase?.price || 0), [activeCase]);
  const priceStars = useMemo(() => Number(activeCase?.price_in_stars || 0), [activeCase]);
  const allowStars = !!activeCase?.allow_stars;

  // запуск спина
  async function handleSpin() {
    if (!activeCase) return;
    setError("");
    setResult(null);
    setSpinning(true);
    setTargetId(null);
    setSpinId(null);

    // очистить старый таймер, если был
    if (spinWatchdogRef.current) {
      clearTimeout(spinWatchdogRef.current);
      spinWatchdogRef.current = null;
    }

    try {
      const payload = {
        case_id: activeCase.id,
        telegram_id: telegramIdRef.current,
        pay_with: allowStars ? "stars" : "tickets",
      };
      const resp = await postSpin(payload);
      // resp: { spin_id, status: 'pending'|'lose', prize?{chance_id,...} }
      setSpinId(resp.spin_id);

      if (resp.status === "lose") {
        // визуально крутим до сегмента lose (ищем по label/slug); если нет — к первому сегменту
        const loseSeg =
          chances.find(
            (s) => s.label?.toLowerCase() === "lose" || s.slug === "lose"
          ) || chances[0];
        setTargetId(loseSeg?.id || null);
        setResult({ status: "lose" });

        // сторожевой таймер: если transitionend не придёт — отпустить кнопку
        spinWatchdogRef.current = setTimeout(() => {
          setSpinning(false);
          spinWatchdogRef.current = null;
        }, 2600);
      } else {
        setTargetId(resp.prize?.chance_id || null);
        setResult({ status: "pending", prize: resp.prize });

        // сторожевой таймер
        spinWatchdogRef.current = setTimeout(() => {
          setSpinning(false);
          spinWatchdogRef.current = null;
        }, 2600);
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
    }
  }

  // окончание анимации (если событие пришло — снимаем таймер и разблокируем кнопку)
  function handleSpinEnd() {
    if (spinWatchdogRef.current) {
      clearTimeout(spinWatchdogRef.current);
      spinWatchdogRef.current = null;
    }
    setSpinning(false);
  }

  async function handleClaim() {
    if (!spinId) return;
    try {
      const resp = await postClaim(spinId);
      if (resp?.status === "reward_sent") {
        setResult((r) => ({ ...r, status: "reward_sent" }));
      }
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleReroll() {
    if (!spinId) return;
    try {
      const resp = await postReroll(spinId);
      setResult((r) => ({ ...r, status: "reroll", reroll: resp }));
      // обновить баланс после обмена
      const { data } = await supabase
        .from("users")
        .select("stars, tickets")
        .eq("telegram_id", telegramIdRef.current)
        .single();
      if (data) setBalance({ stars: Number(data.stars || 0), tickets: Number(data.tickets || 0) });
    } catch (e) {
      setError(e.message);
    }
  }

  // вью сегментов для колеса
  const wheelSegments = useMemo(() => chances, [chances]);

  // баланс для отображения: звёзды только целые
  const displayBalance = allowStars ? Math.floor(balance.stars) : `${balance.tickets} TON`;

  return (
    <>
      {/* Фиксированный баланс в правом верхнем углу (только один раз) */}
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
        {/* Header (без дубля баланса) */}
        <div className="spins-header">
          <div style={{ fontWeight: 800, fontSize: 18 }}>Spins</div>
        </div>

        {/* Колесо */}
        <SpinWheel
          segments={wheelSegments}
          targetId={targetId}
          isSpinning={spinning}
          onSpinEnd={handleSpinEnd}
        />

        {/* Ползунок выбора кейса (без названий) */}
        <CaseRange count={cases.length} index={index} onChange={setIndex} />

        {/* Управление */}
        <SpinControls
          allowStars={allowStars}
          priceTon={priceTon}
          priceStars={priceStars}
          balanceStars={balance.stars}
          balanceTickets={balance.tickets}
          spinning={spinning}
          onSpin={handleSpin}
        />

        {/* Результат */}
        {result && (
          <ResultBlock
            result={result}
            chances={chances}
            onClaim={handleClaim}
            onReroll={handleReroll}
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
function CaseRange({ count, index, onChange }) {
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
      />
      <div className="case-range-dots">
        {Array.from({ length: count }).map((_, i) => (
          <span key={i} className={`dot ${i === index ? "active" : ""}`} />
        ))}
      </div>
    </div>
  );
}

function ResultBlock({ result, chances, onClaim, onReroll }) {
  if (result.status === "lose") {
    return <div className="result-banner">Не повезло. Попробуй ещё!</div>;
  }

  if (result.status === "pending") {
    const ch = chances.find((x) => x.id === result.prize?.chance_id);
    return (
      <div className="result-banner" style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src={`/animations/${ch?.slug}.png`} alt="prize" width={40} height={40} />
        <div style={{ fontWeight: 700 }}>Выпало: {ch?.label || result.prize?.nft_name}</div>
        </div>
        <div className="result-cta">
          <button className="primary-btn" onClick={onClaim}>Забрать</button>
          <button className="ghost-btn" onClick={onReroll}>Обменять</button>
        </div>
      </div>
    );
  }

  if (result.status === "reward_sent") {
    return <div className="result-banner">Подарок отправлен! Проверь Telegram 🎁</div>;
  }

  // после обмена ничего не показываем
  if (result.status === "reroll") {
    return null;
  }

  return null;
}
