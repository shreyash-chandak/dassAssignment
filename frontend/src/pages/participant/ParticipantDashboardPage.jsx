import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../../components/Card";
import { useAuth } from "../../context/AuthContext";
import { request } from "../../api/client";

function ParticipantDashboardPage() {
  const { token } = useAuth();
  const [data, setData] = useState({ upcomingEvents: [], participationHistory: {} });
  const [calendarBatch, setCalendarBatch] = useState([]);
  const [activeTab, setActiveTab] = useState("normal");
  const [error, setError] = useState("");

  useEffect(() => {
    request("/participants/dashboard", { token })
      .then(setData)
      .catch((err) => setError(err.message));

    request("/calendar/batch", { token })
      .then((payload) => setCalendarBatch(payload.events || []))
      .catch(() => setCalendarBatch([]));
  }, [token]);

  const tabs = useMemo(
    () => [
      ["normal", "Normal"],
      ["merchandise", "Merchandise"],
      ["completed", "Completed"],
      ["cancelledOrRejected", "Cancelled/Rejected"],
    ],
    []
  );

  const activeHistory = data.participationHistory?.[activeTab] || [];

  return (
    <div className="container">
      <h1>Participant Dashboard</h1>
      {error && <p className="error">{error}</p>}

      <Card title="Upcoming Events">
        {data.upcomingEvents?.length ? (
          <div className="list">
            {data.upcomingEvents.map((event) => (
              <article className="item" key={event.registrationId}>
                <div>
                  <h4>{event.name}</h4>
                  <p>
                    {event.type} | {event.organizer}
                  </p>
                  <p>
                    {new Date(event.schedule.startDate).toLocaleString()} - {new Date(event.schedule.endDate).toLocaleString()}
                  </p>
                  <p>
                    Ticket:{" "}
                    {event.ticketId ? <Link to={`/tickets/${event.ticketId}`}>{event.ticketId}</Link> : "Pending"}
                  </p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p>No upcoming registrations yet.</p>
        )}
      </Card>

      <Card title="Participation History">
        <div className="tabs">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={activeTab === key ? "btn" : "btn btn-light"}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="list">
          {activeHistory.length ? (
            activeHistory.map((entry) => (
              <article className="item" key={entry._id}>
                <h4>{entry.event?.name || "Event"}</h4>
                <p>
                  Type: {entry.eventType} | Organizer: {entry.event?.organizer?.organizerName || "N/A"} | Status: {entry.status}
                </p>
                <p>Team: {entry.teamName || "N/A"}</p>
                <p>
                  Ticket: {entry.ticketId ? <Link to={`/tickets/${entry.ticketId}`}>{entry.ticketId}</Link> : "Pending"}
                </p>
              </article>
            ))
          ) : (
            <p>No records in this category.</p>
          )}
        </div>
      </Card>

      <Card title="Batch Calendar Export">
        <div className="list">
          {calendarBatch.length ? (
            calendarBatch.map((entry) => (
              <article className="item" key={entry.eventId}>
                <h4>{entry.eventName}</h4>
                <div className="row">
                  <a className="btn btn-light" href={entry.googleCalendarLink} target="_blank" rel="noreferrer">
                    Google
                  </a>
                  <a className="btn btn-light" href={entry.outlookCalendarLink} target="_blank" rel="noreferrer">
                    Outlook
                  </a>
                  <a
                    className="btn btn-light"
                    href={`data:text/calendar;charset=utf-8,${encodeURIComponent(entry.ics || "")}`}
                    download={`${String(entry.eventName || "event").replace(/[^a-zA-Z0-9]/g, "-")}.ics`}
                  >
                    Download .ics
                  </a>
                </div>
              </article>
            ))
          ) : (
            <p>No registered events available for batch export yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

export default ParticipantDashboardPage;
