import { useEffect, useState } from 'react';
import { API_BASE, DEV_AUTH } from '../apiBase';

export function useTelegramRegistration() {
  const [authOk, setAuthOk] = useState(false);

  useEffect(() => {
    let timer;

    // 🔧 DEV: вне Telegram получаем JWT через /auth/dev (VITE_DEV_AUTH=true)
    if (DEV_AUTH) {
      fetch(`${API_BASE}/auth/dev`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.ok && data?.token) {
            localStorage.setItem('jwt', data.token);
            setAuthOk(true);
            console.warn('🔧 DEV AUTH: токен получен через /auth/dev');
          } else {
            console.error('❌ /auth/dev ошибка:', data);
            setAuthOk(false);
          }
        })
        .catch((err) => {
          console.error('❌ Сеть /auth/dev:', err);
          setAuthOk(false);
        });
      return; // в dev-режиме Telegram-флоу не нужен
    }

    const boot = () => {
      timer = setInterval(() => {
        const tg = window?.Telegram?.WebApp;
        if (!tg) return;
        clearInterval(timer);

        tg.ready?.();
        tg.expand?.();

        const initData = tg.initData || '';
        if (!initData) {
          console.warn('⚠️ initData пуст — открой Mini App внутри Telegram');
          setAuthOk(false);
          return;
        }

        // 1) Реферал: сначала из start_param, потом из URL ?ref=
        const startParam = tg.initDataUnsafe?.start_param || '';
        // ожидаем либо "ref_123456789", либо "123456789"
        let refFromStart = null;
        if (startParam) {
          const m = String(startParam).match(/^(?:ref[_-])?(\d{5,})$/);
          if (m) refFromStart = m[1];
        }
        const urlParams = new URLSearchParams(window.location.search);
        let refFromUrl = urlParams.get('ref') || '';
        if (refFromUrl) refFromUrl = String(refFromUrl).replace(/^@+/, ''); // убираем @ у username, если вдруг есть
        const ref = refFromStart || refFromUrl || '';

        // 2) Авторизация через /auth/telegram (реф прокидываем как есть)
        fetch(`${API_BASE}/auth/telegram${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData }),
        })
          .then(res => res.json())
          .then(async (data) => {
            if (data?.ok && data?.token) {
              localStorage.setItem('jwt', data.token);
              setAuthOk(true);
              console.log('✅ Авторизация прошла, токен получен');

              // 3) Одноразовый вызов /users/register для фиксации реферала на сервере
              const alreadyRegistered = localStorage.getItem('user_registered_once') === '1';
              if (!alreadyRegistered) {
                try {
                  const qs = ref ? `?ref=${encodeURIComponent(ref)}` : '';
                  const r = await fetch(`${API_BASE}/users/register${qs}`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${data.token}`,
                    },
                    body: JSON.stringify({}),
                  });
                  if (r.status === 200 || r.status === 201) {
                    localStorage.setItem('user_registered_once', '1');
                    console.log('🧾 /users/register выполнен', r.status);
                  } else {
                    const err = await r.json().catch(() => ({}));
                    console.error('❌ /users/register ошибка:', r.status, err);
                  }
                } catch (e) {
                  console.error('❌ Сеть /users/register:', e);
                }
              }
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
