import { describe, it, expect } from 'vitest';
import {
  parseNfceInput,
  parseCsv,
  parseCsvLine,
  parseNumber,
  detectCsvColumns,
  buildProductFromRow,
  normalizeUnit,
  deduplicateProducts,
  productsToIngredients,
  type ParsedProduct
} from '../../src/domain/nfceImport';

describe('nfceImport.ts - NFCe import helpers', () => {
  describe('normalizeUnit', () => {
    it('normalizes gram variations to g', () => {
      expect(normalizeUnit('g')).toBe('g');
      expect(normalizeUnit('grama')).toBe('g');
      expect(normalizeUnit('gramas')).toBe('g');
      expect(normalizeUnit('GRAMAS')).toBe('g');
    });

    it('normalizes kilogram variations to kg', () => {
      expect(normalizeUnit('kg')).toBe('kg');
      expect(normalizeUnit('kilograma')).toBe('kg');
      expect(normalizeUnit('quilo')).toBe('kg');
      expect(normalizeUnit('QUILOS')).toBe('kg');
    });

    it('normalizes milliliter variations to ml', () => {
      expect(normalizeUnit('ml')).toBe('ml');
      expect(normalizeUnit('mililitro')).toBe('ml');
      expect(normalizeUnit('MILILITROS')).toBe('ml');
    });

    it('normalizes liter variations to l', () => {
      expect(normalizeUnit('l')).toBe('l');
      expect(normalizeUnit('litro')).toBe('l');
      expect(normalizeUnit('LITROS')).toBe('l');
    });

    it('normalizes unit variations to un', () => {
      expect(normalizeUnit('un')).toBe('un');
      expect(normalizeUnit('unidade')).toBe('un');
      expect(normalizeUnit('peça')).toBe('un');
      expect(normalizeUnit('PC')).toBe('un');
      expect(normalizeUnit('item')).toBe('un');
    });

    it('defaults to un for unknown units', () => {
      expect(normalizeUnit('xyz')).toBe('un');
      expect(normalizeUnit('')).toBe('un');
    });
  });

  describe('parseNumber', () => {
    it('parses integer strings', () => {
      expect(parseNumber('10')).toBe(10);
      expect(parseNumber('0')).toBe(0);
    });

    it('parses decimal strings with comma', () => {
      expect(parseNumber('10,50')).toBe(10.5);
      expect(parseNumber('0,99')).toBe(0.99);
    });

    it('parses decimal strings with dot', () => {
      expect(parseNumber('10.50')).toBe(10.5);
    });

    it('ignores currency symbols and spaces', () => {
      expect(parseNumber('R$ 10,50')).toBe(10.5);
      expect(parseNumber('  100  ')).toBe(100);
    });

    it('returns 0 for invalid input', () => {
      expect(parseNumber('abc')).toBe(0);
      expect(parseNumber('')).toBe(0);
    });
  });

  describe('parseCsvLine', () => {
    it('parses simple CSV line', () => {
      expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
    });

    it('handles quoted fields', () => {
      expect(parseCsvLine('"a,b",c')).toEqual(['a,b', 'c']);
    });

    it('handles escaped quotes', () => {
      expect(parseCsvLine('"a""b",c')).toEqual(['a"b', 'c']);
    });

    it('handles empty fields', () => {
      expect(parseCsvLine('a,,c')).toEqual(['a', '', 'c']);
    });
  });

  describe('detectCsvColumns', () => {
    it('detects standard Portuguese column names', () => {
      const headers = ['Produto', 'Peso', 'Unidade', 'Quantidade', 'Preço'];
      const cols = detectCsvColumns(headers);
      expect(cols.name).toBe(0);
      expect(cols.weight).toBe(1);
      expect(cols.unit).toBe(2);
      expect(cols.quantity).toBe(3);
      expect(cols.price).toBe(4);
    });

    it('detects English column names', () => {
      const headers = ['name', 'weight', 'unit', 'quantity', 'price'];
      const cols = detectCsvColumns(headers);
      expect(cols.name).toBe(0);
      expect(cols.weight).toBe(1);
      expect(cols.unit).toBe(2);
      expect(cols.quantity).toBe(3);
      expect(cols.price).toBe(4);
    });

    it('returns -1 for missing columns', () => {
      const headers = ['Produto'];
      const cols = detectCsvColumns(headers);
      expect(cols.name).toBe(0);
      expect(cols.weight).toBe(-1);
      expect(cols.unit).toBe(-1);
    });
  });

  describe('buildProductFromRow', () => {
    it('builds product from CSV row with all columns', () => {
      const cells = ['Arroz', '1', 'kg', '2', '25,00'];
      const cols = { name: 0, weight: 1, unit: 2, quantity: 3, price: 4 };
      const product = buildProductFromRow(cells, cols);
      expect(product).not.toBeNull();
      expect(product!.name).toBe('Arroz');
      expect(product!.weight).toBe(1);
      expect(product!.unit).toBe('kg');
      expect(product!.quantity).toBe(2);
      expect(product!.price).toBe(25);
    });

    it('defaults missing columns', () => {
      const cells = ['Feijão'];
      const cols = { name: 0, weight: -1, unit: -1, quantity: -1, price: -1 };
      const product = buildProductFromRow(cells, cols);
      expect(product).not.toBeNull();
      expect(product!.name).toBe('Feijão');
      expect(product!.weight).toBe(0);
      expect(product!.unit).toBe('un');
      expect(product!.quantity).toBe(0);
      expect(product!.price).toBe(0);
    });

    it('returns null for empty name', () => {
      const cells = ['', '1', 'kg', '2', '10'];
      const cols = { name: 0, weight: 1, unit: 2, quantity: 3, price: 4 };
      expect(buildProductFromRow(cells, cols)).toBeNull();
    });
  });

  describe('parseCsv', () => {
    it('parses valid CSV with header', () => {
      const csv = `Produto,Peso,Unidade,Quantidade,Preço
Arroz,1,kg,2,25,00
Feijão,500,g,1,8,50`;
      const products = parseCsv(csv);
      expect(products).toHaveLength(2);
      expect(products[0].name).toBe('Arroz');
      expect(products[0].weight).toBe(1);
      expect(products[0].unit).toBe('kg');
      expect(products[0].price).toBe(25);
      expect(products[1].name).toBe('Feijão');
    });

    it('handles empty lines', () => {
      const csv = `Produto,Preço

Arroz,10

`;
      const products = parseCsv(csv);
      expect(products).toHaveLength(1);
    });

    it('returns empty for insufficient lines', () => {
      expect(parseCsv('')).toEqual([]);
      expect(parseCsv('header')).toEqual([]);
    });

    it('detects semicolon delimiter', () => {
      const csv = 'Produto;Preço\nArroz;10';
      const products = parseCsv(csv);
      expect(products).toHaveLength(1);
    });
  });

  describe('parseNfceInput', () => {
    it('rejects invalid URL', () => {
      const result = parseNfceInput('https://invalid.com');
      expect(result.products).toHaveLength(0);
      expect(result.errors.some(e => e.includes('URL da NFCe inválida'))).toBe(true);
    });

    it('warns for valid NFCe URL but no SEFAZ integration', () => {
      const url = 'https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx?p=35260912949960000262651020001115201002201188|2|1|1|983f4917932a406fbb16eddc934ddc02e1d29f69';
      const result = parseNfceInput(url);
      expect(result.products).toHaveLength(0);
      expect(result.errors.some(e => e.includes('SEFAZ'))).toBe(true);
    });

    it('parses CSV input', () => {
      const csv = `Produto,Preço
Arroz,10,00
Feijão,8,50`;
      const result = parseNfceInput(csv);
      expect(result.products).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects unknown format', () => {
      const result = parseNfceInput('just some text');
      expect(result.products).toHaveLength(0);
      expect(result.errors.some(e => e.includes('Formato não reconhecido'))).toBe(true);
    });
  });

  describe('deduplicateProducts', () => {
    it('combines products with same name and unit', () => {
      const products: ParsedProduct[] = [
        { id: '1', name: 'Arroz', weight: 1, unit: 'kg', quantity: 2, price: 20 },
        { id: '2', name: 'Arroz', weight: 1, unit: 'kg', quantity: 3, price: 30 },
        { id: '3', name: 'Feijão', weight: 500, unit: 'g', quantity: 1, price: 8 }
      ];
      const result = deduplicateProducts(products);
      expect(result).toHaveLength(2);
      const arroz = result.find(p => p.name === 'Arroz');
      expect(arroz!.quantity).toBe(5);
      expect(arroz!.price).toBe(50);
    });

    it('keeps maximum weight when deduplicating', () => {
      const products: ParsedProduct[] = [
        { id: '1', name: 'Arroz', weight: 1, unit: 'kg', quantity: 2, price: 20 },
        { id: '2', name: 'Arroz', weight: 5, unit: 'kg', quantity: 1, price: 10 }
      ];
      const result = deduplicateProducts(products);
      expect(result[0].weight).toBe(5);
    });

    it('does not deduplicate different units', () => {
      const products: ParsedProduct[] = [
        { id: '1', name: 'Arroz', weight: 1, unit: 'kg', quantity: 2, price: 20 },
        { id: '2', name: 'Arroz', weight: 1000, unit: 'g', quantity: 1, price: 20 }
      ];
      const result = deduplicateProducts(products);
      expect(result).toHaveLength(2);
    });
  });

  describe('productsToIngredients', () => {
    it('converts products to ingredient format', () => {
      const products: ParsedProduct[] = [
        { id: '1', name: 'Arroz', weight: 1, unit: 'kg', quantity: 2, price: 20 },
        { id: '2', name: 'Feijão', weight: 500, unit: 'g', quantity: 1, price: 8 }
      ];
      const ingredients = productsToIngredients(products);
      expect(ingredients).toHaveLength(2);
      expect(ingredients[0]).toEqual({
        name: 'Arroz',
        unit: 'kg',
        packageSize: 1,
        packagePrice: 20,
        stock: 0,
        minStock: 0
      });
      expect(ingredients[1].packageSize).toBe(500);
    });

    it('uses quantity when weight is 0', () => {
      const products: ParsedProduct[] = [
        { id: '1', name: 'Ovos', weight: 0, unit: 'un', quantity: 12, price: 15 }
      ];
      const ingredients = productsToIngredients(products);
      expect(ingredients[0].packageSize).toBe(12);
    });
  });
});