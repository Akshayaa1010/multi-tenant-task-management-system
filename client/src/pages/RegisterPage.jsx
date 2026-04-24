import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

const RegisterPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm();

  const onSubmit = async (data) => {
    try {
      const response = await api.post('/auth/register', data);
      login(response.data.token);
      navigate('/dashboard');
    } catch (err) {
      alert(err.response?.data?.error || 'Registration failed. Please try again.');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="glass-card max-w-md w-full p-8 animate-fade-in">
        <h1 className="text-3xl font-bold text-center mb-2">Get Started</h1>
        <p className="text-center text-slate-400 mb-8">Register your organization</p>
        
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="form-group">
            <label className="form-label">Organization Name</label>
            <input 
              type="text" 
              className="glass-input w-full"
              placeholder="Acme Corp"
              {...register('orgName', { required: 'Organization name is required' })}
            />
            {errors.orgName && <p className="form-error">{errors.orgName.message}</p>}
          </div>

          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input 
              type="text" 
              className="glass-input w-full"
              placeholder="John Doe"
              {...register('name', { required: 'Full name is required' })}
            />
            {errors.name && <p className="form-error">{errors.name.message}</p>}
          </div>

          <div className="form-group">
            <label className="form-label">Admin Email</label>
            <input 
              type="email" 
              className="glass-input w-full"
              placeholder="admin@example.com"
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
              {...register('password', { 
                required: 'Password is required',
                minLength: { value: 6, message: 'Password must be at least 6 characters' }
              })}
            />
            {errors.password && <p className="form-error">{errors.password.message}</p>}
          </div>

          <button 
            type="submit" 
            className="btn btn-primary w-full mt-4"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Creating Account...' : 'Create Organization'}
          </button>
        </form>

        <p className="text-center mt-8 text-slate-400">
          Already have an account? <Link to="/login" className="text-indigo-400 hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;
