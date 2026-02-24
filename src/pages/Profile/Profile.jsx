import { useEffect, useMemo, useState } from 'react';
import './Profile.css';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const [nowTick, setNowTick] = useState(Date.now()); // для таймера

  const getAuthHeaders = () => {
    const token = localStorage.getItem('jwt');
    if (!token) return null;
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  };

  const fetchProfile = async () => {
    const auth = getAuthHeaders();
    if (!auth) {
      toast.error('Открой Mini App внутри Telegram (нет токена)');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('https://lottery-server-waif.onrender.com/users/profile', { headers: auth });

      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('jwt');
        toast.error('Сессия истекла. Открой Mini App заново.');
        setLoading(false);
        return;
      }

      const data = await res.json();
      setProfile(data || null);
    } catch (e) {
      console.error(e);
      toast.error('Ошибка загрузки профиля');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProfile(); }, []);

  // таймер (обновление раз в секунду)
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const handleCopyRefLink = () => {
    if (!profile?.telegram_id) return;
    navigator.clipboard.writeText(`https://t.me/FightForGift_bot?start=${profile.telegram_id}`);
    toast.success('Скопировано!');
  };

  const avatarLetter = profile?.username ? profile.username[0].toUpperCase() : '?';

  const g = profile?.game2048 ?? {};
  const attempts = g?.attempts ?? {};

  const bestAll = Number(g?.best_all_time ?? 0);
  const bestWeek = Number(g?.best_week ?? 0);
  const weekPlace = g?.week_place ?? null;
  const gamesPlayed = Number(g?.games_played ?? 0);

  const dailyRemaining = Number(attempts?.daily_attempts_remaining ?? 0);
  const refRemaining = Number(attempts?.referral_attempts_balance ?? 0);
  const resetsAt = attempts?.resets_at_utc ? new Date(attempts.resets_at_utc) : null;

  const timeLeft = useMemo(() => {
    if (!resetsAt || Number.isNaN(resetsAt.getTime())) return null;
    const diff = resetsAt.getTime() - nowTick;
    if (diff <= 0) return '00:00:00';
    const totalSec = Math.floor(diff / 1000);
    const hh = String(Math.floor(totalSec / 3600)).padStart(2, '0');
    const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }, [resetsAt, nowTick]);

  if (loading) {
    return (
      <>
        <div className="starfield" aria-hidden="true" />
        <p className="profile-wrapper">Loading Profile...</p>
      </>
    );
  }

  if (!profile) {
    return (
      <>
        <div className="starfield" aria-hidden="true" />
        <p className="profile-wrapper">Нет данных профиля</p>
      </>
    );
  }

  return (
    <>
      <div className="starfield" aria-hidden="true" />

      <div className="profile-wrapper">
        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt="Avatar"
            className="profile-avatar"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className="avatar-placeholder">{avatarLetter}</div>
        )}

        <div className="username-text">@{profile.username || 'user'}</div>

        {/* ===== 2048: Stats ===== */}
        <div className="profile-block">
          <div className="profile-title"> Статистика</div>

          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">Лучший результат</div>
              <div className="stat-value">{bestAll}</div>
              <div className="stat-sub">за всё время</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Лучший этой недели</div>
              <div className="stat-value">{bestWeek}</div>
              <div className="stat-sub">
                {weekPlace ? `место #${weekPlace}` : 'нет в топе'}
              </div>
            </div>
          </div>

          <div className="profile-row" style={{ marginTop: 12 }}>
            Количество игр: <b>{gamesPlayed}</b>
          </div>
        </div>

        {/* ===== Attempts ===== */}
        <div className="profile-block">
          <div className="profile-title"> Попытки</div>

          <div className="attempts-row">
            <div className="attempts-item">
              <div className="attempts-label">Доступно сейчас</div>
              <div className="attempts-value">{dailyRemaining}</div>
            </div>

            <div className="attempts-item">
              <div className="attempts-label">От рефералов</div>
              <div className="attempts-value">{refRemaining}</div>
            </div>

            <div className="attempts-item">
              <div className="attempts-label">Обновление через</div>
              <div className="attempts-value attempts-timer">{timeLeft ?? '—'}</div>
            </div>
          </div>

          {attempts?.daily_plays_used !== undefined && (
            <div className="profile-row" style={{ opacity: 0.9, marginTop: 10 }}>
              Использовано сегодня: <b>{Number(attempts.daily_plays_used ?? 0)}</b> / 20
            </div>
          )}
        </div>

        {/* ===== Referral link (оставляем) ===== */}
        <div className="profile-block">
          <div className="profile-title">🔗 Твоя Рефералка</div>
          <div className="profile-ref-wrapper">
            <input
              type="text"
              readOnly
              className="profile-ref-link"
              value={profile?.telegram_id ? `https://t.me/FightForGift_bot?start=${profile.telegram_id}` : ''}
              onClick={(e) => e.target.select()}
            />
            <button onClick={handleCopyRefLink} className="copy-btn">🔗</button>
          </div>
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
      </div>
    </>
  );
}