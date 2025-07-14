import React, { useEffect, useRef, useState } from 'react';

function Wheel({ participants = [], wheelSize = 0, winnerUsername, spinDuration = 18000, onFinish }) {
  const wheelRef = useRef(null);
  const [isSpinning, setIsSpinning] = useState(false);

  const radius = 150; // радиус круга (половина размера SVG)
  const center = radius; // центр по X и Y, тк SVG квадратный 300x300

  // Угол сектора в градусах
  const sectorAngle = wheelSize ? 360 / wheelSize : 0;

  // Массив секторов с участниками или заглушками
  const sectors = Array.from({ length: wheelSize }, (_, i) => participants[i] || { username: 'open' });

  // Функция для генерации пути сектора по углам
  function describeSector(cx, cy, r, startAngle, endAngle) {
    const startRadians = (startAngle * Math.PI) / 180;
    const endRadians = (endAngle * Math.PI) / 180;

    const x1 = cx + r * Math.cos(startRadians);
    const y1 = cy + r * Math.sin(startRadians);
    const x2 = cx + r * Math.cos(endRadians);
    const y2 = cy + r * Math.sin(endRadians);

    const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;

    return `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArcFlag} 1 ${x2},${y2} Z`;
  }

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

  return (
    <div style={{ width: 300, height: 300, margin: '0 auto', position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: 5,
          left: '50%',
          marginLeft: -12,
          width: 0,
          height: 0,
          borderLeft: '12px solid transparent',
          borderRight: '12px solid transparent',
          borderBottom: '20px solid #23a6d5',
          zIndex: 10,
          filter: 'drop-shadow(0 0 5px #23a6d5)',
        }}
      />
      <svg
        width={300}
        height={300}
        viewBox={`0 0 ${radius * 2} ${radius * 2}`}
        ref={wheelRef}
        style={{ borderRadius: '50%', boxShadow: '0 0 20px rgba(65, 90, 119, 0.7)' }}
      >
        {sectors.map((p, i) => {
          const startAngle = i * sectorAngle - 90; // стартуем с верхней точки
          const endAngle = startAngle + sectorAngle;

          const colors = ['#1D1AB2', '#323086', '#0B0974', '#514ED9', '#7573D9'];
          const fillColor = colors[i % colors.length];

          const textAngle = (startAngle + endAngle) / 2;
          const textRadius = radius * 0.65;

          // Для текста делаем трансформацию:
          // Сначала поворачиваем на angle сектора вокруг центра
          // Затем смещаем по радиусу вверх (вдоль оси Y SVG)
          // Затем поворачиваем обратно, чтобы текст был горизонтальным
          return (
            <g key={i}>
              <path d={describeSector(center, center, radius, startAngle, endAngle)} fill={fillColor} />
              <text
                x={center}
                y={center}
                fill="#e0e1dd"
                fontWeight={p.username === winnerUsername ? 'bold' : '600'}
                fontSize={14}
                textAnchor="middle"
                alignmentBaseline="middle"
                style={{ userSelect: 'none', pointerEvents: 'none' }}
                transform={`rotate(${textAngle} ${center} ${center}) translate(0, -${textRadius}) rotate(-${textAngle})`}
              >
                {p.username === 'open' ? 'open' : `@${p.username}`}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default Wheel;
