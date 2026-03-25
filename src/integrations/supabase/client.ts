/**
 * Supabase has been removed. This stub returns empty data so components
 * that still reference it do not crash. Migrate them to use api from @/lib/api.
 *
 * Auth stub: no real auth. For local dev, any sign-in is accepted and a fake
 * session is returned so the app is usable without Supabase.
 */
const empty = { data: [], error: null };
const emptyOne = { data: null, error: null };

/** Query builder chain that supports the methods we still call in legacy Supabase-based code.
 * It is intentionally minimal and always resolves to empty data.
 */
function chain(out: any) {
  const c: any = {
    // Filters / modifiers just return the same builder so calls can be chained
    eq: () => c,
    or: () => c,
    order: () => c,
    limit: () => c,
    in: () => c,
    select: () => c,
    update: () => c,
    delete: () => c,
    // Execution helpers – always resolve to empty results
    single: () => Promise.resolve(emptyOne),
    maybeSingle: () => Promise.resolve(emptyOne),
    insert: () => c,
    // Allow `await supabase.from(...).select(...).eq(...)` directly
    then: (onFulfilled?: (v: any) => any, onRejected?: (e: any) => any) =>
      Promise.resolve(out).then(onFulfilled, onRejected),
    catch: (onRejected?: (e: any) => any) => Promise.resolve(out).catch(onRejected),
  };
  return c;
}

/** Fake user/session for local dev when Supabase auth is disabled */
function createFakeSession(email: string) {
  return {
    user: {
      id: 'local-dev-user',
      email: email || 'local@dev',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    },
    access_token: '',
    refresh_token: '',
    expires_at: 0,
    expires_in: 0,
    token_type: 'bearer',
  };
}

let stubSession: ReturnType<typeof createFakeSession> | null = null;
const authListeners: Array<(event: string, session: unknown) => void> = [];

function notifyAuth(event: string, session: typeof stubSession) {
  authListeners.forEach((cb) => cb(event, session));
}

export const supabase = {
  // All table access goes through the query builder chain above
  from: (_table: string) => chain(empty),
  storage: {
    from: (_bucket: string) => ({
      upload: () => Promise.resolve({ data: null, error: null }),
      getPublicUrl: (path?: string) => ({ data: { publicUrl: path ? `/storage/${path}` : '' } }),
      remove: () => Promise.resolve(),
      list: () => Promise.resolve({ data: [], error: null }),
      download: () => Promise.resolve({ data: null, error: null }),
    }),
  },
  auth: {
    getSession: () =>
      Promise.resolve({ data: { session: stubSession }, error: null }),
    getUser: () =>
      Promise.resolve({
        data: { user: stubSession?.user ?? null },
        error: null,
      }),
    onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
      authListeners.push(callback);
      callback('INITIAL_SESSION', stubSession);
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              const i = authListeners.indexOf(callback);
              if (i !== -1) authListeners.splice(i, 1);
            },
          },
        },
      };
    },
    signInWithPassword: async ({ email }: { email: string }) => {
      stubSession = createFakeSession(email);
      notifyAuth('SIGNED_IN', stubSession);
      return { data: { user: stubSession!.user, session: stubSession }, error: null };
    },
    signUp: async ({
      email,
      options,
    }: {
      email: string;
      options?: { data?: { full_name?: string } };
    }) => {
      stubSession = createFakeSession(email);
      notifyAuth('SIGNED_IN', stubSession);
      return { data: { user: stubSession!.user, session: stubSession }, error: null };
    },
    signOut: async () => {
      stubSession = null;
      notifyAuth('SIGNED_OUT', null);
      return { error: null };
    },
  },
  /** Realtime stub: no-op channel so components don't crash */
  channel: (name: string) => {
    const ch = {
      on: (_event: string, _opts: unknown, _cb?: () => void) => ch,
      subscribe: () => ({}),
    };
    return ch;
  },
  removeChannel: (_ch: unknown) => {},
  rpc: () => Promise.resolve(empty),
};
