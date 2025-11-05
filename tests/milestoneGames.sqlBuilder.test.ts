import { describe, it, expect } from 'vitest';
import { buildWhereClause, labelFor, MilestoneQuery } from '../src/lib/leaderboards/milestoneGames';

describe('milestoneGames SQL builder', () => {
  it('builds points+rebounds combo', () => {
    const q: MilestoneQuery = { type: 'combo', minPoints: 20, minRebounds: 10 };
    const { sql, params } = buildWhereClause(q);
    expect(sql).toContain('points >= ?');
    expect(sql).toContain('rebounds >= ?');
    expect(params).toEqual([20, 10]);
    expect(labelFor(q)).toBe('20+ pts & 10+ reb games');
  });

  it('builds min-games having', () => {
    const q: MilestoneQuery = { type: 'rebounds', minRebounds: 10, minGames: 20 };
    const { sql, params } = buildWhereClause(q);
    expect(sql).toContain('rebounds >= ?');
    expect(params).toEqual([10]);
  });
});
