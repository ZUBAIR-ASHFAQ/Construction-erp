import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { createDepartment, listDepartments } from '../api/admin-api.js';

const departmentSchema = z.object({
  name: z.string().trim().min(1, 'Department name is required.').max(160)
});

type DepartmentValues = z.infer<typeof departmentSchema>;

/** Show company Departments and the final Administration create command. */
export function DepartmentsPage() {
  const queryClient = useQueryClient();
  const departmentsQuery = useQuery({
    queryKey: ['administration', 'departments'],
    queryFn: () => listDepartments(1, 100)
  });
  const form = useForm<DepartmentValues>({
    resolver: zodResolver(departmentSchema),
    defaultValues: { name: '' }
  });
  const createMutation = useMutation({
    mutationFn: (values: DepartmentValues) => createDepartment(values.name),
    onSuccess: async () => {
      form.reset();
      await queryClient.invalidateQueries({ queryKey: ['administration', 'departments'] });
    }
  });

  /** Submit one validated Department name to the Administration API. */
  async function handleCreate(values: DepartmentValues): Promise<void> {
    await createMutation.mutateAsync(values);
  }

  return (
    <section className="admin-stack" aria-labelledby="departments-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Module 2 · Administration</p>
          <h1 id="departments-title">Departments</h1>
          <p className="muted">Maintain the company Department master used by Administration and later people workflows.</p>
        </div>
      </div>

      <section className="admin-card">
        <h2>Department list</h2>
        {departmentsQuery.isPending && <p>Loading Departments…</p>}
        {departmentsQuery.error instanceof Error && <div className="form-error" role="alert">{departmentsQuery.error.message}</div>}
        {departmentsQuery.data && (
          <div className="table-wrap">
            <table className="admin-table">
              <thead><tr><th>Name</th><th>Status</th></tr></thead>
              <tbody>
                {departmentsQuery.data.items.map((department) => (
                  <tr key={department.id}>
                    <td>{department.name}</td>
                    <td>{department.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {departmentsQuery.data?.items.length === 0 && <p className="muted">No Departments have been created yet.</p>}
      </section>

      <section className="admin-card">
        <h2>Create Department</h2>
        <form className="admin-form" onSubmit={form.handleSubmit(handleCreate)} noValidate>
          <label>Department name<input {...form.register('name')} /></label>
          {form.formState.errors.name && <span className="field-error">{form.formState.errors.name.message}</span>}
          {createMutation.error instanceof Error && <div className="form-error" role="alert">{createMutation.error.message}</div>}
          <button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? 'Creating…' : 'Create Department'}</button>
        </form>
      </section>
    </section>
  );
}
