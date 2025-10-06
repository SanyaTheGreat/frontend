import { useEffect, useMemo, useRef, useState } from 'react';
import lottie from 'lottie-web';
import './Leaderboard.css';

const API_BASE = 'https://lottery-server-waif.onrender.com';

export default function Leaderboard() {
  // Telegram ID: из WebApp, как на остальных страницах
  const telegramId = useMemo(() => {
    const tg = window?.Telegram?.WebApp;
    return tg?.initDataUnsafe?.user?.id ?? null;
  }, []);

  // Данные
  const [top3, setTop3] = useState([]);
  const [list, setList] = useState([]);
  const [me, setMe] = useState(null);
  const [total, setTotal] = useState(0);
  const [prizes, setPrizes] = useState([]);

  // Служебные
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // Рефы под Lottie-анимации призов 1/2/3 (как в Lobby)
  const a1Ref = useRef(null);
  const a2Ref = useRef(null);
  const a3Ref = useRef(null);

  // 1) Загружаем данные лидерборда + призы из gifts_for_cases (spender_place)
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
      } catch (e) {
        console.error(e);
        setErr('Не удалось загрузить лидерборд');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [telegramId]);

  // Мапа место → slug (или nft_name) для подстановки файла анимации
  const slugByPlace = useMemo(() => {
    const m = {};
    (prizes || []).forEach(p => {
      m[p.place] = p.slug || p.nft_name; // что есть — то и используем
    });
    return m;
  }, [prizes]);

  // 2) Грузим Lottie-анимации (прозрачный фон — просто не задаём background)
  useEffect(() => {
    const anims = [];
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
        anims.push(inst);
      } catch (e) {
        console.warn('Lottie load error:', slug, e);
      }
    };
    loadAnim(slugByPlace[1], a1Ref);
    loadAnim(slugByPlace[2], a2Ref);
    loadAnim(slugByPlace[3], a3Ref);

    return () => anims.forEach(a => a?.destroy());
  }, [slugByPlace]);

  return (
    <div className="lb-wrapper">
      <div className="lb-header">
        <div className="lb-title">ТАБЛИЦА ЛИДЕРОВ</div>
        {/* под бейдж — место или период, если захочешь */}
      </div>

      {/* TOP-3 c анимациями подарков */}
      <TopThree items={top3} a1Ref={a1Ref} a2Ref={a2Ref} a3Ref={a3Ref} />

      {/* ВАШЕ МЕСТО */}
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
          <div className="lb-amount-sub">⭐</div>
        </div>
      </div>

      {/* Список (топ-10 по убыванию) */}
      <div className="lb-list">
        {loading ? (
          <ListSkeleton />
        ) : err ? (
          <div className="lb-error">{err}</div>
        ) : (
          list.slice(0, 10).map((row) => (
            <Row
              key={`${row.user_id}-${row.rank}`}
              row={row}
              highlight={row.telegram_id === telegramId}
            />
          ))
        )}
      </div>

      {/* Если нужно — можно вывести total */}
      {/* <div className="lb-total">Всего участников: {total}</div> */}
    </div>
  );
}

function TopThree({ items, a1Ref, a2Ref, a3Ref }) {
  if (!items || items.length === 0) return null;

  // Раскладка: центр — 1 место, слева — 2, справа — 3
  const first = items[0];
  const second = items[1];
  const third = items[2];

  return (
    <div className="lb-top3">
      {/* 2 место */}
      {second && (
        <div className="lb-podium lb-podium-2">
          <div ref={a2Ref} className="lb-tgs" />
          <Avatar src={second.avatar_url} username={second.username} size={56} />
          <div className="lb-username small">{formatUsername(second.username)}</div>
          <div className="lb-amount small">{formatAmount(second.total_spent)} ⭐</div>
        </div>
      )}

      {/* 1 место */}
      {first && (
        <div className="lb-podium lb-podium-1">
          <div ref={a1Ref} className="lb-tgs lb-tgs-big" />
          <Avatar src={first.avatar_url} username={first.username} size={72} />
          <div className="lb-username">{formatUsername(first.username)}</div>
          <div className="lb-amount">{formatAmount(first.total_spent)} ⭐</div>
        </div>
      )}

      {/* 3 место */}
      {third && (
        <div className="lb-podium lb-podium-3">
          <div ref={a3Ref} className="lb-tgs" />
          <Avatar src={third.avatar_url} username={third.username} size={56} />
          <div className="lb-username small">{formatUsername(third.username)}</div>
          <div className="lb-amount small">{formatAmount(third.total_spent)} ⭐</div>
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
    <div
      className="lb-avatar-fallback"
      style={{ width: size, height: size, lineHeight: `${size}px` }}
    >
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
