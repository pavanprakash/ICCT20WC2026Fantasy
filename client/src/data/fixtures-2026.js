const fixtures = [
  { date: "2026-02-07", time: "11:00 AM", timeGMT: "05:30", team1: "PAK", team2: "NED", venue: "SSC, Colombo", stage: "Group" },
  { date: "2026-02-07", time: "3:00 PM", timeGMT: "09:30", team1: "WI", team2: "SCO", venue: "Kolkata", stage: "Group" },
  { date: "2026-02-07", time: "7:00 PM", timeGMT: "13:30", team1: "IND", team2: "USA", venue: "Mumbai", stage: "Group" },

  { date: "2026-02-08", time: "11:00 AM", timeGMT: "05:30", team1: "NZ", team2: "AFG", venue: "Chennai", stage: "Group" },
  { date: "2026-02-08", time: "3:00 PM", timeGMT: "09:30", team1: "ENG", team2: "NEP", venue: "Mumbai", stage: "Group" },
  { date: "2026-02-08", time: "7:00 PM", timeGMT: "13:30", team1: "SL", team2: "IRE", venue: "Premadasa, Colombo", stage: "Group" },

  { date: "2026-02-09", time: "11:00 AM", timeGMT: "05:30", team1: "SCO", team2: "ITA", venue: "Kolkata", stage: "Group" },
  { date: "2026-02-09", time: "3:00 PM", timeGMT: "09:30", team1: "ZIM", team2: "OMAN", venue: "SSC, Colombo", stage: "Group" },
  { date: "2026-02-09", time: "7:00 PM", timeGMT: "13:30", team1: "SA", team2: "CAN", venue: "Ahmedabad", stage: "Group" },

  { date: "2026-02-10", time: "11:00 AM", timeGMT: "05:30", team1: "NED", team2: "NAM", venue: "Delhi", stage: "Group" },
  { date: "2026-02-10", time: "3:00 PM", timeGMT: "09:30", team1: "NZ", team2: "UAE", venue: "Chennai", stage: "Group" },
  { date: "2026-02-10", time: "7:00 PM", timeGMT: "13:30", team1: "PAK", team2: "USA", venue: "SSC, Colombo", stage: "Group" },

  { date: "2026-02-11", time: "11:00 AM", timeGMT: "05:30", team1: "SA", team2: "AFG", venue: "Ahmedabad", stage: "Group" },
  { date: "2026-02-11", time: "3:00 PM", timeGMT: "09:30", team1: "AUS", team2: "IRE", venue: "Premadasa, Colombo", stage: "Group" },
  { date: "2026-02-11", time: "7:00 PM", timeGMT: "13:30", team1: "ENG", team2: "WI", venue: "Mumbai", stage: "Group" },

  { date: "2026-02-12", time: "11:00 AM", timeGMT: "05:30", team1: "SL", team2: "OMAN", venue: "Kandy", stage: "Group" },
  { date: "2026-02-12", time: "3:00 PM", timeGMT: "09:30", team1: "NEP", team2: "ITA", venue: "Mumbai", stage: "Group" },
  { date: "2026-02-12", time: "7:00 PM", timeGMT: "13:30", team1: "IND", team2: "NAM", venue: "Delhi", stage: "Group" },

  { date: "2026-02-13", time: "11:00 AM", timeGMT: "05:30", team1: "AUS", team2: "ZIM", venue: "Premadasa, Colombo", stage: "Group" },
  { date: "2026-02-13", time: "3:00 PM", timeGMT: "09:30", team1: "CAN", team2: "UAE", venue: "Delhi", stage: "Group" },
  { date: "2026-02-13", time: "7:00 PM", timeGMT: "13:30", team1: "USA", team2: "NED", venue: "Chennai", stage: "Group" },

  { date: "2026-02-14", time: "11:00 AM", timeGMT: "05:30", team1: "IRE", team2: "OMAN", venue: "SSC, Colombo", stage: "Group" },
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

  { date: "2026-02-20", time: "7:00 PM", timeGMT: "13:30", team1: "AUS", team2: "OMAN", venue: "Kandy", stage: "Group" },

  { date: "2026-02-21", time: "6:00 PM", timeGMT: "12:30", team1: "NZ", team2: "PAK", venue: "Premadasa, Colombo", stage: "Super 8" },
  { date: "2026-02-22", time: "2:30 PM", timeGMT: "09:00", team1: "SL", team2: "ENG", venue: "Pallekele, Kandy", stage: "Super 8" },
  { date: "2026-02-22", time: "6:00 PM", timeGMT: "12:30", team1: "IND", team2: "SA", venue: "Ahmedabad", stage: "Super 8" },
  { date: "2026-02-23", time: "6:00 PM", timeGMT: "12:30", team1: "ZIM", team2: "WI", venue: "Mumbai", stage: "Super 8" },
  { date: "2026-02-24", time: "6:00 PM", timeGMT: "12:30", team1: "ENG", team2: "PAK", venue: "Pallekele, Kandy", stage: "Super 8" },
  { date: "2026-02-25", time: "6:00 PM", timeGMT: "12:30", team1: "SL", team2: "NZ", venue: "Premadasa, Colombo", stage: "Super 8" },
  { date: "2026-02-26", time: "2:30 PM", timeGMT: "09:00", team1: "WI", team2: "SA", venue: "Ahmedabad", stage: "Super 8" },
  { date: "2026-02-26", time: "6:00 PM", timeGMT: "12:30", team1: "IND", team2: "ZIM", venue: "Chennai", stage: "Super 8" },
  { date: "2026-02-27", time: "6:00 PM", timeGMT: "12:30", team1: "ENG", team2: "NZ", venue: "Premadasa, Colombo", stage: "Super 8" },
  { date: "2026-02-28", time: "6:00 PM", timeGMT: "12:30", team1: "SL", team2: "PAK", venue: "Pallekele, Kandy", stage: "Super 8" },
  { id: "ae421629-648d-4db0-8289-5f2b950c3982", date: "2026-03-01", time: "2:30 PM", timeGMT: "09:00", team1: "SL", team2: "PAK", venue: "Pallekele, Kandy", stage: "Super 8" },
  { date: "2026-03-01", time: "6:00 PM", timeGMT: "12:30", team1: "IND", team2: "WI", venue: "Kolkata", stage: "Super 8" },

  { date: "2026-03-04", time: "7:00 PM", timeGMT: "13:30", team1: "SF1", team2: "KO", venue: "Kolkata", stage: "Semi-Final" },
  { date: "2026-03-04", time: "7:00 PM", timeGMT: "13:30", team1: "SF1", team2: "KO", venue: "Premadasa, Colombo", stage: "Semi-Final" },
  { date: "2026-03-05", time: "7:00 PM", timeGMT: "13:30", team1: "SF2", team2: "KO", venue: "Mumbai", stage: "Semi-Final" },
  { date: "2026-03-08", time: "7:00 PM", timeGMT: "13:30", team1: "FINAL", team2: "KO", venue: "Premadasa, Colombo", stage: "Final" },
  { date: "2026-03-08", time: "7:00 PM", timeGMT: "13:30", team1: "FINAL", team2: "KO", venue: "Ahmedabad", stage: "Final" }
];

export default fixtures;
