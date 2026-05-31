export type ProvincialCodeCatalogEntry = {
  area: string;
  reference: string;
  numeroNorma?: string;
  notes?: string;
  searchTerms?: string[];
};

const normalizeLoose = (value?: string | null) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const MAIN_CODE_KEYWORDS = [
  "procesal penal",
  "procesal civil",
  "civil y comercial",
  "fiscal",
  "tributario",
  "constitucional",
  "familia",
  "laboral",
  "trabajo",
  "administrativo",
  "contencioso administrativo",
  "faltas",
  "contravencional",
  "convivencia",
];

export const isMainProvincialCodeEntry = (entry: ProvincialCodeCatalogEntry) => {
  const bag = normalizeLoose(`${entry.area || ""} ${entry.reference || ""}`);
  if (!bag) return false;
  return MAIN_CODE_KEYWORDS.some((keyword) => bag.includes(keyword));
};

export const getMainProvincialCodes = (province: string) => {
  const rows = PROVINCIAL_CODES_CATALOG[province] || [];
  return rows.filter(isMainProvincialCodeEntry);
};

export const PROVINCIAL_CODES_CATALOG: Record<string, ProvincialCodeCatalogEntry[]> = {
  "Buenos Aires": [
    { area: "Codigo Fiscal / Tributario", reference: "Ley 10397 (TO; escalas por Ley Impositiva anual, ej. Ley 15079)", numeroNorma: "10397" },
    { area: "Codigo Procesal Civil y Comercial", reference: "Ley 7425", numeroNorma: "7425" },
    { area: "Codigo Procesal Penal", reference: "Ley 11922", numeroNorma: "11922" },
    { area: "Codigo de Faltas provincial", reference: "Decreto-Ley 8031/1973", numeroNorma: "8031/1973" },
    { area: "Codigo de Faltas municipal", reference: "Decreto-Ley 8751/1977", numeroNorma: "8751/1977" },
    { area: "Codigo Contencioso Administrativo", reference: "Ley 12008", numeroNorma: "12008" },
    { area: "Codigo Rural", reference: "Ley 10081", numeroNorma: "10081" },
    { area: "Codigo de Aguas", reference: "Ley 12257", numeroNorma: "12257" },
    { area: "Codigo de Transito", reference: "Ley 13927", numeroNorma: "13927" },
    { area: "Ley de Ejecucion Penal", reference: "Ley 12256", numeroNorma: "12256" },
  ],
  "Ciudad Autonoma de Buenos Aires": [
    { area: "Codigo Fiscal", reference: "Texto unificado (Decreto 116/25) y Ley Tarifaria anual", numeroNorma: "116/25" },
    { area: "Codigo Contencioso Administrativo y Tributario", reference: "Ley 189", numeroNorma: "189" },
    { area: "Codigo Procesal Penal", reference: "Ley 2303", numeroNorma: "2303" },
    { area: "Codigo Contravencional", reference: "Codigo Contravencional de la CABA" },
  ],
  Catamarca: [
    { area: "Codigo Tributario (Fiscal)", reference: "Ley 5022", numeroNorma: "5022" },
    { area: "Codigo Procesal Civil y Comercial", reference: "Ley 5213 (TO por Decreto-Acuerdo 278/2008)", numeroNorma: "5213" },
    { area: "Codigo Procesal Penal", reference: "Ley 5425", numeroNorma: "5425" },
    { area: "Codigo de Faltas", reference: "Ley 5171", numeroNorma: "5171" },
    { area: "Codigo de Procedimientos Administrativos", reference: "Ley 3559", numeroNorma: "3559" },
    { area: "Codigo de Procedimientos Mineros", reference: "Ley 2233", numeroNorma: "2233" },
    { area: "Ley de Ejecucion Penal", reference: "Ley 4991", numeroNorma: "4991" },
  ],
  Cordoba: [
    { area: "Codigo Fiscal", reference: "Ley 6006 (TO)", numeroNorma: "6006" },
    { area: "Codigo Procesal Civil y Comercial", reference: "Codigo de Procedimiento Civil y Comercial de Cordoba" },
    { area: "Codigo Procesal Penal", reference: "Codigo Procesal Penal de Cordoba" },
    { area: "Codigo de Convivencia Ciudadana", reference: "Ley 10326 (mod. Leyes 11097 y 11117)", numeroNorma: "10326" },
  ],
  Corrientes: [
    { area: "Codigo Fiscal", reference: "Ley 3037 (TO Dec. 4142/83; mod. Leyes 6189 y 6250; Ley Tarifaria 1564)", numeroNorma: "3037" },
    { area: "Codigo Procesal Civil y Comercial", reference: "Ley 6556", numeroNorma: "6556" },
    { area: "Codigo Procesal Penal", reference: "Ley 6518", numeroNorma: "6518" },
    { area: "Codigo de Faltas provincial", reference: "Decreto-Ley 124/2001", numeroNorma: "124/2001" },
    { area: "Faltas municipales (Ciudad de Corrientes)", reference: "Ordenanza 7376 y Ordenanza 7375" },
    { area: "Codigo de Aguas", reference: "Ley 3066 / Decreto-Ley 191/2001", numeroNorma: "3066" },
    { area: "Codigo Contencioso Administrativo", reference: "Ley 4106", numeroNorma: "4106" },
  ],
  Chaco: [
    { area: "Codigo Fiscal", reference: "Decreto-Ley 2444/1962", numeroNorma: "2444/1962" },
    { area: "Codigo Procesal Civil y Comercial", reference: "Ley 2559 (ex Ley 7950)", numeroNorma: "2559" },
    { area: "Codigo Procesal Penal", reference: "Ley 965 (ex Ley 4538)", numeroNorma: "965" },
    { area: "Codigo de Faltas", reference: "Ley 850 (ex Ley 4209)", numeroNorma: "850" },
    { area: "Codigo Rural", reference: "Ley 713 (ex Ley 3727)", numeroNorma: "713" },
    { area: "Codigo de Aguas", reference: "Ley 555 (ex Ley 3230)", numeroNorma: "555" },
    { area: "Codigo de Procedimiento Administrativo", reference: "Ley 179 (ex Ley 1140)", numeroNorma: "179" },
    { area: "Codigo Contencioso Administrativo", reference: "Ley 135 (ex Ley 848)", numeroNorma: "135" },
    { area: "Codigo de Procedimientos Mineros", reference: "Ley 1135 (ex Ley 4889)", numeroNorma: "1135" },
  ],
  Chubut: [
    { area: "Codigo Fiscal", reference: "Ley XXIV 38 (ex Ley 5450)", numeroNorma: "XXIV 38" },
    { area: "Codigo Procesal Civil y Comercial", reference: "Ley XIII 5 (ex Anexo Ley 2203)", numeroNorma: "XIII 5" },
    { area: "Codigo Procesal Penal", reference: "Ley XV 9 (ex Ley 5478)", numeroNorma: "XV 9" },
    { area: "Codigo Contravencional", reference: "Ley XV 6 (ex Ley 4145)", numeroNorma: "XV 6" },
    { area: "Codigo de Seguridad Social", reference: "Ley XVIII 4 (ex Ley 650)", numeroNorma: "XVIII 4" },
    { area: "Codigo Ambiental", reference: "Ley XI 35 (ex Ley 5439)", numeroNorma: "XI 35" },
    { area: "Codigo de Procedimientos del Trabajo", reference: "Ley XIV 1 (ex Ley 69)", numeroNorma: "XIV 1" },
  ],
  "Entre Rios": [
    { area: "Codigo Fiscal", reference: "Ley 6505 (TO 2018/2022; mod. Ley 11193 de marzo 2025)", numeroNorma: "6505" },
    { area: "Codigo Procesal Civil y Comercial", reference: "Ley 9776", numeroNorma: "9776" },
    { area: "Codigo Procesal Penal", reference: "Ley 9754", numeroNorma: "9754" },
    { area: "Codigo de Faltas / Contravencional", reference: "Ley 3815 (TO encomendado y reformas)", numeroNorma: "3815" },
  ],
  Formosa: [
    { area: "Codigo Fiscal", reference: "Ley 1589", numeroNorma: "1589" },
    { area: "Codigo Procesal Civil y Comercial", reference: "Decreto-Ley 424/70 (adecuado por Ley 1397/02)", numeroNorma: "424/70" },
    { area: "Codigo Procesal Penal", reference: "Ley 696", numeroNorma: "696" },
    { area: "Codigo de Faltas", reference: "Codigo de Faltas de la Provincia de Formosa" },
  ],
  Jujuy: [
    { area: "Codigo Fiscal", reference: "Ley 5791 (reformas por Leyes 6002, 6052, 6128, 6151, 6214, 6225, 6257, 6326 y 6444)", numeroNorma: "5791" },
    { area: "Codigo Procesal Civil y Comercial", reference: "Ley 6358 (nuevo codigo, 2023)", numeroNorma: "6358" },
    { area: "Codigo Procesal Penal", reference: "Leyes 3584 y 5623", numeroNorma: "3584" },
    { area: "Codigo de Faltas", reference: "No hay codigo unificado provincial; regimen por leyes locales" },
  ],
  "La Pampa": [
    { area: "Codigo Fiscal", reference: "TO 2023 (mod. Ley Impositiva 3602/2024 para ejercicio 2025)", numeroNorma: "3602/2024" },
    { area: "Codigo Procesal Civil y Comercial", reference: "Ley 1828", numeroNorma: "1828" },
    { area: "Codigo Procesal Penal", reference: "Ley 2287", numeroNorma: "2287" },
    { area: "Codigo Contravencional", reference: "Ley 3151 (reemplaza estructura historica de Ley 1123)", numeroNorma: "3151" },
    { area: "Ley de Procedimiento Laboral", reference: "Norma de Facto 986", numeroNorma: "986" },
  ],
  "La Rioja": [
    { area: "Codigo Tributario (Fiscal)", reference: "Ley 6402 (TO de Dec.-Ley 4040/1981; act. Leyes 9662 y 10345)", numeroNorma: "6402" },
    { area: "Codigo Procesal Civil y Comercial", reference: "Codigo Procesal Civil y Comercial de La Rioja" },
    { area: "Codigo Procesal Penal", reference: "Codigo Procesal Penal de La Rioja" },
    { area: "Codigo de Faltas provincial", reference: "Decreto-Ley 4245", numeroNorma: "4245" },
    { area: "Codigo de Faltas municipal (Capital)", reference: "Ordenanza 4522 (deroga Ord. 1772 y consolida Ord. 4361)" },
  ],
  Mendoza: [
    { area: "Codigo Fiscal", reference: "Codigo Fiscal de Mendoza" },
    { area: "Codigo Procesal Civil, Comercial y Tributario", reference: "Ley 9001", numeroNorma: "9001" },
    { area: "Codigo Procesal Penal", reference: "Ley 8937", numeroNorma: "8937" },
    { area: "Codigo Contravencional", reference: "Ley 9099 (mod. Leyes 9182, 9236, 9337 y 9559)", numeroNorma: "9099" },
    { area: "Codigo Procesal Administrativo", reference: "Ley 3918", numeroNorma: "3918" },
    { area: "Codigo Procesal Laboral", reference: "Ley 9109", numeroNorma: "9109" },
  ],
  Misiones: [
    { area: "Codigo Fiscal", reference: "Ley XXII 35 (ex Ley 4366)", numeroNorma: "XXII 35" },
    { area: "Codigo Procesal Civil, Comercial, de Familia y Violencia Familiar", reference: "Ley XII 27", numeroNorma: "XII 27" },
    { area: "Codigo Procesal Penal", reference: "Ley XIV 13", numeroNorma: "XIV 13" },
    { area: "Codigo de Faltas", reference: "Ley XIV 5 (ex Ley 2800)", numeroNorma: "XIV 5" },
    { area: "Codigo de Procedimiento Laboral", reference: "Ley XIII 2", numeroNorma: "XIII 2" },
  ],
  Neuquen: [
    { area: "Codigo Fiscal", reference: "Ley 2680", numeroNorma: "2680" },
    { area: "Codigo Procesal Civil y Comercial", reference: "Ley 912", numeroNorma: "912" },
    { area: "Codigo Procesal Penal", reference: "Leyes 3021 y 2784", numeroNorma: "3021" },
    { area: "Codigo de Faltas / Contravencional", reference: "Decreto-Ley 813/1962 (mod. Leyes 1644, 2767, 2833 y 3522)", numeroNorma: "813/1962" },
    { area: "Codigo Procesal Administrativo", reference: "Ley 1305", numeroNorma: "1305" },
    { area: "Codigo de Procedimiento Minero", reference: "Ley 902", numeroNorma: "902" },
  ],
  "Rio Negro": [
    { area: "Codigo Fiscal", reference: "Ley 5701 (articulado con Ley Impositiva 5686)", numeroNorma: "5701" },
    { area: "Codigo Procesal Civil y Comercial", reference: "Ley 4142", numeroNorma: "4142" },
    { area: "Codigo Procesal Penal", reference: "Ley 2107", numeroNorma: "2107" },
    { area: "Codigo de Faltas", reference: "Ley 532", numeroNorma: "532" },
  ],
  Salta: [
    { area: "Codigo Fiscal", reference: "Decreto-Ley 9/1975", numeroNorma: "9/1975" },
    { area: "Codigo Procesal Civil y Comercial", reference: "Ley 5233", numeroNorma: "5233" },
    { area: "Codigo Procesal Penal", reference: "Leyes 7690 y 6345", numeroNorma: "7690" },
    { area: "Codigo Contravencional", reference: "Ley 7135", numeroNorma: "7135" },
    { area: "Codigo de Procedimientos Mineros", reference: "Ley 7141", numeroNorma: "7141" },
    { area: "Codigo Procesal Laboral y Organica de la Justicia del Trabajo", reference: "Ley 528", numeroNorma: "528" },
    { area: "Codigo de Procedimiento Contencioso Administrativo", reference: "Ley 793", numeroNorma: "793" },
  ],
  "San Juan": [
    { area: "Codigo Tributario (Fiscal)", reference: "Ley 151", numeroNorma: "151" },
    { area: "Codigo Procesal Civil, Comercial y Mineria", reference: "Ley 988", numeroNorma: "988" },
    { area: "Codigo Procesal Penal", reference: "Ley 1851-O (consolidada por Ley LP-2748-E)", numeroNorma: "1851-O" },
    { area: "Codigo de Faltas", reference: "Ley 941", numeroNorma: "941" },
    { area: "Codigo de Procedimiento Laboral", reference: "Ley 337", numeroNorma: "337" },
    { area: "Codigo de Procedimiento Minero", reference: "Ley 688", numeroNorma: "688" },
    { area: "Codigo Sanitario", reference: "Ley 67", numeroNorma: "67" },
    { area: "Codigo Electoral", reference: "Ley 1268", numeroNorma: "1268" },
  ],
  "San Luis": [
    { area: "Codigo Tributario (Fiscal)", reference: "Ley VI-0154-2004", numeroNorma: "VI-0154-2004" },
    { area: "Codigo Procesal Civil y Comercial", reference: "Ley VI-0150 (TO 2013)", numeroNorma: "VI-0150" },
    { area: "Codigo Procesal Penal", reference: "Texto ordenado 2024 (deroga Ley VI-0152-2004)", numeroNorma: "2024" },
    { area: "Codigo Contravencional", reference: "Ley VI-0155-2004", numeroNorma: "VI-0155-2004" },
    { area: "Codigo de Procedimiento Laboral", reference: "Ley VI-0153-2004", numeroNorma: "VI-0153-2004" },
    { area: "Codigo Provincial de Consumidores y Usuarios", reference: "Ley 7714", numeroNorma: "7714" },
  ],
  "Santa Cruz": [
    { area: "Codigo Fiscal", reference: "Ley 3470", numeroNorma: "3470" },
    { area: "Codigo Procesal Civil y Comercial", reference: "Leyes 1418 y 3453", numeroNorma: "1418" },
    { area: "Codigo Procesal Penal", reference: "Ley 2424", numeroNorma: "2424" },
    { area: "Codigo de Faltas", reference: "Ley 3125", numeroNorma: "3125" },
    { area: "Codigo de Procedimiento Contencioso Administrativo", reference: "Ley 2600", numeroNorma: "2600" },
  ],
  "Santa Fe": [
    { area: "Codigo Fiscal", reference: "Ley 3456", numeroNorma: "3456" },
    { area: "Codigo Procesal Civil y Comercial", reference: "Ley 5531", numeroNorma: "5531" },
    { area: "Codigo Procesal Penal", reference: "Ley 12734", numeroNorma: "12734" },
    { area: "Codigo de Faltas", reference: "Ley 10703", numeroNorma: "10703" },
    { area: "Codigo de Convivencia", reference: "Ley 13774", numeroNorma: "13774" },
    { area: "Codigo Procesal Laboral", reference: "Ley 7945 (mod. Ley 13840)", numeroNorma: "7945" },
    { area: "Codigo Procesal de Menores", reference: "Ley 11452", numeroNorma: "11452" },
    { area: "Codigo Tributario Municipal", reference: "Ley 8173", numeroNorma: "8173" },
  ],
  "Santiago del Estero": [
    { area: "Codigo Fiscal", reference: "Ley 6792", numeroNorma: "6792" },
    { area: "Codigo de Procedimientos Civil y Comercial", reference: "Ley 6910", numeroNorma: "6910" },
    { area: "Codigo Procesal Penal", reference: "Ley 6941 y Ley 6986 (transicion)", numeroNorma: "6941" },
    { area: "Codigo de Faltas", reference: "Ley 6906", numeroNorma: "6906" },
    { area: "Codigo de Procedimientos Laboral", reference: "Ley 7049", numeroNorma: "7049" },
  ],
  "Tierra del Fuego": [
    { area: "Codigo Fiscal / Tributario", reference: "Codigo Tributario (Ley 1075 y ley tributaria complementaria)", numeroNorma: "1075" },
    { area: "Codigo Procesal Civil, Comercial, Laboral, Rural y Minero", reference: "Ley 147", numeroNorma: "147" },
    { area: "Codigo Procesal Penal", reference: "Ley 168", numeroNorma: "168" },
    { area: "Codigo Contravencional", reference: "Ley 1024", numeroNorma: "1024" },
    { area: "Codigo Contencioso Administrativo", reference: "Ley 133", numeroNorma: "133" },
  ],
  Tucuman: [
    { area: "Codigo Fiscal / Tributario", reference: "Ley 5121 (consolidado 2025 por Ley 9924; mod. Leyes 9950 y 9660)", numeroNorma: "5121" },
    { area: "Codigo Procesal Civil y Comercial", reference: "Ley 9531 (consolidado por Ley 9924)", numeroNorma: "9531" },
    { area: "Codigo Procesal Penal", reference: "Ley 8933 (consolidado por Ley 9924; implementacion Ley 8934)", numeroNorma: "8933" },
    { area: "Codigo Procesal de Familia", reference: "Ley 9581 (consolidado por Ley 9924)", numeroNorma: "9581" },
    { area: "Codigo Procesal Laboral", reference: "Ley 6204 (consolidado por Ley 9924)", numeroNorma: "6204" },
    { area: "Codigo Procesal Constitucional", reference: "Ley 6944 (consolidado por Ley 9924)", numeroNorma: "6944" },
    { area: "Codigo Procesal Administrativo", reference: "Ley 6205 (consolidado por Ley 9924)", numeroNorma: "6205" },
    { area: "Codigo Rural", reference: "Ley 732", numeroNorma: "732" },
    { area: "Codigo Tributario Comunal", reference: "Ley 5637", numeroNorma: "5637" },
    { area: "Codigo Tributario Municipal", reference: "Ley 4655", numeroNorma: "4655" },
  ],
};
