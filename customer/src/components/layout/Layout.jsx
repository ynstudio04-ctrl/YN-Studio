import Sidebar from "../Sidebar";
import Topbar from "../Topbar";

function Layout({ children }) {

  return (

    <div className="app-layout">

      <Sidebar />

      <main className="main-content">

        <Topbar />

        {children}

      </main>

    </div>

  );

}

export default Layout;