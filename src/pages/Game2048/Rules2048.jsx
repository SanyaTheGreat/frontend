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
          padding: 24,
          color: "white",
          maxWidth: 720,
          margin: "0 auto",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        {/* Главная фраза */}
        <div
          style={{
            fontSize: 26,
            fontWeight: 800,
            textAlign: "center",
            marginBottom: 32,
            textShadow: "0 0 18px rgba(255,255,255,0.35)",
            letterSpacing: 0.5,
          }}
        >
          Время лутать подарки интеллектом.
        </div>

        {/* Правила */}
        <div
          style={{
            fontSize: 16,
            fontWeight: 500,
            lineHeight: 1.8,
            textAlign: "center",
            opacity: 0.95,
          }}
        >
          <p style={{ marginBottom: 18 }}>
            1.Объединяй одинаковые подарки свайпами и усиливай своё поле.
          </p>

          <p style={{ marginBottom: 18 }}>
            2.Набери максимальный счёт и закрепись в недельном ТОПе.
          </p>

          <p style={{ marginBottom: 18 }}>
            3.Каждую неделю лучшие игроки получают призы.
          </p>

          <p style={{ marginBottom: 18 }}>
            4.Ежедневно доступно 3 попытки + 1 за вход в приложение.
          </p>
          <p style={{ marginBottom: 18 }}>
            5.Дополнительные попытки начисляются за приглашённых друзей
          </p>
          <p>
            6.Хз, пока не придумал
            <br />
            <span style={{ opacity: 0.75 }}>
              (до 10 использований в день)
            </span>
          </p>
        </div>

        <button
          onClick={() => navigate(-1)}
          style={{
            marginTop: 40,
            width: "100%",
            padding: 16,
            borderRadius: 18,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.06)",
            color: "#fff",
            fontWeight: 800,
            fontSize: 16,
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