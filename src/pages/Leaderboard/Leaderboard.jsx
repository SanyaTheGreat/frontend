import { useEffect, useMemo, useRef, useState } from 'react';
import lottie from 'lottie-web';
import './Leaderboard.css';

const API_BASE = 'https://lottery-server-waif.onrender.com';

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
  const telegramId = useMemo(() => {
    const tg = window?.Telegram?.WebApp;
    return tg?.initDataUnsafe?.user?.id ?? null;
  }, []);

  const [top3, setTop3]   = useState([]);
  const [list, setList]   = useState([]);
  const [me, setMe]       = useState(null);
  const [total, setTotal] = useState(0);
  const [prizes, setPrizes] = useState([]);
  const [endAt, setEndAt] = useState(null);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // Lottie refs для призов 1/2/3
  const a1Ref = useRef(null);
  const a2Ref = useRef(null);
  const a3Ref = useRef(null);

  // Загрузка данных
  useEffect(() => {
    async function load() {
      try {
        setErr(null);
        setLoading(true);

        const url = new URL(`${API_BASE}/users/leaderboard`);
        if (telegramId) url.searchParams.set('telegram_id', telegramId);
        url.searchParams.set('limit', '10');
        url.searchParams.set('offset', '0');

        const res = await fetch(url.toString());
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
  }, [telegramId]);

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
    <div className="lb-wrapper">
      <div className="lb-header">
        <div className="lb-title">ТАБЛИЦА ЛИДЕРОВ</div>
        {!!countdown && <div className="lb-badge">{countdown}</div>}
      </div>

      <TopThree items={top3} a1Ref={a1Ref} a2Ref={a2Ref} a3Ref={a3Ref} />

      <div className="lb-me-card">
        <div className="lb-me-left">
          <div className="lb-me-rank">{me?.rank ?? '—'}</div>
          <div className="lb-me-label">Вы</div>
        </div>
        <div className="lb-me-center">
          <Avatar src={me?.avatar_url} username={me?.username} size={40} />
          <div className="lb-username">{formatUsername(me?.username)}</div>
        </div>
        <div className="lb-me-right">
          <div className="lb-amount">{formatAmount(me?.total_spent)}</div>
          <div className="lb-amount-sub">💎</div>
        </div>
      </div>

      <div className="lb-list">
        {loading ? (
          <ListSkeleton />
        ) : err ? (
          <div className="lb-error">{err}</div>
        ) : (
          list.slice(0, 10).map(row => (
            <Row key={`${row.user_id}-${row.rank}`} row={row} highlight={row.telegram_id === telegramId} />
          ))
        )}
      </div>
    </div>
  );
}

function TopThree({ items, a1Ref, a2Ref, a3Ref }) {
  if (!items || items.length === 0) return null;
  const first = items[0], second = items[1], third = items[2];

  // Пьедестал, без карточных контейнеров
  return (
    <div className="lb-podium-wrap">
      {second && (
        <div className="step step-2">
          <div ref={a2Ref} className="lb-tgs" />
          <Avatar src={second.avatar_url} username={second.username} size={56} />
          <div className="lb-username small">{formatUsername(second.username)}</div>
          <div className="lb-amount small">{formatAmount(second.total_spent)} ⭐</div>
          <div className="block base base-2">2</div>
        </div>
      )}

      {first && (
        <div className="step step-1">
          <div ref={a1Ref} className="lb-tgs lb-tgs-big" />
          <Avatar src={first.avatar_url} username={first.username} size={72} />
          <div className="lb-username">{formatUsername(first.username)}</div>
          <div className="lb-amount">{formatAmount(first.total_spent)} ⭐</div>
          <div className="block base base-1">1</div>
        </div>
      )}

      {third && (
        <div className="step step-3">
          <div ref={a3Ref} className="lb-tgs" />
          <Avatar src={third.avatar_url} username={third.username} size={56} />
          <div className="lb-username small">{formatUsername(third.username)}</div>
          <div className="lb-amount small">{formatAmount(third.total_spent)} ⭐</div>
          <div className="block base base-3">3</div>
        </div>
      )}
    </div>
  );
}

function Row({ row, highlight }) {
  return (
    <div className={`lb-row ${highlight ? 'me' : ''}`}>
      <div className="lb-col-rank">#{row.rank}</div>
      <div className="lb-col-user">
        <Avatar src={row.avatar_url} username={row.username} size={36} />
        <span className="lb-username">{formatUsername(row.username)}</span>
      </div>
      <div className="lb-col-amount">
        <span className="lb-amount">{formatAmount(row.total_spent)}</span>
        <span className="lb-star">⭐</span>
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
