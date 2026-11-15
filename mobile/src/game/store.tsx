import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createLocalRoom, type LocalRoom, type RoomSnapshot } from './engine';

const ME = 'me';

interface GameCtx {
  snap: RoomSnapshot | null;
  error: string | null;
  /** Kompyuter o'yinchilari bilan yangi stol (3 ta bot) */
  startWithBots: () => void;
  send: (msg: Record<string, unknown>) => boolean;
  leave: () => void;
  clearError: () => void;
}

const Ctx = createContext<GameCtx | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const roomRef = useRef<LocalRoom | null>(null);
  const [snap, setSnap] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const leave = useCallback(() => {
    if (pending.current) clearTimeout(pending.current);
    pending.current = null;
    roomRef.current?.destroy();
    roomRef.current = null;
    setSnap(null);
  }, []);

  const startWithBots = useCallback(() => {
    leave();
    let room: LocalRoom | null = null;
    // Bir qadamda bir nechta o'zgarish bo'lishi mumkin — bitta render bilan yangilaymiz
    const onChange = () => {
      if (pending.current) return;
      pending.current = setTimeout(() => {
        pending.current = null;
        if (room && roomRef.current === room) setSnap(room.snapshot(ME));
      }, 0);
    };
    room = createLocalRoom(onChange);
    roomRef.current = room;
    room.connect({ id: ME, name: 'Siz' });
    room.dispatch(ME, { t: 'fillBots' });
    setSnap(room.snapshot(ME));
  }, [leave]);

  const send = useCallback((msg: Record<string, unknown>) => {
    const room = roomRef.current;
    if (!room) return false;
    const err = room.dispatch(ME, msg);
    if (err) setError(err);
    return !err;
  }, []);

  useEffect(() => () => roomRef.current?.destroy(), []);

  const value = useMemo(
    () => ({ snap, error, startWithBots, send, leave, clearError: () => setError(null) }),
    [snap, error, startWithBots, send, leave],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGame() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useGame GameProvider ichida ishlatilishi kerak');
  return v;
}
