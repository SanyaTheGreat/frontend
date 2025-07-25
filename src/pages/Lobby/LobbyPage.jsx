import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { ToastContainer, toast } from 'react-toastify';
import lottie from 'lottie-web';
import 'react-toastify/dist/ReactToastify.css';
import './LobbyPage.css';

function LobbyPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [wheel, setWheel] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [colorsMap, setColorsMap] = useState({}); // Для цветов фона
  const animRef = useRef(null);

  useEffect(() => {
    fetchLobbyData();
  }, [id]);

  useEffect(() => {
    fetch("/animations/colors.json")
      .then(res => res.json())
      .then(setColorsMap)
      .catch(e => console.error("Ошибка загрузки цветов:", e));
  }, []);

  useEffect(() => {
    if (!wheel?.nft_name || !animRef.current) return;

    // Загружаем Lottie-анимацию
    fetch(`/animations/${wheel.nft_name}.json`)
      .then(res => res.json())
      .then(data => {
        lottie.loadAnimation({
          container: animRef.current,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          animationData: data,
        });
      })
      .catch((e) => {
        console.error("Ошибка загрузки анимации Lottie:", e);
      });
  }, [wheel]);

  async function fetchLobbyData() {
    try {
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

      const { data: participantData, error: participantsError } = await supabase
        .from('wheel_participants')
        .select('username')
        .eq('wheel_id', id);

      if (participantsError) {
        toast.error('Ошибка загрузки участников');
        return;
      }
      setParticipants(participantData || []);

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
      await fetchLobbyData();
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

      {/* Lottie анимация с фоном */}
      <div
        ref={animRef}
        style={{
          width: '120px',
          height: '120px',
          margin: '0 auto 20px',
          borderRadius: '12px',
          overflow: 'hidden',
          background: colorsMap[wheel.nft_name]
            ? `linear-gradient(135deg, ${colorsMap[wheel.nft_name].center_color}, ${colorsMap[wheel.nft_name].edge_color})`
            : '#000',
        }}
      ></div>

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
        className="watch-buttonLobby"
        onClick={handleWatch}
        style={{ marginTop: '10px' }}
      >
        Watch
      </button>

      <div className="already-joined-text">
        Already in The Game <span style={{ fontSize: '18px' }}>✅</span>
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
