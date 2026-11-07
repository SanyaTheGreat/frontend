import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function HomeBackButton({ beforeNavigate, disabled = false }) {
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);

  async function goHome() {
    if (disabled || leaving) return;
    setLeaving(true);
    try {
      if (beforeNavigate && await beforeNavigate() === false) return;
      navigate('/');
    } finally {
      setLeaving(false);
    }
  }

  return (
    <button
      type="button"
      aria-label={"\u041d\u0430 \u0433\u043b\u0430\u0432\u043d\u0443\u044e"}
      onClick={goHome}
      disabled={disabled || leaving}
      style={{
        padding: '12px 14px', borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.2)',
        background: 'rgba(0,0,0,0.2)', color: 'white', fontWeight: 800,
        cursor: disabled || leaving ? 'not-allowed' : 'pointer',
        opacity: disabled || leaving ? 0.7 : 1, marginBottom: 16,
      }}
    >
      {leaving ? '\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u043c...' : '\u2190 \u041d\u0430 \u0433\u043b\u0430\u0432\u043d\u0443\u044e'}
    </button>
  );
}
