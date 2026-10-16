import React from "react";
import styles from "./dashboard.module.css";
// import "chart.js/auto";

interface CardItem {
  title: string;
  count: number | string;
  color: string;
}

const cardData: CardItem[] = [
  { title: "Pages", count: 150, color: styles.lightBlue },
  { title: "Tenders", count: "53%", color: styles.green },
  { title: "News", count: 44, color: styles.yellow },
];

const Dashboard: React.FC = () => {
  return (
    <div className={styles.dashboardContainer}>
      <h2 className={styles.dashboardTitle}>Dashboard</h2>
      <div className={styles.cardGrid}>
        {cardData.map((card, index) => (
          <div key={index} className={`${styles.card} ${card.color}`}>
            <div className={styles.cardContent}>
              <div className={styles.cardInfo}>
                <h3 className={styles.cardCount}>{card.count}</h3>
                <p className={styles.cardTitle}>{card.title}</p>
              </div>
            </div>
            <div className={styles.cardFooter}>
              <button className={styles.moreInfo}>More info</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;
