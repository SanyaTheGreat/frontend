import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import lottie from 'lottie-web';
import './InGame.css';

function WheelCard({ wheel, grayscale, colorsMap, onGo }) {
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
      })
      .catch(() => {
        // noop
      });
  }, [wheel.nft_name]);

  const backgroundStyle = colorsMap[wheel.nft_name]
    ? `linear-gradient(135deg, ${colorsMap[wheel.nft_name].center_color}, ${colorsMap[wheel.nft_name].edge_color})`
    : '#000';

  return (
    <div className={`wheel-card ${grayscale ? 'grayscale' : ''}`}>
      <div className="wheel-title">{wheel.nft_name}</div>
      <div className="wheel-content">
        <div
          className="wheel-image"
          ref={animRef}
          style={{
            borderRadius: '12px',
            overflow: 'hidden',
            background: backgroundStyle,
          }}
        />
        <button className="go-button" onClick={onGo}>
          Go!
        </button>
      </div>
      <div className="wheel-info">
        <span>Статус: {wheel.status}</span>
        <span>Цена: {wheel.price} 💎</span>
      </div>
    </div>
  );
}

function InGame() {
  const [wheels, setWheels] = useState([]);
  const [colorsMap, setColorsMap] = useState({});
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

  useEffect(() => {
    fetch('/animations/colors.json')
      .then(res => res.json())
      .then(setColorsMap)
      .catch(() => {});
  }, []);

  const activeWheels = wheels.filter(w => w.status === 'active');
  const completedWheels = wheels.filter(w => w.status === 'completed');

  const handleGo = (wheelId) => {
    navigate(`/wheel/${wheelId}`);
  };

  return (
    <>
      {/* звёздный фон */}
      <div className="starfield" aria-hidden="true" />

      <div className="inGame-wrapper">
        {activeWheels.map(wheel => (
          <WheelCard
            key={wheel.id}
            wheel={wheel}
            grayscale={false}
            colorsMap={colorsMap}
            onGo={() => handleGo(wheel.id)}
          />
        ))}

        {completedWheels.length > 0 && (
          <div className="separator">Завершенные игры</div>
        )}

        {completedWheels.map(wheel => (
          <WheelCard
            key={wheel.id}
            wheel={wheel}
            grayscale={true}
            colorsMap={colorsMap}
            onGo={() => handleGo(wheel.id)}
          />
        ))}

        {wheels.length === 0 && (
          <p className="no-wheels">Все твои игры будут отображаться на этой странице.</p>
        )}
      </div>
    </>
  );
}

export default InGame;
