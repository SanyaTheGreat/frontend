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
  const [animStarted, setAnimStarted] = useState(false);
  const timerRef = useRef(null);
  const [status, setStatus] = useState('active');
  const [timeLeft, setTimeLeft] = useState(null);
  const [runAt, setRunAt] = useState(null);

  const [showWinnerModal, setShowWinnerModal] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);

      const partRes = await fetch(`${API_BASE_URL}/${wheel_id}/participants`);
      if (!partRes.ok) throw new Error(`Ошибка запроса участников: ${partRes.status}`);
      const partData = await partRes.json();

      const participantsRaw = partData.participants || [];
      const uniqueMap = new Map();
      participantsRaw.forEach(p => {
        if (!uniqueMap.has(p.user_id)) {
          uniqueMap.set(p.user_id, p);
        } else {
          const existing = uniqueMap.get(p.user_id);
          if (new Date(p.joined_at) < new Date(existing.joined_at)) {
            uniqueMap.set(p.user_id, p);
          }
        }
      });
      const uniqueParticipants = Array.from(uniqueMap.values())
        .sort((a, b) => new Date(a.joined_at) - new Date(b.joined_at))
        .map(p => ({ username: p.username || `user${p.user_id}` }));

      setParticipants(uniqueParticipants);

      const wheelRes = await fetch(`${API_BASE_URL}/${wheel_id}`);
      if (!wheelRes.ok) throw new Error(`Ошибка запроса колеса: ${wheelRes.status}`);
      const wheelData = await wheelRes.json();
      setWheelSize(wheelData.size || 0);
      setRunAt(wheelData.run_at || null);

      const resultRes = await fetch(`${API_BASE_URL}/results`);
      if (!resultRes.ok) throw new Error(`Ошибка запроса результатов: ${resultRes.status}`);
      const resultData = await resultRes.json();

      const thisResult = resultData.results.find(r => String(r.wheel_id) === String(wheel_id));
      if (thisResult) {
        const winnerNormalized = thisResult.winner.replace(/^@/, '');
        if (!animStarted) { // не обновляем winner, если анимация уже запущена
          setWinner(winnerNormalized || null);
          setCompletedAt(thisResult.completed_at || null);
          setStatus('completed');
        }
      } else {
        if (!animStarted) { // аналогично — не сбрасываем winner
          setWinner(null);
          setCompletedAt(null);
          setStatus('active');
        }
      }
    } catch (e) {
      alert(`Ошибка загрузки данных колеса: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const intervalId = setInterval(fetchData, 50000);

    // отключаем обновление, если матч завершён и анимация уже запущена
    if (status === 'completed' && animStarted) {
      clearInterval(intervalId);
    }

    return () => clearInterval(intervalId);
  }, [wheel_id, status, animStarted]);

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
        setTimeout(() => {
          fetchData();
        }, 3000);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [runAt, status]);

  const handleAnimFinish = () => {
    setShowWinnerModal(true);
  };

  const handleCloseModal = () => {
    setShowWinnerModal(false);
    navigate('/');
  };

  if (loading) return <div>Загрузка...</div>;

  return (
    <div className="wheel-page-wrapper">
      <h2>Колесо №{wheel_id}</h2>
      <p>Участников: {participants.length}</p>

      {status === 'active' && <p>Набор участников</p>}

      {status === 'completed' && timeLeft !== null && <p>Запуск через: {timeLeft} сек.</p>}

      <Wheel
        participants={participants}
        wheelSize={wheelSize}
        winnerUsername={animStarted ? winner : null}
        spinDuration={Math.min(15000 + participants.length * 1000, 25000)}
        onFinish={handleAnimFinish}
      />

      <button onClick={() => navigate('/')}>Главное меню</button>

      {showWinnerModal && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
        }}>
          <div className="modal" style={{
            background: '#222',
            padding: '15px 20px',
            borderRadius: '12px',
            color: 'white',
            textAlign: 'center',
            minWidth: '200px',
          }}>
            <h2>Победитель {winner}</h2>
            <button
              onClick={handleCloseModal}
              style={{
                marginTop: '20px',
                padding: '10px 20px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: '#4CAF50',
                color: 'white',
                fontSize: '16px',
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
