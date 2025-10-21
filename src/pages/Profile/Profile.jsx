import { useEffect, useState } from 'react';
import './Profile.css';
import { TonConnectButton, useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { toUserFriendlyAddress } from '@tonconnect/sdk';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export default function Profile() {
  const [profile, setProfile] = useState(null);      // { telegram_id, username, avatar_url, wallet, tickets, payload }
  const [referrals, setReferrals] = useState(null);  // { referral_count, referral_earnings, referral_can? }
  const [purchases, setPurchases] = useState([]);    // [{ amount, created_at }, ...]
  const [loading, setLoading] = useState(true);

  const [tonConnectUI] = useTonConnectUI();
  const tonWallet = useTonWallet();

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
      const [profileRes, refRes, sellsRes] = await Promise.all([
        fetch('https://lottery-server-waif.onrender.com/users/profile', { headers: auth }),
        fetch('https://lottery-server-waif.onrender.com/users/referrals', { headers: auth }),
        fetch('https://lottery-server-waif.onrender.com/users/sells', { headers: auth }),
      ]);

      if (profileRes.status === 401 || refRes.status === 401 || sellsRes.status === 401 ||
          profileRes.status === 403 || refRes.status === 403 || sellsRes.status === 403) {
        localStorage.removeItem('jwt');
        toast.error('Сессия истекла. Открой Mini App заново.');
        setLoading(false);
        return;
      }

      const [profileData, referralData, sellsData] = await Promise.all([
        profileRes.json(), refRes.json(), sellsRes.json()
      ]);

      setProfile(profileData || null);
      setReferrals(referralData || null);
      setPurchases(Array.isArray(sellsData) ? sellsData : (sellsData?.items || []));
    } catch (e) {
      console.error(e);
      toast.error('Ошибка загрузки профиля');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  // Автосинхронизация TON-кошелька при коннекте
  useEffect(() => {
    if (!tonWallet?.account?.address || !profile) return;

    const walletFromServer = profile.wallet;
    const rawAddress = tonWallet.account.address;
    const friendlyAddress = toUserFriendlyAddress(rawAddress, tonWallet.account.chain === 'testnet');

    if (friendlyAddress && friendlyAddress !== walletFromServer) {
      handleWalletUpdate(friendlyAddress);
    }
  }, [tonWallet, profile]);

  const handleWalletUpdate = async (walletValue) => {
    const auth = getAuthHeaders();
    if (!auth) return toast.error('Нет токена авторизации');

    try {
      const res = await fetch('https://lottery-server-waif.onrender.com/users/wallet', {
        method: 'PATCH',
        headers: auth,
        body: JSON.stringify({ wallet: walletValue }), // ⚠️ без telegram_id
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return toast.error(data?.error || 'Не удалось сохранить кошелек');
      }
      toast.success('Кошелек сохранён');
      fetchProfile();
    } catch (e) {
      console.error(e);
      toast.error('Ошибка сервера при сохранении кошелька');
    }
  };

  const handleCopyRefLink = () => {
    if (!profile?.telegram_id) return;
    navigator.clipboard.writeText(`https://t.me/FightForGift_bot?start=${profile.telegram_id}`);
    toast.success('Скопировано!');
  };

  // ---- Пополнение звёздами (через Telegram Stars) ----
  const handleTopUpStars = async () => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return toast.error('Открой Mini App в Telegram');

    const input = prompt('Введите сумму пополнения в TON (мин.шаг 0.1)  21⭐ = 0.1💎 :', '0.1');
    const tickets = parseFloat(input);
    const valid = Number.isFinite(tickets) && tickets >= 0.1 && Math.abs(tickets * 10 - Math.round(tickets * 10)) < 1e-9;
    if (!valid) return toast.warning('Сумма должна быть ≥ 0.1 с минимальным шагом 0.1');

    const auth = getAuthHeaders();
    if (!auth) return toast.error('Нет токена авторизации');

    try {
      const resp = await fetch('https://lottery-server-waif.onrender.com/payments/create-invoice', {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ tickets_desired: tickets }), // ⚠️ без telegram_id
      });

      const data = await resp.json();
      if (!resp.ok || !data?.invoice_link) {
        return toast.error(data?.error || 'Failed to create invoice');
      }

      tg.openInvoice(data.invoice_link, async (status) => {
        if (status === 'paid') {
          toast.success('Paid ✅ Баланс обновится скоро');
          setTimeout(() => fetchProfile(), 1500);
        } else if (status === 'cancelled') {
          toast.info('Payment cancelled');
        } else if (status === 'failed') {
          toast.error('Payment failed');
        }
      });
    } catch (e) {
      console.error(e);
      toast.error('Server error while creating invoice');
    }
  };

  // ---- Пополнение TON через TonConnect (ончейн) ----
  const handleTopUp = async () => {
    if (!profile) return;
    const amountInput = prompt('Введите сумму в TON:');
    const amount = parseFloat(amountInput);
    if (isNaN(amount) || amount <= 0) {
      toast.warning('Введите корректную сумму.');
      return;
    }
    const nanoTON = (amount * 1e9).toFixed(0);
    const payloadBase64 = profile?.payload || undefined;

    try {
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [
          {
            address: 'UQDEUvNIMwUS03T-OknCGDhcKIADjY_hw5KRl0z8g41PKs87', // адрес твоего кошелька
            amount: nanoTON,
            payload: payloadBase64,
          },
        ],
      });
      toast.success('Транзакция отправлена');
    } catch (error) {
      toast.error('Error Sending TON');
    }
  };

  const formatTon2 = (n) => {
    if (n == null) return '0';
    const num = Number(n);
    if (!Number.isFinite(num)) return String(n);
    return num.toFixed(2).replace(/\.?0+$/, '');
  };

  // ---- Вывод реферальных ----
  const handleReferralWithdraw = async () => {
    if (!profile?.wallet) {
      toast.error('Кошелек не подключен');
      return;
    }
    // backend уже ограничивает суммой «старше 21 дня»;
    // берём это поле, а если его нет — старое referral_earnings
    const canRaw = referrals?.referral_can ?? referrals?.referral_earnings ?? 0;
    const amount = Math.max(0, Math.floor(Number(canRaw) * 100) / 100); // не больше 2 знаков

    if (amount < 3) {
      toast.warning('Мин. сумма — 3 TON');
      return;
    }
    const confirmed = window.confirm(`Вывести ${formatTon2(amount)} TON на ${profile.wallet}?`);
    if (!confirmed) return;

    const auth = getAuthHeaders();
    if (!auth) return toast.error('Нет токена авторизации');

    try {
      const res = await fetch('https://lottery-server-waif.onrender.com/users/withdraw', {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ wallet: profile.wallet, amount }), // ⚠️ без telegram_id
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'Успешный вывод');
        fetchProfile();
      } else {
        toast.error(data.error || 'Ошибка при выводе');
      }
    } catch (err) {
      toast.error('SERVER Error during output');
      console.error(err);
    }
  };

  if (loading) {
    return <p className="profile-wrapper">Loading Profile...</p>;
  }
  if (!profile) {
    return <p className="profile-wrapper">Нет данных профиля</p>;
  }

  const avatarLetter = profile.username ? profile.username[0].toUpperCase() : '?';

  // вычислим отображаемые значения рефералок
  const earnedTotal = referrals?.referral_earnings ?? 0;
  const canWithdraw = referrals?.referral_can ?? referrals?.referral_earnings ?? 0;

  return (
    <div className="profile-wrapper">
      {profile?.avatar_url ? (
        <img
          src={profile.avatar_url}
          alt="Avatar"
          className="profile-avatar"
          onError={(e) => {
            console.error('Ошибка загрузки аватара:', e);
            e.currentTarget.style.display = 'none';
          }}
        />
      ) : (
        <div className="avatar-placeholder">{avatarLetter}</div>
      )}

      <div className="username-text">@{profile.username || 'user'}</div>

      <div className="ton-connect-wrapper">
        <TonConnectButton />
      </div>

      <div className="balance-actions-row">
        <div className="balance-label">Баланс</div>
        <div className="balance-display">
          <span className="ton-icon">🪙</span>
          <span>
            {profile?.tickets !== undefined
              ? parseFloat(profile.tickets).toFixed(2).replace(/\.?0+$/, '')
              : '—'}
          </span>
        </div>
        <div className="balance-buttons">
          <button className="btn btn-stars" onClick={handleTopUpStars}>Пополнить⭐</button>
          <button className="btn btn-ton" onClick={handleTopUp}>Пополнить💎</button>
        </div>
      </div>

      <div className="profile-block">
        <div className="profile-title">👥 Рефералы</div>
        <div className="referral-flex-row">
          <div>
            <div className="profile-row">Количество: {referrals?.referral_count ?? 0}</div>
            <div className="profile-row">Заработано всего: {formatTon2(earnedTotal)} 💎 TON</div>
            <div className="profile-row" style={{ opacity: 0.9 }}>
              Доступно для вывода: <b>{formatTon2(canWithdraw)}</b> 💎 TON
            </div>
          </div>
          <div className="referral-button-wrapper">
            <button onClick={handleReferralWithdraw} className="referral-withdraw-btn">
              Вывод
            </button>
          </div>
        </div>
      </div>

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

      <div className="profile-block">
        <div className="profile-title">🕘 История Пополнений</div>
        <ul className="profile-history-list">
          {(!purchases || purchases.length === 0) && <li>Пока пусто…</li>}
          {purchases.map((item, i) => (
            <li key={i}>
              {item.amount} TON — {new Date(item.created_at).toLocaleString()}
            </li>
          ))}
        </ul>
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
  );
}
