const NAME_ALIASES = {
  "varun chakaravarthy": "varun chakravarthy",
  "philip salt": "phil salt",
  "phillip salt": "phil salt",
  "quinton dekock": "quinton de kock",
  "mahesh theekshana": "maheesh theekshana",
  "dewald brewis": "dewald brevis",
  "jan nicol loftie eaton": "jan loftie eaton",
  "gian meade": "gian piero meade",
  "brad currie": "bradley currie",
  "shaheen afridi": "shaheen shah afridi",
  "max odowd": "max o dowd",
  "benjamin calitz": "ben calitz",
  "joshua little": "josh little",
  "abdullah ahmadzai": "abdollah ahmadzai",
  "mohammed siraj": "mohammad siraj",
  "mohsin": "mohammad mohsin"
};

export function normalizeNameKey(value) {
  const key = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return NAME_ALIASES[key] || key;
}
