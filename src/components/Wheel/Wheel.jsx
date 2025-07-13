import React, { useEffect, useRef, useState } from 'react';
import './Wheel.css';

function Wheel({ participants = [], winnerUsername, spinDuration = 18000, onFinish }) {
  const wheelRef = useRef(null);
  const [isSpinning, setIsSpinning] = useState(false);

  const sectorAngle = participants.length ? 360 / participants.length : 0;

  const spinWheel = () => {
    if (isSpinning || participants.length === 0) return;
    setIsSpinning(true);

    const winnerIndex = participants.findIndex(p => p.username === winnerUsername);
    if (winnerIndex === -1) {
      console.warn('Winner not found among participants');
      setIsSpinning(false);
      return;
    }

    const spins = 5;
    const stopAngle = 360 - winnerIndex * sectorAngle - sectorAngle / 2;
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

  // Автоматический старт анимации можно вызвать извне, например, из WheelPage

  return (
    <div className="wheel-container">
      <div className="wheel" ref={wheelRef}>
        {participants.map((p, i) => {
          const rotation = i * sectorAngle;
          const isWinner = p.username === winnerUsername;
          return (
            <div
              key={i}
              className={`wheel-sector${isWinner ? ' winner' : ''}`}
              style={{ transform: `rotate(${rotation}deg) skewY(-${90 - sectorAngle}deg)` }}
              title={p.username}
            >
              <span
                className="sector-label"
                style={{ transform: `skewY(${90 - sectorAngle}deg) rotate(${sectorAngle / 2}deg)` }}
              >
                @{p.username}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Wheel;
