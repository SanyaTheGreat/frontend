import React, { useEffect, useState } from 'react';
import './Profile.css';
import { TonConnect } from '@tonconnect/sdk';
import { toUserFriendlyAddress } from '@tonconnect/sdk';
//import { toNano, beginCell } from '@ton/ton';

const connector = new TonConnect();

export default function Profile() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [referrals, setReferrals] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [walletAddress, setWalletAddress] = useState(null);

  const fetchProfile = async (telegram_id) => {
    console.log('📡 Запрашиваем профиль пользователя...');
    const [profileData, referralData, sellsData] = await Promise.all([
      fetch(`https://lottery-server-waif.onrender.com/users/profile/${telegram_id}`).then(res => res.json()),
      fetch(`https://lottery-server-waif.onrender.com/users/referrals/${telegram_id}`).then(res => res.json()),
      fetch(`https://lottery-server-waif.onrender.com/users/sells/${telegram_id}`).then(res => res.json()),
    ]);

    setProfile(profileData);
    setReferrals(referralData);
    setPurchases(sellsData);
    setLoading(false);
    console.log('✅ Профиль получен:', profileData);
  };

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    const telegramUser = tg?.initDataUnsafe?.user;

    if (!telegramUser || !telegramUser.id) {
      console.warn('Telegram user not found');
      return;
    }

    console.log('👤 Telegram пользователь:', telegramUser);
    setUser(telegramUser);
    fetchProfile(telegramUser.id);
  }, []);

  useEffect(() => {
    if (!walletAddress && profile?.wallet) {
      setWalletAddress(profile.wallet);
    }
  }, [profile]);

  // Подключаем кошелек TonConnect при нажатии кнопки
  const connectWallet = async () => {
    try {
      await connector.connect();
      const account = connector.accounts[0];
      console.log('Кошелек подключен:', account);
      setWalletAddress(account.address);

      // Если адрес кошелька отличается от серверного, обновляем
      if (account.address !== profile.wallet) {
        await fetch(`https://lottery-server-waif.onrender.com/users/wallet`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telegram_id: user.id, wallet: account.address }),
        });
        fetchProfile(user.id);
      }
    } catch (error) {
      console.error('Ошибка подключения кошелька:', error);
    }
  };

  // Отправка транзакции с payload
  const sendTransaction = async () => {
    const amountInput = prompt('Введите сумму пополнения в TON (например, 1.5):');
    const amount = parseFloat(amountInput);

    if (isNaN(amount) || amount <= 0) {
      alert('Введите корректную сумму.');
      return;
    }

    if (!walletAddress) {
      alert('Подключите кошелек TON!');
      return;
    }

    // Формируем payload через beginCell
    const comment = profile?.payload || '';
    let payloadBase64;
    if (comment) {
      const cell = beginCell()
        .storeUint(0, 32)
        .storeStringTail(comment)
        .endCell();

      payloadBase64 = cell.toBoc().toString("base64");
    }

    console.log('📤 Отправляем транзакцию с payload (Base64):', payloadBase64);

    try {
      await connector.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 360,
        messages: [
          {
            address: 'UQDEUvNIMwUS03T-OknCGDhcKIADjY_hw5KRl0z8g41PKs87',
            amount: toNano(amount).toString(),
            payload: payloadBase64,
          },
        ],
      });
      console.log('✅ Транзакция отправлена');
    } catch (error) {
      console.error('❌ Ошибка при отправке транзакции:', error);
      alert('Ошибка при отправке TON');
    }
  };

  const handleCopyRefLink = () => {
    navigator.clipboard.writeText(`https://t.me/FightForGift_bot?start=${user.id}`);
    alert('Скопировано!');
  };

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
        <div className="profile-title">🔌 Подключение TON Connect</div>
        <div className="profile-row ton-button-row">
          <button onClick={connectWallet}>Подключить TON кошелек</button>
          <div>Текущий адрес: {walletAddress || 'не подключен'}</div>
        </div>
      </div>

      <div className="profile-block">
        <div className="profile-title">🎟 TON</div>
        <div className="profile-row">{profile?.tickets ?? '—'}</div>
      </div>

      <div className="profile-block">
        <div className="profile-title">💳 Пополнение и вывод TON</div>
        <div className="profile-row">
          <button onClick={sendTransaction}>Пополнить TON</button>
        </div>

        <div className="profile-row">
          <button
            onClick={() => {
              const address = prompt('Введите адрес TON-кошелька для вывода:');
              const amount = prompt('Введите сумму для вывода (TON):');

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
            }}
          >
            Вывести
          </button>
        </div>
      </div>

      <div className="profile-block">
        <div className="profile-title">👥 Рефералы</div>
        <div className="profile-row">Кол-во: {referrals?.referral_count ?? 0}</div>
        <div className="profile-row">Заработано: {referrals?.referral_earnings ?? 0} TON</div>
      </div>

      <div className="profile-block">
        <div className="profile-title">🔗 Ваша реферальная ссылка</div>
        <div className="profile-ref-wrapper">
          <input
            type="text"
            readOnly
            className="profile-ref-link"
            value={`https://t.me/FightForGift_bot?start=${user.id}`}
            onClick={(e) => e.target.select()}
          />
          <button onClick={handleCopyRefLink} className="copy-btn">
            Скопировать 🔗
          </button>
        </div>
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
