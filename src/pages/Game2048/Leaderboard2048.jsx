import { useNavigate } from "react-router-dom";

export default function Leaderboard2048() {
  const navigate = useNavigate();

  return (
    <>
      <div className="starfield" aria-hidden="true" />
      <div style={{ position: "relative", zIndex: 5, padding: 16, color: "white" }}>
        <div style={{ fontWeight: 900, fontSize: 20 }}>Таблица лидеров</div>
        <div style={{ opacity: 0.8, marginTop: 10 }}>
          (заглушка) Тут будет лидерборд.
        </div>

        <button
          onClick={() => navigate(-1)}
          style={{
            marginTop: 16,
            width: "100%",
            padding: 14,
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.06)",
            color: "#fff",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Назад
        </button>
      </div>
    </>
  );
}