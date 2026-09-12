import { Outlet } from "react-router-dom";

import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import AdminAI from "./AdminAI";

function AppLayout() {
  return (
    <div className="app-shell">
      <Sidebar />

      <main className="main-content">
        <Topbar />

        <Outlet />
      </main>

      <AdminAI />
    </div>
  );
}

export default AppLayout;