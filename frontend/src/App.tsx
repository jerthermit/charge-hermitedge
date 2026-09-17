import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  lazy,
  Suspense,
} from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";
import PrivateRoute from "./components/auth/PrivateRoute";
import Layout from "./components/layout/Layout";
import { AuthProvider } from "./contexts/AuthContext";
import Login from "./pages/Login";
import Register from "./pages/Register";

import "./App.css";

const Network = lazy(
  () => import("./pages/Business")
);
const Dashboard = lazy(
  () => import("./pages/Dashboard")
);

const WorkspaceFallback = () => (
  <div
    role="status"
    className="grid min-h-[calc(100svh-4rem)] place-items-center bg-[#f1f2ed]"
  >
    <img
      src="/icons/charge-mark.png"
      alt=""
      className="h-10 w-10 object-contain"
    />
    <span className="sr-only">Loading Charge</span>
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="app-shell">
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

              <Route
                element={
                  <PrivateRoute>
                    <Layout />
                  </PrivateRoute>
                }
              >
                <Route
                  index
                  element={<Navigate to="/charge" replace />}
                />
                <Route
                  path="/charge"
                  element={
                    <Suspense fallback={<WorkspaceFallback />}>
                      <Dashboard />
                    </Suspense>
                  }
                />
                <Route
                  path="/network"
                  element={
                    <Suspense fallback={<WorkspaceFallback />}>
                      <Network />
                    </Suspense>
                  }
                />
                <Route
                  path="/business"
                  element={<Navigate to="/network" replace />}
                />
                <Route
                  path="*"
                  element={<Navigate to="/charge" replace />}
                />
              </Route>
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </div>
    </QueryClientProvider>
  );
};

export default App;
