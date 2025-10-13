import React from "react";

export default function SpinControls({
  allowStars,
  priceTon,
  priceStars,
  balanceStars,     // пробрасываются как раньше (не используем здесь)
  balanceTickets,   // пробрасываются как раньше (не используем здесь)
  spinning,
  onSpin,
  freeAvailable = false,
  onSpinFree,
}) {
  // единый обработчик основной кнопки
  const handlePrimary = () => {
    if (spinning) return;
    if (freeAvailable && onSpinFree) return onSpinFree(); // фриспин
    return onSpin(); // обычный спин
  };

  // подпись на кнопке
  const primaryLabel = (() => {
    if (spinning) return "Крутим...";
    if (freeAvailable) return "Крутить бесплатно 🎁";
    return allowStars
      ? `Крутить за ${Math.ceil(priceStars)} ⭐`
      : `Крутить за ${priceTon} TON`;
  })();

  return (
    <div className="spin-action">
      <button
        className="spin-button"
        onClick={handlePrimary}
        disabled={spinning}
        aria-label="spin"
      >
        {primaryLabel}
      </button>
    </div>
  );
}