import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../../components/Card";
import { request } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

function OrganizerOngoingEventsPage() {
  const { token } = useAuth();
  const [events, setEvents] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    request("/organizer/ongoing-events", { token })
      .then((data) => setEvents(data.events || []))
      .catch((err) => setError(err.message));
  }, [token]);

  return (
    <div className="container">
      <h1>Ongoing Events</h1>
      {error && <p className="error">{error}</p>}
      <Card>
        <div className="list">
          {events.map((event) => (
            <article className="item" key={event._id}>
              <h4>{event.name}</h4>
              <p>
                {new Date(event.startDate).toLocaleString()} - {new Date(event.endDate).toLocaleString()}
              </p>
              <Link to={`/organizer/events/${event._id}`}>Manage Event</Link>
            </article>
          ))}
          {!events.length && <p>No ongoing events.</p>}
        </div>
      </Card>
    </div>
  );
}

export default OrganizerOngoingEventsPage;