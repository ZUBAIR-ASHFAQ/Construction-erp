import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useCreateFinanceAccount } from '../hooks/finance.js';

const projectAccountSchema = z.object({
  name: z.string().trim().min(1, 'Account name is required.').max(300),
  accountType: z.enum(['CASH', 'BANK']),
  openingBalance: z.string().trim().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/, 'Enter a valid opening balance.'),
  bankName: z.string().trim().max(200),
  accountReference: z.string().trim().max(200)
}).superRefine((value, context) => {
  if (value.accountType === 'BANK' && !value.bankName) context.addIssue({ code: z.ZodIssueCode.custom, path: ['bankName'], message: 'Bank name is required.' });
  if (value.accountType === 'BANK' && !value.accountReference) context.addIssue({ code: z.ZodIssueCode.custom, path: ['accountReference'], message: 'Bank account number is required.' });
});

type ProjectAccountValues = z.infer<typeof projectAccountSchema>;

/** Add one Cash/Bank account owned by the selected Project without exposing Finance-core screens. */
export function ProjectAccountCreateModal(props: Readonly<{ projectId: string; projectLabel: string; onClose: () => void; onCreated?: () => void | Promise<void> }>) {
  const mutation = useCreateFinanceAccount();
  const form = useForm<ProjectAccountValues>({
    resolver: zodResolver(projectAccountSchema),
    defaultValues: { name: '', accountType: 'CASH', openingBalance: '0.00', bankName: '', accountReference: '' }
  });
  const accountType = form.watch('accountType');

  /** Create the account inside the authenticated Project scope and close after query invalidation. */
  async function submit(values: ProjectAccountValues): Promise<void> {
    await mutation.mutateAsync({
      projectId: props.projectId,
      name: values.name,
      accountType: values.accountType,
      openingBalance: values.openingBalance,
      ...(values.accountType === 'BANK' ? { bankName: values.bankName, accountReference: values.accountReference } : {})
    });
    await props.onCreated?.();
    props.onClose();
  }

  return <div className="finance-modal-backdrop" role="presentation"><section className="finance-modal" role="dialog" aria-modal="true" aria-labelledby="project-account-create-title"><header className="finance-modal-header"><div><p className="eyebrow">Project account</p><h2 id="project-account-create-title">Add Cash / Bank Account</h2><p>{props.projectLabel}</p></div><button type="button" className="finance-modal-close" aria-label="Close account form" onClick={props.onClose}>×</button></header><div className="finance-modal-body"><form className="admin-grid two-columns" onSubmit={form.handleSubmit(submit)}><label>Account name<input {...form.register('name')} /><span className="field-error">{form.formState.errors.name?.message}</span></label><label>Account type<select {...form.register('accountType')}><option value="CASH">Cash</option><option value="BANK">Bank</option></select></label>{accountType === 'BANK' && <><label>Bank name<input {...form.register('bankName')} /><span className="field-error">{form.formState.errors.bankName?.message}</span></label><label>Bank account number<input {...form.register('accountReference')} autoComplete="off" /><span className="field-error">{form.formState.errors.accountReference?.message}</span></label></>}<label>Opening balance<input type="number" min="0" step="0.01" inputMode="decimal" {...form.register('openingBalance')} /><span className="field-error">{form.formState.errors.openingBalance?.message}</span></label>{mutation.error instanceof Error && <p className="form-error" role="alert">{mutation.error.message}</p>}<div className="form-actions"><button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Creating…' : 'Create account'}</button><button type="button" className="secondary-button" onClick={props.onClose}>Cancel</button></div></form></div></section></div>;
}
