import React, { useEffect, useRef, useState } from 'react';
import './Wheel.css';

function Wheel({ participants = [], wheelSize = 0, winnerUsername, spinDuration = 18000, onFinish }) {
  const wheelRef = useRef(null);
  const [isSpinning, setIsSpinning] = useState(false);

  // Угол сектора рассчитываем от максимального размера колеса
  const sectorAngle = wheelSize ? 360 / wheelSize : 0;

  // Формируем массив секторов нужной длины: либо с участниками, либо с заглушками
  const sectors = Array.from({ length: wheelSize }, (_, i) => participants[i] || { username: 'Пусто' });

  // Логируем углы секторов при каждом рендере
  useEffect(() => {
    console.log(`Сектора отрисованы, всего секторов: ${sectors.length}`);
    sectors.forEach((p, i) => {
      const angle = i * sectorAngle;
      console.log(`Сектор ${i + 1} - угол: ${angle}°`);
    });
  }, [sectors, sectorAngle]);

  // Запуск анимации вращения
  const spinWheel = () => {
    if (isSpinning || sectors.length === 0 || !winnerUsername) return;

    setIsSpinning(true);

    const winnerIndex = sectors.findIndex(p => p.username === winnerUsername);
    if (winnerIndex === -1) {
      console.warn('Winner not found among participants');
      setIsSpinning(false);
      return;
    }

    const spins = 5; // Полных оборотов
    const stopAngle = winnerIndex * sectorAngle + sectorAngle / 2;
    const totalRotation = 360 * spins + stopAngle;

    if (wheelRef.current) {
      wheelRef.current.style.transition = `transform ${spinDuration}ms cubic-bezier(0.33, 1, 0.68, 1)`;
      wheelRef.current.style.transform = `rotate(${totalRotation}deg)`;

      setTimeout(() => {
        setIsSpinning(false);
        if (onFinish) onFinish();
      }, spinDuration);
    }
  };

  // Автоматический старт анимации при наличии победителя
  useEffect(() => {
    if (winnerUsername && !isSpinning) {
      spinWheel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winnerUsername, sectors.length]);

  return (
    <div className="wheel-container">
      <div className="arrow-indicator" /> {/* Стрелка */}
      <div className="wheel" ref={wheelRef}>
        {sectors.map((p, i) => {
          const rotation = i * sectorAngle;
          const isWinner = p.username === winnerUsername;
          const isPlaceholder = p.username === 'Пусто';

          return (
            <div
              key={i}
              className={`wheel-sector${isWinner ? ' winner' : ''}${isPlaceholder ? ' placeholder' : ''}`}
              style={{ transform: `rotate(${rotation}deg) skewY(${90 - sectorAngle}deg)` }}
              title={isPlaceholder ? 'Пустой сектор' : p.username}
            >
              <span
                className="sector-label"
                style={{ transform: `skewY(-${90 - sectorAngle}deg) rotate(${sectorAngle / 2}deg)` }}
              >
                {isPlaceholder ? 'Пусто' : `@${p.username}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Wheel;
