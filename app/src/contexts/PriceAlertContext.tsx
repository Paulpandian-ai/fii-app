import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@fii_price_alerts';

export interface PriceAlert {
  id: string;
  ticker: string;
  companyName: string;
  targetPrice: number;
  direction: 'above' | 'below';
  createdAt: string;
  triggered: boolean;
}

interface PriceAlertContextType {
  alerts: PriceAlert[];
  addAlert: (ticker: string, companyName: string, targetPrice: number, direction: 'above' | 'below') => void;
  removeAlert: (id: string) => void;
  checkAlerts: (prices: Record<string, number>) => PriceAlert[];
  getAlertsForTicker: (ticker: string) => PriceAlert[];
}

const PriceAlertContext = createContext<PriceAlertContextType>({
  alerts: [],
  addAlert: () => {},
  removeAlert: () => {},
  checkAlerts: () => [],
  getAlertsForTicker: () => [],
});

export const usePriceAlerts = () => useContext(PriceAlertContext);

export const PriceAlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val) {
        try {
          setAlerts(JSON.parse(val));
        } catch {}
      }
    });
  }, []);

  const persist = useCallback((next: PriceAlert[]) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const addAlert = useCallback(
    (ticker: string, companyName: string, targetPrice: number, direction: 'above' | 'below') => {
      setAlerts((prev) => {
        const newAlert: PriceAlert = {
          id: `${ticker}_${direction}_${targetPrice}_${Date.now()}`,
          ticker,
          companyName,
          targetPrice,
          direction,
          createdAt: new Date().toISOString(),
          triggered: false,
        };
        const next = [newAlert, ...prev];
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const removeAlert = useCallback(
    (id: string) => {
      setAlerts((prev) => {
        const next = prev.filter((a) => a.id !== id);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const checkAlerts = useCallback(
    (prices: Record<string, number>): PriceAlert[] => {
      const triggered: PriceAlert[] = [];
      setAlerts((prev) => {
        let changed = false;
        const next = prev.map((alert) => {
          if (alert.triggered) return alert;
          const currentPrice = prices[alert.ticker];
          if (currentPrice == null) return alert;
          const shouldTrigger =
            (alert.direction === 'above' && currentPrice >= alert.targetPrice) ||
            (alert.direction === 'below' && currentPrice <= alert.targetPrice);
          if (shouldTrigger) {
            changed = true;
            const updated = { ...alert, triggered: true };
            triggered.push(updated);
            return updated;
          }
          return alert;
        });
        if (changed) {
          persist(next);
          return next;
        }
        return prev;
      });
      return triggered;
    },
    [persist],
  );

  const getAlertsForTicker = useCallback(
    (ticker: string) => alerts.filter((a) => a.ticker === ticker),
    [alerts],
  );

  return (
    <PriceAlertContext.Provider value={{ alerts, addAlert, removeAlert, checkAlerts, getAlertsForTicker }}>
      {children}
    </PriceAlertContext.Provider>
  );
};
