import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  clearSessionTokens,
  getCurrentIdentity,
  readAccessToken,
  readAccessTokenExpiresAt,
  refreshStoredSession,
  saveAccessToken,
  signIn as signInRequest,
  signOut as signOutRequest,
  type AuthSessionResult,
  type CurrentIdentity,
  type SignInInput
} from '../api/auth-api.js';

type AuthContextValue = Readonly<{
  identity: CurrentIdentity | null;
  isCheckingSession: boolean;
  isSigningIn: boolean;
  signInError: string | null;
  signIn: (input: SignInInput) => Promise<void>;
  isSigningOut: boolean;
  signOut: () => Promise<void>;
}>;

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_QUERY_KEY = ['module-24a', 'current-identity'] as const;
const ACCESS_REFRESH_LEAD_MS = 60 * 1000;

/** Keep the query cache aligned with the server-derived identity returned by login/refresh. */
function identityFromSession(result: AuthSessionResult): CurrentIdentity {
  return {
    user: result.user,
    permissions: result.permissions,
    projectScope: result.projectScope
  };
}

/** Provide the current Administration session and auth actions to the React tree. */
export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const queryClient = useQueryClient();
  // Always try the HttpOnly refresh cookie once on startup. This restores a
  // valid server session after a reload/new tab even when sessionStorage is empty.
  const [hasSession, setHasSession] = useState(true);

  const identityQuery = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: getCurrentIdentity,
    enabled: hasSession,
    retry: false
  });

  useEffect(() => {
    if (identityQuery.isError && readAccessToken() === null) {
      setHasSession(false);
    }
  }, [identityQuery.isError]);

  useEffect(() => {
    if (!hasSession || !identityQuery.data) return undefined;

    const expiresAt = readAccessTokenExpiresAt();
    if (expiresAt === null) return undefined;

    const delay = Math.max(0, expiresAt - Date.now() - ACCESS_REFRESH_LEAD_MS);
    const timer = window.setTimeout(() => {
      void refreshStoredSession()
        .then((result) => {
          queryClient.setQueryData<CurrentIdentity>(AUTH_QUERY_KEY, identityFromSession(result));
        })
        .catch(() => {
          // Keep the current browser state on transient refresh failures. The
          // next protected request still retries refresh and only clears the
          // session when the server explicitly returns 401.
        });
    }, delay);

    return () => window.clearTimeout(timer);
  }, [hasSession, identityQuery.data, queryClient]);

  const signInMutation = useMutation({
    mutationFn: signInRequest,
    onSuccess(result) {
      saveAccessToken(result.accessToken, result.session.accessExpiresAt);
      setHasSession(true);
      queryClient.setQueryData<CurrentIdentity>(AUTH_QUERY_KEY, identityFromSession(result));
    }
  });

  const signOutMutation = useMutation({
    mutationFn: signOutRequest,
    onSettled() {
      clearSessionTokens();
      setHasSession(false);
      queryClient.removeQueries({ queryKey: AUTH_QUERY_KEY });
    }
  });

  /** Sign in and save the returned short-lived access credential. */
  async function handleSignIn(input: SignInInput): Promise<void> {
    await signInMutation.mutateAsync(input);
  }

  /** Revoke the current server session and clear the local browser credentials. */
  async function handleSignOut(): Promise<void> {
    await signOutMutation.mutateAsync();
  }

  const value: AuthContextValue = {
    identity: hasSession ? (identityQuery.data ?? null) : null,
    isCheckingSession: hasSession && identityQuery.isPending,
    isSigningIn: signInMutation.isPending,
    signInError: signInMutation.error instanceof Error ? signInMutation.error.message : null,
    signIn: handleSignIn,
    isSigningOut: signOutMutation.isPending,
    signOut: handleSignOut
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Return the Administration authentication state from the nearest provider. */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}

/** Check one effective permission returned by `/auth/me`. */
export function usePermission(permission: string): boolean {
  const { identity } = useAuth();
  if (!identity) return false;

  return identity.permissions.includes(permission);
}

/** Return whether one authenticated identity has any permission from a small workspace permission set. */
export function hasAnyIdentityPermission(identity: CurrentIdentity | null, requiredPermissions: readonly string[]): boolean {
  if (!identity) return false;

  return identity.permissions.some((permission) => requiredPermissions.includes(permission));
}

/** Return whether one authenticated identity has at least one explicit restricted Project membership. */
export function hasRestrictedProjectMembership(identity: CurrentIdentity | null): boolean {
  return identity?.projectScope.kind === 'restricted' && identity.projectScope.projectIds.length > 0;
}

/** Return whether a Project-scoped workspace can be useful through company permission or restricted Project membership. */
export function canUseProjectScopedWorkspace(identity: CurrentIdentity | null, requiredPermissions: readonly string[]): boolean {
  return hasAnyIdentityPermission(identity, requiredPermissions) || hasRestrictedProjectMembership(identity);
}

/** Show Document Management only when the authenticated identity has explicit Document or Audit permission. */
export function useDocumentWorkspaceVisibility(): boolean {
  const { identity } = useAuth();
  return hasAnyIdentityPermission(identity, ['documents.read', 'audit.read']);
}

/** Show the Project workspace when company permission or a restricted Project membership can lead to server-authorized reads. */
export function useProjectWorkspaceVisibility(): boolean {
  const { identity } = useAuth();
  return hasAnyIdentityPermission(identity, ['projects.read']) || hasRestrictedProjectMembership(identity);
}
