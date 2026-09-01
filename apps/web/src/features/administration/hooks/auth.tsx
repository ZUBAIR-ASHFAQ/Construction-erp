import {
  createContext,
  type ReactNode,
  useContext,
  useState
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  clearSessionTokens,
  getCurrentIdentity,
  readAccessToken,
  saveSessionTokens,
  signIn as signInRequest,
  signOut as signOutRequest,
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

/** Provide the current Administration session and auth actions to the React tree. */
export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const queryClient = useQueryClient();
  const [hasSession, setHasSession] = useState(() => readAccessToken() !== null);

  const identityQuery = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: getCurrentIdentity,
    enabled: hasSession,
    retry: false
  });

  const signInMutation = useMutation({
    mutationFn: signInRequest,
    onSuccess(result) {
      saveSessionTokens(result.accessToken, result.refreshToken);
      setHasSession(true);
      queryClient.setQueryData<CurrentIdentity>(AUTH_QUERY_KEY, {
        user: result.user,
        permissions: result.permissions,
        projectScope: result.projectScope
      });
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

  /** Sign in and let the mutation save the returned server credentials. */
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
  return identity?.permissions.includes(permission) ?? false;
}

/** Return whether one authenticated identity has any permission from a small workspace permission set. */
export function hasAnyIdentityPermission(identity: CurrentIdentity | null, requiredPermissions: readonly string[]): boolean {
  return identity?.permissions.some((permission) => requiredPermissions.includes(permission)) ?? false;
}

/** Return whether one authenticated identity has at least one explicit restricted Project membership. */
export function hasRestrictedProjectMembership(identity: CurrentIdentity | null): boolean {
  return identity?.projectScope.kind === 'restricted' && identity.projectScope.projectIds.length > 0;
}

/** Return whether a Project-scoped workspace can be useful through company permission or restricted Project membership. */
export function canUseProjectScopedWorkspace(identity: CurrentIdentity | null, requiredPermissions: readonly string[]): boolean {
  return hasAnyIdentityPermission(identity, requiredPermissions) || hasRestrictedProjectMembership(identity);
}

/** Show Document Management when company access or a restricted Project scope can lead to server-authorized rows. */
export function useDocumentWorkspaceVisibility(): boolean {
  const { identity } = useAuth();
  return hasAnyIdentityPermission(identity, ['documents.read', 'audit.read']) || hasRestrictedProjectMembership(identity);
}

/** Show the Project workspace when company permission or a restricted Project membership can lead to server-authorized reads. */
export function useProjectWorkspaceVisibility(): boolean {
  const { identity } = useAuth();
  return hasAnyIdentityPermission(identity, ['projects.read']) || hasRestrictedProjectMembership(identity);
}
