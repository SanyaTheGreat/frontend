import { useEffect, useState } from 'react';
import './Profile.css';

export default function Profile() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [referrals, setReferrals] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    const telegramUser = tg?.initDataUnsafe?.user;

    if (!telegramUser || !telegramUser.id) {
      console.warn('Telegram user not found');
      return;
    }

    setUser(telegramUser);
    const telegram_id = telegramUser.id;

    Promise.all([
      fetch(`https://lottery-server-waif.onrender.com/users/by-telegram-id/${telegram_id}`).then(res => res.json()),
      fetch(`https://lottery-server-waif.onrender.com/users/referrals/${telegram_id}`).then(res => res.json()),
      fetch(`https://lottery-server-waif.onrender.com/users/sells/${telegram_id}`).then(res => res.json()),
    ])
      .then(([profileData, referralData, sellsData]) => {
        setProfile(profileData);
        setReferrals(referralData);
        setPurchases(sellsData);
        setLoading(false);
      })
      .catch(err => {
        console.error('Ошибка при загрузке профиля:', err);
        setLoading(false);
      });
  }, []);

  if (loading || !user) {
    return <p className="profile-wrapper">Загрузка профиля...</p>;
  }

  return (
    <div className="profile-wrapper">
      <div className="profile-block">
        <div className="profile-title">👤 Привет, {user.first_name}!</div>
        <div className="profile-row">@{user.username}</div>
      </div>

      <div className="profile-block">
        <div className="profile-title">🎟 Билеты</div>
        <div className="profile-row">{profile?.tickets ?? '—'}</div>
      </div>

      <div className="profile-block">
        <div className="profile-title">💼 TON-кошелёк</div>
        <div className="profile-row">{profile?.wallet || 'не привязан'}</div>
      </div>

      <div className="profile-block">
        <div className="profile-title">👥 Рефералы</div>
        <div className="profile-row">Кол-во: {referrals?.referral_count ?? 0}</div>
        <div className="profile-row">Заработано: {referrals?.referral_earnings ?? 0} TON</div>
      </div>

      <div className="profile-block">
        <div className="profile-title">🔗 Ваша реферальная ссылка</div>
        <input
          type="text"
          readOnly
          className="profile-ref-link"
          value={`https://t.me/FightForGift_bot?start=${user.id}`}
          onClick={(e) => e.target.select()}
        />
      </div>

      <div className="profile-block">
        <div className="profile-title">🕘 История покупок билетов</div>
        <ul className="profile-history-list">
          {purchases.length === 0 && <li>История пуста</li>}
          {purchases.map((item, i) => (
            <li key={i}>
              {item.amount} билета(ов) — {new Date(item.created_at).toLocaleString()}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
