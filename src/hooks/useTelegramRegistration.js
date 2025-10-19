import { useEffect, useState } from 'react';

export function useTelegramRegistration() {
  const [authOk, setAuthOk] = useState(false);

  // опционально: сохраним рефку, если передали в URL — пригодится позже
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('referrer');
    if (ref) localStorage.setItem('referrer_id', ref);
  }, []);

  useEffect(() => {
    let timer;
    const boot = () => {
      timer = setInterval(() => {
        const tg = window?.Telegram?.WebApp;
        if (!tg) return; // ждём инициализацию Telegram WebApp
        clearInterval(timer);

        tg.ready?.();
        tg.expand?.();

        const initData = tg.initData || '';
        if (!initData) {
          console.warn('⚠️ initData пуст — открой Mini App внутри Telegram');
          setAuthOk(false);
          return;
        }

        // НОВОЕ: обмениваем initData на JWT
        fetch('https://lottery-server-waif.onrender.com/auth/telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData }),
        })
          .then(res => res.json())
          .then(data => {
            if (data?.ok && data?.token) {
              localStorage.setItem('jwt', data.token);
              setAuthOk(true);
              console.log('✅ Авторизация прошла, токен получен');
            } else {
              console.error('❌ /auth/telegram ошибка:', data);
              setAuthOk(false);
            }
          })
          .catch(err => {
            console.error('❌ Сеть /auth/telegram:', err);
            setAuthOk(false);
          });
      }, 300);
    };

    boot();
    return () => clearInterval(timer);
  }, []);

  return { authOk };
}
