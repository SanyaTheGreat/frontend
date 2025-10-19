import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Wheel from '../../components/Wheel/Wheel';
import './WheelPage.css';

const API_BASE_URL = 'https://lottery-server-waif.onrender.com/wheel';

export default function WheelPage() {
  const { id: wheel_id } = useParams();
  const navigate = useNavigate();

  const [participants, setParticipants] = useState([]);
  const [wheelSize, setWheelSize] = useState(0);
  const [winner, setWinner] = useState(null);
  const [completedAt, setCompletedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [animStarted, setAnimStarted] = useState(false);
  const [status, setStatus] = useState('active');
  const [timeLeft, setTimeLeft] = useState(null);
  const [runAt, setRunAt] = useState(null);
  const [showWinnerModal, setShowWinnerModal] = useState(false);

  const timerRef = useRef(null);
  const pollRef = useRef(null);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('jwt');
    if (!token) return null;
    return { Authorization: `Bearer ${token}` };
  };

  const fetchData = async (isInitial = false) => {
    try {
      const auth = getAuthHeaders();
      if (!auth) {
        if (isInitial) setLoading(false);
        alert('Требуется авторизация в Telegram. Открой Mini App внутри Telegram.');
        return;
      }

      if (isInitial) setLoading(true);
      else setRefreshing(true);

      // Участники
      const partRes = await fetch(`${API_BASE_URL}/${wheel_id}/participants`, {
        headers: { ...auth }
      });
      if (partRes.status === 401 || partRes.status === 403) throw new Error('unauthorized');
      if (!partRes.ok) throw new Error(`Ошибка запроса участников: ${partRes.status}`);
      const partData = await partRes.json();

      const participantsRaw = partData.participants || [];
      const uniqueMap = new Map();
      participantsRaw.forEach(p => {
        if (!uniqueMap.has(p.user_id)) uniqueMap.set(p.user_id, p);
        else {
          const existing = uniqueMap.get(p.user_id);
          if (new Date(p.joined_at) < new Date(existing.joined_at)) uniqueMap.set(p.user_id, p);
        }
      });
      const uniqueParticipants = Array.from(uniqueMap.values())
        .sort((a, b) => new Date(a.joined_at) - new Date(b.joined_at))
        .map(p => ({ username: p.username || `user${p.user_id}` }));
      setParticipants(uniqueParticipants);

      // Данные колеса
      const wheelRes = await fetch(`${API_BASE_URL}/${wheel_id}`, {
        headers: { ...auth }
      });
      if (wheelRes.status === 401 || wheelRes.status === 403) throw new Error('unauthorized');
      if (!wheelRes.ok) throw new Error(`Ошибка запроса колеса: ${wheelRes.status}`);
      const wheelData = await wheelRes.json();
      setWheelSize(wheelData.size || 0);
      setRunAt(wheelData.run_at || null);

      // Результаты
      const resultRes = await fetch(`${API_BASE_URL}/results`, {
        headers: { ...auth }
      });
      if (resultRes.status === 401 || resultRes.status === 403) throw new Error('unauthorized');
      if (!resultRes.ok) throw new Error(`Ошибка запроса результатов: ${resultRes.status}`);
      const resultData = await resultRes.json();

      const thisResult = resultData.results.find(r => String(r.wheel_id) === String(wheel_id));
      if (thisResult) {
        const winnerNormalized = thisResult.winner.replace(/^@/, '');
        if (!animStarted) {
          setWinner(winnerNormalized || null);
          setCompletedAt(thisResult.completed_at || null);
          setStatus('completed');
        }
      } else {
        if (!animStarted) {
          setWinner(null);
          setCompletedAt(null);
          setStatus('active');
        }
      }
    } catch (e) {
      if (e?.message === 'unauthorized') {
        localStorage.removeItem('jwt');
        alert('Сессия истекла. Пожалуйста, заново открой Mini App в Telegram.');
      } else {
        alert(`Ошибка загрузки данных колеса: ${e.message || e}`);
      }
    } finally {
      if (isInitial) setLoading(false);
      else setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData(true);
    pollRef.current = setInterval(() => {
      if (!(status === 'completed' && animStarted)) fetchData(false);
    }, 50000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wheel_id]);

  useEffect(() => {
    if (status !== 'completed' || !completedAt || !winner) {
      setTimeLeft(null);
      return;
    }

    let remaining = 30;
    setTimeLeft(remaining);

    timerRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining < 0) {
        clearInterval(timerRef.current);
        setTimeLeft(null);
        setAnimStarted(true);
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } else {
        setTimeLeft(remaining);
      }
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [status, completedAt, winner]);

  useEffect(() => {
    if (!runAt || status !== 'active') return;

    const interval = setInterval(() => {
      const now = new Date();
      const runTime = new Date(runAt);

      if (now >= runTime) {
        clearInterval(interval);
        setAnimStarted(true);
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [runAt, status]);

  const handleAnimFinish = () => setShowWinnerModal(true);
  const handleCloseModal = () => {
    setShowWinnerModal(false);
    navigate('/');
  };

  return (
    <div className="wheel-page-wrapper" style={{ position: 'relative' }}>
      {refreshing && (
        <div style={{
          position: 'absolute', top: 8, right: 8, padding: '6px 10px',
          background: 'rgba(0,0,0,0.5)', color: '#fff', borderRadius: 8, fontSize: 12
        }}>
          обновление…
        </div>
      )}

      <h2>Колесо №{wheel_id}</h2>
      <p>Участников: {participants.length}</p>

      {status === 'active' && <p>Набор участников</p>}
      {status === 'completed' && timeLeft !== null && <p>Запуск через: {timeLeft} сек.</p>}

      {loading ? (
        <div style={{ padding: 20 }}>Загрузка…</div>
      ) : (
        <>
          <Wheel
            participants={participants}
            wheelSize={wheelSize}
            winnerUsername={animStarted ? winner : null}
            spinDuration={Math.min(15000 + participants.length * 1000, 25000)}
            onFinish={handleAnimFinish}
          />
          <button onClick={() => navigate('/')}>Главное меню</button>
        </>
      )}

      {showWinnerModal && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex',
          justifyContent: 'center', alignItems: 'center', zIndex: 9999,
        }}>
          <div className="modal" style={{
            background: '#222', padding: '15px 20px', borderRadius: '12px',
            color: 'white', textAlign: 'center', minWidth: '200px',
          }}>
            <h2>Победитель {winner}</h2>
            <button
              onClick={handleCloseModal}
              style={{
                marginTop: '20px', padding: '10px 20px', borderRadius: '6px',
                border: 'none', cursor: 'pointer', backgroundColor: '#4CAF50',
                color: 'white', fontSize: '16px',
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
