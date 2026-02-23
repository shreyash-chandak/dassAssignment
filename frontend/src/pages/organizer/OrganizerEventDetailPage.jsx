import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import jsQR from "jsqr";
import { useParams } from "react-router-dom";
import Card from "../../components/Card";
import { API_URL, request } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

function extractTicketId(raw) {
  if (!raw) {
    return "";
  }

  const trimmed = String(raw).trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed.ticketId) {
      return parsed.ticketId;
    }
  } catch (error) {
    // ignore non-JSON
  }

  const match = trimmed.match(/FEL-[A-Z]-[A-Z0-9]{8}/i);
  return match ? match[0].toUpperCase() : trimmed;
}

function OrganizerEventDetailPage() {
  const { id } = useParams();
  const { token } = useAuth();

  const [eventData, setEventData] = useState(null);
  const [edit, setEdit] = useState({ description: "", registrationDeadline: "", registrationLimit: 0, status: "" });
  const [filters, setFilters] = useState({ search: "", payment: "", attendance: "" });
  const [attendanceForm, setAttendanceForm] = useState({ ticketId: "", manualOverride: false, note: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [forumMessages, setForumMessages] = useState([]);
  const [forumInput, setForumInput] = useState("");
  const [forumAnnouncement, setForumAnnouncement] = useState(false);
  const [forumUnread, setForumUnread] = useState(0);
  const [feedbackData, setFeedbackData] = useState({ summary: { total: 0, averageRating: 0, distribution: [] }, feedback: [] });
  const [feedbackFilterRating, setFeedbackFilterRating] = useState("");

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scannerTimerRef = useRef(null);

  const socketHost = useMemo(() => API_URL.replace(/\/api$/, ""), []);

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

  const loadForum = () => {
    request(`/forum/${id}/messages`, { token })
      .then((data) => {
        setForumMessages(data.messages || []);
      })
      .catch((err) => setError(err.message));
  };

  const loadFeedback = (rating = "") => {
    const qs = rating ? `?rating=${rating}` : "";
    request(`/feedback/event/${id}${qs}`, { token })
      .then((data) => setFeedbackData(data))
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    load();
    loadForum();
    loadFeedback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token]);

  useEffect(() => {
    const socket = io(socketHost, { auth: { token } });
    socket.emit("forum:join", { eventId: id });

    socket.on("forum:new-message", (incoming) => {
      setForumMessages((prev) => {
        if (prev.some((msg) => msg._id === incoming._id)) {
          return prev;
        }
        return [...prev, incoming];
      });
      setForumUnread((prev) => prev + 1);
    });

    socket.on("forum:message-updated", (updated) => {
      setForumMessages((prev) => prev.map((msg) => (msg._id === updated._id ? { ...msg, ...updated } : msg)));
    });

    socket.on("forum:message-deleted", ({ messageId }) => {
      setForumMessages((prev) => prev.filter((msg) => msg._id !== messageId));
    });

    return () => {
      socket.disconnect();
    };
  }, [id, socketHost, token]);

  const stopCameraScan = () => {
    if (scannerTimerRef.current) {
      clearInterval(scannerTimerRef.current);
      scannerTimerRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      stopCameraScan();
    };
  }, []);

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

  const postForumMessage = async () => {
    if (!forumInput.trim()) {
      return;
    }

    try {
      await request(`/forum/${id}/messages`, {
        method: "POST",
        token,
        data: { content: forumInput, isAnnouncement: forumAnnouncement },
      });
      setForumInput("");
      setForumAnnouncement(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const togglePin = async (messageId) => {
    try {
      await request(`/forum/${id}/messages/${messageId}/pin`, {
        method: "PATCH",
        token,
      });
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteMessage = async (messageId) => {
    try {
      await request(`/forum/${id}/messages/${messageId}`, {
        method: "DELETE",
        token,
      });
    } catch (err) {
      setError(err.message);
    }
  };

  const updateFeedbackFilter = (value) => {
    setFeedbackFilterRating(value);
    loadFeedback(value);
  };

  const startCameraScan = async () => {
    try {
      setCameraError("");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
        },
      });

      streamRef.current = stream;
      setCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      scannerTimerRef.current = setInterval(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState < 2) {
          return;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          return;
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const decoded = jsQR(imageData.data, canvas.width, canvas.height);
        if (decoded?.data) {
          const ticketId = extractTicketId(decoded.data);
          setAttendanceForm((prev) => ({ ...prev, ticketId }));
          setMessage(`QR decoded: ${ticketId}`);
          stopCameraScan();
        }
      }, 250);
    } catch (err) {
      setCameraError(err.message || "Could not access camera");
      stopCameraScan();
    }
  };

  const decodeQrFromFile = async (file) => {
    if (!file) {
      return;
    }

    try {
      const bitmap = await createImageBitmap(file);
      const canvas = canvasRef.current || document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        throw new Error("Unable to read image data");
      }

      ctx.drawImage(bitmap, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const decoded = jsQR(imageData.data, canvas.width, canvas.height);
      if (!decoded?.data) {
        throw new Error("No QR code found in image");
      }

      const ticketId = extractTicketId(decoded.data);
      setAttendanceForm((prev) => ({ ...prev, ticketId }));
      setMessage(`QR decoded from file: ${ticketId}`);
    } catch (err) {
      setCameraError(err.message || "Unable to decode QR image");
    }
  };

  if (!eventData) {
    return <div className="container">Loading event...</div>;
  }

  const merchandiseOrders = (eventData.participants || []).filter((p) => p.eventType === "merchandise");
  const orderSummary = {
    pending: merchandiseOrders.filter((order) => order.status === "pending_approval").length,
    approved: merchandiseOrders.filter((order) => order.status === "approved").length,
    rejected: merchandiseOrders.filter((order) => order.status === "rejected").length,
  };

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
            <h4>Not Scanned</h4>
            <p>{Math.max((eventData.analytics.registrations || 0) - (eventData.analytics.attendance || 0), 0)}</p>
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

      <Card title={`Forum Moderation${forumUnread > 0 ? ` (New: ${forumUnread})` : ""}`}>
        <div className="row">
          <button type="button" className="btn btn-light" onClick={() => setForumUnread(0)}>
            Mark Seen
          </button>
          <button type="button" className="btn btn-light" onClick={loadForum}>
            Refresh
          </button>
        </div>

        <div className="list">
          {forumMessages.map((forumMessage) => (
            <article className="item" key={forumMessage._id}>
              <p>
                <strong>
                  {forumMessage.user?.organizerName ||
                    `${forumMessage.user?.firstName || ""} ${forumMessage.user?.lastName || ""}`.trim()}
                </strong>
                {forumMessage.isPinned ? " (Pinned)" : ""}
                {forumMessage.isAnnouncement ? " (Announcement)" : ""}
              </p>
              <p>{forumMessage.content}</p>
              <p className="muted">{new Date(forumMessage.createdAt).toLocaleString()}</p>
              <div className="row">
                <button type="button" className="btn btn-light" onClick={() => togglePin(forumMessage._id)}>
                  {forumMessage.isPinned ? "Unpin" : "Pin"}
                </button>
                <button type="button" className="btn" onClick={() => deleteMessage(forumMessage._id)}>
                  Delete
                </button>
              </div>
            </article>
          ))}
          {!forumMessages.length && <p>No forum messages yet.</p>}
        </div>

        <label>
          Post as organizer
          <textarea value={forumInput} onChange={(e) => setForumInput(e.target.value)} rows={3} />
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={forumAnnouncement} onChange={(e) => setForumAnnouncement(e.target.checked)} />
          Post as announcement
        </label>
        <button type="button" className="btn" onClick={postForumMessage}>
          Post Message
        </button>
      </Card>

      <Card title="Anonymous Feedback Analytics">
        <div className="stats-grid">
          <article className="stat">
            <h4>Total Feedback</h4>
            <p>{feedbackData.summary?.total || 0}</p>
          </article>
          <article className="stat">
            <h4>Average Rating</h4>
            <p>{Number(feedbackData.summary?.averageRating || 0).toFixed(2)}</p>
          </article>
        </div>
        <p className="muted">
          Distribution: {(feedbackData.summary?.distribution || []).map((d) => `${d.rating}*:${d.count}`).join(" | ") || "-"}
        </p>
        <div className="row">
          <label>
            Filter by Rating
            <select value={feedbackFilterRating} onChange={(e) => updateFeedbackFilter(e.target.value)}>
              <option value="">All</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
            </select>
          </label>
          <a
            className="btn btn-light"
            href={`${API_URL}/feedback/event/${id}?export=csv&token=${encodeURIComponent(token || "")}`}
            target="_blank"
            rel="noreferrer"
          >
            Export Feedback CSV
          </a>
        </div>
        <div className="list">
          {(feedbackData.feedback || []).map((entry, idx) => (
            <article key={`${entry.createdAt}-${idx}`} className="item">
              <p>Rating: {entry.rating} / 5</p>
              <p>{entry.comment || "No comment"}</p>
              <p className="muted">{new Date(entry.createdAt).toLocaleString()}</p>
            </article>
          ))}
          {!feedbackData.feedback?.length && <p>No feedback records yet.</p>}
        </div>
      </Card>

      <Card title="Merchandise Payment Orders">
        <p className="muted">
          Pending: {orderSummary.pending} | Approved: {orderSummary.approved} | Rejected: {orderSummary.rejected}
        </p>
        <div className="list">
          {merchandiseOrders.map((order) => (
            <article className="item" key={order.id}>
              <p>
                {order.name} ({order.email}) | Payment: {order.payment} | Status: {order.status}
              </p>
              <p>
                Order Items:{" "}
                {(order.merchandiseSelections || [])
                  .map((item) => `${item.name} x${item.quantity}`)
                  .join(", ") || "-"}
              </p>
              <p>Ticket: {order.ticketId || "Not generated"}</p>
              <p>
                Proof:{" "}
                {order.paymentProofUrl ? (
                  <a href={order.paymentProofUrl} target="_blank" rel="noreferrer">
                    View Uploaded Proof
                  </a>
                ) : (
                  "Not provided"
                )}
              </p>
              {order.status === "pending_approval" && (
                <div className="row">
                  <button type="button" className="btn" onClick={() => decideOrder(order.id, "approved")}>
                    Approve
                  </button>
                  <button type="button" className="btn btn-light" onClick={() => decideOrder(order.id, "rejected")}>
                    Reject
                  </button>
                </div>
              )}
            </article>
          ))}
          {!merchandiseOrders.length && <p>No merchandise orders for this event.</p>}
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

        <div className="row">
          {!cameraActive ? (
            <button type="button" className="btn btn-light" onClick={startCameraScan}>
              Start Camera Scan
            </button>
          ) : (
            <button type="button" className="btn btn-light" onClick={stopCameraScan}>
              Stop Camera
            </button>
          )}

          <label className="btn btn-light" style={{ display: "inline-block", cursor: "pointer" }}>
            Scan from Image
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => decodeQrFromFile(e.target.files?.[0])}
            />
          </label>
        </div>

        {cameraError && <p className="error">{cameraError}</p>}

        {cameraActive && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ width: "100%", maxWidth: "420px", border: "1px solid #d9e0ea", borderRadius: "0.5rem" }}
          />
        )}
        <canvas ref={canvasRef} style={{ display: "none" }} />

        <button className="btn" type="button" onClick={markAttendance}>
          Mark Attendance
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
