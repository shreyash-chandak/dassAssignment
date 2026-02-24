import { Navigate, Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./context/AuthContext";

import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import NotFoundPage from "./pages/NotFoundPage";
import TicketPage from "./pages/TicketPage";

import ParticipantDashboardPage from "./pages/participant/ParticipantDashboardPage";
import ParticipantBrowseEventsPage from "./pages/participant/ParticipantBrowseEventsPage";
import ParticipantEventDetailsPage from "./pages/participant/ParticipantEventDetailsPage";
import ParticipantClubsPage from "./pages/participant/ParticipantClubsPage";
import ParticipantClubDetailPage from "./pages/participant/ParticipantClubDetailPage";
import ParticipantProfilePage from "./pages/participant/ParticipantProfilePage";
import ParticipantOnboardingPage from "./pages/participant/ParticipantOnboardingPage";

import OrganizerDashboardPage from "./pages/organizer/OrganizerDashboardPage";
import OrganizerCreateEventPage from "./pages/organizer/OrganizerCreateEventPage";
import OrganizerEventDetailPage from "./pages/organizer/OrganizerEventDetailPage";
import OrganizerProfilePage from "./pages/organizer/OrganizerProfilePage";
import OrganizerOngoingEventsPage from "./pages/organizer/OrganizerOngoingEventsPage";

import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import AdminOrganizersPage from "./pages/admin/AdminOrganizersPage";
import AdminResetRequestsPage from "./pages/admin/AdminResetRequestsPage";

function HomeRedirect() {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to={`/${user.role}/dashboard`} replace />;
}

function App() {
  return (
    <div>
      <Navbar />
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route
          path="/participant/dashboard"
          element={
            <ProtectedRoute roles={["participant"]}>
              <ParticipantDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/participant/onboarding"
          element={
            <ProtectedRoute roles={["participant"]}>
              <ParticipantOnboardingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/participant/events"
          element={
            <ProtectedRoute roles={["participant"]}>
              <ParticipantBrowseEventsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/participant/events/:id"
          element={
            <ProtectedRoute roles={["participant"]}>
              <ParticipantEventDetailsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/participant/clubs"
          element={
            <ProtectedRoute roles={["participant"]}>
              <ParticipantClubsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/participant/clubs/:id"
          element={
            <ProtectedRoute roles={["participant"]}>
              <ParticipantClubDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/participant/profile"
          element={
            <ProtectedRoute roles={["participant"]}>
              <ParticipantProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/organizer/dashboard"
          element={
            <ProtectedRoute roles={["organizer"]}>
              <OrganizerDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/organizer/create-event"
          element={
            <ProtectedRoute roles={["organizer"]}>
              <OrganizerCreateEventPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/organizer/events/:id"
          element={
            <ProtectedRoute roles={["organizer"]}>
              <OrganizerEventDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/organizer/profile"
          element={
            <ProtectedRoute roles={["organizer"]}>
              <OrganizerProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/organizer/ongoing"
          element={
            <ProtectedRoute roles={["organizer"]}>
              <OrganizerOngoingEventsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/dashboard"
          element={
            <ProtectedRoute roles={["admin"]}>
              <AdminDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/organizers"
          element={
            <ProtectedRoute roles={["admin"]}>
              <AdminOrganizersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/reset-requests"
          element={
            <ProtectedRoute roles={["admin"]}>
              <AdminResetRequestsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tickets/:ticketId"
          element={
            <ProtectedRoute roles={["participant", "organizer", "admin"]}>
              <TicketPage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}

export default App;
