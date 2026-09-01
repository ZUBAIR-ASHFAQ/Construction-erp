import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { getOrganizationProfile, updateOrganizationProfile } from '../api/admin-api.js';

const organizationProfileSchema = z.object({
  legalName: z.string().trim().min(1, 'Legal name is required.').max(200),
  displayName: z.string().trim().min(1, 'Display name is required.').max(200),
  timeZone: z.string().trim().min(1, 'Time zone is required.').max(100),
  locale: z.string().trim().min(1, 'Locale is required.').max(35)
});

type OrganizationProfileValues = z.infer<typeof organizationProfileSchema>;

type OrganizationProfilePageProps = Readonly<{
  canEdit: boolean;
}>;

/** Show and, when permitted, edit the narrow company Organization Profile owned by Administration. */
export function OrganizationProfilePage({ canEdit }: OrganizationProfilePageProps) {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ['administration', 'organization-profile'],
    queryFn: getOrganizationProfile
  });
  const form = useForm<OrganizationProfileValues>({
    resolver: zodResolver(organizationProfileSchema),
    defaultValues: { legalName: '', displayName: '', timeZone: '', locale: '' }
  });
  const updateMutation = useMutation({
    mutationFn: updateOrganizationProfile,
    onSuccess: async (profile) => {
      form.reset({
        legalName: profile.legalName,
        displayName: profile.displayName,
        timeZone: profile.timeZone,
        locale: profile.locale
      });
      await queryClient.invalidateQueries({ queryKey: ['administration', 'organization-profile'] });
    }
  });

  /** Synchronize the editable form when the trusted profile finishes loading. */
  useEffect(() => {
    const profile = profileQuery.data;
    if (!profile) return;
    form.reset({
      legalName: profile.legalName,
      displayName: profile.displayName,
      timeZone: profile.timeZone,
      locale: profile.locale
    });
  }, [profileQuery.data, form]);

  /** Submit one validated Organization Profile update. */
  async function handleUpdate(values: OrganizationProfileValues): Promise<void> {
    await updateMutation.mutateAsync(values);
  }

  const profile = profileQuery.data;

  return (
    <section className="admin-stack" aria-labelledby="organization-profile-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Module 2 · Administration</p>
          <h1 id="organization-profile-title">Organization profile</h1>
          <p className="muted">Maintain company identity and regional display settings without changing financial or fiscal ownership.</p>
        </div>
      </div>

      {profileQuery.isPending && <section className="admin-card"><p>Loading organization profile…</p></section>}
      {profileQuery.error instanceof Error && <div className="form-error" role="alert">{profileQuery.error.message}</div>}

      {profile && (
        <>
          <section className="admin-card">
            <h2>Company settings</h2>
            <div className="summary-grid">
              <div><span>Status</span><strong>{profile.status}</strong></div>
              <div><span>Base currency</span><strong>{profile.baseCurrency}</strong></div>
              <div><span>Fiscal settings</span><strong>{JSON.stringify(profile.fiscalSettings)}</strong></div>
              <div><span>Created</span><strong>{new Date(profile.createdAt).toLocaleString()}</strong></div>
              <div><span>Updated</span><strong>{new Date(profile.updatedAt).toLocaleString()}</strong></div>
            </div>
            <p className="muted">Status, base currency and fiscal settings are read-only here because they affect Foundation and Finance behavior.</p>
          </section>

          <section className="admin-card">
            <h2>Profile details</h2>
            <form className="admin-form" onSubmit={form.handleSubmit(handleUpdate)} noValidate>
              <label>Legal name<input {...form.register('legalName')} disabled={!canEdit} /></label>
              {form.formState.errors.legalName && <span className="field-error">{form.formState.errors.legalName.message}</span>}
              <label>Display name<input {...form.register('displayName')} disabled={!canEdit} /></label>
              {form.formState.errors.displayName && <span className="field-error">{form.formState.errors.displayName.message}</span>}
              <label>Time zone<input {...form.register('timeZone')} disabled={!canEdit} placeholder="Asia/Karachi" /></label>
              {form.formState.errors.timeZone && <span className="field-error">{form.formState.errors.timeZone.message}</span>}
              <label>Locale<input {...form.register('locale')} disabled={!canEdit} placeholder="en-PK" /></label>
              {form.formState.errors.locale && <span className="field-error">{form.formState.errors.locale.message}</span>}
              {updateMutation.error instanceof Error && <div className="form-error" role="alert">{updateMutation.error.message}</div>}
              {canEdit && <button type="submit" disabled={updateMutation.isPending}>{updateMutation.isPending ? 'Saving…' : 'Save profile'}</button>}
            </form>
          </section>
        </>
      )}
    </section>
  );
}
