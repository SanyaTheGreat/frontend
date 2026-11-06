import { useEffect, useMemo, useState } from 'react';
import './Profile.css';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { TonConnectButton, useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { beginCell, Address } from '@ton/core';
import { API_BASE } from '../../apiBase';

// Кошелёк-приёмник депозитов (совпадает с адресом в checkTonTransactions.js на бэке).
const DEPOSIT_ADDRESS = 'UQDEUvNIMwUS03T-OknCGDhcKIADjY_hw5KRl0z8g41PKs87';
const DEPOSIT_PRESETS = [1, 5, 10];

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nowTick, setNowTick] = useState(Date.now());

  const [ludo, setLudo] = useState({ participations: 0, wins: 0 });
  const [claiming, setClaiming] = useState(false);

  const [depositOpen, setDepositOpen] = useState(false);
  const [depositMethod, setDepositMethod] = useState('ton'); // 'ton' | 'stars'
  const [depositAmount, setDepositAmount] = useState('1');
  const [starsBusy, setStarsBusy] = useState(false);

  const [tonConnectUI] = useTonConnectUI();
  const tonWallet = useTonWallet();

  const authHeaders = () => {
    const token = localStorage.getItem('jwt');
    if (!token) return null;
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  };

  const fetchProfile = async () => {
    const auth = authHeaders();
    if (!auth) {
      toast.error('Открой Mini App внутри Telegram (нет токена)');
      setLoading(false);
      return null;
    }
    try {
      const res = await fetch(`${API_BASE}/users/profile`, { headers: auth });
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('jwt');
        toast.error('Сессия истекла. Открой Mini App заново.');
        setLoading(false);
        return null;
      }
      const data = await res.json();
      setProfile(data || null);
      return data || null;
    } catch (e) {
      console.error(e);
      toast.error('Ошибка загрузки профиля');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const fetchLudo = async (telegram_id) => {
    const auth = authHeaders();
    if (!auth || !telegram_id) return;
    try {
      const [pRes, wRes] = await Promise.all([
        fetch(`${API_BASE}/wheel/${telegram_id}/participations`, { headers: auth }),
        fetch(`${API_BASE}/wheel/${telegram_id}/wins`, { headers: auth }),
      ]);
      const pData = await pRes.json().catch(() => ({}));
      const wData = await wRes.json().catch(() => ({}));
      setLudo({
        participations: Array.isArray(pData?.participations) ? pData.participations.length : 0,
        wins: Array.isArray(wData?.wins) ? wData.wins.length : 0,
      });
    } catch (e) {
      console.error('ludo fetch error', e);
    }
  };

  useEffect(() => {
    (async () => {
      const p = await fetchProfile();
      if (p?.telegram_id) fetchLudo(p.telegram_id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // авто-привязка кошелька при подключении TonConnect
  useEffect(() => {
    const raw = tonWallet?.account?.address;
    if (!raw || !profile) return;
    let friendly = raw;
    try { friendly = Address.parse(raw).toString({ bounceable: false }); } catch { /* Optional browser or animation cleanup. */ }
    if (friendly && friendly !== profile.wallet) {
      bindWallet(friendly);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tonWallet, profile?.wallet]);

  const bindWallet = async (wallet) => {
    const auth = authHeaders();
    if (!auth) return;
    try {
      const res = await fetch(`${API_BASE}/users/wallet`, {
        method: 'PATCH',
        headers: auth,
        body: JSON.stringify({ wallet }),
      });
      if (res.ok) {
        toast.success('Кошелёк привязан');
        fetchProfile();
      }
    } catch (e) {
      console.error('bindWallet error', e);
    }
  };

  const doDeposit = async () => {
    const amount = Number(String(depositAmount).replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Введите сумму больше 0');
      return;
    }
    if (!profile?.telegram_id) {
      toast.error('Профиль не загружен');
      return;
    }

    // Комментарий = telegram_id (без него платёж не зачислится автоматически)
    const commentBody = beginCell()
      .storeUint(0, 32)
      .storeStringTail(String(profile.telegram_id))
      .endCell()
      .toBoc()
      .toString('base64');

    const nano = BigInt(Math.round(amount * 1e9)).toString();

    try {
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [{ address: DEPOSIT_ADDRESS, amount: nano, payload: commentBody }],
      });
      setDepositOpen(false);
      toast.success('Платёж отправлен. Зачисление ~1 минуту 💎');
      // подтянем баланс несколько раз, пока watcher зачисляет
      [4000, 9000, 16000, 30000].forEach((ms) => setTimeout(fetchProfile, ms));
    } catch (e) {
      console.error('deposit error', e);
      if (String(e?.message || '').toLowerCase().includes('reject')) {
        toast.info('Платёж отменён');
      } else {
        toast.error('Не удалось отправить платёж');
      }
    }
  };

  // Открыть Telegram-инвойс (Stars). В обычном браузере fallback на новое окно.
  const openInvoice = (invoiceLink) =>
    new Promise((resolve) => {
      const tg = window.Telegram?.WebApp;
      try {
        if (tg?.openInvoice) {
          tg.openInvoice(invoiceLink, (status) => resolve(status || 'unknown'));
          return;
        }
        window.open(invoiceLink, '_blank', 'noopener,noreferrer');
        resolve('opened_external');
      } catch {
        resolve('failed');
      }
    });

  // Пополнение баланса 💎 через Telegram Stars (внутренняя конвертация Stars → 💎).
  const doStarsTopup = async () => {
    const auth = authHeaders();
    if (!auth) { toast.error('Нет авторизации'); return; }
    const amount = Number(String(depositAmount).replace(',', '.'));
    if (!Number.isFinite(amount) || amount < 0.1) {
      toast.error('Минимум 0.1 💎');
      return;
    }
    // бэк требует шаг 0.1
    const tickets_desired = Math.round(amount * 10) / 10;

    setStarsBusy(true);
    try {
      const res = await fetch(`${API_BASE}/payments/create-invoice`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ tickets_desired }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok || !data?.invoice_link) {
        toast.error(data?.error || 'Не удалось создать счёт');
        return;
      }
      const status = await openInvoice(data.invoice_link);
      if (status === 'paid') {
        setDepositOpen(false);
        toast.success('Оплата прошла ✅ Зачисляем 💎...');
        [3000, 7000, 14000].forEach((ms) => setTimeout(fetchProfile, ms));
      } else if (status === 'cancelled') {
        toast.info('Оплата отменена');
      } else if (status === 'failed') {
        toast.error('Оплата не прошла');
      } else {
        toast.info(`Счёт открыт (~${data.stars_needed ?? ''} ⭐)`);
      }
    } catch (e) {
      console.error('stars topup error', e);
      toast.error('Ошибка сети');
    } finally {
      setStarsBusy(false);
    }
  };

  const claimReward = async () => {
    const auth = authHeaders();
    if (!auth) return;
    setClaiming(true);
    try {
      const res = await fetch(`${API_BASE}/wheel/claim`, { method: 'POST', headers: auth });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(data?.message || 'Приз отправлен 🎁');
      } else if (res.status === 404) {
        toast.info('Нет призов к получению');
      } else {
        toast.error(data?.error || 'Не удалось получить приз');
      }
    } catch (e) {
      console.error('claim error', e);
      toast.error('Ошибка сети');
    } finally {
      setClaiming(false);
    }
  };

  const withdrawReferral = async () => {
    const auth = authHeaders();
    if (!auth) return;
    const available = Number(profile?.referral_can ?? 0);
    if (!profile?.wallet) {
      toast.error('Сначала привяжи TON-кошелёк');
      return;
    }
    const input = window.prompt(`Сумма вывода (TON), доступно ${available.toFixed(2)}, минимум 3:`, String(Math.floor(available)));
    if (!input) return;
    const amount = Number(String(input).replace(',', '.'));
    if (!Number.isFinite(amount) || amount < 3) {
      toast.error('Минимум 3 TON');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/users/withdraw`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ amount }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        toast.success(data?.message || 'Вывод отправлен');
        fetchProfile();
      } else {
        toast.error(data?.error || data?.message || 'Не удалось вывести');
      }
    } catch (e) {
      console.error('withdraw error', e);
      toast.error('Ошибка сети');
    }
  };

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

  const balance = Number(profile?.tickets ?? 0);
  const refTotal = Number(profile?.referral_total ?? 0);
  const refCan = Number(profile?.referral_can ?? 0);
  const refFrozen = Number(profile?.referral_frozen ?? 0);
  const canWithdraw = Boolean(profile?.withdraw_available);

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

        {/* ===== Баланс + пополнение ===== */}
        <div className="balance-actions-row">
          <div className="balance-display">
            <span className="ton-icon">💎</span>
            <span>{balance.toLocaleString('ru-RU', { maximumFractionDigits: 3 })}</span>
          </div>
          <div className="balance-buttons">
            <button className="btn btn-ton" onClick={() => { setDepositMethod('ton'); setDepositOpen(true); }}>Пополнить 💎</button>
          </div>
        </div>

        {/* TON Connect */}
        <div className="profile-block">
          <div className="profile-title">🔌 TON-кошелёк</div>
          <div className="profile-row ton-button-row">
            <TonConnectButton />
          </div>
          <div className="profile-row" style={{ fontSize: 13, opacity: 0.85, wordBreak: 'break-all' }}>
            {profile.wallet ? `Привязан: ${profile.wallet}` : 'Кошелёк не привязан — подключи для пополнения и вывода'}
          </div>
        </div>

        {/* ===== Лудка (PvP) ===== */}
        <div className="profile-block">
          <div className="profile-title">🎡 Лудка (PvP)</div>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">Участий</div>
              <div className="stat-value">{ludo.participations}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Побед</div>
              <div className="stat-value">{ludo.wins}</div>
            </div>
          </div>
          <button
            className="referral-withdraw-btn"
            style={{ marginTop: 12, width: '100%' }}
            onClick={claimReward}
            disabled={claiming}
          >
            {claiming ? 'Получаем...' : '🎁 Забрать приз'}
          </button>
        </div>

        {/* ===== 2048 ===== */}
        <div className="profile-block">
          <div className="profile-title">🔢 2048</div>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">Лучший результат</div>
              <div className="stat-value">{bestAll}</div>
              <div className="stat-sub">за всё время</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Лучший за неделю</div>
              <div className="stat-value">{bestWeek}</div>
              <div className="stat-sub">{weekPlace ? `место #${weekPlace}` : 'нет в топе'}</div>
            </div>
          </div>

          <div className="attempts-row" style={{ marginTop: 12 }}>
            <div className="attempts-item">
              <div className="attempts-label">Попытки</div>
              <div className="attempts-value">{dailyRemaining}</div>
            </div>
            <div className="attempts-item">
              <div className="attempts-label">От рефералов</div>
              <div className="attempts-value">{refRemaining}</div>
            </div>
            <div className="attempts-item">
              <div className="attempts-label">Обновление</div>
              <div className="attempts-value attempts-timer">{timeLeft ?? '—'}</div>
            </div>
          </div>

          <div className="profile-row" style={{ marginTop: 10, opacity: 0.9 }}>
            Сыграно игр: <b>{gamesPlayed}</b>
          </div>
        </div>

        {/* ===== Рефералы ===== */}
        <div className="profile-block">
          <div className="profile-title">👥 Рефералы</div>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">Заработано</div>
              <div className="stat-value">{refTotal.toFixed(2)}</div>
              <div className="stat-sub">TON всего</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Доступно к выводу</div>
              <div className="stat-value">{refCan.toFixed(2)}</div>
              <div className="stat-sub">заморожено {refFrozen.toFixed(2)}</div>
            </div>
          </div>

          <button
            className="referral-withdraw-btn"
            style={{ marginTop: 12, width: '100%', opacity: canWithdraw ? 1 : 0.6 }}
            onClick={withdrawReferral}
            disabled={!canWithdraw}
          >
            {canWithdraw ? 'Вывести TON' : 'Вывод от 3 TON'}
          </button>

          <div className="profile-ref-wrapper" style={{ marginTop: 12 }}>
            <input
              type="text"
              readOnly
              className="profile-ref-link"
              value={`https://t.me/FightForGift_bot?start=${profile.telegram_id}`}
              onClick={(e) => e.target.select()}
            />
            <button onClick={handleCopyRefLink} className="copy-btn">🔗</button>
          </div>
        </div>
      </div>

      {/* ===== Модалка пополнения (TON / Stars → единый баланс 💎) ===== */}
      {depositOpen && (
        <div className="deposit-overlay" onClick={() => setDepositOpen(false)}>
          <div className="deposit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="profile-title">Пополнить баланс 💎</div>

            <div className="deposit-tabs">
              <button
                className={`deposit-tab ${depositMethod === 'ton' ? 'active' : ''}`}
                onClick={() => setDepositMethod('ton')}
              >
                💎 TON
              </button>
              <button
                className={`deposit-tab ${depositMethod === 'stars' ? 'active' : ''}`}
                onClick={() => setDepositMethod('stars')}
              >
                ⭐ Stars
              </button>
            </div>

            <div className="deposit-sub">
              {depositMethod === 'ton'
                ? 'Перевод TON через кошелёк, 1 TON = 1 💎. Комментарий добавится автоматически.'
                : 'Оплата Telegram Stars. Сумма в 💎 — звёзды посчитаются по курсу автоматически.'}
            </div>

            <div className="deposit-presets">
              {DEPOSIT_PRESETS.map((v) => (
                <button
                  key={v}
                  className={`deposit-chip ${String(v) === String(depositAmount) ? 'active' : ''}`}
                  onClick={() => setDepositAmount(String(v))}
                >
                  {v} 💎
                </button>
              ))}
            </div>

            <input
              className="deposit-input"
              type="number"
              min="0"
              step="0.1"
              inputMode="decimal"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="Сумма в 💎"
            />

            <div className="deposit-actions">
              <button className="btn btn-ghost" onClick={() => setDepositOpen(false)}>Отмена</button>
              {depositMethod === 'ton' ? (
                <button className="btn btn-ton" onClick={doDeposit}>Оплатить TON</button>
              ) : (
                <button className="btn btn-stars" onClick={doStarsTopup} disabled={starsBusy}>
                  {starsBusy ? '...' : 'Оплатить ⭐'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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
