import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../../components/Card";
import { request } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

function ParticipantOnboardingPage() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [interestsInput, setInterestsInput] = useState("");
  const [organizers, setOrganizers] = useState([]);
  const [selectedOrganizers, setSelectedOrganizers] = useState([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    request("/clubs", { token })
      .then((data) => setOrganizers(data.organizers || []))
      .catch((err) => setError(err.message));
  }, [token]);

  const toggleOrganizer = (organizerId) => {
    setSelectedOrganizers((prev) =>
      prev.includes(organizerId) ? prev.filter((id) => id !== organizerId) : [...prev, organizerId]
    );
  };

  const savePreferences = async () => {
    setError("");
    setStatus("");

    try {
      const interests = interestsInput
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      await request("/participants/onboarding", {
        method: "PUT",
        token,
        data: {
          interests,
          followedOrganizers: selectedOrganizers,
        },
      });

      setStatus("Preferences saved");
      navigate("/participant/dashboard");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="container">
      <h1>Participant Onboarding</h1>
      <p className="muted">Set preferences now or skip and configure later in Profile.</p>
      {status && <p className="success">{status}</p>}
      {error && <p className="error">{error}</p>}

      <Card title="Areas of Interest">
        <label>
          Interests (comma separated)
          <input
            value={interestsInput}
            onChange={(e) => setInterestsInput(e.target.value)}
            placeholder="coding, design, robotics"
          />
        </label>
      </Card>

      <Card title="Clubs / Organizers to Follow">
        <div className="list">
          {organizers.map((organizer) => (
            <label key={organizer._id} className="checkbox">
              <input
                type="checkbox"
                checked={selectedOrganizers.includes(organizer._id)}
                onChange={() => toggleOrganizer(organizer._id)}
              />
              {organizer.organizerName} ({organizer.category})
            </label>
          ))}
          {!organizers.length && <p>No organizers available right now.</p>}
        </div>
      </Card>

      <div className="row">
        <button className="btn" type="button" onClick={savePreferences}>
          Save and Continue
        </button>
        <button className="btn btn-light" type="button" onClick={() => navigate("/participant/dashboard")}>
          Skip
        </button>
      </div>
    </div>
  );
}

export default ParticipantOnboardingPage;
