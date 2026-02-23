import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { useParams } from "react-router-dom";
import Card from "../../components/Card";
import { API_URL, request } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

function ParticipantEventDetailsPage() {
  const { id } = useParams();
  const { token, user } = useAuth();

  const [eventData, setEventData] = useState(null);
  const [formResponses, setFormResponses] = useState({});
  const [customFileInputs, setCustomFileInputs] = useState({});
  const [selections, setSelections] = useState({});
  const [paymentProofFile, setPaymentProofFile] = useState(null);
  const [forumMessages, setForumMessages] = useState([]);
  const [forumText, setForumText] = useState("");
  const [replyParentId, setReplyParentId] = useState(null);
  const [teamName, setTeamName] = useState("");
  const [teamSize, setTeamSize] = useState(2);
  const [inviteCode, setInviteCode] = useState("");
  const [teamData, setTeamData] = useState(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [feedback, setFeedback] = useState({ rating: "", comment: "" });
  const [myFeedback, setMyFeedback] = useState(null);
  const [calendar, setCalendar] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const event = eventData?.event;
  const meta = eventData?.meta;
  const socketHost = useMemo(() => API_URL.replace(/\/api$/, ""), []);

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

  const loadTeam = () => {
    request(`/events/${id}/team/my`, { token })
      .then((data) => setTeamData(data.team || null))
      .catch(() => setTeamData(null));
  };

  const loadFeedback = () => {
    request(`/feedback/my/${id}`, { token })
      .then((data) => {
        setMyFeedback(data.feedback || null);
        if (data.feedback) {
          setFeedback({
            rating: String(data.feedback.rating || ""),
            comment: data.feedback.comment || "",
          });
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    setCustomFileInputs({});
    loadEvent();
    loadForum();
    loadTeam();
    loadFeedback();
    request(`/calendar/event/${id}`, { token })
      .then(setCalendar)
      .catch(() => setCalendar(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    const socket = io(socketHost, { auth: { token } });
    socket.emit("forum:join", { eventId: id });

    socket.on("forum:new-message", (message) => {
      setForumMessages((prev) => {
        if (prev.some((entry) => entry._id === message._id)) {
          return prev;
        }
        return [...prev, message];
      });
    });

    socket.on("forum:message-updated", (updated) => {
      setForumMessages((prev) => prev.map((entry) => (entry._id === updated._id ? { ...entry, ...updated } : entry)));
    });

    socket.on("forum:message-deleted", ({ messageId }) => {
      setForumMessages((prev) => prev.filter((entry) => entry._id !== messageId));
    });

    return () => {
      socket.disconnect();
    };
  }, [id, socketHost, token]);

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

  const topLevelMessages = useMemo(
    () => forumMessages.filter((message) => !message.parent).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
    [forumMessages]
  );

  const repliesByParent = useMemo(() => {
    const map = new Map();
    for (const message of forumMessages) {
      if (!message.parent) {
        continue;
      }
      const key = String(message.parent);
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(message);
    }

    for (const value of map.values()) {
      value.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    }

    return map;
  }, [forumMessages]);

  const handleNormalRegister = async () => {
    setStatus("");
    setError("");
    try {
      const hasFileInputs = Object.values(customFileInputs).some(Boolean);
      let data;
      if (hasFileInputs) {
        const payload = new FormData();
        payload.append("formResponses", JSON.stringify(formResponses));
        Object.entries(customFileInputs).forEach(([fieldId, file]) => {
          if (file) {
            payload.append(fieldId, file);
          }
        });
        data = await request(`/events/${id}/register`, {
          method: "POST",
          token,
          data: payload,
          isForm: true,
        });
      } else {
        data = await request(`/events/${id}/register`, {
          method: "POST",
          token,
          data: { formResponses },
        });
      }
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
      const normalizedSelections = Object.entries(selections)
        .filter(([, qty]) => Number(qty) > 0)
        .map(([itemId, quantity]) => ({ itemId, quantity: Number(quantity) }));

      const shouldUseFormData = Boolean(paymentProofFile || event?.paymentApprovalRequired);
      let data;
      let isForm = false;

      if (shouldUseFormData) {
        const formData = new FormData();
        formData.append("selections", JSON.stringify(normalizedSelections));
        if (paymentProofFile) {
          formData.append("paymentProof", paymentProofFile);
        }
        data = formData;
        isForm = true;
      } else {
        data = { selections: normalizedSelections };
      }

      const response = await request(`/events/${id}/purchase`, {
        method: "POST",
        token,
        data,
        isForm,
      });
      setStatus(response.message || "Purchase submitted");
      setPaymentProofFile(null);
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
        data: { content: forumText, parent: replyParentId },
      });
      setForumText("");
      setReplyParentId(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const reactToMessage = async (messageId, emoji = "like") => {
    try {
      await request(`/forum/${id}/messages/${messageId}/react`, {
        method: "POST",
        token,
        data: { emoji },
      });
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
      loadTeam();
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
      loadTeam();
    } catch (err) {
      setError(err.message);
    }
  };

  const submitFeedback = async () => {
    if (!feedback.rating) {
      setError("Please provide a rating for feedback");
      return;
    }
    try {
      const data = await request(`/feedback/${id}`, {
        method: "POST",
        token,
        data: {
          rating: Number(feedback.rating),
          comment: feedback.comment,
        },
      });
      setStatus(data.message || "Feedback submitted");
      loadFeedback();
    } catch (err) {
      setError(err.message);
    }
  };

  const createInvite = async () => {
    if (!teamData?._id || !inviteEmail.trim()) {
      return;
    }
    try {
      const data = await request(`/teams/${teamData._id}/invites`, {
        method: "POST",
        token,
        data: { email: inviteEmail.trim() },
      });
      setStatus(`Invite sent. Token: ${data.token}`);
      setInviteEmail("");
      loadTeam();
    } catch (err) {
      setError(err.message);
    }
  };

  const respondInvite = async (tokenValue, decision) => {
    if (!teamData?._id || !tokenValue) {
      return;
    }
    try {
      const data = await request(`/teams/${teamData._id}/invites/respond`, {
        method: "POST",
        token,
        data: { token: tokenValue, decision },
      });
      setStatus(data.message || `Invite ${decision}`);
      loadTeam();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!eventData) {
    return <div className="container">Loading event details...</div>;
  }

  const isLeader = teamData && String(teamData.leader?._id || teamData.leader) === String(user?._id);
  const myPendingInvites = (teamData?.invites || []).filter(
    (invite) => invite.email === user?.email && invite.status === "pending"
  );
  const feedbackAllowed =
    eventData?.viewerRegistration &&
    (new Date(event.endDate) <= new Date() || Boolean(eventData.viewerRegistration?.attendance?.scannedAt));

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
              {field.type === "textarea" ? (
                <textarea
                  value={formResponses[field.id] || ""}
                  onChange={(e) =>
                    setFormResponses((prev) => ({
                      ...prev,
                      [field.id]: e.target.value,
                    }))
                  }
                  rows={3}
                />
              ) : field.type === "dropdown" ? (
                <select
                  value={formResponses[field.id] || ""}
                  onChange={(e) =>
                    setFormResponses((prev) => ({
                      ...prev,
                      [field.id]: e.target.value,
                    }))
                  }
                >
                  <option value="">Select</option>
                  {(field.options || []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : field.type === "checkbox" ? (
                <input
                  type="checkbox"
                  checked={Boolean(formResponses[field.id])}
                  onChange={(e) =>
                    setFormResponses((prev) => ({
                      ...prev,
                      [field.id]: e.target.checked,
                    }))
                  }
                />
              ) : field.type === "file" ? (
                <input
                  type="file"
                  onChange={(e) =>
                    setCustomFileInputs((prev) => ({
                      ...prev,
                      [field.id]: e.target.files?.[0] || null,
                    }))
                  }
                />
              ) : (
                <input
                  type={field.type === "phone" ? "tel" : field.type === "number" ? "number" : field.type === "email" ? "email" : "text"}
                  value={formResponses[field.id] || ""}
                  onChange={(e) =>
                    setFormResponses((prev) => ({
                      ...prev,
                      [field.id]: e.target.value,
                    }))
                  }
                />
              )}
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
          {event.paymentApprovalRequired && (
            <label>
              Payment Proof (image)
              <input type="file" accept="image/*" onChange={(e) => setPaymentProofFile(e.target.files?.[0] || null)} />
            </label>
          )}
          <button type="button" className="btn" onClick={handlePurchase} disabled={!canAct}>
            Purchase
          </button>
        </Card>
      )}

      {event.teamConfig?.enabled && (
        <Card title="Team Registration">
          {teamData ? (
            <>
              <p>
                Team: <strong>{teamData.name}</strong> | Status: {teamData.status}
              </p>
              <p>
                Members: {(teamData.members || []).filter((member) => member.status === "accepted").length}/{teamData.maxMembers}
              </p>
              <p>Invite Code: {teamData.inviteCode}</p>

              <div className="list">
                {(teamData.members || []).map((member, index) => (
                  <article key={`${member.participant?._id || member.participant}-${index}`} className="item">
                    <p>
                      {(member.participant?.firstName || "") + " " + (member.participant?.lastName || "")}{" "}
                      ({member.participant?.email || "member"})
                    </p>
                    <p className="muted">Member Status: {member.status}</p>
                  </article>
                ))}
              </div>

              <hr />
              <h4>Invite Tracking</h4>
              <div className="list">
                {(teamData.invites || []).map((invite) => (
                  <article key={invite._id} className="item">
                    <p>{invite.email}</p>
                    <p className="muted">
                      Status: {invite.status} | Token: {invite.token}
                    </p>
                    {invite.status === "pending" && invite.email === user?.email && (
                      <div className="row">
                        <button className="btn" type="button" onClick={() => respondInvite(invite.token, "accepted")}>
                          Accept
                        </button>
                        <button
                          className="btn btn-light"
                          type="button"
                          onClick={() => respondInvite(invite.token, "rejected")}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </article>
                ))}
                {!teamData.invites?.length && <p>No invites yet.</p>}
              </div>

              {isLeader && (
                <>
                  <label>
                    Invite Participant Email
                    <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="name@email.com" />
                  </label>
                  <button className="btn btn-light" type="button" onClick={createInvite}>
                    Send Invite
                  </button>
                </>
              )}
            </>
          ) : (
            <>
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
            </>
          )}

          {myPendingInvites.length > 0 && (
            <p className="muted">You have {myPendingInvites.length} pending invite(s) in this event.</p>
          )}
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
          {topLevelMessages.map((message) => (
            <article className="item" key={message._id}>
              <p>
                <strong>
                  {message.user?.organizerName || `${message.user?.firstName || ""} ${message.user?.lastName || ""}`.trim()}
                </strong>
                {message.isPinned ? " (Pinned)" : ""}
              </p>
              <p>{message.content}</p>
              <p className="muted">{new Date(message.createdAt).toLocaleString()}</p>
              <p className="muted">
                {(message.reactions || []).map((reaction) => `${reaction.emoji} (${reaction.users?.length || 0})`).join(" | ")}
              </p>
              <div className="row">
                <button type="button" className="btn btn-light" onClick={() => reactToMessage(message._id)}>
                  React
                </button>
                <button type="button" className="btn btn-light" onClick={() => setReplyParentId(message._id)}>
                  Reply
                </button>
              </div>

              {(repliesByParent.get(String(message._id)) || []).map((reply) => (
                <div key={reply._id} className="item" style={{ marginTop: "0.5rem", marginLeft: "1rem" }}>
                  <p>
                    <strong>
                      {reply.user?.organizerName || `${reply.user?.firstName || ""} ${reply.user?.lastName || ""}`.trim()}
                    </strong>
                  </p>
                  <p>{reply.content}</p>
                  <p className="muted">{new Date(reply.createdAt).toLocaleString()}</p>
                </div>
              ))}
            </article>
          ))}
          {!topLevelMessages.length && <p>No messages yet.</p>}
        </div>
        <label>
          New Message {replyParentId ? "(reply mode)" : ""}
          <textarea value={forumText} onChange={(e) => setForumText(e.target.value)} rows={3} />
        </label>
        <div className="row">
          <button type="button" className="btn" onClick={submitForumMessage}>
            Post Message
          </button>
          {replyParentId && (
            <button type="button" className="btn btn-light" onClick={() => setReplyParentId(null)}>
              Cancel Reply
            </button>
          )}
        </div>
      </Card>

      {feedbackAllowed && (
        <Card title="Anonymous Feedback">
          <p className="muted">Your identity is hidden from organizer feedback listings.</p>
          <label>
            Rating (1-5)
            <select value={feedback.rating} onChange={(e) => setFeedback((prev) => ({ ...prev, rating: e.target.value }))}>
              <option value="">Select</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
            </select>
          </label>
          <label>
            Comment
            <textarea value={feedback.comment} onChange={(e) => setFeedback((prev) => ({ ...prev, comment: e.target.value }))} rows={3} />
          </label>
          <button className="btn" type="button" onClick={submitFeedback}>
            {myFeedback ? "Update Feedback" : "Submit Feedback"}
          </button>
        </Card>
      )}
    </div>
  );
}

export default ParticipantEventDetailsPage;
