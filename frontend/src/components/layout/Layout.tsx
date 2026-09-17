import { useLayoutEffect } from "react";
import {
  Outlet,
  useLocation,
} from "react-router-dom";
import Footer from "./Footer";
import NavBar from "./NavBar";

const Layout = () => {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  }, [pathname]);

  return (
    <div className="relative isolate flex min-h-screen min-h-[100svh] flex-col overflow-x-clip bg-[#f1f2ed] text-[#111510]">
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-xl bg-[#dfff69] px-4 py-2 text-sm font-semibold text-[#111510] shadow-lg transition-transform focus:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-black"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-50">
        <NavBar />
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="relative flex flex-1 flex-col outline-none"
      >
        <Outlet />
      </main>

      <Footer />
    </div>
  );
};

export default Layout;
