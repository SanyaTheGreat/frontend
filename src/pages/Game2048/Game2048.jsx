import { useEffect, useMemo, useRef, useState } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const API_BASE = "https://lottery-server-waif.onrender.com";
const LOGO_4096 = "/numbers/4096.png";

const GRID_SIZE = 4;

// sizes
const CELL = 80;
const GAP = 8;
const BOARD_PAD = 12;

// animations
const POP_MS = 230;
const MOVE_EASE = "cubic-bezier(0.22, 0.9, 0.26, 1)";

// ✅ “реальная” механика: скорость постоянная, время зависит от расстояния
const MOVE_PER_CELL_MS = 70; // мс на 1 клетку (подкрути: 60 быстрее, 80 медленнее)
const MOVE_MIN_MS = 60;      // минимальная длительность, чтобы 1 клетка не была слишком резкой
const MOVE_MAX_MS = 260;     // максимальная длительность, чтобы 3 клетки не были слишком долгими

function posToPx(r, c) {
  return { x: c * (CELL + GAP), y: r * (CELL + GAP) };
}

function safeGridFromRun(run) {
  const st = run?.state;
  if (!st?.grid || !Array.isArray(st.grid) || st.grid.length !== 4) return null;
  return st.grid;
}

// ---------- Tile engine ----------
let __tileId = 1;
function newTileId() {
  __tileId += 1;
  return String(__tileId);
}

/**
 * tiles: Map(id -> {id,value,r,c, removeAt?, pop?, z?, appearAt?, moveMs?})
 * board: 2D of tileId|null
 */
function buildTilesFromGrid(grid) {
  const tiles = new Map();
  const board = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const v = Number(grid?.[r]?.[c] ?? 0);
      if (!v) continue;
      const id = newTileId();
      tiles.set(id, { id, value: v, r, c, pop: true, z: 1, moveMs: 0 });
      board[r][c] = id;
    }
  }
  return { tiles, board };
}

function getLineCoords(i, dir) {
  const coords = [];
  if (dir === "left") for (let c = 0; c < GRID_SIZE; c++) coords.push([i, c]);
  if (dir === "right") for (let c = GRID_SIZE - 1; c >= 0; c--) coords.push([i, c]);
  if (dir === "up") for (let r = 0; r < GRID_SIZE; r++) coords.push([r, i]);
  if (dir === "down") for (let r = GRID_SIZE - 1; r >= 0; r--) coords.push([r, i]);
  return coords;
}

function coordsIndexToWrite(i, k, dir) {
  if (dir === "left") return [i, k];
  if (dir === "right") return [i, GRID_SIZE - 1 - k];
  if (dir === "up") return [k, i];
  if (dir === "down") return [GRID_SIZE - 1 - k, i];
  return [i, k];
}

function gridsEqualValues(a, b) {
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if ((a?.[r]?.[c] ?? 0) !== (b?.[r]?.[c] ?? 0)) return false;
    }
  }
  return true;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function moveDurationMs(distCells) {
  const ms = distCells * MOVE_PER_CELL_MS;
  return clamp(ms, MOVE_MIN_MS, MOVE_MAX_MS);
}

function applyMoveAnimated(tiles, board, dir) {
  const now = Date.now();

  const nextTiles = new Map();
  for (const [id, t] of tiles.entries()) {
    nextTiles.set(id, {
      ...t,
      pop: false,
      z: t.z ?? 1,
      removeAt: null,
      moveMs: 0,
    });
  }

  const nextBoard = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
  const nextGridValues = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));

  let gained = 0;
  let anyMoved = false;
  let zCounter = 10;

  let maxAnimEndAt = now; // ✅ для корректного таймера очистки

  for (let i = 0; i < GRID_SIZE; i++) {
    const coords = getLineCoords(i, dir);

    const line = [];
    for (const [r, c] of coords) {
      const id = board[r][c];
      if (!id) continue;
      const t = nextTiles.get(id);
      if (t) line.push({ id, value: t.value });
    }

    const out = [];
    let p = 0;

    while (p < line.length) {
      const cur = line[p];
      const nxt = line[p + 1];

      if (nxt && cur.value === nxt.value) {
        const mergedValue = cur.value * 2;
        gained += mergedValue;

        const targetIndex = out.length;
        const [tr, tc] = coordsIndexToWrite(i, targetIndex, dir);

        const a = nextTiles.get(cur.id);
        const b = nextTiles.get(nxt.id);

        // ✅ длительность зависит от расстояния (в клетках)
        let aArriveAt = now;
        let bArriveAt = now;

        if (a) {
          const dist = Math.abs(a.r - tr) + Math.abs(a.c - tc);
          const ms = dist > 0 ? moveDurationMs(dist) : 0;
          if (dist > 0) anyMoved = true;

          a.r = tr;
          a.c = tc;
          a.z = zCounter++;
          a.moveMs = ms;
          a.removeAt = now + ms;

          aArriveAt = now + ms;
          maxAnimEndAt = Math.max(maxAnimEndAt, aArriveAt);
        }

        if (b) {
          const dist = Math.abs(b.r - tr) + Math.abs(b.c - tc);
          const ms = dist > 0 ? moveDurationMs(dist) : 0;
          if (dist > 0) anyMoved = true;

          b.r = tr;
          b.c = tc;
          b.z = zCounter++;
          b.moveMs = ms;
          b.removeAt = now + ms;

          bArriveAt = now + ms;
          maxAnimEndAt = Math.max(maxAnimEndAt, bArriveAt);
        }

        // ✅ новый тайл появляется когда оба доехали
        const mergeArriveAt = Math.max(aArriveAt, bArriveAt);

        const newId = newTileId();
        nextTiles.set(newId, {
          id: newId,
          value: mergedValue,
          r: tr,
          c: tc,
          pop: false,
          z: zCounter++,
          appearAt: mergeArriveAt,
          moveMs: 0,
        });
        maxAnimEndAt = Math.max(maxAnimEndAt, mergeArriveAt);

        out.push({ id: newId, value: mergedValue, r: tr, c: tc });
        p += 2;
      } else {
        const targetIndex = out.length;
        const [tr, tc] = coordsIndexToWrite(i, targetIndex, dir);

        const t = nextTiles.get(cur.id);
        if (t) {
          const dist = Math.abs(t.r - tr) + Math.abs(t.c - tc);
          const ms = dist > 0 ? moveDurationMs(dist) : 0;
          if (dist > 0) anyMoved = true;

          t.r = tr;
          t.c = tc;
          t.z = zCounter++;
          t.moveMs = ms;

          const arriveAt = now + ms;
          maxAnimEndAt = Math.max(maxAnimEndAt, arriveAt);
        }

        out.push({ id: cur.id, value: cur.value, r: tr, c: tc });
        p += 1;
      }
    }

    for (const item of out) {
      nextBoard[item.r][item.c] = item.id;
      nextGridValues[item.r][item.c] = item.value;
    }
  }

  const maxAnimMs = Math.max(0, maxAnimEndAt - now);

  return {
    nextTiles,
    nextBoard,
    gained,
    moved: anyMoved,
    nextGridValues,
    maxAnimMs, // ✅ сколько ждать до cleanup
  };
}

// ---------- Component ----------
export default function Game2048() {
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState(null);

  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(0);
  const [bestScore, setBestScore] = useState(0);

  const [tilesArr, setTilesArr] = useState([]);
  const [hintOpen, setHintOpen] = useState(false);

  const tilesRef = useRef(new Map());
  const boardRefState = useRef(Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null)));
  const gridValuesRef = useRef(Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0)));

  const inFlightRef = useRef(false);
  const touchStartRef = useRef(null);

  const boardRef = useRef(null);

  useMemo(() => localStorage.getItem("jwt") || "", []);

  // Telegram WebApp
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    try {
      tg?.ready?.();
      tg?.expand?.();
      tg?.disableVerticalSwipes?.();
    } catch (_) {}
  }, []);

  // best score (local)
  useEffect(() => {
    const v = Number(localStorage.getItem("ffg_2048_best") || 0);
    setBestScore(Number.isFinite(v) ? v : 0);
  }, []);

  useEffect(() => {
    setBestScore((prev) => {
      const next = Math.max(prev, score);
      if (next !== prev) localStorage.setItem("ffg_2048_best", String(next));
      return next;
    });
  }, [score]);

  // close hint by ESC
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setHintOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // block "pull" inside board
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const prevent = (e) => e.preventDefault();
    el.addEventListener("touchmove", prevent, { passive: false });
    return () => el.removeEventListener("touchmove", prevent);
  }, []);

  // preload png + force decode (especially 2/4)
  useEffect(() => {
    const values = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096];

    values.forEach((v) => {
      const img = new Image();
      img.src = `/numbers/${v}.png`;
      img.loading = "eager";
      img.decoding = v === 2 || v === 4 ? "sync" : "async";
      try {
        img.decode?.().catch(() => {});
      } catch (_) {}
    });
  }, []);

  function syncTilesArrFromRef() {
    const now = Date.now();
    const list = [];
    for (const t of tilesRef.current.values()) {
      if (t.appearAt && now < t.appearAt) continue;
      list.push(t);
    }
    list.sort((a, b) => (a.z ?? 1) - (b.z ?? 1));
    setTilesArr(list);
  }

  function reconcileWithServerGrid(serverGrid) {
    const current = gridValuesRef.current;

    const hasAny = current.some((row) => row.some((v) => v > 0));
    if (!hasAny) {
      const built = buildTilesFromGrid(serverGrid);
      tilesRef.current = built.tiles;
      boardRefState.current = built.board;
      gridValuesRef.current = serverGrid.map((r) => r.slice());
      syncTilesArrFromRef();
      return;
    }

    if (gridsEqualValues(current, serverGrid)) return;

    const diffs = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const a = current[r][c] ?? 0;
        const b = serverGrid[r][c] ?? 0;
        if (a !== b) diffs.push({ r, c, a, b });
      }
    }

    if (diffs.length === 1) {
      const d = diffs[0];
      const isSpawn = d.a === 0 && (d.b === 2 || d.b === 4);
      if (isSpawn) {
        const board = boardRefState.current;
        const map = new Map(tilesRef.current);

        if (!board[d.r][d.c]) {
          const id = newTileId();

          let zMax = 1;
          for (const t of map.values()) zMax = Math.max(zMax, t.z ?? 1);

          map.set(id, { id, value: d.b, r: d.r, c: d.c, pop: true, z: zMax + 5, moveMs: 0 });
          board[d.r][d.c] = id;

          tilesRef.current = map;
          boardRefState.current = board;
          gridValuesRef.current = serverGrid.map((r) => r.slice());
          syncTilesArrFromRef();
          return;
        }
      }
    }

    const built = buildTilesFromGrid(serverGrid);
    tilesRef.current = built.tiles;
    boardRefState.current = built.board;
    gridValuesRef.current = serverGrid.map((r) => r.slice());
    syncTilesArrFromRef();
  }

  function applyServerSpawn(spawn) {
    if (!spawn) return;
    const r = Number(spawn.r);
    const c = Number(spawn.c);
    const v = Number(spawn.v);

    if (!Number.isFinite(r) || !Number.isFinite(c) || !Number.isFinite(v)) return;
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return;
    if (!(v === 2 || v === 4)) return;

    const curGrid = gridValuesRef.current;
    if (curGrid?.[r]?.[c]) return;

    const nextGrid = curGrid.map((row) => row.slice());
    nextGrid[r][c] = v;
    gridValuesRef.current = nextGrid;

    const board = boardRefState.current;
    if (board[r][c]) return;

    const map = new Map(tilesRef.current);
    let zMax = 1;
    for (const t of map.values()) zMax = Math.max(zMax, t.z ?? 1);

    const id = newTileId();
    map.set(id, { id, value: v, r, c, pop: true, z: zMax + 50, moveMs: 0 });
    board[r][c] = id;

    tilesRef.current = map;
    boardRefState.current = board;
    syncTilesArrFromRef();
  }

  function applyRunToUi(data) {
    const run = data?.run || data;
    if (!run) return;

    const g = safeGridFromRun(run);
    if (g) reconcileWithServerGrid(g);

    setScore(Number(run?.current_score ?? 0));
    setMoves(Number(run?.moves ?? 0));
  }

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

      const run = data?.run;
      const g = safeGridFromRun(run);
      if (g) {
        const built = buildTilesFromGrid(g);
        tilesRef.current = built.tiles;
        boardRefState.current = built.board;
        gridValuesRef.current = g.map((r) => r.slice());
        syncTilesArrFromRef();
      }

      applyRunToUi(data);
    } catch (e) {
      console.error(e);
      toast.error("Ошибка сети");
    } finally {
      setLoading(false);
    }
  };

  const onTouchStart = (e) => {
    e.preventDefault?.();
    const t = e.touches?.[0];
    if (!t) return;
    touchStartRef.current = { x: t.clientX, y: t.clientY, ts: Date.now() };
  };

  const onTouchEnd = (e) => {
    e.preventDefault?.();
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

    if (ax > ay) moveAnimated(dx > 0 ? "right" : "left");
    else moveAnimated(dy > 0 ? "down" : "up");
  };

  const moveAnimated = async (dir) => {
    const jwt = localStorage.getItem("jwt");
    if (!jwt) {
      toast.error("Нет jwt. Открой Mini App в Telegram заново.");
      return;
    }
    if (inFlightRef.current) return;

    const curValues = gridValuesRef.current;
    const hasAny = curValues.some((row) => row.some((v) => v > 0));
    if (!hasAny) {
      toast.info("Нажми Start / Resume");
      return;
    }

    const beforeTiles = tilesRef.current;
    const beforeBoard = boardRefState.current;

    const { nextTiles, nextBoard, gained, moved, nextGridValues, maxAnimMs } = applyMoveAnimated(beforeTiles, beforeBoard, dir);
    if (!moved) return;

    tilesRef.current = nextTiles;
    boardRefState.current = nextBoard;
    gridValuesRef.current = nextGridValues;

    setScore((prev) => prev + gained);
    setMoves((prev) => prev + 1);
    syncTilesArrFromRef();

    // ✅ cleanup строго после максимальной анимации
    window.setTimeout(() => {
      const now = Date.now();
      const map = new Map(tilesRef.current);

      for (const [id, t] of map.entries()) {
        if (t.removeAt && now >= t.removeAt) map.delete(id);
      }
      for (const t of map.values()) {
        if (t.appearAt && now >= t.appearAt) {
          t.pop = true;
          delete t.appearAt;
        }
        // ✅ чтобы следующий ход снова посчитал корректную длительность
        if (t.moveMs) delete t.moveMs;
      }

      tilesRef.current = map;
      syncTilesArrFromRef();
    }, maxAnimMs + 8);

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

      applyServerSpawn(data?.spawn);
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

  const boardW = GRID_SIZE * CELL + (GRID_SIZE - 1) * GAP;
  const boardH = boardW;

  const chainValues = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096];

  return (
    <>
      <style>{`
        .starfield{
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background-color: #070712;
          background-image:
            radial-gradient(circle at 20% 30%, rgba(255,255,255,0.22) 1px, transparent 2px),
            radial-gradient(circle at 70% 10%, rgba(255,255,255,0.16) 1px, transparent 2px),
            radial-gradient(circle at 40% 80%, rgba(255,255,255,0.12) 1px, transparent 2px),
            radial-gradient(circle at 90% 60%, rgba(255,255,255,0.10) 1px, transparent 2px),
            radial-gradient(circle at 10% 70%, rgba(255,255,255,0.08) 1px, transparent 2px);
          background-size: 420px 420px, 520px 520px, 680px 680px, 900px 900px, 1200px 1200px;
          background-repeat: repeat;
          animation: starScroll 18s linear infinite;
          opacity: 1;
        }
        @keyframes starScroll{
          0%   { background-position: 0px 0px, 0px 0px, 0px 0px, 0px 0px, 0px 0px; }
          100% { background-position: 0px -420px, 0px -520px, 0px -680px, 0px -900px, 0px -1200px; }
        }

        @keyframes ffgPop {
          0% { transform: scale(0.92); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }

        @keyframes hintIn {
          0% { transform: translate3d(0, 18px, 0) scale(0.98); opacity: 0; }
          100% { transform: translate3d(0, 0, 0) scale(1); opacity: 1; }
        }
      `}</style>

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
        {/* Top row */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: 16,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              display: "grid",
              placeItems: "center",
              flex: "0 0 auto",
              boxSizing: "border-box",
            }}
          >
            <img
              src={LOGO_4096}
              alt="4096"
              style={{ width: 60, height: 60, objectFit: "contain", display: "block" }}
              draggable={false}
              loading="eager"
              decoding="async"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
            <div style={{ display: "flex", gap: 10 }}>
              <StatBox label="SCORE" value={score} />
              <StatBox label="BEST" value={bestScore} />
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button type="button" onClick={startOrResume} disabled={loading} style={btnPrimary(loading)}>
                {loading ? "Запускаем..." : "Start / Resume"}
              </button>

              <button type="button" onClick={finish} disabled={loading} style={btnGhost(loading)}>
                Finish
              </button>
            </div>
          </div>
        </div>

        {/* Board */}
        <div style={{ marginTop: 14 }}>
          <div
            ref={boardRef}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            style={{
              width: "fit-content",
              borderRadius: 18,
              padding: BOARD_PAD,
              background: "rgba(0,0,0,0.20)",
              border: "1px solid rgba(255,255,255,0.10)",
              touchAction: "none",
              userSelect: "none",
              WebkitUserSelect: "none",
              overscrollBehavior: "none",
              WebkitOverflowScrolling: "auto",
              margin: "0 auto",
              boxSizing: "border-box",
            }}
          >
            <div style={{ position: "relative", width: boardW, height: boardH, borderRadius: 16, boxSizing: "border-box" }}>
              {/* background cells */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "grid",
                  gridTemplateColumns: `repeat(${GRID_SIZE}, ${CELL}px)`,
                  gap: GAP,
                  boxSizing: "border-box",
                }}
              >
                {Array.from({ length: 16 }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: CELL,
                      height: CELL,
                      borderRadius: 16,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(0,0,0,0.25)",
                      boxSizing: "border-box",
                    }}
                  />
                ))}
              </div>

              {/* tiles */}
              <div style={{ position: "absolute", inset: 0 }}>
                {tilesArr.map((t) => (
                  <AnimatedTile key={t.id} tile={t} />
                ))}
              </div>
            </div>
          </div>

          {/* Hint button under board */}
          <div style={{ height: 12 }} />
          <div style={{ display: "flex", justifyContent: "center" }}>
            <button type="button" onClick={() => setHintOpen(true)} style={btnGhost(false)}>
              Подсказка
            </button>
          </div>
        </div>
      </div>

      {/* Hint modal */}
      {hintOpen && (
        <div
          onClick={() => setHintOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 9999,
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "calc(100vw - 32px)",
              maxWidth: 720,
              boxSizing: "border-box",
              borderRadius: 16,
              background: "rgba(10,10,14,0.95)",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 18px 46px rgba(0,0,0,0.5)",
              padding: 14,
              color: "white",
              overflow: "hidden",
              animation: "hintIn 180ms ease-out",
            }}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={{ fontWeight: 900, letterSpacing: 0.3 }}>Подсказка</div>
              <button
                type="button"
                onClick={() => setHintOpen(false)}
                style={{
                  marginLeft: "auto",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 22,
                  lineHeight: 1,
                  color: "rgba(255,255,255,0.9)",
                  padding: 6,
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div style={{ height: 10 }} />

            <div
              style={{
                maxWidth: "100%",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 12,
                padding: 12,
                overflowX: "auto",
                overflowY: "hidden",
                WebkitOverflowScrolling: "touch",
                boxSizing: "border-box",
              }}
            >
              <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                {chainValues.map((v, idx) => (
                  <div key={v} style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                    <HintTile value={v} />
                    {idx !== chainValues.length - 1 ? (
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 900,
                          color: "rgba(255,255,255,0.9)",
                          opacity: 0.9,
                          padding: "0 2px",
                          flex: "0 0 auto",
                        }}
                      >
                        →
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ height: 10 }} />
            <div style={{ fontSize: 12, opacity: 0.8 }}>Последовательность значений (от меньшего к большему).</div>
          </div>
        </div>
      )}

      <ToastContainer position="top-right" autoClose={2200} newestOnTop closeOnClick draggable pauseOnHover theme="dark" />
    </>
  );
}

function StatBox({ label, value }) {
  return (
    <div
      style={{
        width: 96,
        borderRadius: 12,
        background: "rgba(0,0,0,0.22)",
        border: "1px solid rgba(255,255,255,0.12)",
        color: "white",
        padding: "10px 10px 9px",
        textAlign: "center",
        boxShadow: "0 10px 20px rgba(0,0,0,0.18)",
        boxSizing: "border-box",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 900, opacity: 0.75, letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.15 }}>{Number(value || 0).toLocaleString("en-US")}</div>
    </div>
  );
}

function HintTile({ value }) {
  const [ok, setOk] = useState(true);
  const src = `/numbers/${value}.png`;

  return (
    <div
      style={{
        width: 54,
        height: 54,
        borderRadius: 12,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.10)",
        display: "grid",
        placeItems: "center",
        flex: "0 0 auto",
        boxSizing: "border-box",
      }}
    >
      {ok ? (
        <img
          src={src}
          alt={String(value)}
          style={{
            width: "82%",
            height: "82%",
            objectFit: "contain",
            pointerEvents: "none",
            display: "block",
            margin: 0,
            padding: 0,
          }}
          draggable={false}
          loading="eager"
          decoding={value === 2 || value === 4 ? "sync" : "async"}
          fetchPriority={value === 2 || value === 4 ? "high" : "auto"}
          onError={() => setOk(false)}
        />
      ) : (
        <div style={{ fontWeight: 900 }}>{value}</div>
      )}
    </div>
  );
}

function AnimatedTile({ tile }) {
  const [imgOk, setImgOk] = useState(true);

  const { x, y } = posToPx(tile.r, tile.c);
  const src = tile.value ? `/numbers/${tile.value}.png` : "";

  const ms = Number.isFinite(tile.moveMs) ? tile.moveMs : 0;

  return (
    <div
      style={{
        position: "absolute",
        width: CELL,
        height: CELL,
        transform: `translate3d(${x}px, ${y}px, 0) translateZ(0)`,
        transition: `transform ${ms}ms ${MOVE_EASE}`,
        zIndex: tile.z ?? 1,
        willChange: "transform",
        backfaceVisibility: "hidden",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.06)",
          overflow: "hidden",
          animation: tile.pop ? `ffgPop ${POP_MS}ms ease-out` : "none",
          transformOrigin: "50% 50%",
          willChange: tile.pop ? "transform, opacity" : "auto",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {tile.value ? (
          imgOk ? (
            <img
              src={src}
              alt={String(tile.value)}
              style={{
                width: "82%",
                height: "82%",
                objectFit: "contain",
                pointerEvents: "none",
                display: "block",
                margin: 0,
                padding: 0,
              }}
              onError={() => setImgOk(false)}
              draggable={false}
              loading="eager"
              decoding={tile.value === 2 || tile.value === 4 ? "sync" : "async"}
              fetchPriority={tile.value === 2 || tile.value === 4 ? "high" : "auto"}
            />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", fontWeight: 900 }}>
              {tile.value}
            </div>
          )
        ) : null}
      </div>
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