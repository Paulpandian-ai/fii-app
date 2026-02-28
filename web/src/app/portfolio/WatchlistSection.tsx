'use client';

import { useState } from 'react';
import { formatCurrency, formatPercent, cn } from '@/lib/utils';
import type { Watchlist } from '@/types';

interface WatchlistSectionProps {
  watchlists: Watchlist[];
  activeWatchlistId: string;
  setActiveWatchlist: (id: string) => void;
  createWatchlist: (name: string) => Promise<void>;
  removeWatchlist: (id: string) => Promise<void>;
}

export function WatchlistSection({
  watchlists,
  activeWatchlistId,
  setActiveWatchlist,
  createWatchlist,
  removeWatchlist,
}: WatchlistSectionProps) {
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    await createWatchlist(newName.trim());
    setNewName('');
    setShowCreateInput(false);
    setCreating(false);
  };

  const handleDelete = async (id: string) => {
    await removeWatchlist(id);
    setConfirmDeleteId(null);
  };

  const activeItems = watchlists.find((w) => w.id === activeWatchlistId)?.items || [];

  return (
    <div className="bg-fii-card rounded-xl border border-fii-border overflow-hidden">
      <div className="px-4 py-3 border-b border-fii-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Watchlists</h3>
        <div className="flex items-center gap-2">
          {activeWatchlistId && watchlists.length > 0 && (
            <button
              onClick={() =>
                setConfirmDeleteId(confirmDeleteId === activeWatchlistId ? null : activeWatchlistId)
              }
              className="text-fii-muted hover:text-red-400 transition-colors"
              title="Delete watchlist"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          <button
            onClick={() => setShowCreateInput(!showCreateInput)}
            className="text-fii-accent hover:text-fii-accent-hover transition-colors"
            title="Create watchlist"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Confirm delete */}
      {confirmDeleteId && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 flex items-center justify-between">
          <span className="text-xs text-red-400">Delete this watchlist?</span>
          <div className="flex gap-2">
            <button
              onClick={() => handleDelete(confirmDeleteId)}
              className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
            >
              Delete
            </button>
            <button
              onClick={() => setConfirmDeleteId(null)}
              className="px-2 py-1 text-xs bg-fii-card text-fii-text-secondary rounded hover:bg-fii-card-hover transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Create input */}
      {showCreateInput && (
        <div className="px-4 py-2 border-b border-fii-border flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Watchlist name..."
            className="flex-1 px-3 py-1.5 bg-fii-bg border border-fii-border rounded text-xs text-white placeholder-fii-muted focus:outline-none focus:ring-1 focus:ring-fii-accent/50"
            autoFocus
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || creating}
            className="px-3 py-1.5 text-xs bg-fii-accent text-white rounded hover:bg-fii-accent-hover transition-colors disabled:opacity-50"
          >
            {creating ? '...' : 'Create'}
          </button>
        </div>
      )}

      {watchlists.length > 0 ? (
        <>
          <div className="flex gap-1 p-2 border-b border-fii-border overflow-x-auto">
            {watchlists.map((wl) => (
              <button
                key={wl.id}
                onClick={() => setActiveWatchlist(wl.id)}
                className={cn(
                  'px-3 py-1 text-xs rounded-full transition-colors flex-shrink-0',
                  activeWatchlistId === wl.id
                    ? 'bg-fii-accent/20 text-fii-accent'
                    : 'bg-fii-bg text-fii-text-secondary hover:bg-fii-card-hover',
                )}
              >
                {wl.name}
              </button>
            ))}
          </div>
          <div>
            {activeItems.map((item) => (
              <div
                key={item.ticker}
                className="flex items-center justify-between px-4 py-2.5 border-b border-fii-border last:border-0"
              >
                <div>
                  <span className="font-semibold text-white text-sm">{item.ticker}</span>
                  <span className="text-xs text-fii-text-secondary ml-2">{item.companyName}</span>
                </div>
                <div className="flex items-center gap-3">
                  {item.price && (
                    <span className="text-sm text-white">{formatCurrency(item.price)}</span>
                  )}
                  {item.changePercent != null && (
                    <span
                      className={cn(
                        'text-xs',
                        item.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400',
                      )}
                    >
                      {formatPercent(item.changePercent)}
                    </span>
                  )}
                  {item.score && (
                    <span className="text-xs text-fii-accent">{item.score.toFixed(1)}</span>
                  )}
                </div>
              </div>
            ))}
            {activeItems.length === 0 && (
              <div className="py-8 text-center text-fii-muted text-xs">Empty watchlist</div>
            )}
          </div>
        </>
      ) : (
        <div className="py-8 text-center">
          <p className="text-fii-muted text-xs mb-3">No watchlists yet</p>
          {!showCreateInput && (
            <button
              onClick={() => setShowCreateInput(true)}
              className="px-4 py-1.5 text-xs bg-fii-accent/20 text-fii-accent rounded-lg hover:bg-fii-accent/30 transition-colors"
            >
              Create your first watchlist
            </button>
          )}
        </div>
      )}
    </div>
  );
}
