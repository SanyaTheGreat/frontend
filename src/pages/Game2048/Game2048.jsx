import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const API_BASE = "https://lottery-server-waif.onrender.com";

const LS_RUN_ID = "ffg_2048_run_id";
const LS_PERIOD_ID = "ffg_2048_period_id";
const LS_BEST_WEEKLY = "ffg_2048_best_weekly";

export default function Game2048() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);

  const [runId, setRunId] = useState(localStorage.getItem(LS_RUN_ID) || "");
  const [periodId, setPeriodId] = useState(localStorage.getItem(LS_PERIOD_ID) || "");

  const [grid, setGrid] = useState(null);
  const [score, setScore] = useState(0);

  const [bestWeekly, setBestWeekly] = useState(() => Number(localStorage.getItem(LS_BEST_WEEKLY) || 0));

  const [attempts, setAttempts] = useState({
    daily_attempts_remaining: null,
    referral_attempts_balance: null,
    daily_plays_used: null,
  });

  const token = useMemo(() => localStorage.getItem("jwt") || "", []);

  // swipe
  const touchRef = useRef({ x: 0, y: 0, t: 0, active: false });
  const boardRef = useRef(null);

  const applyServerToUi = (data) => {
    const run = data?.run;
    if (!run) return;

    if (run?.id) {
      localStorage.setItem(LS_RUN_ID, run.id);
      setRunId(String(run.id));
    }
    if (data?.period?.id) {
      localStorage.setItem(LS_PERIOD_ID, data.period.id);
      setPeriodId(String(data.period.id));
    }

    const st = run?.state;
    if (st?.grid) setGrid(st.grid);

    setScore(Number(run?.current_score ?? 0));

    if (data?.attempts) {
      setAttempts({
        daily_attempts_remaining: data.attempts.daily_attempts_remaining ?? null,
        referral_attempts_balance: data.attempts.referral_attempts_balance ?? null,
        daily_plays_used: data.attempts.daily_plays_used ?? null,
      });
    }

    // best weekly: пока без отдельного запроса — обновляем когда сервер вернул leaderboard
    const lb = data?.leaderboard;
    const lbBest = Number(lb?.best_score ?? NaN);
    if (Number.isFinite(lbBest) && lbBest > 0) {
      const nextBest = Math.max(Number(bestWeekly || 0), lbBest);
      setBestWeekly(nextBest);
      localStorage.setItem(LS_BEST_WEEKLY, String(nextBest));
    }
  };

  const startOrResume = async () => {
    const jwt = localStorage.getItem("jwt");
    if (!jwt) {
      toast.error("Нет jwt. Открой Mini App в Telegram заново.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/game/run/start`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        toast.error(data?.error || "Ошибка запуска");
        if (res.status === 401 || res.status === 403) localStorage.removeItem("jwt");
        return;
      }

      applyServerToUi(data);
    } catch (e) {
      console.error(e);
      toast.error("Ошибка сети");
    } finally {
      setLoading(false);
    }
  };

  const move = async (dir) => {
    if (loading) return;

    const jwt = localStorage.getItem("jwt");
    if (!jwt) {
      toast.error("Нет jwt. Открой Mini App в Telegram заново.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/game/run/move`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ dir }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        // ошибок может быть много (freeze/end/no run) — показываем как есть
        toast.error(data?.error || "Move error");
        if (res.status === 401 || res.status === 403) localStorage.removeItem("jwt");
        return;
      }

      applyServerToUi(data);

      // УБИРАЕМ toast на каждый ход — оставляем только финал (это ок)
      if (data?.finished) {
        toast.info("Game Over");
      }
    } catch (e) {
      console.error(e);
      toast.error("Ошибка сети (move)");
    } finally {
      setLoading(false);
    }
  };

  const finishManual = async () => {
    if (loading) return;

    const jwt = localStorage.getItem("jwt");
    if (!jwt) {
      toast.error("Нет jwt. Открой Mini App в Telegram заново.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/game/run/finish`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: "manual" }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        toast.error(data?.error || "Finish error");
        return;
      }

      // /finish возвращает run как data.run (без data.period), поэтому подсовываем в apply
      applyServerToUi({ ...data, run: data.run });

      toast.info("Finished");
    } catch (e) {
      console.error(e);
      toast.error("Ошибка сети (finish)");
    } finally {
      setLoading(false);
    }
  };

  // авто-resume при входе на экран
  useEffect(() => {
    startOrResume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // swipe handlers (only)
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;

    const onTouchStart = (e) => {
      if (loading) return;
      const t = e.touches?.[0];
      if (!t) return;
      touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now(), active: true };
    };

    const onTouchMove = (e) => {
      // не даём странице скроллиться, когда свайпим по полю
      if (touchRef.current.active) e.preventDefault();
    };

    const onTouchEnd = (e) => {
      if (!touchRef.current.active) return;

      const ch = e.changedTouches?.[0];
      if (!ch) {
        touchRef.current.active = false;
        return;
      }

      const dx = ch.clientX - touchRef.current.x;
      const dy = ch.clientY - touchRef.current.y;

      const adx = Math.abs(dx);
      const ady = Math.abs(dy);

      touchRef.current.active = false;

      // порог
      const TH = 28;
      if (Math.max(adx, ady) < TH) return;

      if (adx > ady) {
        move(dx > 0 ? "right" : "left");
      } else {
        move(dy > 0 ? "down" : "up");
      }
    };

    // passive:false чтобы preventDefault работал
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [loading]); // move берётся из замыкания, ок

  // удобный fallback на десктоп (не мешает мобилке)
  useEffect(() => {
    const onKey = (e) => {
      if (loading) return;
      if (e.key === "ArrowUp") move("up");
      if (e.key === "ArrowDown") move("down");
      if (e.key === "ArrowLeft") move("left");
      if (e.key === "ArrowRight") move("right");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [loading]);

  const attemptsLeft = (attempts.daily_attempts_remaining ?? 0) + (attempts.referral_attempts_balance ?? 0);

  return (
    <>
      <div className="starfield" aria-hidden="true" />

      <div style={{ position: "relative", zIndex: 5, padding: 16, color: "white", maxWidth: 520, margin: "0 auto" }}>
        {/* header row like classic 2048 */}
        <div style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
          {/* left brand tile */}
          <div
            style={{
              width: 110,
              borderRadius: 18,
              background: "rgba(255, 152, 0, 0.92)",
              color: "#000",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 1000,
              fontSize: 34,
              letterSpacing: 1,
              boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
              userSelect: "none",
            }}
          >
            4096
          </div>

          {/* score + best */}
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <StatBox label="SCORE" value={score} />
            <StatBox label="BEST" value={bestWeekly} />
            <button type="button" onClick={() => navigate("/")} disabled={loading} style={btnSmall(loading)}>
              MENU
            </button>
            <button type="button" disabled={true} style={btnSmall(true)}>
              LEADERBOARD
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10, opacity: 0.85, fontWeight: 700 }}>
          Attempts left: <span style={{ fontWeight: 900 }}>{attemptsLeft}</span>
          {Number.isFinite(attempts.daily_plays_used) && (
            <span style={{ opacity: 0.75, fontWeight: 700 }}> &nbsp;•&nbsp; daily plays: {attempts.daily_plays_used}/20</span>
          )}
        </div>

        {/* board */}
        <div
          ref={boardRef}
          style={{
            marginTop: 14,
            background: "rgba(0,0,0,0.22)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 22,
            padding: 14,
            touchAction: "none",
            WebkitUserSelect: "none",
            userSelect: "none",
            boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 10,
            }}
          >
            {renderGrid(grid)}
          </div>
        </div>

        {/* optional controls (dev) */}
        <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
          <button type="button" onClick={startOrResume} disabled={loading} style={btnGhost(loading)}>
            Restart / Resume
          </button>
          <button type="button" onClick={finishManual} disabled={loading} style={btnGhost(loading)}>
            Finish
          </button>
        </div>

        <div style={{ marginTop: 10, opacity: 0.55, fontSize: 12 }}>
          Управление: только свайпы по полю (на ПК можно стрелками).
        </div>

        {/* hidden technical */}
        <div style={{ marginTop: 10, opacity: 0.45, fontSize: 11 }}>
          run: {runId ? runId.slice(0, 8) + "…" : "—"} &nbsp;•&nbsp; period: {periodId ? periodId.slice(0, 8) + "…" : "—"}
        </div>
      </div>

      <ToastContainer position="top-right" autoClose={2500} newestOnTop closeOnClick draggable pauseOnHover theme="dark" />
    </>
  );
}

function StatBox({ label, value }) {
  return (
    <div
      style={{
        borderRadius: 16,
        background: "rgba(255,255,255,0.10)",
        border: "1px solid rgba(255,255,255,0.10)",
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 2,
        minHeight: 62,
      }}
    >
      <div style={{ opacity: 0.75, fontWeight: 900, fontSize: 12, letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontWeight: 1000, fontSize: 22, lineHeight: 1.1 }}>{Number(value || 0)}</div>
    </div>
  );
}

function renderGrid(grid) {
  const empty = new Array(16).fill(0);
  const flat =
    Array.isArray(grid) && grid.length === 4 && grid.every((r) => Array.isArray(r) && r.length === 4) ? grid.flat() : empty;

  return flat.map((v, i) => <Tile key={i} value={v} />);
}

function Tile({ value }) {
  const [imgOk, setImgOk] = useState(true);
  const src = value ? `/numbers/${value}.png` : "";

  return (
    <div
      style={{
        aspectRatio: "1 / 1",
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.10)",
        background: value ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.25)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {value ? (
        imgOk ? (
          <img
            src={src}
            alt={String(value)}
            style={{ width: "84%", height: "84%", objectFit: "contain", pointerEvents: "none" }}
            onError={() => setImgOk(false)}
            draggable={false}
          />
        ) : (
          <span style={{ fontWeight: 1000, fontSize: 20 }}>{value}</span>
        )
      ) : null}
    </div>
  );
}

function btnSmall(disabled) {
  return {
    height: 44,
    borderRadius: 14,
    border: "none",
    background: disabled ? "rgba(255,255,255,0.10)" : "rgba(255, 152, 0, 0.92)",
    color: disabled ? "rgba(255,255,255,0.60)" : "#000",
    fontWeight: 1000,
    letterSpacing: 0.6,
    cursor: disabled ? "not-allowed" : "pointer",
    boxShadow: disabled ? "none" : "0 10px 24px rgba(0,0,0,0.35)",
  };
}

function btnGhost(disabled) {
  return {
    flex: 1,
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(0,0,0,0.18)",
    color: "white",
    fontWeight: 900,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.7 : 1,
  };
}
