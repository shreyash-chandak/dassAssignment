import { useMemo, useState } from "react";
import { request } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import Card from "../../components/Card";

const initialForm = {
  name: "",
  description: "",
  eventType: "normal",
  eligibility: "all",
  registrationDeadline: "",
  startDate: "",
  endDate: "",
  registrationLimit: 100,
  registrationFee: 0,
  tags: "",
  purchaseLimitPerParticipant: 1,
  paymentApprovalRequired: false,
  teamEnabled: false,
  teamSize: 1,
};

function OrganizerCreateEventPage() {
  const { token } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [customFields, setCustomFields] = useState([]);
  const [merchItems, setMerchItems] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const onChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const addCustomField = () => {
    setCustomFields((prev) => [
      ...prev,
      { id: `field_${Date.now()}`, label: "", type: "text", required: false, options: "", order: prev.length },
    ]);
  };

  const addMerchItem = () => {
    setMerchItems((prev) => [...prev, { name: "", size: "", color: "", variant: "", stock: 0, price: 0 }]);
  };

  const customFieldView = useMemo(
    () =>
      customFields.map((field, idx) => ({
        ...field,
        options: field.options
          ? field.options
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean)
          : [],
      })),
    [customFields]
  );

  const createDraft = async () => {
    setError("");
    setMessage("");
    try {
      const payload = {
        name: form.name,
        description: form.description,
        eventType: form.eventType,
        eligibility: form.eligibility,
        registrationDeadline: form.registrationDeadline,
        startDate: form.startDate,
        endDate: form.endDate,
        registrationLimit: Number(form.registrationLimit),
        registrationFee: Number(form.registrationFee),
        tags: form.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        customFormFields: form.eventType === "normal" ? customFieldView : [],
        merchandiseItems: form.eventType === "merchandise" ? merchItems : [],
        purchaseLimitPerParticipant: Number(form.purchaseLimitPerParticipant),
        paymentApprovalRequired: Boolean(form.paymentApprovalRequired),
        teamConfig: {
          enabled: Boolean(form.teamEnabled),
          maxMembers: Number(form.teamSize),
          inviteMode: "code",
        },
      };

      const data = await request("/organizer/events", {
        method: "POST",
        token,
        data: payload,
      });

      setMessage(`Draft created: ${data.event.name}`);
      setForm(initialForm);
      setCustomFields([]);
      setMerchItems([]);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="container">
      <h1>Create Event</h1>
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}

      <Card title="Event Basics">
        <div className="grid two">
          <label>
            Name
            <input name="name" value={form.name} onChange={onChange} />
          </label>
          <label>
            Event Type
            <select name="eventType" value={form.eventType} onChange={onChange}>
              <option value="normal">Normal</option>
              <option value="merchandise">Merchandise</option>
            </select>
          </label>
          <label>
            Description
            <textarea name="description" value={form.description} onChange={onChange} rows={3} />
          </label>
          <label>
            Eligibility
            <input name="eligibility" value={form.eligibility} onChange={onChange} />
          </label>
          <label>
            Registration Deadline
            <input type="datetime-local" name="registrationDeadline" value={form.registrationDeadline} onChange={onChange} />
          </label>
          <label>
            Start Date
            <input type="datetime-local" name="startDate" value={form.startDate} onChange={onChange} />
          </label>
          <label>
            End Date
            <input type="datetime-local" name="endDate" value={form.endDate} onChange={onChange} />
          </label>
          <label>
            Registration Limit
            <input type="number" name="registrationLimit" value={form.registrationLimit} onChange={onChange} />
          </label>
          <label>
            Registration Fee
            <input type="number" name="registrationFee" value={form.registrationFee} onChange={onChange} />
          </label>
          <label>
            Tags (comma separated)
            <input name="tags" value={form.tags} onChange={onChange} />
          </label>
        </div>
      </Card>

      <Card title="Team Registration (Hackathon Feature)">
        <label className="checkbox">
          <input type="checkbox" name="teamEnabled" checked={form.teamEnabled} onChange={onChange} />
          Enable team registration
        </label>
        <label>
          Team Size
          <input type="number" min="1" name="teamSize" value={form.teamSize} onChange={onChange} />
        </label>
      </Card>

      {form.eventType === "normal" && (
        <Card title="Dynamic Form Builder">
          <button className="btn btn-light" type="button" onClick={addCustomField}>
            Add Field
          </button>
          {(customFields || []).map((field, idx) => (
            <div key={field.id} className="item compact">
              <input
                placeholder="Label"
                value={field.label}
                onChange={(e) =>
                  setCustomFields((prev) =>
                    prev.map((f, i) => (i === idx ? { ...f, label: e.target.value } : f))
                  )
                }
              />
              <select
                value={field.type}
                onChange={(e) =>
                  setCustomFields((prev) =>
                    prev.map((f, i) => (i === idx ? { ...f, type: e.target.value } : f))
                  )
                }
              >
                <option value="text">Text</option>
                <option value="textarea">Textarea</option>
                <option value="number">Number</option>
                <option value="dropdown">Dropdown</option>
                <option value="checkbox">Checkbox</option>
                <option value="file">File</option>
              </select>
              <input
                placeholder="Options (comma separated)"
                value={field.options}
                onChange={(e) =>
                  setCustomFields((prev) =>
                    prev.map((f, i) => (i === idx ? { ...f, options: e.target.value } : f))
                  )
                }
              />
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) =>
                    setCustomFields((prev) =>
                      prev.map((f, i) => (i === idx ? { ...f, required: e.target.checked } : f))
                    )
                  }
                />
                Required
              </label>
            </div>
          ))}
        </Card>
      )}

      {form.eventType === "merchandise" && (
        <Card title="Merchandise Items">
          <label className="checkbox">
            <input
              type="checkbox"
              name="paymentApprovalRequired"
              checked={form.paymentApprovalRequired}
              onChange={onChange}
            />
            Enable payment approval workflow
          </label>
          <label>
            Purchase Limit Per Participant
            <input
              type="number"
              min="1"
              name="purchaseLimitPerParticipant"
              value={form.purchaseLimitPerParticipant}
              onChange={onChange}
            />
          </label>
          <button className="btn btn-light" type="button" onClick={addMerchItem}>
            Add Merchandise Item
          </button>
          {merchItems.map((item, idx) => (
            <div key={`merch-${idx}`} className="grid two">
              <input
                placeholder="Name"
                value={item.name}
                onChange={(e) =>
                  setMerchItems((prev) => prev.map((m, i) => (i === idx ? { ...m, name: e.target.value } : m)))
                }
              />
              <input
                placeholder="Variant"
                value={item.variant}
                onChange={(e) =>
                  setMerchItems((prev) => prev.map((m, i) => (i === idx ? { ...m, variant: e.target.value } : m)))
                }
              />
              <input
                placeholder="Size"
                value={item.size}
                onChange={(e) =>
                  setMerchItems((prev) => prev.map((m, i) => (i === idx ? { ...m, size: e.target.value } : m)))
                }
              />
              <input
                placeholder="Color"
                value={item.color}
                onChange={(e) =>
                  setMerchItems((prev) => prev.map((m, i) => (i === idx ? { ...m, color: e.target.value } : m)))
                }
              />
              <input
                placeholder="Stock"
                type="number"
                value={item.stock}
                onChange={(e) =>
                  setMerchItems((prev) =>
                    prev.map((m, i) => (i === idx ? { ...m, stock: Number(e.target.value) } : m))
                  )
                }
              />
              <input
                placeholder="Price"
                type="number"
                value={item.price}
                onChange={(e) =>
                  setMerchItems((prev) =>
                    prev.map((m, i) => (i === idx ? { ...m, price: Number(e.target.value) } : m))
                  )
                }
              />
            </div>
          ))}
        </Card>
      )}

      <button className="btn" type="button" onClick={createDraft}>
        Create Draft
      </button>
    </div>
  );
}

export default OrganizerCreateEventPage;