import { useRef, useState } from 'react';
import {
  createDocumentLink,
  getDocumentDownload,
  listDocuments,
  uploadDocument,
  type DocumentLinkResourceType
} from '../api/documents-api.js';

export type PaymentProofResourceType = Extract<DocumentLinkResourceType, 'supplier_payment' | 'subcontract_payment'>;

type PaymentProofReference = Readonly<{
  id: string;
  paymentNo: string;
  projectId: string | null;
  resourceType: PaymentProofResourceType;
  titlePrefix: string;
  category: string;
}>;

/** Store an immutable payment-proof file and link it to its accounting payment. */
export async function savePaymentProof(payment: PaymentProofReference, file: File): Promise<void> {
  const uploaded = await uploadDocument({
    file,
    title: `${payment.titlePrefix} ${payment.paymentNo}`,
    category: payment.category,
    projectId: payment.projectId,
    documentNo: payment.paymentNo
  });
  await createDocumentLink(uploaded.document.id, {
    versionId: uploaded.version.id,
    resourceType: payment.resourceType,
    resourceId: payment.id
  });
}

/** Download the newest proof linked to a payment without consuming or unlinking it. */
export async function downloadPaymentProof(payment: PaymentProofReference): Promise<void> {
  const documents = await listDocuments({
    ...(payment.projectId ? { projectId: payment.projectId } : {}),
    resourceType: payment.resourceType,
    resourceId: payment.id,
    page: 1,
    pageSize: 1
  });
  const document = documents.items[0];
  if (!document) throw new Error(`No payment proof is attached to ${payment.paymentNo}.`);
  const download = await getDocumentDownload(document.id);
  const response = await fetch(download.url);
  if (!response.ok) throw new Error(`Payment-proof download failed with status ${response.status}.`);
  const objectUrl = URL.createObjectURL(await response.blob());
  const anchor = window.document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = download.version.originalName || document.fileName || `payment-proof-${payment.paymentNo}`;
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}

/** Keep proof upload and download available beside every persisted payment row. */
export function PaymentProofActions(props: PaymentProofReference & Readonly<{
  canRead: boolean;
  canAttach: boolean;
}>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'upload' | 'download' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const payment: PaymentProofReference = props;

  async function attach(file: File | null): Promise<void> {
    if (!file) return;
    setBusy('upload');
    setMessage(null);
    try {
      await savePaymentProof(payment, file);
      setMessage(`${file.name} saved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The payment proof could not be saved.');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
      setBusy(null);
    }
  }

  async function download(): Promise<void> {
    setBusy('download');
    setMessage(null);
    try {
      await downloadPaymentProof(payment);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The payment proof could not be downloaded.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="payment-proof-actions">
      <div className="button-row">
        {props.canRead && <button type="button" className="secondary-button" disabled={busy !== null} onClick={() => void download()}>{busy === 'download' ? 'Downloading…' : 'Download proof'}</button>}
        {props.canAttach && <>
          <input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,application/pdf" onChange={(event) => void attach(event.target.files?.[0] ?? null)} />
          <button type="button" className="secondary-button" disabled={busy !== null} onClick={() => inputRef.current?.click()}>{busy === 'upload' ? 'Uploading…' : 'Attach proof'}</button>
        </>}
      </div>
      {message && <small className="muted" role="status">{message}</small>}
    </div>
  );
}
