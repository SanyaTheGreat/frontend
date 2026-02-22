import { useNavigate } from "react-router-dom";

export default function Rules2048() {
  const navigate = useNavigate();

  return (
    <>
      <div className="starfield" aria-hidden="true" />

      <div
        style={{
          position: "relative",
          zIndex: 5,
          padding: 20,
          color: "white",
          maxWidth: 640,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            fontWeight: 900,
            fontSize: 22,
            marginBottom: 20,
            textAlign: "center",
          }}
        >
          🎮 2048 — FFG Edition
        </div>

        <div style={{ opacity: 0.9, lineHeight: 1.6, textAlign: "center" }}>
          <p>Объединяй одинаковые подарки свайпами и усиливай своё поле.</p>

          <p>Набери максимальный счёт и закрепись в недельном ТОПе.</p>

          <p>Каждую неделю лучшие игроки получают призы.</p>

          <p>Ежедневно доступно 3 попытки + 1 за вход в приложение.</p>

          <p>
            Дополнительные попытки начисляются за приглашённых друзей
            <br />
            (до 10 использований в день).
          </p>

          <p
            style={{
              marginTop: 24,
              fontWeight: 700,
              opacity: 1,
            }}
          >
            Время лутать подарки интеллектом.
          </p>
        </div>

        <button
          onClick={() => navigate(-1)}
          style={{
            marginTop: 32,
            width: "100%",
            padding: 14,
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.06)",
            color: "#fff",
            fontWeight: 800,
            cursor: "pointer",
            backdropFilter: "blur(6px)",
          }}
        >
          Назад
        </button>
      </div>
    </>
  );
}