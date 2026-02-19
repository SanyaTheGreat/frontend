import { useEffect, useMemo, useRef, useState } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const API_BASE = "https://lottery-server-waif.onrender.com";

// если у тебя логотип лежит в другом месте — поменяй путь
const LOGO_4096 = "/numbers/4096.png";

const GRID_SIZE = 4;
const ACTIONS_LIMIT = 200;

// ---------- RNG (как на бэке) ----------
function splitmix64(x) {
  let z = (x + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn;
  return (z ^ (z >> 31n)) & 0xffffffffffffffffn;
}
function rand01From64(u64) {
  const v = Number((u64 >> 11n) & ((1n << 53n) - 1n));
  return v / 9007199254740992;
}
function makeRng(seedStr, startIndex = 0) {
  const seed = BigInt(seedStr || "0");
  let idx = BigInt(startIndex || 0);
  return {
    next01() {
      const u = splitmix64((seed + idx) & 0xffffffffffffffffn);
      idx += 1n;
      return rand01From64(u);
    },
    getIndex() {
      return Number(idx);
    },
  };
}

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
function getEmptyCells(grid) {
  const cells = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (!grid[r][c]) cells.push([r, c]);
    }
  }
  return cells;
}
function spawnTile(grid, rng) {
  const empties = getEmptyCells(grid);
  if (empties.length === 0) return false;

  const pick = Math.floor(rng.next01() * empties.length);
  const [r, c] = empties[pick];

  const v = rng.next01() < 0.9 ? 2 : 4;
  grid[r][c] = v;
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
      g[i][0] = line[0]; g[i][1] = line[1]; g[i][2] = line[2]; g[i][3] = line[3];
      return;
    }
    if (dir === "right") {
      g[i][3] = line[0]; g[i][2] = line[1]; g[i][1] = line[2]; g[i][0] = line[3];
      return;
    }
    if (dir === "up") {
      g[0][i] = line[0]; g[1][i] = line[1]; g[2][i] = line[2]; g[3][i] = line[3];
      return;
    }
    if (dir === "down") {
      g[3][i] = line[0]; g[2][i] = line[1]; g[1][i] = line[2]; g[0][i] = line[3];
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
function canMove(grid) {
  if (getEmptyCells(grid).length > 0) return true;
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const v = grid[r][c];
      if (r + 1 < GRID_SIZE && grid[r + 1][c] === v) return true;
      if (c + 1 < GRID_SIZE && grid[r][c + 1] === v) return true;
    }
  }
  return false;
}

function safeGridFromRun(run) {
  const st = run?.state;
  if (!st?.grid || !Array.isArray(st.grid) || st.grid.length !== 4) return null;
  return st.grid;
}

export default function Game2048() {
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState(null);

  const [runId, setRunId] = useState("");
  const [periodId, setPeriodId] = useState("");

  const [seed, setSeed] = useState("");
  const [rngIndex, setRngIndex] = useState(0);

  const [grid, setGrid] = useState(null);
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(0);

  // чтобы не спамили свайпы пока один уже в полёте
  const inFlightRef = useRef(false);

  const token = useMemo(() => localStorage.getItem("jwt") || "", []);

  useEffect(() => {
    setRunId(localStorage.getItem("ffg_2048_run_id") || "");
    setPeriodId(localStorage.getItem("ffg_2048_period_id") || "");
  }, []);

  const applyRunToUi = (data) => {
    const run = data?.run || data; // иногда мы зовём с {run:...}
    if (!run) return;

    if (run?.id) {
      localStorage.setItem("ffg_2048_run_id", run.id);
      setRunId(String(run.id));
    }
    if (data?.period?.id) {
      localStorage.setItem("ffg_2048_period_id", data.period.id);
      setPeriodId(String(data.period.id));
    }

    if (run?.seed) setSeed(String(run.seed));
    if (Number.isFinite(run?.rng_index)) setRngIndex(Number(run.rng_index));

    const g = safeGridFromRun(run);
    if (g) setGrid(g);

    setScore(Number(run?.current_score ?? 0));
    setMoves(Number(run?.moves ?? 0));
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
  const touchStartRef = useRef(null);
  const onTouchStart = (e) => {
    const t = e.touches?.[0];
    if (!t) return;
    touchStartRef.current = { x: t.clientX, y: t.clientY, ts: Date.now() };
  };
  const onTouchEnd = (e) => {
    const s = touchStartRef.current;
    touchStartRef.current = null;
    if (!s) return;

    const t = e.changedTouches?.[0];
    if (!t) return;

    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;

    const ax = Math.abs(dx);
    const ay = Math.abs(dy);

    const TH = 28; // порог
    if (ax < TH && ay < TH) return;

    if (ax > ay) {
      moveOptimistic(dx > 0 ? "right" : "left");
    } else {
      moveOptimistic(dy > 0 ? "down" : "up");
    }
  };

  // ---------- Optimistic move ----------
  const moveOptimistic = async (dir) => {
    const jwt = localStorage.getItem("jwt");
    if (!jwt) {
      toast.error("Нет jwt. Открой Mini App в Telegram заново.");
      return;
    }
    if (inFlightRef.current) return;

    const g = Array.isArray(grid) ? grid : null;
    if (!g || !seed) {
      // если UI ещё не готов — просто просим start/resume
      toast.info("Нажми Start / Resume");
      return;
    }

    // 1) локально считаем ход мгновенно
    const before = cloneGrid(g);
    const { grid: movedGrid, gained, moved } = applyMove(before, dir);
    if (!moved) return;

    const rng = makeRng(seed, rngIndex);
    const afterGrid = cloneGrid(movedGrid);
    spawnTile(afterGrid, rng);

    const nextScore = Number(score ?? 0) + Number(gained ?? 0);
    const nextMoves = Number(moves ?? 0) + 1;
    const nextRng = rng.getIndex();

    // мгновенно в UI
    setGrid(afterGrid);
    setScore(nextScore);
    setMoves(nextMoves);
    setRngIndex(nextRng);

    // 2) отправляем на сервер (авторитет)
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
        // ресинк, чтобы не остаться в рассинхроне
        await startOrResume();
        return;
      }

      // синхронизируемся (если вдруг отличия/сервер закрыл ран)
      applyRunToUi(data);

      if (data?.finished) {
        toast.info(`Game Over (${data?.reason || "finished"})`);
      }
      // ✅ success-toast на каждый ход — УБРАЛИ
    } catch (e) {
      console.error(e);
      toast.error("Ошибка сети (move)");
      // ресинк
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
    setSeed("");
    setRngIndex(0);
    setGrid(null);
    setScore(0);
    setMoves(0);
    toast.info("Локалка очищена");
  };

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
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img
            src={LOGO_4096}
            alt="4096"
            style={{ width: 54, height: 54, objectFit: "contain" }}
            draggable={false}
            onError={(e) => {
              // если png не найден — хотя бы текстом
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

        {/* Controls */}
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

        {/* ids */}
        <div style={{ marginTop: 12, fontSize: 12, opacity: 0.85 }}>
          <div>
            <b>run_id:</b> {runId || "—"}
          </div>
          <div>
            <b>period_id:</b> {periodId || "—"}
          </div>
        </div>

        {/* Board */}
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

        {/* Debug server resp */}
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
            {resp ? JSON.stringify(resp, null, 2) : "Start / Resume → свайпай по полю"}
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
        // ✅ лёгкий pop при появлении (быстро, не 1 сек)
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
          />
        ) : (
          <span style={{ fontWeight: 900, fontSize: 18 }}>{value}</span>
        )
      ) : null}

      {/* inline keyframes чтобы не трогать css файлы */}
      <style>{`
        @keyframes ffgPop {
          0% { transform: scale(0.88); opacity: 0.0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
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
