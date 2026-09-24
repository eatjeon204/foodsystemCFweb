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
// 后台数据 D 列（索引 3）是“作物”。该表同时存放稻谷 / 小麦 / 玉米三种作物，
// 记录主键必须带上作物，否则同一个“年份_省份”键会被后面的作物行覆盖。
const BACKEND_CROP_COLUMN = 3;
const CROP_ORDER = ['稻谷', '小麦', '玉米'];
const DEFAULT_CROP = '稻谷';
// 默认导出后台数据里的全部作物；可用 MODEL_CROPS=稻谷,小麦 只导出指定作物。
const REQUESTED_CROPS = (process.env.MODEL_CROPS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

function sortCrops(names) {
  return [...names].sort((a, b) => {
    const ia = CROP_ORDER.indexOf(a);
    const ib = CROP_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b, 'zh-Hans-CN');
  });
}

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

// 三作物一起导出时 JSON 会到几 MB，数值保留 8 位小数足够展示（界面最多 4 位）。
function round(value, digits = 8) {
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

function collectCropCounts(backendRows) {
  const cropCounts = new Map();
  backendRows.slice(3).forEach((row) => {
    const rowCrop = asText(row[BACKEND_CROP_COLUMN]);
    if (rowCrop) cropCounts.set(rowCrop, (cropCounts.get(rowCrop) ?? 0) + 1);
  });
  return cropCounts;
}

// 核算端的系数对三种作物通用，只有名称里的作物要跟着换。
function categoriesForCrop(categories, crop) {
  return categories.map((category) => ({
    ...category,
    strengthUnit: category.strengthUnit.replaceAll('稻谷', crop),
    resultUnit: `kg CO₂e/kg ${crop}`,
  }));
}

function buildRecords(backendRows, categoriesByCrop, statusRules, crops) {
  const records = {};
  const years = new Set();
  const provinces = new Set();
  const perCropKeys = new Map(crops.map((crop) => [crop, new Set()]));

  backendRows.slice(3).forEach((row) => {
    const province = asText(row[1]);
    const year = asNumber(row[2]);
    const rowCrop = asText(row[BACKEND_CROP_COLUMN]);
    if (!province || year === null) return;
    if (!crops.includes(rowCrop)) return;

    const categories = categoriesByCrop[rowCrop];
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
        dataStatus: status || '未标注',
      };
    });

    const total = round(
      items.reduce((sum, item) => sum + (item.carbonFootprint ?? 0), 0),
    );
    const key = `${year}_${province}_${rowCrop}`;
    if (records[key]) {
      console.warn(`[sync-excel] 警告：${key} 在后台数据中出现多次，后一行会覆盖前一行。`);
    }

    years.add(year);
    provinces.add(province);
    perCropKeys.get(rowCrop).add(key);
    records[key] = {
      key,
      year,
      province,
      crop: rowCrop,
      total,
      perTon: round((total ?? 0) * 1000),
      unit: `kg CO₂e/kg ${rowCrop}`,
      perTonUnit: `kg CO₂e/t ${rowCrop}`,
      items,
    };
  });

  return {
    records,
    years: Array.from(years).sort((a, b) => a - b),
    provinces: Array.from(provinces).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
    perCropKeys,
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
const cropCounts = collectCropCounts(backendRows);
const availableCrops = sortCrops(cropCounts.keys());
if (availableCrops.length === 0) fail('后台数据中没有找到任何作物数据行。');

const unknownCrops = REQUESTED_CROPS.filter((crop) => !availableCrops.includes(crop));
if (unknownCrops.length > 0) {
  fail(`MODEL_CROPS 里的作物在后台数据中不存在：${unknownCrops.join('、')}。可选：${availableCrops.join('、')}`);
}

const crops = REQUESTED_CROPS.length > 0 ? sortCrops(REQUESTED_CROPS) : availableCrops;
const defaultCrop = crops.includes(DEFAULT_CROP) ? DEFAULT_CROP : crops[0];

const categoriesByCrop = Object.fromEntries(
  crops.map((crop) => [crop, categoriesForCrop(categories, crop)]),
);

const { records, years, provinces, perCropKeys } = buildRecords(
  backendRows,
  categoriesByCrop,
  statusRules,
  crops,
);

for (const crop of crops) {
  if ((perCropKeys.get(crop)?.size ?? 0) === 0) {
    fail(`后台数据中没有作物“${crop}”的可用数据行。`);
  }
}
if (!records[`${DEFAULT_KEY}_${defaultCrop}`]) {
  fail(`没有找到默认记录 ${DEFAULT_KEY}（作物：${defaultCrop}）。`);
}

const modelData = {
  syncedAt: new Date().toISOString(),
  sourceWorkbook: path.relative(projectRoot, workbookPath).replaceAll('\\', '/'),
  crop: defaultCrop,
  crops,
  defaultSelection: { year: 2021, province: '广东', crop: defaultCrop },
  years,
  provinces,
  categories: categoriesByCrop[defaultCrop],
  categoriesByCrop,
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
    cropCount: crops.length,
  },
  crop: defaultCrop,
  crops,
  formulas: [
    '投入强度 = 投入量 / 作物产量',
    '分项碳足迹 = 投入强度 × 系数',
    '单位碳足迹 = Σ 分项碳足迹',
    'kg CO₂e/t = kg CO₂e/kg × 1000',
  ],
  assumptions,
  syncNotes: [
    '更新 Excel 后运行 npm run sync-excel，网站数据会重新生成。',
    '新增年份或省份需继续保存在“后台数据”现有字段结构中。',
    '新增核算项需继续使用“核算端”的六列结构，并保留“碳足迹总计”行。',
    '后台数据按“作物”列区分稻谷 / 小麦 / 玉米，记录主键为 年份_省份_作物。',
    '可用 MODEL_CROPS=稻谷,小麦 只导出指定作物；默认导出全部作物。',
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

console.log(
  `[sync-excel] synced ${Object.keys(records).length} records, ${years.length} years, ${provinces.length} provinces from ${path.basename(workbookPath)}`,
);
crops.forEach((crop) => {
  const count = perCropKeys.get(crop)?.size ?? 0;
  const inWorkbook = cropCounts.get(crop) ?? 0;
  console.log(
    `[sync-excel] 作物 ${crop}：导出 ${count} 条（后台数据原始 ${inWorkbook} 行）`,
  );
});
