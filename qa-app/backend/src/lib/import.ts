// Shared helpers for Excel/CSV import across modules.
import * as XLSX from 'xlsx';
import { prisma } from '../db';

/** Reads the first worksheet of an uploaded file into an array of row objects. */
export function parseSheet(buffer: Buffer): Record<string, unknown>[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
}

/** Reads a value from a row by trying several header aliases (case-insensitive). */
export function getField(row: Record<string, unknown>, aliases: string[]): unknown {
  const normalized = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) normalized.set(k.trim().toLowerCase(), v);
  for (const a of aliases) {
    const hit = normalized.get(a.toLowerCase());
    if (hit !== undefined && hit !== null && String(hit).trim() !== '') return hit;
  }
  return undefined;
}

export function toNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Coerces Excel cells (Date, serial number, or string) into a JS Date. */
export function toDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const d = new Date(Math.round((value - 25569) * 86400 * 1000)); // Excel serial -> JS
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Matches an employee by email, then by name; creates one if none is found. */
export async function resolveEmployee(name: unknown, idOrEmail: unknown, team?: unknown) {
  const nameStr = name ? String(name).trim() : '';
  const emailStr = idOrEmail ? String(idOrEmail).trim() : '';
  let employee = null;
  if (emailStr.includes('@')) {
    employee = await prisma.employee.findUnique({ where: { email: emailStr } });
  }
  if (!employee && nameStr) {
    employee = await prisma.employee.findFirst({ where: { name: nameStr } });
  }
  if (!employee && (nameStr || emailStr)) {
    const base = nameStr || emailStr;
    employee = await prisma.employee.create({
      data: {
        name: base,
        email: emailStr.includes('@') ? emailStr : `${base.toLowerCase().replace(/\s+/g, '.')}@example.com`,
        team: team ? String(team).trim() : null,
        role: 'Team Member',
      },
    });
  }
  return employee;
}
