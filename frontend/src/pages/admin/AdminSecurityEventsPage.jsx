import { useEffect, useMemo, useState } from "react";
import Card from "../../components/Card";
import { request } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

function AdminSecurityEventsPage() {
  const { token } = useAuth();
  const [events, setEvents] = useState([]);
  const [blockedIps, setBlockedIps] = useState([]);
  const [filters, setFilters] = useState({ type: "", ip: "", email: "" });
  const [error, setError] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.type) params.append("type", filters.type);
    if (filters.ip) params.append("ip", filters.ip);
    if (filters.email) params.append("email", filters.email);
    return params.toString();
  }, [filters]);

  const load = () => {
    request(`/admin/security-events${query ? `?${query}` : ""}`, { token })
      .then((data) => {
        setEvents(data.events || []);
        setBlockedIps(data.blockedIps || []);
      })
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, query]);

  return (
    <div className="container">
      <h1>Security Events</h1>
      {error && <p className="error">{error}</p>}

      <Card title="Active IP Blocks">
        <div className="list">
          {blockedIps.map((entry) => (
            <article className="item" key={`${entry.ip}-${entry.blockedUntil}`}>
              <p>IP: {entry.ip}</p>
              <p>Attempts: {entry.attempts}</p>
              <p>Blocked Until: {new Date(entry.blockedUntil).toLocaleString()}</p>
            </article>
          ))}
          {!blockedIps.length && <p>No active IP blocks.</p>}
        </div>
      </Card>

      <Card title="Filters">
        <div className="grid three">
          <label>
            Type
            <select value={filters.type} onChange={(e) => setFilters((p) => ({ ...p, type: e.target.value }))}>
              <option value="">All</option>
              <option value="captcha_failed">captcha_failed</option>
              <option value="auth_failed">auth_failed</option>
              <option value="ip_blocked">ip_blocked</option>
              <option value="auth_success">auth_success</option>
            </select>
          </label>
          <label>
            IP
            <input value={filters.ip} onChange={(e) => setFilters((p) => ({ ...p, ip: e.target.value }))} />
          </label>
          <label>
            Email
            <input value={filters.email} onChange={(e) => setFilters((p) => ({ ...p, email: e.target.value }))} />
          </label>
        </div>
      </Card>

      <Card title="Event Log">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>IP</th>
                <th>Email</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event._id}>
                  <td>{new Date(event.createdAt).toLocaleString()}</td>
                  <td>{event.type}</td>
                  <td>{event.ip}</td>
                  <td>{event.email || "-"}</td>
                  <td>{event.reason || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!events.length && <p>No events found for current filters.</p>}
        </div>
      </Card>
    </div>
  );
}

export default AdminSecurityEventsPage;
