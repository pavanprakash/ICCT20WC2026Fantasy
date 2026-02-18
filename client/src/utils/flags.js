import westIndiesFlag from "../assets/wi-flag.png";

const COUNTRY_TO_FLAG = {
  "afghanistan": "AF",
  "australia": "AU",
  "bangladesh": "BD",
  "canada": "CA",
  "england": "GB",
  "india": "IN",
  "ireland": "IE",
  "italy": "IT",
  "namibia": "NA",
  "nepal": "NP",
  "netherlands": "NL",
  "new zealand": "NZ",
  "oman": "OM",
  "pakistan": "PK",
  "scotland": "IMG:SCOT",
  "sco": "IMG:SCOT",
  "scot": "IMG:SCOT",
  "south africa": "ZA",
  "sri lanka": "LK",
  "united arab emirates": "AE",
  "uae": "AE",
  "united states of america": "US",
  "usa": "US",
  "west indies": "IMG:WI",
  "zimbabwe": "ZW"
};

const COUNTRY_TO_IMAGE = {
  "west indies": westIndiesFlag,
  "scotland": "https://g.cricapi.com/iapi/79-637877081763746652.webp?w=48",
  "sco": "https://g.cricapi.com/iapi/79-637877081763746652.webp?w=48",
  "scot": "https://g.cricapi.com/iapi/79-637877081763746652.webp?w=48"
};

const toFlagEmoji = (code) =>
  String(code || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 2)
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));

export const countryFlag = (country) => {
  const key = String(country || "").toLowerCase().trim();
  if (!key) return { type: "emoji", value: "🏳️" };
  const mapped = COUNTRY_TO_FLAG[key] || "";
  if (!mapped) return { type: "emoji", value: "🏳️" };
  if (mapped.startsWith("IMG:")) {
    return { type: "img", value: COUNTRY_TO_IMAGE[key] || "" };
  }
  if (mapped.length === 2) return { type: "emoji", value: toFlagEmoji(mapped) };
  return { type: "emoji", value: mapped };
};
