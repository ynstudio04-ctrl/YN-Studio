import { Bell, Search } from "lucide-react";

function Topbar() {
  const user = JSON.parse(localStorage.getItem("yn_user") || "{}");

  return (
    <header className="topbar">
      <div className="search-box">
        <Search size={18} />

        <input placeholder="Search anything..." />
      </div>

      <div className="topbar-right">
        <button className="topbar-icon">
          <Bell size={19} />
        </button>

        <div className="user-info">
          <div className="user-avatar">
            {(user.username || "A").charAt(0).toUpperCase()}
          </div>

          <div>
            <strong>{user.username || "Admin"}</strong>
            <span>Administrator</span>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Topbar;