import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { useTelegramRegistration } from './hooks/useTelegramRegistration';
import Home from './pages/Home/Home';
import History from './pages/History/History';
import LobbyPage from './pages/Lobby/LobbyPage';
import WheelPage from './pages/WheelPage/WheelPage';
import Profile from './pages/Profile/Profile';
import InGame from './pages/InGame/InGame.jsx';
import Leaderboard from './pages/Leaderboard/Leaderboard';
import SpinPage from "./components/Spins/SpinPage"


import TabBar from './components/TabBar';
import { TonConnectUIProvider } from '@tonconnect/ui-react';

// Импортируем Buffer полифилл и назначаем в глобальный объект
import { Buffer } from 'buffer';
window.Buffer = window.Buffer || Buffer;

function App() {
  useTelegramRegistration();

  return (
    <TonConnectUIProvider manifestUrl="https://frontend-nine-sigma-49.vercel.app/tonconnect-manifest.json">
      <div>
        <TabBar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/lobby/:id" element={<LobbyPage />} />
          <Route path="/wheel/:id" element={<WheelPage />} />
          <Route path="/history" element={<History />} />
          <Route path="/ingame" element={<InGame />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/spins" element={<SpinPage />} />
        </Routes>
      </div>
    </TonConnectUIProvider>
  );
}



export default App;
