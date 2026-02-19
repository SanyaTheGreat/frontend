import { useEffect, useMemo, useRef, useState } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const API_BASE = "https://lottery-server-waif.onrender.com";

const GRID_SIZE = 4;
const ACTIONS_LIMIT = 200;

// ======== RNG (same as backend) ========
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

// ======== 2048 logic (same as backend) ========
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

function normalizeGrid(grid) {
  if (!Array.isArray(grid) || grid.length !== GRID_SIZE) return null;
  for (const row of grid) {
    if (!Array.isArray(row) || row.length !== GRID_SIZE) return null;
    for (const v of row) if (typeof v !== "number") return null;
  }
  return grid;
}

// ======== UI helpers ========
function detectSwipeDir(dx, dy) {
  if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

export default function Game2048() {
  const [loading, setLoading] = useState(false);

  const [run, setRun] = useState(null); // store full run (id, seed, rng_index, etc.)
  const [grid, setGrid] = useState(() => Array.from({ length: 4 }, () => Array(4).fill(0)));
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(0);

  const [attempts, setAttempts] = useState(null); // { daily_attempts_remaining, referral_attempts_balance, daily_plays_used ... }
  const [bestWeek, setBestWeek] = useState(null); // later we’ll fill from API, now keep placeholder

  // animation layer
  const [animGrid, setAnimGrid] = useState(grid);
  const [animTick, setAnimTick] = useState(0); // force remount of tile-layer when needed
  const animatingRef = useRef(false);

  const token = useMemo(() => localStorage.getItem("jwt") || "", []);

  const boardRef = useRef(null);
  const touchStartRef = useRef(null);

  // Keep animGrid synced initially
  useEffect(() => {
    setAnimGrid(grid);
  }, []); // only once

  const applyServerStateToUi = (data) => {
    const r = data?.run || data?.data?.run || data?.run;
    const p = data?.period;

    if (r?.id) localStorage.setItem("ffg_2048_run_id", r.id);
    if (p?.id) localStorage.setItem("ffg_2048_period_id", p.id);

    setRun(r || null);

    const nextGrid = normalizeGrid(r?.state?.grid) || Array.from({ length: 4 }, () => Array(4).fill(0));
    setGrid(nextGrid);
    setAnimGrid(nextGrid);

    setScore(Number(r?.current_score ?? 0));
    setMoves(Number(r?.moves ?? 0));

    if (data?.attempts) setAttempts(data.attempts);
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
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        toast.error(data?.error || "Ошибка запуска");
        if (res.status === 401 || res.status === 403) localStorage.removeItem("jwt");
        return;
      }

      applyServerStateToUi(data);
    } catch (e) {
      console.error(e);
      toast.error("Ошибка сети");
    } finally {
      setLoading(false);
    }
  };

  // Local immediate animation (same rules + same RNG), then server confirm
  const move = async (dir) => {
    if (loading || animatingRef.current) return;

    const jwt = localStorage.getItem("jwt");
    if (!jwt) {
      toast.error("Нет jwt. Открой Mini App в Telegram заново.");
      return;
    }

    const currentRun = run;
    const baseGrid = normalizeGrid(grid) || Array.from({ length: 4 }, () => Array(4).fill(0));

    // If we can’t animate deterministically (no seed), fallback to server-only
    const canAnimate = Boolean(currentRun?.seed) && Number.isFinite(Number(currentRun?.rng_index ?? 0));

    if (canAnimate) {
      // 1) build next state locally
      const { grid: movedGrid, gained, moved: didMove } = applyMove(baseGrid, dir);
      if (!didMove) return; // do nothing

      const localRng = makeRng(String(currentRun.seed), Number(currentRun.rng_index ?? 0));
      const after = cloneGrid(movedGrid);
      spawnTile(after, localRng);

      const nextScore = Number(currentRun.current_score ?? 0) + gained;
      const nextMoves = Number(currentRun.moves ?? 0) + 1;
      const nextRngIndex = localRng.getIndex();

      // 2) animate immediately (fast)
      animatingRef.current = true;

      // show movement by switching animGrid -> after, with CSS transition
      setAnimGrid(after);
      setGrid(after);
      setScore(nextScore);
      setMoves(nextMoves);
      setRun((prev) =>
        prev
          ? {
              ...prev,
              state: { grid: after },
              current_score: nextScore,
              moves: nextMoves,
              rng_index: nextRngIndex,
            }
          : prev
      );

      // give time for transition to be visible
      window.setTimeout(() => {
        animatingRef.current = false;
      }, 140);
    }

    // 3) server authoritative
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/game/run/move`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ dir }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        toast.error(data?.error || "Move error");
        if (res.status === 401 || res.status === 403) localStorage.removeItem("jwt");
        return;
      }

      // snap/confirm from server (should match local)
      applyServerStateToUi(data);
    } catch (e) {
      console.error(e);
      toast.error("Ошибка сети (move)");
    } finally {
      setLoading(false);
    }
  };

  // ======== SWIPE handling ========
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;

    const onTouchStart = (e) => {
      if (loading) return;
      const t = e.touches?.[0];
      if (!t) return;
      touchStartRef.current = { x: t.clientX, y: t.clientY };
    };

    const onTouchEnd = (e) => {
      if (loading) return;
      const start = touchStartRef.current;
      touchStartRef.current = null;

      const t = e.changedTouches?.[0];
      if (!start || !t) return;

      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;

      const dir = detectSwipeDir(dx, dy);
      if (dir) move(dir);
    };

    // pointer (mouse) swipe too
    let pointerDown = null;
    const onPointerDown = (e) => {
      if (loading) return;
      pointerDown = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e) => {
      if (loading) return;
      if (!pointerDown) return;
      const dx = e.clientX - pointerDown.x;
      const dy = e.clientY - pointerDown.y;
      pointerDown = null;
      const dir = detectSwipeDir(dx, dy);
      if (dir) move(dir);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointerup", onPointerUp);

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointerup", onPointerUp);
    };
  }, [loading, run, grid]);

  useEffect(() => {
    // auto resume on first open (optional)
    startOrResume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ======== Layout constants ========
  const CELL = 72;
  const GAP = 10;
  const PAD = 12;
  const BOARD_PX = PAD * 2 + CELL * 4 + GAP * 3;

  const dailyLeft = Number(attempts?.daily_attempts_remaining ?? 0);
  const refLeft = Number(attempts?.referral_attempts_balance ?? 0);

  return (
    <>
      <div className="starfield" aria-hidden="true" />

      <div style={{ position: "relative", zIndex: 5, padding: 16, color: "white", maxWidth: 720, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* 4096 logo as PNG */}
            <div
              style={{
                width: 54,
                height: 54,
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(0,0,0,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              <img
                src="/numbers/4096.png"
                alt="4096"
                style={{
                  width: "82%",
                  height: "82%",
                  objectFit: "contain",
                  display: "block",
                  position: "relative", // <— IMPORTANT: protect from global img css
                  pointerEvents: "none",
                }}
              />
            </div>

            <div>
              <div style={{ fontWeight: 900, fontSize: 18, lineHeight: 1.1 }}>2048</div>
              <div style={{ opacity: 0.75, fontSize: 12 }}>Swipe only</div>
            </div>
          </div>

          <button
            type="button"
            onClick={startOrResume}
            disabled={loading}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(0,0,0,0.20)",
              color: "white",
              fontWeight: 800,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "..." : "Start / Resume"}
          </button>
        </div>

        {/* Score row */}
        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
          }}
        >
          <StatCard title="Score" value={String(score ?? 0)} />
          <StatCard title="Best (week)" value={bestWeek == null ? "—" : String(bestWeek)} />
        </div>

        {/* Attempts */}
        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, opacity: 0.92 }}>
          <StatCard title="Daily attempts" value={String(dailyLeft)} small />
          <StatCard title="Referral attempts" value={String(refLeft)} small />
        </div>

        {/* Board */}
        <div style={{ marginTop: 16, display: "flex", justifyContent: "center" }}>
          <div
            ref={boardRef}
            style={{
              width: BOARD_PX,
              height: BOARD_PX,
              borderRadius: 22,
              background: "rgba(0,0,0,0.22)",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
              padding: PAD,
              touchAction: "none", // allow custom swipe
              userSelect: "none",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* background cells */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(4, ${CELL}px)`,
                gap: GAP,
              }}
            >
              {new Array(16).fill(0).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: CELL,
                    height: CELL,
                    borderRadius: 16,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                />
              ))}
            </div>

            {/* animated tiles layer */}
            <div
              key={animTick}
              style={{
                position: "absolute",
                inset: PAD,
                pointerEvents: "none",
              }}
            >
              <TilesLayer grid={animGrid} cell={CELL} gap={GAP} />
            </div>
          </div>
        </div>

        {/* Info */}
        <div style={{ marginTop: 12, opacity: 0.7, fontSize: 12, textAlign: "center" }}>
          Moves: <b>{moves ?? 0}</b>
        </div>
      </div>

      <ToastContainer position="top-right" autoClose={2200} newestOnTop closeOnClick draggable pauseOnHover theme="dark" />
    </>
  );
}

function StatCard({ title, value, small }) {
  return (
    <div
      style={{
        borderRadius: 16,
        padding: small ? 10 : 12,
        background: "rgba(0,0,0,0.22)",
        border: "1px solid rgba(255,255,255,0.12)",
      }}
    >
      <div style={{ opacity: 0.75, fontSize: 12, fontWeight: 700 }}>{title}</div>
      <div style={{ marginTop: 4, fontSize: small ? 16 : 18, fontWeight: 900 }}>{value}</div>
    </div>
  );
}

function TilesLayer({ grid, cell, gap }) {
  const g = normalizeGrid(grid) || Array.from({ length: 4 }, () => Array(4).fill(0));

  const tiles = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const v = g[r][c];
      if (!v) continue;
      tiles.push({ r, c, v });
    }
  }

  return tiles.map((t, idx) => {
    const left = t.c * (cell + gap);
    const top = t.r * (cell + gap);
    const src = `/numbers/${t.v}.png`;

    return (
      <div
        key={`${t.r}-${t.c}-${t.v}-${idx}`}
        style={{
          position: "absolute",
          left,
          top,
          width: cell,
          height: cell,
          borderRadius: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(0,0,0,0.18)",
          border: "1px solid rgba(255,255,255,0.12)",
          // smooth movement:
          transition: "left 140ms ease-out, top 140ms ease-out, transform 120ms ease-out",
          transform: "translateZ(0)",
          overflow: "hidden",
        }}
      >
        <img
          src={src}
          alt={String(t.v)}
          style={{
            width: "84%",
            height: "84%",
            objectFit: "contain",
            display: "block",
            position: "relative", // <— IMPORTANT: protect from global img css
            pointerEvents: "none",
          }}
          draggable={false}
        />
      </div>
    );
  });
}
