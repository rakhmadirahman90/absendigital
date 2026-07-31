import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

type AuthContextType = {
  user: any | null;
  dbUser: any | null;
  loading: boolean;
  login: (userData: any) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  dbUser: null, 
  loading: true,
  login: () => {},
  logout: () => {}
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => localStorage.getItem('auth_user_id'));
  const [user, setUser] = useState<any | null>(() => {
    const cached = localStorage.getItem('auth_user_data');
    return cached ? JSON.parse(cached) : null;
  });
  const [dbUser, setDbUser] = useState<any | null>(() => {
    const cached = localStorage.getItem('auth_db_user_data');
    return cached ? JSON.parse(cached) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUserId) {
      setUser(null);
      setDbUser(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const docRef = doc(db, "users", currentUserId);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const userData = { uid: currentUserId, ...data };
        setUser(userData);
        setDbUser(data);
        localStorage.setItem('auth_user_data', JSON.stringify(userData));
        localStorage.setItem('auth_db_user_data', JSON.stringify(data));
      } else {
        localStorage.removeItem('auth_user_id');
        localStorage.removeItem('auth_user_data');
        localStorage.removeItem('auth_db_user_data');
        setCurrentUserId(null);
        setUser(null);
        setDbUser(null);
      }
      setLoading(false);
    }, (error) => {
      // Gracefully handle Firestore quota limit or fetch errors using cached user session
      const isQuota = error?.message?.includes('Quota') || (error as any)?.code === 'resource-exhausted';
      if (!isQuota) {
        console.warn("[AuthContext] Profile sync notice:", error?.message || error);
      }
      const cachedUserData = localStorage.getItem('auth_user_data');
      const cachedDbUserData = localStorage.getItem('auth_db_user_data');
      if (cachedUserData && cachedDbUserData) {
        try {
          setUser(JSON.parse(cachedUserData));
          setDbUser(JSON.parse(cachedDbUserData));
        } catch (e) {
          // ignore parsing error
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUserId]);

  const login = (userData: any) => {
    localStorage.setItem('auth_user_id', userData.uid);
    localStorage.setItem('auth_user_data', JSON.stringify(userData));
    localStorage.setItem('auth_db_user_data', JSON.stringify(userData));
    setUser(userData);
    setDbUser(userData);
    setCurrentUserId(userData.uid);
  };

  const logout = () => {
    localStorage.removeItem('auth_user_id');
    localStorage.removeItem('auth_user_data');
    localStorage.removeItem('auth_db_user_data');
    setCurrentUserId(null);
    setUser(null);
    setDbUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, dbUser, loading, login, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
