import { usePermission } from '../../administration/hooks/auth.js';
import type { FinanceJournal, FinanceJournalLine } from '../api/finance-api.js';
import { usePostFinanceJournal, useReverseFinanceJournal } from '../hooks/finance.js';

type FinanceJournalWorkspaceProps = Readonly<{
  journals: readonly FinanceJournal[];
}>;

/** Convert one machine source token into a readable Journal source label. */
function formatSourceType(sourceType: string): string {
  return sourceType
    .toLowerCase()
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

/** Format the Journal line account without exposing its database identifier. */
function formatAccount(line: FinanceJournalLine): string {
  if (line.accountCode && line.accountName) return `${line.accountCode} · ${line.accountName}`;
  return line.accountName ?? line.accountCode ?? 'Account unavailable';
}

/** Format the Journal line Project without exposing its database identifier. */
function formatProject(line: FinanceJournalLine): string {
  if (!line.projectId) return 'Company level';
  if (line.projectCode && line.projectName) return `${line.projectCode} · ${line.projectName}`;
  return line.projectName ?? line.projectCode ?? 'Project unavailable';
}

/** Format the Journal line Stage without exposing its database identifier. */
function formatStage(line: FinanceJournalLine): string {
  if (!line.stageId) return '—';
  if (line.stageCode && line.stageName) return `${line.stageCode} · ${line.stageName}`;
  return line.stageName ?? line.stageCode ?? 'Stage unavailable';
}

/** Render Journal history only; Journal creation is handled automatically by source modules. */
export function FinanceJournalWorkspace({ journals }: FinanceJournalWorkspaceProps) {
  const canPost = usePermission('finance.journals.post');
  const canReverse = usePermission('finance.journals.reverse');
  const postMutation = usePostFinanceJournal();
  const reverseMutation = useReverseFinanceJournal();

  /** Reverse one manual Journal on an explicitly confirmed posting date. */
  async function handleReverse(journal: FinanceJournal): Promise<void> {
    const postingDate = window.prompt('Reversal posting date (YYYY-MM-DD). Use a date in an open fiscal period if the original period is closed.', journal.postingDate);
    if (!postingDate) return;
    await reverseMutation.mutateAsync({ journalId: journal.id, postingDate });
  }

  return (
    <section className="admin-card">
      <h2>Journal Records</h2>
      <p className="muted">Journal entries are created automatically by Finance-enabled business transactions. This section keeps the accounting history readable and auditable.</p>

      <div className="table-wrap">
        <table className="admin-table">
          <thead><tr><th>Journal</th><th>Date</th><th>Status</th><th>Period</th><th>Debit</th><th>Credit</th><th>Scope / Lines</th><th>Actions</th></tr></thead>
          <tbody>
            {journals.map((journal) => (
              <tr key={journal.id}>
                <td>
                  <strong>{journal.journalNo}</strong><span>{journal.description}</span>
                  <small className="muted">{formatSourceType(journal.sourceType)}</small>
                </td>
                <td>{journal.postingDate}<br /><small>{journal.postedAt ? `Posted ${new Date(journal.postedAt).toLocaleString()}` : 'Not posted'}</small></td>
                <td>{journal.status}<br /><small>Created by {journal.createdByName ?? 'System'}</small></td>
                <td>{journal.periodLabel ?? 'Fiscal period'}</td><td>{journal.totalDebit}</td><td>{journal.totalCredit}</td>
                <td>
                  <span>{journal.lines.some((line) => line.stageId) ? 'Project / Stage' : journal.lines.some((line) => line.projectId) ? 'Project' : 'Company'}</span>
                  <details><summary>{journal.lines.length} line(s)</summary>
                    {journal.lines.map((line) => <div key={line.id}>Account {formatAccount(line)} · Project {formatProject(line)} · Stage {formatStage(line)} · Debit {line.debit} · Credit {line.credit} · {line.description}</div>)}
                  </details>
                </td>
                <td className="action-row">
                  {canPost && journal.status === 'DRAFT' && <button type="button" disabled={postMutation.isPending} onClick={() => postMutation.mutate(journal.id)}>Post</button>}
                  {canReverse && journal.status === 'POSTED' && journal.sourceType === 'MANUAL' && <button type="button" className="secondary-button" disabled={reverseMutation.isPending} onClick={() => void handleReverse(journal)}>Reverse</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(postMutation.error ?? reverseMutation.error) instanceof Error && <p className="form-error" role="alert">{String((postMutation.error ?? reverseMutation.error)?.message)}</p>}
    </section>
  );
}
