import React from "react";
import {
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";

import CustomerLogin from "./pages/customer/CustomerLogin";
import CustomerSignup from "./pages/customer/CustomerSignup";
import CustomerHome from "./pages/customer/CustomerHome";
import CustomerOrders from "./pages/customer/CustomerOrders";
import CustomerOrderDetails from "./pages/customer/CustomerOrderDetails";
import CustomerWallet from "./pages/customer/CustomerWallet";
import CustomerSavings from "./pages/customer/CustomerSavings";
import CustomerProfile from "./pages/customer/CustomerProfile";
import CustomerReceipts from "./pages/customer/CustomerReceipts";
import CustomerLoan from "./pages/customer/CustomerLoan";
import "./App.css";
import "./redesign-final.css";
import PhoneOnlyGate from "./components/PhoneOnlyGate";
import ProtectedRoute from "./components/ProtectedRoute";
import CreatePasscode from "./pages/customer/CreatePasscode";
import CustomerCoupons from "./pages/customer/CustomerCoupons";
import CustomerNotifications from "./pages/customer/CustomerNotifications";
import { CustomerThemeProvider, useCustomerTheme } from "./components/CustomerTheme";
import { Home, ShoppingBag, Wallet, UserRound } from "lucide-react";
import { NavLink } from "react-router-dom";


/* =========================================================
   PAGE TRANSITION
   ========================================================= */

function PageTransition({ children }) {
  const location = useLocation();

  return (
    <div
      key={location.pathname}
      className="customer-page-transition"
    >
      {children}
    </div>
  );
}


/* =========================================================
   CUSTOMER PHONE LAYOUT
   ========================================================= */

function CustomerBottomNav() {
  const items = [
    { label: "Home", to: "/home", icon: Home },
    { label: "Orders", to: "/customer/orders", icon: ShoppingBag },
    { label: "Wallet", to: "/customer/wallet", icon: Wallet },
    { label: "Profile", to: "/customer/profile", icon: UserRound },
  ];

  return (
    <nav className="yn-customer-bottom-nav" aria-label="Customer navigation">
      {items.map(({ label, to, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `yn-customer-bottom-nav-item${isActive ? " active" : ""}`}
        >
          <Icon size={20} strokeWidth={2.2} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function CustomerPhoneLayout({ children }) {
  const { theme } = useCustomerTheme();

  return (
    <div className={`customer-app customer-theme-${theme}`}>
      <div className="customer-screen">
        {children}
      </div>
      <CustomerBottomNav />
    </div>
  );
}


/* =========================================================
   APP
   ========================================================= */


function App() {
  return (
    <CustomerThemeProvider>
      <PhoneOnlyGate>
      <Routes>

      {/* =================================================
          LOGIN
      ================================================= */}

      <Route
        path="/login"
        element={
          <CustomerPhoneLayout>
            <PageTransition>
              <CustomerLogin />
            </PageTransition>
          </CustomerPhoneLayout>
        }
      />


      {/* =================================================
          SIGNUP
      ================================================= */}

      <Route
        path="/signup"
        element={
          <CustomerPhoneLayout>
            <PageTransition>
              <CustomerSignup />
            </PageTransition>
          </CustomerPhoneLayout>
        }
      />

      {/* =================================================
          FIRST-TIME WALLET PASSCODE
      ================================================= */}

      <Route
        path="/create-passcode"
        element={
          <ProtectedRoute>
            <CustomerPhoneLayout>
              <PageTransition>
                <CreatePasscode />
              </PageTransition>
            </CustomerPhoneLayout>
          </ProtectedRoute>
        }
      />


      {/* =================================================
          HOME
      ================================================= */}

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <CustomerPhoneLayout>
              <PageTransition>
                <CustomerHome />
              </PageTransition>
            </CustomerPhoneLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/home"
        element={
          <ProtectedRoute>
            <CustomerPhoneLayout>
              <PageTransition>
                <CustomerHome />
              </PageTransition>
            </CustomerPhoneLayout>
          </ProtectedRoute>
        }
      />


      {/* Legacy/customer navigation aliases */}
      <Route
        path="/customer/home"
        element={
          <Navigate to="/home" replace />
        }
      />

      <Route
        path="/customer/requests"
        element={
          <Navigate to="/customer/orders?tab=requests" replace />
        }
      />

      {/* =================================================
          CUSTOMER COUPONS
      ================================================= */}

      <Route
        path="/customer/notifications"
        element={
          <ProtectedRoute>
            <CustomerPhoneLayout>
              <PageTransition>
                <CustomerNotifications />
              </PageTransition>
            </CustomerPhoneLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/customer/coupons"
        element={
          <ProtectedRoute>
            <CustomerPhoneLayout>
              <PageTransition>
                <CustomerCoupons />
              </PageTransition>
            </CustomerPhoneLayout>
          </ProtectedRoute>
        }
      />

      {/* =================================================
          CUSTOMER ORDERS
      ================================================= */}

      <Route
        path="/customer/orders"
        element={
          <ProtectedRoute>
            <CustomerPhoneLayout>
              <PageTransition>
                <CustomerOrders />
              </PageTransition>
            </CustomerPhoneLayout>
          </ProtectedRoute>
        }
      />


      {/* =================================================
          ORDER DETAILS
      ================================================= */}

      <Route
        path="/customer/orders/:id"
        element={
          <ProtectedRoute>
            <CustomerPhoneLayout>
              <PageTransition>
                <CustomerOrderDetails />
              </PageTransition>
            </CustomerPhoneLayout>
          </ProtectedRoute>
        }
      />


      {/* =================================================
          OLD ORDER ROUTE
      ================================================= */}

      <Route
        path="/orders"
        element={
          <Navigate
            to="/customer/orders"
            replace
          />
        }
      />


      {/* =================================================
          OTHER CUSTOMER ROUTES
      ================================================= */}

      <Route
        path="/customer/receipts"
        element={
          <ProtectedRoute>
            <CustomerPhoneLayout>
              <PageTransition>
                <CustomerReceipts />
              </PageTransition>
            </CustomerPhoneLayout>
          </ProtectedRoute>
        }
      />

      <Route path="/receipts" element={<Navigate to="/customer/receipts" replace />} />

      <Route
  path="/customer/wallet"
  element={
    <ProtectedRoute>
      <CustomerPhoneLayout>
        <PageTransition>
          <CustomerWallet />
        </PageTransition>
      </CustomerPhoneLayout>
    </ProtectedRoute>
  }
/>

<Route
  path="/wallet"
  element={
    <Navigate
      to="/customer/wallet"
      replace
    />
  }
/>
<Route
  path="/customer/savings"
  element={
    <ProtectedRoute>
      <CustomerPhoneLayout>
        <PageTransition>
          <CustomerSavings />
        </PageTransition>
      </CustomerPhoneLayout>
    </ProtectedRoute>
  }
/>

<Route
  path="/savings"
  element={<Navigate to="/customer/savings" replace />}
/>

<Route
  path="/customer/loan"
  element={
    <ProtectedRoute>
      <CustomerPhoneLayout>
        <PageTransition>
          <CustomerLoan />
        </PageTransition>
      </CustomerPhoneLayout>
    </ProtectedRoute>
  }
/>

<Route
  path="/loan"
  element={
    <Navigate
      to="/customer/loan"
      replace
    />
  }
/>
      <Route
        path="/packages"
        element={
          <Navigate
            to="/home"
            replace
          />
        }
      />

      <Route
        path="/customer/profile"
        element={
          <ProtectedRoute>
            <CustomerPhoneLayout>
              <PageTransition>
                <CustomerProfile />
              </PageTransition>
            </CustomerPhoneLayout>
          </ProtectedRoute>
        }
      />
      <Route path="/profile" element={<Navigate to="/customer/profile" replace />} />


      {/* =================================================
          FALLBACK
      ================================================= */}

      <Route
        path="*"
        element={
          <Navigate
            to="/login"
            replace
          />
        }
      />

    </Routes>
  </PhoneOnlyGate>
  </CustomerThemeProvider>
  );
}

export default App;