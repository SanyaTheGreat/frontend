import { useMemo, useState } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const API_BASE = 'https://lottery-server-waif.onrender.com';

export default function Game2048() {
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState(null);

  const runId = useMemo(() => localStorage.getItem('ffg_2048_run_id') || '', []);
  const periodId = useMemo(() => localStorage.getItem('ffg_2048_period_id') || '', []);

  const startOrResume = async () => {
    const token = localStorage.getItem('jwt');
    if (!token) {
      toast.error('Нет jwt. Открой Mini App в Telegram заново.');
      return;
    }

    setLoading(true);
    setResp(null);

    try {
      const res = await fetch(`${API_BASE}/game/run/start`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await res.json().catch(() => ({}));
      setResp({ status: res.status, ok: res.ok, data });

      if (!res.ok || !data?.ok) {
        toast.error(data?.error || 'Ошибка запуска');
        if (res.status === 401 || res.status === 403) localStorage.removeItem('jwt');
        return;
      }

      if (data?.run?.id) localStorage.setItem('ffg_2048_run_id', data.run.id);
      if (data?.period?.id) localStorage.setItem('ffg_2048_period_id', data.period.id);

      toast.success(data.mode === 'resume' ? 'Resume OK' : 'New run OK');
    } catch (e) {
      console.error(e);
      toast.error('Ошибка сети');
    } finally {
      setLoading(false);
    }
  };

  const move = async (dir) => {
    const token = localStorage.getItem('jwt');
    if (!token) {
      toast.error('Нет jwt. Открой Mini App в Telegram заново.');
      return;
    }

    setLoading(true);
    setResp(null);

    try {
      const res = await fetch(`${API_BASE}/game/run/move`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dir }),
      });

      const data = await res.json().catch(() => ({}));
      setResp({ status: res.status, ok: res.ok, data });

      if (!res.ok || !data?.ok) {
        toast.error(data?.error || 'Move error');
        if (res.status === 401 || res.status === 403) localStorage.removeItem('jwt');
        return;
      }

      toast.success(`Move: ${dir}`);
    } catch (e) {
      console.error(e);
      toast.error('Ошибка сети (move)');
    } finally {
      setLoading(false);
    }
  };

  const clearLocal = () => {
    localStorage.removeItem('ffg_2048_run_id');
    localStorage.removeItem('ffg_2048_period_id');
    toast.info('Локалка очищена');
  };

  return (
    <>
      <div className="starfield" aria-hidden="true" />

      <div
        style={{
          position: 'relative',
          zIndex: 5,
          padding: 16,
          color: 'white',
          maxWidth: 720,
          margin: '0 auto',
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 20 }}>2048 • Debug</div>
        <div style={{ opacity: 0.8, marginTop: 6, fontSize: 12 }}>
          API: {API_BASE}
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={startOrResume}
            disabled={loading}
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              border: 'none',
              background: '#ff9800',
              color: '#000',
              fontWeight: 900,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Запускаем...' : 'Start / Resume'}
          </button>

          <button
            type="button"
            onClick={clearLocal}
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(0,0,0,0.2)',
              color: 'white',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Clear local run_id
          </button>
        </div>

        <div style={{ marginTop: 16, fontSize: 13, opacity: 0.9 }}>
          <div>
            <b>local run_id:</b> {runId || '—'}
          </div>
          <div>
            <b>local period_id:</b> {periodId || '—'}
          </div>
        </div>

        {/* MOVE TEST */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Move test (stub)</div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 56px)', gap: 10, alignItems: 'center' }}>
            <div />
            <button
              type="button"
              onClick={() => move('up')}
              disabled={loading}
              style={arrowBtnStyle(loading)}
              aria-label="Move up"
            >
              ⬆️
            </button>
            <div />

            <button
              type="button"
              onClick={() => move('left')}
              disabled={loading}
              style={arrowBtnStyle(loading)}
              aria-label="Move left"
            >
              ⬅️
            </button>

            <button
              type="button"
              onClick={() => move('down')}
              disabled={loading}
              style={arrowBtnStyle(loading)}
              aria-label="Move down"
            >
              ⬇️
            </button>

            <button
              type="button"
              onClick={() => move('right')}
              disabled={loading}
              style={arrowBtnStyle(loading)}
              aria-label="Move right"
            >
              ➡️
            </button>
          </div>

          <div style={{ marginTop: 8, opacity: 0.7, fontSize: 12 }}>
            Эти кнопки просто пишут действие в <b>game_runs.actions</b>.
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Ответ сервера</div>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: 'rgba(0,0,0,0.35)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 14,
              padding: 12,
              fontSize: 12,
              lineHeight: 1.35,
              minHeight: 140,
            }}
          >
            {resp ? JSON.stringify(resp, null, 2) : 'Нажми Start / Resume, потом стрелки'}
          </pre>
        </div>
      </div>

      <ToastContainer
        position="top-right"
        autoClose={2500}
        hideProgressBar={false}
        newestOnTop={true}
        closeOnClick
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
      />
    </>
  );
}

function arrowBtnStyle(disabled) {
  return {
    width: 56,
    height: 56,
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.18)',
    background: 'rgba(0,0,0,0.25)',
    color: 'white',
    fontSize: 22,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.7 : 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
}
