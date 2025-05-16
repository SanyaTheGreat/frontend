import { useEffect } from 'react';

export function useTelegramRegistration() {
  useEffect(() => {
    const tg = window.Telegram?.WebApp;

    alert("📲 useTelegramRegistration запущен");

    if (!tg) {
      alert("❌ Telegram.WebApp не найден");
      return;
    }

    const user = tg.initDataUnsafe?.user;
    const referrer_id = tg.initDataUnsafe?.start_param;

    alert("🔍 Получен user: " + JSON.stringify(user));
    alert("🎯 Получен referrer_id: " + referrer_id);

    if (!user) {
      alert("⚠️ Пользователь не найден — регистрация невозможна");
      return;
    }

    const payload = {
      telegram_id: user.id,
      username: user.username || '',
      referrer_id
    };

    alert("📦 Отправляю payload: " + JSON.stringify(payload));

    fetch('https://lottery-server-waif.onrender.com/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        alert("📬 Ответ от backend: " + res.status);
        if (res.status === 201) {
          alert("✅ Пользователь зарегистрирован");
        } else if (res.status === 409) {
          alert("ℹ️ Пользователь уже существует");
        } else {
          const err = await res.json();
          alert("❌ Ошибка регистрации: " + JSON.stringify(err));
        }
      })
      .catch(err => {
        alert("❌ Сетевая ошибка: " + err.message);
      });
  }, []);
}
