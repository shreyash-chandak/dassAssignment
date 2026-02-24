import { useEffect, useState } from "react";
import Card from "../../components/Card";
import { request } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

const initialForm = {
  organizerName: "",
  category: "",
  description: "",
  contactEmail: "",
  contactNumber: "",
  email: "",
  password: "",
};

function AdminOrganizersPage() {
  const { token } = useAuth();
  const [organizers, setOrganizers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [credentials, setCredentials] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = () => {
    request("/admin/organizers", { token })
      .then((data) => setOrganizers(data.organizers || []))
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const onChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const createOrganizer = async () => {
    setError("");
    setMessage("");
    setCredentials(null);
    try {
      const data = await request("/admin/organizers", {
        method: "POST",
        token,
        data: form,
      });
      setMessage(data.message);
      setCredentials(data.credentials);
      setForm(initialForm);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleStatus = async (organizer) => {
    try {
      await request(`/admin/organizers/${organizer._id}/status`, {
        method: "PATCH",
        token,
        data: { isActive: !organizer.isActive },
      });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const removeOrganizer = async (organizerId, permanent = false) => {
    try {
      await request(`/admin/organizers/${organizerId}?permanent=${permanent}`, {
        method: "DELETE",
        token,
      });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="container">
      <h1>Manage Clubs / Organizers</h1>
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}

      <Card title="Add New Club/Organizer">
        <div className="grid two">
          <label>
            Organizer Name
            <input name="organizerName" value={form.organizerName} onChange={onChange} />
          </label>
          <label>
            Category
            <input name="category" value={form.category} onChange={onChange} />
          </label>
          <label>
            Description
            <textarea name="description" value={form.description} onChange={onChange} rows={3} />
          </label>
          <label>
            Contact Email
            <input name="contactEmail" value={form.contactEmail} onChange={onChange} />
          </label>
          <label>
            Contact Number
            <input name="contactNumber" value={form.contactNumber} onChange={onChange} />
          </label>
          <label>
            Login Email
            <input name="email" value={form.email} onChange={onChange} />
          </label>
          <label>
            Login Password
            <input name="password" type="text" value={form.password} onChange={onChange} />
          </label>
        </div>
        <button className="btn" type="button" onClick={createOrganizer}>
          Create Organizer
        </button>
        {credentials && (
          <p className="muted">
            Generated credentials: {credentials.email} / {credentials.password}
          </p>
        )}
      </Card>

      <Card title="Organizer Accounts">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Email</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {organizers.map((org) => (
                <tr key={org._id}>
                  <td>{org.organizerName}</td>
                  <td>{org.category}</td>
                  <td>{org.email}</td>
                  <td>{org.isActive ? "Active" : "Disabled"}</td>
                  <td>
                    <div className="row">
                      <button type="button" className="btn btn-light" onClick={() => toggleStatus(org)}>
                        {org.isActive ? "Disable" : "Enable"}
                      </button>
                      <button type="button" className="btn btn-light" onClick={() => removeOrganizer(org._id)}>
                        Archive
                      </button>
                      <button type="button" className="btn" onClick={() => removeOrganizer(org._id, true)}>
                        Delete
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

export default AdminOrganizersPage;
