import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import {getNumber, getString, setValues, clearSession} from './storage';

type SessionContextValue = {
  booting: boolean;
  token: string;
  isLoggedIn: boolean;
  signInLocal: (token: string, tokenExpireTime: number) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({children}: {children: React.ReactNode}) {
  const [booting, setBooting] = useState(true);
  const [token, setToken] = useState('');
  const [tokenExpireTime, setTokenExpireTime] = useState(0);

  useEffect(() => {
    Promise.all([getString('token'), getNumber('tokenExpireTime')])
      .then(([storedToken, storedExpiry]) => {
        setToken(storedToken);
        setTokenExpireTime(storedExpiry);
      })
      .finally(() => setBooting(false));
  }, []);

  const signInLocal = useCallback(async (nextToken: string, nextExpiry: number) => {
    await setValues({token: nextToken, tokenExpireTime: nextExpiry});
    setToken(nextToken);
    setTokenExpireTime(nextExpiry);
  }, []);

  const signOut = useCallback(async () => {
    await clearSession();
    setToken('');
    setTokenExpireTime(0);
  }, []);

  const value = useMemo(
    () => ({
      booting,
      token,
      isLoggedIn: Boolean(token) && tokenExpireTime > Date.now(),
      signInLocal,
      signOut
    }),
    [booting, token, tokenExpireTime, signInLocal, signOut]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession must be used within SessionProvider');
  }
  return value;
}
