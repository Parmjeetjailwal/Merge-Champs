import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';

export const jiraRouter = Router();

interface JiraIssue {
  key: string;
  fields: { summary: string; status: { name: string } };
}

// GET /api/jira/tickets -> live Jira issues when configured, otherwise mock data
jiraRouter.get(
  '/tickets',
  asyncHandler(async (_req, res) => {
    const base = process.env.JIRA_BASE_URL;
    if (!base) {
      return res.json({
        source: 'mock',
        tickets: [
          { key: 'PROJ-201', summary: 'Login fails on Safari', status: 'In Progress' },
          { key: 'PROJ-202', summary: 'Export CSV missing a column', status: 'Done' },
          { key: 'PROJ-203', summary: 'Slow dashboard load', status: 'To Do' },
        ],
      });
    }
    const jql = process.env.JIRA_JQL || 'ORDER BY updated DESC';
    const url = `${base.replace(/\/$/, '')}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=25`;
    const token = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
    const resp = await fetch(url, { headers: { Authorization: `Basic ${token}`, Accept: 'application/json' } });
    if (!resp.ok) return res.status(502).json({ error: `Jira request failed (${resp.status}).` });
    const data = (await resp.json()) as { issues?: JiraIssue[] };
    res.json({
      source: 'jira',
      tickets: (data.issues ?? []).map((i) => ({ key: i.key, summary: i.fields.summary, status: i.fields.status.name })),
    });
  })
);
