import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { request } from "../api/client";

function RegisterPage() {
  const { registerParticipant } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    participantType: "iiit",
    collegeOrOrg: "",
    contactNumber: "",
    captchaAnswer: "",
  });
  const [captcha, setCaptcha] = useState({ captchaId: "", challenge: "" });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchCaptcha = () => {
    request("/security/captcha")
      .then((data) => setCaptcha({ captchaId: data.captchaId, challenge: data.challenge }))
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    fetchCaptcha();
  }, []);

  const onChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await registerParticipant({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        password: form.password,
        participantType: form.participantType,
        collegeOrOrg: form.collegeOrOrg,
        contactNumber: form.contactNumber,
        captchaId: captcha.captchaId,
        captchaAnswer: form.captchaAnswer,
      });
      navigate("/participant/onboarding");
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
      <h1>Participant Registration</h1>
      <form className="form" onSubmit={onSubmit}>
        <label>
          First Name
          <input name="firstName" value={form.firstName} onChange={onChange} required />
        </label>
        <label>
          Last Name
          <input name="lastName" value={form.lastName} onChange={onChange} required />
        </label>
        <label>
          Email
          <input name="email" type="email" value={form.email} onChange={onChange} required />
        </label>
        <label>
          Password
          <input name="password" type="password" value={form.password} onChange={onChange} required />
        </label>
        <label>
          Participant Type
          <select name="participantType" value={form.participantType} onChange={onChange}>
            <option value="iiit">IIIT</option>
            <option value="non-iiit">Non-IIIT</option>
          </select>
        </label>
        <label>
          College / Organization
          <input name="collegeOrOrg" value={form.collegeOrOrg} onChange={onChange} />
        </label>
        <label>
          Contact Number
          <input name="contactNumber" value={form.contactNumber} onChange={onChange} />
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
          {loading ? "Creating account..." : "Register"}
        </button>
      </form>
    </div>
  );
}

export default RegisterPage;
