import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../../components/Card";
import { request } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

function OrganizerDashboardPage() {
  const { token } = useAuth();
  const [data, setData] = useState({ eventsCarousel: [], analytics: {} });
  const [error, setError] = useState("");

  useEffect(() => {
    request("/organizer/dashboard", { token })
      .then(setData)
      .catch((err) => setError(err.message));
  }, [token]);

  return (
    <div className="container">
      <h1>Organizer Dashboard</h1>
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
    </div>
  );
}

export default OrganizerDashboardPage;