import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiArrowUpRight, FiHeart, FiMapPin } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';

const statusLabel = (status) => status === 'reserved' ? 'Sold' : status;

export default function ListingCard({ listing }) {
  const [imageFailed, setImageFailed] = useState(false);
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const [toast, setToast] = useState('');
  const { user, wishlistIds, toggleWishlist: updateWishlist } = useAuth();
  const navigate = useNavigate();
  const label = statusLabel(listing.status);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const toggleWishlist = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!user) return navigate(`/login?returnTo=${encodeURIComponent(`/listings/${listing._id}`)}`);
    setWishlistBusy(true);
    try {
      const next = await updateWishlist(listing._id);
      setToast(next ? 'Added to wishlist' : 'Removed from wishlist');
    } catch (error) {
      setToast(error.message);
    } finally {
      setWishlistBusy(false);
    }
  };

  return <article className="listing-card reveal-card">
    <div className="card-image">
      <Link to={`/listings/${listing._id}`} className="card-image-link" aria-label={`View ${listing.title}`}>
      {listing.imageUrl && !imageFailed ? <img src={listing.imageUrl} alt={listing.title} loading="lazy" onError={() => setImageFailed(true)} /> : <div className="image-placeholder"><span>♻</span><small>Ready for a new home</small></div>}
      <span className={`badge badge-${label.toLowerCase()}`}>{label}</span>
      </Link>
      <button className={`wishlist-button${wishlistIds?.has(String(listing._id)) ? ' is-wishlisted' : ''}`} type="button" aria-label={wishlistIds?.has(String(listing._id)) ? `Remove ${listing.title} from wishlist` : `Add ${listing.title} to wishlist`} aria-pressed={wishlistIds?.has(String(listing._id))} disabled={wishlistBusy} onClick={toggleWishlist}><FiHeart fill={wishlistIds?.has(String(listing._id)) ? 'currentColor' : 'none'} /></button>
    </div>
    <div className="card-body"><div className="eyebrow">{listing.category}<span>·</span>{listing.condition}</div><h3><Link to={`/listings/${listing._id}`}>{listing.title}</Link></h3><p className="location"><FiMapPin />{listing.pickupArea}</p><div className="card-actions"><Link className="card-link" to={`/listings/${listing._id}`}>View details <FiArrowUpRight /></Link></div></div>
    {toast && <div className="card-toast" role="status">{toast}</div>}
  </article>;
}
