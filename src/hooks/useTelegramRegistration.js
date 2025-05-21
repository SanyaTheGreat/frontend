import { useEffect } from 'react';

export function useTelegramRegistration() {
  useEffect(() => {
    console.log('📲 useTelegramRegistration: хук активирован');

    const interval = setInterval(() => {
      const tg = window.Telegram?.WebApp;

      if (!tg) {
        console.warn('⏳ [Ожидание] Telegram.WebApp не найден');
        return;
      }

      clearInterval(interval);
      console.log('✅ [Найден] Telegram.WebApp доступен');

      tg.ready();       // ✅ сообщаем Telegram, что WebApp готов
      tg.expand();      // ⬆️ открываем Mini App на весь экран
      tg.show();

      const user = tg.initDataUnsafe?.user;
      console.log('🧩 [initDataUnsafe]:', tg.initDataUnsafe);
      console.log('👤 [User из initDataUnsafe]:', user);

      if (!user || !user.id) {
        console.warn('⚠️ [Ошибка] Нет user.id в initDataUnsafe');
        return;
      }

      const payload = {
        telegram_id: user.id,
        username: user.username || '',
      };

      console.log('📦 [Payload для отправки]:', payload);

      fetch('https://lottery-server-waif.onrender.com/users/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(async (res) => {
          console.log('📬 [Ответ от backend]:', res.status);
          if (res.status === 201) {
            console.log('✅ [Успех] Пользователь зарегистрирован');
          } else if (res.status === 409) {
            console.log('ℹ️ [Инфо] Пользователь уже существует');
          } else {
            const err = await res.json();
            console.error('❌ [Ошибка от backend]:', err);
          }
        })
        .catch((err) => {
          console.error('❌ [Сетевая ошибка]:', err);
        });

    }, 300);

    return () => {
      console.log('🧹 useTelegramRegistration: очистка таймера');
      clearInterval(interval);
    };
  }, []);
}
