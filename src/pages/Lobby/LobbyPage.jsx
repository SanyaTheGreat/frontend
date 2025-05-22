import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import './LobbyPage.css';

function LobbyPage() {
  const { id } = useParams(); // wheel_id из URL
  const [wheel, setWheel] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchLobbyData();
  }, [id]);

  async function fetchLobbyData() {
    // Получаем данные о колесе
    const { data: wheelData } = await supabase
      .from('wheels')
      .select('id, nft_name, size, price, status')
      .eq('id', id)
      .single();
    setWheel(wheelData);

    // Участники
    const { data: participantData } = await supabase
      .from('wheel_participants')
      .select('username')
      .eq('wheel_id', id);
    setParticipants(participantData || []);

    // Счётчик
    const { count } = await supabase
      .from('wheel_participants')
      .select('*', { count: 'exact', head: true })
      .eq('wheel_id', id);
    setParticipantCount(count || 0);
  }

  async function handleJoin() {
    const tg = window.Telegram?.WebApp;
    const user = tg?.initDataUnsafe?.user;

    if (!user) {
      alert("Telegram user not found");
      return;
    }

    setLoading(true);

    // Получаем user_id из Supabase по telegram_id
    const { data: foundUser, error } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', user.id)
      .single();

    if (error || !foundUser) {
      alert("User not registered");
      setLoading(false);
      return;
    }

    // POST на backend
    const res = await fetch('https://lottery-server-waif.onrender.com/wheel/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wheel_id: id,
        user_id: foundUser.id,
        telegram_id: user.id,
        username: user.username || '',
      }),
    });

    if (res.status === 201) {
      await fetchLobbyData(); // обновляем участников
    } else {
      const err = await res.json();
      alert(err.error || "Ошибка вступления");
    }

    setLoading(false);
  }

  if (!wheel) return <div>Loading...</div>;

  return (
    <div className="lobby-page">
      <h2>{wheel.nft_name}</h2>
      <p>Participants: {participantCount} / {wheel.size}</p>
      <p>Price: {wheel.price} 🎫</p>

      <button
        className="join-buttonLobby"
        onClick={handleJoin}
        disabled={loading || participantCount >= wheel.size}
      >
        {loading ? 'Joining...' : 'Join'}
      </button>

      <ul className="participant-list">
        {participants.map((p, index) => (
          <li key={index}>@{p.username}</li>
        ))}
      </ul>
    </div>
  );
}

export default LobbyPage;
