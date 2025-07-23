import { useEffect, useState } from 'react';

export function useTelegramRegistration() {
  const [referrerId, setReferrerId] = useState(null);

  useEffect(() => {
    // Получаем referrer_id из URL параметров
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('referrer');
    if (ref) {
      setReferrerId(ref);
      console.log(`🔗 Найден referrer_id в URL: ${ref}`);
    } else {
      console.log('ℹ️ referrer_id не найден в URL');
    }
  }, []);

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

      tg.ready();
      tg.expand();

      const user = tg.initDataUnsafe?.user;
      console.log('🧩 [initDataUnsafe]:', tg.initDataUnsafe);
      console.log('👤 [User из initDataUnsafe]:', user);

      if (!user || !user.id) {
        console.warn('⚠️ [Ошибка] Нет user.id в initDataUnsafe');
        return;
      }

      const avatar_url = user.photo_url || null;
      if (avatar_url) {
        console.log(`🖼️ Найден аватар пользователя: ${avatar_url}`);
      } else {
        console.log('ℹ️ Аватар пользователя отсутствует');
      }

      const payload = {
        telegram_id: user.id,
        username: user.username || '',
        avatar_url,
        ...(referrerId && { referrer_id: referrerId }),  // Добавляем referrer_id, если есть
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
  }, [referrerId]);
}
