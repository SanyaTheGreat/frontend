import { Routes, Route } from 'react-router-dom';
import { useTelegramRegistration } from './hooks/useTelegramRegistration';
import Home from './pages/Home/Home';
import History from './pages/History/History';
import LobbyPage from './pages/Lobby/LobbyPage';
import Profile from './pages/Profile/Profile'
import TabBar from './components/TabBar'; // Импортируем TabBar


function App() {
  useTelegramRegistration();
  
  return (
    <div>
      <TabBar /> {/* Добавляем TabBar */}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/lobby/:id" element={<LobbyPage />} />
        <Route path="/history" element={<History />} />
        <Route path="/ingame" element={<InGame />} />
        <Route path="/profile" element={<Profile />} />
      </Routes>
    </div>
  );
}




// В игре
function InGame() {
  return <h1>В игре</h1>;
}


export default App;
