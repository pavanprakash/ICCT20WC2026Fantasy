import React from "react";

const RULES = [
  {
    title: "Important Fantasy Points",
    items: [
      { label: "Wicket (Excluding Run Out)", value: "+30 pts" },
      { label: "Run", value: "+1 pts" },
      { label: "Dot Ball", value: "+1 pts" }
    ]
  },
  {
    title: "Batting",
    items: [
      { label: "Run", value: "+1 pts" },
      { label: "Boundary Bonus", value: "+4 pts" },
      { label: "Six Bonus", value: "+6 pts" },
      { label: "25 Run Bonus", value: "+4 pts" },
      { label: "50 Run Bonus", value: "+8 pts" },
      { label: "75 Run Bonus", value: "+12 pts" },
      { label: "100 Run Bonus", value: "+16 pts" },
      { label: "Dismissal For A Duck", value: "-2 pts" },
      {
        label: "Strike Rate (Except Bowler) Points (Min 10 Balls To Be Played)",
        value: ""
      },
      { label: "Above 170 runs per 100 balls", value: "+6 pts" },
      { label: "Between 150.01 - 170 runs per 100 balls", value: "+4 pts" },
      { label: "Between 130 - 150 runs per 100 balls", value: "+2 pts" },
      { label: "Between 60 - 70 runs per 100 balls", value: "-2 pts" },
      { label: "Between 50 - 59.99 runs per 100 balls", value: "-4 pts" },
      { label: "Below 50 runs per 100 balls", value: "-6 pts" }
    ]
  },
  {
    title: "Bowling",
    items: [
      { label: "Dot Ball", value: "+1 pts" },
      { label: "Wicket (Excluding Run Out)", value: "+30 pts" },
      { label: "Bonus (LBW/Bowled)", value: "+8 pts" },
      { label: "3 Wicket Bonus", value: "+4 pts" },
      { label: "4 Wicket Bonus", value: "+8 pts" },
      { label: "5 Wicket Bonus", value: "+12 pts" },
      { label: "Maiden Over", value: "+12 pts" },
      { label: "Economy Rate Points (Min 2 Overs To Be Bowled)", value: "" },
      { label: "Below 5 runs per over", value: "+6 pts" },
      { label: "Between 5 - 5.99 runs per over", value: "+4 pts" },
      { label: "Between 6 - 7 runs per over", value: "+2 pts" },
      { label: "Between 10 - 11 runs per over", value: "-2 pts" },
      { label: "Between 11.01 - 12 runs per over", value: "-4 pts" },
      { label: "Above 12 runs per over", value: "-6 pts" }
    ]
  },
  {
    title: "Fielding",
    items: [
      { label: "Catch", value: "+8 pts" },
      { label: "3 Catch Bonus", value: "+4 pts" },
      { label: "Stumping", value: "+12 pts" },
      { label: "Run Out (Direct Hit)", value: "+12 pts" },
      { label: "Run Out (Not a Direct Hit)", value: "+6 pts" }
    ]
  },
  {
    title: "Additional Points",
    items: [
      { label: "Captain Points", value: "2x" },
      { label: "Vice-Captain Points", value: "1.5x" },
      { label: "Playing XI Appearance", value: "+4 pts" },
      { label: "Playing Substitute", value: "+4 pts" }
    ]
  },
  {
    title: "Transfers",
    items: [
      { label: "Free changes before your first match starts", value: "" },
      { label: "Transfers count after your first submitted match begins", value: "" },
      { label: "Group stage transfer limit", value: "120" },
      { label: "Unlimited transfers before first Super 8 fixture starts", value: "" },
      { label: "Super 8 transfer limit", value: "46" },
      { label: "Transfers are locked 5 seconds before match start until 5 minutes after", value: "" }
    ]
  },
  {
    title: "Super Sub Rules",
    items: [
      { label: "Optional selection; can be left empty", value: "" },
      { label: "Must be outside your submitted XI", value: "" },
      { label: "Cannot be Captain or Vice-Captain at submission time", value: "" },
      { label: "Can be used only once per match day across fixtures", value: "" },
      { label: "Applies only if the selected Super Sub is in the official Playing XI", value: "" },
      { label: "If applied, it replaces the lowest base-points player from your submitted XI", value: "" },
      { label: "If replaced player was Captain/Vice-Captain, Super Sub inherits that multiplier", value: "" },
      { label: "If conditions are not met, your original XI remains unchanged", value: "" }
    ]
  }
];

export default function Rules() {
  return (
    <section className="page">
      <div className="page__header">
        <h2>Fantasy Rules</h2>
        <p>Official scoring rules used for ICC T20 World Cup 2026 Fantasy.</p>
      </div>

      <div className="rules-grid">
        {RULES.map((section) => (
          <div className="rules-card" key={section.title}>
            <h3>{section.title}</h3>
            <div className="rules-list">
              {section.items.map((item, idx) => (
                <div className="rules-row" key={`${section.title}-${idx}`}>
                  <span>{item.label}</span>
                  <span className="rules-value">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
