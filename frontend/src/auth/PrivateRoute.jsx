import { useContext } from "react";
import { AuthContext } from "./AuthContext";
import { Navigate } from "react-router-dom";

export default function PrivateRoute({ children }) {
  const { user } = useContext(AuthContext);

return user && localStorage.getItem("token")
  ? children
  : <Navigate to="/login" />;
}
