import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import lottie from 'lottie-web';
import pako from 'pako';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './Home.css';
import { API_BASE } from '../../apiBase';

// Phase 2: единый хаб — 2048 и Ludo-режимы доступны вместе.

// Lottie из .json (стикеры режимов)
function LottieJson({ url, size = 52 }) {
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
        try { instRef.current?.destroy?.(); } catch { /* Optional browser or animation cleanup. */ }
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
      try { instRef.current?.destroy?.(); } catch { /* Optional browser or animation cleanup. */ }
      instRef.current = null;
    };
  }, [url]);

  return <div ref={elRef} style={{ width: size, height: size }} />;
}

// Lottie из .tgs (gzip JSON) — стикер 2048
function LottieTgs({ url, size = 64 }) {
  const elRef = useRef(null);
  const instRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`TGS not found: ${url}`);
        const buf = await res.arrayBuffer();
        const ungzipped = pako.ungzip(new Uint8Array(buf), { to: 'string' });
        const animationData = JSON.parse(ungzipped);
        if (cancelled) return;
        try { instRef.current?.destroy?.(); } catch { /* Optional browser or animation cleanup. */ }
        instRef.current = lottie.loadAnimation({
          container: elRef.current,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          animationData,
          rendererSettings: { progressiveLoad: true },
        });
      } catch (e) {
        console.error('[LottieTgs] load error:', e);
      }
    })();
    return () => {
      cancelled = true;
      try { instRef.current?.destroy?.(); } catch { /* Optional browser or animation cleanup. */ }
      instRef.current = null;
    };
  }, [url]);

  return <div ref={elRef} style={{ width: size, height: size, pointerEvents: 'none' }} />;
}

function Home() {
  const navigate = useNavigate();

  // 'hub' — меню режимов, 'wheels' — список PvP-колёс
  const [view, setView] = useState('hub');

  // ---- 2048 ----
  const [loading2048, setLoading2048] = useState(false);
  const [hasActive2048, setHasActive2048] = useState(false);

  // ---- Колёса (PvP) ----
  const [wheels, setWheels] = useState([]);
  const [colorsMap, setColorsMap] = useState({});
  const [loadingId, setLoadingId] = useState(null);
  const [sortBy, setSortBy] = useState('players_desc');
  const [subscriptionModal, setSubscriptionModal] = useState(null);

  const containerRefs = useRef({});
  const animRefs = useRef({});
  const playedOnceRef = useRef({});
  const observerRef = useRef(null);
  const animCacheRef = useRef(new Map());

  const isLowEnd = useMemo(() => (navigator.deviceMemory || 4) <= 2, []);

  // deep-link: /?...start_param=lobby_<id> → сразу в лобби
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

  useEffect(() => {
    setHasActive2048(Boolean(localStorage.getItem('ffg_2048_run_id')));
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
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
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
      navigate('/2048');
    } catch (e) {
      console.error(e);
      toast.error('Ошибка сети при запуске 2048');
    } finally {
      setLoading2048(false);
    }
  };

  // ---- загрузка колёс ----
  const fetchWheels = async () => {
    const { data, error } = await supabase.from('wheels').select('*').eq('status', 'active');
    if (error) {
      console.error('Ошибка загрузки колес:', error);
      toast.error('Error loading wheels');
      return;
    }
    setWheels(data || []);
  };

  useEffect(() => { fetchWheels(); }, []);

  useEffect(() => {
    fetch('/animations/colors.json')
      .then((res) => res.json())
      .then((data) => setColorsMap(data))
      .catch((err) => console.error('Ошибка загрузки цветов:', err));
  }, []);

  async function getAnimationJSON(nftName) {
    if (animCacheRef.current.has(nftName)) return animCacheRef.current.get(nftName);
    const res = await fetch(`/animations/${nftName}.json`);
    if (!res.ok) throw new Error(`Animation not found: ${nftName}`);
    const json = await res.json();
    animCacheRef.current.set(nftName, json);
    return json;
  }

  // Lottie-превью колёс — только в режиме списка колёс
  useEffect(() => {
    if (view !== 'wheels') return;

    lottie.setQuality('low');

    const destroyAll = () => {
      Object.values(animRefs.current).forEach((inst) => { try { inst?.destroy?.(); } catch { /* Optional browser or animation cleanup. */ } });
      animRefs.current = {};
    };

    observerRef.current = new IntersectionObserver(
      async (entries) => {
        for (const entry of entries) {
          const el = entry.target;
          const wheelId = el.getAttribute('data-wheelid');
          const nftName = el.getAttribute('data-nftname');
          if (!wheelId || !nftName) continue;

          if (playedOnceRef.current[wheelId]) { animRefs.current[wheelId]?.pause?.(); continue; }
          if (!entry.isIntersecting) { animRefs.current[wheelId]?.pause?.(); continue; }

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
              inst.addEventListener('complete', () => { playedOnceRef.current[wheelId] = true; inst.pause(); });
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

    Object.values(containerRefs.current).forEach((el) => { if (el) observerRef.current.observe(el); });

    return () => { observerRef.current?.disconnect(); destroyAll(); };
  }, [wheels, isLowEnd, view]);

  const sortedWheels = useMemo(() => {
    const arr = [...wheels];
    const price = (w) => w?.price ?? Number.POSITIVE_INFINITY;
    const players = (w) => w?.participants_count ?? 0;
    const size = (w) => w?.size ?? 0;
    switch (sortBy) {
      case 'price_asc': arr.sort((a, b) => Number(price(a)) - Number(price(b))); break;
      case 'price_desc': arr.sort((a, b) => Number(price(b)) - Number(price(a))); break;
      case 'players_asc': arr.sort((a, b) => players(a) - players(b) || String(a.id).localeCompare(String(b.id))); break;
      case 'players_desc': arr.sort((a, b) => players(b) - players(a) || String(a.id).localeCompare(String(b.id))); break;
      case 'size_asc': arr.sort((a, b) => size(a) - size(b) || String(a.id).localeCompare(String(b.id))); break;
      case 'size_desc': arr.sort((a, b) => size(b) - size(a) || String(a.id).localeCompare(String(b.id))); break;
      default: arr.sort((a, b) => players(b) - players(a) || String(a.id).localeCompare(String(b.id))); break;
    }
    return arr;
  }, [wheels, sortBy]);

  const handleOpenLobby = (wheelId) => navigate(`/lobby/${wheelId}`);

  const handleJoin = async (wheel, skipModal = false) => {
    if ((wheel.participants_count ?? 0) >= wheel.size) { toast.warn('Колесо уже заполнено'); return; }
    if (wheel.mode === 'subscription' && !skipModal) { setSubscriptionModal(wheel); return; }

    const token = localStorage.getItem('jwt');
    if (!token) { toast.error('Требуется авторизация. Открой Mini App в Telegram.'); return; }

    setLoadingId(wheel.id);

    let extra = {};
    if (wheel.mode === 'promo') {
      const code = window.prompt('Введите пароль');
      if (!code) { setLoadingId(null); return; }
      extra.promokey = code.trim();
    }

    const res = await fetch(`${API_BASE}/wheel/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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

  // конфигурация карточек режимов
  const wheelsCount = wheels.length;

  return (
    <>
      <div className="starfield" aria-hidden="true" />

      <div className="home-wrapper">
        {view === 'hub' && (
          <>
            <header className="hub-head">
              <div className="hub-wordmark">
                FIGHT <span className="hub-wordmark-accent">FOR</span> GIFT
              </div>
              <div className="hub-tagline">Выбирай режим — играй и забирай подарки</div>
            </header>

            <div className="mode-select">
              {/* 2048 — featured */}
              <button
                type="button"
                className="mode-card mode-card--featured accent-2048"
                onClick={startOrResume2048}
                disabled={loading2048}
              >
                <span className="mode-glow" aria-hidden="true" />
                <span className="mode-art mode-art--lg">
                  <LottieTgs url="/numbers/9401.tgs" size={60} />
                </span>
                <span className="mode-text">
                  <span className="mode-eyebrow">Турнир недели</span>
                  <span className="mode-name">2048</span>
                  <span className="mode-sub">Собирай плитки, поднимайся в топ</span>
                </span>
                <span className="mode-cta">
                  {loading2048 ? '...' : hasActive2048 ? 'Продолжить' : 'Играть'}
                </span>
              </button>

              {/* PvP Рулетка */}
              <button type="button" className="mode-card accent-pvp" onClick={() => setView('wheels')}>
                <span className="mode-glow" aria-hidden="true" />
                <span className="mode-art"><LottieJson url="/stickers/pvp.json" size={52} /></span>
                <span className="mode-text">
                  <span className="mode-name">PvP Рулетка</span>
                  <span className="mode-sub">
                    Равные шансы для всех · {wheelsCount > 0 ? `${wheelsCount} активных` : 'покупай билет'}
                  </span>
                </span>
                <span className="mode-chevron">›</span>
              </button>

              {/* Джекпот */}
              <button type="button" className="mode-card accent-jackpot" onClick={() => navigate('/slots')}>
                <span className="mode-glow" aria-hidden="true" />
                <span className="mode-art"><LottieJson url="/stickers/jackpot.json" size={52} /></span>
                <span className="mode-text">
                  <span className="mode-name">Джекпот</span>
                  <span className="mode-sub">Крути слоты · лови 777</span>
                </span>
                <span className="mode-chevron">›</span>
              </button>

              {/* Ролл */}
              <button type="button" className="mode-card accent-roll" onClick={() => navigate('/spins')}>
                <span className="mode-glow" aria-hidden="true" />
                <span className="mode-art"><LottieJson url="/stickers/roll.json" size={52} /></span>
                <span className="mode-text">
                  <span className="mode-name">Ролл</span>
                  <span className="mode-sub">Рулетка с подарками · 1⭐ за прокрут</span>
                </span>
                <span className="mode-chevron">›</span>
              </button>

              <div className="hub-foot">
                <button type="button" className="hub-foot-btn" onClick={() => navigate('/profile')}>Профиль</button>
                <button type="button" className="hub-foot-btn" onClick={() => navigate('/2048-leaderboard')}>Лидеры</button>
                <button type="button" className="hub-foot-btn" onClick={() => navigate('/2048-rules')}>Правила</button>
              </div>
            </div>
          </>
        )}

        {view === 'wheels' && (
          <>
            <div className="wheels-head">
              <button type="button" className="hub-back" onClick={() => setView('hub')}>← Режимы</button>
              <div className="wheels-head-title">PvP Рулетка</div>
              <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="players_desc">Заполненность: больше</option>
                <option value="players_asc">Заполненность: меньше</option>
                <option value="price_asc">Цена: ниже → выше</option>
                <option value="price_desc">Цена: выше → ниже</option>
                <option value="size_desc">Макс. игроков: больше</option>
                <option value="size_asc">Макс. игроков: меньше</option>
              </select>
            </div>

            {sortedWheels.length === 0 ? (
              <p style={{ color: 'white', textAlign: 'center', marginTop: 40 }}>
                Сейчас нет активных колёс. Загляни позже 🙌
              </p>
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

                      <div className="wheel-image" style={{ background: bg, borderRadius: 10, position: 'relative', overflow: 'hidden' }}>
                        <div
                          ref={(el) => {
                            if (!el) return;
                            containerRefs.current[wheel.id] = el;
                            el.setAttribute('data-wheelid', String(wheel.id));
                            el.setAttribute('data-nftname', wheel.nft_name);
                            if (observerRef.current) observerRef.current.observe(el);
                          }}
                          style={{ position: 'absolute', width: '100%', height: '100%', top: 0, left: 0 }}
                        />
                      </div>

                      <div className="wheel-buttons">
                        <button className="lobby-button" onClick={() => handleOpenLobby(wheel.id)}>Лобби</button>
                        <button
                          className="join-button"
                          onClick={() => handleJoin(wheel)}
                          disabled={loadingId === wheel.id || (wheel.participants_count ?? 0) >= wheel.size}
                        >
                          {loadingId === wheel.id ? 'Грузим...' : 'Вход'}
                        </button>
                      </div>

                      <div className="wheel-info">
                        <span>Игроков {wheel.participants_count ?? 0}/{wheel.size}</span>
                        <span>Цена: {Number(wheel.price) === 0 ? 'Free' : wheel.price} <span className="diamond">💎</span></span>
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
                    <button className="lobby-button" onClick={() => setSubscriptionModal(null)}>Отмена</button>
                    <button className="join-button" onClick={() => handleJoin(subscriptionModal, true)}>Я подписан</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
      />
    </>
  );
}

export default Home;
