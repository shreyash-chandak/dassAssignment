function pad(n) {
  return String(n).padStart(2, "0");
}

function toICSDate(date) {
  const d = new Date(date);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function sanitize(text = "") {
  return String(text).replace(/[\n\r,;]/g, " ");
}

function createICSForEvent(event, participantEmail) {
  const uid = `${event._id}@felicity-event-system`;
  const now = toICSDate(new Date());
  const start = toICSDate(event.startDate);
  const end = toICSDate(event.endDate);

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Felicity//Event Management//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${sanitize(event.name)}`,
    `DESCRIPTION:${sanitize(event.description)}`,
    `ORGANIZER;CN=${sanitize(event.organizer?.organizerName || "Organizer")}:MAILTO:${sanitize(event.organizer?.email || "noreply@felicity.local")}`,
    participantEmail ? `ATTENDEE:MAILTO:${sanitize(participantEmail)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

function createGoogleCalendarLink(event) {
  const base = "https://calendar.google.com/calendar/render?action=TEMPLATE";
  const dates = `${toICSDate(event.startDate)}/${toICSDate(event.endDate)}`;
  const params = new URLSearchParams({
    text: event.name,
    details: event.description,
    dates,
  });
  return `${base}&${params.toString()}`;
}

function createOutlookCalendarLink(event) {
  const base = "https://outlook.live.com/calendar/0/deeplink/compose";
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.name,
    body: event.description,
    startdt: new Date(event.startDate).toISOString(),
    enddt: new Date(event.endDate).toISOString(),
  });
  return `${base}?${params.toString()}`;
}

module.exports = { createICSForEvent, createGoogleCalendarLink, createOutlookCalendarLink };