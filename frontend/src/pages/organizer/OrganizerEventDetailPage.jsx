import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import Card from "../../components/Card";
import { API_URL, request } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

function OrganizerEventDetailPage() {
  const { id } = useParams();
  const { token } = useAuth();

  const [eventData, setEventData] = useState(null);
  const [edit, setEdit] = useState({ description: "", registrationDeadline: "", registrationLimit: 0, status: "" });
  const [filters, setFilters] = useState({ search: "", payment: "", attendance: "" });
  const [attendanceForm, setAttendanceForm] = useState({ ticketId: "", manualOverride: false, note: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = () => {
    request(`/organizer/events/${id}`, { token })
      .then((data) => {
        setEventData(data);
        setEdit({
          description: data.event.description || "",
          registrationDeadline: data.event.registrationDeadline?.slice(0, 16) || "",
          registrationLimit: data.event.registrationLimit || 0,
          status: data.event.status || "",
        });
      })
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token]);

  const filteredParticipants = useMemo(() => {
    if (!eventData) {
      return [];
    }

    const regex = new RegExp(filters.search || "", "i");
    return (eventData.participants || [])
      .filter((p) => (!filters.search ? true : regex.test(p.name) || regex.test(p.email)))
      .filter((p) => (!filters.payment ? true : p.payment === filters.payment))
      .filter((p) => {
        if (!filters.attendance) {
          return true;
        }
        return filters.attendance === "present" ? p.attendance : !p.attendance;
      });
  }, [eventData, filters]);

  const saveEdits = async () => {
    setError("");
    setMessage("");
    try {
      const data = await request(`/organizer/events/${id}`, {
        method: "PATCH",
        token,
        data: {
          description: edit.description,
          registrationDeadline: edit.registrationDeadline,
          registrationLimit: Number(edit.registrationLimit),
          status: edit.status,
        },
      });
      setMessage(data.message || "Event updated");
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const publish = async () => {
    setError("");
    setMessage("");
    try {
      const data = await request(`/organizer/events/${id}/publish`, {
        method: "POST",
        token,
      });
      setMessage(data.message || "Published");
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const decideOrder = async (registrationId, decision) => {
    try {
      const data = await request(`/organizer/orders/${registrationId}/decision`, {
        method: "POST",
        token,
        data: { decision },
      });
      setMessage(data.message);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const markAttendance = async () => {
    try {
      const data = await request("/organizer/attendance/scan", {
        method: "POST",
        token,
        data: attendanceForm,
      });
      setMessage(data.message);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!eventData) {
    return <div className="container">Loading event...</div>;
  }

  const pendingOrders = (eventData.participants || []).filter((p) => p.status === "pending_approval");

  return (
    <div className="container">
      <h1>Organizer Event Detail</h1>
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}

      <Card title={`${eventData.event.name} (${eventData.event.status})`}>
        <p>Type: {eventData.event.eventType}</p>
        <p>
          Dates: {new Date(eventData.event.startDate).toLocaleString()} - {new Date(eventData.event.endDate).toLocaleString()}
        </p>
        <p>Eligibility: {eventData.event.eligibility}</p>
        <p>Pricing: {eventData.event.registrationFee}</p>
      </Card>

      <Card title="Analytics">
        <div className="stats-grid">
          <article className="stat">
            <h4>Registrations/Sales</h4>
            <p>
              {eventData.analytics.registrations} / {eventData.analytics.sales}
            </p>
          </article>
          <article className="stat">
            <h4>Attendance</h4>
            <p>{eventData.analytics.attendance}</p>
          </article>
          <article className="stat">
            <h4>Team Completion</h4>
            <p>{eventData.analytics.teamCompletion}</p>
          </article>
          <article className="stat">
            <h4>Revenue</h4>
            <p>{eventData.analytics.revenue}</p>
          </article>
        </div>
      </Card>

      <Card title="Edit Event & Actions">
        <div className="grid two">
          <label>
            Description
            <textarea value={edit.description} onChange={(e) => setEdit((p) => ({ ...p, description: e.target.value }))} rows={3} />
          </label>
          <label>
            Registration Deadline
            <input
              type="datetime-local"
              value={edit.registrationDeadline}
              onChange={(e) => setEdit((p) => ({ ...p, registrationDeadline: e.target.value }))}
            />
          </label>
          <label>
            Registration Limit
            <input
              type="number"
              value={edit.registrationLimit}
              onChange={(e) => setEdit((p) => ({ ...p, registrationLimit: e.target.value }))}
            />
          </label>
          <label>
            Status
            <select value={edit.status} onChange={(e) => setEdit((p) => ({ ...p, status: e.target.value }))}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="ongoing">Ongoing</option>
              <option value="completed">Completed</option>
              <option value="closed">Closed</option>
            </select>
          </label>
        </div>
        <div className="row">
          <button className="btn" type="button" onClick={saveEdits}>
            Save Edits
          </button>
          <button className="btn btn-light" type="button" onClick={publish}>
            Publish Draft
          </button>
          <a
            className="btn btn-light"
            href={`${API_URL}/organizer/events/${id}/participants?export=csv&token=${encodeURIComponent(token || "")}`}
            target="_blank"
            rel="noreferrer"
          >
            Export Participants CSV
          </a>
          <a
            className="btn btn-light"
            href={`${API_URL}/organizer/events/${id}/attendance-report?token=${encodeURIComponent(token || "")}`}
            target="_blank"
            rel="noreferrer"
          >
            Export Attendance CSV
          </a>
        </div>
      </Card>

      <Card title="Merchandise Payment Approval">
        <div className="list">
          {pendingOrders.map((order) => (
            <article className="item" key={order.id}>
              <p>
                {order.name} ({order.email}) | Payment: {order.payment}
              </p>
              <p>Ticket: {order.ticketId || "Not generated"}</p>
              <div className="row">
                <button type="button" className="btn" onClick={() => decideOrder(order.id, "approved")}>
                  Approve
                </button>
                <button type="button" className="btn btn-light" onClick={() => decideOrder(order.id, "rejected")}>
                  Reject
                </button>
              </div>
            </article>
          ))}
          {!pendingOrders.length && <p>No pending orders.</p>}
        </div>
      </Card>

      <Card title="QR Attendance Scanner">
        <div className="grid two">
          <label>
            Ticket ID
            <input
              value={attendanceForm.ticketId}
              onChange={(e) => setAttendanceForm((p) => ({ ...p, ticketId: e.target.value }))}
            />
          </label>
          <label>
            Note
            <input value={attendanceForm.note} onChange={(e) => setAttendanceForm((p) => ({ ...p, note: e.target.value }))} />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={attendanceForm.manualOverride}
              onChange={(e) => setAttendanceForm((p) => ({ ...p, manualOverride: e.target.checked }))}
            />
            Manual Override
          </label>
        </div>
        <button className="btn" type="button" onClick={markAttendance}>
          Scan / Mark Attendance
        </button>
      </Card>

      <Card title="Participants">
        <div className="grid three">
          <label>
            Search
            <input value={filters.search} onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))} />
          </label>
          <label>
            Payment
            <select value={filters.payment} onChange={(e) => setFilters((p) => ({ ...p, payment: e.target.value }))}>
              <option value="">All</option>
              <option value="pending">pending</option>
              <option value="approved">approved</option>
              <option value="rejected">rejected</option>
              <option value="na">na</option>
            </select>
          </label>
          <label>
            Attendance
            <select value={filters.attendance} onChange={(e) => setFilters((p) => ({ ...p, attendance: e.target.value }))}>
              <option value="">All</option>
              <option value="present">Present</option>
              <option value="absent">Absent</option>
            </select>
          </label>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Reg Date</th>
                <th>Payment</th>
                <th>Team</th>
                <th>Attendance</th>
                <th>Status</th>
                <th>Ticket</th>
              </tr>
            </thead>
            <tbody>
              {filteredParticipants.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.email}</td>
                  <td>{new Date(p.regDate).toLocaleString()}</td>
                  <td>{p.payment}</td>
                  <td>{p.team || "-"}</td>
                  <td>{p.attendance ? "Present" : "Absent"}</td>
                  <td>{p.status}</td>
                  <td>{p.ticketId || "Pending"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default OrganizerEventDetailPage;
