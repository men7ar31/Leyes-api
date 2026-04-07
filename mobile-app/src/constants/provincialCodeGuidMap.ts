import type { ProvincialCodeCatalogEntry } from "./provincialCodesCatalog";
import type { SaijSearchHit } from "../types/saij";

const normalizeLoose = (value: string) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeCompact = (value: string) =>
  normalizeLoose(value)
    .replace(/[^\w\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getNumericToken = (value?: string) => String(value || "").replace(/[^\d]/g, "");

export const getProvincialCodeCatalogKey = (province: string, entry: ProvincialCodeCatalogEntry) =>
  [normalizeLoose(province), normalizeCompact(entry.area), normalizeCompact(entry.reference), getNumericToken(entry.numeroNorma || entry.reference)].join("|");

type StaticProvincialGuidHit = {
  guid: string;
  title: string;
  jurisdiccion: string | null;
};

const buildHit = (guid: string, title: string, jurisdiccion: string | null): StaticProvincialGuidHit => ({
  guid,
  title,
  jurisdiccion,
});

const STATIC_PROVINCIAL_CODE_GUIDS: Record<string, StaticProvincialGuidHit> = {
  [getProvincialCodeCatalogKey("Buenos Aires", { area: "Civil y Comercial", reference: "Ley 7425", numeroNorma: "7425" })]:
    buildHit("123456789-0abc-defg-524-7000bvorpyel", "CODIGO PROCESAL CIVIL Y COMERCIAL DE BUENOS AIRES", "Buenos Aires"),
  [getProvincialCodeCatalogKey("Buenos Aires", { area: "Penal", reference: "Ley 11922", numeroNorma: "11922" })]:
    buildHit("123456789-0abc-defg-229-1100bvorpyel", "Codigo Procesal Penal de la Provincia de Buenos Aires", "Buenos Aires"),
  [getProvincialCodeCatalogKey("Buenos Aires", { area: "Contencioso Administrativo", reference: "Ley 12008", numeroNorma: "12008" })]:
    buildHit("123456789-0abc-defg-800-2100bvorpyel", "CODIGO CONTENCIOSO ADMINISTRATIVO", "Provincial"),
  [getProvincialCodeCatalogKey("Catamarca", { area: "Penal", reference: "Ley 5425", numeroNorma: "5425" })]:
    buildHit("123456789-0abc-defg-790-5000kvorpyel", "CODIGO PROCESAL PENAL DE CATAMARCA", "Catamarca"),
  [getProvincialCodeCatalogKey("Chaco", { area: "Civil y Comercial", reference: "Ley 2559", numeroNorma: "2559" })]:
    buildHit("123456789-0abc-defg-955-2000hvorpyel", "Codigo Procesal Civil y Comercial de la Provincia del Chaco", "Chaco"),
  [getProvincialCodeCatalogKey("Cordoba", { area: "Civil y Comercial", reference: "Ley 8465", numeroNorma: "8465" })]:
    buildHit("123456789-0abc-defg-564-8000ovorpyel", "CODIGO PROCESAL CIVIL Y COMERCIAL DE LA PROVINCIA DE CORDOBA", "Cordoba"),
  [getProvincialCodeCatalogKey("Formosa", { area: "Fiscal", reference: "Ley 1589", numeroNorma: "1589" })]:
    buildHit("123456789-0abc-defg-985-1000pvorpyel", "Codigo Fiscal de Formosa", "Provincial"),
  [getProvincialCodeCatalogKey("Jujuy", { area: "Mineria", reference: "Ley 5186", numeroNorma: "5186" })]:
    buildHit("123456789-0abc-defg-681-5000yvorpyel", "Codigo de Procedimientos Mineros de Jujuy", "Provincial"),
  [getProvincialCodeCatalogKey("Jujuy", { area: "Penal", reference: "Ley 6259", numeroNorma: "6259" })]:
    buildHit("123456789-0abc-defg-952-6000yvorpyel", "Codigo Procesal Penal de la Provincia de Jujuy", "Provincial"),
  [getProvincialCodeCatalogKey("Neuquen", { area: "Penal", reference: "Ley 2784", numeroNorma: "2784" })]:
    buildHit("123456789-0abc-defg-487-2000qvorpyel", "Codigo de Procedimiento Penal y Correccional", "Neuquen"),
  [getProvincialCodeCatalogKey("Salta", { area: "Penal", reference: "Ley 7690", numeroNorma: "7690" })]:
    buildHit("123456789-0abc-defg-096-7000avorpyel", "Codigo Procesal Penal de la provincia de Salta", "Provincial"),
  [getProvincialCodeCatalogKey("Santa Fe", { area: "Laboral", reference: "Ley 7945", numeroNorma: "7945" })]:
    buildHit("123456789-0abc-defg-549-7002svorpyel", "Codigo Procesal Laboral de la Provincia de Santa Fe (T.O. 2019)", "Santa Fe"),
  [getProvincialCodeCatalogKey("Santa Fe", { area: "Civil y Comercial", reference: "Ley 5531", numeroNorma: "5531" })]:
    buildHit("123456789-0abc-defg-631-0000svorpyel", "Codigo Procesal Civil y Comercial", "Provincial"),
  [getProvincialCodeCatalogKey("Santiago del Estero", { area: "Penal", reference: "Ley 6941", numeroNorma: "6941" })]:
    buildHit("123456789-0abc-defg-149-6000gvorpyel", "CODIGO PROCESAL PENAL DE SANTIAGO DEL ESTERO", "Provincial"),
  [getProvincialCodeCatalogKey("Santiago del Estero", { area: "Faltas", reference: "Ley 6913", numeroNorma: "6913" })]:
    buildHit("123456789-0abc-defg-319-6000avorpyel", "Ley 6913", "Provincial"),
  [getProvincialCodeCatalogKey("Tucuman", { area: "Civil y Comercial", reference: "Ley 9531", numeroNorma: "9531" })]:
    buildHit("123456789-0abc-defg-135-9000tvorpyel", "Codigo Procesal en lo Civil y Comercial de Tucuman", "Tucuman"),
  [getProvincialCodeCatalogKey("Tucuman", { area: "Penal (Nuevo)", reference: "Ley 8933", numeroNorma: "8933" })]:
    buildHit("123456789-0abc-defg-339-8000tvorpyel", "CODIGO PROCESAL PENAL", "Provincial"),
  [getProvincialCodeCatalogKey("Tucuman", { area: "Administrativo", reference: "Ley 6205", numeroNorma: "6205" })]:
    buildHit("123456789-0abc-defg-502-6000tvorpyel", "Codigo Procesal Administrativo de Tucuman", "Provincial"),
  [getProvincialCodeCatalogKey("Tucuman", { area: "Familia", reference: "Ley 9581", numeroNorma: "9581" })]:
    buildHit("123456789-0abc-defg-185-9000tvorpyel", "CODIGO PROCESAL DE FAMILIA DE LA PROVINCIA DE TUCUMAN", "Tucuman"),
};

export const getStaticProvincialCodeHit = (province: string, entry: ProvincialCodeCatalogEntry): SaijSearchHit | null => {
  const value = STATIC_PROVINCIAL_CODE_GUIDS[getProvincialCodeCatalogKey(province, entry)];
  if (!value?.guid) return null;
  return {
    guid: value.guid,
    title: value.title,
    subtitle: null,
    summary: null,
    contentType: "legislacion",
    fecha: null,
    estado: null,
    jurisdiccion: value.jurisdiccion,
    fuente: "SAIJ",
    friendlyUrl: null,
    sourceUrl: null,
  };
};
