export type ProvincialCodeCatalogEntry = {
  area: string;
  reference: string;
  numeroNorma?: string;
  searchTerms?: string[];
};

export const PROVINCIAL_CODES_CATALOG: Record<string, ProvincialCodeCatalogEntry[]> = {
  "Ciudad Autonoma de Buenos Aires": [
    { area: "Civil y Comercial", reference: "Ley 17454", numeroNorma: "17454" },
    { area: "Penal (Justicia Local)", reference: "Ley 13", numeroNorma: "13", searchTerms: ["justicia local"] },
    { area: "Relaciones de Consumo", reference: "Ley 6407", numeroNorma: "6407", searchTerms: ["consumo"] },
    {
      area: "Contencioso Administrativo y Tributario",
      reference: "Ley 189",
      numeroNorma: "189",
      searchTerms: ["tributario", "contencioso"],
    },
    { area: "Procedimientos ante Tribunal Superior", reference: "Ley 402", numeroNorma: "402", searchTerms: ["tribunal superior"] },
  ],
  "Buenos Aires": [
    { area: "Civil y Comercial", reference: "Ley 7425", numeroNorma: "7425" },
    { area: "Penal", reference: "Ley 11922", numeroNorma: "11922" },
    { area: "Laboral", reference: "Ley 11653", numeroNorma: "11653" },
    { area: "Contencioso Administrativo", reference: "Ley 12008", numeroNorma: "12008" },
    { area: "Familia", reference: "Ley 13634", numeroNorma: "13634" },
  ],
  Catamarca: [
    { area: "Civil y Comercial", reference: "Ley 2339", numeroNorma: "2339" },
    { area: "Penal", reference: "Ley 5425", numeroNorma: "5425" },
    { area: "Laboral", reference: "Ley 4799", numeroNorma: "4799" },
    { area: "Mineria", reference: "Ley 5682", numeroNorma: "5682" },
    { area: "Administrativo", reference: "Ley 3559", numeroNorma: "3559" },
  ],
  Chaco: [
    { area: "Civil y Comercial", reference: "Ley 2559", numeroNorma: "2559" },
    { area: "Penal", reference: "Ley 965", numeroNorma: "965" },
    { area: "Laboral", reference: "Ley 2225-O", numeroNorma: "2225" },
    { area: "Administrativo", reference: "Ley 179", numeroNorma: "179" },
  ],
  Chubut: [
    { area: "Civil y Comercial", reference: "Ley XIII-5", numeroNorma: "XIII-5" },
    { area: "Penal", reference: "Ley XV-9", numeroNorma: "XV-9" },
    { area: "Laboral", reference: "Ley XIV-1", numeroNorma: "XIV-1" },
  ],
  Cordoba: [
    { area: "Civil y Comercial", reference: "Ley 8465", numeroNorma: "8465" },
    { area: "Penal", reference: "Ley 8123", numeroNorma: "8123" },
    { area: "Tributario (Procedimiento)", reference: "Ley 6006", numeroNorma: "6006", searchTerms: ["tributario"] },
  ],
  Corrientes: [
    { area: "Civil y Comercial", reference: "Ley 6556", numeroNorma: "6556" },
    { area: "Penal", reference: "Ley 6518", numeroNorma: "6518" },
    { area: "Laboral", reference: "Ley 6742", numeroNorma: "6742" },
    { area: "Constitucional", reference: "Ley 5676", numeroNorma: "5676" },
  ],
  "Entre Rios": [
    { area: "Civil y Comercial", reference: "Ley 9776", numeroNorma: "9776" },
    { area: "Penal", reference: "Ley 9754", numeroNorma: "9754" },
    { area: "Laboral", reference: "Ley 5315", numeroNorma: "5315" },
    { area: "Familia", reference: "Ley 10668", numeroNorma: "10668" },
    { area: "Contencioso Administrativo", reference: "Ley 7061", numeroNorma: "7061" },
    {
      area: "Fiscal (Procedimiento)",
      reference: "Codigo Fiscal T.O. 2018/2022",
      searchTerms: ["codigo fiscal", "to 2018", "to 2022"],
    },
  ],
  Formosa: [
    { area: "Civil y Comercial", reference: "Ley 1445", numeroNorma: "1445" },
    { area: "Penal", reference: "Ley 696", numeroNorma: "696" },
    { area: "Laboral", reference: "Ley 639", numeroNorma: "639" },
    { area: "Familia", reference: "Ley 866", numeroNorma: "866", searchTerms: ["tribunal de familia"] },
    { area: "Administrativo", reference: "Decreto-Ley 584/78", numeroNorma: "584/78", searchTerms: ["procedimiento administrativo"] },
    { area: "Fiscal", reference: "Ley 1589", numeroNorma: "1589" },
  ],
  Jujuy: [
    { area: "Civil y Comercial", reference: "Ley 6358", numeroNorma: "6358" },
    { area: "Penal", reference: "Ley 6259", numeroNorma: "6259" },
    { area: "Laboral", reference: "Ley 6361", numeroNorma: "6361" },
    { area: "Constitucional", reference: "Ley 6360", numeroNorma: "6360" },
    { area: "Familia", reference: "Ley 6362", numeroNorma: "6362" },
    { area: "Mineria", reference: "Ley 5186", numeroNorma: "5186" },
  ],
  "La Pampa": [
    { area: "Civil y Comercial", reference: "Ley 1828", numeroNorma: "1828" },
    { area: "Penal", reference: "Ley 3584", numeroNorma: "3584" },
    { area: "Laboral", reference: "Norma Juridica de Facto 986", numeroNorma: "986", searchTerms: ["laboral"] },
    { area: "Administrativo", reference: "Ley 1888", numeroNorma: "1888" },
    { area: "Habeas Corpus", reference: "Ley 267", numeroNorma: "267", searchTerms: ["habeas corpus"] },
  ],
  "La Rioja": [
    { area: "Civil y Comercial", reference: "Ley 9427", numeroNorma: "9427" },
    { area: "Penal", reference: "Ley 10797", numeroNorma: "10797" },
    { area: "Mineria", reference: "Ley 7277", numeroNorma: "7277" },
  ],
  Mendoza: [
    { area: "Civil, Comercial y Tributario", reference: "Ley 9001", numeroNorma: "9001" },
    { area: "Penal", reference: "Ley 6730", numeroNorma: "6730" },
    { area: "Laboral", reference: "Ley 9109", numeroNorma: "9109" },
    { area: "Administrativo", reference: "Ley 3918", numeroNorma: "3918" },
    { area: "Mineria", reference: "Ley 9529", numeroNorma: "9529" },
  ],
  Misiones: [
    { area: "Civil, Comercial, de Familia y Violencia", reference: "Ley XII-27", numeroNorma: "XII-27" },
    { area: "Penal", reference: "Ley VI-152", numeroNorma: "VI-152" },
    { area: "Laboral", reference: "Ley XIII-2", numeroNorma: "XIII-2" },
  ],
  Neuquen: [
    { area: "Civil Adversarial", reference: "Ley 3551", numeroNorma: "3551" },
    { area: "Penal", reference: "Ley 2784", numeroNorma: "2784" },
    { area: "Administrativo", reference: "Ley 1305", numeroNorma: "1305" },
    { area: "Fiscal", reference: "Ley 2680", numeroNorma: "2680" },
  ],
  "Rio Negro": [
    { area: "Civil y Comercial", reference: "Ley 4142", numeroNorma: "4142" },
    { area: "Penal", reference: "Ley 5020", numeroNorma: "5020" },
    { area: "Laboral", reference: "Ley 5631", numeroNorma: "5631" },
    { area: "Constitucional", reference: "Ley 5776", numeroNorma: "5776" },
    { area: "Mineria", reference: "Ley 5702", numeroNorma: "5702" },
  ],
  Salta: [
    { area: "Civil y Comercial", reference: "Ley 5233", numeroNorma: "5233" },
    { area: "Penal", reference: "Ley 7690", numeroNorma: "7690" },
    { area: "Laboral", reference: "Ley 5298", numeroNorma: "5298" },
    { area: "Administrativo", reference: "Ley 5348", numeroNorma: "5348" },
    { area: "Mineria", reference: "Ley 7141", numeroNorma: "7141" },
  ],
  "San Juan": [
    { area: "Civil, Comercial y Mineria", reference: "Ley 988-O", numeroNorma: "988-O" },
    { area: "Penal", reference: "Ley 754-O", numeroNorma: "754-O" },
    { area: "Laboral", reference: "Ley 337-A", numeroNorma: "337-A" },
    { area: "Administrativo", reference: "Ley 1995-A", numeroNorma: "1995-A" },
    { area: "Tributario", reference: "Ley 2803", numeroNorma: "2803" },
  ],
  "San Luis": [
    { area: "Civil y Comercial", reference: "Ley VI-0150", numeroNorma: "VI-0150" },
    { area: "Penal", reference: "Ley VI-0152", numeroNorma: "VI-0152" },
    { area: "Laboral", reference: "Ley VI-0153", numeroNorma: "VI-0153" },
    { area: "Administrativo", reference: "Ley VI-0156", numeroNorma: "VI-0156" },
    { area: "Tributario", reference: "Ley VI-0154", numeroNorma: "VI-0154" },
  ],
  "Santa Cruz": [
    { area: "Civil y Comercial", reference: "Ley 1418", numeroNorma: "1418" },
    { area: "Penal", reference: "Ley 2424", numeroNorma: "2424" },
    { area: "Administrativo", reference: "Ley 2600", numeroNorma: "2600" },
  ],
  "Santa Fe": [
    { area: "Civil y Comercial", reference: "Ley 5531", numeroNorma: "5531" },
    { area: "Penal", reference: "Ley 12734", numeroNorma: "12734" },
    { area: "Laboral", reference: "Ley 7945", numeroNorma: "7945" },
    { area: "Faltas/Contravencional", reference: "Ley 10703", numeroNorma: "10703" },
  ],
  "Santiago del Estero": [
    { area: "Civil y Comercial", reference: "Ley 6910", numeroNorma: "6910" },
    { area: "Penal", reference: "Ley 6941", numeroNorma: "6941" },
    { area: "Laboral", reference: "Ley 7049", numeroNorma: "7049" },
    { area: "Faltas", reference: "Ley 6913", numeroNorma: "6913" },
  ],
  "Tierra del Fuego": [
    { area: "Civil, Comercial, Laboral, Rural y Minero", reference: "Ley 147", numeroNorma: "147" },
    { area: "Penal", reference: "Ley 168", numeroNorma: "168" },
    { area: "Administrativo", reference: "Ley 133", numeroNorma: "133" },
  ],
  Tucuman: [
    { area: "Civil y Comercial", reference: "Ley 9531", numeroNorma: "9531" },
    { area: "Penal (Nuevo)", reference: "Ley 8933", numeroNorma: "8933" },
    { area: "Laboral", reference: "Ley 6204", numeroNorma: "6204" },
    { area: "Constitucional", reference: "Ley 6944", numeroNorma: "6944" },
    { area: "Administrativo", reference: "Ley 6205", numeroNorma: "6205" },
    { area: "Familia", reference: "Ley 9581", numeroNorma: "9581" },
  ],
};
