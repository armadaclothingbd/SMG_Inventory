import { getPurchaseEntries } from "./firebase-config.js";

const EXPORT_DEFAULT_ENTITIES = ["Lumbini", "SML", "SSIL"];
const EXPORT_FLAGS = ["Design Requirement", "Purchased", "Replace", "New", "Extra"];

function toExportQuantity(value) {
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

function getExportEntities(entries) {
  const savedEntities = [...new Set(entries.map((entry) => entry.entity).filter(Boolean))].sort();
  const customEntities = savedEntities.filter((entity) => !EXPORT_DEFAULT_ENTITIES.includes(entity));
  return [...EXPORT_DEFAULT_ENTITIES, ...customEntities];
}

function buildSummarySheet(entries) {
  const entities = getExportEntities(entries);
  const groups = new Map();

  entries.forEach((entry) => {
    const model = entry.model || "-";
    const item = entry.item || "-";
    const entity = entry.entity || "-";
    const flag = entry.flag || "-";
    const key = `${model}|||${item}`;

    if (!groups.has(key)) {
      groups.set(key, {
        model,
        item,
        totals: Object.fromEntries(
          entities.map((entityName) => [
            entityName,
            Object.fromEntries(EXPORT_FLAGS.map((flagName) => [flagName, 0])),
          ]),
        ),
      });
    }

    if (groups.get(key).totals[entity] && groups.get(key).totals[entity][flag] !== undefined) {
      groups.get(key).totals[entity][flag] += toExportQuantity(entry.quantity);
    }
  });

  const topHeader = [
    "Model",
    "Item",
    ...entities.flatMap((entity) => [entity, ...Array(EXPORT_FLAGS.length - 1).fill("")]),
    "Stock",
  ];
  const flagHeader = ["", "", ...entities.flatMap(() => EXPORT_FLAGS), ""];

  const rows = [...groups.values()]
    .sort((a, b) => a.model.localeCompare(b.model) || a.item.localeCompare(b.item))
    .map((group) => {
      const designRequirement = entities.reduce(
        (sum, entity) => sum + group.totals[entity]["Design Requirement"],
        0,
      );
      const deductedQuantity = entities.reduce(
        (sum, entity) =>
          sum +
          group.totals[entity].Purchased +
          group.totals[entity].Replace +
          group.totals[entity].New +
          group.totals[entity].Extra,
        0,
      );

      return [
        group.model,
        group.item,
        ...entities.flatMap((entity) => EXPORT_FLAGS.map((flag) => group.totals[entity][flag] || "")),
        designRequirement - deductedQuantity,
      ];
    });

  const stockColumn = 2 + entities.length * EXPORT_FLAGS.length;
  const merges = [
    "A1:A2",
    "B1:B2",
    `${columnName(stockColumn)}1:${columnName(stockColumn)}2`,
    ...entities.map((_, index) => {
      const startColumn = 2 + index * EXPORT_FLAGS.length;
      const endColumn = startColumn + EXPORT_FLAGS.length - 1;
      return `${columnName(startColumn)}1:${columnName(endColumn)}1`;
    }),
  ];

  return {
    merges,
    rows: [topHeader, flagHeader, ...rows],
  };
}

function buildPurchaseRows(entries) {
  return [
    ["Entity", "Date", "Model", "Item", "Rate", "Quantity", "Currency", "Flag", "Via", "Remarks"],
    ...entries.map((entry) => [
      entry.entity || "",
      entry.date || "",
      entry.model || "",
      entry.item || "",
      Number(entry.rate) || "",
      toExportQuantity(entry.quantity),
      entry.currency || "",
      entry.flag || "",
      entry.via || "",
      entry.remarks || "",
    ]),
  ];
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function columnName(index) {
  let name = "";
  let number = index + 1;

  while (number > 0) {
    const remainder = (number - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    number = Math.floor((number - 1) / 26);
  }

  return name;
}

function sheetXml(rows, merges = []) {
  const sheetData = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          const cellRef = `${columnName(columnIndex)}${rowIndex + 1}`;

          if (typeof value === "number" && Number.isFinite(value)) {
            return `<c r="${cellRef}"><v>${value}</v></c>`;
          }

          return `<c r="${cellRef}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
        })
        .join("");

      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  const mergeCells = merges.length
    ? `<mergeCells count="${merges.length}">${merges
        .map((merge) => `<mergeCell ref="${merge}"/>`)
        .join("")}</mergeCells>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetData}</sheetData>${mergeCells}</worksheet>`;
}

function workbookXml(sheetNames) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetNames
    .map((name, index) => `<sheet name="${xmlEscape(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join("")}</sheets></workbook>`;
}

function workbookRelsXml(sheetCount) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${Array.from(
    { length: sheetCount },
    (_, index) =>
      `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join("")}</Relationships>`;
}

function contentTypesXml(sheetCount) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${Array.from(
    { length: sheetCount },
    (_, index) =>
      `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("")}</Types>`;
}

function rootRelsXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
}

function makeCrcTable() {
  return Array.from({ length: 256 }, (_, index) => {
    let crc = index;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }

    return crc >>> 0;
  });
}

const crcTable = makeCrcTable();

function crc32(bytes) {
  let crc = 0xffffffff;

  bytes.forEach((byte) => {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  });

  return (crc ^ 0xffffffff) >>> 0;
}

function uint16(value) {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function uint32(value) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function textBytes(text) {
  return [...new TextEncoder().encode(text)];
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = textBytes(file.name);
    const dataBytes = textBytes(file.content);
    const crc = crc32(dataBytes);
    const localHeader = [
      ...uint32(0x04034b50),
      ...uint16(20),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint32(crc),
      ...uint32(dataBytes.length),
      ...uint32(dataBytes.length),
      ...uint16(nameBytes.length),
      ...uint16(0),
      ...nameBytes,
    ];

    localParts.push(...localHeader, ...dataBytes);
    centralParts.push(
      ...uint32(0x02014b50),
      ...uint16(20),
      ...uint16(20),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint32(crc),
      ...uint32(dataBytes.length),
      ...uint32(dataBytes.length),
      ...uint16(nameBytes.length),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint32(0),
      ...uint32(offset),
      ...nameBytes,
    );
    offset += localHeader.length + dataBytes.length;
  });

  const endRecord = [
    ...uint32(0x06054b50),
    ...uint16(0),
    ...uint16(0),
    ...uint16(files.length),
    ...uint16(files.length),
    ...uint32(centralParts.length),
    ...uint32(localParts.length),
    ...uint16(0),
  ];

  return new Uint8Array([...localParts, ...centralParts, ...endRecord]);
}

function createWorkbook(sheets) {
  const sheetNames = sheets.map((sheet) => sheet.name);
  const files = [
    { name: "[Content_Types].xml", content: contentTypesXml(sheets.length) },
    { name: "_rels/.rels", content: rootRelsXml() },
    { name: "xl/workbook.xml", content: workbookXml(sheetNames) },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRelsXml(sheets.length) },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      content: sheetXml(sheet.rows, sheet.merges),
    })),
  ];

  return createZip(files);
}

export async function exportReport(preLoadedEntries) {
  const entries = (preLoadedEntries && preLoadedEntries.length > 0) ? preLoadedEntries : await getPurchaseEntries();
  const summarySheet = buildSummarySheet(entries);
  const workbook = createWorkbook([
    { name: "Purchase Entries", rows: buildPurchaseRows(entries) },
    { name: "Summary Pivot", rows: summarySheet.rows, merges: summarySheet.merges },
  ]);
  const blob = new Blob([workbook], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `SMG_Stock_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}
