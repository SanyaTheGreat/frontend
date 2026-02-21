import { useEffect, useMemo, useRef, useState } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const API_BASE = "https://lottery-server-waif.onrender.com";
const LOGO_4096 = "/numbers/4096.png";

const GRID_SIZE = 4;

// sizes
const CELL = 72;
const GAP = 10;
const BOARD_PAD = 12;

// animations
const MOVE_MS = 240;
const POP_MS = 230;

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
 * tiles: Map(id -> {id,value,r,c, removeAt?, pop?, z?, appearAt?})
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
      tiles.set(id, { id, value: v, r, c, pop: true, z: 1 });
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

function applyMoveAnimated(tiles, board, dir) {
  const nextTiles = new Map();
  for (const [id, t] of tiles.entries()) nextTiles.set(id, { ...t, pop: false, z: t.z ?? 1, removeAt: null });

  const nextBoard = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
  const nextGridValues = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));

  let gained = 0;
  let anyMoved = false;
  let zCounter = 10;

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

        if (a) {
          if (a.r !== tr || a.c !== tc) anyMoved = true;
          a.r = tr;
          a.c = tc;
          a.z = zCounter++;
          a.removeAt = Date.now() + MOVE_MS;
        }
        if (b) {
          if (b.r !== tr || b.c !== tc) anyMoved = true;
          b.r = tr;
          b.c = tc;
          b.z = zCounter++;
          b.removeAt = Date.now() + MOVE_MS;
        }

        const newId = newTileId();
        nextTiles.set(newId, {
          id: newId,
          value: mergedValue,
          r: tr,
          c: tc,
          pop: false,
          z: zCounter++,
          appearAt: Date.now() + MOVE_MS,
        });

        out.push({ id: newId, value: mergedValue, r: tr, c: tc });
        p += 2;
      } else {
        const targetIndex = out.length;
        const [tr, tc] = coordsIndexToWrite(i, targetIndex, dir);

        const t = nextTiles.get(cur.id);
        if (t) {
          if (t.r !== tr || t.c !== tc) anyMoved = true;
          t.r = tr;
          t.c = tc;
          t.z = zCounter++;
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

  return { nextTiles, nextBoard, gained, moved: anyMoved, nextGridValues };
}

// ---------- Component ----------
export default function Game2048() {
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState(null);

  const [runId, setRunId] = useState("");
  const [periodId, setPeriodId] = useState("");

  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(0);

  const [tilesArr, setTilesArr] = useState([]);

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

  useEffect(() => {
    setRunId(localStorage.getItem("ffg_2048_run_id") || "");
    setPeriodId(localStorage.getItem("ffg_2048_period_id") || "");
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

  /**
   * reconcile server grid:
   * - if only spawn diff (0 -> 2/4), add one tile with pop
   * - else fallback rebuild
   */
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

          map.set(id, { id, value: d.b, r: d.r, c: d.c, pop: true, z: zMax + 5 });
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

  // ✅ добавляем spawn из ответа сервера сразу и в правильную клетку
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
    map.set(id, { id, value: v, r, c, pop: true, z: zMax + 50 });
    board[r][c] = id;

    tilesRef.current = map;
    boardRefState.current = board;
    syncTilesArrFromRef();
  }

  function applyRunToUi(data) {
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

  // ---------- SWIPE ----------
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

    const { nextTiles, nextBoard, gained, moved, nextGridValues } = applyMoveAnimated(beforeTiles, beforeBoard, dir);
    if (!moved) return;

    tilesRef.current = nextTiles;
    boardRefState.current = nextBoard;
    gridValuesRef.current = nextGridValues;

    setScore((prev) => prev + gained);
    setMoves((prev) => prev + 1);
    syncTilesArrFromRef();

    // после MOVE_MS — удалить merged old + pop для новых merged
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
      }

      tilesRef.current = map;
      syncTilesArrFromRef();
    }, MOVE_MS + 5);

    // server
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

      // ✅ спавним сразу по данным сервера, без ожиданий и без предикта
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

  const clearLocal = () => {
    localStorage.removeItem("ffg_2048_run_id");
    localStorage.removeItem("ffg_2048_period_id");
    setRunId("");
    setPeriodId("");

    tilesRef.current = new Map();
    boardRefState.current = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
    gridValuesRef.current = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
    setTilesArr([]);

    setScore(0);
    setMoves(0);

    toast.info("Локалка очищена");
  };

  const boardW = GRID_SIZE * CELL + (GRID_SIZE - 1) * GAP;
  const boardH = boardW;

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
            0% { transform: scale(0.92); opacity: 1; }
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
            <div style={{ opacity: 0.75, fontSize: 12 }}>Свайпы • реальная анимация</div>
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
            }}
          >
            <div style={{ position: "relative", width: boardW, height: boardH, borderRadius: 16 }}>
              {/* background cells */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "grid",
                  gridTemplateColumns: `repeat(${GRID_SIZE}, ${CELL}px)`,
                  gap: GAP,
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

          <div style={{ opacity: 0.65, fontSize: 12, marginTop: 8 }}>
            Tiles: <code>/public/numbers/2.png ... 4096.png</code>
          </div>
        </div>
      </div>

      <ToastContainer position="top-right" autoClose={2200} newestOnTop closeOnClick draggable pauseOnHover theme="dark" />
    </>
  );
}

function AnimatedTile({ tile }) {
  const [imgOk, setImgOk] = useState(true);

  const { x, y } = posToPx(tile.r, tile.c);
  const src = tile.value ? `/numbers/${tile.value}.png` : "";

  return (
    <div
      style={{
        position: "absolute",
        width: CELL,
        height: CELL,
        transform: `translate3d(${x}px, ${y}px, 0)`,
        transition: `transform ${MOVE_MS}ms ease-in-out`,
        zIndex: tile.z ?? 1,
        willChange: "transform",
        backfaceVisibility: "hidden",
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
        }}
      >
        {tile.value ? (
          imgOk ? (
            <img
              src={src}
              alt={String(tile.value)}
              style={{ width: "82%", height: "82%", objectFit: "contain", pointerEvents: "none", margin: "9%" }}
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