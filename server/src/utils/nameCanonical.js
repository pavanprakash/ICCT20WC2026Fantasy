const NAME_ALIASES = {
  "varun chakaravarthy": "varun chakravarthy"
};

export function normalizeNameKey(value) {
  const key = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return NAME_ALIASES[key] || key;
}

