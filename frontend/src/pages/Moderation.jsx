import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowUpRight, FiFlag } from 'react-icons/fi';
import api from '../api/client';
import { EmptyState, ErrorState, Loading } from '../components/States';

export default function Moderation() {
  const [reports, setReports] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setError('');
    return api.get('/moderation/reports')
      .then(({ data }) => setReports(data.data.reports.filter((report) => report.listingId)))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const resolve = async (id, status) => {
    try {
      await api.patch(`/moderation/reports/${id}/status`, { status });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  if (loading) return <Loading />;

  return (
    <main className="page-wrap account-page moderation-page">
      <header className="account-page-heading">
        <div>
          <span className="kicker">Keep the circle welcoming</span>
          <h1>Community <em>reports</em></h1>
          <p>Review flagged listings and resolve reports thoughtfully.</p>
        </div>
        <span className="moderation-header-mark"><FiFlag aria-hidden="true" /> Moderator workspace</span>
      </header>

      {error && <ErrorState message={error} onRetry={load} />}
      {!reports.length && !error ? (
        <EmptyState title="All caught up" text="There are no reports waiting for review." />
      ) : (
        <section className="report-list moderation-report-list" aria-label="Community reports">
          {reports.map((report) => (
            <article className="report-card moderation-report-card" key={report._id}>
              <div className="report-meta moderation-report-meta">
                <span className={`badge badge-${report.status}`}>{report.status}</span>
                <span>Reported by {report.reporterId?.name || 'member'} · {new Date(report.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="moderation-listing-heading">
                <div>
                  <span className="kicker">Reported listing</span>
                  <h2>{report.listingId.title}</h2>
                </div>
                <Link
                  className="moderation-view-link"
                  to={`/listings/${report.listingId._id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View listing <FiArrowUpRight aria-hidden="true" />
                </Link>
              </div>
              <div className="moderation-reason">
                <strong>Report reason</strong>
                <p>{report.reason}</p>
              </div>
              {report.status === 'pending' && (
                <div className="moderation-actions">
                  <button className="button moderation-dismiss-button" type="button" onClick={() => resolve(report._id, 'dismissed')}>
                    Dismiss report
                  </button>
                  <button className="button" type="button" onClick={() => resolve(report._id, 'reviewed')}>
                    Mark reviewed
                  </button>
                </div>
              )}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
