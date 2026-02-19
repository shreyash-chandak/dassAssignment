import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await login(form.email, form.password);
      navigate(data.redirectTo || `/${data.user.role}/dashboard`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container narrow">
      <h1>Login</h1>
      <form className="form" onSubmit={onSubmit}>
        <label>
          Email
          <input name="email" value={form.email} onChange={onChange} required />
        </label>
        <label>
          Password
          <input type="password" name="password" value={form.password} onChange={onChange} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>
      <p>
        Participant? <Link to="/register">Create account</Link>
      </p>
    </div>
  );
}

export default LoginPage;