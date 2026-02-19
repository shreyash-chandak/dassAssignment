import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../../components/Card";
import { useAuth } from "../../context/AuthContext";
import { request } from "../../api/client";

function ParticipantClubsPage() {
  const { token } = useAuth();
  const [organizers, setOrganizers] = useState([]);
  const [error, setError] = useState("");

  const load = () => {
    request("/clubs", { token })
      .then((data) => setOrganizers(data.organizers || []))
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const toggleFollow = async (organizer) => {
    try {
      if (organizer.isFollowed) {
        await request(`/participants/follow/${organizer._id}`, {
          method: "DELETE",
          token,
        });
      } else {
        await request(`/participants/follow/${organizer._id}`, {
          method: "POST",
          token,
        });
      }
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="container">
      <h1>Clubs / Organizers</h1>
      {error && <p className="error">{error}</p>}
      <Card>
        <div className="list">
          {organizers.map((org) => (
            <article className="item" key={org._id}>
              <h4>{org.organizerName}</h4>
              <p>{org.category}</p>
              <p>{org.description}</p>
              <div className="row">
                <Link className="btn btn-light" to={`/participant/clubs/${org._id}`}>
                  View Details
                </Link>
                <button type="button" className="btn" onClick={() => toggleFollow(org)}>
                  {org.isFollowed ? "Unfollow" : "Follow"}
                </button>
              </div>
            </article>
          ))}
          {!organizers.length && <p>No organizers available.</p>}
        </div>
      </Card>
    </div>
  );
}

export default ParticipantClubsPage;