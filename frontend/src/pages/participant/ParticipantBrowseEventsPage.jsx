import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../../components/Card";
import { useAuth } from "../../context/AuthContext";
import { request } from "../../api/client";

const initialFilters = {
  search: "",
  eventType: "",
  eligibility: "",
  dateFrom: "",
  dateTo: "",
  followedOnly: false,
};

function ParticipantBrowseEventsPage() {
  const { token } = useAuth();
  const [filters, setFilters] = useState(initialFilters);
  const [events, setEvents] = useState([]);
  const [trending, setTrending] = useState([]);
  const [error, setError] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value === "" || value === false) {
        return;
      }
      params.append(key, value);
    });
    return params.toString();
  }, [filters]);

  useEffect(() => {
    request(`/events${query ? `?${query}` : ""}`, { token })
      .then((data) => setEvents(data.events || []))
      .catch((err) => setError(err.message));
  }, [token, query]);

  useEffect(() => {
    request("/events/trending")
      .then((data) => setTrending(data.trending || []))
      .catch(() => {});
  }, []);

  const updateFilter = (name, value) => setFilters((prev) => ({ ...prev, [name]: value }));

  return (
    <div className="container">
      <h1>Browse Events</h1>
      {error && <p className="error">{error}</p>}

      <Card title="Search & Filters">
        <div className="grid two">
          <label>
            Search (event / organizer)
            <input value={filters.search} onChange={(e) => updateFilter("search", e.target.value)} />
          </label>
          <label>
            Event Type
            <select value={filters.eventType} onChange={(e) => updateFilter("eventType", e.target.value)}>
              <option value="">All</option>
              <option value="normal">Normal</option>
              <option value="merchandise">Merchandise</option>
            </select>
          </label>
          <label>
            Eligibility
            <input value={filters.eligibility} onChange={(e) => updateFilter("eligibility", e.target.value)} />
          </label>
          <label>
            Date From
            <input type="date" value={filters.dateFrom} onChange={(e) => updateFilter("dateFrom", e.target.value)} />
          </label>
          <label>
            Date To
            <input type="date" value={filters.dateTo} onChange={(e) => updateFilter("dateTo", e.target.value)} />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={filters.followedOnly}
              onChange={(e) => updateFilter("followedOnly", e.target.checked)}
            />
            Followed Clubs only
          </label>
        </div>
      </Card>

      <Card title="Trending (Top 5 in last 24h)">
        <div className="list">
          {trending.length ? (
            trending.map((row) => (
              <article key={row.event._id} className="item">
                <h4>{row.event.name}</h4>
                <p>
                  Registrations: {row.registrations} | Organizer: {row.event.organizer?.organizerName}
                </p>
                <Link to={`/participant/events/${row.event._id}`}>View Details</Link>
              </article>
            ))
          ) : (
            <p>No trending data yet.</p>
          )}
        </div>
      </Card>

      <Card title="All Events">
        <div className="list">
          {events.map((event) => (
            <article key={event._id} className="item">
              <h4>{event.name}</h4>
              <p>
                {event.eventType} | {event.organizer?.organizerName}
              </p>
              <p>Eligibility: {event.eligibility}</p>
              <p>Deadline: {new Date(event.registrationDeadline).toLocaleString()}</p>
              <Link to={`/participant/events/${event._id}`}>View Details</Link>
            </article>
          ))}
          {!events.length && <p>No events found for current filters.</p>}
        </div>
      </Card>
    </div>
  );
}

export default ParticipantBrowseEventsPage;