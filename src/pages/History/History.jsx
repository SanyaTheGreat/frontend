import React, { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";  // подключение к Supabase
import "./History.css";

const History = () => {
  const [history, setHistory] = useState([]);  // состояние для хранения истории розыгрышей

  useEffect(() => {
    // Функция для загрузки данных о завершенных розыгрышах
    const fetchHistory = async () => {
      try {
        // Загружаем завершенные розыгрыши из таблицы wheel_results
        const { data: results, error: resultsError } = await supabase
          .from("wheel_results")
          .select("nft_name, username, wheel_id, completed_at")
          .order("completed_at", { ascending: false }); // сортировка по дате (новые выше)

        if (resultsError) throw resultsError;

        // Загружаем информацию о цене и участниках из таблицы wheels
        const resultsWithDetails = await Promise.all(
          results.map(async (result) => {
            const { data: wheel, error: wheelError } = await supabase
              .from("wheels")
              .select("price, size")
              .eq("id", result.wheel_id) // получаем данные для текущего розыгрыша
              .single(); // получаем один результат

            if (wheelError) throw wheelError;

            return {
              ...result,
              price: wheel.price,
              size: wheel.size,
            };
          })
        );

        setHistory(resultsWithDetails);  // сохраняем данные в состояние
      } catch (err) {
        console.error("Ошибка загрузки данных:", err.message);
      }
    };

    fetchHistory();
  }, []);  // Загружаем данные один раз при монтировании компонента

  return (
    <div className="history-wrapper">
      <h1>Wall of Winners</h1>
      <div className="history-list">
        {history.map((item, index) => (
          <div key={index} className="history-item">
            <div className="history-title">{item.nft_name}</div>
            <div className="history-details">
              <span className="winner">Winner: {item.username}</span>
              <span className="price">Price: {item.price} ticket</span>
              <span className="size">Participants: {item.size}</span>
              <span className="date">
                Date: {new Date(item.completed_at).toLocaleString()}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default History;
