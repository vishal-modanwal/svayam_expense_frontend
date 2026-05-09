/** Best-effort hints from raw OCR text (Indian receipts: ₹, DD/MM/YYYY). */
export interface ParsedReceiptHints {
  title?: string;
  amount?: number;
  vendor?: string;
  expense_date?: string;
}

function parseAmountToken(s: string): number {
  const n = parseFloat(String(s).replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Extracts vendor, total-like amount, and a date string as `YYYY-MM-DD` for `<input type="date">`.
 */
export function parseReceiptTextHints(text: string): ParsedReceiptHints {
  const joined = text.replace(/\r/g, '\n');
  const lines = joined
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let amount: number | undefined;
  const totalMatch = joined.match(
    /(?:grand\s*total|total\s*amount|amount\s*due|net\s*amount|payable|total)\s*[:\s]*₹?\s*([\d,]+\.?\d*)/i
  );
  if (totalMatch) {
    const v = parseAmountToken(totalMatch[1]);
    if (!Number.isNaN(v) && v > 0) {
      amount = v;
    }
  }
  if (amount == null) {
    const rupeeRe = /₹\s*([\d,]+\.?\d*)/gi;
    const candidates: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = rupeeRe.exec(joined)) !== null) {
      const v = parseAmountToken(m[1]);
      if (!Number.isNaN(v) && v > 0) {
        candidates.push(v);
      }
    }
    if (candidates.length) {
      amount = Math.max(...candidates);
    }
  }

  let expense_date: string | undefined;
  const dmY = joined.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  if (dmY) {
    const a = parseInt(dmY[1], 10);
    const b = parseInt(dmY[2], 10);
    const y = dmY[3];
    if (a > 12) {
      expense_date = `${y}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
    } else if (b > 12) {
      expense_date = `${y}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`;
    } else {
      expense_date = `${y}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
    }
  }

  const skipLine = /^(tax\s*invoice|invoice|bill|receipt|retail\s*invoice)$/i;
  let vendor: string | undefined;
  for (const line of lines) {
    if (line.length >= 2 && line.length <= 80 && !skipLine.test(line)) {
      vendor = line.slice(0, 120);
      break;
    }
  }

  const title = vendor?.slice(0, 120);

  return { amount, vendor, expense_date, title };
}
