import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import lottie from 'lottie-web';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './Home.css';

const LUDO_ENABLED = import.meta.env.VITE_LUDO_ENABLED === 'true';
const API_BASE = 'https://lottery-server-waif.onrender.com';

function ModeIconLottie({ url }) {
  const elRef = useRef(null);
  const instRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Sticker JSON not found: ${url}`);
        const animationData = await res.json();
        if (cancelled) return;

        try {
          instRef.current?.destroy?.();
        } catch {}
        instRef.current = null;

        instRef.current = lottie.loadAnimation({
          container: elRef.current,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          animationData,
          rendererSettings: { progressiveLoad: true },
        });

        instRef.current.setSpeed(0.9);
      } catch (e) {
        console.error(e);
      }
    })();

    return () => {
      cancelled = true;
      try {
        instRef.current?.destroy?.();
      } catch {}
      instRef.current = null;
    };
  }, [url]);

  return <div ref={elRef} style={{ width: 44, height: 44 }} />;
}

function Home() {
  const [wheels, setWheels] = useState([]);
  const [colorsMap, setColorsMap] = useState({});
  const [loadingId, setLoadingId] = useState(null);
  const [sortBy, setSortBy] = useState('players_desc');

  const [subscriptionModal, setSubscriptionModal] = useState(null);
  const [showModePicker, setShowModePicker] = useState(LUDO_ENABLED);

  const navigate = useNavigate();

  // =========================
  // 2048 HOME (when LUDO off)
  // =========================
  const [loading2048, setLoading2048] = useState(false);
  const [hasActive2048, setHasActive2048] = useState(false);

  useEffect(() => {
    if (LUDO_ENABLED) return;
    const existingRunId = localStorage.getItem('ffg_2048_run_id');
    setHasActive2048(Boolean(existingRunId));
  }, []);

  const startOrResume2048 = async () => {
    const token = localStorage.getItem('jwt');
    if (!token) {
      toast.error('Требуется авторизация. Открой Mini App в Telegram.');
      return;
    }

    setLoading2048(true);
    try {
      const res = await fetch(`${API_BASE}/game/run/start`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        toast.error(data?.error || 'Не удалось запустить 2048');
        if (res.status === 401 || res.status === 403) localStorage.removeItem('jwt');
        return;
      }

      localStorage.setItem('ffg_2048_run_id', data.run.id);
      localStorage.setItem('ffg_2048_period_id', data.period.id);
      setHasActive2048(true);

      toast.success(data.mode === 'resume' ? 'Продолжаем игру' : 'Новая игра запущена');
      navigate('/2048');
    } catch (e) {
      console.error(e);
      toast.error('Ошибка сети при запуске 2048');
    } finally {
      setLoading2048(false);
    }
  };

  // ✅ MAIN: when LUDO is off, show 2048 home screen with 3 full-width buttons
  if (!LUDO_ENABLED) {
    const btnStyle = {
      width: '100%',
      padding: 16,
      borderRadius: 14,
      fontWeight: 900,
      fontSize: 16,
      cursor: 'pointer',
      position: 'relative',
      zIndex: 10,
    };

    return (
      <>
        <div className="starfield" aria-hidden="true" />

        <div style={{ position: 'relative', zIndex: 5, padding: 16, color: 'white' }}>
          <button
            type="button"
            onClick={startOrResume2048}
            disabled={loading2048}
            style={{
              ...btnStyle,
              border: 'none',
              background: '#ff9800',
              color: '#000',
              cursor: loading2048 ? 'not-allowed' : 'pointer',
              opacity: loading2048 ? 0.85 : 1,
              marginTop: 4,
            }}
          >
            {loading2048 ? 'Запускаем...' : hasActive2048 ? 'Продолжить' : 'Играть'}
          </button>

          <button
            type="button"
            onClick={() => navigate('/2048-rules')}
            style={{
              ...btnStyle,
              marginTop: 12,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(255,255,255,0.06)',
              color: '#fff',
            }}
          >
            Правила
          </button>

          <button
            type="button"
            onClick={() => navigate('/2048-leaderboard')}
            style={{
              ...btnStyle,
              marginTop: 12,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(255,255,255,0.06)',
              color: '#fff',
            }}
          >
            Таблица лидеров
          </button>
        </div>

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
      </>
    );
  }

  // =========================
  // LUDO ON (old logic)
  // =========================
  useEffect(() => {
    const wa = window?.Telegram?.WebApp;
    const p =
      wa?.initDataUnsafe?.start_param ||
      new URLSearchParams(window.location.search).get('tgWebAppStartParam');

    if (p?.startsWith('lobby_')) {
      const wheelId = p.slice('lobby_'.length);
      if (wheelId) navigate(`/lobby/${wheelId}`, { replace: true });
    }
  }, [navigate]);

  const containerRefs = useRef({});
  const animRefs = useRef({});
  const playedOnceRef = useRef({});
  const observerRef = useRef(null);
  const animCacheRef = useRef(new Map());

  const isLowEnd = useMemo(() => {
    const dm = navigator.deviceMemory || 4;
    return dm <= 2;
  }, []);

  const handleOpenLobby = (wheelId) => navigate(`/lobby/${wheelId}`);

  const fetchWheels = async () => {
    if (!LUDO_ENABLED) return;

    const { data, error } = await supabase.from('wheels').select('*').eq('status', 'active');

    if (error) {
      console.error('Ошибка загрузки колес:', error);
      toast.error('Error loading wheels');
      return;
    }
    setWheels(data || []);
  };

  useEffect(() => {
    if (!LUDO_ENABLED) return;
    fetchWheels();
  }, []);

  useEffect(() => {
    if (!LUDO_ENABLED) return;

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

  useEffect(() => {
    if (showModePicker) return;

    lottie.setQuality('low');

    const destroyAll = () => {
      Object.values(animRefs.current).forEach((inst) => {
        try {
          inst?.destroy?.();
        } catch {}
      });
      animRefs.current = {};
    };

    observerRef.current = new IntersectionObserver(
      async (entries) => {
        for (const entry of entries) {
          const el = entry.target;
          const wheelId = el.getAttribute('data-wheelid');
          const nftName = el.getAttribute('data-nftname');
          if (!wheelId || !nftName) continue;

          if (playedOnceRef.current[wheelId]) {
            animRefs.current[wheelId]?.pause?.();
            continue;
          }

          if (!entry.isIntersecting) {
            animRefs.current[wheelId]?.pause?.();
            continue;
          }

          if (!animRefs.current[wheelId]) {
            try {
              const data = await getAnimationJSON(nftName);
              const inst = lottie.loadAnimation({
                container: el,
                renderer: 'canvas',
                loop: false,
                autoplay: false,
                animationData: data,
                rendererSettings: { progressiveLoad: true, clearCanvas: true },
              });
              inst.setSpeed(isLowEnd ? 0.8 : 1);
              inst.addEventListener('complete', () => {
                playedOnceRef.current[wheelId] = true;
                inst.pause();
              });
              animRefs.current[wheelId] = inst;
            } catch (e) {
              console.error('Lottie load error', nftName, e);
              continue;
            }
          }

          if (!playedOnceRef.current[wheelId]) {
            animRefs.current[wheelId].goToAndStop(0, true);
            animRefs.current[wheelId].play();
          }
        }
      },
      { threshold: 0.2, rootMargin: '120px 0px' }
    );

    Object.values(containerRefs.current).forEach((el) => {
      if (el) observerRef.current.observe(el);
    });

    return () => {
      observerRef.current?.disconnect();
      destroyAll();
    };
  }, [wheels, isLowEnd, showModePicker]);

  const sortedWheels = useMemo(() => {
    const arr = [...wheels];
    const price = (w) => w?.price ?? Number.POSITIVE_INFINITY;
    const players = (w) => w?.participants_count ?? 0;
    const size = (w) => w?.size ?? 0;

    switch (sortBy) {
      case 'price_asc':
        arr.sort((a, b) => Number(price(a)) - Number(price(b)));
        break;
      case 'price_desc':
        arr.sort((a, b) => Number(price(b)) - Number(price(a)));
        break;
      case 'players_asc':
        arr.sort((a, b) => players(a) - players(b) || String(a.id).localeCompare(String(b.id)));
        break;
      case 'players_desc':
        arr.sort((a, b) => players(b) - players(a) || String(a.id).localeCompare(String(b.id)));
        break;
      case 'size_asc':
        arr.sort((a, b) => size(a) - size(b) || String(a.id).localeCompare(String(b.id)));
        break;
      case 'size_desc':
        arr.sort((a, b) => size(b) - size(a) || String(a.id).localeCompare(String(b.id)));
        break;
      default:
        arr.sort((a, b) => players(b) - players(a) || String(a.id).localeCompare(String(b.id)));
        break;
    }
    return arr;
  }, [wheels, sortBy]);

  const handleJoin = async (wheel, skipModal = false) => {
    if ((wheel.participants_count ?? 0) >= wheel.size) {
      toast.warn('Колесо уже заполнено');
      return;
    }
    if (wheel.mode === 'subscription' && !skipModal) {
      setSubscriptionModal(wheel);
      return;
    }

    const token = localStorage.getItem('jwt');
    if (!token) {
      toast.error('Требуется авторизация. Открой Mini App в Telegram.');
      return;
    }

    setLoadingId(wheel.id);

    let extra = {};
    if (wheel.mode === 'promo') {
      const code = window.prompt('Введите пароль');
      if (!code) {
        setLoadingId(null);
        return;
      }
      extra.promokey = code.trim();
    }

    const res = await fetch('https://lottery-server-waif.onrender.com/wheel/join', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ wheel_id: wheel.id, ...extra }),
    });

    if (res.status === 201) {
      toast.success('Ты успешно присоединился к розыгрышу!');
      await fetchWheels();
    } else if (res.status === 401 || res.status === 403) {
      toast.error('Сессия истекла. Открой Mini App заново.');
      localStorage.removeItem('jwt');
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || 'Error Join');
    }

    setLoadingId(null);
    setSubscriptionModal(null);
  };

  const openPvpRoulette = () => setShowModePicker(false);
  const openJackpot = () => navigate('/slots');
  const openRoll = () => navigate('/spins');

  const STICKER_PVP = '/stickers/pvp.json';
  const STICKER_JACKPOT = '/stickers/jackpot.json';
  const STICKER_ROLL = '/stickers/roll.json';

  return (
    <>
      <div className="starfield" aria-hidden="true" />

      {showModePicker && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            background: 'rgba(0,0,0,0.25)',
            backdropFilter: 'blur(6px)',
          }}
        >
          <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ color: 'white', textAlign: 'center', fontWeight: 800, fontSize: 16 }}>
              Выбери режим
            </div>

            <button
              type="button"
              onClick={openPvpRoulette}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: 14,
                borderRadius: 18,
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'linear-gradient(180deg, rgba(65,90,119,0.9), rgba(27,38,59,0.9))',
                boxShadow: '0 10px 24px rgba(0,0,0,0.35)',
                color: 'white',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  width: 54,
                  height: 54,
                  flexShrink: 0,
                  borderRadius: 14,
                  background: 'rgba(0,0,0,0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ModeIconLottie url={STICKER_PVP} />
              </div>

              <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 900, fontSize: 14, lineHeight: 1.1 }}>PvP Рулетка</div>
                <div style={{ opacity: 0.85, fontSize: 12, whiteSpace: 'normal', lineHeight: 1.2 }}>
                  Самые Высокие и Равные шансы для Всех! Покупай билет, жди заполнения колеса, забирай подарок!
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={openJackpot}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: 14,
                borderRadius: 18,
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'linear-gradient(180deg, rgba(46,125,50,0.85), rgba(27,38,59,0.9))',
                boxShadow: '0 10px 24px rgba(0,0,0,0.35)',
                color: 'white',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  width: 54,
                  height: 54,
                  flexShrink: 0,
                  borderRadius: 14,
                  background: 'rgba(0,0,0,0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ModeIconLottie url={STICKER_JACKPOT} />
              </div>

              <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 900, fontSize: 14, lineHeight: 1.1 }}>Джекпот</div>
                <div style={{ opacity: 0.85, fontSize: 12, whiteSpace: 'normal', lineHeight: 1.2 }}>
                  Выбирай Подарок Сам! Крути Слоты! Лови 777 и забирай Джекпот!
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={openRoll}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: 14,
                borderRadius: 18,
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'linear-gradient(180deg, rgba(77,166,255,0.85), rgba(27,38,59,0.9))',
                boxShadow: '0 10px 24px rgba(0,0,0,0.35)',
                color: 'white',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  width: 54,
                  height: 54,
                  flexShrink: 0,
                  borderRadius: 14,
                  background: 'rgba(0,0,0,0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ModeIconLottie url={STICKER_ROLL} />
              </div>

              <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 900, fontSize: 14, lineHeight: 1.1 }}>Ролл</div>
                <div style={{ opacity: 0.85, fontSize: 12, whiteSpace: 'normal', lineHeight: 1.2 }}>
                  Классическая рулетка с Подарками! Прокрут Всего за 1⭐️! Бесплатный прокрут Каждый День!
                </div>
              </div>
            </button>
          </div>
        </div>
      )}

      <div className="home-wrapper">
        <div className="sort-bar">
          <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="players_desc">Заполненность: больше</option>
            <option value="players_asc">Заполненность: меньше</option>
            <option value="price_asc">Цена: ниже → выше</option>
            <option value="price_desc">Цена: выше → ниже</option>
            <option value="size_desc">Макс. Игроков: больше → меньше</option>
            <option value="size_asc">Макс. Игроков: меньше → больше</option>
          </select>
        </div>

        {sortedWheels.length === 0 ? (
          <p style={{ color: 'white', textAlign: 'center', marginTop: '50px' }}>Загрузка...</p>
        ) : (
          <div className="wheels-grid">
            {sortedWheels.map((wheel) => {
              const bg = colorsMap[wheel.nft_name]
                ? `linear-gradient(135deg, ${colorsMap[wheel.nft_name].center_color}, ${colorsMap[wheel.nft_name].edge_color})`
                : '#000';

              const modeIcon = wheel.mode === 'subscription' ? '📢' : wheel.mode === 'promo' ? '🔑' : null;

              return (
                <div key={wheel.id} className="wheel-card">
                  <div className="wheel-title">
                    {wheel.nft_name}
                    {modeIcon && <span style={{ marginLeft: 6, fontSize: 14 }}>{modeIcon}</span>}
                  </div>

                  <div
                    className="wheel-image"
                    style={{
                      background: bg,
                      borderRadius: '10px',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
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
                      Лобби
                    </button>
                    <button
                      className="join-button"
                      onClick={() => handleJoin(wheel)}
                      disabled={loadingId === wheel.id || (wheel.participants_count ?? 0) >= wheel.size}
                    >
                      {loadingId === wheel.id ? 'Грузим...' : 'Вход'}
                    </button>
                  </div>

                  <div className="wheel-info">
                    <span>
                      Игроков {wheel.participants_count ?? 0}/{wheel.size}
                    </span>
                    <span>
                      Цена: {Number(wheel.price) === 0 ? 'Free' : wheel.price} <span className="diamond">💎</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {subscriptionModal && (
          <div className="modal-overlay">
            <div className="modal">
              <p>
                Для участия нужно быть подписанным на канал{' '}
                <a
                  href={`https://t.me/${subscriptionModal.channel.replace('@', '')}`}
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
                <button className="join-button" onClick={() => handleJoin(subscriptionModal, true)}>
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
    </>
  );
}

export default Home;