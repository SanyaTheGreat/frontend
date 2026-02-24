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
// ✅ spawn: просто мягко проявляется (как в оригинале)
const SPAWN_FADE_MS = 60;

// ✅ merge: масштабная “пружинка”
const MERGE_POP_MS = 230;

// ✅ “реальная” механика: скорость постоянная, время зависит от расстояния
const MOVE_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const MOVE_PER_CELL_MS = 110;
const MOVE_MIN_MS = 140;
const MOVE_MAX_MS = 460;

// --- Durov FX ---
const DUROV_IMG = "/stickers/Durov.png";
const DUROV_FX_MS = 1200; // общая сцена (дуров+лучи+полёт)
const DUROV_FLY_MS = 620; // полёт тайлов
const DUROV_PHRASES = ["переставил", "не баг, а фича", "чисто телеграм"];

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
 * tiles: Map(id -> {id,value,r,c, removeAt?, pop?: "spawn"|"merge"|null, z?, appearAt?, moveMs?})
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
      // ✅ при полной пересборке (start/reconcile) не анимируем каждую плитку
      tiles.set(id, { id, value: v, r, c, pop: null, z: 1, moveMs: 0 });
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
      pop: null,
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

  let maxAnimEndAt = now;

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

        // ✅ новый merged-тайл появляется когда оба доехали
        const mergeArriveAt = Math.max(aArriveAt, bArriveAt);

        const newId = newTileId();
        nextTiles.set(newId, {
          id: newId,
          value: mergedValue,
          r: tr,
          c: tc,
          pop: "merge", // ✅ только merge получает pop-эффект
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

          maxAnimEndAt = Math.max(maxAnimEndAt, now + ms);
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
    maxAnimMs,
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

  // --- Durov FX state ---
  const [durovFx, setDurovFx] = useState(null);
  // durovFx: { phrase, a:{r,c,v}, b:{r,c,v}, mouth:{x,y}, aCenter:{x,y}, bCenter:{x,y}, dx, dy, t0 }

  const durovTimersRef = useRef({ clear: null, apply: null });

  // ✅ блокируем свайпы во время сцены Дурова
  const durovLockRef = useRef(false);

  const tilesRef = useRef(new Map());
  const boardRefState = useRef(Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null)));
  const gridValuesRef = useRef(Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0)));

  const inFlightRef = useRef(false);
  const touchStartRef = useRef(null);

  const boardRef = useRef(null);

  useMemo(() => localStorage.getItem("jwt") || "", []);

  const boardW = GRID_SIZE * CELL + (GRID_SIZE - 1) * GAP;
  const boardH = boardW;

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

    // preload durov
    const d = new Image();
    d.src = DUROV_IMG;
    d.loading = "eager";
    d.decoding = "async";
    try {
      d.decode?.().catch(() => {});
    } catch (_) {}
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

          map.set(id, { id, value: d.b, r: d.r, c: d.c, pop: "spawn", z: zMax + 5, moveMs: 0 });
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
    // ✅ spawn: только fade-in, без scale
    map.set(id, { id, value: v, r, c, pop: "spawn", z: zMax + 50, moveMs: 0 });
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

  function clearDurovTimers() {
    if (durovTimersRef.current.clear) {
      window.clearTimeout(durovTimersRef.current.clear);
      durovTimersRef.current.clear = null;
    }
    if (durovTimersRef.current.apply) {
      window.clearTimeout(durovTimersRef.current.apply);
      durovTimersRef.current.apply = null;
    }
    // ✅ на всякий — снимаем лок, если что-то прервалось
    durovLockRef.current = false;
  }

  function pickPhrase() {
    const i = Math.floor(Math.random() * DUROV_PHRASES.length);
    return DUROV_PHRASES[i] || DUROV_PHRASES[0];
  }

  function cellCenterInBoard(r, c) {
    // координаты относительно области tiles (0..boardW/boardH)
    const x = c * (CELL + GAP) + CELL / 2;
    const y = r * (CELL + GAP) + CELL / 2;
    return { x, y };
  }

  function startDurovFx(ev, dataToApplyLater) {
    // ✅ блокируем свайпы на время сцены
    durovLockRef.current = true;

    // ✅ координаты строго в системе header-zone контейнера (без BOARD_PAD)
    const mouth = {
      x: Math.round(boardW / 2),
      y: 18,
    };

    const aCenter0 = cellCenterInBoard(ev.from.r, ev.from.c);
    const bCenter0 = cellCenterInBoard(ev.to.r, ev.to.c);

    const aCenter = { x: Math.round(aCenter0.x), y: Math.round(92 + aCenter0.y) };
    const bCenter = { x: Math.round(bCenter0.x), y: Math.round(92 + bCenter0.y) };

    const aStart = { x: Math.round(aCenter.x - CELL / 2), y: Math.round(aCenter.y - CELL / 2) };
    const bStart = { x: Math.round(bCenter.x - CELL / 2), y: Math.round(bCenter.y - CELL / 2) };

    const dx = Math.round(bStart.x - aStart.x);
    const dy = Math.round(bStart.y - aStart.y);

    // чистим прошлые таймеры, но НЕ снимаем лок прямо здесь
    if (durovTimersRef.current.clear) window.clearTimeout(durovTimersRef.current.clear);
    if (durovTimersRef.current.apply) window.clearTimeout(durovTimersRef.current.apply);
    durovTimersRef.current.clear = null;
    durovTimersRef.current.apply = null;

    setDurovFx({
      phrase: pickPhrase(),
      a: { r: ev.from.r, c: ev.from.c, v: ev.from.v },
      b: { r: ev.to.r, c: ev.to.c, v: ev.to.v },
      mouth,
      aCenter,
      bCenter,
      aStart,
      bStart,
      dx,
      dy,
      t0: Date.now(),
    });

    // применяем server-state после полёта
    durovTimersRef.current.apply = window.setTimeout(() => {
      applyRunToUi(dataToApplyLater);
      if (dataToApplyLater?.finished) toast.info(`Game Over (${dataToApplyLater?.reason || "finished"})`);
    }, DUROV_FLY_MS + 20);

    // гасим эффект + снимаем лок
    durovTimersRef.current.clear = window.setTimeout(() => {
      setDurovFx(null);
      durovLockRef.current = false;
      if (durovTimersRef.current.clear) window.clearTimeout(durovTimersRef.current.clear);
      if (durovTimersRef.current.apply) window.clearTimeout(durovTimersRef.current.apply);
      durovTimersRef.current.clear = null;
      durovTimersRef.current.apply = null;
    }, DUROV_FX_MS);
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
    if (durovLockRef.current) return;
    e.preventDefault?.();
    const t = e.touches?.[0];
    if (!t) return;
    touchStartRef.current = { x: t.clientX, y: t.clientY, ts: Date.now() };
  };

  const onTouchEnd = (e) => {
    if (durovLockRef.current) return;
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
    if (durovLockRef.current) return;

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

    const { nextTiles, nextBoard, gained, moved, nextGridValues, maxAnimMs } = applyMoveAnimated(
      beforeTiles,
      beforeBoard,
      dir
    );
    if (!moved) return;

    tilesRef.current = nextTiles;
    boardRefState.current = nextBoard;
    gridValuesRef.current = nextGridValues;

    setScore((prev) => prev + gained);
    setMoves((prev) => prev + 1);
    syncTilesArrFromRef();

    // cleanup после максимальной анимации движения
    window.setTimeout(() => {
      const now = Date.now();
      const map = new Map(tilesRef.current);

      for (const [id, t] of map.entries()) {
        if (t.removeAt && now >= t.removeAt) map.delete(id);
      }
      for (const t of map.values()) {
        if (t.appearAt && now >= t.appearAt) {
          delete t.appearAt;
        }
        // ✅ чтобы анимация не пыталась “перезапускаться” на будущих рендерах
        if (t.pop) t.pop = null;
        if (t.moveMs) delete t.moveMs;
      }

      tilesRef.current = map;
      syncTilesArrFromRef();
    }, maxAnimMs + 10);

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

      // ✅ Durov swap: НЕ телепортим сразу сетку — показываем лучи/полёт, потом применяем server-state
      const ev = data?.durov_event;
      if (ev?.type === "durov_swap" && ev?.from && ev?.to) {
        const from = {
          r: Number(ev.from.r),
          c: Number(ev.from.c),
          v: Number(ev.from.v),
        };
        const to = {
          r: Number(ev.to.r),
          c: Number(ev.to.c),
          v: Number(ev.to.v),
        };

        const ok =
          Number.isFinite(from.r) &&
          Number.isFinite(from.c) &&
          Number.isFinite(from.v) &&
          Number.isFinite(to.r) &&
          Number.isFinite(to.c) &&
          Number.isFinite(to.v) &&
          from.r >= 0 &&
          from.r < GRID_SIZE &&
          from.c >= 0 &&
          from.c < GRID_SIZE &&
          to.r >= 0 &&
          to.r < GRID_SIZE &&
          to.c >= 0 &&
          to.c < GRID_SIZE &&
          from.v > 0 &&
          to.v > 0;

        if (ok) {
          startDurovFx({ from, to }, data);
          return; // важно: ниже не делать reconcile/spawn сразу
        }
      }

      // обычный путь
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

  const chainValues = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096];

  // --- Durov computed styles ---
  const durovRender = (() => {
    if (!durovFx) return null;

    const mouthX = durovFx.mouth.x;
    const mouthY = durovFx.mouth.y;

    const beamA = makeBeamStyle(mouthX, mouthY, durovFx.aCenter.x, durovFx.aCenter.y);
    const beamB = makeBeamStyle(mouthX, mouthY, durovFx.bCenter.x, durovFx.bCenter.y);

    const flyAStyle = {
      "--x0": `${durovFx.aStart.x}px`,
      "--y0": `${durovFx.aStart.y}px`,
      "--dx": `${durovFx.dx}px`,
      "--dy": `${durovFx.dy}px`,
      "--ms": `${DUROV_FLY_MS}ms`,
    };

    const flyBStyle = {
      "--x0": `${durovFx.bStart.x}px`,
      "--y0": `${durovFx.bStart.y}px`,
      "--dx": `${-durovFx.dx}px`,
      "--dy": `${-durovFx.dy}px`,
      "--ms": `${DUROV_FLY_MS}ms`,
    };

    return { beamA, beamB, flyAStyle, flyBStyle, mouthX, mouthY };
  })();

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

        /* ✅ merge pop (scale) */
        @keyframes ffgPop {
          0% { transform: scale(0.92); }
          100% { transform: scale(1); }
        }

        /* ✅ spawn fade-in (no scale) */
        @keyframes ffgFade {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }

        @keyframes hintIn {
          0% { transform: translate3d(0, 18px, 0) scale(0.98); opacity: 0; }
          100% { transform: translate3d(0, 0, 0) scale(1); opacity: 1; }
        }

        /* --- Durov FX --- */
        @keyframes durovPopIn {
          0% { opacity: 0; transform: translate3d(-50%, -8px, 0) scale(0.92) rotate(-2deg); }
          25% { opacity: 1; transform: translate3d(-50%, 0px, 0) scale(1) rotate(1deg); }
          100% { opacity: 1; transform: translate3d(-50%, 0px, 0) scale(1) rotate(0deg); }
        }

        @keyframes durovBubbleIn {
          0% { opacity: 0; transform: translate3d(10px, 6px, 0) scale(0.92); }
          100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
        }

        @keyframes durovBeamIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }

        @keyframes durovBeamOut {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }

        @keyframes durovFly {
          0% { transform: translate3d(var(--x0), var(--y0), 0); }
          100% { transform: translate3d(calc(var(--x0) + var(--dx)), calc(var(--y0) + var(--dy)), 0); }
        }

        .durov-layer{
          position: absolute;
          inset: 0;
          z-index: 90;
          pointer-events: none;
        }

        .durov-headzone{
          position: absolute;
          left: 50%;
          top: 0px;
          width: 160px;
          height: 96px;
          transform: translateX(-50%);
          z-index: 95;
          pointer-events: none;
        }

        .durov-img{
          position: absolute;
          left: 50%;
          top: 0px;
          width: 92px;
          height: 92px;
          transform: translateX(-50%);
          opacity: 0;
          animation: durovPopIn 150ms ease-out forwards;
          filter: drop-shadow(0 10px 22px rgba(0,0,0,0.55));
        }

        .durov-bubble{
          position: absolute;
          left: 92px;
          top: 6px;
          max-width: 190px;
          padding: 9px 10px;
          border-radius: 14px;
          background: rgba(12, 16, 26, 0.92);
          border: 1px solid rgba(255,255,255,0.12);
          box-shadow: 0 14px 36px rgba(0,0,0,0.42);
          color: rgba(255,255,255,0.95);
          font-weight: 900;
          font-size: 12.5px;
          letter-spacing: 0.15px;
          opacity: 0;
          animation: durovBubbleIn 120ms ease-out forwards;
          white-space: nowrap;
        }

        .durov-bubble:after{
          content: "";
          position: absolute;
          left: -6px;
          top: 18px;
          width: 10px;
          height: 10px;
          background: rgba(12, 16, 26, 0.92);
          border-left: 1px solid rgba(255,255,255,0.12);
          border-bottom: 1px solid rgba(255,255,255,0.12);
          transform: rotate(45deg);
          border-radius: 2px;
        }

        .beam{
          position: absolute;
          height: 3px;
          transform-origin: 0 50%;
          background: rgba(77,166,255,0.92);
          box-shadow: 0 0 14px rgba(77,166,255,0.30), 0 0 30px rgba(77,166,255,0.14);
          border-radius: 999px;
          opacity: 0;
          animation: durovBeamIn 80ms ease-out forwards, durovBeamOut 120ms ease-out forwards;
          animation-delay: 0ms, 560ms;
        }

        .beam-end{
          position: absolute;
          right: -6px;
          top: 50%;
          width: 10px;
          height: 10px;
          border-radius: 999px;
          transform: translateY(-50%);
          background: rgba(140,205,255,0.92);
          box-shadow: 0 0 14px rgba(77,166,255,0.35), 0 0 30px rgba(77,166,255,0.16);
        }

        .durov-fly{
          position: absolute;
          left: 0;
          top: 0;
          width: ${CELL}px;
          height: ${CELL}px;
          z-index: 98;
          will-change: transform;
          animation: durovFly var(--ms) ${MOVE_EASE} forwards;
          backface-visibility: hidden;
        }

        .durov-fly-inner{
          width: 100%;
          height: 100%;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.06);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          box-shadow: 0 12px 24px rgba(0,0,0,0.28);
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
              position: "relative",
            }}
          >
            {/* ✅ Header-zone над полем (сюда “вылезает” Дуров) */}
            <div
              style={{
                position: "relative",
                width: boardW,
                height: 92 + boardH, // 92px над полем
                borderRadius: 16,
                boxSizing: "border-box",
                overflow: "visible",
              }}
            >
              {/* Durov FX layer (над полем и над тайлами) */}
              {durovFx && durovRender && (
                <div className="durov-layer">
                  {/* Durov над полем */}
                  <div className="durov-headzone" style={{ top: 0 }}>
                    <img className="durov-img" src={DUROV_IMG} alt="Durov" draggable={false} />
                    <div className="durov-bubble">{durovFx.phrase}</div>
                  </div>

                  {/* Лучи от “рта” (точка mouth) к целям */}
                  <div className="beam" style={durovRender.beamA}>
                    <div className="beam-end" />
                  </div>
                  <div className="beam" style={durovRender.beamB}>
                    <div className="beam-end" />
                  </div>

                  {/* Летающие тайлы A -> B и B -> A */}
                  <div className="durov-fly" style={durovRender.flyAStyle}>
                    <div className="durov-fly-inner">
                      <img
                        src={`/numbers/${durovFx.a.v}.png`}
                        alt={String(durovFx.a.v)}
                        style={{ width: "82%", height: "82%", objectFit: "contain", display: "block", pointerEvents: "none" }}
                        draggable={false}
                        loading="eager"
                        decoding={durovFx.a.v === 2 || durovFx.a.v === 4 ? "sync" : "async"}
                        fetchPriority={durovFx.a.v === 2 || durovFx.a.v === 4 ? "high" : "auto"}
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    </div>
                  </div>

                  <div className="durov-fly" style={durovRender.flyBStyle}>
                    <div className="durov-fly-inner">
                      <img
                        src={`/numbers/${durovFx.b.v}.png`}
                        alt={String(durovFx.b.v)}
                        style={{ width: "82%", height: "82%", objectFit: "contain", display: "block", pointerEvents: "none" }}
                        draggable={false}
                        loading="eager"
                        decoding={durovFx.b.v === 2 || durovFx.b.v === 4 ? "sync" : "async"}
                        fetchPriority={durovFx.b.v === 2 || durovFx.b.v === 4 ? "high" : "auto"}
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* игровая зона (поле) — сдвинута вниз на высоту header-zone */}
              <div style={{ position: "absolute", left: 0, top: 92, width: boardW, height: boardH, borderRadius: 16, boxSizing: "border-box" }}>
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

function makeBeamStyle(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.max(0, Math.hypot(dx, dy));
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  return {
    left: `${x1}px`,
    top: `${y1}px`,
    width: `${len}px`,
    transform: `rotate(${angle}deg)`,
  };
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

  const innerAnimation =
    tile.pop === "merge"
      ? `ffgPop ${MERGE_POP_MS}ms ease-out`
      : tile.pop === "spawn"
      ? `ffgFade ${SPAWN_FADE_MS}ms linear`
      : "none";

  return (
    <div
      style={{
        position: "absolute",
        width: CELL,
        height: CELL,
        transform: `translate3d(${x}px, ${y}px, 0) translateZ(0)`,
        transition: ms > 0 ? `transform ${ms}ms ${MOVE_EASE}` : "none",
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
          animation: innerAnimation,
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