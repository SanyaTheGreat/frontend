import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import lottie from 'lottie-web';
import './InGame.css';

function InGame() {
  const [wheels, setWheels] = useState([]);
  const animRefs = useRef({});
  const navigate = useNavigate();

  // Загружаем колёса, где участвует текущий пользователь
  const fetchUserWheels = async () => {
    const tg = window.Telegram?.WebApp;
    const user = tg?.initDataUnsafe?.user;
    if (!user) {
      alert('Telegram user not found');
      return;
    }

    // Получаем user_id из Supabase
    const { data: foundUser, error } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', user.id)
      .single();

    if (error || !foundUser) {
      alert('User not registered');
      return;
    }

    // Получаем колёса, где пользователь участник
    const { data: userWheels, error: wheelsError } = await supabase
      .from('wheel_participants')
      .select('wheel_id')
      .eq('user_id', foundUser.id);

    if (wheelsError) {
      alert('Ошибка загрузки розыгрышей');
      return;
    }

    // Получаем детали колёс
    const wheelIds = userWheels.map(w => w.wheel_id);
    if (wheelIds.length === 0) {
      setWheels([]);
      return;
    }

    const { data: wheelsData, error: wheelsDataError } = await supabase
      .from('wheels')
      .select('*')
      .in('id', wheelIds);

    if (wheelsDataError) {
      alert('Ошибка загрузки данных колёс');
      return;
    }

    setWheels(wheelsData);
  };

  useEffect(() => {
    fetchUserWheels();
  }, []);

  useEffect(() => {
    wheels.forEach((wheel) => {
      if (!animRefs.current[wheel.id]) return;
      fetch(`/animations/${wheel.nft_name}.json`)
        .then(res => res.json())
        .then(data => {
          lottie.loadAnimation({
            container: animRefs.current[wheel.id],
            renderer: 'svg',
            loop: true,
            autoplay: true,
            animationData: data,
          });
        })
        .catch(() => { /* handle error silently */ });
    });
  }, [wheels]);

  const handleGo = (wheelId) => {
    navigate(`/wheel/${wheelId}`); // Переход на страницу розыгрыша
  };

  if (wheels.length === 0) {
    return <p className="no-wheels">Ты сейчас ни в одном розыгрыше не участвуешь</p>;
  }

  return (
    <div className="inGame-wrapper">
      {wheels.map((wheel) => (
        <div key={wheel.id} className="wheel-card">
          <div className="wheel-title">{wheel.nft_name}</div>

          <div className="wheel-content">
            <div
              className="wheel-image"
              ref={el => (animRefs.current[wheel.id] = el)}
              style={{ borderRadius: '12px', overflow: 'hidden' }}
            ></div>

            <button className="go-button" onClick={() => handleGo(wheel.id)}>
              Go
            </button>
          </div>

          <div className="wheel-info">
            <span>Status: {wheel.status}</span>
            <span>Price: {wheel.price} 🎫</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default InGame;
