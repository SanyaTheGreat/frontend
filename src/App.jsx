import { Routes, Route } from 'react-router-dom';
import { useTelegramRegistration } from './hooks/useTelegramRegistration';
import Home from './pages/Home/Home';
import History from './pages/History/History';
import LobbyPage from './pages/Lobby/LobbyPage';
import Profile from './pages/Profile/Profile';
import TabBar from './components/TabBar';
import { TonConnectUIProvider } from '@tonconnect/ui-react';  

function App() {
  useTelegramRegistration();

  return (
    <TonConnectUIProvider manifestUrl="https://frontend-nine-sigma-49.vercel.app/tonconnect-manifest.json">
      <div>
        <TabBar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/lobby/:id" element={<LobbyPage />} />
          <Route path="/history" element={<History />} />
          <Route path="/ingame" element={<InGame />} />
          <Route path="/profile" element={<Profile />} />
        </Routes>
      </div>
    </TonConnectUIProvider>
  );
}

function InGame() {
  return <h1>В игре</h1>;
}

export default App;
