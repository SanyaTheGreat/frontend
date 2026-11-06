import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import lottie from 'lottie-web';
import pako from 'pako';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import '../Home/Home.css';
import { API_BASE } from '../../apiBase';

function TgsLottie({ url, size = 140, speed = 1, loop = true }) {
  const elRef = useRef(null);
  const instRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`TGS not found: ${url}`);

        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);

        // .tgs = gzip compressed JSON
        const ungzipped = pako.ungzip(bytes, { to: 'string' });
        const animationData = JSON.parse(ungzipped);

        if (cancelled) return;

        try {
          instRef.current?.destroy?.();
        } catch { /* Optional animation cleanup. */ }
        instRef.current = null;

        instRef.current = lottie.loadAnimation({
          container: elRef.current,
          renderer: 'svg',
          loop,
          autoplay: true,
          animationData,
          rendererSettings: { progressiveLoad: true },
        });

        instRef.current.setSpeed(speed);
      } catch (e) {
        console.error('[TgsLottie] load error:', e);
      }
    })();

    return () => {
      cancelled = true;
      try {
        instRef.current?.destroy?.();
      } catch { /* Optional animation cleanup. */ }
      instRef.current = null;
    };
  }, [url, loop, speed]);

  return (
    <div style={{ margin: '24px 0 24px', display: 'flex', justifyContent: 'center' }}>
      <div
        ref={elRef}
        style={{
          width: size,
          height: size,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

export default function Home2048() {
  const navigate = useNavigate();
  const [loading2048, setLoading2048] = useState(false);
  const [hasActive2048, setHasActive2048] = useState(false);

  useEffect(() => {
    const existingRunId = localStorage.getItem('ffg_2048_run_id');
    setHasActive2048(Boolean(existingRunId));
  }, []);

  const startOrResume2048 = async () => {
    const token = localStorage.getItem('jwt');
    if (!token) {
      toast.error('Требуется авторизация. Открой Mini App в Telegram.');
      return;
    }

    setLoading2048(true);
    try {
      const res = await fetch(`${API_BASE}/game/run/start`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        toast.error(data?.error || 'Не удалось запустить 2048');
        if (res.status === 401 || res.status === 403) localStorage.removeItem('jwt');
        return;
      }

      localStorage.setItem('ffg_2048_run_id', data.run.id);
      localStorage.setItem('ffg_2048_period_id', data.period.id);
      setHasActive2048(true);

      toast.success(data.mode === 'resume' ? 'Продолжаем игру' : 'Новая игра запущена');
      navigate('/2048');
    } catch (e) {
      console.error(e);
      toast.error('Ошибка сети при запуске 2048');
    } finally {
      setLoading2048(false);
    }
  };

    const btnStyle = {
      width: '100%',
      padding: 16,
      borderRadius: 14,
      fontWeight: 900,
      fontSize: 16,
      cursor: 'pointer',
      position: 'relative',
      zIndex: 10,
    };

    return (
      <>
        <div className="starfield" aria-hidden="true" />

        <div style={{ position: 'relative', zIndex: 5, padding: 16, color: 'white' }}>
          {/* ✅ TGS animation above buttons */}
          <TgsLottie url="/numbers/9401.tgs" size={160} speed={1} loop={true} />

          <button
            type="button"
            onClick={startOrResume2048}
            disabled={loading2048}
            style={{
              ...btnStyle,
              border: 'none',
              background: '#ff9800',
              color: '#000',
              cursor: loading2048 ? 'not-allowed' : 'pointer',
              opacity: loading2048 ? 0.85 : 1,
              marginTop: 4,
            }}
          >
            {loading2048 ? 'Запускаем...' : hasActive2048 ? 'Продолжить' : 'Играть'}
          </button>

          <button
            type="button"
            onClick={() => navigate('/2048-rules')}
            style={{
              ...btnStyle,
              marginTop: 12,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(255,255,255,0.06)',
              color: '#fff',
            }}
          >
            Правила
          </button>

          <button
            type="button"
            onClick={() => navigate('/profile')}
              style={{
              ...btnStyle,
              marginTop: 12,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(255,255,255,0.06)',
              color: '#fff',
              }}
            >
            Профиль
          </button>

          <button
            type="button"
            onClick={() => navigate('/2048-leaderboard')}
            style={{
              ...btnStyle,
              marginTop: 12,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(255,255,255,0.06)',
              color: '#fff',
            }}
          >
            Таблица лидеров
          </button>
        </div>

        <ToastContainer
          position="top-right"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop={true}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="dark"
        />
      </>
    );
}
