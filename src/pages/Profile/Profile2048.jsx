import HomeBackButton from '../../components/HomeBackButton';
import { API_BASE } from '../../apiBase';
import { useEffect, useState } from 'react';
import './Profile.css';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);


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
      const res = await fetch(`${API_BASE}/users/profile`, { headers: auth });

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

  const handleCopyRefLink = () => {
    if (!profile?.telegram_id) return;
    navigator.clipboard.writeText(`https://t.me/FightForGift_bot?start=${profile.telegram_id}`);
    toast.success('Скопировано!');
  };

  const avatarLetter = profile?.username ? profile.username[0].toUpperCase() : '?';

  const g = profile?.game2048 ?? {};

  const bestAll = Number(g?.best_all_time ?? 0);
  const bestWeek = Number(g?.best_week ?? 0);
  const weekPlace = g?.week_place ?? null;
  const gamesPlayed = Number(g?.games_played ?? 0);



  if (loading) {
    return (
      <>
        <div className="starfield" aria-hidden="true" />
        <div className="profile-wrapper"><HomeBackButton /><p>Loading Profile...</p></div>
      </>
    );
  }

  if (!profile) {
    return (
      <>
        <div className="starfield" aria-hidden="true" />
        <div className="profile-wrapper"><HomeBackButton /><p>Нет данных профиля</p></div>
      </>
    );
  }

  return (
    <>
      <div className="starfield" aria-hidden="true" />

      <div className="profile-wrapper">
        <HomeBackButton />
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
              <div className="attempts-label">{"Количество игр"}</div>
              <div className="attempts-value">{"Без ограничений"}</div>
            </div>
          </div>
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