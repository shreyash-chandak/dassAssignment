import { useEffect, useState } from "react";
import { request } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import Card from "../../components/Card";

function ParticipantProfilePage() {
  const { token, user, setUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [passwordForm, setPasswordForm] = useState({ oldPassword: "", newPassword: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = () => {
    request("/participants/profile", { token })
      .then((data) => setProfile(data.user))
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const onProfileChange = (e) => {
    const { name, value } = e.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
  };

  const onPreferencesChange = (field, value) => {
    setProfile((prev) => ({
      ...prev,
      [field]: value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    }));
  };

  const saveProfile = async () => {
    setError("");
    setMessage("");
    try {
      const data = await request("/participants/profile", {
        method: "PUT",
        token,
        data: {
          firstName: profile.firstName,
          lastName: profile.lastName,
          contactNumber: profile.contactNumber,
          collegeOrOrg: profile.collegeOrOrg,
          interests: profile.interests || [],
          followedOrganizers: (profile.followedOrganizers || []).map((org) => org._id || org),
        },
      });
      setProfile(data.user);
      setUser(data.user);
      setMessage("Profile saved");
    } catch (err) {
      setError(err.message);
    }
  };

  const changePassword = async () => {
    setError("");
    setMessage("");
    try {
      await request("/auth/change-password", {
        method: "POST",
        token,
        data: passwordForm,
      });
      setPasswordForm({ oldPassword: "", newPassword: "" });
      setMessage("Password updated");
    } catch (err) {
      setError(err.message);
    }
  };

  if (!profile) {
    return <div className="container">Loading profile...</div>;
  }

  return (
    <div className="container">
      <h1>Profile</h1>
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}

      <Card title="Editable Fields">
        <div className="grid two">
          <label>
            First Name
            <input name="firstName" value={profile.firstName || ""} onChange={onProfileChange} />
          </label>
          <label>
            Last Name
            <input name="lastName" value={profile.lastName || ""} onChange={onProfileChange} />
          </label>
          <label>
            Contact Number
            <input name="contactNumber" value={profile.contactNumber || ""} onChange={onProfileChange} />
          </label>
          <label>
            College / Organization
            <input name="collegeOrOrg" value={profile.collegeOrOrg || ""} onChange={onProfileChange} />
          </label>
          <label>
            Interests (comma separated)
            <input
              value={(profile.interests || []).join(", ")}
              onChange={(e) => onPreferencesChange("interests", e.target.value)}
            />
          </label>
          <label>
            Followed Clubs (read-only IDs)
            <input value={(profile.followedOrganizers || []).map((org) => org.organizerName || org).join(", ")} readOnly />
          </label>
        </div>
        <button className="btn" type="button" onClick={saveProfile}>
          Save Profile
        </button>
      </Card>

      <Card title="Non-Editable Fields">
        <p>Email: {user?.email}</p>
        <p>Participant Type: {user?.participantType}</p>
      </Card>

      <Card title="Security Settings">
        <div className="grid two">
          <label>
            Old Password
            <input
              type="password"
              value={passwordForm.oldPassword}
              onChange={(e) => setPasswordForm((prev) => ({ ...prev, oldPassword: e.target.value }))}
            />
          </label>
          <label>
            New Password
            <input
              type="password"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
            />
          </label>
        </div>
        <button className="btn btn-light" type="button" onClick={changePassword}>
          Change Password
        </button>
      </Card>
    </div>
  );
}

export default ParticipantProfilePage;