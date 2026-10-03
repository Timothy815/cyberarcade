// localStorage can throw (private mode, disabled storage, quota). Callers get null instead.
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function safeLocalStorage(): KeyValueStore | null {
  try {
    const ls = window.localStorage;
    const probe = '__cyberarcade_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}
