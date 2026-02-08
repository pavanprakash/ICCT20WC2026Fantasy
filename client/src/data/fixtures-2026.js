const fixtures = [
  { date: "2026-02-07", time: "11:00 AM", timeGMT: "05:30", team1: "PAK", team2: "NED", venue: "SSC, Colombo", stage: "Group" },
  { date: "2026-02-07", time: "3:00 PM", timeGMT: "09:30", team1: "WI", team2: "SCO", venue: "Kolkata", stage: "Group" },
  { date: "2026-02-07", time: "7:00 PM", timeGMT: "13:30", team1: "IND", team2: "USA", venue: "Mumbai", stage: "Group" },

  { date: "2026-02-08", time: "11:00 AM", timeGMT: "05:30", team1: "NZ", team2: "AFG", venue: "Chennai", stage: "Group" },
  { date: "2026-02-08", time: "3:00 PM", timeGMT: "09:30", team1: "ENG", team2: "NEP", venue: "Mumbai", stage: "Group" },
  { date: "2026-02-08", time: "7:00 PM", timeGMT: "13:30", team1: "SL", team2: "IRE", venue: "Premadasa, Colombo", stage: "Group" },

  { date: "2026-02-09", time: "11:00 AM", timeGMT: "05:30", team1: "SCO", team2: "ITA", venue: "Kolkata", stage: "Group" },
  { date: "2026-02-09", time: "3:00 PM", timeGMT: "09:30", team1: "ZIM", team2: "OMA", venue: "SSC, Colombo", stage: "Group" },
  { date: "2026-02-09", time: "7:00 PM", timeGMT: "13:30", team1: "SA", team2: "CAN", venue: "Ahmedabad", stage: "Group" },

  { date: "2026-02-10", time: "11:00 AM", timeGMT: "05:30", team1: "NED", team2: "NAM", venue: "Delhi", stage: "Group" },
  { date: "2026-02-10", time: "3:00 PM", timeGMT: "09:30", team1: "NZ", team2: "UAE", venue: "Chennai", stage: "Group" },
  { date: "2026-02-10", time: "7:00 PM", timeGMT: "13:30", team1: "PAK", team2: "USA", venue: "SSC, Colombo", stage: "Group" },

  { date: "2026-02-11", time: "11:00 AM", timeGMT: "05:30", team1: "SA", team2: "AFG", venue: "Ahmedabad", stage: "Group" },
  { date: "2026-02-11", time: "3:00 PM", timeGMT: "09:30", team1: "AUS", team2: "IRE", venue: "Premadasa, Colombo", stage: "Group" },
  { date: "2026-02-11", time: "7:00 PM", timeGMT: "13:30", team1: "ENG", team2: "WI", venue: "Mumbai", stage: "Group" },

  { date: "2026-02-12", time: "11:00 AM", timeGMT: "05:30", team1: "SL", team2: "OMA", venue: "Kandy", stage: "Group" },
  { date: "2026-02-12", time: "3:00 PM", timeGMT: "09:30", team1: "NEP", team2: "ITA", venue: "Mumbai", stage: "Group" },
  { date: "2026-02-12", time: "7:00 PM", timeGMT: "13:30", team1: "IND", team2: "NAM", venue: "Delhi", stage: "Group" },

  { date: "2026-02-13", time: "11:00 AM", timeGMT: "05:30", team1: "AUS", team2: "ZIM", venue: "Premadasa, Colombo", stage: "Group" },
  { date: "2026-02-13", time: "3:00 PM", timeGMT: "09:30", team1: "CAN", team2: "UAE", venue: "Delhi", stage: "Group" },
  { date: "2026-02-13", time: "7:00 PM", timeGMT: "13:30", team1: "USA", team2: "NED", venue: "Chennai", stage: "Group" },

  { date: "2026-02-14", time: "11:00 AM", timeGMT: "05:30", team1: "IRE", team2: "OMA", venue: "SSC, Colombo", stage: "Group" },
  { date: "2026-02-14", time: "3:00 PM", timeGMT: "09:30", team1: "ENG", team2: "SCO", venue: "Kolkata", stage: "Group" },
  { date: "2026-02-14", time: "7:00 PM", timeGMT: "13:30", team1: "NZ", team2: "SA", venue: "Ahmedabad", stage: "Group" },

  { date: "2026-02-15", time: "11:00 AM", timeGMT: "05:30", team1: "WI", team2: "NEP", venue: "Mumbai", stage: "Group" },
  { date: "2026-02-15", time: "3:00 PM", timeGMT: "09:30", team1: "USA", team2: "NAM", venue: "Chennai", stage: "Group" },
  { date: "2026-02-15", time: "7:00 PM", timeGMT: "13:30", team1: "IND", team2: "PAK", venue: "Premadasa, Colombo", stage: "Group" },

  { date: "2026-02-16", time: "11:00 AM", timeGMT: "05:30", team1: "AFG", team2: "UAE", venue: "Delhi", stage: "Group" },
  { date: "2026-02-16", time: "3:00 PM", timeGMT: "09:30", team1: "ENG", team2: "ITA", venue: "Kolkata", stage: "Group" },
  { date: "2026-02-16", time: "7:00 PM", timeGMT: "13:30", team1: "AUS", team2: "SL", venue: "Kandy", stage: "Group" },

  { date: "2026-02-17", time: "11:00 AM", timeGMT: "05:30", team1: "NZ", team2: "CAN", venue: "Chennai", stage: "Group" },
  { date: "2026-02-17", time: "3:00 PM", timeGMT: "09:30", team1: "IRE", team2: "ZIM", venue: "Kandy", stage: "Group" },
  { date: "2026-02-17", time: "7:00 PM", timeGMT: "13:30", team1: "SCO", team2: "NEP", venue: "Mumbai", stage: "Group" },

  { date: "2026-02-18", time: "11:00 AM", timeGMT: "05:30", team1: "SA", team2: "UAE", venue: "Delhi", stage: "Group" },
  { date: "2026-02-18", time: "3:00 PM", timeGMT: "09:30", team1: "PAK", team2: "NAM", venue: "SSC, Colombo", stage: "Group" },
  { date: "2026-02-18", time: "7:00 PM", timeGMT: "13:30", team1: "IND", team2: "NED", venue: "Ahmedabad", stage: "Group" },

  { date: "2026-02-19", time: "11:00 AM", timeGMT: "05:30", team1: "WI", team2: "ITA", venue: "Kolkata", stage: "Group" },
  { date: "2026-02-19", time: "3:00 PM", timeGMT: "09:30", team1: "SL", team2: "ZIM", venue: "Premadasa, Colombo", stage: "Group" },
  { date: "2026-02-19", time: "7:00 PM", timeGMT: "13:30", team1: "AFG", team2: "CAN", venue: "Chennai", stage: "Group" },

  { date: "2026-02-20", time: "7:00 PM", timeGMT: "13:30", team1: "AUS", team2: "OMA", venue: "Kandy", stage: "Group" },

  { date: "2026-02-21", time: "7:00 PM", timeGMT: "13:30", team1: "Y2", team2: "Y3", venue: "Premadasa, Colombo", stage: "Super 8" },
  { date: "2026-02-22", time: "3:00 PM", timeGMT: "09:30", team1: "Y1", team2: "Y4", venue: "Kandy", stage: "Super 8" },
  { date: "2026-02-22", time: "7:00 PM", timeGMT: "13:30", team1: "X1", team2: "X4", venue: "Ahmedabad", stage: "Super 8" },
  { date: "2026-02-23", time: "7:00 PM", timeGMT: "13:30", team1: "X2", team2: "X3", venue: "Mumbai", stage: "Super 8" },
  { date: "2026-02-24", time: "7:00 PM", timeGMT: "13:30", team1: "Y1", team2: "Y3", venue: "Kandy", stage: "Super 8" },
  { date: "2026-02-25", time: "7:00 PM", timeGMT: "13:30", team1: "Y2", team2: "Y4", venue: "Premadasa, Colombo", stage: "Super 8" },
  { date: "2026-02-26", time: "3:00 PM", timeGMT: "09:30", team1: "X3", team2: "X4", venue: "Ahmedabad", stage: "Super 8" },
  { date: "2026-02-26", time: "7:00 PM", timeGMT: "13:30", team1: "X1", team2: "X2", venue: "Chennai", stage: "Super 8" },
  { date: "2026-02-27", time: "7:00 PM", timeGMT: "13:30", team1: "Y1", team2: "Y2", venue: "Premadasa, Colombo", stage: "Super 8" },
  { date: "2026-02-28", time: "7:00 PM", timeGMT: "13:30", team1: "Y3", team2: "Y4", venue: "Kandy", stage: "Super 8" },
  { date: "2026-03-01", time: "3:00 PM", timeGMT: "09:30", team1: "X2", team2: "X4", venue: "Delhi", stage: "Super 8" },
  { date: "2026-03-01", time: "7:00 PM", timeGMT: "13:30", team1: "X1", team2: "X3", venue: "Kolkata", stage: "Super 8" },

  { date: "2026-03-04", time: "7:00 PM", timeGMT: "13:30", team1: "SF1", team2: "KO", venue: "Kolkata", stage: "Semi-Final" },
  { date: "2026-03-04", time: "7:00 PM", timeGMT: "13:30", team1: "SF1", team2: "KO", venue: "Premadasa, Colombo", stage: "Semi-Final" },
  { date: "2026-03-05", time: "7:00 PM", timeGMT: "13:30", team1: "SF2", team2: "KO", venue: "Mumbai", stage: "Semi-Final" },
  { date: "2026-03-08", time: "7:00 PM", timeGMT: "13:30", team1: "FINAL", team2: "KO", venue: "Premadasa, Colombo", stage: "Final" },
  { date: "2026-03-08", time: "7:00 PM", timeGMT: "13:30", team1: "FINAL", team2: "KO", venue: "Ahmedabad", stage: "Final" }
];

export default fixtures;
