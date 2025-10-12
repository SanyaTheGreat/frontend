import { Link } from 'react-router-dom';
import './TabBar.css'; // Здесь будут стили для таббара

const TabBar = () => {
  return (
    <div className="tab-bar">
      <Link to="/" className="tab-link">Главная</Link>
      <Link to="/history" className="tab-link">История</Link>
      <Link to="/spins" className="tab-btn">Крутка</Link>
      <Link to="/ingame" className="tab-link">Мои Игры</Link>
      <Link to="/profile" className="tab-link">Профиль</Link>
      <Link to="/leaderboard" className="tab-link">Топ</Link>
      
    </div>
  );
};

export default TabBar;
