import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const workbookPath = process.env.MODEL_WORKBOOK
  ? path.resolve(projectRoot, process.env.MODEL_WORKBOOK)
  : path.resolve(projectRoot, '..', '模型test.xlsx');
const outputDir = path.resolve(projectRoot, 'src', 'data');

const REQUIRED_SHEETS = ['核算端', '后台数据', '单位统一与碳足迹核算'];
const DEFAULT_KEY = '2021_广东';
// 后台数据 D 列（索引 3）是“作物”。该表现在同时存放稻谷 / 小麦 / 玉米三种作物，
// 同步时必须按作物筛选，否则同一个“年份_省份”键会被后面作物的行覆盖。
const BACKEND_CROP_COLUMN = 3;
const DEFAULT_CROP = '稻谷';
const TARGET_CROP = (process.env.MODEL_CROP || '').trim() || DEFAULT_CROP;

function fail(message) {
  console.error(`[sync-excel] ${message}`);
  process.exit(1);
}

function toRows(sheet) {
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: false,
  });
}

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function asNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function round(value, digits = 12) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function formulaAt(sheet, rowIndex, colIndex) {
  const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
  const cell = sheet[address];
  if (!cell) return '';
  if (cell.f) return `=${cell.f}`;
  return asText(cell.v);
}

function parseVlookupColumn(formula, context) {
  const normalized = asText(formula).replace(/\s+/g, '');
  const match = normalized.match(/,(\d+),(?:FALSE|0)\)?$/i);
  if (!match) {
    fail(`无法解析 ${context} 的 VLOOKUP 列号：${formula || '(空)'}`);
  }
  return Number(match[1]);
}

function parseLiteralFormula(formula) {
  const match = asText(formula).match(/^="?([^"]+)"?$/);
  return match ? match[1] : '';
}

function findTotalRow(mainRows) {
  const totalIndex = mainRows.findIndex((row) => asText(row[0]) === '碳足迹总计');
  if (totalIndex < 0) fail('核算端中没有找到“碳足迹总计”行。');
  return totalIndex;
}

function extractCategories(mainSheet, mainRows) {
  const totalRow = findTotalRow(mainRows);
  const categories = [];

  for (let rowIndex = 4; rowIndex < totalRow; rowIndex += 1) {
    const row = mainRows[rowIndex] ?? [];
    const name = asText(row[0]);
    if (!name) continue;

    const strengthFormula = formulaAt(mainSheet, rowIndex, 1);
    const sourceColumn = parseVlookupColumn(strengthFormula, `核算端 ${name} 投入强度`);
    const factor = asNumber(row[3]);
    if (factor === null) fail(`核算端 ${name} 缺少可用的足迹系数。`);

    categories.push({
      id: `item_${categories.length + 1}`,
      name,
      sourceColumn,
      strengthUnit: asText(row[2]),
      factor: round(factor),
      factorUnit: asText(row[4]),
      resultUnit: 'kg CO₂e/kg 稻谷',
    });
  }

  if (categories.length === 0) fail('核算端没有可同步的投入类别。');
  return categories;
}

function extractStatusRules(summarySheet, summaryRows, categories) {
  const categoryNames = new Set(categories.map((category) => category.name));
  const statusRules = new Map();

  summaryRows.forEach((row, rowIndex) => {
    const name = asText(row[0]);
    if (!categoryNames.has(name)) return;

    const statusFormula = formulaAt(summarySheet, rowIndex, 4);
    const vlookupColumn = statusFormula.includes('VLOOKUP')
      ? parseVlookupColumn(statusFormula, `单位统一与碳足迹核算 ${name} 数据状态`)
      : null;

    statusRules.set(name, {
      backendLabel: asText(row[3]),
      literalStatus: vlookupColumn ? '' : parseLiteralFormula(statusFormula || row[4]),
      statusColumn: vlookupColumn,
      note: asText(row[9]),
    });
  });

  return statusRules;
}

function extractAssumptions(summaryRows) {
  const assumptions = [];
  let inAssumptionBlock = false;

  summaryRows.forEach((row) => {
    if (asText(row[0]) === '关键假设与单位处理') {
      inAssumptionBlock = true;
      return;
    }
    if (!inAssumptionBlock) return;

    const index = asText(row[0]);
    const text = asText(row[1]);
    if (/^\d+$/.test(index) && text) {
      assumptions.push(text);
    }
  });

  return assumptions.slice(0, 12);
}

function buildRecords(backendRows, categories, statusRules, crop) {
  const records = {};
  const years = new Set();
  const provinces = new Set();
  const cropCounts = new Map();
  let skippedRows = 0;

  backendRows.slice(3).forEach((row) => {
    const province = asText(row[1]);
    const year = asNumber(row[2]);
    const rowCrop = asText(row[BACKEND_CROP_COLUMN]);
    if (rowCrop) cropCounts.set(rowCrop, (cropCounts.get(rowCrop) ?? 0) + 1);
    if (!province || year === null) return;

    // 只保留目标作物；其余作物（小麦 / 玉米）直接跳过，避免覆盖稻谷结果。
    if (rowCrop && rowCrop !== crop) {
      skippedRows += 1;
      return;
    }

    const items = categories.map((category) => {
      const strength = asNumber(row[category.sourceColumn - 1]);
      const carbonFootprint =
        strength === null ? null : round(strength * category.factor);
      const statusRule = statusRules.get(category.name);
      const status =
        statusRule?.statusColumn ?
          asText(row[statusRule.statusColumn - 1]) :
          (statusRule?.literalStatus ?? '');

      return {
        id: category.id,
        name: category.name,
        strength: round(strength),
        strengthUnit: category.strengthUnit,
        factor: category.factor,
        factorUnit: category.factorUnit,
        carbonFootprint,
        resultUnit: category.resultUnit,
        dataStatus: status || '未标注',
        note: statusRule?.note ?? '',
        backendColumn: category.sourceColumn,
      };
    });

    const total = round(
      items.reduce((sum, item) => sum + (item.carbonFootprint ?? 0), 0),
    );
    const key = `${year}_${province}`;
    if (records[key]) {
      console.warn(`[sync-excel] 警告：${key}（${crop}）在后台数据中出现多次，后一行会覆盖前一行。`);
    }

    years.add(year);
    provinces.add(province);
    records[key] = {
      key,
      year,
      province,
      crop,
      total,
      perTon: round((total ?? 0) * 1000),
      unit: 'kg CO₂e/kg 稻谷',
      perTonUnit: 'kg CO₂e/t 稻谷',
      items,
    };
  });

  if (Object.keys(records).length === 0) {
    const available = Array.from(cropCounts.keys()).join('、') || '(无)';
    fail(`后台数据中没有作物为“${crop}”的数据行，可选作物：${available}。可用 MODEL_CROP 环境变量指定。`);
  }

  if (!records[DEFAULT_KEY]) fail(`没有找到默认记录 ${DEFAULT_KEY}（作物：${crop}）。`);
 
  return {
    records,
    years: Array.from(years).sort((a, b) => a - b),
    provinces: Array.from(provinces).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
    cropCounts,
    skippedRows,
  };
}

if (!fs.existsSync(workbookPath)) {
  fail(`找不到源工作簿：${workbookPath}`);
}

const workbook = XLSX.readFile(workbookPath, {
  cellFormula: true,
  cellDates: true,
});

for (const sheetName of REQUIRED_SHEETS) {
  if (!workbook.SheetNames.includes(sheetName)) {
    fail(`源工作簿缺少关键 sheet：${sheetName}`);
  }
}

const mainSheet = workbook.Sheets['核算端'];
const backendSheet = workbook.Sheets['后台数据'];
const summarySheet = workbook.Sheets['单位统一与碳足迹核算'];
const mainRows = toRows(mainSheet);
const backendRows = toRows(backendSheet);
const summaryRows = toRows(summarySheet);

const categories = extractCategories(mainSheet, mainRows);
const statusRules = extractStatusRules(summarySheet, summaryRows, categories);
const assumptions = extractAssumptions(summaryRows);
// 核算端 B3 是 Excel 当前下拉选中的作物，只用于提示，不覆盖 MODEL_CROP。
const sheetCrop = asText((mainRows[2] ?? [])[1]);
if (sheetCrop && sheetCrop !== TARGET_CROP && !process.env.MODEL_CROP) {
  console.warn(
    `[sync-excel] 提示：核算端当前作物是“${sheetCrop}”，但本次同步按默认作物“${TARGET_CROP}”导出。如需导出其他作物，请设置 MODEL_CROP=作物名。`,
  );
}

const { records, years, provinces, cropCounts, skippedRows } = buildRecords(
  backendRows,
  categories,
  statusRules,
  TARGET_CROP,
);

const modelData = {
  syncedAt: new Date().toISOString(),
  sourceWorkbook: path.relative(projectRoot, workbookPath).replaceAll('\\', '/'),
  crop: TARGET_CROP,
  defaultSelection: { year: 2021, province: '广东' },
  years,
  provinces,
  categories,
  records,
};

const modelMeta = {
  title: '北京师范大学中国省级农食系统LCA碳足迹核算平台',
  sourceWorkbook: modelData.sourceWorkbook,
  syncedAt: modelData.syncedAt,
  dataRange: {
    years: `${years[0]}-${years.at(-1)}`,
    yearCount: years.length,
    provinceCount: provinces.length,
    recordCount: Object.keys(records).length,
  },
  crop: TARGET_CROP,
  formulas: [
    '投入强度 = 投入量 / 稻谷产量',
    '分项碳足迹 = 投入强度 × 系数',
    '单位碳足迹 = Σ 分项碳足迹',
    'kg CO₂e/t 稻谷 = kg CO₂e/kg 稻谷 × 1000',
  ],
  assumptions,
  syncNotes: [
    '更新 Excel 后运行 npm run sync-excel，网站数据会重新生成。',
    '新增年份或省份需继续保存在“后台数据”现有字段结构中。',
    '新增核算项需继续使用“核算端”的六列结构，并保留“碳足迹总计”行。',
    '后台数据含多个作物时，同步只导出 MODEL_CROP 指定的作物（默认稻谷）。',
  ],
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  path.join(outputDir, 'model-data.json'),
  `${JSON.stringify(modelData, null, 2)}\n`,
  'utf8',
);
fs.writeFileSync(
  path.join(outputDir, 'model-meta.json'),
  `${JSON.stringify(modelMeta, null, 2)}\n`,
  'utf8',
);

const cropSummary = Array.from(cropCounts.entries())
  .map(([name, count]) => `${name}:${count}`)
  .join('，');

console.log(
  `[sync-excel] synced ${Object.keys(records).length} records, ${years.length} years, ${provinces.length} provinces from ${path.basename(workbookPath)}`,
);
console.log(
  `[sync-excel] 作物 = ${TARGET_CROP}；后台数据作物分布 ${cropSummary}；已跳过其他作物 ${skippedRows} 行`,
);
