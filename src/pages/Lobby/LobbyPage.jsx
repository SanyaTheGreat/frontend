import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { ToastContainer, toast } from 'react-toastify';
import lottie from 'lottie-web';
import 'react-toastify/dist/ReactToastify.css';
import './LobbyPage.css';

// ← укажи ник своего бота (без @)
const BOT = 'your_bot_username';

function LobbyPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [wheel, setWheel] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [colorsMap, setColorsMap] = useState({});
  const [subscriptionModal, setSubscriptionModal] = useState(null); // хранит wheel для модалки
  const animRef = useRef(null);

  useEffect(() => {
    fetchLobbyData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    fetch('/animations/colors.json')
      .then((res) => res.json())
      .then(setColorsMap)
      .catch((e) => console.error('Ошибка загрузки цветов:', e));
  }, []);

  useEffect(() => {
    if (!wheel?.nft_name || !animRef.current) return;

    fetch(`/animations/${wheel.nft_name}.json`)
      .then((res) => res.json())
      .then((data) => {
        lottie.loadAnimation({
          container: animRef.current,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          animationData: data,
        });
      })
      .catch((e) => {
        console.error('Ошибка загрузки анимации Lottie:', e);
      });
  }, [wheel]);

  async function fetchLobbyData() {
    try {
      // забираем и новые поля: mode, channel
      const { data: wheelData, error: wheelError } = await supabase
        .from('wheels')
        .select('id, nft_name, size, price, status, mode, channel') // добавили mode/channel
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

  const handleJoin = async (skipModal = false) => {
    if (!wheel) return;

    const tg = window.Telegram?.WebApp;
    const user = tg?.initDataUnsafe?.user;

    if (!user) {
      toast.error('Telegram user not found');
      return;
    }

    if (participantCount >= (wheel?.size || 0)) {
      toast.warn('The wheel is already full');
      return;
    }

    // если subscription и модалка ещё не показана — показываем её
    if (wheel.mode === 'subscription' && !skipModal) {
      setSubscriptionModal(wheel);
      return;
    }

    setLoading(true);

    const { data: foundUser, error } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', user.id)
      .single();

    if (error || !foundUser) {
      toast.error('Пользователь не зарегистрирован');
      setLoading(false);
      return;
    }

    // промокод — через prompt
    const body = {
      wheel_id: id,
      user_id: foundUser.id,
      telegram_id: user.id,
      username: user.username || '',
    };

    if (wheel.mode === 'promo') {
      const code = window.prompt('Введите промокод');
      if (!code) {
        setLoading(false);
        return;
      }
      body.promokey = code.trim();
    }

    const res = await fetch('https://lottery-server-waif.onrender.com/wheel/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.status === 201) {
      toast.success('You have successfully joined!');
      await fetchLobbyData();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || 'Error Join ');
    }

    setLoading(false);
    setSubscriptionModal(null);
  };

  const handleWatch = () => {
    navigate(`/wheel/${id}`);
  };

  // deep link для шаринга
  const shareDeepLink = `https://t.me/${BOT}?startapp=lobby_${id}`;

  // открыть родной «поделиться в Telegram» со списком чатов/пользователей
  const openTelegramShare = () => {
    const wa = window?.Telegram?.WebApp;
    const url = `https://t.me/share/url?url=${encodeURIComponent(shareDeepLink)}&text=${encodeURIComponent('Залетай в мой розыгрыш!')}`;
    if (wa?.openTelegramLink) {
      wa.openTelegramLink(url);
    } else {
      window.open(url, '_blank');
    }
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

      <p>Участников: {participantCount} / {wheel.size}</p>
      <p>Цена: {Number(wheel.price) === 0 ? 'Free' : wheel.price} 🎫</p>

      <button
        className="join-buttonLobby"
        onClick={() => handleJoin()}
        disabled={loading || participantCount >= wheel.size}
      >
        {loading ? 'Joining...' : 'Join'}
      </button>

      {/* Две кнопки в один ряд: Смотреть + Поделиться */}
      <div
        className="action-row"
        style={{ display: 'flex', gap: 10, width: '100%', margin: '10px 0 20px 0' }}
      >
        <button
          className="watch-buttonLobby"
          onClick={handleWatch}
          style={{ flex: 1, width: 'auto', margin: 0 }}
        >
          Смотреть
        </button>

        <button
          className="lobby-button"
          onClick={openTelegramShare}
          style={{ flex: 1, width: 'auto', margin: 0 }}
        >
          Поделиться
        </button>
      </div>

      <div className="already-joined-text">
        Уже Вступили <span style={{ fontSize: '18px' }}>✅</span>
      </div>

      <ul className="participant-list">
        {participants.map((p, index) => (
          <li key={index}>@{p.username}</li>
        ))}
      </ul>

      {/* Модалка подписки */}
      {subscriptionModal && (
        <div className="modal-overlay">
          <div className="modal">
            <p>
              Для участия нужно быть подписанным на канал{' '}
              <a
                href={`https://t.me/${subscriptionModal.channel?.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#4da6ff', fontWeight: 'bold' }}
              >
                {subscriptionModal.channel}
              </a>
            </p>
            <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="lobby-button" onClick={() => setSubscriptionModal(null)}>
                Отмена
              </button>
              <button className="join-button" onClick={() => handleJoin(true)}>
                Я подписан
              </button>
            </div>
          </div>
        </div>
      )}

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
