import { Link } from 'react-router-dom'; 
import './Home.css';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import lottie from 'lottie-web';

function Home() {
  const [wheels, setWheels] = useState([]);
  const [colorsMap, setColorsMap] = useState({});
  const animRefs = useRef({});

  useEffect(() => {
    async function fetchWheels() {
      const { data, error } = await supabase
        .from('wheels')
        .select('*');

      if (error) {
        console.error('Ошибка загрузки колес:', error);
        return;
      }

      const activeWheels = data.filter(wheel => wheel.status === 'active');

      const wheelsWithParticipants = await Promise.all(
        activeWheels.map(async (wheel) => {
          const { count, error: countError } = await supabase
            .from('wheel_participants')
            .select('*', { count: 'exact', head: true })
            .eq('wheel_id', wheel.id);

          if (countError) {
            console.error('Ошибка подсчета участников:', countError);
            return { ...wheel, participants: 0 };
          }

          return { ...wheel, participants: count };
        })
      );

      setWheels(wheelsWithParticipants);
    }

    fetchWheels();
  }, []);

  useEffect(() => {
    fetch("/animations/colors.json")
      .then((res) => res.json())
      .then((data) => setColorsMap(data))
      .catch((err) => console.error("Ошибка загрузки цветов:", err));
  }, []);

  return (
    <div className="home-wrapper">
      {wheels.length === 0 ? (
        <p style={{ color: 'white', textAlign: 'center', marginTop: '50px' }}>
          Нет активных розыгрышей
        </p>
      ) : (
        wheels.map((wheel) => {
          return (
            <div key={wheel.id} className="wheel-card">
              <div className="wheel-title">{wheel.nft_name}</div>

              <div className="wheel-content">
                <div
                  className="wheel-image"
                  style={{
                    background: colorsMap[wheel.nft_name]
                      ? `linear-gradient(135deg, ${colorsMap[wheel.nft_name].center_color}, ${colorsMap[wheel.nft_name].edge_color})`
                      : '#000',
                    borderRadius: '12px',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    ref={(el) => {
                      if (el && !animRefs.current[wheel.id]) {
                        animRefs.current[wheel.id] = el;
                        (() => {
                          console.log('FETCHING:', `/animations/${wheel.nft_name}.json`);
                          return fetch(`/animations/${wheel.nft_name}.json`);
                        })()
                          .then(res => res.json())
                          .then(data => {
                            lottie.loadAnimation({
                              container: el,
                              renderer: 'svg',
                              loop: true,
                              autoplay: true,
                              animationData: data
                            });
                          });
                      }
                    }}
                    style={{
                      position: 'absolute',
                      width: '100%',
                      height: '100%',
                      top: 0,
                      left: 0,
                    }}
                  ></div>
                </div>

                <div className="wheel-buttons">
                  <button className="lobby-button">Lobby</button>
                  <button className="join-button">JOIN</button>
                </div>
              </div>

              <div className="wheel-info">
                <span>Participants: {wheel.participants}/{wheel.size}</span>
                <span>Price: {wheel.price} ticket</span>
              </div>
            </div>
          );
        })
      )}

      
    </div>
  );
}

export default Home;
