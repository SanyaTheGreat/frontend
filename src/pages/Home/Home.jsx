import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import lottie from 'lottie-web';
import { ToastContainer, toast } from 'react-toastify'; // импорт
import 'react-toastify/dist/ReactToastify.css'; // стили
import './Home.css';

function Home() {
  const [wheels, setWheels] = useState([]);
  const [colorsMap, setColorsMap] = useState({});
  const [loadingId, setLoadingId] = useState(null);
  const animRefs = useRef({});
  const navigate = useNavigate();

  const handleOpenLobby = (wheelId) => {
    navigate(`/lobby/${wheelId}`);
  };

  const fetchWheels = async () => {
    const { data, error } = await supabase
      .from('wheels')
      .select('*');

    if (error) {
      console.error('Ошибка загрузки колес:', error);
      toast.error('Ошибка загрузки розыгрышей');
      return;
    }

    const activeWheels = data.filter(wheel => wheel.status === 'active');

    const wheelsWithParticipants = await Promise.all(
      activeWheels.map(async (wheel) => {
        const { count, error: countError } = await supabase
          .from('wheel_participants')
          .select('*', { count: 'exact', head: true })
          .eq('wheel_id', wheel.id);

        if (countError) {
          console.error('Ошибка подсчета участников:', countError);
          toast.error('Ошибка подсчёта участников');
          return { ...wheel, participants: 0 };
        }

        return { ...wheel, participants: count };
      })
    );

    setWheels(wheelsWithParticipants);
  };

  useEffect(() => {
    fetchWheels();
  }, []);

  useEffect(() => {
    fetch("/animations/colors.json")
      .then((res) => res.json())
      .then((data) => setColorsMap(data))
      .catch((err) => {
        console.error("Ошибка загрузки цветов:", err);
        toast.error('Ошибка загрузки цветов');
      });
  }, []);

  const handleJoin = async (wheel) => {
    const tg = window.Telegram?.WebApp;
    const user = tg?.initDataUnsafe?.user;

    if (!user) {
      toast.error("Пользователь Telegram не найден");
      return;
    }

    if (wheel.participants >= wheel.size) {
      toast.warn("Колесо уже заполнено");
      return;
    }

    setLoadingId(wheel.id);

    // Получаем user_id
    const { data: foundUser, error } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', user.id)
      .single();

    if (error || !foundUser) {
      toast.error("Пользователь не зарегистрирован");
      setLoadingId(null);
      return;
    }

    // POST на backend
    const res = await fetch('https://lottery-server-waif.onrender.com/wheel/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wheel_id: wheel.id,
        user_id: foundUser.id,
        telegram_id: user.id,
        username: user.username || '',
      }),
    });

    if (res.status === 201) {
      toast.success("Вы успешно присоединились к розыгрышу!");
      await fetchWheels(); // Обновляем участников
    } else {
      const err = await res.json();
      toast.error(err.error || "Ошибка вступления");
    }

    setLoadingId(null);
  };

  return (
    <div className="home-wrapper">
      {wheels.length === 0 ? (
        <p style={{ color: 'white', textAlign: 'center', marginTop: '50px' }}>
          Loading...
        </p>
      ) : (
        wheels.map((wheel) => (
          <div key={wheel.id} className="wheel-card">
            <div className="wheel-title">{wheel.nft_name}</div>

            <div className="wheel-content">
              <div
                className="wheel-image"
                style={{
                  background: colorsMap[wheel.nft_name]
                    ? `linear-gradient(135deg, ${colorsMap[wheel.nft_name].center_color}, ${colorsMap[wheel.nft_name].edge_color})`
                    : '#000',
                  borderRadius: '12px',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <div
                  ref={(el) => {
                    if (el && !animRefs.current[wheel.id]) {
                      animRefs.current[wheel.id] = el;
                      fetch(`/animations/${wheel.nft_name}.json`)
                        .then(res => res.json())
                        .then(data => {
                          lottie.loadAnimation({
                            container: el,
                            renderer: 'svg',
                            loop: true,
                            autoplay: true,
                            animationData: data
                          });
                        });
                    }
                  }}
                  style={{
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
                    top: 0,
                    left: 0,
                  }}
                ></div>
              </div>

              <div className="wheel-buttons">
                <button className="lobby-button" onClick={() => handleOpenLobby(wheel.id)}>
                  Lobby
                </button>
                <button
                  className="join-button"
                  onClick={() => handleJoin(wheel)}
                  disabled={loadingId === wheel.id || wheel.participants >= wheel.size}
                >
                  {loadingId === wheel.id ? 'Joining...' : 'JOIN'}
                </button>
              </div>
            </div>

            <div className="wheel-info">
              <span>Participants: {wheel.participants}/{wheel.size}</span>
              <span>Price: {wheel.price} ticket</span>
            </div>
          </div>
        ))
      )}

      {/* Toast контейнер для уведомлений */}
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

export default Home;
