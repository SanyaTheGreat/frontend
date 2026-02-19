import { useEffect, useMemo, useRef, useState } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const API_BASE = "https://lottery-server-waif.onrender.com";
const LOGO_4096 = "/numbers/4096.png";

const GRID_SIZE = 4;

// ---------- 2048 logic (как на бэке) ----------
function cloneGrid(g) {
  return g.map((row) => row.slice());
}
function gridsEqual(a, b) {
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (a[r][c] !== b[r][c]) return false;
    }
  }
  return true;
}
function slideAndMergeLine(line) {
  const filtered = line.filter((x) => x !== 0);
  const out = [];
  let score = 0;

  for (let i = 0; i < filtered.length; i++) {
    if (i + 1 < filtered.length && filtered[i] === filtered[i + 1]) {
      const merged = filtered[i] * 2;
      out.push(merged);
      score += merged;
      i += 1;
    } else {
      out.push(filtered[i]);
    }
  }

  while (out.length < GRID_SIZE) out.push(0);
  return { line: out, score };
}
function applyMove(grid, dir) {
  const g = cloneGrid(grid);
  let gained = 0;

  const readLine = (i) => {
    if (dir === "left") return [g[i][0], g[i][1], g[i][2], g[i][3]];
    if (dir === "right") return [g[i][3], g[i][2], g[i][1], g[i][0]];
    if (dir === "up") return [g[0][i], g[1][i], g[2][i], g[3][i]];
    if (dir === "down") return [g[3][i], g[2][i], g[1][i], g[0][i]];
    return null;
  };

  const writeLine = (i, line) => {
    if (dir === "left") {
      g[i][0] = line[0];
      g[i][1] = line[1];
      g[i][2] = line[2];
      g[i][3] = line[3];
      return;
    }
    if (dir === "right") {
      g[i][3] = line[0];
      g[i][2] = line[1];
      g[i][1] = line[2];
      g[i][0] = line[3];
      return;
    }
    if (dir === "up") {
      g[0][i] = line[0];
      g[1][i] = line[1];
      g[2][i] = line[2];
      g[3][i] = line[3];
      return;
    }
    if (dir === "down") {
      g[3][i] = line[0];
      g[2][i] = line[1];
      g[1][i] = line[2];
      g[0][i] = line[3];
      return;
    }
  };

  for (let i = 0; i < GRID_SIZE; i++) {
    const line = readLine(i);
    const { line: merged, score } = slideAndMergeLine(line);
    gained += score;
    writeLine(i, merged);
  }

  return { grid: g, gained, moved: !gridsEqual(grid, g) };
}

function safeGridFromRun(run) {
  const st = run?.state;
  if (!st?.grid || !Array.isArray(st.grid) || st.grid.length !== 4) return null;
  return st.grid;
}

function compactResp(resp) {
  if (!resp) return null;
  const d = resp.data || {};
  const run = d.run || null;

  return {
    status: resp.status,
    ok: resp.ok,
    data: {
      ok: d.ok,
      moved: d.moved,
      gained: d.gained,
      finished: d.finished,
      reason: d.reason,
      run: run
        ? {
            id: run.id,
            status: run.status,
            moves: run.moves,
            current_score: run.current_score,
            rng_index: run.rng_index,
            period_id: run.period_id,
            seed: run.seed,
          }
        : null,
    },
  };
}

export default function Game2048() {
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState(null);

  const [runId, setRunId] = useState("");
  const [periodId, setPeriodId] = useState("");

  const [grid, setGrid] = useState(null);
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(0);

  // refs — авторитетное состояние (что мы приняли от сервера ИЛИ локально применили без спавна)
  const gridRef = useRef(null);
  const scoreRef = useRef(0);
  const movesRef = useRef(0);

  const inFlightRef = useRef(false);
  const touchStartRef = useRef(null);

  useMemo(() => localStorage.getItem("jwt") || "", []);

  // Preload PNG tiles
  useEffect(() => {
    const values = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096];
    values.forEach((v) => {
      const img = new Image();
      img.src = `/numbers/${v}.png`;
      img.decoding = "async";
    });
  }, []);

  useEffect(() => {
    setRunId(localStorage.getItem("ffg_2048_run_id") || "");
    setPeriodId(localStorage.getItem("ffg_2048_period_id") || "");
  }, []);

  const applyRunToUi = (data) => {
    const run = data?.run || data;
    if (!run) return;

    if (run?.id) {
      localStorage.setItem("ffg_2048_run_id", run.id);
      setRunId(String(run.id));
    }
    if (data?.period?.id) {
      localStorage.setItem("ffg_2048_period_id", data.period.id);
      setPeriodId(String(data.period.id));
    }

    const g = safeGridFromRun(run);
    if (g) {
      setGrid(g);
      gridRef.current = g;
    }

    const sc = Number(run?.current_score ?? 0);
    setScore(sc);
    scoreRef.current = sc;

    const mv = Number(run?.moves ?? 0);
    setMoves(mv);
    movesRef.current = mv;
  };

  const startOrResume = async () => {
    const jwt = localStorage.getItem("jwt");
    if (!jwt) {
      toast.error("Нет jwt. Открой Mini App в Telegram заново.");
      return;
    }

    setLoading(true);
    setResp(null);

    try {
      const res = await fetch(`${API_BASE}/game/run/start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      });

      const data = await res.json().catch(() => ({}));
      setResp({ status: res.status, ok: res.ok, data });

      if (!res.ok || !data?.ok) {
        toast.error(data?.error || "Ошибка запуска");
        if (res.status === 401 || res.status === 403) localStorage.removeItem("jwt");
        return;
      }

      applyRunToUi(data);
    } catch (e) {
      console.error(e);
      toast.error("Ошибка сети");
    } finally {
      setLoading(false);
    }
  };

  // ---------- SWIPE ----------
  const onTouchStart = (e) => {
    const t = e.touches?.[0];
    if (!t) return;
    touchStartRef.current = { x: t.clientX, y: t.clientY, ts: Date.now() };
  };

  const onTouchEnd = (e) => {
    if (inFlightRef.current) return;

    const s = touchStartRef.current;
    touchStartRef.current = null;
    if (!s) return;

    const t = e.changedTouches?.[0];
    if (!t) return;

    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;

    const ax = Math.abs(dx);
    const ay = Math.abs(dy);

    const TH = 28;
    if (ax < TH && ay < TH) return;

    if (ax > ay) moveNoSpawn(dx > 0 ? "right" : "left");
    else moveNoSpawn(dy > 0 ? "down" : "up");
  };

  // ---------- Move WITHOUT fake spawn ----------
  const moveNoSpawn = async (dir) => {
    const jwt = localStorage.getItem("jwt");
    if (!jwt) {
      toast.error("Нет jwt. Открой Mini App в Telegram заново.");
      return;
    }
    if (inFlightRef.current) return;

    const g = gridRef.current;
    if (!g) {
      toast.info("Нажми Start / Resume");
      return;
    }

    // 1) локально показываем только сдвиг/слияние (БЕЗ спавна)
    const before = cloneGrid(g);
    const { grid: movedGrid, gained, moved } = applyMove(before, dir);
    if (!moved) return;

    const nextScore = Number(scoreRef.current ?? 0) + Number(gained ?? 0);
    const nextMoves = Number(movesRef.current ?? 0) + 1;

    gridRef.current = movedGrid;
    scoreRef.current = nextScore;
    movesRef.current = nextMoves;

    setGrid(movedGrid);
    setScore(nextScore);
    setMoves(nextMoves);

    // 2) сервер — авторитет. Он пришлёт финальную сетку уже со спавном.
    inFlightRef.current = true;
    setResp(null);

    try {
      const res = await fetch(`${API_BASE}/game/run/move`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ dir }),
      });

      const data = await res.json().catch(() => ({}));
      setResp({ status: res.status, ok: res.ok, data });

      if (!res.ok || !data?.ok) {
        toast.error(data?.error || "Move error");
        if (res.status === 401 || res.status === 403) localStorage.removeItem("jwt");
        await startOrResume();
        return;
      }

      // ✅ применяем ТОЛЬКО серверную сетку (там правильный спавн)
      applyRunToUi(data);

      if (data?.finished) toast.info(`Game Over (${data?.reason || "finished"})`);
    } catch (e) {
      console.error(e);
      toast.error("Ошибка сети (move)");
      await startOrResume();
    } finally {
      inFlightRef.current = false;
    }
  };

  const finish = async () => {
    const jwt = localStorage.getItem("jwt");
    if (!jwt) {
      toast.error("Нет jwt. Открой Mini App в Telegram заново.");
      return;
    }

    setLoading(true);
    setResp(null);

    try {
      const res = await fetch(`${API_BASE}/game/run/finish`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "manual" }),
      });

      const data = await res.json().catch(() => ({}));
      setResp({ status: res.status, ok: res.ok, data });

      if (!res.ok || !data?.ok) {
        toast.error(data?.error || "Finish error");
        return;
      }

      applyRunToUi({ ...data, run: data.run });
      toast.success("Finished");
    } catch (e) {
      console.error(e);
      toast.error("Ошибка сети (finish)");
    } finally {
      setLoading(false);
    }
  };

  const clearLocal = () => {
    localStorage.removeItem("ffg_2048_run_id");
    localStorage.removeItem("ffg_2048_period_id");
    setRunId("");
    setPeriodId("");

    setGrid(null);
    gridRef.current = null;

    setScore(0);
    scoreRef.current = 0;

    setMoves(0);
    movesRef.current = 0;

    toast.info("Локалка очищена");
  };

  const debug = compactResp(resp);

  return (
    <>
      <div className="starfield" aria-hidden="true" />

      <div
        style={{
          position: "relative",
          zIndex: 5,
          padding: 16,
          color: "white",
          maxWidth: 720,
          margin: "0 auto",
        }}
      >
        <style>{`
          @keyframes ffgPop {
            0% { transform: scale(0.88); opacity: 0.0; }
            100% { transform: scale(1); opacity: 1; }
          }
        `}</style>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img
            src={LOGO_4096}
            alt="4096"
            style={{ width: 54, height: 54, objectFit: "contain" }}
            draggable={false}
            loading="eager"
            decoding="async"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
          <div>
            <div style={{ fontWeight: 900, fontSize: 18, lineHeight: 1 }}>4096</div>
            <div style={{ opacity: 0.75, fontSize: 12 }}>Свайпы • без кнопок</div>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right", fontSize: 12, opacity: 0.85 }}>
            <div>
              <b>Score:</b> {score}
            </div>
            <div>
              <b>Moves:</b> {moves}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={startOrResume} disabled={loading} style={btnPrimary(loading)}>
            {loading ? "Запускаем..." : "Start / Resume"}
          </button>

          <button type="button" onClick={finish} disabled={loading} style={btnGhost(loading)}>
            Finish (manual)
          </button>

          <button type="button" onClick={clearLocal} style={btnGhost(false)}>
            Clear local
          </button>
        </div>

        <div style={{ marginTop: 12, fontSize: 12, opacity: 0.85 }}>
          <div>
            <b>run_id:</b> {runId || "—"}
          </div>
          <div>
            <b>period_id:</b> {periodId || "—"}
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 900, marginBottom: 8, opacity: 0.9 }}>Поле</div>

          <div
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            style={{
              width: "fit-content",
              borderRadius: 18,
              padding: 12,
              background: "rgba(0,0,0,0.20)",
              border: "1px solid rgba(255,255,255,0.10)",
              touchAction: "none",
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 72px)",
                gap: 10,
              }}
            >
              {renderGrid(grid)}
            </div>
          </div>

          <div style={{ opacity: 0.65, fontSize: 12, marginTop: 8 }}>
            Tiles: <code>/public/numbers/2.png ... 4096.png</code>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Ответ сервера (debug)</div>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: "rgba(0,0,0,0.35)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 14,
              padding: 12,
              fontSize: 12,
              lineHeight: 1.35,
              minHeight: 120,
            }}
          >
            {debug ? JSON.stringify(debug, null, 2) : "Start / Resume → свайпай по полю"}
          </pre>
        </div>
      </div>

      <ToastContainer position="top-right" autoClose={2200} newestOnTop closeOnClick draggable pauseOnHover theme="dark" />
    </>
  );
}

function renderGrid(grid) {
  const empty = new Array(16).fill(0);
  const flat =
    Array.isArray(grid) && grid.length === 4 && grid.every((r) => Array.isArray(r) && r.length === 4)
      ? grid.flat()
      : empty;

  return flat.map((v, i) => <Tile key={i} value={v} />);
}

function Tile({ value }) {
  const [imgOk, setImgOk] = useState(true);
  const src = value ? `/numbers/${value}.png` : "";

  return (
    <div
      style={{
        width: 72,
        height: 72,
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.12)",
        background: value ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.25)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        animation: value ? "ffgPop 120ms ease-out" : "none",
      }}
    >
      {value ? (
        imgOk ? (
          <img
            src={src}
            alt={String(value)}
            style={{ width: "82%", height: "82%", objectFit: "contain", pointerEvents: "none" }}
            onError={() => setImgOk(false)}
            draggable={false}
            loading="eager"
            decoding="async"
            fetchPriority={value === 2 || value === 4 ? "high" : "auto"}
          />
        ) : (
          <span style={{ fontWeight: 900, fontSize: 18 }}>{value}</span>
        )
      ) : null}
    </div>
  );
}

function btnPrimary(disabled) {
  return {
    padding: "12px 14px",
    borderRadius: 12,
    border: "none",
    background: "#ff9800",
    color: "#000",
    fontWeight: 900,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.85 : 1,
  };
}
function btnGhost(disabled) {
  return {
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.2)",
    background: "rgba(0,0,0,0.2)",
    color: "white",
    fontWeight: 800,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.7 : 1,
  };
}