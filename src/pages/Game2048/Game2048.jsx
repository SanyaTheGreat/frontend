import { useEffect, useMemo, useRef, useState } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const API_BASE = "https://lottery-server-waif.onrender.com";

// UI tuning
const GRID_SIZE = 4;
const TILE_PX = 72; // размер тайла
const GAP_PX = 10;  // gap между клетками
const BOARD_PAD = 12;

const ANIM_MS = 140;      // скорость слайда
const SPAWN_MS = 120;     // скорость появления нового тайла
const SWIPE_THRESHOLD = 26;

const LOGO_4096_SRC = "/ui/4096.png"; // <-- положи png сюда

export default function Game2048() {
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState(null);

  const [grid, setGrid] = useState(null);
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(0);

  // попытки (покажем как ты просил)
  const [attempts, setAttempts] = useState({
    daily_attempts_remaining: null,
    referral_attempts_balance: null,
    daily_plays_used: null,
  });

  // Для анимаций
  const [tiles, setTiles] = useState([]); // список объектов {id, r, c, v, isNew}
  const tileIdSeq = useRef(1);
  const lastGridRef = useRef(null);
  const animLockRef = useRef(false);

  // swipe
  const touchStartRef = useRef(null);

  // jwt
  const token = useMemo(() => localStorage.getItem("jwt") || "", []);

  useEffect(() => {
    // при первом заходе — если есть сохранённый run — попробуем его резюмнуть
    // (но не автозапускаем, чтобы ты контролил)
  }, []);

  function boardW() {
    return BOARD_PAD * 2 + GRID_SIZE * TILE_PX + (GRID_SIZE - 1) * GAP_PX;
  }

  function posForCell(r, c) {
    const x = BOARD_PAD + c * (TILE_PX + GAP_PX);
    const y = BOARD_PAD + r * (TILE_PX + GAP_PX);
    return { x, y };
  }

  function normalizeGrid(g) {
    const empty = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
    if (!Array.isArray(g) || g.length !== GRID_SIZE) return empty;
    if (!g.every((row) => Array.isArray(row) && row.length === GRID_SIZE)) return empty;
    return g.map((row) => row.map((v) => Number(v) || 0));
  }

  // Превращаем grid в tiles (без дублей) — один тайл на клетку (как у тебя на сервере)
  // Это не “идеальная 2048-анимация с merge-tracking”, но визуально даёт плавный слайд + spawn.
  function gridToTiles(nextGrid, prevTiles = []) {
    const g = normalizeGrid(nextGrid);

    // карта старых тайлов по позиции
    const prevMap = new Map();
    for (const t of prevTiles) prevMap.set(`${t.r}:${t.c}`, t);

    const out = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const v = g[r][c];
        if (!v) continue;

        const key = `${r}:${c}`;
        const old = prevMap.get(key);

        if (old && old.v === v) {
          out.push({ ...old, r, c, v, isNew: false });
        } else {
          // новый (или изменился) — дадим новый id, чтобы spawn анимация работала корректно
          out.push({ id: String(tileIdSeq.current++), r, c, v, isNew: true });
        }
      }
    }
    return out;
  }

  function applyServerDataToUI(data) {
    const run = data?.run;
    if (!run) return;

    const nextGrid = normalizeGrid(run?.state?.grid);
    setGrid(nextGrid);

    setScore(Number(run?.current_score ?? 0));
    setMoves(Number(run?.moves ?? 0));

    if (data?.attempts) {
      setAttempts({
        daily_attempts_remaining: data.attempts.daily_attempts_remaining ?? null,
        referral_attempts_balance: data.attempts.referral_attempts_balance ?? null,
        daily_plays_used: data.attempts.daily_plays_used ?? null,
      });
    }

    // ВАЖНО: чтобы не было “всё в (0,0)” — tiles должны иметь позицию сразу
    setTiles((prev) => gridToTiles(nextGrid, prev));
    lastGridRef.current = nextGrid;
  }

  async function startOrResume() {
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

      localStorage.setItem("ffg_2048_run_id", data.run?.id || "");
      localStorage.setItem("ffg_2048_period_id", data.period?.id || "");

      applyServerDataToUI(data);
      toast.success(data.mode === "resume" ? "Продолжаем игру" : "Новая игра");
    } catch (e) {
      console.error(e);
      toast.error("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }

  // --- Оптимистичный ход: локально сразу анимируем, сервер — параллельно ---
  function localMoveSimulate(dir) {
    // Супер-упрощённо: мы НЕ пересчитываем 2048 на клиенте полностью (можно, но долго).
    // Поэтому делаем так:
    // 1) блокируем на время
    // 2) просто отправляем запрос и ждём ответ
    //
    // Но чтобы у тебя было “сразу видно движение”, нам нужен клиентский симулятор.
    // Я даю рабочий вариант: переносим симуляцию из бэка на фронт минимально.

    const g0 = normalizeGrid(lastGridRef.current);
    if (!g0) return null;

    const { nextGrid, moved } = simulate2048Step(g0, dir);
    if (!moved) return { nextGrid: g0, moved: false };

    return { nextGrid, moved: true };
  }

  async function move(dir) {
    const jwt = localStorage.getItem("jwt");
    if (!jwt) {
      toast.error("Нет jwt. Открой Mini App в Telegram заново.");
      return;
    }
    if (animLockRef.current) return;

    // 1) локально — сразу
    const sim = localMoveSimulate(dir);
    if (sim?.moved) {
      animLockRef.current = true;

      const nextGrid = sim.nextGrid;
      setGrid(nextGrid);

      // важно: tiles обновляем сразу -> CSS transition покажет слайд
      setTiles((prev) => {
        const nextTiles = gridToTiles(nextGrid, prev);

        // spawn: делаем isNew true только для реально новых клеток
        // (gridToTiles уже это делает, но после слайда быстро “снимаем” флаг)
        setTimeout(() => {
          setTiles((cur) => cur.map((t) => ({ ...t, isNew: false })));
        }, SPAWN_MS);

        return nextTiles;
      });

      // отпускаем лок через длительность анимации
      setTimeout(() => {
        animLockRef.current = false;
      }, ANIM_MS);
    }

    // 2) сервер — подтверждение
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
        // если сервер не принял — ресинхронизируемся через start/resume
        toast.error(data?.error || "Move error");
        if (res.status === 401 || res.status === 403) localStorage.removeItem("jwt");
        await safeResync();
        return;
      }

      // серверная истина
      applyServerDataToUI(data);

      if (data?.finished) {
        toast.info(`Game Over (${data?.reason || "finished"})`);
      }
      // ✅ убрали toast на каждый удачный шаг
    } catch (e) {
      console.error(e);
      toast.error("Ошибка сети (move)");
      await safeResync();
    } finally {
      setLoading(false);
    }
  }

  async function safeResync() {
    // мягко ресинхронизируем состояние
    try {
      const jwt = localStorage.getItem("jwt");
      if (!jwt) return;
      const res = await fetch(`${API_BASE}/game/run/start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) applyServerDataToUI(data);
    } catch {}
  }

  async function finish() {
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

      applyServerDataToUI({ ...data, run: data.run });
      toast.success("Finished");
    } catch (e) {
      console.error(e);
      toast.error("Ошибка сети (finish)");
    } finally {
      setLoading(false);
    }
  }

  // --- SWIPE ---
  function onTouchStart(e) {
    if (loading) return;
    const t = e.touches?.[0];
    if (!t) return;
    touchStartRef.current = { x: t.clientX, y: t.clientY, at: Date.now() };
  }

  function onTouchEnd(e) {
    if (loading) return;
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;

    const t = e.changedTouches?.[0];
    if (!t) return;

    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;

    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    if (Math.max(adx, ady) < SWIPE_THRESHOLD) return;

    if (adx > ady) {
      move(dx > 0 ? "right" : "left");
    } else {
      move(dy > 0 ? "down" : "up");
    }
  }

  // стартовая инициализация tiles, чтобы НЕ было свалки в (0,0)
  useEffect(() => {
    const g = normalizeGrid(grid);
    if (!g) return;
    setTiles((prev) => gridToTiles(g, prev));
    lastGridRef.current = g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid?.toString?.()]); // лёгкий триггер

  const attemptsText = formatAttempts(attempts);

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
        {/* top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img
              src={LOGO_4096_SRC}
              alt="4096"
              style={{ width: 44, height: 44, objectFit: "contain", filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.35))" }}
              onError={(e) => {
                // fallback если png не найден
                e.currentTarget.style.display = "none";
              }}
            />
            <div>
              <div style={{ fontWeight: 900, fontSize: 18, lineHeight: 1.1 }}>4096</div>
              <div style={{ opacity: 0.75, fontSize: 12 }}>{attemptsText}</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <StatBox title="SCORE" value={score} />
            <StatBox title="MOVES" value={moves} />
            {/* Best week позже подключим */}
          </div>
        </div>

        {/* actions */}
        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={startOrResume} disabled={loading} style={btnPrimary(loading)}>
            {loading ? "..." : "Start / Resume"}
          </button>
          <button type="button" onClick={finish} disabled={loading} style={btnGhost(loading)}>
            Finish
          </button>
        </div>

        {/* board */}
        <div style={{ marginTop: 14 }}>
          <div
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            style={{
              width: boardW(),
              height: boardW(),
              position: "relative",
              borderRadius: 18,
              background: "rgba(0,0,0,0.20)",
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
              overflow: "hidden",
              touchAction: "none", // важно: чтобы свайп не скроллил страницу
              userSelect: "none",
            }}
          >
            {/* background cells */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                padding: BOARD_PAD,
                display: "grid",
                gridTemplateColumns: `repeat(${GRID_SIZE}, ${TILE_PX}px)`,
                gridTemplateRows: `repeat(${GRID_SIZE}, ${TILE_PX}px)`,
                gap: GAP_PX,
              }}
            >
              {Array.from({ length: 16 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: TILE_PX,
                    height: TILE_PX,
                    borderRadius: 16,
                    background: "rgba(0,0,0,0.25)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                />
              ))}
            </div>

            {/* tiles layer */}
            <div style={{ position: "absolute", inset: 0 }}>
              {tiles.map((t) => {
                const { x, y } = posForCell(t.r, t.c);
                const src = t.v ? `/numbers/${t.v}.png` : "";
                return (
                  <div
                    key={t.id}
                    style={{
                      position: "absolute",
                      width: TILE_PX,
                      height: TILE_PX,
                      borderRadius: 16,
                      transform: `translate3d(${x}px, ${y}px, 0)`,
                      transition: `transform ${ANIM_MS}ms cubic-bezier(.2,.9,.2,1)`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      willChange: "transform",
                    }}
                  >
                    <img
                      src={src}
                      alt={String(t.v)}
                      draggable={false}
                      style={{
                        width: "88%",
                        height: "88%",
                        objectFit: "contain",
                        pointerEvents: "none",
                        transform: t.isNew ? "scale(0.82)" : "scale(1)",
                        opacity: 1,
                        transition: `transform ${SPAWN_MS}ms ease-out`,
                        filter: "drop-shadow(0 10px 18px rgba(0,0,0,0.28))",
                      }}
                      onLoad={(e) => {
                        // если новый — даём кадр, чтобы scale плавно дорос
                        if (t.isNew) {
                          requestAnimationFrame(() => {
                            try {
                              e.currentTarget.style.transform = "scale(1)";
                            } catch {}
                          });
                        }
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ marginTop: 10, opacity: 0.65, fontSize: 12 }}>
            Управление: только свайп. Тайлы: <code>/public/numbers/2.png ... 4096.png</code>
          </div>
        </div>

        {/* debug server response */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Debug</div>
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
            {resp ? JSON.stringify(resp, null, 2) : "Нажми Start / Resume, потом свайпай"}
          </pre>
        </div>
      </div>

      <ToastContainer position="top-right" autoClose={2200} newestOnTop closeOnClick draggable pauseOnHover theme="dark" />
    </>
  );
}

function StatBox({ title, value }) {
  return (
    <div
      style={{
        minWidth: 84,
        padding: "10px 12px",
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(0,0,0,0.22)",
        textAlign: "left",
      }}
    >
      <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 800, letterSpacing: 0.8 }}>{title}</div>
      <div style={{ fontSize: 16, fontWeight: 900, marginTop: 4 }}>{Number(value ?? 0).toLocaleString()}</div>
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

function formatAttempts(a) {
  const d = a?.daily_attempts_remaining;
  const r = a?.referral_attempts_balance;
  const used = a?.daily_plays_used;
  const parts = [];
  if (Number.isFinite(d)) parts.push(`Попытки: ${d}`);
  if (Number.isFinite(r)) parts.push(`Реф: ${r}`);
  if (Number.isFinite(used)) parts.push(`Сыграно сегодня: ${used}/20`);
  return parts.length ? parts.join(" • ") : " ";
}

/**
 * Мини-симулятор 2048 на клиенте (чтобы слайд был сразу, без ожидания сервера)
 * Без RNG (мы не спавним 2/4 здесь идеально как на сервере), но визуально это даёт мгновенную анимацию.
 * Сервер потом пришлёт истинный grid — он заменит локальный.
 */
function simulate2048Step(grid, dir) {
  const g = grid.map((row) => row.slice());

  const rotateLeft = (m) => {
    const n = m.length;
    const out = Array.from({ length: n }, () => Array(n).fill(0));
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) out[n - 1 - c][r] = m[r][c];
    return out;
  };

  const rotateRight = (m) => {
    const n = m.length;
    const out = Array.from({ length: n }, () => Array(n).fill(0));
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) out[c][n - 1 - r] = m[r][c];
    return out;
  };

  const moveLeft = (row) => {
    const filtered = row.filter((x) => x !== 0);
    const out = [];
    for (let i = 0; i < filtered.length; i++) {
      if (i + 1 < filtered.length && filtered[i] === filtered[i + 1]) {
        out.push(filtered[i] * 2);
        i++;
      } else {
        out.push(filtered[i]);
      }
    }
    while (out.length < 4) out.push(0);
    return out;
  };

  let work = g;
  if (dir === "up") work = rotateLeft(work);
  if (dir === "down") work = rotateRight(work);
  if (dir === "right") {
    work = work.map((r) => r.slice().reverse()).map(moveLeft).map((r) => r.reverse());
  } else {
    work = work.map(moveLeft);
  }
  if (dir === "up") work = rotateRight(work);
  if (dir === "down") work = rotateLeft(work);

  const moved = !sameGrid(g, work);
  return { nextGrid: work, moved };
}

function sameGrid(a, b) {
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (a[r][c] !== b[r][c]) return false;
  return true;
}
