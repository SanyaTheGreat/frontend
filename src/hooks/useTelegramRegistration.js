import { useEffect } from 'react';

export function useTelegramRegistration() {
  useEffect(() => {
    console.log('[register] Хук useTelegramRegistration сработал');

    const tg = window.Telegram?.WebApp;
    console.log('[register] Telegram.WebApp:', tg);

    const user = tg?.initDataUnsafe?.user;
    console.log('[register] initDataUnsafe.user:', user);

    if (!user) {
      console.warn('[register] ❌ Telegram user data not found');
      return;
    }

    const payload = {
      telegram_id: user.id,
      username: user.username || '',
    };

    console.log('[register] 📤 Отправка данных:', payload);

    fetch('https://lottery-server-waif.onrender.com/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
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
