const crypto = require("crypto");

function getConfig() {
  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.PUSHER_CLUSTER;

  if (!appId || !key || !secret || !cluster) {
    throw new Error("Faltan PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET o PUSHER_CLUSTER.");
  }

  return { appId, key, secret, cluster };
}

function hmac(secret, value) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function queryString(params) {
  return Object.keys(params)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join("&");
}

async function pusherRequest(path, method, body = null) {
  const { appId, key, secret, cluster } = getConfig();
  const rawBody = body ? JSON.stringify(body) : "";
  const authTimestamp = Math.floor(Date.now() / 1000);
  const params = {
    auth_key: key,
    auth_timestamp: authTimestamp,
    auth_version: "1.0",
    body_md5: crypto.createHash("md5").update(rawBody).digest("hex")
  };

  const canonical = `${method}\n${path}\n${queryString(params)}`;
  params.auth_signature = hmac(secret, canonical);

  const url = `https://api-${cluster}.pusher.com${path}?${queryString(params)}`;
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: rawBody || undefined
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Pusher ${response.status}: ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : {};
}

async function trigger(channel, event, data) {
  if (!channel || !event) throw new Error("Canal y evento son obligatorios.");

  // Pusher Channels HTTP API no admite ":" en nombres de eventos.
  const safeEvent = String(event).replace(/[^A-Za-z0-9_-]/g, "-");

  return pusherRequest(`/apps/${getConfig().appId}/events`, "POST", {
    name: safeEvent,
    channels: [channel],
    data: JSON.stringify(data || {})
  });
}

function authenticate(socketId, channelName) {
  const { key, secret } = getConfig();
  const stringToSign = `${socketId}:${channelName}`;
  return {
    auth: `${key}:${hmac(secret, stringToSign)}`
  };
}

function channelForUser(userId) {
  return `private-user-${String(userId)}`;
}

module.exports = { getConfig, trigger, authenticate, channelForUser };


