import { useEffect, useState } from "react";
import Card from "../../components/Card";
import { request } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

function AdminDashboardPage() {
  const { token } = useAuth();
  const [stats, setStats] = useState({
    organizers: 0,
    activeEvents: 0,
    pendingResetRequests: 0,
  });
  const [error, setError] = useState("");

  useEffect(() => {
    request("/admin/dashboard", { token })
      .then(setStats)
      .catch((err) => setError(err.message));
  }, [token]);

  return (
    <div className="container">
      <h1>Admin Dashboard</h1>
      {error && <p className="error">{error}</p>}
      <Card>
        <div className="stats-grid">
          <article className="stat">
            <h4>Organizers</h4>
            <p>{stats.organizers}</p>
          </article>
          <article className="stat">
            <h4>Active Events</h4>
            <p>{stats.activeEvents}</p>
          </article>
          <article className="stat">
            <h4>Pending Reset Requests</h4>
            <p>{stats.pendingResetRequests}</p>
          </article>
        </div>
      </Card>
    </div>
  );
}

export default AdminDashboardPage;
