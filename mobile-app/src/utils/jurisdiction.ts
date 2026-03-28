import { cleanText } from "./format";

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const PROVINCES = [
  "Buenos Aires",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Ciudad Autonoma de Buenos Aires",
  "Cordoba",
  "Corrientes",
  "Entre Rios",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquen",
  "Rio Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucuman",
] as const;

const findProvinceLabel = (source?: string | null) => {
  const lower = normalize(cleanText(String(source || "")));
  if (!lower) return null;
  const province = PROVINCES.find((item) => lower.includes(normalize(item)));
  return province || null;
};

const inferProvinceFromMetadata = (metadata: any): string | null => {
  if (!metadata) return null;

  const queue: any[] = [metadata];
  const seen = new Set<any>();
  let scanned = 0;
  while (queue.length > 0 && scanned < 140) {
    const current = queue.shift();
    if (current == null) continue;
    if (typeof current === "object") {
      if (seen.has(current)) continue;
      seen.add(current);
    }

    if (typeof current === "string") {
      const province = findProvinceLabel(current);
      if (province) return province;
      scanned += 1;
      continue;
    }

    if (Array.isArray(current)) {
      queue.push(...current);
      scanned += 1;
      continue;
    }

    if (typeof current === "object") {
      for (const [key, value] of Object.entries(current)) {
        if (typeof value === "string") {
          const byValue = findProvinceLabel(value);
          if (byValue) return byValue;
          if (/provincia|jurisdic|distrito|territorio/i.test(key)) {
            const keyHint = findProvinceLabel(value);
            if (keyHint) return keyHint;
          }
        } else if (value && typeof value === "object") {
          queue.push(value);
        }
      }
      scanned += 1;
    }
  }

  return null;
};

type ResolveJurisdictionInput = {
  jurisdiccion?: string | null;
  subtitle?: string | null;
  title?: string | null;
  summary?: string | null;
  metadata?: any;
};

export const resolveJurisdictionLabel = (input: ResolveJurisdictionInput): string | null => {
  const source = cleanText([input.jurisdiccion || "", input.subtitle || "", input.title || "", input.summary || ""].join(" "));
  const lower = normalize(source);

  const province =
    findProvinceLabel(input.jurisdiccion) ||
    findProvinceLabel(input.subtitle) ||
    findProvinceLabel(input.title) ||
    findProvinceLabel(input.summary) ||
    inferProvinceFromMetadata(input.metadata);
  if (province) return province;

  if (!lower) return null;
  if (lower.includes("nacional")) return "Nacional";
  if (lower.includes("internacional")) return "Internacional";
  if (lower.includes("federal")) return "Federal";
  if (lower.includes("provincial") || lower.includes("local")) return "Provincial";
  return null;
};
