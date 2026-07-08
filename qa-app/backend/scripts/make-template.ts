// Generates sample Excel import templates (one per module) into ./docs
import * as XLSX from 'xlsx';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve(__dirname, '..', '..', 'docs');
mkdirSync(outDir, { recursive: true });

function write(fileName: string, sheetName: string, rows: Record<string, unknown>[]): void {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const outFile = resolve(outDir, fileName);
  XLSX.writeFile(wb, outFile);
  // eslint-disable-next-line no-console
  console.log('Template written to', outFile);
}

write('time-utilization-template.xlsx', 'TimeUtilization', [
  { 'Employee Name': 'Ana Sharma', Email: 'ana@example.com', Team: 'QA', Period: '2026-07', 'Planned Hours': 160, 'Actual/Billable Hours': 150 },
  { 'Employee Name': 'Ben Carter', Email: 'ben@example.com', Team: 'QA', Period: '2026-07', 'Planned Hours': 160, 'Actual/Billable Hours': 128 },
  { 'Employee Name': 'Cara Diaz', Email: 'cara@example.com', Team: 'Support', Period: '2026-07', 'Planned Hours': 160, 'Actual/Billable Hours': 156 },
  { 'Employee Name': 'Dan Lee', Email: 'dan@example.com', Team: 'Support', Period: '2026-07', 'Planned Hours': 160, 'Actual/Billable Hours': 96 },
]);

write('kt-template.xlsx', 'NewJoineeKT', [
  { Joinee: 'Grace Miller', Team: 'QA', Mentor: 'Eva Novak', 'Join Date': '2026-06-15', Topic: 'Codebase Overview', Status: 'Completed', 'Target Date': '' },
  { Joinee: 'Grace Miller', Team: 'QA', Mentor: 'Eva Novak', 'Join Date': '2026-06-15', Topic: 'Release Process', Status: 'Pending', 'Target Date': '2026-07-20' },
  { Joinee: 'Henry Osei', Team: 'Support', Mentor: 'Faisal Khan', 'Join Date': '2026-06-28', Topic: 'Support Tooling', Status: 'Pending', 'Target Date': '2026-07-25' },
]);

write('maintenance-template.xlsx', 'Maintenance', [
  { Title: 'DB index rebuild', 'Team Member': 'Ana Sharma', Email: 'ana@example.com', 'Scheduled Start': '2026-07-02 22:00', 'Scheduled End': '2026-07-02 23:00', 'Actual Start': '2026-07-02 22:00', 'Actual End': '2026-07-02 22:55' },
  { Title: 'Certificate renewal', 'Team Member': 'Ben Carter', Email: 'ben@example.com', 'Scheduled Start': '2026-07-06 22:00', 'Scheduled End': '2026-07-06 23:00', 'Actual Start': '2026-07-06 22:00', 'Actual End': '2026-07-06 23:35' },
]);

// Call & Case QC: case header + Yes/No/NA for each of the 20 parameters (QC1..QC20).
const qcHeaders = Array.from({ length: 20 }, (_, i) => `QC${i + 1}`);
function callRow(base: Record<string, unknown>, answers: string[]): Record<string, unknown> {
  const row: Record<string, unknown> = { ...base };
  qcHeaders.forEach((h, i) => (row[h] = answers[i] ?? 'NA'));
  row['Customer Escalation'] = 'No';
  row['Findings'] = '';
  row['Action Plan'] = '';
  return row;
}
write('call-qa-template.xlsx', 'CallQC', [
  callRow(
    {
      Product: 'VNA',
      'Case No': '12470153',
      'Call Date': '2026-07-02',
      'Ticket Created Date': '2026-07-02',
      'User Name': 'Sample User',
      'Call Handled By': 'Cara Diaz',
      'Call Handler Email': 'cara@example.com',
      'Case Owner': 'Dan Lee',
      'Case Owner Email': 'dan@example.com',
    },
    Array(20).fill('Yes')
  ),
  callRow(
    {
      Product: 'PACS',
      'Case No': '12470199',
      'Call Date': '2026-07-06',
      'Ticket Created Date': '2026-07-06',
      'User Name': 'Sample User',
      'Call Handled By': 'Dan Lee',
      'Call Handler Email': 'dan@example.com',
      'Case Owner': 'Cara Diaz',
      'Case Owner Email': 'cara@example.com',
    },
    ['Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'No', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'NA', 'Yes', 'Yes', 'Yes', 'Yes', 'No', 'Yes', 'Yes', 'Yes']
  ),
]);

