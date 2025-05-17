import { useEffect } from 'react';

export function useTelegramRegistration() {
  useEffect(() => {
    console.log('📲 useTelegramRegistration запущен');

    const interval = setInterval(() => {
      const tg = window.Telegram?.WebApp;

      if (!tg) {
        console.warn('⏳ Telegram.WebApp ещё не загружен');
        return;
      }

      clearInterval(interval); // Telegram.WebApp найден
      console.log('✅ Telegram.WebApp найден');

      const user = tg.initDataUnsafe?.user;
      console.log('🧩 initDataUnsafe:', tg.initDataUnsafe);
      console.log('👤 Извлечённый user:', user);

      if (!user || !user.id) {
        console.warn('⚠️ Нет данных пользователя — регистрация невозможна');
        return;
      }

      const payload = {
        telegram_id: user.id,
        username: user.username || '',
      };

      console.log('📦 Отправляю payload:', payload);

      fetch('https://lottery-server-waif.onrender.com/users/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(async (res) => {
          console.log('📬 Ответ от backend:', res.status);
          if (res.status === 201) {
            console.log('✅ Пользователь зарегистрирован');
          } else if (res.status === 409) {
            console.log('ℹ️ Пользователь уже существует');
          } else {
            const err = await res.json();
            console.error('❌ Ошибка регистрации:', err);
          }
        })
        .catch((err) => {
          console.error('❌ Сетевая ошибка при регистрации:', err);
        });

    }, 300); // Проверяем каждые 300 мс

    return () => clearInterval(interval);
  }, []);
}
