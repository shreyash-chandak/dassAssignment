import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import Card from "../../components/Card";
import { API_URL, request } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

function ParticipantEventDetailsPage() {
  const { id } = useParams();
  const { token } = useAuth();

  const [eventData, setEventData] = useState(null);
  const [formResponses, setFormResponses] = useState({});
  const [selections, setSelections] = useState({});
  const [forumMessages, setForumMessages] = useState([]);
  const [forumText, setForumText] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamSize, setTeamSize] = useState(2);
  const [inviteCode, setInviteCode] = useState("");
  const [calendar, setCalendar] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const event = eventData?.event;
  const meta = eventData?.meta;

  const loadEvent = () => {
    request(`/events/${id}`, { token })
      .then((data) => {
        setEventData(data);
        if (data.event?.eventType === "merchandise") {
          const init = {};
          (data.event.merchandiseItems || []).forEach((item) => {
            init[item._id] = 0;
          });
          setSelections(init);
        }
      })
      .catch((err) => setError(err.message));
  };

  const loadForum = () => {
    request(`/forum/${id}/messages`, { token })
      .then((data) => setForumMessages(data.messages || []))
      .catch(() => {});
  };

  useEffect(() => {
    loadEvent();
    loadForum();
    request(`/calendar/event/${id}`, { token })
      .then(setCalendar)
      .catch(() => setCalendar(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token]);

  const canAct = useMemo(() => {
    if (!event || !meta) {
      return false;
    }
    if (meta.registrationClosed) {
      return false;
    }
    if (event.eventType === "merchandise" && meta.merchandiseStockExhausted) {
      return false;
    }
    return true;
  }, [event, meta]);

  const handleNormalRegister = async () => {
    setStatus("");
    setError("");
    try {
      const data = await request(`/events/${id}/register`, {
        method: "POST",
        token,
        data: { formResponses },
      });
      setStatus(data.message || "Registered successfully");
      loadEvent();
    } catch (err) {
      setError(err.message);
    }
  };

  const handlePurchase = async () => {
    setStatus("");
    setError("");
    try {
      const payload = {
        selections: Object.entries(selections)
          .filter(([, qty]) => Number(qty) > 0)
          .map(([itemId, quantity]) => ({ itemId, quantity: Number(quantity) })),
      };
      const data = await request(`/events/${id}/purchase`, {
        method: "POST",
        token,
        data: payload,
      });
      setStatus(data.message || "Purchase submitted");
      loadEvent();
    } catch (err) {
      setError(err.message);
    }
  };

  const submitForumMessage = async () => {
    if (!forumText.trim()) {
      return;
    }
    setError("");
    try {
      await request(`/forum/${id}/messages`, {
        method: "POST",
        token,
        data: { content: forumText },
      });
      setForumText("");
      loadForum();
    } catch (err) {
      setError(err.message);
    }
  };

  const reactToMessage = async (messageId, emoji = "??") => {
    try {
      await request(`/forum/${id}/messages/${messageId}/react`, {
        method: "POST",
        token,
        data: { emoji },
      });
      loadForum();
    } catch (err) {
      setError(err.message);
    }
  };

  const createTeam = async () => {
    try {
      const data = await request(`/events/${id}/team/create`, {
        method: "POST",
        token,
        data: { teamName, maxMembers: Number(teamSize) },
      });
      setStatus(`Team created. Invite code: ${data.team.inviteCode}`);
    } catch (err) {
      setError(err.message);
    }
  };

  const joinTeam = async () => {
    try {
      const data = await request(`/events/${id}/team/join`, {
        method: "POST",
        token,
        data: { inviteCode },
      });
      setStatus(data.message || "Joined team");
    } catch (err) {
      setError(err.message);
    }
  };

  if (!eventData) {
    return <div className="container">Loading event details...</div>;
  }

  return (
    <div className="container">
      <h1>Event Details</h1>
      {status && <p className="success">{status}</p>}
      {error && <p className="error">{error}</p>}

      <Card title={event.name}>
        <p>{event.description}</p>
        <p>
          Type: {event.eventType} | Organizer: {event.organizer?.organizerName}
        </p>
        <p>
          Dates: {new Date(event.startDate).toLocaleString()} - {new Date(event.endDate).toLocaleString()}
        </p>
        <p>Deadline: {new Date(event.registrationDeadline).toLocaleString()}</p>
        <p>Eligibility: {event.eligibility}</p>
        <p>Fee: {event.registrationFee}</p>
        <p>Tags: {(event.tags || []).join(", ") || "None"}</p>
        <p>
          Blocking Rules: {meta.registrationClosed ? "Deadline/limit reached" : "Open"}
          {event.eventType === "merchandise" && meta.merchandiseStockExhausted ? " | Stock exhausted" : ""}
        </p>
      </Card>

      {event.eventType === "normal" ? (
        <Card title="Register">
          {(event.customFormFields || []).map((field) => (
            <label key={field.id}>
              {field.label} {field.required ? "*" : ""}
              <input
                value={formResponses[field.id] || ""}
                onChange={(e) =>
                  setFormResponses((prev) => ({
                    ...prev,
                    [field.id]: e.target.value,
                  }))
                }
              />
            </label>
          ))}
          <button type="button" className="btn" onClick={handleNormalRegister} disabled={!canAct}>
            Register
          </button>
        </Card>
      ) : (
        <Card title="Purchase Merchandise">
          {(event.merchandiseItems || []).map((item) => (
            <div key={item._id} className="item compact">
              <div>
                <strong>{item.name}</strong>
                <p>
                  Stock: {item.stock} | Price: {item.price}
                </p>
                <p>
                  Variant: {item.variant || "-"} | Size: {item.size || "-"} | Color: {item.color || "-"}
                </p>
              </div>
              <input
                type="number"
                min="0"
                value={selections[item._id] ?? 0}
                onChange={(e) =>
                  setSelections((prev) => ({
                    ...prev,
                    [item._id]: Number(e.target.value),
                  }))
                }
              />
            </div>
          ))}
          <button type="button" className="btn" onClick={handlePurchase} disabled={!canAct}>
            Purchase
          </button>
        </Card>
      )}

      {event.teamConfig?.enabled && (
        <Card title="Team Registration">
          <div className="grid two">
            <label>
              Team Name
              <input value={teamName} onChange={(e) => setTeamName(e.target.value)} />
            </label>
            <label>
              Team Size
              <input type="number" min="2" value={teamSize} onChange={(e) => setTeamSize(e.target.value)} />
            </label>
          </div>
          <button className="btn" type="button" onClick={createTeam}>
            Create Team
          </button>
          <hr />
          <label>
            Invite Code
            <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} />
          </label>
          <button className="btn btn-light" type="button" onClick={joinTeam}>
            Join Team
          </button>
        </Card>
      )}

      <Card title="Calendar Integration">
        {calendar ? (
          <div className="row">
            <a className="btn btn-light" href={calendar.googleCalendarLink} target="_blank" rel="noreferrer">
              Google Calendar
            </a>
            <a className="btn btn-light" href={calendar.outlookCalendarLink} target="_blank" rel="noreferrer">
              Outlook
            </a>
            <a
              className="btn btn-light"
              href={`${API_URL}/calendar/event/${id}?download=true&token=${encodeURIComponent(token || "")}`}
              target="_blank"
              rel="noreferrer"
            >
              Download .ics
            </a>
          </div>
        ) : (
          <p>Calendar export is available after successful registration.</p>
        )}
      </Card>

      <Card title="Discussion Forum">
        <div className="list">
          {forumMessages.map((message) => (
            <article className="item" key={message._id}>
              <p>
                <strong>
                  {message.user?.organizerName || `${message.user?.firstName || ""} ${message.user?.lastName || ""}`.trim()}
                </strong>
                {message.isPinned ? " (Pinned)" : ""}
              </p>
              <p>{message.content}</p>
              <p className="muted">{new Date(message.createdAt).toLocaleString()}</p>
              <button type="button" className="btn btn-light" onClick={() => reactToMessage(message._id)}>
                React ??
              </button>
            </article>
          ))}
          {!forumMessages.length && <p>No messages yet.</p>}
        </div>
        <label>
          New Message
          <textarea value={forumText} onChange={(e) => setForumText(e.target.value)} rows={3} />
        </label>
        <button type="button" className="btn" onClick={submitForumMessage}>
          Post Message
        </button>
      </Card>
    </div>
  );
}

export default ParticipantEventDetailsPage;
