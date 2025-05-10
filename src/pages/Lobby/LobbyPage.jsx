import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import './LobbyPage.css';

function LobbyPage() {
  const { id } = useParams(); // wheel_id из URL
  const [wheel, setWheel] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [participantCount, setParticipantCount] = useState(0);

  useEffect(() => {
    async function fetchLobbyData() {
      // Получаем данные о колесе
      const { data: wheelData, error: wheelError } = await supabase
        .from('wheels')
        .select('id, nft_name, size, price, status')
        .eq('id', id)
        .single();

      if (wheelError || !wheelData) {
        console.error('Ошибка загрузки колеса:', wheelError);
        return;
      }

      setWheel(wheelData);

      // Получаем список участников
      const { data: participantData, error: participantError } = await supabase
        .from('wheel_participants')
        .select('username')
        .eq('wheel_id', id);

      if (participantError) {
        console.error('Ошибка загрузки участников:', participantError);
        return;
      }

      setParticipants(participantData || []);

      // Получаем количество участников
      const { count, error: countError } = await supabase
        .from('wheel_participants')
        .select('*', { count: 'exact', head: true })
        .eq('wheel_id', id);

      if (countError) {
        console.error('Ошибка подсчета участников:', countError);
        return;
      }

      setParticipantCount(count || 0);
    }

    fetchLobbyData();
  }, [id]);

  if (!wheel) return <div>Loading...</div>;

  return (
    <div className="lobby-page">
      
        <h2>{wheel.nft_name}</h2>
        <p>Participants: {participantCount} / {wheel.size}</p>
        <p>Price: {wheel.price} 🎫</p>

        <button
          className="join-buttonLobby"
          disabled={participantCount >= wheel.size}
        >
          Join 
        </button>

        <ul className="participant-list">
          {participants.map((p, index) => (
            <li key={index}>@{p.username}</li>
          ))}
        </ul>
      </div>
    
  );
}

export default LobbyPage;
