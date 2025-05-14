import { useEffect } from 'react';

export function useTelegramRegistration() {
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    const user = tg?.initDataUnsafe?.user;

    if (!user) {
      console.warn('Telegram user data not found');
      return;
    }

    fetch('https://lottery-server-waif.onrender.com/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegram_id: user.id,
        username: user.username,
        first_name: user.first_name,
      }),
    })
      .then(res => res.json())
      .then(data => {
        console.log('✅ Пользователь зарегистрирован:', data);
      })
      .catch(err => {
        console.error('❌ Ошибка при регистрации пользователя:', err);
      });
  }, []);
}
