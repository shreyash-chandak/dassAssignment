import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = () => {
    logout();
    navigate("/login");
  };

  const participantLinks = [
    { to: "/participant/dashboard", label: "Dashboard" },
    { to: "/participant/events", label: "Browse Events" },
    { to: "/participant/clubs", label: "Clubs/Organizers" },
    { to: "/participant/team-chat", label: "Team Chat" },
    { to: "/participant/profile", label: "Profile" },
  ];

  const organizerLinks = [
    { to: "/organizer/dashboard", label: "Dashboard" },
    { to: "/organizer/create-event", label: "Create Event" },
    { to: "/organizer/ongoing", label: "Ongoing Events" },
    { to: "/organizer/profile", label: "Profile" },
  ];

  const adminLinks = [
    { to: "/admin/dashboard", label: "Dashboard" },
    { to: "/admin/organizers", label: "Manage Clubs/Organizers" },
    { to: "/admin/reset-requests", label: "Password Reset Requests" },
  ];

  const links = user
    ? user.role === "participant"
      ? participantLinks
      : user.role === "organizer"
      ? organizerLinks
      : adminLinks
    : [];

  return (
    <header className="topbar">
      <div className="container topbar-inner">
        <Link to={user ? `/${user.role}/dashboard` : "/"} className="brand">
          Felicity EMS
        </Link>
        <nav className="nav">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} className="nav-link">
              {link.label}
            </NavLink>
          ))}
          {user && (
            <button type="button" className="btn btn-light" onClick={onLogout}>
              Logout
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}

export default Navbar;
