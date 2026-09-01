export type ConfigurationIssue = Readonly<{
  key: string;
  message: string;
  received?: string;
}>;

export class ConfigurationError extends Error {
  readonly issues: readonly ConfigurationIssue[];

  /** Create a new ConfigurationError instance. */
  constructor(issues: readonly ConfigurationIssue[]) {
    super(
      `Invalid application configuration: ${issues
        .map((issue) => `${issue.key}: ${issue.message}`)
        .join('; ')}`
    );
    this.name = 'ConfigurationError';
    this.issues = issues;
  }
}
