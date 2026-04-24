import { useForm } from 'react-hook-form';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm();

  const from = location.state?.from?.pathname || '/dashboard';

  const onSubmit = async (data) => {
    try {
      const response = await api.post('/auth/login', data);
      login(response.data.token);
      navigate(from, { replace: true });
    } catch (err) {
      if (!err.response) {
        alert('Network Error: The backend server is currently unreachable. Please ensure it is running.');
      } else {
        alert(err.response?.data?.error || 'Login failed. Please check your credentials.');
      }
    }
  };

  const handleGoogleLogin = () => {
    // Redirect to backend Google OAuth initiation
    window.location.href = 'http://localhost:5005/api/auth/google';
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="glass-card max-w-md w-full p-8 animate-fade-in">
        <h1 className="text-3xl font-bold text-center mb-2">Welcome Back</h1>
        <p className="text-center text-slate-400 mb-8">Login to manage your tasks</p>
        
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="form-group">
            <label className="form-label">Full Name (as registered)</label>
            <input 
              type="text" 
              className="glass-input w-full"
              placeholder="e.g. Alice Smith"
              {...register('username', { required: 'Full name is required' })}
            />
            {errors.username && <p className="form-error">{errors.username.message}</p>}
            <p className="text-[10px] text-slate-500 mt-1">This must match the name used during registration.</p>
          </div>

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input 
              type="email" 
              className="glass-input w-full"
              placeholder="alice@acme.com"
              {...register('email', { required: 'Email is required' })}
            />
            {errors.email && <p className="form-error">{errors.email.message}</p>}
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input 
              type="password" 
              className="glass-input w-full"
              placeholder="••••••••"
              {...register('password', { required: 'Password is required' })}
            />
            {errors.password && <p className="form-error">{errors.password.message}</p>}
          </div>

          <button 
            type="submit" 
            className="btn btn-primary w-full mt-4"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Logging in...' : 'Sign In'}
          </button>
        </form>

        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-700"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-slate-900 text-slate-500">Or continue with</span>
          </div>
        </div>

        <button 
          onClick={handleGoogleLogin}
          className="btn btn-secondary w-full"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5 mr-2" />
          Login with Google
        </button>

        <p className="text-center mt-8 text-slate-400">
          Don't have an account? <Link to="/register" className="text-indigo-400 hover:underline">Register your organization</Link>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
