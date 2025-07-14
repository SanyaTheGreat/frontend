import React, { useEffect, useRef, useState } from 'react';
import './Wheel.css';

function Wheel({ participants = [], wheelSize = 0, winnerUsername, spinDuration = 18000, onFinish }) {
  const wheelRef = useRef(null);
  const [isSpinning, setIsSpinning] = useState(false);

  const sectorAngle = wheelSize ? 360 / wheelSize : 0;
  const radius = 140; // радиус круга для текста

  const sectors = Array.from({ length: wheelSize }, (_, i) => participants[i] || { username: 'open' });

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
  }, [winnerUsername, sectors.length]);

  // Функция для вычисления позиции текста по центру сектора
  function getTextPosition(i) {
    const angle = (sectorAngle * i + sectorAngle / 2) * (Math.PI / 180);
    const x = 150 + radius * Math.cos(angle); // 150 - центр svg
    const y = 150 + radius * Math.sin(angle);
    return { x, y, angleDeg: sectorAngle * i + sectorAngle / 2 };
  }

  // Цвета секторов из твоей палитры (пример)
  const colors = [
    '#1D1AB2', '#323086', '#0B0974', '#514ED9', '#7573D9', // основной
    '#4711AE', '#482A83', '#2A0671', '#7746D7', '#906CD7', // вторичный A
    '#0F4DA8', '#284B7E', '#052F6D', '#437DD4', '#6A94D4'  // вторичный B
  ];

  return (
    <div className="wheel-container">
      <div className="arrow-indicator" />
      <svg ref={wheelRef} width="300" height="300" viewBox="0 0 300 300" className="wheel" style={{ transformOrigin: 'center center' }}>
        {sectors.map((p, i) => {
          const angleStart = sectorAngle * i;
          const angleEnd = angleStart + sectorAngle;
          const largeArcFlag = sectorAngle > 180 ? 1 : 0;

          const startX = 150 + 150 * Math.cos((Math.PI / 180) * angleStart);
          const startY = 150 + 150 * Math.sin((Math.PI / 180) * angleStart);
          const endX = 150 + 150 * Math.cos((Math.PI / 180) * angleEnd);
          const endY = 150 + 150 * Math.sin((Math.PI / 180) * angleEnd);

          const pathData = `
            M 150 150
            L ${startX} ${startY}
            A 150 150 0 ${largeArcFlag} 1 ${endX} ${endY}
            Z
          `;

          const isPlaceholder = p.username === 'open';
          const isWinner = p.username === winnerUsername;

          const { x, y, angleDeg } = getTextPosition(i);

          return (
            <g key={i}>
              <path d={pathData} fill={colors[i % colors.length]} className={isWinner ? 'winner' : ''} />
              <text
                x={x}
                y={y}
                fill="white"
                fontWeight={isWinner ? 'bold' : '600'}
                fontSize="14"
                textAnchor="middle"
                alignmentBaseline="middle"
                transform={`rotate(${angleDeg}, ${x}, ${y}) rotate(90, ${x}, ${y})`}
                pointerEvents="none"
              >
                {isPlaceholder ? 'open' : `@${p.username}`}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default Wheel;
