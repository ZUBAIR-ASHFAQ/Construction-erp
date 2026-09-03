import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useCashBankAccounts } from '../../finance/hooks/finance.js';
import {
  useCreateSubcontractPayment,
  useSubcontractLedger,
  useSubcontractPayments,
  useSubcontractors
} from '../hooks/vendors-subcontractors.js';

const paymentFormSchema = z.object({
  subcontractorId: z.string().uuid('Select a subcontractor.'),
  subcontractContractId: z.string().uuid('Select a subcontract contract.'),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Select the payment date.'),
  amount: z.string().trim().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/, 'Enter a valid amount with at most 2 decimal places.')
    .refine((value) => Number(value) > 0, 'Payment amount must be greater than 0.'),
  cashBankAccountId: z.string().uuid('Select a Cash/Bank account.'),
  reference: z.string().trim().max(200, 'Reference must be 200 characters or fewer.').optional()
});

type PaymentFormValues = z.infer<typeof paymentFormSchema>;
type WorkspaceProps = Readonly<{
  view: 'payment' | 'ledger';
  canReadSubcontractors: boolean;
  canManageSubcontractors: boolean;
  canReadFinance: boolean;
}>;

/** Format one API money string without changing its currency value. */
function formatMoney(value: string, currency?: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 2 }).format(amount);
}

/** Return the stable browser-local date input value. */
function todayDate(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/** Render the direct subcontract payment form and source-derived subcontract ledger. */
export function SubcontractPaymentsWorkspace(props: WorkspaceProps) {
  const [ledgerSubcontractorId, setLedgerSubcontractorId] = useState('');
  const [ledgerStatus, setLedgerStatus] = useState('');
  const subcontractors = useSubcontractors({ page: 1, pageSize: 100 }, props.canReadSubcontractors);
  const ledger = useSubcontractLedger({
    ...(props.view === 'ledger' && ledgerSubcontractorId ? { subcontractorId: ledgerSubcontractorId } : {}),
    ...(props.view === 'ledger' && (ledgerStatus === 'ACTIVE' || ledgerStatus === 'FINISHED') ? { status: ledgerStatus } : {}),
    page: 1,
    pageSize: 100
  }, props.canReadSubcontractors);
  const payments = useSubcontractPayments({
    ...(props.view === 'ledger' && ledgerSubcontractorId ? { subcontractorId: ledgerSubcontractorId } : {}),
    page: 1,
    pageSize: 100
  }, props.canReadSubcontractors);
  const cashBankAccounts = useCashBankAccounts({ page: 1, pageSize: 100, status: 'ACTIVE' }, props.canReadFinance && props.view === 'payment');
  const createPayment = useCreateSubcontractPayment();
  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      subcontractorId: '',
      subcontractContractId: '',
      paymentDate: todayDate(),
      amount: '',
      cashBankAccountId: '',
      reference: ''
    }
  });
  const selectedSubcontractorId = form.watch('subcontractorId');
  const selectedContractId = form.watch('subcontractContractId');
  const availableContracts = useMemo(() => (ledger.data?.items ?? []).filter((row) => (
    row.subcontractor.id === selectedSubcontractorId && Number(row.balanceAmount) > 0
  )), [ledger.data?.items, selectedSubcontractorId]);
  const selectedContract = availableContracts.find((row) => row.subcontractContractId === selectedContractId);

  /** Clear the contract when the user switches to another subcontractor. */
  function handleSubcontractorChange(): void {
    form.setValue('subcontractContractId', '', { shouldValidate: false });
  }

  /** Create and post one payment against the selected subcontract contract. */
  async function handleCreatePayment(values: PaymentFormValues): Promise<void> {
    if (selectedContract && Number(values.amount) > Number(selectedContract.balanceAmount)) {
      form.setError('amount', { message: 'Payment cannot exceed the remaining subcontract balance.' });
      return;
    }
    await createPayment.mutateAsync({
      subcontractContractId: values.subcontractContractId,
      paymentDate: values.paymentDate,
      amount: values.amount,
      cashBankAccountId: values.cashBankAccountId,
      reference: values.reference?.trim() || null
    });
    form.reset({
      subcontractorId: values.subcontractorId,
      subcontractContractId: '',
      paymentDate: todayDate(),
      amount: '',
      cashBankAccountId: values.cashBankAccountId,
      reference: ''
    });
  }

  if (props.view === 'payment') {
    return (
      <section className="admin-stack" aria-labelledby="subcontract-payment-title">
        <section className="admin-card">
          <p className="eyebrow">Subcontractor Module</p>
          <h1 id="subcontract-payment-title">New Subcontractor Payment</h1>
          <p className="muted">Record a payment against an assigned subcontract contract. The Project and remaining amount come from that subcontractor contract.</p>
        </section>

        {props.canManageSubcontractors && props.canReadFinance ? (
          <section className="admin-card">
            <h2>Payment details</h2>
            <form className="admin-form" onSubmit={form.handleSubmit(handleCreatePayment)} noValidate>
              <div className="client-form-grid">
                <label>
                  Subcontractor
                  <select {...form.register('subcontractorId', { onChange: handleSubcontractorChange })}>
                    <option value="">Select subcontractor</option>
                    {(subcontractors.data?.items ?? []).filter((item) => item.status === 'ACTIVE').map((item) => (
                      <option key={item.id} value={item.id}>{item.code} · {item.specialty}</option>
                    ))}
                  </select>
                  <span className="field-error">{form.formState.errors.subcontractorId?.message}</span>
                </label>
                <label>
                  Subcontract / Project
                  <select {...form.register('subcontractContractId')} disabled={!selectedSubcontractorId}>
                    <option value="">Select subcontract</option>
                    {availableContracts.map((contract) => (
                      <option key={contract.subcontractContractId} value={contract.subcontractContractId}>
                        {contract.project.projectCode} · {contract.project.name} · Remaining {formatMoney(contract.balanceAmount, contract.project.currency)}
                      </option>
                    ))}
                  </select>
                  <span className="field-error">{form.formState.errors.subcontractContractId?.message}</span>
                </label>
                <label>
                  Payment date
                  <input type="date" {...form.register('paymentDate')} />
                  <span className="field-error">{form.formState.errors.paymentDate?.message}</span>
                </label>
                <label>
                  Amount
                  <input inputMode="decimal" {...form.register('amount')} />
                  <span className="field-error">{form.formState.errors.amount?.message}</span>
                </label>
                <label>
                  Cash / Bank account
                  <select {...form.register('cashBankAccountId')}>
                    <option value="">Select Cash / Bank account</option>
                    {(cashBankAccounts.data?.items ?? []).map((account) => (
                      <option key={account.id} value={account.id}>{account.name} ({account.accountType})</option>
                    ))}
                  </select>
                  <span className="field-error">{form.formState.errors.cashBankAccountId?.message}</span>
                </label>
                <label>
                  Reference (optional)
                  <input {...form.register('reference')} />
                  <span className="field-error">{form.formState.errors.reference?.message}</span>
                </label>
              </div>
              {selectedContract && (
                <p className="muted">Contract {formatMoney(selectedContract.contractAmount, selectedContract.project.currency)} · Paid {formatMoney(selectedContract.paidAmount, selectedContract.project.currency)} · Remaining {formatMoney(selectedContract.balanceAmount, selectedContract.project.currency)}</p>
              )}
              {createPayment.error instanceof Error && <div className="form-error" role="alert">{createPayment.error.message}</div>}
              <button type="submit" disabled={createPayment.isPending}>{createPayment.isPending ? 'Posting…' : 'Create payment'}</button>
            </form>
          </section>
        ) : (
          <section className="admin-card"><p className="muted">Subcontractor management and Finance read access are required to create a payment.</p></section>
        )}

        <section className="admin-card">
          <h2>Recent subcontractor payments</h2>
          {payments.error instanceof Error && <div className="form-error" role="alert">{payments.error.message}</div>}
          <div className="table-wrap">
            <table className="admin-table">
              <thead><tr><th>Payment</th><th>Subcontractor</th><th>Project</th><th>Date</th><th>Amount</th><th>Cash / Bank</th><th>Status</th><th>Reference</th></tr></thead>
              <tbody>
                {(payments.data?.items ?? []).map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.paymentNo}</td>
                    <td>{payment.subcontractor.code} · {payment.subcontractor.specialty}</td>
                    <td>{payment.project.projectCode} · {payment.project.name}</td>
                    <td>{payment.paymentDate}</td>
                    <td>{formatMoney(payment.amount, payment.project.currency)}</td>
                    <td>{payment.cashBankAccount.name}</td>
                    <td>{payment.status}</td>
                    <td>{payment.reference || '—'}</td>
                  </tr>
                ))}
                {!payments.isLoading && (payments.data?.items.length ?? 0) === 0 && <tr><td colSpan={8}>No subcontractor payments yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="admin-stack" aria-labelledby="subcontract-ledger-title">
      <section className="admin-card">
        <p className="eyebrow">Subcontractor Module</p>
        <h1 id="subcontract-ledger-title">Subcontractor Ledger</h1>
        <p className="muted">Contract value, posted payments and remaining balance are derived directly from each subcontractor contract.</p>
      </section>

      <section className="admin-card">
        <h2>Ledger filters</h2>
        <div className="client-form-grid">
          <label>
            Subcontractor
            <select value={ledgerSubcontractorId} onChange={(event) => setLedgerSubcontractorId(event.target.value)}>
              <option value="">All subcontractors</option>
              {(subcontractors.data?.items ?? []).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.specialty}</option>)}
            </select>
          </label>
          <label>
            Contract status
            <select value={ledgerStatus} onChange={(event) => setLedgerStatus(event.target.value)}>
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="FINISHED">Finished</option>
            </select>
          </label>
        </div>
      </section>

      <section className="admin-card">
        <h2>Contract balances</h2>
        {ledger.error instanceof Error && <div className="form-error" role="alert">{ledger.error.message}</div>}
        <div className="table-wrap">
          <table className="admin-table">
            <thead><tr><th>Subcontractor</th><th>Project</th><th>Contract date</th><th>Status</th><th>Contract amount</th><th>Paid</th><th>Balance</th></tr></thead>
            <tbody>
              {(ledger.data?.items ?? []).map((row) => (
                <tr key={row.subcontractContractId}>
                  <td>{row.subcontractor.code} · {row.subcontractor.specialty}</td>
                  <td>{row.project.projectCode} · {row.project.name}</td>
                  <td>{row.contractDate}</td>
                  <td>{row.status}</td>
                  <td>{formatMoney(row.contractAmount, row.project.currency)}</td>
                  <td>{formatMoney(row.paidAmount, row.project.currency)}</td>
                  <td>{formatMoney(row.balanceAmount, row.project.currency)}</td>
                </tr>
              ))}
              {!ledger.isLoading && (ledger.data?.items.length ?? 0) === 0 && <tr><td colSpan={7}>No subcontract contracts match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-card">
        <h2>Payment history</h2>
        {payments.error instanceof Error && <div className="form-error" role="alert">{payments.error.message}</div>}
        <div className="table-wrap">
          <table className="admin-table">
            <thead><tr><th>Payment</th><th>Subcontractor</th><th>Project</th><th>Date</th><th>Amount</th><th>Cash / Bank</th><th>Reference</th></tr></thead>
            <tbody>
              {(payments.data?.items ?? []).map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.paymentNo}</td>
                  <td>{payment.subcontractor.code} · {payment.subcontractor.specialty}</td>
                  <td>{payment.project.projectCode} · {payment.project.name}</td>
                  <td>{payment.paymentDate}</td>
                  <td>{formatMoney(payment.amount, payment.project.currency)}</td>
                  <td>{payment.cashBankAccount.name}</td>
                  <td>{payment.reference || '—'}</td>
                </tr>
              ))}
              {!payments.isLoading && (payments.data?.items.length ?? 0) === 0 && <tr><td colSpan={7}>No subcontractor payments match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
