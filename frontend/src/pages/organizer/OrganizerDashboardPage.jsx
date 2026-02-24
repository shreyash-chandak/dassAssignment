import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../../components/Card";
import { request } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

function OrganizerDashboardPage() {
  const { token } = useAuth();
  const [data, setData] = useState({ eventsCarousel: [], analytics: {}, resetRequests: [] });
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = () => {
    request("/organizer/dashboard", { token })
      .then(setData)
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const submitResetRequest = async () => {
    setError("");
    setMessage("");
    try {
      const response = await request("/organizer/password-reset-requests", {
        method: "POST",
        token,
        data: { reason },
      });
      setMessage(response.message || "Request submitted");
      setReason("");
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="container">
      <h1>Organizer Dashboard</h1>
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}

      <Card title="Events Carousel">
        <div className="list horizontal">
          {data.eventsCarousel.map((event) => (
            <article key={event.id} className="item">
              <h4>{event.name}</h4>
              <p>
                {event.type} | {event.status}
              </p>
              <Link to={`/organizer/events/${event.id}`}>Manage</Link>
            </article>
          ))}
          {!data.eventsCarousel.length && <p>No events created yet.</p>}
        </div>
      </Card>

      <Card title="Completed Event Analytics">
        <div className="stats-grid">
          <article className="stat">
            <h4>Registrations</h4>
            <p>{data.analytics.registrations || 0}</p>
          </article>
          <article className="stat">
            <h4>Sales</h4>
            <p>{data.analytics.sales || 0}</p>
          </article>
          <article className="stat">
            <h4>Revenue</h4>
            <p>{data.analytics.revenue || 0}</p>
          </article>
          <article className="stat">
            <h4>Attendance</h4>
            <p>{data.analytics.attendance || 0}</p>
          </article>
        </div>
      </Card>

      <Card title="Password Reset Request">
        <label>
          Reason
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <button type="button" className="btn" onClick={submitResetRequest}>
          Submit Password Reset Request
        </button>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Admin Comment</th>
              </tr>
            </thead>
            <tbody>
              {(data.resetRequests || []).map((row) => (
                <tr key={row._id}>
                  <td>{new Date(row.createdAt).toLocaleString()}</td>
                  <td>{row.reason}</td>
                  <td>{row.status}</td>
                  <td>{row.adminComment || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.resetRequests?.length && <p>No reset requests yet.</p>}
        </div>
      </Card>
    </div>
  );
}

export default OrganizerDashboardPage;
