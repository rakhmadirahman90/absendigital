import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
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
  const [user, setUser] = useState<any | null>(null);
  const [dbUser, setDbUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      const storedUserId = localStorage.getItem('auth_user_id');
      if (storedUserId) {
        try {
          const docRef = doc(db, "users", storedUserId);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
             const data = docSnap.data();
             const userData = { uid: storedUserId, ...data };
             setUser(userData);
             setDbUser(data);
          } else {
             localStorage.removeItem('auth_user_id');
             setUser(null);
             setDbUser(null);
          }
        } catch (error) {
           console.error("Error fetching db user", error);
           setUser(null);
           setDbUser(null);
        }
      } else {
        setUser(null);
        setDbUser(null);
      }
      setLoading(false);
    };

    fetchUser();
  }, []);

  const login = (userData: any) => {
    localStorage.setItem('auth_user_id', userData.uid);
    setUser(userData);
    setDbUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('auth_user_id');
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
