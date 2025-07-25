import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { ToastContainer, toast } from 'react-toastify'; // импорт
import 'react-toastify/dist/ReactToastify.css'; // стили
import './LobbyPage.css';

function LobbyPage() {
  const { id } = useParams(); // wheel_id из URL
  const navigate = useNavigate(); // для перехода на другие страницы

  const [wheel, setWheel] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchLobbyData();
  }, [id]);

  async function fetchLobbyData() {
    try {
      // Получаем данные о колесе
      const { data: wheelData, error: wheelError } = await supabase
        .from('wheels')
        .select('id, nft_name, size, price, status')
        .eq('id', id)
        .single();

      if (wheelError) {
        toast.error('Ошибка загрузки данных колеса');
        return;
      }
      setWheel(wheelData);

      // Участники
      const { data: participantData, error: participantsError } = await supabase
        .from('wheel_participants')
        .select('username')
        .eq('wheel_id', id);

      if (participantsError) {
        toast.error('Ошибка загрузки участников');
        return;
      }
      setParticipants(participantData || []);

      // Счётчик участников
      const { count, error: countError } = await supabase
        .from('wheel_participants')
        .select('*', { count: 'exact', head: true })
        .eq('wheel_id', id);

      if (countError) {
        toast.error('Ошибка подсчёта участников');
        return;
      }
      setParticipantCount(count || 0);
    } catch (e) {
      toast.error('Ошибка загрузки данных');
      console.error(e);
    }
  }

  async function handleJoin() {
    const tg = window.Telegram?.WebApp;
    const user = tg?.initDataUnsafe?.user;

    if (!user) {
      toast.error("Telegram пользователь не найден");
      return;
    }

    if (participantCount >= (wheel?.size || 0)) {
      toast.warn("Колесо уже заполнено");
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
      toast.error("Пользователь не зарегистрирован");
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
      toast.success("Вы успешно присоединились к розыгрышу!");
      await fetchLobbyData(); // обновляем участников
    } else {
      const err = await res.json();
      toast.error(err.error || "Ошибка вступления");
    }

    setLoading(false);
  }

  const handleWatch = () => {
    navigate(`/wheel/${id}`);
  };

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

      <button
        className="join-buttonLobby"
        onClick={handleWatch}
        style={{ marginTop: '10px', backgroundColor: '#6c757d' }}
      >
        Watch
      </button>

      <div className="already-joined-text">
        Already in The Game <span style={{fontSize: '18px'}}>✅</span>
      </div>

      <ul className="participant-list">
        {participants.map((p, index) => (
          <li key={index}>@{p.username}</li>
        ))}
      </ul>

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
    </div>
  );
}

export default LobbyPage;
