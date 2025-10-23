import { NavLink } from "react-router-dom";
import "./TabBar.css";

const Icon = ({ name }) => {
  // все иконки в одном месте; размер управляется через CSS
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "home":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path {...common} d="M3 11.5 12 4l9 7.5" />
          <path {...common} d="M5 10.5V20h14v-9.5" />
          <path {...common} d="M9.5 20v-6h5v6" />
        </svg>
      );
    case "history":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path {...common} d="M3.5 12a8.5 8.5 0 1 0 2.2-5.7" />
          <path {...common} d="M3.5 5.5V9h3.5" />
          <path {...common} d="M12 7v5l3 2" />
        </svg>
      );
    case "spin":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle {...common} cx="12" cy="12" r="8.5" />
          <path {...common} d="M12 3.5v4M12 16.5v4M20.5 12h-4M7.5 12h-4" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
        </svg>
      );
    case "games":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path {...common} d="M7 15H5.5a3.5 3.5 0 0 1 0-7H12" />
          <path {...common} d="M17 15h1.5a3.5 3.5 0 0 0 0-7H12" />
          <path {...common} d="M7 10v2M6 11h2" />
          <circle {...common} cx="17" cy="10.5" r="1" />
          <circle {...common} cx="18.8" cy="12.3" r="1" />
        </svg>
      );
    case "profile":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path {...common} d="M12 12.5a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
          <path {...common} d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
        </svg>
      );
    case "trophy":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path {...common} d="M7 4h10v3a5 5 0 0 1-10 0Z" />
          <path {...common} d="M5 5H3.5a2.5 2.5 0 0 0 2.5 4.5M19 5h1.5A2.5 2.5 0 0 1 18 9.5" />
          <path {...common} d="M9.5 15h5M9 19h6" />
        </svg>
      );
    default:
      return null;
  }
};

const items = [
  { to: "/", label: "Главная", icon: "home" },
  { to: "/history", label: "История", icon: "history" },
  { to: "/slots", label: "Слоты", icon: "spin" },
  { to: "/spins", label: "Ролл", icon: "spin", emph: true },
  { to: "/ingame", label: "В игре", icon: "games" },
  { to: "/profile", label: "Профиль", icon: "profile" },
  { to: "/leaderboard", label: "Топ", icon: "trophy" },
];

const TabBar = () => {
  return (
    <nav className="tab-bar" aria-label="Нижняя навигация">
      {items.map(({ to, label, icon, emph }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `tab-link${isActive ? " is-active" : ""}${emph ? " tab-emph" : ""}`
          }
          aria-label={label}
        >
          <span className="tab-icon">
            <Icon name={icon} />
          </span>
          <span className="tab-label">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
};

export default TabBar;
