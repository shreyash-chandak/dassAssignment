import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import Card from "../../components/Card";
import { API_URL, request } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

function ParticipantTeamChatPage() {
  const { token, user } = useAuth();
  const [teams, setTeams] = useState([]);
  const [activeTeamId, setActiveTeamId] = useState("");
  const [activeTeam, setActiveTeam] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [typingUsers, setTypingUsers] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [unreadByTeam, setUnreadByTeam] = useState({});
  const [error, setError] = useState("");

  const socketUrl = useMemo(() => API_URL.replace(/\/api$/, ""), []);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    request("/teams/my", { token })
      .then((data) => {
        setTeams(data.teams || []);
        if (data.teams?.length) {
          setActiveTeamId(data.teams[0]._id);
        }
      })
      .catch((err) => setError(err.message));
  }, [token]);

  useEffect(() => {
    const s = io(socketUrl, {
      auth: { token },
    });
    setSocket(s);

    s.on("team:new-message", (message) => {
      const messageTeamId = String(message.team?._id || message.team || "");
      if (!messageTeamId) {
        return;
      }

      if (messageTeamId === String(activeTeamId)) {
        setMessages((prev) => [...prev, message]);
      } else {
        setUnreadByTeam((prev) => ({
          ...prev,
          [messageTeamId]: (prev[messageTeamId] || 0) + 1,
        }));
      }
    });

    s.on("team:typing", (payload) => {
      if (payload.userId === user?._id) {
        return;
      }
      setTypingUsers((prev) => {
        if (payload.isTyping) {
          return Array.from(new Set([...prev, payload.userId]));
        }
        return prev.filter((id) => id !== payload.userId);
      });
    });

    s.on("team:presence", (payload) => {
      if (!payload.userId) {
        return;
      }
      setOnlineUsers((prev) => Array.from(new Set([...prev, payload.userId])));
    });

    s.on("presence:update", (payload) => {
      if (!payload?.userId) {
        return;
      }
      setOnlineUsers((prev) => {
        if (payload.online) {
          return Array.from(new Set([...prev, payload.userId]));
        }
        return prev.filter((id) => id !== payload.userId);
      });
    });

    return () => {
      s.disconnect();
    };
  }, [socketUrl, token, activeTeamId, user?._id]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    teams.forEach((team) => {
      socket.emit("team:join", { teamId: team._id });
    });
  }, [socket, teams]);

  useEffect(() => {
    if (!activeTeamId) {
      return;
    }

    request(`/teams/${activeTeamId}/messages`, { token })
      .then((data) => setMessages(data.messages || []))
      .catch((err) => setError(err.message));

    request(`/teams/${activeTeamId}`, { token })
      .then((data) => {
        setActiveTeam(data.team);
        const acceptedMembers = (data.team?.members || [])
          .filter((member) => member.status === "accepted")
          .map((member) => String(member.participant?._id || member.participant));
        setOnlineUsers((prev) => Array.from(new Set([...prev, ...acceptedMembers])));
      })
      .catch((err) => setError(err.message));

    if (socket) {
      socket.emit("team:join", { teamId: activeTeamId });
    }

    setUnreadByTeam((prev) => {
      if (!prev[activeTeamId]) {
        return prev;
      }
      const next = { ...prev };
      delete next[activeTeamId];
      return next;
    });
  }, [activeTeamId, token, socket]);

  const sendMessage = async () => {
    const trimmedText = text.trim();
    const trimmedAttachmentUrl = attachmentUrl.trim();

    if (!activeTeamId) {
      return;
    }

    if (!trimmedText && !attachmentFile && !trimmedAttachmentUrl) {
      return;
    }

    try {
      const hasFile = Boolean(attachmentFile);
      if (hasFile) {
        const formData = new FormData();
        formData.append("text", trimmedText);
        if (trimmedAttachmentUrl) {
          formData.append("attachmentUrl", trimmedAttachmentUrl);
        }
        formData.append("attachment", attachmentFile);
        await request(`/teams/${activeTeamId}/messages`, {
          method: "POST",
          token,
          data: formData,
          isForm: true,
        });
      } else {
        await request(`/teams/${activeTeamId}/messages`, {
          method: "POST",
          token,
          data: { text: trimmedText, attachmentUrl: trimmedAttachmentUrl },
        });
      }
      setText("");
      setAttachmentUrl("");
      setAttachmentFile(null);
      socket?.emit("team:typing", { teamId: activeTeamId, isTyping: false });
    } catch (err) {
      setError(err.message);
    }
  };

  const onTyping = (value) => {
    setText(value);
    socket?.emit("team:typing", { teamId: activeTeamId, isTyping: Boolean(value.trim()) });
  };

  return (
    <div className="container">
      <h1>Team Chat</h1>
      {error && <p className="error">{error}</p>}

      <div className="grid two">
        <Card title="My Teams">
          <div className="list">
            {teams.map((team) => (
              <button
                key={team._id}
                type="button"
                className={activeTeamId === team._id ? "btn" : "btn btn-light"}
                onClick={() => setActiveTeamId(team._id)}
              >
                {team.name} ({team.event?.name || "Event"}){unreadByTeam[team._id] ? ` [${unreadByTeam[team._id]} new]` : ""}
              </button>
            ))}
            {!teams.length && <p>No teams joined yet.</p>}
          </div>
        </Card>

        <Card title="Messages">
          {activeTeam && (
            <p className="muted">
              Members online: {(activeTeam.members || []).filter((member) => onlineUsers.includes(String(member.participant?._id || member.participant))).length}
              /{(activeTeam.members || []).filter((member) => member.status === "accepted").length}
            </p>
          )}
          <div className="chat-box">
            {messages.map((msg) => (
              <article className="chat-message" key={msg._id}>
                <strong>{msg.sender?.firstName || msg.sender?.email || "Member"}</strong>
                <p>{msg.text}</p>
                {msg.attachmentUrl && (
                  <p>
                    Attachment: <a href={msg.attachmentUrl} target="_blank" rel="noreferrer">{msg.attachmentUrl}</a>
                  </p>
                )}
                <small>{new Date(msg.createdAt).toLocaleTimeString()}</small>
              </article>
            ))}
            {!messages.length && <p>No messages yet.</p>}
          </div>
          {typingUsers.length > 0 && <p className="muted">Someone is typing...</p>}
          <label>
            Message
            <textarea value={text} onChange={(e) => onTyping(e.target.value)} rows={3} />
          </label>
          <label>
            Link / File URL (optional)
            <input value={attachmentUrl} onChange={(e) => setAttachmentUrl(e.target.value)} placeholder="https://..." />
          </label>
          <label>
            Upload File (optional)
            <input type="file" onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)} />
          </label>
          <button type="button" className="btn" onClick={sendMessage}>
            Send
          </button>
        </Card>
      </div>
    </div>
  );
}

export default ParticipantTeamChatPage;
