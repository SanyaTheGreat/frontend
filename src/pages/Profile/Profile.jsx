import { useEffect, useState } from 'react';
import './Profile.css';
import { TonConnectButton, useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { toUserFriendlyAddress } from '@tonconnect/sdk';

export default function Profile() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [referrals, setReferrals] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);

  const [tonConnectUI] = useTonConnectUI();
  const tonWallet = useTonWallet();

  const fetchProfile = async (telegram_id) => {
    const [profileData, referralData, sellsData] = await Promise.all([
      fetch(`https://lottery-server-waif.onrender.com/users/profile/${telegram_id}`).then(res => res.json()),
      fetch(`https://lottery-server-waif.onrender.com/users/referrals/${telegram_id}`).then(res => res.json()),
      fetch(`https://lottery-server-waif.onrender.com/users/sells/${telegram_id}`).then(res => res.json()),
    ]);
    setProfile(profileData);
    setReferrals(referralData);
    setPurchases(sellsData);
    setLoading(false);
  };

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    const telegramUser = tg?.initDataUnsafe?.user;

    if (!telegramUser || !telegramUser.id) return;

    setUser(telegramUser);
    fetchProfile(telegramUser.id);
  }, []);

  useEffect(() => {
    if (!tonWallet?.account?.address || !user || !profile) return;

    const walletFromServer = profile.wallet;
    const rawAddress = tonWallet.account.address;
    const friendlyAddress = toUserFriendlyAddress(rawAddress, tonWallet.account.chain === 'testnet');

    if (friendlyAddress && friendlyAddress !== walletFromServer) {
      handleWalletUpdate(friendlyAddress);
    }
  }, [tonWallet, user, profile]);

  const handleWalletUpdate = async (walletValue) => {
    await fetch(`https://lottery-server-waif.onrender.com/users/wallet`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram_id: user.id, wallet: walletValue }),
    });
    fetchProfile(user.id);
  };

  const handleCopyRefLink = () => {
    navigator.clipboard.writeText(`https://t.me/FightForGift_bot?start=${user.id}`);
    alert('Скопировано!');
  };

  const handleTopUp = async () => {
    const amountInput = prompt('Enter the amount in TON:');
    const amount = parseFloat(amountInput);
    if (isNaN(amount) || amount <= 0) {
      alert('Введите корректную сумму.');
      return;
    }
    const nanoTON = (amount * 1e9).toFixed(0);
    const comment = profile?.payload || '';
    const payloadBase64 = comment || undefined;
    try {
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [
          {
            address: 'UQDEUvNIMwUS03T-OknCGDhcKIADjY_hw5KRl0z8g41PKs87',
            amount: nanoTON,
            payload: payloadBase64,
          },
        ],
      });
      alert('Транзакция отправлена');
    } catch (error) {
      alert('Ошибка при отправке TON');
    }
  };

  const handleWithdraw = () => {
    const address = prompt('Enter TON wallet address for withdrawal:');
    const amount = prompt('Enter the amount to withdraw (TON):');
    if (!address || !amount) return;
    fetch('https://lottery-server-waif.onrender.com/users/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegram_id: user.id,
        address,
        amount: parseFloat(amount),
      }),
    })
      .then((res) => res.json())
      .then((data) => alert(data.message || 'Запрос на вывод отправлен'))
      .catch(() => alert('Ошибка при отправке запроса'));
  };

  if (loading || !user) {
    return <p className="profile-wrapper">Loading Profile...</p>;
  }

  // Первая буква username для аватара-заглушки
  const avatarLetter = user.username ? user.username[0].toUpperCase() : '?';

  // Логируем URL аватара
  console.log("Отображаемый URL аватара:", profile?.avatar_url);

  return (
    <div className="profile-wrapper">
      {/* Показываем аватар, если есть, иначе букву-заглушку */}
      {profile?.avatar_url ? (
        <img
          src={profile.avatar_url}
          alt="Avatar"
          className="profile-avatar"
          onError={(e) => {
            console.error("Ошибка загрузки аватара:", e);
            e.currentTarget.style.display = "none"; // скрыть если не загрузился
          }}
        />
      ) : (
        <div className="avatar-placeholder">{avatarLetter}</div>
      )}

      <div className="username-text">@{user.username}</div>

      <div className="ton-connect-wrapper">
        <TonConnectButton />
      </div>

      <div className="balance-actions-row">
        <div className="balance-label">Balance</div>
        <div className="balance-display">
          <span className="ton-icon">🪙</span>
          <span>{profile?.tickets ?? '—'}</span>
        </div>
        <div className="balance-buttons">
          <button onClick={handleTopUp}>Purchase</button>
          <button onClick={handleWithdraw}>Withdrawal</button>
        </div>
      </div>

      <div className="profile-block">
        <div className="profile-title">👥 Referrals</div>
        <div className="profile-row">Count: {referrals?.referral_count ?? 0}</div>
        <div className="profile-row">Earn: {referrals?.referral_earnings ?? 0} TON</div>
      </div>

      <div className="profile-block">
        <div className="profile-title">🔗 Your referral link</div>
        <div className="profile-ref-wrapper">
          <input
            type="text"
            readOnly
            className="profile-ref-link"
            value={`https://t.me/FightForGift_bot?start=${user.id}`}
            onClick={(e) => e.target.select()}
          />
          <button onClick={handleCopyRefLink} className="copy-btn">Copy 🔗</button>
        </div>
      </div>

      <div className="profile-block">
        <div className="profile-title">🕘 Purchase History</div>
        <ul className="profile-history-list">
          {purchases.length === 0 && <li>Still nothing...</li>}
          {purchases.map((item, i) => (
            <li key={i}>
              {item.amount} TON — {new Date(item.created_at).toLocaleString()}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
