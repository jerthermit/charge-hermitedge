import { useEffect } from "react";
import OperationsWorkspace from "../components/operations/OperationsWorkspace";

const Dashboard = () => {
  useEffect(() => {
    document.title = "Charge | Charging";
  }, []);

  return <OperationsWorkspace />;
};

export default Dashboard;
