import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Card from "../../components/Card";
import ForumPanel from "../../components/ForumPanel";
import { request } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

function ParticipantEventDetailsPage() {
  const { id } = useParams();
  const { token } = useAuth();

  const [eventData, setEventData] = useState(null);
  const [formResponses, setFormResponses] = useState({});
  const [customFileInputs, setCustomFileInputs] = useState({});
  const [selections, setSelections] = useState({});
  const [paymentProof, setPaymentProof] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [feedbackForm, setFeedbackForm] = useState({ rating: 5, comment: "" });
  const [myFeedback, setMyFeedback] = useState(null);

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

    request(`/events/${id}/feedback/me`, { token })
      .then((data) => setMyFeedback(data.feedback || null))
      .catch(() => setMyFeedback(null));
  };

  useEffect(() => {
    setCustomFileInputs({});
    loadEvent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token]);

  const isPastEvent = useMemo(() => {
    if (!event) {
      return false;
    }
    return new Date(event.endDate) <= new Date();
  }, [event]);

  const canAct = useMemo(() => {
    if (!event || !meta) {
      return false;
    }
    if (eventData?.viewerRegistration) {
      return false;
    }
    if (meta.registrationClosed) {
      return false;
    }
    if (event.eventType === "merchandise" && meta.merchandiseStockExhausted) {
      return false;
    }
    return true;
  }, [event, meta, eventData]);

  const canUseForum = useMemo(() => Boolean(eventData?.viewerRegistration), [eventData]);

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
      if (!paymentProof) {
        setError("Payment proof is required");
        return;
      }

      const normalizedSelections = Object.entries(selections)
        .filter(([, qty]) => Number(qty) > 0)
        .map(([itemId, quantity]) => ({ itemId, quantity: Number(quantity) }));

      const payload = new FormData();
      payload.append("selections", JSON.stringify(normalizedSelections));
      payload.append("paymentProof", paymentProof);

      const response = await request(`/events/${id}/purchase`, {
        method: "POST",
        token,
        data: payload,
        isForm: true,
      });
      setStatus(response.message || "Order placed");
      setPaymentProof(null);
      loadEvent();
    } catch (err) {
      setError(err.message);
    }
  };

  const submitFeedback = async () => {
    setStatus("");
    setError("");
    try {
      const response = await request(`/events/${id}/feedback`, {
        method: "POST",
        token,
        data: {
          rating: Number(feedbackForm.rating),
          comment: feedbackForm.comment,
        },
      });
      setStatus(response.message || "Feedback submitted");
      setMyFeedback(response.feedback);
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
        {eventData.viewerRegistration && (
          <p>
            Registration Status: {eventData.viewerRegistration.status} | Payment:{" "}
            {eventData.viewerRegistration.paymentStatus || "na"}
          </p>
        )}
        {eventData.viewerRegistration?.ticketId && (
          <p>
            Your Ticket: <Link to={`/tickets/${eventData.viewerRegistration.ticketId}`}>{eventData.viewerRegistration.ticketId}</Link>
          </p>
        )}
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
        <Card title="Purchase Merchandise (Payment Approval Workflow)">
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
          <label>
            Upload Payment Proof
            <input type="file" accept="image/*" onChange={(e) => setPaymentProof(e.target.files?.[0] || null)} />
          </label>
          <button type="button" className="btn" onClick={handlePurchase} disabled={!canAct}>
            Place Order
          </button>
          <p className="muted">Ticket QR is generated only after organizer approval.</p>
        </Card>
      )}

      <ForumPanel eventId={id} token={token} canPost={canUseForum} canModerate={false} />

      {isPastEvent && eventData.viewerRegistration && (
        <Card title="Anonymous Feedback">
          {myFeedback ? (
            <p>
              Submitted: {myFeedback.rating}/5 {myFeedback.comment ? `- ${myFeedback.comment}` : ""}
            </p>
          ) : (
            <div className="grid two">
              <label>
                Rating
                <select
                  value={feedbackForm.rating}
                  onChange={(e) => setFeedbackForm((prev) => ({ ...prev, rating: Number(e.target.value) }))}
                >
                  <option value={5}>5</option>
                  <option value={4}>4</option>
                  <option value={3}>3</option>
                  <option value={2}>2</option>
                  <option value={1}>1</option>
                </select>
              </label>
              <label>
                Comment
                <textarea
                  rows={3}
                  value={feedbackForm.comment}
                  onChange={(e) => setFeedbackForm((prev) => ({ ...prev, comment: e.target.value }))}
                />
              </label>
              <button type="button" className="btn" onClick={submitFeedback}>
                Submit Anonymous Feedback
              </button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

export default ParticipantEventDetailsPage;
