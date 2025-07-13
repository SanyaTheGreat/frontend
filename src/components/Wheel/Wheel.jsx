import React, { useEffect, useRef, useState } from 'react';
import './Wheel.css';

function Wheel({ participants = [], wheelSize = 0, winnerUsername, spinDuration = 18000, onFinish }) {
  const wheelRef = useRef(null);
  const [isSpinning, setIsSpinning] = useState(false);

  // Угол сектора (360 / wheelSize)
  const sectorAngle = wheelSize ? 360 / wheelSize : 0;

  // Цвета секторов (пример)
  const colors = [
    '#1D1AB2', '#323086', '#0B0974', '#514ED9', '#7573D9', 
    '#4711AE', '#482A83', '#2A0671', '#7746D7', '#906CD7', 
    '#0F4DA8', '#284B7E', '#052F6D', '#437DD4', '#6A94D4'
  ];

  // Генерация SVG path для сектора
  const createSectorPath = (index) => {
    const radius = 150; // половина ширины/высоты SVG (300x300)
    const startAngle = sectorAngle * index;
    const endAngle = startAngle + sectorAngle;

    // Перевод градусов в радианы
    const startRad = (Math.PI / 180) * startAngle;
    const endRad = (Math.PI / 180) * endAngle;

    // Координаты начала и конца дуги
    const x1 = radius + radius * Math.cos(startRad);
    const y1 = radius + radius * Math.sin(startRad);
    const x2 = radius + radius * Math.cos(endRad);
    const y2 = radius + radius * Math.sin(endRad);

    // Большая ли дуга (если сектор больше 180 градусов)
    const largeArcFlag = sectorAngle > 180 ? 1 : 0;

    // Формируем путь
    return `M ${radius} ${radius} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
  };

  // Автостарт анимации
  const spinWheel = () => {
    if (isSpinning || wheelSize === 0 || !winnerUsername) return;

    setIsSpinning(true);

    // Индекс победителя
    const winnerIndex = participants.findIndex(p => p.username === winnerUsername);
    if (winnerIndex === -1) {
      console.warn('Winner not found');
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
    if (winnerUsername && !isSpinning) spinWheel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winnerUsername, wheelSize]);

  return (
    <div className="wheel-container">
      <div className="arrow-indicator" />
      <svg
        className="wheel"
        width="300"
        height="300"
        viewBox="0 0 300 300"
        ref={wheelRef}
      >
        {Array.from({ length: wheelSize }).map((_, i) => {
          const participant = participants[i] || { username: 'open' };
          const isWinner = participant.username === winnerUsername;
          const fillColor = colors[i % colors.length];

          // Позиция текста - средний угол сектора
          const midAngle = sectorAngle * i + sectorAngle / 2;
          const textRadius = 100; // радиус для текста
          const textRad = (Math.PI / 180) * midAngle;
          const textX = 150 + textRadius * Math.cos(textRad);
          const textY = 150 + textRadius * Math.sin(textRad);

          return (
            <g key={i}>
              <path
                d={createSectorPath(i)}
                fill={fillColor}
                stroke="#22334f"
                strokeWidth="1"
                className={isWinner ? 'winner' : ''}
              />
              <text
                x={textX}
                y={textY}
                fill={isWinner ? '#fff' : '#e0e1dd'}
                fontWeight={isWinner ? 'bold' : '600'}
                fontSize="14"
                textAnchor="middle"
                dominantBaseline="middle"
                pointerEvents="none"
                style={{ userSelect: 'none' }}
              >
                {participant.username === 'open' ? 'open' : `@${participant.username}`}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default Wheel;
