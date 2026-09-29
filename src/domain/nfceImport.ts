import type { Ingredient } from './types';
import { uid } from '../domain/format';

export interface ParsedProduct {
  id: string;
  name: string;
  weight: number;
  unit: string;
  quantity: number;
  price: number;
}

export interface NfceParseResult {
  products: ParsedProduct[];
  errors: string[];
}

const UNIT_SYNONYMS: Record<string, string[]> = {
  g: ['g', 'grama', 'gramas', 'gram', 'grams'],
  kg: ['kg', 'kilograma', 'kilogramas', 'kilogram',
    'kilograms', 'quilo', 'quilos'],
  ml: ['ml', 'mililitro', 'mililitros', 'milliliter', 'milliliters'],
  l: ['l', 'litro', 'litros', 'liter', 'liters'],
  un: ['un', 'unidade', 'unidades', 'unit', 'units',
    'pc', 'pcs', 'peça', 'peças', 'item', 'items']
};

const NAME_KEYWORDS = ['produto', 'item', 'descricao', 'nome',
  'name', 'description'];
const WEIGHT_KEYWORDS = ['peso', 'quantidade', 'qtd', 'qty',
  'weight', 'amount'];
const UNIT_KEYWORDS = ['unidade', 'un', 'unit', 'medida', 'measure'];
const QUANTITY_KEYWORDS = ['quantidade', 'qtd', 'qty', 'quant', 'count'];
const PRICE_KEYWORDS = ['preco', 'preço', 'valor', 'price',
  'total', 'subtotal'];

const ERR_INVALID_URL = 'URL da NFCe inválida: não foi possível ' +
  'extrair a chave de acesso';
const ERR_NO_SEFAZ = 'Aviso: Importação direta da SEFAZ não ' +
  'disponível. Cole os dados CSV da nota fiscal.';
const ERR_UNKNOWN_FORMAT = 'Formato não reconhecido. Cole o CSV ' +
  'da nota fiscal ou uma URL da NFCe.';

export function normalizeUnit(unit: string): string {
  const u = unit.toLowerCase().trim();
  for (const [canonical, synonyms] of Object.entries(UNIT_SYNONYMS)) {
    if (synonyms.includes(u)) return canonical;
  }
  return 'un';
}

export function parseNumber(value: string): number {
  if (!value) return 0;
  const cleaned = value.replace(/[^\d.,-]/g, '').replace(',', '.');
  const num = Number(cleaned);
  return isNaN(num) ? 0 : num;
}

export function extractChaveFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const p = parsed.searchParams.get('p');
    if (p) {
      const parts = p.split('|');
      if (parts[0].length === 44) return parts[0];
    }
    return null;
  } catch {
    return null;
  }
}

function detectDelimiter(line: string): string {
  const commaCount = (line.match(/,/g) || []).length;
  const semiCount = (line.match(/;/g) || []).length;
  const tabCount = (line.match(/\t/g) || []).length;
  if (semiCount > commaCount && semiCount > tabCount) return ';';
  if (tabCount > commaCount && tabCount > semiCount) return '\t';
  return ',';
}

export function parseCsvLine(line: string, delimiter?: string): string[] {
  const delim = delimiter ?? detectDelimiter(line);
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delim && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function findColumnIndex(headers: string[], keywords: string[]): number {
  const lower = headers.map(h => h.toLowerCase());
  return lower.findIndex(h => keywords.some(k => h.includes(k)));
}

export function detectCsvColumns(headers: string[]): {
  name: number;
  weight: number;
  unit: number;
  quantity: number;
  price: number;
} {
  return {
    name: findColumnIndex(headers, NAME_KEYWORDS),
    weight: findColumnIndex(headers, WEIGHT_KEYWORDS),
    unit: findColumnIndex(headers, UNIT_KEYWORDS),
    quantity: findColumnIndex(headers, QUANTITY_KEYWORDS),
    price: findColumnIndex(headers, PRICE_KEYWORDS)
  };
}

export function buildProductFromRow(
  cells: string[],
  cols: ReturnType<typeof detectCsvColumns>
): ParsedProduct | null {
  const name = cols.name >= 0 ? cells[cols.name] : cells[0];
  if (!name) return null;

  const weight = cols.weight >= 0 ? parseNumber(cells[cols.weight]) : 0;
  const unit = cols.unit >= 0 ? normalizeUnit(cells[cols.unit]) : 'un';
  const quantity = cols.quantity >= 0
    ? parseNumber(cells[cols.quantity])
    : (weight > 0 ? 1 : 0);
  const price = cols.price >= 0 ? parseNumber(cells[cols.price]) : 0;

  return {
    id: uid(),
    name: name.trim(),
    weight,
    unit,
    quantity,
    price
  };
}

export function parseCsv(csvText: string): ParsedProduct[] {
  const lines = csvText.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter);
  const cols = detectCsvColumns(headers);

  const products: ParsedProduct[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i], delimiter);
    if (cells.length < 2) continue;

    const product = buildProductFromRow(cells, cols);
    if (product) products.push(product);
  }

  return products;
}

export function handleUrlInput(
  trimmed: string, errors: string[]
): NfceParseResult | null {
  const chave = extractChaveFromUrl(trimmed);
  if (!chave) {
    errors.push(ERR_INVALID_URL);
    return { products: [], errors };
  }
  errors.push(ERR_NO_SEFAZ);
  return { products: [], errors };
}

export function handleCsvInput(
  trimmed: string, errors: string[]
): NfceParseResult {
  const hasDelimiter = trimmed.includes(',') ||
    trimmed.includes('\t') || trimmed.includes(';');
  if (hasDelimiter) {
    return { products: parseCsv(trimmed), errors };
  }
  errors.push(ERR_UNKNOWN_FORMAT);
  return { products: [], errors };
}

export function parseNfceInput(input: string): NfceParseResult {
  const errors: string[] = [];
  const trimmed = input.trim();

  if (trimmed.startsWith('http')) {
    const urlResult = handleUrlInput(trimmed, errors);
    if (urlResult) return urlResult;
  }
  return handleCsvInput(trimmed, errors);
}

export function deduplicateProducts(
  products: ParsedProduct[]
): ParsedProduct[] {
  const map = new Map<string, ParsedProduct>();

  for (const p of products) {
    const key = `${p.name.toLowerCase()}|${p.unit}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += p.quantity;
      existing.price += p.price;
      existing.weight = Math.max(existing.weight, p.weight);
    } else {
      map.set(key, { ...p });
    }
  }

  return Array.from(map.values());
}

export function productsToIngredients(
  products: ParsedProduct[]
): Omit<Ingredient, 'id'>[] {
  return products.map(p => ({
    name: p.name,
    unit: p.unit as Ingredient['unit'],
    packageSize: p.weight > 0 ? p.weight : p.quantity,
    packagePrice: p.price,
    stock: 0,
    minStock: 0
  }));
}