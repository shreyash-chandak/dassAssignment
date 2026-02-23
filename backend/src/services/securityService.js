const crypto = require("crypto");
const SecurityEvent = require("../models/SecurityEvent");

const captchaStore = new Map();
const attemptsByIp = new Map();

const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const BLOCK_MS = 15 * 60 * 1000;

function cleanupCaptchas() {
  const now = Date.now();
  for (const [id, record] of captchaStore.entries()) {
    if (record.expiresAt <= now) {
      captchaStore.delete(id);
    }
  }
}

function cleanupAttempts() {
  const now = Date.now();
  for (const [ip, data] of attemptsByIp.entries()) {
    if (data.blockedUntil && data.blockedUntil > now) {
      continue;
    }
    if (now - data.windowStart > WINDOW_MS && (!data.blockedUntil || data.blockedUntil <= now)) {
      attemptsByIp.delete(ip);
    }
  }
}

function normalizeIp(rawIp = "") {
  const ip = String(rawIp || "").trim();
  return ip || "unknown";
}

function createCaptcha(ip) {
  cleanupCaptchas();
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  const captchaId = crypto.randomUUID();
  captchaStore.set(captchaId, {
    answer: String(a + b),
    ip: normalizeIp(ip),
    expiresAt: Date.now() + CAPTCHA_TTL_MS,
  });

  return {
    captchaId,
    challenge: `What is ${a} + ${b}?`,
    expiresInSeconds: Math.floor(CAPTCHA_TTL_MS / 1000),
  };
}

function verifyCaptcha({ captchaId, captchaAnswer, ip }) {
  cleanupCaptchas();
  const record = captchaStore.get(String(captchaId || ""));
  if (!record) {
    return { ok: false, reason: "Captcha expired or invalid" };
  }

  if (record.ip !== normalizeIp(ip)) {
    captchaStore.delete(captchaId);
    return { ok: false, reason: "Captcha IP mismatch" };
  }

  const ok = String(captchaAnswer || "").trim() === record.answer;
  captchaStore.delete(captchaId);
  return ok ? { ok: true } : { ok: false, reason: "Captcha answer is incorrect" };
}

function getAttemptState(ip) {
  cleanupAttempts();
  const key = normalizeIp(ip);
  const now = Date.now();
  const data = attemptsByIp.get(key);

  if (!data) {
    return { blocked: false, blockedUntil: null, attempts: 0 };
  }

  if (data.blockedUntil && data.blockedUntil > now) {
    return { blocked: true, blockedUntil: new Date(data.blockedUntil), attempts: data.attempts };
  }

  return { blocked: false, blockedUntil: null, attempts: data.attempts };
}

async function logSecurityEvent({ ip, email, type, reason, blockedUntil = null, metadata = {} }) {
  try {
    await SecurityEvent.create({
      ip: normalizeIp(ip),
      email: email ? String(email).toLowerCase() : undefined,
      type,
      reason,
      blockedUntil,
      metadata,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Failed to persist security event", error.message);
  }
}

async function registerFailure({ ip, email, reason, metadata = {}, type = "auth_failed" }) {
  const key = normalizeIp(ip);
  const now = Date.now();
  const existing = attemptsByIp.get(key);

  let windowStart = now;
  let attempts = 1;
  let blockedUntil = null;

  if (existing && now - existing.windowStart <= WINDOW_MS) {
    windowStart = existing.windowStart;
    attempts = existing.attempts + 1;
  }

  if (attempts >= MAX_ATTEMPTS) {
    blockedUntil = now + BLOCK_MS;
  }

  attemptsByIp.set(key, {
    attempts,
    windowStart,
    blockedUntil,
  });

  await logSecurityEvent({
    ip: key,
    email,
    type: blockedUntil ? "ip_blocked" : type,
    reason,
    blockedUntil: blockedUntil ? new Date(blockedUntil) : null,
    metadata: { attempts, ...metadata },
  });

  return {
    blocked: Boolean(blockedUntil),
    blockedUntil: blockedUntil ? new Date(blockedUntil) : null,
    attempts,
  };
}

function registerSuccess(ip) {
  const key = normalizeIp(ip);
  attemptsByIp.delete(key);
}

function getBlockedIpsSnapshot() {
  cleanupAttempts();
  const now = Date.now();
  const blocked = [];
  for (const [ip, data] of attemptsByIp.entries()) {
    if (data.blockedUntil && data.blockedUntil > now) {
      blocked.push({
        ip,
        blockedUntil: new Date(data.blockedUntil),
        attempts: data.attempts,
      });
    }
  }
  return blocked.sort((a, b) => b.blockedUntil - a.blockedUntil);
}

module.exports = {
  createCaptcha,
  verifyCaptcha,
  getAttemptState,
  registerFailure,
  registerSuccess,
  logSecurityEvent,
  getBlockedIpsSnapshot,
};
