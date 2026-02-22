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
          maxWidth: 700,
          margin: "0 auto",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 24,
            padding: 28,
            backdropFilter: "blur(10px)",
            boxShadow: "0 0 40px rgba(255,255,255,0.06)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 20,
              fontWeight: 600,
              lineHeight: 1.7,
              letterSpacing: 0.3,
            }}
          >
            <p style={{ marginBottom: 18 }}>
              Объединяй одинаковые подарки свайпами и усиливай своё поле.
            </p>

            <p style={{ marginBottom: 18 }}>
              Набери максимальный счёт и закрепись в недельном ТОПе.
            </p>

            <p style={{ marginBottom: 18 }}>
              Каждую неделю лучшие игроки получают призы.
            </p>

            <p style={{ marginBottom: 18 }}>
              Ежедневно доступно 3 попытки + 1 за вход в приложение.
            </p>

            <p style={{ marginBottom: 18 }}>
              Дополнительные попытки начисляются за приглашённых друзей
              <br />
              <span style={{ opacity: 0.8 }}>
                (до 10 использований в день)
              </span>
            </p>

            <p
              style={{
                marginTop: 26,
                fontWeight: 700,
                fontSize: 22,
                textShadow: "0 0 12px rgba(255,255,255,0.35)",
              }}
            >
              Время лутать подарки интеллектом.
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate(-1)}
          style={{
            marginTop: 30,
            width: "100%",
            padding: 16,
            borderRadius: 18,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.08)",
            color: "#fff",
            fontWeight: 800,
            fontSize: 16,
            cursor: "pointer",
            backdropFilter: "blur(6px)",
            transition: "all 0.2s ease",
          }}
        >
          Назад
        </button>
      </div>
    </>
  );
}