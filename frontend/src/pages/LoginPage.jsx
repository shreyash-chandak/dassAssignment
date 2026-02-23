import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { request } from "../api/client";

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: "", password: "", captchaAnswer: "" });
  const [captcha, setCaptcha] = useState({ captchaId: "", challenge: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchCaptcha = () => {
    request("/security/captcha")
      .then((data) => {
        setCaptcha({ captchaId: data.captchaId, challenge: data.challenge });
      })
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    fetchCaptcha();
  }, []);

  const onChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const payload = {
        email: form.email,
        password: form.password,
        captchaId: captcha.captchaId,
        captchaAnswer: form.captchaAnswer,
      };
      const data = await login(payload);
      navigate(data.redirectTo || `/${data.user.role}/dashboard`);
    } catch (err) {
      setError(err.message);
      fetchCaptcha();
      setForm((prev) => ({ ...prev, captchaAnswer: "" }));
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
        <label>
          CAPTCHA: {captcha.challenge || "Loading..."}
          <input name="captchaAnswer" value={form.captchaAnswer} onChange={onChange} required />
        </label>
        <button type="button" className="btn btn-light" onClick={fetchCaptcha}>
          Refresh CAPTCHA
        </button>
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
