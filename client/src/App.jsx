import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';

// Pages
import LoginPage         from './pages/LoginPage';
import RegisterPage      from './pages/RegisterPage';
import DashboardPage     from './pages/DashboardPage';
import TasksPage         from './pages/TasksPage';
import AuditPage         from './pages/AuditPage';
import SecurityAuditPage from './pages/SecurityAuditPage';

const App = () => {
  return (
    <div className="min-h-screen">
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Protected Routes */}
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/tasks" 
          element={
            <ProtectedRoute>
              <TasksPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/audit" 
          element={
            <ProtectedRoute requiredRole="admin">
              <AuditPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/security-audit" 
          element={
            <ProtectedRoute requiredRole="super_admin">
              <SecurityAuditPage />
            </ProtectedRoute>
          } 
        />

        {/* Utility Routes */}
        <Route path="/unauthorized" element={
          <div className="flex flex-col items-center justify-center min-h-screen text-center p-4">
            <h1 className="text-6xl font-black text-red-500 mb-4">403</h1>
            <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
            <p className="text-slate-400 mb-8">You do not have permission to view this page.</p>
            <button onClick={() => window.history.back()} className="btn btn-primary">Go Back</button>
          </div>
        } />

        {/* Default Redirect */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </div>
  );
};

export default App;
