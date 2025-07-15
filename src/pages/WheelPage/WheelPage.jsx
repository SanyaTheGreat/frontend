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
  const [status, setStatus] = useState('active'); // по умолчанию active

  const fetchData = async () => {
    console.log('🚀 fetchData start');
    try {
      setLoading(true);

      // Получаем участников по wheel_id
      const partRes = await fetch(`${API_BASE_URL}/${wheel_id}/participants`);
      if (!partRes.ok) throw new Error(`Ошибка запроса участников: ${partRes.status}`);
      const partData = await partRes.json();
      console.log(`✅ Найдено участников: ${partData.participants?.length || 0}`);

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
        .map(p => {
          console.log(`👤 Участник: ${p.username || `user${p.user_id}`}`);
          return { username: p.username || `user${p.user_id}` };
        });

      setParticipants(uniqueParticipants);

      // Получаем данные о колесе, чтобы знать wheelSize
      const wheelRes = await fetch(`${API_BASE_URL}/${wheel_id}`);
      if (!wheelRes.ok) throw new Error(`Ошибка запроса колеса: ${wheelRes.status}`);
      const wheelData = await wheelRes.json();
      console.log(`🎡 Колесо найдено. Размер: ${wheelData.size}`);
      setWheelSize(wheelData.size || 0);

      // Получаем результат розыгрыша (победителя) по wheel_id
      const resultRes = await fetch(`${API_BASE_URL}/results`);
      if (!resultRes.ok) throw new Error(`Ошибка запроса результатов: ${resultRes.status}`);
      const resultData = await resultRes.json();

      console.log('🎲 Все wheel_id в результатах:', resultData.results.map(r => r.wheel_id));
      console.log('🔍 Текущий wheel_id:', wheel_id);

      const thisResult = resultData.results.find(r => String(r.wheel_id) === String(wheel_id));
      if (thisResult) {
        const winnerNormalized = thisResult.winner.replace(/^@/, ''); // убираем @ если есть
        console.log(`🏆 Победитель: ${winnerNormalized} (завершено: ${thisResult.completed_at})`);
        setWinner(winnerNormalized || null);
        setCompletedAt(thisResult.completed_at || null);
        setStatus('completed');
      } else {
        console.log('⚙️ Колесо ещё активно, победитель не определён');
        setWinner(null);
        setCompletedAt(null);
        setStatus('active');
      }
    } catch (e) {
      console.error('❌ Ошибка загрузки данных колеса:', e);
      alert(`Ошибка загрузки данных колеса: ${e.message || e}`);
    } finally {
      setLoading(false);
      console.log('🚀 fetchData end');
    }
  };

  useEffect(() => {
    fetchData();

    const intervalId = setInterval(() => {
      fetchData();
    }, 5000); // обновляем каждые 5 секунд

    return () => clearInterval(intervalId);
  }, [wheel_id]);

  // Таймер запуска анимации через 60 секунд после completedAt
  useEffect(() => {
    if (!completedAt || !winner) return;

    const now = Date.now();
    const completedTime = new Date(completedAt).getTime();
    const elapsed = now - completedTime;
    const delay = 60000 - elapsed; // 60 секунд

    console.log(`⏳ Ожидание запуска анимации, задержка: ${delay} мс`);

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
    alert(`🎉 Победитель: ${winner}`);
  };

  if (loading) return <div>Загрузка...</div>;

  return (
    <div className="wheel-page-wrapper">
      <h2>Колесо №{wheel_id}</h2>
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
