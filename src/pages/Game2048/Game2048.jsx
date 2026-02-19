import { useEffect, useMemo, useRef, useState } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const API_BASE = "https://lottery-server-waif.onrender.com";

const GRID = 4;
const TILE_SIZE = 72;
const GAP = 10;
const PAD = 12;
const ANIM_MS = 140;

const FINISH_REASONS = new Set(["no_moves", "manual", "period_end"]);

// ===== deterministic RNG (same as backend) =====
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

// ===== 2048 helpers =====
function cloneGrid(g) {
  return g.map((r) => r.slice());
}
function gridsEqual(a, b) {
  for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) if (a[r][c] !== b[r][c]) return false;
  return true;
}
function getEmptyCells(grid) {
  const cells = [];
  for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) if (!grid[r][c]) cells.push([r, c]);
  return cells;
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
  while (out.length < GRID) out.push(0);
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

  for (let i = 0; i < GRID; i++) {
    const line = readLine(i);
    const { line: merged, score } = slideAndMergeLine(line);
    gained += score;
    writeLine(i, merged);
  }

  return { grid: g, gained, moved: !gridsEqual(grid, g) };
}
function spawnTile(grid, rng) {
  const empties = getEmptyCells(grid);
  if (empties.length === 0) return { ok: false, cell: null, value: null };

  const pick = Math.floor(rng.next01() * empties.length);
  const [r, c] = empties[pick];
  const v = rng.next01() < 0.9 ? 2 : 4;
  grid[r][c] = v;
  return { ok: true, cell: [r, c], value: v };
}
function canMove(grid) {
  if (getEmptyCells(grid).length > 0) return true;
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const v = grid[r][c];
      if (r + 1 < GRID && grid[r + 1][c] === v) return true;
      if (c + 1 < GRID && grid[r][c + 1] === v) return true;
    }
  }
  return false;
}

// ===== tile model for animation =====
function cellToXY(row, col) {
  const x = PAD + col * (TILE_SIZE + GAP);
  const y = PAD + row * (TILE_SIZE + GAP);
  return { x, y };
}
function buildTilesFromGrid(grid) {
  const tiles = [];
  let id = 1;
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const v = grid?.[r]?.[c] ?? 0;
      if (!v) continue;
      tiles.push({ id: `t${id++}`, value: v, row: r, col: c, born: false });
    }
  }
  return tiles;
}

export default function Game2048() {
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState(null);

  const [run, setRun] = useState(null);
  const [period, setPeriod] = useState(null);

  const [grid, setGrid] = useState(null);
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(0);

  const [bestWeekly, setBestWeekly] = useState(0);

  const [attempts, setAttempts] = useState({
    daily_attempts_remaining: null,
    referral_attempts_balance: null,
    daily_plays_used: null,
  });

  // animation state
  const [tiles, setTiles] = useState([]);
  const [animating, setAnimating] = useState(false);

  const boardRef = useRef(null);
  const touchRef = useRef({ active: false, x: 0, y: 0, t: 0 });

  const token = useMemo(() => localStorage.getItem("jwt") || "", []);

  const applyRunToUi = (data) => {
    const r = data?.run;
    if (!r) return;

    setRun(r);
    if (data?.period) setPeriod(data.period);

    if (r?.state?.grid) {
      setGrid(r.state.grid);
      setTiles(buildTilesFromGrid(r.state.grid));
    }

    setScore(Number(r.current_score ?? 0));
    setMoves(Number(r.moves ?? 0));

    if (data?.leaderboard?.best_score != null) {
      setBestWeekly(Number(data.leaderboard.best_score ?? 0));
    }

    if (data?.attempts) setAttempts(data.attempts);

    if (r?.id) localStorage.setItem("ffg_2048_run_id", r.id);
    if (data?.period?.id) localStorage.setItem("ffg_2048_period_id", data.period.id);
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
      toast.info("Игра завершена");
    } catch (e) {
      console.error(e);
      toast.error("Ошибка сети (finish)");
    } finally {
      setLoading(false);
    }
  };

  // local instant simulation + smooth animation
  const simulateAndAnimateMove = async (dir) => {
    if (loading || animating) return;
    const jwt = localStorage.getItem("jwt");
    if (!jwt) {
      toast.error("Нет jwt. Открой Mini App в Telegram заново.");
      return;
    }
    if (!run?.seed || !grid) return;

    const before = grid;
    const beforeTiles = buildTilesFromGrid(before);

    const { grid: movedGrid, gained, moved } = applyMove(before, dir);
    if (!moved) return;

    const rng = makeRng(run.seed, Number(run.rng_index ?? 0));
    const after = cloneGrid(movedGrid);
    const spawn = spawnTile(after, rng);
    const nextRngIndex = rng.getIndex();

    const nextScore = score + gained;
    const nextMoves = moves + 1;

    // prepare animated tiles (simple: rebuild on next, but animate by transform)
    const afterTiles = buildTilesFromGrid(after);

    // render BEFORE positions first
    setAnimating(true);
    setTiles(
      beforeTiles.map((t) => {
        const { x, y } = cellToXY(t.row, t.col);
        return { ...t, x, y, toX: x, toY: y, entering: false };
      })
    );

    // next frame -> set target positions (CSS transition will animate)
    requestAnimationFrame(() => {
      setTiles(() => {
        // map “after” tiles to closest “before” tile for movement illusion
        const used = new Set();
        const mapped = afterTiles.map((nt) => {
          let best = null;
          let bestD = 1e9;

          for (let i = 0; i < beforeTiles.length; i++) {
            const bt = beforeTiles[i];
            if (used.has(i)) continue;
            if (bt.value !== nt.value) continue;
            const d = Math.abs(bt.row - nt.row) + Math.abs(bt.col - nt.col);
            if (d < bestD) {
              bestD = d;
              best = { idx: i, tile: bt };
            }
          }

          const { x: toX, y: toY } = cellToXY(nt.row, nt.col);

          if (best) {
            used.add(best.idx);
            const { x, y } = cellToXY(best.tile.row, best.tile.col);
            return { id: best.tile.id, value: nt.value, row: nt.row, col: nt.col, x, y, toX, toY, entering: false };
          }

          // new tile (spawn / merge result) -> fade-in
          return {
            id: `n_${nt.row}_${nt.col}_${Date.now()}`,
            value: nt.value,
            row: nt.row,
            col: nt.col,
            x: toX,
            y: toY,
            toX,
            toY,
            entering: true,
          };
        });

        return mapped;
      });
    });

    // send to server in parallel
    setLoading(true);
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
        return;
      }

      // finalize local state after animation time (so it feels smooth)
      setTimeout(() => {
        applyRunToUi(data);
        setAnimating(false);

        if (data?.finished) {
          toast.info(`Game Over (${data?.reason || "finished"})`);
        } else {
          // update score/moves immediately too
          setScore(nextScore);
          setMoves(nextMoves);
          setGrid(after);
          setRun((prev) => (prev ? { ...prev, rng_index: nextRngIndex, current_score: nextScore, moves: nextMoves } : prev));
          if (!canMove(after)) toast.info("Game Over");
        }
      }, ANIM_MS);
    } catch (e) {
      console.error(e);
      toast.error("Ошибка сети (move)");
    } finally {
      setLoading(false);
      // safety unlock if request failed
      setTimeout(() => setAnimating(false), ANIM_MS + 60);
    }
  };

  // swipe handling (touch + pointer)
  const onPointerDown = (e) => {
    if (animating || loading) return;
    touchRef.current = { active: true, x: e.clientX, y: e.clientY, t: Date.now() };
  };
  const onPointerUp = (e) => {
    const st = touchRef.current;
    if (!st.active) return;
    touchRef.current.active = false;

    const dx = e.clientX - st.x;
    const dy = e.clientY - st.y;

    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (Math.max(adx, ady) < 18) return;

    if (adx > ady) simulateAndAnimateMove(dx > 0 ? "right" : "left");
    else simulateAndAnimateMove(dy > 0 ? "down" : "up");
  };

  useEffect(() => {
    // auto start when opened
    startOrResume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const attemptsLeft =
    (Number(attempts?.daily_attempts_remaining ?? 0) || 0) + (Number(attempts?.referral_attempts_balance ?? 0) || 0);

  return (
    <>
      <div className="starfield" aria-hidden="true" />

      <div style={{ position: "relative", zIndex: 5, padding: 16, color: "white", maxWidth: 520, margin: "0 auto" }}>
        {/* header (like real 2048) */}
        <div style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
          <div
            style={{
              width: 92,
              height: 92,
              borderRadius: 14,
              background: "rgba(0,0,0,0.22)",
              border: "1px solid rgba(255,255,255,0.10)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <img src="/numbers/4096.png" alt="4096" style={{ width: "86%", height: "86%", objectFit: "contain" }} />
          </div>

          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <StatBox title="SCORE" value={score} />
            <StatBox title="BEST (week)" value={bestWeekly} />
            <button
              type="button"
              onClick={() => window.history.back()}
              style={btnSmall()}
              disabled={loading || animating}
            >
              MENU
            </button>
            <button type="button" onClick={finish} style={btnSmall()} disabled={loading || animating}>
              FINISH
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10, opacity: 0.85, fontSize: 13 }}>
          Попытки: <b>{attemptsLeft}</b> &nbsp;•&nbsp; Ходов: <b>{moves}</b>
        </div>

        {/* board */}
        <div
          ref={boardRef}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          style={{
            marginTop: 14,
            width: PAD * 2 + GRID * TILE_SIZE + (GRID - 1) * GAP,
            height: PAD * 2 + GRID * TILE_SIZE + (GRID - 1) * GAP,
            borderRadius: 18,
            background: "rgba(0,0,0,0.20)",
            border: "1px solid rgba(255,255,255,0.10)",
            position: "relative",
            touchAction: "none",
            userSelect: "none",
            overflow: "hidden",
          }}
        >
          {/* background cells */}
          {Array.from({ length: 16 }).map((_, i) => {
            const r = Math.floor(i / 4);
            const c = i % 4;
            const { x, y } = cellToXY(r, c);
            return (
              <div
                key={`bg_${i}`}
                style={{
                  position: "absolute",
                  left: x,
                  top: y,
                  width: TILE_SIZE,
                  height: TILE_SIZE,
                  borderRadius: 16,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              />
            );
          })}

          {/* moving tiles */}
          {tiles.map((t) => (
            <Tile key={t.id} value={t.value} x={t.toX ?? t.x} y={t.toY ?? t.y} entering={t.entering} />
          ))}
        </div>

        {/* debug server response (оставил, но можно потом убрать) */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Ответ сервера</div>
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
            {resp ? JSON.stringify(resp, null, 2) : "Свайпай по полю"}
          </pre>
        </div>
      </div>

      <ToastContainer position="top-right" autoClose={2500} newestOnTop closeOnClick draggable pauseOnHover theme="dark" />
    </>
  );
}

function StatBox({ title, value }) {
  return (
    <div
      style={{
        borderRadius: 14,
        background: "rgba(0,0,0,0.22)",
        border: "1px solid rgba(255,255,255,0.10)",
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        minHeight: 44,
      }}
    >
      <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 900, letterSpacing: 0.6 }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.1 }}>{Number(value ?? 0)}</div>
    </div>
  );
}

function Tile({ value, x, y, entering }) {
  const [imgOk, setImgOk] = useState(true);
  const src = value ? `/numbers/${value}.png` : "";

  return (
    <div
      style={{
        position: "absolute",
        width: TILE_SIZE,
        height: TILE_SIZE,
        borderRadius: 16,
        left: 0,
        top: 0,
        transform: `translate(${x}px, ${y}px)`,
        transition: `transform ${ANIM_MS}ms ease`,
        background: "rgba(0,0,0,0.12)",
        border: "1px solid rgba(255,255,255,0.16)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        opacity: entering ? 0 : 1,
        animation: entering ? `ffgPop ${ANIM_MS}ms ease forwards` : "none",
      }}
    >
      {value ? (
        imgOk ? (
          <img
            src={src}
            alt={String(value)}
            style={{ width: "84%", height: "84%", objectFit: "contain", pointerEvents: "none" }}
            onError={() => setImgOk(false)}
          />
        ) : (
          <span style={{ fontWeight: 900, fontSize: 18, color: "white" }}>{value}</span>
        )
      ) : null}

      {/* keyframes inline */}
      <style>{`
        @keyframes ffgPop {
          0% { opacity: 0; transform: translate(${x}px, ${y}px) scale(0.6); }
          100% { opacity: 1; transform: translate(${x}px, ${y}px) scale(1); }
        }
      `}</style>
    </div>
  );
}

function btnSmall() {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.18)",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
  };
}
