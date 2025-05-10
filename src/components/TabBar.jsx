import { Link } from 'react-router-dom';
import './TabBar.css'; // Здесь будут стили для таббара

const TabBar = () => {
  return (
    <div className="tab-bar">
      <Link to="/" className="tab-link">Home</Link>
      <Link to="/history" className="tab-link">History</Link>
      <Link to="/ingame" className="tab-link">In Game</Link>
      <Link to="/profile" className="tab-link">Profile</Link>
    </div>
  );
};

export default TabBar;
