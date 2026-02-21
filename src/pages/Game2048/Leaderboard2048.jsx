import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = "https://lottery-server-waif.onrender.com";

function medal(place) {
  if (place === 1) return "🥇";
  if (place === 2) return "🥈";
  if (place === 3) return "🥉";
  return null;
}

export default function Leaderboard2048() {
  const navigate = useNavigate();

  const token = useMemo(() => localStorage.getItem("jwt") || "", []);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [top, setTop] = useState([]);
  const [me, setMe] = useState(null);
  const [period, setPeriod] = useState(null);

  async function load() {
    setLoading(true);
    setErr("");

    try {
      const res = await fetch(`${API_BASE}/game2048/leaderboard/week?limit=50`, {
        method: "GET",
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
        },
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        const msg = json?.error || `HTTP ${res.status}`;
        throw new Error(msg);
      }

      setTop(Array.isArray(json.top) ? json.top : []);
      setMe(json.me ?? null);
      setPeriod(json.period ?? null);
    } catch (e) {
      setErr(e?.message || "Failed to load leaderboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const meInTop = useMemo(() => {
    if (!me?.user_id) return false;
    return top.some((x) => x.user_id === me.user_id);
  }, [top, me]);

  const cardStyle = {
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    padding: 12,
  };

  return (
    <>
      <div className="starfield" aria-hidden="true" />

      <div style={{ position: "relative", zIndex: 5, padding: 16, color: "white" }}>
        <div style={{ fontWeight: 900, fontSize: 20 }}>Таблица лидеров</div>

        <div style={{ opacity: 0.75, marginTop: 6, fontSize: 12 }}>
          Топ недели{period?.end_at ? ` • до ${new Date(period.end_at).toLocaleString()}` : ""}
        </div>

        <div style={{ height: 12 }} />

        {loading && (
          <div style={{ ...cardStyle, opacity: 0.85 }}>
            Загрузка лидерборда...
          </div>
        )}

        {!loading && err && (
          <div style={{ ...cardStyle, border: "1px solid rgba(255,80,80,0.35)" }}>
            <div style={{ fontWeight: 800 }}>Ошибка</div>
            <div style={{ opacity: 0.85, marginTop: 6 }}>{err}</div>

            <button
              onClick={load}
              style={{
                marginTop: 12,
                width: "100%",
                padding: 12,
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(255,255,255,0.06)",
                color: "#fff",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Обновить
            </button>
          </div>
        )}

        {!loading && !err && (
          <>
            {/* TOP */}
            <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
              <div style={{ padding: 12, fontWeight: 900, borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
                ТОП-50
              </div>

              {top.length === 0 ? (
                <div style={{ padding: 12, opacity: 0.8 }}>
                  Пока нет результатов в этой неделе.
                </div>
              ) : (
                <div>
                  {top.map((row) => {
                    const isMe = me?.user_id && row.user_id === me.user_id;
                    const m = medal(row.place);

                    return (
                      <div
                        key={`${row.user_id}-${row.place}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: 12,
                          borderBottom: "1px solid rgba(255,255,255,0.08)",
                          background: isMe ? "rgba(255,255,255,0.10)" : "transparent",
                        }}
                      >
                        <div style={{ width: 44, flexShrink: 0, textAlign: "left" }}>
                          <div style={{ fontWeight: 900, fontSize: 14 }}>
                            {m ? `${m} ${row.place}` : `#${row.place}`}
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                          {row.avatar_url ? (
                            <img
                              src={row.avatar_url}
                              alt=""
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: 999,
                                objectFit: "cover",
                                border: "1px solid rgba(255,255,255,0.18)",
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: 999,
                                background: "rgba(255,255,255,0.10)",
                                border: "1px solid rgba(255,255,255,0.14)",
                              }}
                            />
                          )}

                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: 900,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {row.username ? `@${row.username}` : `User ${row.user_id}`}
                              {isMe ? " (ты)" : ""}
                            </div>
                            <div style={{ opacity: 0.7, fontSize: 12 }}>
                              score: {Number(row.score || 0).toLocaleString()}
                            </div>
                          </div>
                        </div>

                        <div style={{ fontWeight: 900, textAlign: "right" }}>
                          {Number(row.score || 0).toLocaleString()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ height: 12 }} />

            {/* ME (если не в топе) */}
            {me && !meInTop && (
              <div style={cardStyle}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Твоя позиция</div>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 56, fontWeight: 900 }}>
                    #{me.place}
                  </div>

                  {me.avatar_url ? (
                    <img
                      src={me.avatar_url}
                      alt=""
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 999,
                        objectFit: "cover",
                        border: "1px solid rgba(255,255,255,0.18)",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 999,
                        background: "rgba(255,255,255,0.10)",
                        border: "1px solid rgba(255,255,255,0.14)",
                      }}
                    />
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {me.username ? `@${me.username}` : `User ${me.user_id}`}
                    </div>
                    <div style={{ opacity: 0.75, fontSize: 12 }}>
                      score: {Number(me.score || 0).toLocaleString()}
                    </div>
                  </div>

                  <div style={{ fontWeight: 900 }}>
                    {Number(me.score || 0).toLocaleString()}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

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