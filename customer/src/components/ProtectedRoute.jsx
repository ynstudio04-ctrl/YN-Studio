import { Navigate, useLocation } from "react-router-dom";

const AUTH_VERSION = "2";

function ProtectedRoute({ children }) {
  const token = localStorage.getItem("customerToken");
  const authVersion = localStorage.getItem("customerAuthVersion");
  const location = useLocation();

  // Old/stale sessions from before the current auth flow are not
  // allowed to jump straight into the app. The customer must sign in.
  if (!token || authVersion !== AUTH_VERSION) {
    localStorage.removeItem("customerToken");
    localStorage.removeItem("customerAuthenticated");
    localStorage.removeItem("customerUser");
    localStorage.removeItem("customerWalletPinSet");
    localStorage.removeItem("customerAuthVersion");

    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const passcodeSet =
    localStorage.getItem("customerWalletPinSet") === "true";

  if (
    !passcodeSet &&
    location.pathname !== "/create-passcode"
  ) {
    return <Navigate to="/create-passcode" replace />;
  }

  if (
    passcodeSet &&
    location.pathname === "/create-passcode"
  ) {
    return <Navigate to="/home" replace />;
  }

  return children;
}

export default ProtectedRoute;
