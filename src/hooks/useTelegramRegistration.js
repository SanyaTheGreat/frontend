import { useEffect } from 'react';

export function useTelegramRegistration() {
  useEffect(() => {
    const tg = window.Telegram?.WebApp;

    if (!tg) {
      console.warn('❌ Telegram WebApp object not found');
      return;
    }

    const user = tg.initDataUnsafe?.user;

    console.log('🌐 tg.initDataUnsafe:', tg.initDataUnsafe);
    console.log('👤 Extracted user:', user);

    if (!user) {
      console.warn('⚠️ Telegram user data is undefined — регистрация невозможна');
      return;
    }

    const payload = {
      telegram_id: user.id,
      username: user.username || '',
    };

    console.log('📦 Sending payload:', payload);

    fetch('https://lottery-server-waif.onrender.com/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        console.log('📬 Received response:', res.status);
        if (res.status === 201) {
          console.log('✅ Пользователь зарегистрирован');
        } else if (res.status === 409) {
          console.log('ℹ️ Пользователь уже существует');
        } else {
          const err = await res.json();
          console.error('❌ Ошибка регистрации:', err);
        }
      })
      .catch(err => {
        console.error('❌ Сетевая ошибка при регистрации:', err);
      });
  }, []);
}
