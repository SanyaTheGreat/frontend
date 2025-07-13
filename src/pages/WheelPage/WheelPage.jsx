import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Wheel from '../../components/Wheel/Wheel';
import './WheelPage.css';

const API_BASE_URL = 'https://lottery-server-waif.onrender.com';

export default function WheelPage() {
  const { id: wheelId } = useParams();
  const navigate = useNavigate();

  const [participants, setParticipants] = useState([]);
  const [winner, setWinner] = useState(null);
  const [completedAt, setCompletedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [animStarted, setAnimStarted] = useState(false);
  const timerRef = useRef(null);

  // Загрузка данных колеса: участников и статуса
  const fetchData = async () => {
    try {
      setLoading(true);

      // Получаем участников из wheel_participants
      const partRes = await fetch(`${API_BASE_URL}/wheel/${wheelId}/participants`);
      const partData = await partRes.json();

      // Получаем статус колеса и победителя
      const statusRes = await fetch(`${API_BASE_URL}/wheel/${wheelId}/status`);
      const statusData = await statusRes.json();

      // Участники — массив с { user_id, username, joined_at }, оставим только username для колеса
      const participantsList = (partData.participants || []).map(p => ({
        username: p.username || `user${p.user_id}`
      }));

      setParticipants(participantsList);
      setWinner(statusData.winnerUsername || null);
      setCompletedAt(statusData.completedAt || null);
    } catch (e) {
      console.error('Ошибка загрузки данных колеса:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [wheelId]);

  // Таймер запуска анимации через 30 секунд после completedAt
  useEffect(() => {
    if (!completedAt || !winner) return;

    const now = Date.now();
    const completedTime = new Date(completedAt).getTime();
    const elapsed = now - completedTime;
    const delay = 30000 - elapsed;

    if (delay <= 0) {
      setAnimStarted(true);
    } else {
      timerRef.current = setTimeout(() => {
        setAnimStarted(true);
      }, delay);
    }

    return () => clearTimeout(timerRef.current);
  }, [completedAt, winner]);

  const handleAnimFinish = () => {
    alert(`Победитель: ${winner}`);
  };

  if (loading) return <div>Загрузка...</div>;

  return (
    <div className="wheel-page-wrapper">
      <h2>Колесо №{wheelId}</h2>
      <p>Участников: {participants.length}</p>
      <Wheel
        participants={participants}
        winnerUsername={winner}
        spinDuration={Math.min(15000 + participants.length * 1000, 25000)}
        onFinish={handleAnimFinish}
        key={animStarted ? 'spin' : 'stop'} // перезапуск анимации при запуске
      />
      <button onClick={() => navigate('/')}>Главное меню</button>
    </div>
  );
}
