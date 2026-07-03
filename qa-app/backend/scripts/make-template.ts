// Generates a sample Time Utilization import template at docs/time-utilization-template.xlsx
import * as XLSX from 'xlsx';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const rows = [
  { 'Employee Name': 'Ana Sharma', Email: 'ana@example.com', Team: 'QA', Period: '2026-07', 'Planned Hours': 160, 'Actual/Billable Hours': 150 },
  { 'Employee Name': 'Ben Carter', Email: 'ben@example.com', Team: 'QA', Period: '2026-07', 'Planned Hours': 160, 'Actual/Billable Hours': 128 },
  { 'Employee Name': 'Cara Diaz', Email: 'cara@example.com', Team: 'Support', Period: '2026-07', 'Planned Hours': 160, 'Actual/Billable Hours': 156 },
  { 'Employee Name': 'Dan Lee', Email: 'dan@example.com', Team: 'Support', Period: '2026-07', 'Planned Hours': 160, 'Actual/Billable Hours': 96 },
];

const ws = XLSX.utils.json_to_sheet(rows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'TimeUtilization');

const outDir = resolve(__dirname, '..', '..', 'docs');
mkdirSync(outDir, { recursive: true });
const outFile = resolve(outDir, 'time-utilization-template.xlsx');
XLSX.writeFile(wb, outFile);

// eslint-disable-next-line no-console
console.log('Template written to', outFile);
