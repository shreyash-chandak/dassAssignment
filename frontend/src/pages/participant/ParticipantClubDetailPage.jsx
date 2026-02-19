import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { request } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import Card from "../../components/Card";

function ParticipantClubDetailPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    request(`/clubs/${id}`, { token })
      .then(setData)
      .catch((err) => setError(err.message));
  }, [id, token]);

  if (!data) {
    return <div className="container">Loading organizer details...</div>;
  }

  return (
    <div className="container">
      <h1>Organizer Details</h1>
      {error && <p className="error">{error}</p>}

      <Card title={data.organizer.organizerName}>
        <p>Category: {data.organizer.category}</p>
        <p>{data.organizer.description}</p>
        <p>Contact: {data.organizer.contactEmail}</p>
      </Card>

      <Card title="Upcoming Events">
        <div className="list">
          {data.upcoming.map((event) => (
            <article className="item" key={event._id}>
              <h4>{event.name}</h4>
              <p>
                {new Date(event.startDate).toLocaleString()} - {new Date(event.endDate).toLocaleString()}
              </p>
              <Link to={`/participant/events/${event._id}`}>Open Event</Link>
            </article>
          ))}
          {!data.upcoming.length && <p>No upcoming events.</p>}
        </div>
      </Card>

      <Card title="Past Events">
        <div className="list">
          {data.past.map((event) => (
            <article className="item" key={event._id}>
              <h4>{event.name}</h4>
              <p>{event.eventType}</p>
            </article>
          ))}
          {!data.past.length && <p>No past events.</p>}
        </div>
      </Card>
    </div>
  );
}

export default ParticipantClubDetailPage;