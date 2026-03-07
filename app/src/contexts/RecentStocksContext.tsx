import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@fii_recent_stocks';
const MAX_RECENT = 10;

interface RecentStocksContextType {
  recentStocks: string[];
  addRecent: (ticker: string) => void;
}

const RecentStocksContext = createContext<RecentStocksContextType>({
  recentStocks: [],
  addRecent: () => {},
});

export const useRecentStocks = () => useContext(RecentStocksContext);

export const RecentStocksProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [recentStocks, setRecentStocks] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val) {
        try {
          setRecentStocks(JSON.parse(val));
        } catch {}
      }
    });
  }, []);

  const addRecent = useCallback((ticker: string) => {
    setRecentStocks((prev) => {
      const filtered = prev.filter((t) => t !== ticker);
      const next = [ticker, ...filtered].slice(0, MAX_RECENT);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return (
    <RecentStocksContext.Provider value={{ recentStocks, addRecent }}>
      {children}
    </RecentStocksContext.Provider>
  );
};
