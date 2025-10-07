import React from "react";
import "./spins.css";


export default function SpinControls({
allowStars,
priceTon,
priceStars,
onSpin,
spinning,
balanceStars,
balanceTickets,
}) {
const priceLabel = allowStars ? `${priceStars} ⭐` : `${priceTon} TON`;
const canAfford = allowStars ? balanceStars >= priceStars : balanceTickets >= priceTon;


return (
<div className="spin-action">
<button className="spin-button" disabled={spinning || !canAfford} onClick={onSpin}>
{spinning ? "Крутим..." : `1 Roll за ${priceLabel}`}
</button>
</div>
);
}