import { useEffect, useMemo, useState } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const API_BASE = "https://lottery-server-waif.onrender.com";

export default function Game2048() {
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState(null);

  const [runId, setRunId] = useState("");
  const [periodId, setPeriodId] = useState("");

  const [grid, setGrid] = useState(null);
  const [score, setScore] = useState(null);
  const [moves, setMoves] = useState(null);

  const token = useMemo(() => localStorage.getItem("jwt") || "", []);

  useEffect(() => {
    setRunId(localStorage.getItem("ffg_2048_run_id") || "");
    setPeriodId(localStorage.getItem("ffg_2048_period_id") || "");
  }, []);

  const applyRunToUi = (data) => {
    const run = data?.run;
    if (!run) return;

    if (run?.id) {
      localStorage.setItem("ffg_2048_run_id", run.id);
      setRunId(String(run.id));
    }
    if (data?.period?.id) {
      localStorage.setItem("ffg_2048_period_id", data.period.id);
      setPeriodId(String(data.period.id));
    }

    const st = run?.state;
    if (st?.grid) setGrid(st.grid);

    if (Number.isFinite(run?.current_score)) setScore(run.current_score);
    if (Number.isFinite(run?.moves)) setMoves(run.moves);
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
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
      });

      const data = await res.json().catch(() => ({}));
      setResp({ status: res.status, ok: res.ok, data });

      if (!res.ok || !data?.ok) {
        toast.error(data?.error || "Ошибка запуска");
        if (res.status === 401 || res.status === 403) localStorage.removeItem("jwt");
        return;
      }

      applyRunToUi(data);
      toast.success(data.mode === "resume" ? "Resume OK" : "New run OK");
    } catch (e) {
      console.error(e);
      toast.error("Ошибка сети");
    } finally {
      setLoading(false);
    }
  };

  const move = async (dir) => {
    const jwt = localStorage.getItem("jwt");
    if (!jwt) {
      toast.error("Нет jwt. Открой Mini App в Telegram заново.");
      return;
    }

    setLoading(true);
    setResp(null);

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
      setResp({ status: res.status, ok: res.ok, data });

      if (!res.ok || !data?.ok) {
        toast.error(data?.error || "Move error");
        if (res.status === 401 || res.status === 403) localStorage.removeItem("jwt");
        return;
      }

      applyRunToUi(data);

      if (data?.finished) {
        toast.info(`Game Over (${data?.reason || "finished"})`);
      } else {
        toast.success(`Move: ${dir} (+${data?.gained ?? 0})`);
      }
    } catch (e) {
      console.error(e);
      toast.error("Ошибка сети (move)");
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
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
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
    setScore(null);
    setMoves(null);
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
        <div style={{ fontWeight: 900, fontSize: 20 }}>2048 • Debug</div>
        <div style={{ opacity: 0.8, marginTop: 6, fontSize: 12 }}>API: {API_BASE}</div>

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

        <div style={{ marginTop: 16, fontSize: 13, opacity: 0.9 }}>
          <div>
            <b>local run_id:</b> {runId || "—"}
          </div>
          <div>
            <b>local period_id:</b> {periodId || "—"}
          </div>
          <div style={{ marginTop: 6 }}>
            <b>score:</b> {score ?? "—"} &nbsp; <b>moves:</b> {moves ?? "—"}
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Grid</div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 72px)",
              gap: 10,
              background: "rgba(0,0,0,0.20)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 18,
              padding: 12,
              width: "fit-content",
            }}
          >
            {renderGrid(grid)}
          </div>

          <div style={{ opacity: 0.7, fontSize: 12, marginTop: 8 }}>
            Images: <code>/public/numbers/2.png ... 4096.png</code>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Move test</div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 56px)", gap: 10, alignItems: "center" }}>
            <div />
            <button type="button" onClick={() => move("up")} disabled={loading} style={arrowBtnStyle(loading)}>
              ⬆️
            </button>
            <div />

            <button type="button" onClick={() => move("left")} disabled={loading} style={arrowBtnStyle(loading)}>
              ⬅️
            </button>

            <button type="button" onClick={() => move("down")} disabled={loading} style={arrowBtnStyle(loading)}>
              ⬇️
            </button>

            <button type="button" onClick={() => move("right")} disabled={loading} style={arrowBtnStyle(loading)}>
              ➡️
            </button>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
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
              minHeight: 140,
            }}
          >
            {resp ? JSON.stringify(resp, null, 2) : "Нажми Start / Resume, потом стрелки"}
          </pre>
        </div>
      </div>

      <ToastContainer position="top-right" autoClose={2500} newestOnTop closeOnClick draggable pauseOnHover theme="dark" />
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
      }}
    >
      {value ? (
        imgOk ? (
          <img
            src={src}
            alt={String(value)}
            style={{ width: "82%", height: "82%", objectFit: "contain", pointerEvents: "none" }}
            onError={() => setImgOk(false)}
          />
        ) : (
          <span style={{ fontWeight: 900, fontSize: 18 }}>{value}</span>
        )
      ) : null}
    </div>
  );
}

function arrowBtnStyle(disabled) {
  return {
    width: 56,
    height: 56,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(0,0,0,0.25)",
    color: "white",
    fontSize: 22,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.7 : 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
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
