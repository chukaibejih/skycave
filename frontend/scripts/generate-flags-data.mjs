// ISO 3166-1 alpha-2 codes for sovereign UN member/observer states (195).
// Excludes most dependent territories to keep the game focused on countries
// people can actually name.
const CODES = "AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TZ UA UG US UY UZ VA VC VE VN VU WS YE ZA ZM ZW".split(" ");

const dn = new Intl.DisplayNames(["en"], { type: "region" });

// Common alternate names players might type. Keyed by code.
const ALIASES = {
  GB: ["uk", "britain", "great britain", "united kingdom", "england"],
  US: ["usa", "america", "united states", "united states of america"],
  KR: ["south korea", "korea"],
  KP: ["north korea"],
  RU: ["russia"],
  CD: ["congo", "drc", "dr congo", "democratic republic of the congo"],
  CG: ["congo", "republic of the congo"],
  CZ: ["czech republic", "czechia"],
  AE: ["uae", "united arab emirates"],
  VA: ["vatican", "vatican city", "holy see"],
  LA: ["laos"],
  SY: ["syria"],
  TZ: ["tanzania"],
  MM: ["myanmar", "burma"],
  CI: ["ivory coast", "cote d'ivoire"],
  TL: ["east timor", "timor-leste"],
  SZ: ["swaziland", "eswatini"],
  MK: ["macedonia", "north macedonia"],
  VC: ["saint vincent", "st vincent"],
  KN: ["saint kitts", "st kitts"],
  LC: ["saint lucia", "st lucia"],
};

const out = CODES.map((code) => {
  const name = dn.of(code);
  const lc = code.toLowerCase();
  const aliases = new Set([(name || "").toLowerCase()]);
  // strip leading "the " for matching convenience
  if (name && name.toLowerCase().startsWith("the ")) aliases.add(name.toLowerCase().slice(4));
  for (const a of (ALIASES[code] || [])) aliases.add(a);
  return { code: lc, name, aliases: [...aliases].filter(Boolean) };
}).filter((c) => c.name);

out.sort((a, b) => a.name.localeCompare(b.name));
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
console.error(`generated ${out.length} countries`);
