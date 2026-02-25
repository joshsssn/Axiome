import { useState, useCallback, useRef } from 'react';
import { api } from '@/services/api';
import { usePortfolio } from '@/context/PortfolioContext';
import {
    Upload, FileSpreadsheet, Check, AlertTriangle, X, RefreshCw,
    ArrowRight, Download, Loader2, CheckCircle2
} from 'lucide-react';

/* ─── Types ─── */
interface ParsedRow {
    ticker: string;
    shares: number;
    purchasePrice: number;
    currency: string;
    currencyDetected: boolean;
    entryDate: string;
    // After validation
    status: 'pending' | 'valid' | 'unresolved' | 'importing' | 'imported' | 'error';
    yfName?: string;
    yfSector?: string;
    yfCountry?: string;
    yfCurrency?: string;
    correctedTicker?: string;
    errorMsg?: string;
}

/* ─── Currency detection from price string ─── */
function detectCurrency(priceStr: string): { value: number; currency: string } {
    const s = priceStr.toString().trim();
    let currency = 'USD';
    let cleaned = s;

    // Symbol prefix
    if (s.startsWith('$')) { currency = 'USD'; cleaned = s.slice(1); }
    else if (s.startsWith('€')) { currency = 'EUR'; cleaned = s.slice(1); }
    else if (s.startsWith('£')) { currency = 'GBP'; cleaned = s.slice(1); }
    else if (s.startsWith('¥')) { currency = 'JPY'; cleaned = s.slice(1); }
    // Suffix codes
    else if (/CHF$/i.test(s)) { currency = 'CHF'; cleaned = s.replace(/\s*CHF$/i, ''); }
    else if (/kr$/i.test(s)) { currency = 'DKK'; cleaned = s.replace(/\s*kr$/i, ''); }
    else if (/SEK$/i.test(s)) { currency = 'SEK'; cleaned = s.replace(/\s*SEK$/i, ''); }
    else if (/NOK$/i.test(s)) { currency = 'NOK'; cleaned = s.replace(/\s*NOK$/i, ''); }
    else if (/GBP$/i.test(s)) { currency = 'GBP'; cleaned = s.replace(/\s*GBP$/i, ''); }
    else if (/EUR$/i.test(s)) { currency = 'EUR'; cleaned = s.replace(/\s*EUR$/i, ''); }
    else if (/USD$/i.test(s)) { currency = 'USD'; cleaned = s.replace(/\s*USD$/i, ''); }

    // Handle European number format (comma as decimal separator)
    cleaned = cleaned.trim().replace(/\s/g, '');
    if (cleaned.includes(',') && !cleaned.includes('.')) {
        cleaned = cleaned.replace(',', '.');
    } else if (cleaned.includes(',') && cleaned.includes('.')) {
        // 1.234,56 → 1234.56
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    }

    const value = parseFloat(cleaned);
    return { value: isNaN(value) ? 0 : value, currency };
}

/* ─── Smart number parser for shares/quantities ─── */
function parseSmartNumber(raw: string): number {
    let s = raw.replace(/\s/g, '');
    // Remove leading currency symbols
    s = s.replace(/^[$€£¥]/, '');
    // If both comma and dot are present, the LAST one is the decimal separator
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > -1 && lastDot > -1) {
        if (lastComma > lastDot) {
            // 1.000,50 → European: dots are thousands, comma is decimal
            s = s.replace(/\./g, '').replace(',', '.');
        } else {
            // 1,000.50 → US: commas are thousands, dot is decimal
            s = s.replace(/,/g, '');
        }
    } else if (lastComma > -1) {
        // Only commas: check if it looks like thousands separator (e.g. 1,000) or decimal (e.g. 3,5)
        const afterComma = s.slice(lastComma + 1);
        if (afterComma.length === 3 && s.indexOf(',') === lastComma) {
            // 1,000 → thousands separator
            s = s.replace(/,/g, '');
        } else {
            // 3,5 or 1,50 → decimal separator
            s = s.replace(',', '.');
        }
    }
    // dots only: parseFloat handles natively
    const val = parseFloat(s);
    return isNaN(val) ? 0 : val;
}

/* ─── CSV parser ─── */
function parseCSV(text: string): ParsedRow[] {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];

    // Detect separator
    const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(sep).map(h => h.trim().toLowerCase());

    // Find column indices (flexible matching)
    const tickerIdx = headers.findIndex(h => /ticker|symbol|code/i.test(h));
    const sharesIdx = headers.findIndex(h => /shares|quantity|qty|units/i.test(h));
    const currencyIdx = headers.findIndex(h => /^currency$|^ccy$/i.test(h));
    const dateIdx = headers.findIndex(h => /date/i.test(h));
    // Price column: must match price/cost/purchase/entry but NOT if it also matches date
    const priceIdx = headers.findIndex(h => (/price|cost/i.test(h)) || ((/purchase|entry/i.test(h)) && !/date/i.test(h)));

    if (tickerIdx === -1 || priceIdx === -1) return [];

    const rows: ParsedRow[] = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(sep).map(c => c.trim());
        const ticker = cols[tickerIdx]?.trim();
        if (!ticker) continue;

        const { value: price, currency: detectedCcy } = detectCurrency(cols[priceIdx] || '0');
        const explicitCcy = currencyIdx !== -1 ? cols[currencyIdx]?.trim() : '';
        const currency = explicitCcy || detectedCcy;
        // Currency is detected if an explicit column exists or if symbol was found in price string
        const currencyDetected = !!(explicitCcy) || detectedCcy !== 'USD' || /[$€£¥]|CHF|EUR|GBP|JPY|SEK|NOK|DKK/i.test(cols[priceIdx] || '');
        // Smart number parsing for shares: handle thousands separators (1,000 or 1.000) and decimal separators
        const sharesRawStr = (cols[sharesIdx] ?? '0').trim();
        const shares = parseSmartNumber(sharesRawStr);
        const entryDate = cols[dateIdx]?.trim() || new Date().toISOString().split('T')[0];

        rows.push({
            ticker,
            shares,
            purchasePrice: price,
            currency,
            currencyDetected,
            entryDate,
            status: 'pending',
        });
    }
    return rows;
}

/* ─── Detect currency from Excel number format string ─── */
function detectCurrencyFromFormat(fmt: string): string | null {
    if (!fmt || fmt === 'General') return null;
    if (/\$\$/.test(fmt) || /\[\$\$/.test(fmt) || /USD/.test(fmt)) return 'USD';
    if (/€/.test(fmt) || /EUR/.test(fmt)) return 'EUR';
    if (/£/.test(fmt) || /GBP/.test(fmt)) return 'GBP';
    if (/¥/.test(fmt) || /JPY/.test(fmt)) return 'JPY';
    if (/CHF/.test(fmt)) return 'CHF';
    // kr currencies: check locale code to distinguish NOK, SEK, DKK
    if (/\[\$kr-414\]|\[\$kr-814\]|NOK/i.test(fmt)) return 'NOK';
    if (/\[\$kr-41D\]|\[\$kr-81D\]|SEK/i.test(fmt)) return 'SEK';
    if (/\[\$kr-406\]|\[\$kr-438\]|DKK/i.test(fmt)) return 'DKK';
    if (/\[\$kr/.test(fmt)) return 'NOK'; // fallback for kr
    if (/HKD/.test(fmt) || /HK\$/.test(fmt)) return 'HKD';
    if (/CAD/.test(fmt) || /C\$/.test(fmt)) return 'CAD';
    if (/AUD/.test(fmt) || /A\$/.test(fmt)) return 'AUD';
    if (/SGD/.test(fmt) || /S\$/.test(fmt)) return 'SGD';
    return null;
}

/* ─── XLSX parser (uses SheetJS from CDN if needed) ─── */
async function parseXLSX(file: File): Promise<ParsedRow[]> {
    const loadSheetJS = async () => {
        if ((window as any).XLSX) return (window as any).XLSX;
        return new Promise<any>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
            script.onload = () => resolve((window as any).XLSX);
            script.onerror = reject;
            document.head.appendChild(script);
        });
    };

    const XLSX = await loadSheetJS();
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array', cellStyles: true, cellNF: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

    // Read headers from first row
    const headers: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r: range.s.r, c });
        const cell = ws[addr];
        headers.push(cell ? String(cell.v || '').toLowerCase().trim() : '');
    }

    // Find column indices (same logic as parseCSV)
    const tickerIdx = headers.findIndex(h => /ticker|symbol|code/i.test(h));
    const sharesIdx = headers.findIndex(h => /shares|quantity|qty|units/i.test(h));
    const currencyIdx = headers.findIndex(h => /^currency$|^ccy$/i.test(h));
    const dateIdx = headers.findIndex(h => /date/i.test(h));
    const priceIdx = headers.findIndex(h => (/price|cost/i.test(h)) || ((/purchase|entry/i.test(h)) && !/date/i.test(h)));

    if (tickerIdx === -1 || priceIdx === -1) {
        // Fallback to CSV-based parsing
        const csv: string = XLSX.utils.sheet_to_csv(ws, { FS: '\t' });
        return parseCSV(csv);
    }

    const rows: ParsedRow[] = [];
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
        const getCell = (c: number) => {
            const addr = XLSX.utils.encode_cell({ r, c });
            return ws[addr];
        };

        const tickerCell = getCell(tickerIdx);
        const ticker = tickerCell ? String(tickerCell.v || '').trim() : '';
        if (!ticker) continue;

        // Price: read raw numeric value
        const priceCell = getCell(priceIdx);
        let price = 0;
        let cellCurrency = 'USD';
        let currencyDetected = false;
        if (priceCell) {
            price = typeof priceCell.v === 'number' ? priceCell.v : parseFloat(String(priceCell.v)) || 0;
            // Detect currency from the cell's number format
            const fmt = priceCell.z || '';
            const fmtCcy = detectCurrencyFromFormat(fmt);
            console.log(`[ImportXLSX] ${ticker}: fmt="${fmt}", detected=${fmtCcy}, price=${price}`);
            if (fmtCcy) {
                cellCurrency = fmtCcy;
                currencyDetected = true;
            }
        }

        // Explicit currency column overrides
        if (currencyIdx !== -1) {
            const ccyCell = getCell(currencyIdx);
            if (ccyCell && ccyCell.v) {
                cellCurrency = String(ccyCell.v).trim().toUpperCase();
                currencyDetected = true;
            }
        }

        // Shares
        const sharesCell = getCell(sharesIdx);
        const shares = sharesCell ? (typeof sharesCell.v === 'number' ? sharesCell.v : parseFloat(String(sharesCell.v)) || 0) : 0;

        // Date
        let entryDate = new Date().toISOString().split('T')[0];
        if (dateIdx !== -1) {
            const dateCell = getCell(dateIdx);
            if (dateCell) {
                if (dateCell.v instanceof Date) {
                    entryDate = dateCell.v.toISOString().split('T')[0];
                } else if (typeof dateCell.v === 'number') {
                    // Excel serial date
                    const d = XLSX.SSF.parse_date_code(dateCell.v);
                    if (d) entryDate = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
                } else if (typeof dateCell.v === 'string') {
                    entryDate = dateCell.v.trim();
                }
            }
        }

        rows.push({
            ticker,
            shares,
            purchasePrice: price,
            currency: cellCurrency,
            currencyDetected,
            entryDate,
            status: 'pending',
        });
    }
    return rows;
}

/* ─── Component ─── */
export function ImportInstruments({ onClose }: { onClose: () => void }) {
    const { activePortfolio: pf, refreshPortfolios } = usePortfolio();
    const [rows, setRows] = useState<ParsedRow[]>([]);
    const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload');
    const [validating, setValidating] = useState(false);
    const [importing, setImporting] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [importResult, setImportResult] = useState<{ imported: number; errors: number; failed: any[] } | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    // Ticker search autocomplete state
    const [tickerSuggestions, setTickerSuggestions] = useState<Record<number, Array<{ symbol: string; name: string; sector: string; country: string; asset_class: string; currency: string }>>>({});
    const [showSuggestions, setShowSuggestions] = useState<Record<number, boolean>>({});
    const [tickerSearchLoading, setTickerSearchLoading] = useState<Record<number, boolean>>({});
    const tickerSearchTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
    /* ─── File handling ─── */
    const handleFile = useCallback(async (file: File) => {
        let parsed: ParsedRow[] = [];
        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            parsed = await parseXLSX(file);
        } else {
            const text = await file.text();
            parsed = parseCSV(text);
        }
        if (parsed.length === 0) return;
        setRows(parsed);
        setStep('preview');
        // Auto-validate
        validateTickers(parsed);
    }, []);

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragActive(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    }, [handleFile]);

    const onFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
    }, [handleFile]);

    /* ─── Ticker validation ─── */
    const validateTickers = async (rowsToValidate: ParsedRow[]) => {
        setValidating(true);
        try {
            // Build parallel arrays — filter out rows with no ticker, keeping hints aligned
            const paired = rowsToValidate
                .map(r => ({ sym: r.correctedTicker || r.ticker, hint: r.currencyDetected ? r.currency : null }))
                .filter(p => Boolean(p.sym));
            const symbols = paired.map(p => p.sym);
            const currencyHints = paired.map(p => p.hint);

            const result = await api.marketData.validateTickers(symbols, currencyHints);
            // Build lookup: the backend may return a DIFFERENT symbol (e.g. RACE.MI)
            // so we need to match by the original symbol we sent
            const validByOriginal = new Map<string, any>();
            const validByResolved = new Map<string, any>();
            for (const v of result.valid) {
                validByResolved.set(v.symbol, v);
            }
            // Map original symbols to their resolved info
            for (let i = 0; i < symbols.length; i++) {
                const origSym = symbols[i].toUpperCase();
                // The backend returns the resolved symbol — find it
                const resolvedInfo = validByResolved.get(origSym);
                if (resolvedInfo) {
                    validByOriginal.set(origSym, resolvedInfo);
                } else {
                    // Check if a resolved variant exists (e.g. RACE → RACE.MI)
                    for (const [resolvedSym, info] of validByResolved.entries()) {
                        if (resolvedSym.split('.')[0] === origSym) {
                            validByOriginal.set(origSym, info);
                            break;
                        }
                    }
                }
            }

            const unresolvedSet = new Set<string>(result.unresolved.map((s: string) => s.toUpperCase()));

            setRows(prev => prev.map(r => {
                const sym = (r.correctedTicker || r.ticker).toUpperCase();
                const info = validByOriginal.get(sym);
                if (info) {
                    return {
                        ...r,
                        status: 'valid' as const,
                        // Update the ticker to the resolved exchange symbol
                        correctedTicker: info.symbol !== sym ? info.symbol : r.correctedTicker,
                        yfName: info.name,
                        yfSector: info.sector,
                        yfCountry: info.country,
                        // Use the currency from the resolved exchange (it matches the file's currency)
                        yfCurrency: info.currency,
                    };
                }
                if (unresolvedSet.has(sym)) {
                    return { ...r, status: 'unresolved' as const };
                }
                // If ticker was sent for validation but wasn't found in valid or unresolved,
                // mark as unresolved to avoid perpetual 'pending' spinner
                if (sym && symbols.map(s => s.toUpperCase()).includes(sym)) {
                    return { ...r, status: 'unresolved' as const };
                }
                return r;
            }));
        } catch (e) {
            console.error('Validation failed', e);
            // On network/API error, mark all still-pending rows as unresolved to avoid infinite spinner
            setRows(prev => prev.map(r => r.status === 'pending' ? { ...r, status: 'unresolved' as const, errorMsg: 'Validation failed — check connection' } : r));
        } finally {
            setValidating(false);
        }
    };

    /* ─── Correct a ticker ─── */
    const updateCorrectedTicker = (idx: number, newTicker: string) => {
        // Keep status as 'unresolved' while the user is typing — don't change to 'pending'
        setRows(prev => prev.map((r, i) => i === idx ? { ...r, correctedTicker: newTicker } : r));

        // Handle debounced search
        if (tickerSearchTimers.current[idx]) clearTimeout(tickerSearchTimers.current[idx]);

        if (newTicker.trim().length < 1) {
            setTickerSuggestions(prev => ({ ...prev, [idx]: [] }));
            setShowSuggestions(prev => ({ ...prev, [idx]: false }));
            setTickerSearchLoading(prev => ({ ...prev, [idx]: false }));
            return;
        }

        setTickerSearchLoading(prev => ({ ...prev, [idx]: true }));
        tickerSearchTimers.current[idx] = setTimeout(async () => {
            try {
                const results = await api.marketData.searchTicker(newTicker.trim());
                setTickerSuggestions(prev => ({ ...prev, [idx]: results || [] }));
                setShowSuggestions(prev => ({ ...prev, [idx]: true }));
            } catch {
                setTickerSuggestions(prev => ({ ...prev, [idx]: [] }));
            } finally {
                setTickerSearchLoading(prev => ({ ...prev, [idx]: false }));
            }
        }, 300);
    };

    const selectTicker = (idx: number, suggestion: { symbol: string; name: string; sector: string; country: string; asset_class: string; currency: string }) => {
        const updatedRows = rows.map((r, i) => i === idx ? { ...r, correctedTicker: suggestion.symbol, status: 'pending' as const } : r);
        setRows(updatedRows);
        setShowSuggestions(prev => ({ ...prev, [idx]: false }));
        setTickerSuggestions(prev => ({ ...prev, [idx]: [] }));
        // Immediately validate with the updated rows to avoid stale closure
        validateTickers(updatedRows);
    };

    const revalidate = () => {
        validateTickers(rows);
    };

    /* ─── Normalize date to YYYY-MM-DD ─── */
    const normalizeDate = (raw: string): string => {
        if (!raw) return new Date().toISOString().split('T')[0];
        // Already ISO: 2024-01-15
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
        // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
        const euMatch = raw.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
        if (euMatch) {
            const [, a, b, y] = euMatch;
            const day = parseInt(a), month = parseInt(b);
            // If first number > 12, it must be a day (DD/MM/YYYY)
            if (day > 12) return `${y}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
            // If second number > 12, it must be a day (MM/DD/YYYY)
            if (month > 12) return `${y}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
            // Ambiguous: assume DD/MM/YYYY (European)
            return `${y}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
        }
        // MM/DD/YY or DD/MM/YY
        const shortYear = raw.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2})$/);
        if (shortYear) {
            const [, a, b, yy] = shortYear;
            const y = parseInt(yy) > 50 ? `19${yy}` : `20${yy}`;
            const day = parseInt(a), month = parseInt(b);
            if (day > 12) return `${y}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
            if (month > 12) return `${y}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
            return `${y}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
        }
        // Try native Date parse as fallback
        const d = new Date(raw);
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
        return new Date().toISOString().split('T')[0];
    };

    /* ─── Import ─── */
    const doImport = async () => {
        if (!pf) return;
        setImporting(true);
        setStep('importing');

        const validRows = rows.filter(r => r.status === 'valid');
        const positions = validRows.map(r => ({
            symbol: r.correctedTicker || r.ticker,
            quantity: r.shares,
            entry_price: r.purchasePrice,
            entry_date: normalizeDate(r.entryDate),
            currency: r.yfCurrency || r.currency,
            pricing_mode: 'market',
        }));

        try {
            const portfolioId = parseInt(pf.id);
            if (isNaN(portfolioId)) {
                throw new Error('Invalid portfolio — please select a valid portfolio before importing.');
            }
            const result = await api.portfolios.importPositions(portfolioId, positions);
            setImportResult(result);
            setStep('done');
            refreshPortfolios();
        } catch (e: any) {
            console.error('Import failed', e);
            setImportResult({ imported: 0, errors: validRows.length, failed: [{ error: e?.message || String(e) }] });
            setStep('done');
        } finally {
            setImporting(false);
        }
    };

    /* ─── Stats ─── */
    const validCount = rows.filter(r => r.status === 'valid').length;
    const unresolvedCount = rows.filter(r => r.status === 'unresolved').length;
    const pendingCount = rows.filter(r => r.status === 'pending').length;

    const currencySymbol = (ccy: string) => {
        const map: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CHF: 'CHF', DKK: 'kr', SEK: 'kr', NOK: 'kr' };
        return map[ccy] || ccy;
    };

    /* ─── Render ─── */
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#1a1d23] rounded-2xl border border-white/10 w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <FileSpreadsheet className="w-5 h-5 text-blue-400" />
                        <h2 className="text-lg font-semibold text-white">Import Instruments</h2>
                        {pf && <span className="text-sm text-slate-400">→ {pf.summary.name}</span>}
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-6">
                    {/* Step 1: Upload */}
                    {step === 'upload' && (
                        <div
                            className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${dragActive ? 'border-blue-400 bg-blue-500/10' : 'border-white/20 hover:border-white/40'
                                }`}
                            onDragOver={e => { e.preventDefault(); setDragActive(true); }}
                            onDragLeave={() => setDragActive(false)}
                            onDrop={onDrop}
                        >
                            <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                            <p className="text-lg text-white mb-2">Drop your CSV or XLSX file here</p>
                            <p className="text-sm text-slate-400 mb-6">
                                Expected columns: <code className="text-blue-400">Ticker</code>, <code className="text-blue-400">Purchase Price</code>, <code className="text-blue-400">Shares</code>
                                <br />Currency is auto-detected from price (e.g. $, €, CHF, kr)
                            </p>
                            <button
                                onClick={() => fileRef.current?.click()}
                                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors inline-flex items-center gap-2"
                            >
                                <Download className="w-4 h-4" />
                                Browse Files
                            </button>
                            <input
                                ref={fileRef}
                                type="file"
                                accept=".csv,.xlsx,.xls,.tsv"
                                className="hidden"
                                onChange={onFileSelect}
                            />
                        </div>
                    )}

                    {/* Step 2: Preview & Validate */}
                    {step === 'preview' && (
                        <div>
                            {/* Status bar */}
                            <div className="flex items-center gap-4 mb-4 text-sm">
                                <span className="text-slate-300">{rows.length} instruments parsed</span>
                                <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" />{validCount} valid</span>
                                {unresolvedCount > 0 && (
                                    <span className="text-amber-400 flex items-center gap-1"><AlertTriangle className="w-4 h-4" />{unresolvedCount} unresolved</span>
                                )}
                                {pendingCount > 0 && (
                                    <span className="text-slate-400 flex items-center gap-1"><Loader2 className="w-4 h-4 animate-spin" />{pendingCount} pending</span>
                                )}
                                {validating && <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}
                            </div>

                            {/* Unresolved Tickers — Correction UI (outside overflow container so dropdown is visible) */}
                            {unresolvedCount > 0 && (
                                <div className="mb-4 bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                                        <h4 className="text-sm font-semibold text-amber-300">
                                            {unresolvedCount} Unresolved Ticker{unresolvedCount > 1 ? 's' : ''} — Search & Select Correct Symbol
                                        </h4>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {rows.map((r, i) => {
                                            if (r.status !== 'unresolved') return null;
                                            return (
                                                <div key={i} className="relative bg-white/5 rounded-lg p-3">
                                                    <div className="text-xs text-slate-500 mb-1.5">
                                                        Original: <span className="text-amber-400 font-mono font-semibold">{r.ticker}</span>
                                                    </div>
                                                    <div className="relative">
                                                        <input
                                                            type="text"
                                                            className="w-full bg-slate-900/50 border border-amber-500/30 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 pr-8 uppercase placeholder:text-slate-600 font-mono"
                                                            placeholder="Search ticker e.g. QQQ, SPY..."
                                                            value={r.correctedTicker || ''}
                                                            onChange={e => updateCorrectedTicker(i, e.target.value)}
                                                            onFocus={() => { if (tickerSuggestions[i]?.length > 0) setShowSuggestions(prev => ({ ...prev, [i]: true })); }}
                                                            onBlur={() => setTimeout(() => setShowSuggestions(prev => ({ ...prev, [i]: false })), 200)}
                                                            autoComplete="off"
                                                        />
                                                        {tickerSearchLoading[i] && (
                                                            <div className="absolute right-3 top-3">
                                                                <RefreshCw className="w-3.5 h-3.5 text-slate-500 animate-spin" />
                                                            </div>
                                                        )}
                                                        {showSuggestions[i] && tickerSuggestions[i]?.length > 0 && (
                                                            <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-52 overflow-y-auto">
                                                                {tickerSuggestions[i].map((s, sIdx) => (
                                                                    <button
                                                                        key={`${s.symbol}-${sIdx}`}
                                                                        type="button"
                                                                        onMouseDown={(e) => { e.preventDefault(); selectTicker(i, s); }}
                                                                        className="w-full text-left px-3 py-2.5 hover:bg-slate-700/60 transition-colors border-b border-slate-700/30 last:border-0"
                                                                    >
                                                                        <div className="flex items-center justify-between">
                                                                            <span className="text-sm font-mono font-semibold text-blue-400">{s.symbol}</span>
                                                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400">{s.asset_class}</span>
                                                                        </div>
                                                                        <div className="text-xs text-slate-400 mt-0.5 truncate">{s.name}</div>
                                                                        <div className="text-[10px] text-slate-500 mt-0.5">{s.sector} • {s.country}</div>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Table */}
                            <div className="overflow-auto rounded-xl border border-white/10 max-h-[50vh]">
                                <table className="w-full text-sm">
                                    <thead className="bg-white/5 sticky top-0 z-10">
                                        <tr className="text-left text-slate-400">
                                            <th className="px-4 py-3">Status</th>
                                            <th className="px-4 py-3">Ticker</th>
                                            <th className="px-4 py-3">Name</th>
                                            <th className="px-4 py-3">Shares</th>
                                            <th className="px-4 py-3">Price</th>
                                            <th className="px-4 py-3">Currency</th>
                                            <th className="px-4 py-3">Sector</th>
                                            <th className="px-4 py-3">Country</th>
                                            <th className="px-4 py-3">Entry Date</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {rows.map((r, i) => (
                                            <tr key={i} className={`text-slate-200 ${r.status === 'unresolved' ? 'bg-amber-500/5' : ''}`}>
                                                <td className="px-4 py-3">
                                                    {r.status === 'valid' && <Check className="w-4 h-4 text-emerald-400" />}
                                                    {r.status === 'unresolved' && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                                                    {r.status === 'pending' && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
                                                    {r.status === 'imported' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                                                    {r.status === 'error' && <X className="w-4 h-4 text-red-400" />}
                                                </td>
                                                <td className="px-4 py-3 font-mono font-semibold text-blue-400">{r.correctedTicker || r.ticker}</td>
                                                <td className="px-4 py-3">{r.yfName || '—'}</td>
                                                <td className="px-4 py-3 font-mono">{r.shares.toLocaleString(undefined, { maximumFractionDigits: 5 })}</td>
                                                <td className="px-4 py-3 font-mono">{currencySymbol(r.yfCurrency || r.currency)}{r.purchasePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${(r.yfCurrency || r.currency) === 'USD' ? 'bg-emerald-500/20 text-emerald-300' :
                                                        (r.yfCurrency || r.currency) === 'EUR' ? 'bg-blue-500/20 text-blue-300' :
                                                            'bg-purple-500/20 text-purple-300'
                                                        }`}>
                                                        {r.yfCurrency || r.currency}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-slate-400">{r.yfSector || '—'}</td>
                                                <td className="px-4 py-3 text-slate-400">{r.yfCountry || '—'}</td>
                                                <td className="px-4 py-3 text-slate-400 font-mono text-xs">{r.entryDate}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Importing */}
                    {step === 'importing' && (
                        <div className="text-center py-16">
                            <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto mb-4" />
                            <p className="text-white text-lg">Importing {validCount} instruments...</p>
                            <p className="text-slate-400 text-sm mt-2">Syncing with market data providers</p>
                        </div>
                    )}

                    {/* Step 4: Done */}
                    {step === 'done' && importResult && (
                        <div className="text-center py-16">
                            {importResult.imported > 0 ? (
                                <>
                                    <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
                                    <p className="text-white text-xl font-semibold mb-2">Import Complete!</p>
                                    <p className="text-slate-300">{importResult.imported} instruments imported successfully</p>
                                </>
                            ) : (
                                <>
                                    <AlertTriangle className="w-16 h-16 text-red-400 mx-auto mb-4" />
                                    <p className="text-white text-xl font-semibold mb-2">Import Failed</p>
                                </>
                            )}
                            {importResult.errors > 0 && (
                                <div className="mt-4 text-left max-w-md mx-auto">
                                    <p className="text-amber-400 text-sm mb-2">{importResult.errors} errors:</p>
                                    {importResult.failed.map((f: any, i: number) => (
                                        <p key={i} className="text-red-300 text-xs font-mono">{f.symbol}: {f.error}</p>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-white/10">
                    <div>
                        {step === 'preview' && (
                            <button
                                onClick={() => { setRows([]); setStep('upload'); }}
                                className="px-4 py-2 text-slate-400 hover:text-white transition-colors text-sm"
                            >
                                ← Upload different file
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        {step === 'preview' && unresolvedCount > 0 && (
                            <button
                                onClick={revalidate}
                                disabled={validating}
                                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
                            >
                                <RefreshCw className={`w-4 h-4 ${validating ? 'animate-spin' : ''}`} />
                                Re-validate
                            </button>
                        )}
                        {step === 'preview' && validCount > 0 && (
                            <button
                                onClick={doImport}
                                disabled={importing || validating}
                                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
                            >
                                <ArrowRight className="w-4 h-4" />
                                Import {validCount} Instruments
                            </button>
                        )}
                        {step === 'done' && (
                            <button
                                onClick={onClose}
                                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                            >
                                Done
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
