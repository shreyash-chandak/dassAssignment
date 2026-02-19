const { v4: uuidv4 } = require("uuid");
const QRCode = require("qrcode");

async function createTicketPayload({ event, participant, registration }) {
  const ticketId = `FEL-${event.eventType.slice(0, 1).toUpperCase()}-${uuidv4().slice(0, 8).toUpperCase()}`;
  const payload = {
    ticketId,
    eventId: event._id,
    eventName: event.name,
    participantId: participant._id,
    participantEmail: participant.email,
    registrationId: registration._id,
  };
  const ticketQrData = await QRCode.toDataURL(JSON.stringify(payload));
  return { ticketId, ticketQrData, payload };
}

module.exports = { createTicketPayload };