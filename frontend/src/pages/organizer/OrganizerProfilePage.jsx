import { useEffect, useState } from "react";
import Card from "../../components/Card";
import { request } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

function OrganizerProfilePage() {
  const { token, setUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [resetReason, setResetReason] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    request("/organizer/profile", { token })
      .then((data) => setProfile(data.user))
      .catch((err) => setError(err.message));
  }, [token]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
  };

  const save = async () => {
    setError("");
    setMessage("");
    try {
      const data = await request("/organizer/profile", {
        method: "PUT",
        token,
        data: {
          organizerName: profile.organizerName,
          category: profile.category,
          description: profile.description,
          contactEmail: profile.contactEmail,
          contactNumber: profile.contactNumber,
          discordWebhook: profile.discordWebhook,
        },
      });
      setProfile(data.user);
      setUser(data.user);
      setMessage("Profile updated");
    } catch (err) {
      setError(err.message);
    }
  };

  const requestReset = async () => {
    setError("");
    setMessage("");
    try {
      await request("/organizer/password-reset-request", {
        method: "POST",
        token,
        data: { reason: resetReason },
      });
      setResetReason("");
      setMessage("Password reset request submitted to admin");
    } catch (err) {
      setError(err.message);
    }
  };

  if (!profile) {
    return <div className="container">Loading profile...</div>;
  }

  return (
    <div className="container">
      <h1>Organizer Profile</h1>
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}

      <Card title="Profile Settings">
        <div className="grid two">
          <label>
            Organizer Name
            <input name="organizerName" value={profile.organizerName || ""} onChange={onChange} />
          </label>
          <label>
            Category
            <input name="category" value={profile.category || ""} onChange={onChange} />
          </label>
          <label>
            Description
            <textarea name="description" value={profile.description || ""} onChange={onChange} rows={3} />
          </label>
          <label>
            Contact Email
            <input name="contactEmail" value={profile.contactEmail || ""} onChange={onChange} />
          </label>
          <label>
            Contact Number
            <input name="contactNumber" value={profile.contactNumber || ""} onChange={onChange} />
          </label>
          <label>
            Discord Webhook
            <input name="discordWebhook" value={profile.discordWebhook || ""} onChange={onChange} />
          </label>
        </div>
        <button className="btn" type="button" onClick={save}>
          Save Profile
        </button>
      </Card>

      <Card title="Password Reset Request">
        <label>
          Reason
          <textarea value={resetReason} onChange={(e) => setResetReason(e.target.value)} rows={3} />
        </label>
        <button className="btn btn-light" type="button" onClick={requestReset}>
          Submit Reset Request
        </button>
      </Card>
    </div>
  );
}

export default OrganizerProfilePage;