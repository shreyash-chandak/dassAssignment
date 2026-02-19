import { useEffect, useState } from "react";
import Card from "../../components/Card";
import { request } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

function AdminResetRequestsPage() {
  const { token } = useAuth();
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = () => {
    request("/admin/password-reset-requests", { token })
      .then((data) => setRequests(data.requests || []))
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const processRequest = async (id, decision) => {
    setError("");
    setMessage("");
    try {
      const data = await request(`/admin/password-reset-requests/${id}`, {
        method: "PATCH",
        token,
        data: {
          decision,
          comment: `${decision} by admin`,
        },
      });
      if (data.credentials) {
        setMessage(`Approved. New password: ${data.credentials.password}`);
      } else {
        setMessage(data.message);
      }
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="container">
      <h1>Password Reset Requests</h1>
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}

      <Card>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Organizer</th>
                <th>Date</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Comment</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req._id}>
                  <td>{req.organizer?.organizerName || req.organizer?.email}</td>
                  <td>{new Date(req.createdAt).toLocaleString()}</td>
                  <td>{req.reason}</td>
                  <td>{req.status}</td>
                  <td>{req.adminComment || "-"}</td>
                  <td>
                    <div className="row">
                      <button
                        type="button"
                        className="btn"
                        disabled={req.status !== "pending"}
                        onClick={() => processRequest(req._id, "approved")}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="btn btn-light"
                        disabled={req.status !== "pending"}
                        onClick={() => processRequest(req._id, "rejected")}
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default AdminResetRequestsPage;