/**
 * Server-only database configuration contract. The URL is validated by the
 * aggregate server configuration loader so configuration failures are reported
 * together without leaking credential-bearing values.
 */
export type DatabaseConfig = Readonly<{
  url: string;
}>;

export const DEVELOPMENT_DATABASE_URL =
  'postgresql://construction_erp:construction_erp@localhost:5432/construction_erp?schema=public';
