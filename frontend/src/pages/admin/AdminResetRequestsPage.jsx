import { useEffect, useState } from "react";
import Card from "../../components/Card";
import { request } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

function AdminResetRequestsPage() {
  const { token } = useAuth();
  const [requests, setRequests] = useState([]);
  const [commentById, setCommentById] = useState({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = () => {
    request("/admin/password-reset-requests", { token })
      .then((data) => setRequests(data.requests || []))
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const resolveRequest = async (id, action) => {
    setError("");
    setMessage("");
    try {
      const response = await request(`/admin/password-reset-requests/${id}`, {
        method: "PATCH",
        token,
        data: {
          action,
          comment: commentById[id] || "",
        },
      });
      if (response.generatedPassword) {
        setMessage(`Request approved. Generated password: ${response.generatedPassword}`);
      } else {
        setMessage(response.message || "Request updated");
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
                <th>Email</th>
                <th>Date</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Admin Comment</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req._id}>
                  <td>{req.organizer?.organizerName || "-"}</td>
                  <td>{req.organizer?.email || "-"}</td>
                  <td>{new Date(req.createdAt).toLocaleString()}</td>
                  <td>{req.reason || "-"}</td>
                  <td>{req.status || "-"}</td>
                  <td>
                    {req.status === "pending" ? (
                      <input
                        value={commentById[req._id] || ""}
                        onChange={(e) => setCommentById((prev) => ({ ...prev, [req._id]: e.target.value }))}
                        placeholder="Comment"
                      />
                    ) : (
                      req.adminComment || "-"
                    )}
                  </td>
                  <td>
                    {req.status === "pending" ? (
                      <div className="row">
                        <button type="button" className="btn" onClick={() => resolveRequest(req._id, "approve")}>
                          Approve
                        </button>
                        <button type="button" className="btn btn-light" onClick={() => resolveRequest(req._id, "reject")}>
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span>-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!requests.length && <p>No reset requests.</p>}
        </div>
      </Card>
    </div>
  );
}

export default AdminResetRequestsPage;
