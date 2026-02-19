import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { request } from "../api/client";
import { useAuth } from "../context/AuthContext";

function TicketPage() {
  const { ticketId } = useParams();
  const { token } = useAuth();
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    request(`/tickets/${ticketId}`, { token })
      .then((data) => setTicket(data.ticket))
      .catch((err) => setError(err.message));
  }, [ticketId, token]);

  if (error) {
    return (
      <div className="container">
        <p className="error">{error}</p>
      </div>
    );
  }

  if (!ticket) {
    return <div className="container">Loading ticket...</div>;
  }

  return (
    <div className="container">
      <h1>Ticket Details</h1>
      <p>Ticket ID: {ticket.ticketId}</p>
      <p>Event: {ticket.event?.name}</p>
      <p>Type: {ticket.eventType}</p>
      <p>Status: {ticket.status}</p>
      <p>
        Participant: {ticket.participant?.firstName} {ticket.participant?.lastName} ({ticket.participant?.email})
      </p>
      {ticket.ticketQrData && <img src={ticket.ticketQrData} alt="Ticket QR" className="qr" />}
    </div>
  );
}

export default TicketPage;
