import {
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import Services from "./pages/Services";
import Orders from "./pages/Orders";
import Receipts from "./pages/Receipts";
import Wallet from "./pages/Wallet";
import Payments from "./pages/Payments";
import Loans from "./pages/Loans";
import ChinaOrders from "./pages/ChinaOrders";
import VietnamOrders from "./pages/VietnamOrders";
import CustomerProfile from "./pages/CustomerProfile";
import AddCustomer from "./pages/AddCustomer";
import Settings from "./pages/Settings";
import Savings from "./pages/Savings";
import "./redesign-final.css";
import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./components/AppLayout";
import PageTransition from "./components/ui/PageTransition";

function AnimatedRoute({ children }) {

  const location = useLocation();

  return (
    <PageTransition key={location.pathname}>
      {children}
    </PageTransition>
  );

}


function App() {

  return (
    <Routes>


      {/* LOGIN */}

      <Route
        path="/login"
        element={
          <AnimatedRoute>
            <Login />
          </AnimatedRoute>
        }
      />


      {/* ============================= */}
      {/* PROTECTED ADMIN APPLICATION    */}
      {/* ============================= */}

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />


          </ProtectedRoute>
        }
      >


        {/* DASHBOARD */}

        <Route
          path="/"
          element={
            <AnimatedRoute>
              <Dashboard />
            </AnimatedRoute>
          }
        />


        <Route
          path="/dashboard"
          element={
            <AnimatedRoute>
              <Dashboard />
            </AnimatedRoute>
          }
        />


      
<Route
  path="/customers"
  element={
    <AnimatedRoute>
      <Customers />
    </AnimatedRoute>
  }
/>
        {/* CUSTOMER PROFILE */}
<Route
  path="/customers/new"
  element={
    <AnimatedRoute>
      <AddCustomer />
    </AnimatedRoute>
  }
/>
        <Route
          path="/customers/:id"
          element={
            <AnimatedRoute>
              <CustomerProfile />
            </AnimatedRoute>
          }
        />


        {/* SERVICES */}

        <Route
          path="/services"
          element={
            <AnimatedRoute>
              <Services />
            </AnimatedRoute>
          }
        />


        {/* ORDERS */}

        <Route
          path="/orders"
          element={
            <AnimatedRoute>
              <Orders />
            </AnimatedRoute>
          }
        />
{/* RECEIPTS */}

<Route
  path="/receipts"
  element={
    <AnimatedRoute>
      <Receipts />
    </AnimatedRoute>
  }
/>

        {/* WALLET */}

        <Route
          path="/wallet"
          element={
            <AnimatedRoute>
              <Wallet />
            </AnimatedRoute>
          }
        />


        {/* PAYMENTS */}

        <Route
          path="/savings"
          element={
            <AnimatedRoute>
              <Savings />
            </AnimatedRoute>
          }
        />


        <Route
          path="/payments"
          element={
            <AnimatedRoute>
              <Payments />
            </AnimatedRoute>
          }
        />


        {/* LOANS */}

        <Route path="/settings" element={<AnimatedRoute><Settings /></AnimatedRoute>} />


        <Route
          path="/loans"
          element={
            <AnimatedRoute>
              <Loans />
            </AnimatedRoute>
          }
        />


        {/* CHINA ORDERS */}

        <Route
          path="/china-orders"
          element={
            <AnimatedRoute>
              <ChinaOrders />
            </AnimatedRoute>
          }
        />


        {/* VIETNAM ORDERS */}

        <Route
          path="/vietnam-orders"
          element={
            <AnimatedRoute>
              <VietnamOrders />
            </AnimatedRoute>
          }
        />


      </Route>


      {/* ============================= */}
      {/* FALLBACK                      */}
      {/* ============================= */}

      <Route
        path="*"
        element={
          <Navigate
            to="/"
            replace
          />
        }
      />


    </Routes>

  );

}


export default App;