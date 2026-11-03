import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/client';
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); const [loading, setLoading] = useState(true);
  const [wishlistIds, setWishlistIds] = useState(new Set());
  const [wishlistLoading, setWishlistLoading] = useState(false);
  const [wishlistOwnerId, setWishlistOwnerId] = useState(null);
  const loadWishlist = async (ownerId = user?.id) => {
    setWishlistLoading(true);
    try {
      const { data } = await api.get('/me/wishlist');
      if (String(ownerId) === String(user?.id)) {
        setWishlistIds(new Set(data.data.listings.map((listing) => String(listing._id))));
        setWishlistOwnerId(String(ownerId));
      }
    } finally { if (String(ownerId) === String(user?.id)) setWishlistLoading(false); }
  };
  useEffect(() => { api.get('/auth/me').then((r) => setUser(r.data.data.user)).catch(() => setUser(null)).finally(() => setLoading(false)); }, []);
  useEffect(() => {
    let active = true;
    if (!user) { setWishlistIds(new Set()); setWishlistOwnerId(null); return () => { active = false; }; }
    setWishlistLoading(true);
    const ownerId = String(user.id);
    setWishlistOwnerId(ownerId);
    api.get('/me/wishlist').then(({ data }) => {
      if (active && String(user.id) === ownerId) setWishlistIds(new Set(data.data.listings.map((listing) => String(listing._id))));
    }).catch(() => { if (active) setWishlistIds(new Set()); }).finally(() => { if (active) setWishlistLoading(false); });
    return () => { active = false; };
  }, [user?.id]);
  const refresh = async () => { try { const { data } = await api.get('/auth/me'); setUser(data.data.user); return data.data.user; } catch { setUser(null); return null; } };
  const toggleWishlist = async (listingId) => {
    const id = String(listingId);
    if (!user || wishlistOwnerId !== String(user.id)) throw new Error('Your account wishlist is still loading. Please try again.');
    const next = !wishlistIds.has(id);
    if (next) await api.post(`/listings/${id}/wishlist`); else await api.delete(`/listings/${id}/wishlist`);
    setWishlistIds((current) => { const updated = new Set(current); if (next) updated.add(id); else updated.delete(id); return updated; });
    return next;
  };
  const logout = async () => { await api.post('/auth/logout'); setUser(null); setWishlistIds(new Set()); setWishlistOwnerId(null); };
  return <AuthContext.Provider value={{ user, setUser, loading, refresh, logout, wishlistIds, wishlistLoading, loadWishlist, toggleWishlist }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
