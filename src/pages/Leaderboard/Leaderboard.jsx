import { useEffect, useMemo, useRef, useState } from 'react';
import lottie from 'lottie-web';
import './Leaderboard.css';
import { API_BASE } from '../../apiBase';

/** Берём JWT из localStorage. Никакого обмена initData → JWT здесь не делаем. */
async function getJwt() {
  const token = localStorage.getItem('jwt');
  if (!token) {
    console.warn('⚠️ JWT отсутствует — открой Mini App через экран профиля (или переавторизуйся), чтобы получить токен.');
    return null;
  }
  return token;
}

/* обратный отсчёт в форматах:
   ≥ 24ч  => "Xd Yч"
   < 24ч  => "Xч Ym" */
function useCountdown(endIso) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (!endIso) return;
    const end = new Date(endIso).getTime();
    const tick = () => {
      const now = Date.now();
      let diff = Math.max(0, end - now);
      const MIN = 60 * 1000, HR = 60 * MIN, DAY = 24 * HR;
      const d = Math.floor(diff / DAY); diff %= DAY;
      const h = Math.floor(diff / HR);  diff %= HR;
      const m = Math.floor(diff / MIN);
      if (end - now <= 0) setText('завершено');
      else if (d >= 1)    setText(`${d} д ${h} ч`);
      else                setText(`${h} ч ${m} м`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endIso]);
  return text;
}

export default function Leaderboard() {
  const [mode, setMode] = useState('spend'); // 'spend' | 'referrals'
  const unit = mode === 'referrals' ? '👥' : '💎';
  const path = mode === 'referrals' ? '/users/leaderboard-referrals' : '/users/leaderboard';

  const telegramId = useMemo(() => {
    const tg = window?.Telegram?.WebApp;
    return tg?.initDataUnsafe?.user?.id ?? null;
  }, []);

  const [top3, setTop3]   = useState([]);
  const [list, setList]   = useState([]);
  const [me, setMe]       = useState(null);
  const [, setTotal] = useState(0);
  const [prizes, setPrizes] = useState([]);
  const [endAt, setEndAt] = useState(null);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // Lottie refs для призов 1/2/3
  const a1Ref = useRef(null);
  const a2Ref = useRef(null);
  const a3Ref = useRef(null);

  // Загрузка данных (с JWT, если он есть)
  useEffect(() => {
    async function load() {
      try {
        setErr(null);
        setLoading(true);

        const token = await getJwt(); // может быть null
        const url = new URL(`${API_BASE}${path}`);
        url.searchParams.set('limit', '10');
        url.searchParams.set('offset', '0');

        const res = await fetch(url.toString(), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        setTop3(json.top3 ?? []);
        setList(json.list ?? []);
        setMe(json.me ?? null);
        setTotal(json.total ?? 0);
        setPrizes(json.prizes ?? []);
        setEndAt(json.end_at ?? null);
      } catch (e) {
        console.error(e);
        setErr('Не удалось загрузить лидерборд');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [path, mode]);

  // место -> slug/nft_name (имя json в /public/animations)
  const slugByPlace = useMemo(() => {
    const m = {};
    (prizes || []).forEach(p => { m[p.place] = p.slug || p.nft_name; });
    return m;
  }, [prizes]);

  // загрузка Lottie (прозрачная)
  useEffect(() => {
    const arr = [];
    const loadAnim = async (slug, ref) => {
      if (!slug || !ref?.current) return;
      try {
        const res = await fetch(`/animations/${slug}.json`);
        const data = await res.json();
        const inst = lottie.loadAnimation({
          container: ref.current,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          animationData: data,
        });
        arr.push(inst);
      } catch (e) {
        console.warn('Lottie load error:', slug, e);
      }
    };
    loadAnim(slugByPlace[1], a1Ref);
    loadAnim(slugByPlace[2], a2Ref);
    loadAnim(slugByPlace[3], a3Ref);
    return () => arr.forEach(i => i?.destroy());
  }, [slugByPlace]);

  const countdown = useCountdown(endAt || '2025-10-15T00:00:00Z');

  return (
    <>
      {/* звёздное небо */}
      <div className="starfield" aria-hidden="true" />

      <div className="lb-wrapper">
        <div className="lb-header">
          <div className="lb-title">ТАБЛИЦА ЛИДЕРОВ</div>
          {!!countdown && <div className="lb-badge">{countdown}</div>}
        </div>

        <div className="lb-tabs">
          <button
            className={`lb-tab ${mode === 'spend' ? 'active' : ''}`}
            onClick={() => setMode('spend')}
          >
            💎 Траты
          </button>
          <button
            className={`lb-tab ${mode === 'referrals' ? 'active' : ''}`}
            onClick={() => setMode('referrals')}
          >
            👥 Рефералы
          </button>
        </div>

        <TopThree items={top3} a1Ref={a1Ref} a2Ref={a2Ref} a3Ref={a3Ref} unit={unit} />

        <div className="lb-me-card">
          <div className="lb-me-left">
            <div className="lb-me-rank">{me?.rank ?? '—'}</div>
            <div className="lb-me-label">Вы</div>
          </div>
          <div className="lb-me-center">
            <Avatar src={me?.avatar_url} username={me?.username} size={40} />
            <div className="lb-username" title={formatUsername(me?.username)}>
              {displayUsername(me?.username, 10)}
            </div>
          </div>
          <div className="lb-me-right">
            <div className="lb-amount">{formatAmount(me?.total_spent)}</div>
            <div className="lb-amount-sub">{unit}</div>
          </div>
        </div>

        <div className="lb-list">
          {loading ? (
            <ListSkeleton />
          ) : err ? (
            <div className="lb-error">{err}</div>
          ) : (
            list.slice(0, 10).map(row => (
              <Row
                key={`${row.user_id}-${row.rank}`}
                row={row}
                highlight={row.telegram_id === telegramId}
                unit={unit}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}

function TopThree({ items, a1Ref, a2Ref, a3Ref, unit }) {
  if (!items || items.length === 0) return null;
  const first = items[0], second = items[1], third = items[2];

  return (
    <div className="lb-podium-wrap">
      {second && (
        <div className="step step-2">
          <div ref={a2Ref} className="lb-tgs" />
          <Avatar src={second.avatar_url} username={second.username} size={56} />
          <div className="lb-username small" title={formatUsername(second.username)}>
            {displayUsername(second.username, 10)}
          </div>
          <div className="lb-amount small">{formatAmount(second.total_spent)} {unit}</div>
          <div className="block base base-2">2</div>
        </div>
      )}

      {first && (
        <div className="step step-1">
          <div ref={a1Ref} className="lb-tgs lb-tgs-big" />
          <Avatar src={first.avatar_url} username={first.username} size={72} />
          <div className="lb-username" title={formatUsername(first.username)}>
            {displayUsername(first.username, 10)}
          </div>
          <div className="lb-amount">{formatAmount(first.total_spent)} {unit}</div>
          <div className="block base base-1">1</div>
        </div>
      )}

      {third && (
        <div className="step step-3">
          <div ref={a3Ref} className="lb-tgs" />
          <Avatar src={third.avatar_url} username={third.username} size={56} />
          <div className="lb-username small" title={formatUsername(third.username)}>
            {displayUsername(third.username, 10)}
          </div>
          <div className="lb-amount small">{formatAmount(third.total_spent)} {unit}</div>
          <div className="block base base-3">3</div>
        </div>
      )}
    </div>
  );
}

function Row({ row, highlight, unit }) {
  return (
    <div className={`lb-row ${highlight ? 'me' : ''}`}>
      <div className="lb-col-rank">#{row.rank}</div>
      <div className="lb-col-user">
        <Avatar src={row.avatar_url} username={row.username} size={36} />
        <span className="lb-username" title={formatUsername(row.username)}>
          {displayUsername(row.username, 10)}
        </span>
      </div>
      <div className="lb-col-amount">
        <span className="lb-amount">{formatAmount(row.total_spent)}</span>
        <span className="lb-star">{unit}</span>
      </div>
    </div>
  );
}

function Avatar({ src, username, size = 40 }) {
  const fallback = (
    <div className="lb-avatar-fallback" style={{ width: size, height: size, lineHeight: `${size}px` }}>
      {(username || '?').slice(0, 1).toUpperCase()}
    </div>
  );
  if (!src) return fallback;
  return (
    <img
      className="lb-avatar"
      src={src}
      alt={username || 'avatar'}
      style={{ width: size, height: size }}
      onError={(e) => e.currentTarget.replaceWith(fallback)}
    />
  );
}

function ListSkeleton() {
  return (
    <div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="lb-row skeleton">
          <div className="lb-col-rank sk" />
          <div className="lb-col-user">
            <div className="lb-avatar-fallback sk" style={{ width: 36, height: 36, lineHeight: '36px' }} />
            <div className="sk sk-text" />
          </div>
          <div className="lb-col-amount">
            <div className="sk sk-text short" />
          </div>
        </div>
      ))}
    </div>
  );
}

function formatAmount(v) {
  if (v == null) return '0';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}
function formatUsername(u) {
  if (!u) return '@unknown';
  return u.startsWith('@') ? u : `@${u}`;
}
function displayUsername(u, max = 10) {
  const at = formatUsername(u || '');
  if (at.length <= max) return at;
  return at.slice(0, Math.max(0, max - 1)) + '…';
}
