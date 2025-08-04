import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import lottie from 'lottie-web';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './Home.css';

function Home() {
  const [wheels, setWheels] = useState([]);
  const [colorsMap, setColorsMap] = useState({});
  const [loadingId, setLoadingId] = useState(null);

  const navigate = useNavigate();

  // Контейнеры, инстансы и состояние "уже проиграно"
  const containerRefs = useRef({});          // id -> div
  const animRefs = useRef({});               // id -> lottie instance
  const playedOnceRef = useRef({});          // id -> true/false
  const observerRef = useRef(null);

  // Кэш JSON анимаций по nft_name
  const animCacheRef = useRef(new Map());

  // Эвристика слабого устройства (необязательно, но помогает)
  const isLowEnd = useMemo(() => {
    const dm = navigator.deviceMemory || 4;
    return dm <= 2;
  }, []);

  const handleOpenLobby = (wheelId) => navigate(`/lobby/${wheelId}`);

  const fetchWheels = async () => {
    const { data, error } = await supabase.from('wheels').select('*');
    if (error) {
      console.error('Ошибка загрузки колес:', error);
      toast.error('Error loading wheels');
      return;
    }
    const activeWheels = (data || []).filter((w) => w.status === 'active');
    const wheelsWithParticipants = await Promise.all(
      activeWheels.map(async (wheel) => {
        const { count, error: countError } = await supabase
          .from('wheel_participants')
          .select('*', { count: 'exact', head: true })
          .eq('wheel_id', wheel.id);
        if (countError) {
          console.error('Ошибка подсчёта участников:', countError);
          toast.error('Ошибка подсчёта участников');
          return { ...wheel, participants: 0 };
        }
        return { ...wheel, participants: count || 0 };
      })
    );
    setWheels(wheelsWithParticipants);
  };

  useEffect(() => { fetchWheels(); }, []);

  useEffect(() => {
    fetch('/animations/colors.json')
      .then((res) => res.json())
      .then((data) => setColorsMap(data))
      .catch((err) => {
        console.error('Ошибка загрузки цветов:', err);
        toast.error('Ошибка загрузки цветов');
      });
  }, []);

  async function getAnimationJSON(nftName) {
    if (animCacheRef.current.has(nftName)) return animCacheRef.current.get(nftName);
    const res = await fetch(`/animations/${nftName}.json`);
    if (!res.ok) throw new Error(`Animation not found: ${nftName}`);
    const json = await res.json();
    animCacheRef.current.set(nftName, json);
    return json;
  }

  // Ленивая инициализация, проигрывание 1 раз и pause вне экрана
  useEffect(() => {
    lottie.setQuality('low');

    const destroyAll = () => {
      Object.values(animRefs.current).forEach((inst) => {
        try { inst?.destroy?.(); } catch {}
      });
      animRefs.current = {};
    };

    observerRef.current = new IntersectionObserver(async (entries) => {
      for (const entry of entries) {
        const el = entry.target;
        const wheelId = el.getAttribute('data-wheelid');
        const nftName = el.getAttribute('data-nftname');
        if (!wheelId || !nftName) continue;

        // Уже проигрывали — гарантируем паузу и больше ничего не делаем
        if (playedOnceRef.current[wheelId]) {
          animRefs.current[wheelId]?.pause?.();
          continue;
        }

        // Вне экрана — пауза (если инстанс уже создан)
        if (!entry.isIntersecting) {
          animRefs.current[wheelId]?.pause?.();
          continue;
        }

        // В экране и ещё не проигрывали
        if (!animRefs.current[wheelId]) {
          try {
            const data = await getAnimationJSON(nftName);
            const inst = lottie.loadAnimation({
              container: el,
              renderer: 'canvas', // быстрее svg на мобильных
              loop: false,        // один раз
              autoplay: false,    // запустим вручную
              animationData: data,
              rendererSettings: { progressiveLoad: true, clearCanvas: true }
            });
            inst.setSpeed(isLowEnd ? 0.8 : 1);

            // По завершении помечаем и оставляем на последнем кадре (или вернёмся на первый — см. ниже)
            inst.addEventListener('complete', () => {
              playedOnceRef.current[wheelId] = true;
              inst.pause(); // остаётся на последнем кадре
              // Если нужно возвращать на первый кадр:
              // inst.goToAndStop(0, true);
            });

            animRefs.current[wheelId] = inst;
          } catch (e) {
            console.error('Lottie load error', nftName, e);
            continue;
          }
        }

        // Стартуем только если ещё не проигрывали
        if (!playedOnceRef.current[wheelId]) {
          animRefs.current[wheelId].goToAndStop(0, true); // на всякий случай
          animRefs.current[wheelId].play();
        }
      }
    }, { threshold: 0.2, rootMargin: '120px 0px' });

    // Подписываем контейнеры, если уже есть
    Object.values(containerRefs.current).forEach((el) => {
      if (el) observerRef.current.observe(el);
    });

    return () => {
      observerRef.current?.disconnect();
      destroyAll();
    };
  }, [wheels, isLowEnd]);

  const handleJoin = async (wheel) => {
    const tg = window.Telegram?.WebApp;
    const user = tg?.initDataUnsafe?.user;

    if (!user) {
      toast.error('Telegram user not found');
      return;
    }
    if (wheel.participants >= wheel.size) {
      toast.warn('The wheel is already full');
      return;
    }

    setLoadingId(wheel.id);

    const { data: foundUser, error } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', user.id)
      .single();

    if (error || !foundUser) {
      toast.error('Пользователь не зарегистрирован');
      setLoadingId(null);
      return;
    }

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
      toast.success('You have successfully joined!');
      await fetchWheels();
    } else {
      const err = await res.json();
      toast.error(err.error || 'Error Join');
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
        <div className="wheels-grid">
          {wheels.map((wheel) => {
            const bg = colorsMap[wheel.nft_name]
              ? `linear-gradient(135deg, ${colorsMap[wheel.nft_name].center_color}, ${colorsMap[wheel.nft_name].edge_color})`
              : '#000';

            return (
              <div key={wheel.id} className="wheel-card">
                <div className="wheel-title">{wheel.nft_name}</div>

                <div
                  className="wheel-image"
                  style={{
                    background: bg,
                    borderRadius: '10px',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {/* Контейнер под Lottie. Инициализируется и играет 1 раз в зоне видимости */}
                  <div
                    ref={(el) => {
                      if (!el) return;
                      containerRefs.current[wheel.id] = el;
                      el.setAttribute('data-wheelid', String(wheel.id));
                      el.setAttribute('data-nftname', wheel.nft_name);
                      if (observerRef.current) observerRef.current.observe(el);
                    }}
                    style={{
                      position: 'absolute',
                      width: '100%',
                      height: '100%',
                      top: 0,
                      left: 0,
                    }}
                  />
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

                <div className="wheel-info">
                  <span>Players: {wheel.participants}/{wheel.size}</span>
                  <span>
                    Price: {wheel.price} <span className="diamond">💎</span>
                  </span>
                </div>
              </div>
            );
          })}
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

export default Home;
