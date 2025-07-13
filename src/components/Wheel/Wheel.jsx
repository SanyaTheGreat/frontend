import React, { useEffect, useRef, useState } from 'react';
import './Wheel.css';

function Wheel({ participants = [], wheelSize = 0, winnerUsername, spinDuration = 18000, onFinish }) {
  const wheelRef = useRef(null);
  const [isSpinning, setIsSpinning] = useState(false);

  const sectorAngle = wheelSize ? 360 / wheelSize : 0;
  const sectors = Array.from({ length: wheelSize }, (_, i) => participants[i] || { username: 'open' });

  // Цвета из палитр для секторов
  const primaryColors = ['#1D1AB2', '#323086', '#0B0974', '#514ED9', '#7573D9'];
  const secondaryColorsA = ['#4711AE', '#482A83', '#2A0671', '#7746D7', '#906CD7'];
  const secondaryColorsB = ['#0F4DA8', '#284B7E', '#052F6D', '#437DD4', '#6A94D4'];

  // Выбор палитры в зависимости от количества секторов
  // Для <=5 секторов — primaryColors, 6-10 — secondaryColorsA, >10 — secondaryColorsB
  let colors;
  if (wheelSize <= 5) {
    colors = primaryColors;
  } else if (wheelSize <= 10) {
    colors = secondaryColorsA;
  } else {
    colors = secondaryColorsB;
  }

  // Функция для выбора цвета с учётом индекса и длины палитры
  const getColor = (index) => colors[index % colors.length];

  useEffect(() => {
    console.log(`Сектора отрисованы, всего секторов: ${sectors.length}`);
    sectors.forEach((p, i) => {
      const angleStart = i * sectorAngle;
      const angleEnd = angleStart + sectorAngle;
      console.log(`Сектор ${i + 1} - диапазон: ${angleStart}° - ${angleEnd}°`);
    });
  }, [sectors, sectorAngle]);

  const spinWheel = () => {
    if (isSpinning || sectors.length === 0 || !winnerUsername) return;

    setIsSpinning(true);

    const winnerIndex = sectors.findIndex(p => p.username === winnerUsername);
    if (winnerIndex === -1) {
      console.warn('Winner not found among participants');
      setIsSpinning(false);
      return;
    }

    const spins = 5;
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

  useEffect(() => {
    if (winnerUsername && !isSpinning) {
      spinWheel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winnerUsername, sectors.length]);

  return (
    <div className="wheel-container">
      <div className="arrow-indicator" />
      <div className="wheel" ref={wheelRef}>
        {sectors.map((p, i) => {
          const rotation = i * sectorAngle;
          const isWinner = p.username === winnerUsername;
          const isPlaceholder = p.username === 'open';

          return (
            <div
              key={i}
              className={`wheel-sector${isWinner ? ' winner' : ''}${isPlaceholder ? ' placeholder' : ''}`}
              style={{
                transform: `rotate(${rotation}deg) skewY(${90 - sectorAngle}deg)`,
                backgroundColor: getColor(i),
              }}
              title={isPlaceholder ? 'Open sector' : p.username}
            >
              <span
                className="sector-label"
                style={{ transform: `skewY(-${90 - sectorAngle}deg) rotate(${sectorAngle / 2}deg)` }}
              >
                {isPlaceholder ? 'open' : `@${p.username}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Wheel;
