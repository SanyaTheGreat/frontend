import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useTelegramRegistration } from './hooks/useTelegramRegistration';
import Home from './pages/Home/Home';
import Home2048 from './pages/Game2048/Home2048';
import Profile2048 from './pages/Profile/Profile2048';
import { LUDO_ENABLED } from './apiBase';
import History from './pages/History/History';
import LobbyPage from './pages/Lobby/LobbyPage';
import WheelPage from './pages/WheelPage/WheelPage';
import Profile from './pages/Profile/Profile';
import InGame from './pages/InGame/InGame.jsx';
import Leaderboard from './pages/Leaderboard/Leaderboard';
import SpinPage from "./components/Spins/SpinPage";
import InventoryPage from "./components/Spins/InventoryPage";
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import Rules2048 from "./pages/Game2048/Rules2048";
import Leaderboard2048 from "./pages/Game2048/Leaderboard2048";

import Slots from './pages/slot/Slots';
import SlotPlay from './pages/slot/SlotPlay';

import Game2048 from './pages/Game2048/Game2048';

import { Buffer } from 'buffer';
window.Buffer = window.Buffer || Buffer;

// Phase 2: режимы Ludo и 2048 больше не взаимоисключают друг друга —
// все маршруты доступны одновременно. Ненужные колёса отключаются в таблицах Supabase.
function App() {
  const { authOk } = useTelegramRegistration();
  const [authTimedOut, setAuthTimedOut] = useState(false);
  useEffect(() => {
    const timeout = setTimeout(() => setAuthTimedOut(true), 25000);
    return () => clearTimeout(timeout);
  }, []);
  if (!authOk) return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeContent: 'center', padding: 24, background: '#101018', color: '#fff', textAlign: 'center' }}>
      <p>{authTimedOut ? "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0432\u043e\u0439\u0442\u0438. \u0417\u0430\u043a\u0440\u043e\u0439 \u0438 \u043e\u0442\u043a\u0440\u043e\u0439 \u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u0447\u0435\u0440\u0435\u0437 \u0431\u043e\u0442\u0430." : "\u0412\u0445\u043e\u0434 \u0447\u0435\u0440\u0435\u0437 Telegram..."}</p>
      {authTimedOut && <button onClick={() => window.location.reload()}>{"\u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u044c"}</button>}
    </div>
  );

  return (
    <TonConnectUIProvider manifestUrl="https://frontend-nine-sigma-49.vercel.app/tonconnect-manifest.json">
      <div>
        <Routes>
          <Route path="/" element={LUDO_ENABLED ? <Home /> : <Home2048 />} />

          {/* 2048 */}
          <Route path="/2048" element={<Game2048 />} />
          <Route path="/2048-rules" element={<Rules2048 />} />
          <Route path="/2048-leaderboard" element={<Leaderboard2048 />} />

          {LUDO_ENABLED && <>
          {/* Ludo / PvP-рулетка / слоты / ролл */}
          <Route path="/lobby/:id" element={<LobbyPage />} />
          <Route path="/wheel/:id" element={<WheelPage />} />
          <Route path="/history" element={<History />} />
          <Route path="/ingame" element={<InGame />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/spins" element={<SpinPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/slots" element={<Slots />} />
          <Route path="/slots/:id" element={<SlotPlay />} />
          <Route path="/slot/:id" element={<SlotPlay />} />

          </>}
          <Route path="/profile" element={LUDO_ENABLED ? <Profile /> : <Profile2048 />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </TonConnectUIProvider>
  );
}

export default App;
