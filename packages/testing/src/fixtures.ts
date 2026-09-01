import type { TransactionClient } from '@construction-erp/database';
import { TEST_COMPANY_ID } from './context.js';

export type TestCompanyFixtureInput = Readonly<{
  id?: string;
  legalName?: string;
  displayName?: string;
  status?: string;
  baseCurrency?: string;
  timeZone?: string;
  locale?: string;
  fiscalSettings?: { fiscalYearStartMonth: number };
}>;

/** Create test company. */
export async function createTestCompany(tx: TransactionClient, input: TestCompanyFixtureInput = {}) {
  return tx.company.create({
    data: {
      id: input.id ?? TEST_COMPANY_ID,
      legalName: input.legalName ?? 'Foundation Test Company Ltd',
      displayName: input.displayName ?? 'Foundation Test Company',
      status: input.status ?? 'ACTIVE',
      baseCurrency: input.baseCurrency ?? 'USD',
      timeZone: input.timeZone ?? 'UTC',
      locale: input.locale ?? 'en-US',
      fiscalSettings: input.fiscalSettings ?? { fiscalYearStartMonth: 1 }
    }
  });
}
