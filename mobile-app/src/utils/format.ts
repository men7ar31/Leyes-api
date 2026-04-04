export const formatDate = (input?: string | null) => {
  if (!input) return null;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return date.toLocaleDateString("es-AR", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
};

export const cleanText = (text?: unknown) => {
  if (text === null || text === undefined) return "";
  const value = typeof text === "string" ? text : String(text);
  return value
    .replace(/ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â·|ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â·|Â·/g, " · ")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

export const maybeTruncate = (text: string, max: number) => {
  if (text.length <= max) return text;
  if (max <= 3) return text.slice(0, max);
  return `${text.slice(0, max - 3)}...`;
};
