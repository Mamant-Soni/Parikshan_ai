/**
 * Drug-name normalisation for the demo checker.
 *
 * OCR output and prescriptions are full of brand names and combination
 * products. This module maps the common Indian brand names used in the demo
 * fixtures back to their active ingredient(s) so the pair lookup has a chance of
 * matching. A production integration would call a terminology service
 * (RxNorm / SNOMED CT / ABDM drug registry) instead of this table.
 */

const BRAND_TO_GENERIC: Record<string, string[]> = {
  paracetamol: ["paracetamol", "acetaminophen"],
  crocin: ["paracetamol"],
  "crocin advance": ["paracetamol"],
  dolo: ["paracetamol"],
  "dolo 650": ["paracetamol"],
  calpol: ["paracetamol"],
  "dolo 500": ["paracetamol"],
  amoxicillin: ["amoxicillin"],
  novamox: ["amoxicillin"],
  "mox 500": ["amoxicillin"],
  augmentin: ["amoxicillin", "clavulanic acid"],
  clavulanic: ["clavulanic acid"],
  azithromycin: ["azithromycin"],
  azithral: ["azithromycin"],
  zithromax: ["azithromycin"],
  cetirizine: ["cetirizine"],
  levocetirizine: ["levocetirizine"],
  alright: ["cetirizine"],
  cetzine: ["cetirizine"],
  montair: ["montelukast"],
  montelukast: ["montelukast"],
  montek: ["montelukast"],
  ibuprofen: ["ibuprofen"],
  brufen: ["ibuprofen"],
  combiflam: ["ibuprofen", "paracetamol"],
  aspilef: ["aspirin"],
  aspirin: ["aspirin"],
  ecosprin: ["aspirin"],
  disprin: ["aspirin"],
  metformin: ["metformin"],
  glycomet: ["metformin"],
  glucophage: ["metformin"],
  glimepiride: ["glimepiride"],
  amaryl: ["glimepiride"],
  telmisartan: ["telmisartan"],
  telma: ["telmisartan"],
  losartan: ["losartan"],
  "losar 50": ["losartan"],
  amlodipine: ["amlodipine"],
  amlopres: ["amlodipine"],
  atorvastatin: ["atorvastatin"],
  atorva: ["atorvastatin"],
  rosuvastatin: ["rosuvastatin"],
  rosuvas: ["rosuvastatin"],
  thyronorm: ["levothyroxine"],
  levothyroxine: ["levothyroxine"],
  eltroxin: ["levothyroxine"],
  pantoprazole: ["pantoprazole"],
  pan: ["pantoprazole"],
  "pan 40": ["pantoprazole"],
  pan40: ["pantoprazole"],
  "pan-d": ["pantoprazole", "domperidone"],
  omeprazole: ["omeprazole"],
  omez: ["omeprazole"],
  domperidone: ["domperidone"],
  warfarin: ["warfarin"],
  warf: ["warfarin"],
  acitrom: ["acenocoumarol"],
  clopidogrel: ["clopidogrel"],
  clopilet: ["clopidogrel"],
  "clopilet a": ["clopidogrel", "aspirin"],
  ciprofloxacin: ["ciprofloxacin"],
  ciprolet: ["ciprofloxacin"],
  levofloxacin: ["levofloxacin"],
  levoflox: ["levofloxacin"],
  ofloxacin: ["ofloxacin"],
  metronidazole: ["metronidazole"],
  metrogyl: ["metronidazole"],
  fluconazole: ["fluconazole"],
  forcan: ["fluconazole"],
  diclofenac: ["diclofenac"],
  voveran: ["diclofenac"],
  "voveran sr": ["diclofenac"],
  aceclofenac: ["aceclofenac"],
  zerodol: ["aceclofenac"],
  naproxen: ["naproxen"],
  naprosyn: ["naproxen"],
  prednisolone: ["prednisolone"],
  wysolone: ["prednisolone"],
  dexamethasone: ["dexamethasone"],
  ranitidine: ["ranitidine"],
  zinetac: ["ranitidine"],
  famotidine: ["famotidine"],
  vitamin: ["multivitamin"],
  "vitamin d": ["cholecalciferol"],
  cholecalciferol: ["cholecalciferol"],
  shelcal: ["calcium", "cholecalciferol"],
  calcium: ["calcium"],
  zincovit: ["multivitamin"],
  ferrous: ["ferrous sulfate"],
  "ferrous sulfate": ["ferrous sulfate"],
  orofer: ["ferrous ascorbate"],
  folic: ["folic acid"],
  "folic acid": ["folic acid"],
  "fefol": ["ferrous sulfate", "folic acid"],
  levocetirizine_montelukast: ["levocetirizine", "montelukast"],
  telmisartan_amlodipine: ["telmisartan", "amlodipine"],
  "telma 40": ["telmisartan"],
  "telma-am": ["telmisartan", "amlodipine"],
  metoprolol: ["metoprolol"],
  metolar: ["metoprolol"],
  atenolol: ["atenolol"],
  digoxin: ["digoxin"],
  insulin: ["insulin"],
  huminsulin: ["insulin"],
  mixtard: ["insulin"],
  carbamazepine: ["carbamazepine"],
  phenytoin: ["phenytoin"],
  lithium: ["lithium"],
  tramadol: ["tramadol"],
  "tramadol hydrochloride": ["tramadol"],
  codeine: ["codeine"],
  sertraline: ["sertraline"],
  fluoxetine: ["fluoxetine"],
  escitalopram: ["escitalopram"],
  nexito: ["escitalopram"],
  alprazolam: ["alprazolam"],
  benadryl: ["diphenhydramine"],
  diphenhydramine: ["diphenhydramine"],
  ondansetron: ["ondansetron"],
  emeset: ["ondansetron"],
  allopurinol: ["allopurinol"],
  febuxostat: ["febuxostat"],
  thyroxine: ["levothyroxine"],
  salbutamol: ["salbutamol"],
  asthalin: ["salbutamol"],
  budesonide: ["budesonide"],
  foracort: ["formoterol", "budesonide"],
  ivermectin: ["ivermectin"],
  doxycycline: ["doxycycline"],
  doxt: ["doxycycline"],
};

/** Lowercase, strip dosage/form words and punctuation. */
export function normalizeDrugName(rawName: string): string {
  return rawName
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(tab|tablet|cap|capsule|syp|syrup|inj|injection|ointment|drops|sr|sustained release|er|cr|xl|dsr|forte|plus|advance|d\b|mg|ml|mcg|g\b|iu)\b/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Expands a brand name (or combination product) into active ingredients. */
export function splitCombination(normalized: string): string[] {
  const direct = BRAND_TO_GENERIC[normalized];
  if (direct) return direct;

  // Try the first word ("dolo 650" → "dolo"), then each token.
  const tokens = normalized.split(" ").filter(Boolean);
  for (let length = tokens.length; length >= 1; length -= 1) {
    for (let start = 0; start + length <= tokens.length; start += 1) {
      const candidate = tokens.slice(start, start + length).join(" ");
      const match = BRAND_TO_GENERIC[candidate];
      if (match) return match;
    }
  }
  return [normalized];
}

/** Stable cache key for an unordered medicine pair. */
export function pairKey(a: string, b: string): string {
  const [first, second] = [a, b].sort();
  return `${first}|${second}`;
}

export const KNOWN_GENERIC_NAMES = [...new Set(Object.values(BRAND_TO_GENERIC).flat())].sort();
