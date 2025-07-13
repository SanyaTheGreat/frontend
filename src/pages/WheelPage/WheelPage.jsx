import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Wheel from '../../components/Wheel/Wheel';
import './WheelPage.css';

const API_BASE_URL = 'https://lottery-server-waif.onrender.com/wheel';

export default function WheelPage() {
  const { id: wheelId } = useParams();
  const navigate = useNavigate();

  const [participants, setParticipants] = useState([]);
  const [wheelSize, setWheelSize] = useState(0);
  const [winner, setWinner] = useState(null);
  const [completedAt, setCompletedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [animStarted, setAnimStarted] = useState(false);
  const timerRef = useRef(null);
  const [status, setStatus] = useState('active'); // по умолчанию active

  const fetchData = async () => {
    try {
      setLoading(true);

      // Получаем участников по wheelId
      const partRes = await fetch(`${API_BASE_URL}/${wheelId}/participants`);
      if (!partRes.ok) throw new Error(`Ошибка запроса участников: ${partRes.status}`);
      const partData = await partRes.json();

      // Фильтрация уникальных участников по user_id и сортировка по joined_at
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

      // Получаем данные о колесе, чтобы знать wheelSize
      const wheelRes = await fetch(`${API_BASE_URL}/${wheelId}`);
      if (!wheelRes.ok) throw new Error(`Ошибка запроса колеса: ${wheelRes.status}`);
      const wheelData = await wheelRes.json();
      setWheelSize(wheelData.size || 0);

      // Получаем результат розыгрыша (победителя) по wheelId
      const resultRes = await fetch(`${API_BASE_URL}/results`);
      if (!resultRes.ok) throw new Error(`Ошибка запроса результатов: ${resultRes.status}`);
      const resultData = await resultRes.json();

      // Найдём результат по числовому wheel_id (если id строка — привести к числу)
      const thisResult = resultData.results.find(r => String(r.wheel_id) === String(wheelId));

      if (thisResult) {
        setWinner(thisResult.winner || null);
        setCompletedAt(thisResult.completed_at || null);
        setStatus('completed');
      } else {
        setWinner(null);
        setCompletedAt(null);
        setStatus('active');
      }
    } catch (e) {
      console.error('Ошибка загрузки данных колеса:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [wheelId]);

  // Таймер запуска анимации через 60 секунд после completedAt
  useEffect(() => {
    if (!completedAt || !winner) return;

    const now = Date.now();
    const completedTime = new Date(completedAt).getTime();
    const elapsed = now - completedTime;
    const delay = 60000 - elapsed; // 60 секунд

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
      <p>Статус: {status}</p>
      <Wheel
        participants={participants}
        wheelSize={wheelSize}
        winnerUsername={winner}
        spinDuration={Math.min(15000 + participants.length * 1000, 25000)}
        onFinish={handleAnimFinish}
        key={animStarted ? 'spin' : 'stop'}
      />
      <button onClick={() => navigate('/')}>Главное меню</button>
    </div>
  );
}
