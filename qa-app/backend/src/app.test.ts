import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from './app';
import { prisma } from './db';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('API integration', () => {
  it('GET /api/health', async () => {
    const r = await request(app).get('/api/health');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it('GET /api/employees returns an array', async () => {
    const r = await request(app).get('/api/employees');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it('GET /api/settings returns config shape', async () => {
    const r = await request(app).get('/api/settings');
    expect(r.status).toBe(200);
    expect(r.body.qa).toBeDefined();
    expect(r.body.timeUtilization).toBeDefined();
  });

  it('blocks unauthorized maintenance write (Trainee)', async () => {
    const r = await request(app)
      .post('/api/maintenance')
      .set('x-role', 'Trainee')
      .send({ title: 'X' });
    expect(r.status).toBe(403);
  });

  it('rejects bad login', async () => {
    const r = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'wrong' });
    expect(r.status).toBe(401);
  });

  it('GET /api/sections is scoped to the Trainee role (Dashboard + KT only)', async () => {
    const r = await request(app).get('/api/sections').set('x-role', 'Trainee');
    expect(r.status).toBe(200);
    const keys = (r.body as { key: string }[]).map((s) => s.key).sort();
    expect(keys).toEqual(['dashboard', 'kt']);
  });

  it('GET /api/sections is scoped to the Maintenance role (Dashboard + Maintenance only)', async () => {
    const r = await request(app).get('/api/sections').set('x-role', 'Maintenance');
    expect(r.status).toBe(200);
    const keys = (r.body as { key: string }[]).map((s) => s.key).sort();
    expect(keys).toEqual(['dashboard', 'maintenance']);
  });

  it('scopes the dashboard payload to the Trainee role', async () => {
    const r = await request(app).get('/api/dashboard').set('x-role', 'Trainee');
    expect(r.status).toBe(200);
    expect(r.body.visible.kt).toBe(true);
    expect(r.body.visible.maintenance).toBe(false);
    expect(r.body.maintenance).toBeNull();
  });

  it('GET /api/call-qa/parameters returns grouped QC parameters', async () => {
    const r = await request(app).get('/api/call-qa/parameters');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.call)).toBe(true);
    expect(Array.isArray(r.body.case)).toBe(true);
  });

  it('blocks Call QC create for a Team Member', async () => {
    const r = await request(app).post('/api/call-qa').set('x-role', 'Team Member').send({ caseNo: 'X' });
    expect(r.status).toBe(403);
  });

  it('rejects a Call QC create with unanswered parameters', async () => {
    const r = await request(app)
      .post('/api/call-qa')
      .set('x-role', 'Call QA Analyst')
      .send({ caseNo: 'TEST-1', callHandledById: 'missing', caseOwnerId: 'missing', answers: [] });
    expect(r.status).toBe(400);
  });
});
