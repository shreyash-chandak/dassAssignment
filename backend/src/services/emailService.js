const nodemailer = require("nodemailer");
const env = require("../config/env");

let transporter = null;

function getTransporter() {
  if (transporter) {
    return transporter;
  }

  if (env.smtpHost && env.smtpUser && env.smtpPass) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpPort === 465,
      auth: {
        user: env.smtpUser,
        pass: env.smtpPass,
      },
    });
    return transporter;
  }

  return null;
}

async function sendEmail({ to, subject, text, html }) {
  const activeTransporter = getTransporter();
  if (!activeTransporter) {
    // eslint-disable-next-line no-console
    console.log(`[EMAIL-STUB] To: ${to} | Subject: ${subject} | Body: ${text || "(html)"}`);
    return;
  }

  await activeTransporter.sendMail({
    from: env.smtpUser,
    to,
    subject,
    text,
    html,
  });
}

module.exports = { sendEmail };