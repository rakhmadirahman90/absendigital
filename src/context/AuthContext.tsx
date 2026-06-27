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
  const [user, setUser] = useState<any | null>(null);
  const [dbUser, setDbUser] = useState<any | null>(null);
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
      } else {
        localStorage.removeItem('auth_user_id');
        setCurrentUserId(null);
        setUser(null);
        setDbUser(null);
      }
      setLoading(false);
    }, (error) => {
      console.error("Error listening to user document", error);
      setUser(null);
      setDbUser(null);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUserId]);

  const login = (userData: any) => {
    localStorage.setItem('auth_user_id', userData.uid);
    setCurrentUserId(userData.uid);
  };

  const logout = () => {
    localStorage.removeItem('auth_user_id');
    setCurrentUserId(null);
  };

  return (
    <AuthContext.Provider value={{ user, dbUser, loading, login, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
