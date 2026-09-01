import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { acceptInvitation, completePasswordReset, requestPasswordReset } from '../api/auth-api.js';
import { useAuth } from '../hooks/auth.js';

const signInSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.')
});

const recoverySchema = z.object({
  email: z.string().trim().email('Enter a valid email address.')
});

const setPasswordSchema = z.object({
  password: z.string().min(8, 'Use at least 8 characters.'),
  confirmPassword: z.string().min(8, 'Confirm your password.')
}).refine((value) => value.password === value.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Passwords do not match.'
});

type SignInValues = z.infer<typeof signInSchema>;
type RecoveryValues = z.infer<typeof recoverySchema>;
type SetPasswordValues = z.infer<typeof setPasswordSchema>;
type AuthPageMode = 'sign-in' | 'recovery' | 'invitation' | 'reset';

/** Read the optional signed invitation/reset token from the current URL. */
function readActionFromUrl(): Readonly<{ mode: AuthPageMode; token: string | null }> {
  const params = new URLSearchParams(window.location.search);
  const invitation = params.get('invite');
  if (invitation) return { mode: 'invitation', token: invitation };
  const reset = params.get('reset');
  if (reset) return { mode: 'reset', token: reset };
  return { mode: 'sign-in', token: null };
}

/** Remove a consumed action token from the browser URL without adding a router. */
function clearActionUrl(): void {
  window.history.replaceState({}, '', window.location.pathname);
}

/** Render sign-in plus the small invitation and password-recovery flows used by Administration. */
export function SignInPage() {
  const auth = useAuth();
  const action = readActionFromUrl();
  const [mode, setMode] = useState<AuthPageMode>(action.mode);
  const [actionToken, setActionToken] = useState<string | null>(action.token);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  const signInForm = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' }
  });
  const recoveryForm = useForm<RecoveryValues>({
    resolver: zodResolver(recoverySchema),
    defaultValues: { email: '' }
  });
  const passwordForm = useForm<SetPasswordValues>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' }
  });

  /** Submit validated credentials through the shared authentication provider. */
  async function handleSignIn(values: SignInValues): Promise<void> {
    await auth.signIn(values);
  }

  /** Request password recovery and always show the same non-enumerating response. */
  async function handleRecovery(values: RecoveryValues): Promise<void> {
    setActionError(null);
    setIsSubmittingAction(true);
    try {
      await requestPasswordReset(values.email);
      setMessage('If that account is eligible, password-reset instructions will be sent.');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Password recovery could not be started.');
    } finally {
      setIsSubmittingAction(false);
    }
  }

  /** Consume the signed invitation/reset token and save the new password. */
  async function handleSetPassword(values: SetPasswordValues): Promise<void> {
    if (!actionToken) {
      setActionError('This link is not valid.');
      return;
    }

    setActionError(null);
    setIsSubmittingAction(true);
    try {
      if (mode === 'invitation') await acceptInvitation(actionToken, values.password);
      else await completePasswordReset(actionToken, values.password);

      clearActionUrl();
      setActionToken(null);
      setMode('sign-in');
      passwordForm.reset();
      setMessage(mode === 'invitation' ? 'Your account is ready. Sign in to continue.' : 'Password updated. Sign in again.');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'This link could not be completed.');
    } finally {
      setIsSubmittingAction(false);
    }
  }

  /** Return from password recovery to the normal sign-in form. */
  function showSignIn(): void {
    clearActionUrl();
    setActionToken(null);
    setActionError(null);
    setMode('sign-in');
  }

  if (mode === 'invitation' || mode === 'reset') {
    const title = mode === 'invitation' ? 'Accept invitation' : 'Reset password';
    return (
      <main className="auth-page">
        <section className="auth-card" aria-labelledby="set-password-title">
          <p className="eyebrow">Module 2 · Administration</p>
          <h1 id="set-password-title">{title}</h1>
          <p className="muted">Choose a password with at least 8 characters.</p>
          <form className="auth-form" onSubmit={passwordForm.handleSubmit(handleSetPassword)} noValidate>
            <label>
              New password
              <input type="password" autoComplete="new-password" {...passwordForm.register('password')} />
              {passwordForm.formState.errors.password && <span className="field-error">{passwordForm.formState.errors.password.message}</span>}
            </label>
            <label>
              Confirm password
              <input type="password" autoComplete="new-password" {...passwordForm.register('confirmPassword')} />
              {passwordForm.formState.errors.confirmPassword && <span className="field-error">{passwordForm.formState.errors.confirmPassword.message}</span>}
            </label>
            {actionError && <div className="form-error" role="alert">{actionError}</div>}
            <button type="submit" disabled={isSubmittingAction}>{isSubmittingAction ? 'Saving…' : title}</button>
            <button type="button" className="secondary-button" onClick={showSignIn}>Back to sign in</button>
          </form>
        </section>
      </main>
    );
  }

  if (mode === 'recovery') {
    return (
      <main className="auth-page">
        <section className="auth-card" aria-labelledby="recovery-title">
          <p className="eyebrow">Module 2 · Administration</p>
          <h1 id="recovery-title">Password recovery</h1>
          <p className="muted">Enter your account email. The response is the same whether the account exists or not.</p>
          <form className="auth-form" onSubmit={recoveryForm.handleSubmit(handleRecovery)} noValidate>
            <label>
              Email
              <input type="email" autoComplete="email" {...recoveryForm.register('email')} />
              {recoveryForm.formState.errors.email && <span className="field-error">{recoveryForm.formState.errors.email.message}</span>}
            </label>
            {message && <p role="status">{message}</p>}
            {actionError && <div className="form-error" role="alert">{actionError}</div>}
            <button type="submit" disabled={isSubmittingAction}>{isSubmittingAction ? 'Submitting…' : 'Send reset instructions'}</button>
            <button type="button" className="secondary-button" onClick={showSignIn}>Back to sign in</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="sign-in-title">
        <p className="eyebrow">Module 2 · Administration</p>
        <h1 id="sign-in-title">Sign in</h1>
        <p className="muted">Use your Construction ERP account to continue.</p>
        {message && <p role="status">{message}</p>}

        <form className="auth-form" onSubmit={signInForm.handleSubmit(handleSignIn)} noValidate>
          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              {...signInForm.register('email')}
              aria-invalid={Boolean(signInForm.formState.errors.email)}
            />
            {signInForm.formState.errors.email && <span className="field-error">{signInForm.formState.errors.email.message}</span>}
          </label>

          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              {...signInForm.register('password')}
              aria-invalid={Boolean(signInForm.formState.errors.password)}
            />
            {signInForm.formState.errors.password && <span className="field-error">{signInForm.formState.errors.password.message}</span>}
          </label>

          {auth.signInError && <div className="form-error" role="alert">{auth.signInError}</div>}
          <button type="submit" disabled={auth.isSigningIn}>{auth.isSigningIn ? 'Signing in…' : 'Sign in'}</button>
          <button type="button" className="link-button" onClick={() => setMode('recovery')}>Forgot password?</button>
        </form>
      </section>
    </main>
  );
}
