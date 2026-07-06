import { prisma } from './db';
import { config as envConfig } from './config';

export interface AppConfig {
  qa: { scaleMax: number; timeliness: number; documentation: number };
  callQa: {
    scaleMax: number;
    opening: number;
    info: number;
    deadAir: number;
    closing: number;
    caseCreationThresholdSecs: number;
    callCloseThresholdSecs: number;
  };
  callQc: { target: number; pointsPerYes: number };
  timeUtilization: { targetPercent: number };
  pmi: { includeCallScores: boolean };
}

function defaults(): AppConfig {
  return {
    qa: {
      scaleMax: envConfig.qa.scaleMax,
      timeliness: envConfig.qa.timeliness,
      documentation: envConfig.qa.documentation,
    },
    callQa: { ...envConfig.callQa },
    callQc: { ...envConfig.callQc },
    timeUtilization: { targetPercent: 85 },
    pmi: { includeCallScores: false },
  };
}

type AnyObj = Record<string, unknown>;

function deepMerge<T extends AnyObj>(base: T, patch: AnyObj): T {
  const out: AnyObj = { ...base };
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object') {
      out[k] = deepMerge(out[k] as AnyObj, v as AnyObj);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}

let cache: AppConfig | null = null;

/** Returns the effective config: env defaults overridden by any DB-stored settings. */
export async function getSettings(): Promise<AppConfig> {
  if (cache) return cache;
  const row = await prisma.appSetting.findUnique({ where: { key: 'config' } });
  const base = defaults();
  if (row) {
    try {
      cache = deepMerge(base as unknown as AnyObj, JSON.parse(row.value) as AnyObj) as unknown as AppConfig;
    } catch {
      cache = base;
    }
  } else {
    cache = base;
  }
  return cache;
}

export async function updateSettings(patch: Partial<AppConfig>): Promise<AppConfig> {
  const current = await getSettings();
  const merged = deepMerge(current as unknown as AnyObj, patch as AnyObj) as unknown as AppConfig;
  await prisma.appSetting.upsert({
    where: { key: 'config' },
    create: { key: 'config', value: JSON.stringify(merged) },
    update: { value: JSON.stringify(merged) },
  });
  cache = merged;
  return merged;
}

export function clearSettingsCache(): void {
  cache = null;
}
