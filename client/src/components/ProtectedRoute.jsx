import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * ProtectedRoute Component
 * 
 * A wrapper component for routes that require authentication.
 * 
 * Props:
 * - children: The component(s) to render if authenticated.
 * - requiredRole: (Optional) The specific role required for this route.
 * 
 * Logic:
 * 1. If still loading auth state, render nothing (or a loader).
 * 2. If no token/user, redirect to /login.
 * 3. If requiredRole is specified and user.role doesn't match, redirect to /unauthorized.
 * 4. Otherwise, render the children.
 */
const ProtectedRoute = ({ children, requiredRole }) => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-vh-100">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect to login but save the current location so we can go back
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};

export default ProtectedRoute;
