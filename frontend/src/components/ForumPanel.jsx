import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { API_URL, request } from "../api/client";
import Card from "./Card";

const SOCKET_URL = API_URL.replace(/\/api\/?$/, "");

function ForumPanel({ eventId, token, canPost, canModerate }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [asAnnouncement, setAsAnnouncement] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const messageMap = useMemo(() => {
    const map = new Map();
    messages.forEach((message) => map.set(message.id, message));
    return map;
  }, [messages]);

  const ordered = useMemo(() => {
    const topLevel = messages.filter((message) => !message.parentMessage);
    const replies = messages.filter((message) => message.parentMessage);
    const replyBuckets = new Map();
    replies.forEach((reply) => {
      const key = String(reply.parentMessage);
      if (!replyBuckets.has(key)) {
        replyBuckets.set(key, []);
      }
      replyBuckets.get(key).push(reply);
    });

    const out = [];
    topLevel.forEach((message) => {
      out.push({ ...message, depth: 0 });
      const children = replyBuckets.get(String(message.id)) || [];
      children.forEach((child) => out.push({ ...child, depth: 1 }));
    });
    return out;
  }, [messages]);

  const loadMessages = async () => {
    try {
      const data = await request(`/events/${eventId}/forum/messages`, { token });
      setMessages(data.messages || []);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    setMessages([]);
    setError("");
    setStatus("");
    if (!eventId || !token) {
      return;
    }
    loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, token]);

  useEffect(() => {
    if (!eventId || !token) {
      return undefined;
    }

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      socket.emit("forum:join", { eventId });
    });

    socket.on("forum:new_message", ({ message }) => {
      setMessages((prev) => {
        if (prev.some((item) => item.id === message.id)) {
          return prev;
        }
        return [...prev, message];
      });
      setStatus("New forum message received");
    });

    socket.on("forum:updated_message", ({ message }) => {
      setMessages((prev) => prev.map((row) => (row.id === message.id ? message : row)));
      setStatus("Forum updated");
    });

    socket.on("forum:reaction_update", ({ messageId, reactions }) => {
      setMessages((prev) =>
        prev.map((row) => (row.id === messageId ? { ...row, reactions } : row))
      );
    });

    return () => {
      socket.emit("forum:leave", { eventId });
      socket.disconnect();
    };
  }, [eventId, token]);

  const submitMessage = async () => {
    setError("");
    setStatus("");
    if (!text.trim()) {
      setError("Message cannot be empty");
      return;
    }

    try {
      const payload = {
        text: text.trim(),
      };
      if (replyTo) {
        payload.parentMessage = replyTo;
      }
      if (canModerate && asAnnouncement) {
        payload.isAnnouncement = true;
      }

      const response = await request(`/events/${eventId}/forum/messages`, {
        method: "POST",
        token,
        data: payload,
      });

      setMessages((prev) => [...prev, response.message]);
      setText("");
      setReplyTo(null);
      setAsAnnouncement(false);
      setStatus("Message posted");
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleReaction = async (messageId, emoji) => {
    try {
      const response = await request(`/events/${eventId}/forum/messages/${messageId}/react`, {
        method: "POST",
        token,
        data: { emoji },
      });
      setMessages((prev) =>
        prev.map((row) => (row.id === messageId ? { ...row, reactions: response.reactions } : row))
      );
    } catch (err) {
      setError(err.message);
    }
  };

  const moderateMessage = async (messageId, data) => {
    try {
      const response = await request(`/events/${eventId}/forum/messages/${messageId}`, {
        method: "PATCH",
        token,
        data,
      });
      setMessages((prev) => prev.map((row) => (row.id === messageId ? response.message : row)));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Card title="Discussion Forum">
      {status && <p className="muted">{status}</p>}
      {error && <p className="error">{error}</p>}

      {canPost ? (
        <div className="form">
          {replyTo && (
            <p className="muted">
              Replying to: {messageMap.get(replyTo)?.author?.name || "message"}{" "}
              <button type="button" className="btn btn-light" onClick={() => setReplyTo(null)}>
                Cancel Reply
              </button>
            </p>
          )}
          <textarea
            rows={3}
            value={text}
            placeholder="Write a message..."
            onChange={(e) => setText(e.target.value)}
          />
          {canModerate && (
            <label className="checkbox">
              <input
                type="checkbox"
                checked={asAnnouncement}
                onChange={(e) => setAsAnnouncement(e.target.checked)}
              />
              Post as organizer announcement
            </label>
          )}
          <button type="button" className="btn" onClick={submitMessage}>
            Post Message
          </button>
        </div>
      ) : (
        <p className="muted">Forum is available only to registered participants and event organizer.</p>
      )}

      <div className="list">
        {ordered.map((message) => (
          <article
            key={message.id}
            className="item"
            style={{
              marginLeft: message.depth ? 20 : 0,
              borderLeft: message.depth ? "3px solid #ddd" : "none",
            }}
          >
            <p>
              <strong>{message.author?.name || "Unknown"}</strong> ({message.author?.role})
              {message.isAnnouncement ? " [Announcement]" : ""}
              {message.isPinned ? " [Pinned]" : ""}
            </p>
            <p>{message.text}</p>
            <p className="muted">{new Date(message.createdAt).toLocaleString()}</p>
            <div className="row">
              {canPost && !message.isDeleted && (
                <button type="button" className="btn btn-light" onClick={() => setReplyTo(message.id)}>
                  Reply
                </button>
              )}
              {!message.isDeleted && (
                <>
                  <button type="button" className="btn btn-light" onClick={() => toggleReaction(message.id, "+1")}>
                    +1 {message.reactions?.find((r) => r.emoji === "+1")?.count || 0}
                  </button>
                  <button type="button" className="btn btn-light" onClick={() => toggleReaction(message.id, "fire")}>
                    fire {message.reactions?.find((r) => r.emoji === "fire")?.count || 0}
                  </button>
                </>
              )}
              {canModerate && (
                <>
                  <button
                    type="button"
                    className="btn btn-light"
                    onClick={() => moderateMessage(message.id, { pin: !message.isPinned })}
                  >
                    {message.isPinned ? "Unpin" : "Pin"}
                  </button>
                  {!message.isDeleted && (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => moderateMessage(message.id, { remove: true })}
                    >
                      Delete
                    </button>
                  )}
                </>
              )}
            </div>
          </article>
        ))}
        {!ordered.length && <p>No messages yet.</p>}
      </div>
    </Card>
  );
}

export default ForumPanel;
