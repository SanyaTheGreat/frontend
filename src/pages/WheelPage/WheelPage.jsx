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
      if (!partRes.ok) throw new Error(`Ошибка запроса участников: ${partRes.status}`);
      const partData = await partRes.json();

      // Получаем статус колеса и победителя
      const statusRes = await fetch(`${API_BASE_URL}/wheel/${wheelId}/status`);
      if (!statusRes.ok) throw new Error(`Ошибка запроса статуса: ${statusRes.status}`);
      const statusData = await statusRes.json();

      // Фильтрация уникальных участников по user_id и сортировка по joined_at
      const participantsRaw = partData.participants || [];
      const uniqueMap = new Map();

      participantsRaw.forEach(p => {
        if (!uniqueMap.has(p.user_id)) {
          uniqueMap.set(p.user_id, p);
        } else {
          // Если уже есть участник, проверим дату joined_at и обновим, если нужно
          const existing = uniqueMap.get(p.user_id);
          if (new Date(p.joined_at) < new Date(existing.joined_at)) {
            uniqueMap.set(p.user_id, p);
          }
        }
      });

      // Преобразуем и сортируем по joined_at
      const uniqueParticipants = Array.from(uniqueMap.values())
        .sort((a, b) => new Date(a.joined_at) - new Date(b.joined_at))
        .map(p => ({
          username: p.username || `user${p.user_id}`
        }));

      setParticipants(uniqueParticipants);
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
