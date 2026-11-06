import { Link } from 'react-router-dom';
export default function Home2048() {
  return <main style={{ minHeight: '100dvh', background: '#070712', color: 'white', display: 'grid', placeContent: 'center', gap: 24, padding: 24, textAlign: 'center' }}>
    <h1>FIGHT FOR GIFT</h1><h2>2048</h2>
    <Link to="/2048">{'\u0418\u0433\u0440\u0430\u0442\u044c'}</Link>
    <Link to="/2048-leaderboard">{'\u0422\u0430\u0431\u043b\u0438\u0446\u0430 \u043b\u0438\u0434\u0435\u0440\u043e\u0432'}</Link>
    <Link to="/2048-rules">{'\u041f\u0440\u0430\u0432\u0438\u043b\u0430'}</Link>
    <Link to="/profile">{'\u041f\u0440\u043e\u0444\u0438\u043b\u044c'}</Link>
  </main>;
}
