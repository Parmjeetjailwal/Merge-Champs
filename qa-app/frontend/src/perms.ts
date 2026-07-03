import type { Role } from './api';

const WRITE_QA: Role[] = ['Admin', 'QA Lead'];

export const can = {
  uploadTime: (r: Role) => WRITE_QA.includes(r),
  qa: (r: Role) => WRITE_QA.includes(r),
  kt: (r: Role) => WRITE_QA.includes(r),
  maintenance: (r: Role) => WRITE_QA.includes(r),
  callQa: (r: Role) => r === 'Admin' || r === 'Call QA Analyst',
};
