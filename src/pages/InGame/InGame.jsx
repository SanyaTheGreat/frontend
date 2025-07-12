import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import lottie from 'lottie-web';
import './InGame.css';

function WheelCard({ wheel, grayscale }) {
  const animRef = useRef(null);

  useEffect(() => {
    if (!animRef.current) return;
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
      });
  }, [wheel.nft_name]);

  return (
    <div className={`wheel-card ${grayscale ? 'grayscale' : ''}`}>
      <div className="wheel-title">{wheel.nft_name}</div>
      <div className="wheel-content">
        <div
          className="wheel-image"
          ref={animRef}
          style={{ borderRadius: '12px', overflow: 'hidden' }}
        ></div>
        <button className="go-button">Go</button>
      </div>
      <div className="wheel-info">
        <span>Status: {wheel.status}</span>
        <span>Price: {wheel.price} 🎫</span>
      </div>
    </div>
  );
}

function InGame() {
  const [wheels, setWheels] = useState([]);
  const navigate = useNavigate();

  const fetchUserWheels = async () => {
    const tg = window.Telegram?.WebApp;
    const user = tg?.initDataUnsafe?.user;
    if (!user) {
      alert('Telegram user not found');
      return;
    }

    const { data: foundUser, error } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', user.id)
      .single();

    if (error || !foundUser) {
      alert('User not registered');
      return;
    }

    const { data: userWheels, error: wheelsError } = await supabase
      .from('wheel_participants')
      .select('wheel_id')
      .eq('user_id', foundUser.id);

    if (wheelsError) {
      alert('Ошибка загрузки розыгрышей');
      return;
    }

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

  const activeWheels = wheels.filter(w => w.status === 'active');
  const completedWheels = wheels.filter(w => w.status === 'completed');

  const handleGo = (wheelId) => {
    navigate(`/wheel/${wheelId}`);
  };

  return (
    <div className="inGame-wrapper">
      {activeWheels.map(wheel => (
        <WheelCard
          key={wheel.id}
          wheel={wheel}
          grayscale={false}
          onGo={() => handleGo(wheel.id)}
        />
      ))}

      {completedWheels.length > 0 && (
        <div className="separator">Завершённые розыгрыши</div>
      )}

      {completedWheels.map(wheel => (
        <WheelCard
          key={wheel.id}
          wheel={wheel}
          grayscale={true}
          onGo={() => handleGo(wheel.id)}
        />
      ))}

      {wheels.length === 0 && (
        <p className="no-wheels">Ты сейчас ни в одном розыгрыше не участвуешь</p>
      )}
    </div>
  );
}

export default InGame;
