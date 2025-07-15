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

    // Сравнение username без '@' для корректного поиска победителя
    const winnerIndex = sectors.findIndex(p => {
      const pName = p.username.startsWith('@') ? p.username.slice(1) : p.username;
      const wName = winnerUsername.startsWith('@') ? winnerUsername.slice(1) : winnerUsername;
      return pName === wName;
    });

    if (winnerIndex === -1) {
      console.warn('Winner not found among participants');
      return;
    }

    const spins = 5;

    // Смещение -90 градусов, если участников ровно 2, иначе 0
    const offsetAngle = sectors.length === 2 ? -90 : 0;

    const stopAngle = winnerIndex * sectorAngle + sectorAngle / 2 - offsetAngle;
    const totalRotation = 360 * spins + stopAngle;

    console.log(`Колесо запущено! Победитель: @${winnerUsername}, сектор: ${winnerIndex + 1}, остановится на угле: ${totalRotation}°`);

    setIsSpinning(true);

    if (wheelRef.current) {
      wheelRef.current.style.transition = `transform ${spinDuration}ms cubic-bezier(0.33, 1, 0.68, 1)`;
      wheelRef.current.style.transform = `rotate(${totalRotation}deg)`;

      setTimeout(() => {
        setIsSpinning(false);
        console.log(`Колесо остановилось на угле: ${totalRotation}°, победитель: @${winnerUsername}`);
        if (onFinish) onFinish();
      }, spinDuration);
    }
  };

  // Логи по секторам и пользователям
  useEffect(() => {
    console.log(`Сектора отрисованы, всего секторов: ${sectors.length}`);
    const offsetAngle = sectors.length === 2 ? -90 : 0;
    sectors.forEach((p, i) => {
      const angleStart = i * sectorAngle + offsetAngle;
      const angleEnd = angleStart + sectorAngle;
      console.log(`Сектор ${i + 1} - диапазон: ${angleStart}° - ${angleEnd}°, username: ${p.username}`);
    });
  }, [sectors, sectorAngle]);

  // Автоматический старт анимации при наличии победителя
  useEffect(() => {
    if (winnerUsername && !isSpinning) {
      spinWheel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winnerUsername, sectors.length]);

  return (
    <div style={{ width: 300, height: 300, margin: '0 auto', position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: 5,
          marginTop: -12,
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
          // При отрисовке секторов тоже учитываем смещение для правильного отображения
          const offsetAngle = sectors.length === 2 ? -90 : 0;
          const startAngle = i * sectorAngle + offsetAngle;
          const endAngle = startAngle + sectorAngle;

          const colors = ['#1D1AB2', '#323086', '#0B0974', '#514ED9', '#7573D9'];
          const fillColor = colors[i % colors.length];

          const textAngle = (startAngle + endAngle) / 2;
          const textRadius = radius * 0.65;

          // Координаты текста
          const textX = center + textRadius * Math.cos((textAngle * Math.PI) / 180);
          const textY = center + textRadius * Math.sin((textAngle * Math.PI) / 180);

          // Поворот текста: ровно по центру сектора, без переворота, повернем на (textAngle - 90)
          // чтобы текст шел от центра к краю
          const rotateAngle = textAngle - 1;

          return (
            <g key={i}>
              <path d={describeSector(center, center, radius, startAngle, endAngle)} fill={fillColor} />
              <text
                x={textX}
                y={textY}
                fill="#e0e1dd"
                fontWeight={p.username === winnerUsername ? 'bold' : '600'}
                fontSize={14}
                textAnchor="middle"
                alignmentBaseline="middle"
                style={{ userSelect: 'none', pointerEvents: 'none' }}
                transform={`rotate(${rotateAngle}, ${textX}, ${textY})`}
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
