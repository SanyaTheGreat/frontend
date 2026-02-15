import { Routes, Route, Navigate } from 'react-router-dom';
import { useTelegramRegistration } from './hooks/useTelegramRegistration';
import Home from './pages/Home/Home';
import History from './pages/History/History';
import LobbyPage from './pages/Lobby/LobbyPage';
import WheelPage from './pages/WheelPage/WheelPage';
import Profile from './pages/Profile/Profile';
import InGame from './pages/InGame/InGame.jsx';
import Leaderboard from './pages/Leaderboard/Leaderboard';
import SpinPage from "./components/Spins/SpinPage";
import InventoryPage from "./components/Spins/InventoryPage";
import { TonConnectUIProvider } from '@tonconnect/ui-react';

import Slots from './pages/slot/Slots';
import SlotPlay from './pages/slot/SlotPlay';

import { Buffer } from 'buffer';
window.Buffer = window.Buffer || Buffer;

const LUDO_ENABLED = import.meta.env.VITE_LUDO_ENABLED === "true";

function App() {
  useTelegramRegistration();

  // Когда лудо выключено — все лудо-роуты уводим на главную,
  // а Home сам покажет "игровой режим / скоро 2048"
  const fallbackRoute = "/";

  const Gate = ({ children }) => {
    if (LUDO_ENABLED) return children;
    return <Navigate to={fallbackRoute} replace />;
  };

  return (
    <TonConnectUIProvider manifestUrl="https://frontend-nine-sigma-49.vercel.app/tonconnect-manifest.json">
      <div>
        <Routes>
          {/* Главная всегда доступна */}
          <Route path="/" element={<Home />} />

          {/* Лудо-роуты — закрыты, если флаг выключен */}
          <Route path="/lobby/:id" element={<Gate><LobbyPage /></Gate>} />
          <Route path="/wheel/:id" element={<Gate><WheelPage /></Gate>} />
          <Route path="/history" element={<Gate><History /></Gate>} />
          <Route path="/ingame" element={<Gate><InGame /></Gate>} />
          <Route path="/leaderboard" element={<Gate><Leaderboard /></Gate>} />
          <Route path="/spins" element={<Gate><SpinPage /></Gate>} />
          <Route path="/inventory" element={<Gate><InventoryPage /></Gate>} />
          <Route path="/slots" element={<Gate><Slots /></Gate>} />
          <Route path="/slots/:id" element={<Gate><SlotPlay /></Gate>} />
          <Route path="/slot/:id" element={<Gate><SlotPlay /></Gate>} />

          {/* Профиль — всегда доступен */}
          <Route path="/profile" element={<Profile />} />

          {/* Всё остальное */}
          <Route path="*" element={<Navigate to={fallbackRoute} replace />} />
        </Routes>
      </div>
    </TonConnectUIProvider>
  );
}

export default App;
