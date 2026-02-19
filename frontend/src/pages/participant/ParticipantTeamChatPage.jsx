import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import Card from "../../components/Card";
import { API_URL, request } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

function ParticipantTeamChatPage() {
  const { token, user } = useAuth();
  const [teams, setTeams] = useState([]);
  const [activeTeamId, setActiveTeamId] = useState("");
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [typingUsers, setTypingUsers] = useState([]);
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
      if (String(message.team) === String(activeTeamId)) {
        setMessages((prev) => [...prev, message]);
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

    return () => {
      s.disconnect();
    };
  }, [socketUrl, token, activeTeamId, user?._id]);

  useEffect(() => {
    if (!activeTeamId) {
      return;
    }

    request(`/teams/${activeTeamId}/messages`, { token })
      .then((data) => setMessages(data.messages || []))
      .catch((err) => setError(err.message));

    if (socket) {
      socket.emit("team:join", { teamId: activeTeamId });
    }
  }, [activeTeamId, token, socket]);

  const sendMessage = async () => {
    if (!text.trim() || !activeTeamId) {
      return;
    }

    try {
      await request(`/teams/${activeTeamId}/messages`, {
        method: "POST",
        token,
        data: { text },
      });
      setText("");
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
                {team.name} ({team.event?.name || "Event"})
              </button>
            ))}
            {!teams.length && <p>No teams joined yet.</p>}
          </div>
        </Card>

        <Card title="Messages">
          <div className="chat-box">
            {messages.map((msg) => (
              <article className="chat-message" key={msg._id}>
                <strong>{msg.sender?.firstName || msg.sender?.email || "Member"}</strong>
                <p>{msg.text}</p>
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
          <button type="button" className="btn" onClick={sendMessage}>
            Send
          </button>
        </Card>
      </div>
    </div>
  );
}

export default ParticipantTeamChatPage;
