import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import jsQR from "jsqr";
import { useParams } from "react-router-dom";
import Card from "../../components/Card";
import ForumPanel from "../../components/ForumPanel";
import { API_URL, request } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

const SOCKET_URL = API_URL.replace(/\/api\/?$/, "");

function OrganizerEventDetailPage() {
  const { id } = useParams();
  const { token } = useAuth();

  const [eventData, setEventData] = useState(null);
  const [edit, setEdit] = useState({ description: "", registrationDeadline: "", registrationLimit: 0, status: "" });
  const [filters, setFilters] = useState({ search: "", payment: "", attendance: "" });
  const [attendanceData, setAttendanceData] = useState({ totals: { eligible: 0, scanned: 0, pending: 0 }, scanned: [], pending: [] });
  const [merchOrders, setMerchOrders] = useState([]);
  const [merchStatusFilter, setMerchStatusFilter] = useState("pending");
  const [reviewComment, setReviewComment] = useState("");
  const [scanInput, setScanInput] = useState("");
  const [feedbackData, setFeedbackData] = useState({ averageRating: 0, totalFeedback: 0, distribution: [], feedback: [] });
  const [feedbackRatingFilter, setFeedbackRatingFilter] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const scannerIntervalRef = useRef(null);

  const loadEvent = async () => {
    try {
      const [eventResponse, attendanceResponse, feedbackResponse] = await Promise.all([
        request(`/organizer/events/${id}`, { token }),
        request(`/organizer/events/${id}/attendance/dashboard`, { token }),
        request(`/organizer/events/${id}/feedback${feedbackRatingFilter ? `?rating=${feedbackRatingFilter}` : ""}`, { token }),
      ]);

      setEventData(eventResponse);
      setEdit({
        description: eventResponse.event.description || "",
        registrationDeadline: eventResponse.event.registrationDeadline?.slice(0, 16) || "",
        registrationLimit: eventResponse.event.registrationLimit || 0,
        status: eventResponse.event.status || "",
      });
      setAttendanceData(attendanceResponse);
      setFeedbackData(feedbackResponse);
    } catch (err) {
      setError(err.message);
    }
  };

  const loadMerchOrders = async () => {
    try {
      const response = await request(`/organizer/events/${id}/merch-orders${merchStatusFilter ? `?status=${merchStatusFilter}` : ""}`, { token });
      setMerchOrders(response.orders || []);
    } catch (err) {
      if (!String(err.message || "").toLowerCase().includes("not found")) {
        setError(err.message);
      }
    }
  };

  useEffect(() => {
    loadEvent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token, feedbackRatingFilter]);

  useEffect(() => {
    loadMerchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token, merchStatusFilter, eventData?.event?.eventType]);

  useEffect(() => {
    if (!id || !token) {
      return undefined;
    }

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      socket.emit("forum:join", { eventId: id });
    });

    socket.on("attendance:update", (payload) => {
      setAttendanceData(payload);
    });

    socket.on("merch:payment_update", () => {
      loadEvent();
      loadMerchOrders();
    });

    return () => {
      socket.emit("forum:leave", { eventId: id });
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token]);

  useEffect(
    () => () => {
      if (scannerIntervalRef.current) {
        clearInterval(scannerIntervalRef.current);
      }
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    },
    []
  );

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

  const refreshAll = async () => {
    await loadEvent();
    await loadMerchOrders();
  };

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
      refreshAll();
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
      refreshAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const reviewOrder = async (registrationId, action) => {
    setError("");
    setMessage("");
    try {
      const data = await request(`/organizer/registrations/${registrationId}/payment`, {
        method: "PATCH",
        token,
        data: { action, comment: reviewComment },
      });
      setMessage(data.message || "Order reviewed");
      setReviewComment("");
      refreshAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const scanTicket = async ({ ticketId, qrPayload, source }) => {
    setError("");
    setMessage("");
    try {
      const data = await request(`/organizer/events/${id}/attendance/scan`, {
        method: "POST",
        token,
        data: { ticketId, qrPayload, source },
      });
      setMessage(data.message || "Attendance marked");
      setScanInput("");
      refreshAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const markManualAttendance = async (registrationId, present) => {
    setError("");
    setMessage("");
    try {
      const data = await request(`/organizer/registrations/${registrationId}/attendance/manual`, {
        method: "POST",
        token,
        data: { present, note: "Manual organizer override" },
      });
      setMessage(data.message || "Attendance updated");
      setAttendanceData((prev) => ({ ...prev, totals: data.totals || prev.totals }));
      refreshAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const decodeQrFromFile = async (file) => {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        const imageData = context.getImageData(0, 0, image.width, image.height);
        const result = jsQR(imageData.data, imageData.width, imageData.height);
        if (!result) {
          setError("Could not decode QR from file");
          return;
        }
        scanTicket({ qrPayload: result.data, source: "file-upload" });
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const stopCameraScanner = () => {
    if (scannerIntervalRef.current) {
      clearInterval(scannerIntervalRef.current);
      scannerIntervalRef.current = null;
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
  };

  const startCameraScanner = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      if (scannerIntervalRef.current) {
        clearInterval(scannerIntervalRef.current);
      }

      scannerIntervalRef.current = setInterval(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState < 2) {
          return;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext("2d");
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code?.data) {
          stopCameraScanner();
          scanTicket({ qrPayload: code.data, source: "camera" });
        }
      }, 700);
    } catch (err) {
      setError(`Camera start failed: ${err.message}`);
    }
  };

  if (!eventData) {
    return <div className="container">Loading event...</div>;
  }

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
        </div>
      </Card>

      {eventData.event.eventType === "merchandise" && (
        <Card title="Merchandise Payment Approval">
          <div className="row">
            <label>
              Status Filter
              <select value={merchStatusFilter} onChange={(e) => setMerchStatusFilter(e.target.value)}>
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
            <label>
              Review Comment
              <input value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} />
            </label>
          </div>
          <div className="list">
            {merchOrders.map((order) => (
              <article className="item" key={order.id}>
                <p>
                  <strong>{order.participant.name}</strong> ({order.participant.email})
                </p>
                <p>Status: {order.paymentStatus}</p>
                <p>Amount: {order.amountPaid}</p>
                <p>Items: {(order.selections || []).map((s) => `${s.name} x${s.quantity}`).join(", ")}</p>
                <p>
                  Payment Proof:{" "}
                  {order.paymentProofUrl ? (
                    <a href={order.paymentProofUrl} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  ) : (
                    "N/A"
                  )}
                </p>
                {order.paymentStatus === "pending" && (
                  <div className="row">
                    <button type="button" className="btn" onClick={() => reviewOrder(order.id, "approve")}>
                      Approve
                    </button>
                    <button type="button" className="btn btn-light" onClick={() => reviewOrder(order.id, "reject")}>
                      Reject
                    </button>
                  </div>
                )}
              </article>
            ))}
            {!merchOrders.length && <p>No orders for selected filter.</p>}
          </div>
        </Card>
      )}

      <Card title="Attendance Scanner & Live Dashboard">
        <div className="stats-grid">
          <article className="stat">
            <h4>Eligible</h4>
            <p>{attendanceData.totals?.eligible || 0}</p>
          </article>
          <article className="stat">
            <h4>Scanned</h4>
            <p>{attendanceData.totals?.scanned || 0}</p>
          </article>
          <article className="stat">
            <h4>Pending</h4>
            <p>{attendanceData.totals?.pending || 0}</p>
          </article>
        </div>
        <div className="row">
          <input
            placeholder="Manual ticket ID"
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
          />
          <button type="button" className="btn" onClick={() => scanTicket({ ticketId: scanInput, source: "manual-ticket-input" })}>
            Scan by Ticket ID
          </button>
          <input type="file" accept="image/*" onChange={(e) => decodeQrFromFile(e.target.files?.[0])} />
        </div>
        <div className="row">
          <button type="button" className="btn btn-light" onClick={startCameraScanner}>
            Start Camera Scan
          </button>
          <button type="button" className="btn btn-light" onClick={stopCameraScanner}>
            Stop Camera
          </button>
          <a
            className="btn btn-light"
            href={`${API_URL}/organizer/events/${id}/attendance/dashboard?export=csv&token=${encodeURIComponent(token || "")}`}
            target="_blank"
            rel="noreferrer"
          >
            Export Attendance CSV
          </a>
        </div>
        <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", maxWidth: "400px" }} />
        <canvas ref={canvasRef} style={{ display: "none" }} />
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
              <option value="approved">approved</option>
              <option value="pending">pending</option>
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
                <th>Override</th>
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
                  <td>
                    <div className="row">
                      <button type="button" className="btn btn-light" onClick={() => markManualAttendance(p.id, true)}>
                        Present
                      </button>
                      <button type="button" className="btn btn-light" onClick={() => markManualAttendance(p.id, false)}>
                        Absent
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredParticipants.length && <p>No participants found for selected filters.</p>}
        </div>
      </Card>

      <ForumPanel eventId={id} token={token} canPost canModerate />

      <Card title="Anonymous Feedback Analytics">
        <div className="row">
          <label>
            Filter by Rating
            <select value={feedbackRatingFilter} onChange={(e) => setFeedbackRatingFilter(e.target.value)}>
              <option value="">All</option>
              <option value="5">5</option>
              <option value="4">4</option>
              <option value="3">3</option>
              <option value="2">2</option>
              <option value="1">1</option>
            </select>
          </label>
          <p>
            Average: {feedbackData.averageRating} / 5 ({feedbackData.totalFeedback} responses)
          </p>
        </div>
        <div className="row">
          {(feedbackData.distribution || []).map((bucket) => (
            <span key={bucket.rating}>
              {bucket.rating}*: {bucket.count}
            </span>
          ))}
        </div>
        <div className="list">
          {(feedbackData.feedback || []).map((row) => (
            <article className="item" key={row.id}>
              <p>{row.rating}/5</p>
              <p>{row.comment || "(no comment)"}</p>
              <p className="muted">{new Date(row.createdAt).toLocaleString()}</p>
            </article>
          ))}
          {!feedbackData.feedback?.length && <p>No feedback yet.</p>}
        </div>
      </Card>
    </div>
  );
}

export default OrganizerEventDetailPage;
