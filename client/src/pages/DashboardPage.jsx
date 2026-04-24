import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import { socket, connectSocket } from '../api/socket';

const DashboardPage = () => {
  const { user, token, logout } = useAuth();
  const queryClient = useQueryClient();
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const response = await api.get('/tasks');
      return response.data;
    },
    refetchInterval: 5000, // Background fallback polling
  });

  useEffect(() => {
    if (token) {
      connectSocket(token);

      const handleTaskEvent = () => {
        console.log('⚡ Real-time update: Refreshing dashboard...');
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
      };

      socket.on('task_created', handleTaskEvent);
      socket.on('task_updated', handleTaskEvent);
      socket.on('task_deleted', handleTaskEvent);

      return () => {
        socket.off('task_created', handleTaskEvent);
        socket.off('task_updated', handleTaskEvent);
        socket.off('task_deleted', handleTaskEvent);
      };
    }
  }, [token, queryClient]);

  const stats = {
    total: tasks?.length || 0,
    todo: tasks?.filter(t => t.status === 'todo').length || 0,
    inProgress: tasks?.filter(t => t.status === 'in_progress').length || 0,
    done: tasks?.filter(t => t.status === 'done').length || 0,
  };

  return (
    <div className="container animate-fade-in">
      <header className="flex justify-between items-center mb-12">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-400 to-emerald-400 bg-clip-text text-transparent">
            Dashboard
          </h1>
          <p className="text-slate-400 mt-2">Welcome back, <span className="font-semibold text-white">{user?.name || user?.email}</span></p>
        </div>
        <button onClick={logout} className="btn btn-secondary">Sign Out</button>
      </header>

      {user?.role === 'super_admin' ? (
        <SuperAdminDashboard />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <StatCard title="Total Tasks" value={stats.total} pastelColor="indigo" />
          <StatCard title="To Do" value={stats.todo} pastelColor="slate" />
          <StatCard title="In Progress" value={stats.inProgress} pastelColor="amber" />
          <StatCard title="Completed" value={stats.done} pastelColor="emerald" />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="glass-card highlight-card p-8 col-span-1 flex flex-col gap-8">
          <div>
            <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
            <div className="flex flex-col gap-4">
              <Link to="/tasks" className="btn btn-primary justify-start">
                <span>🚀</span> View Task Board
              </Link>
              {(user?.role === 'admin' || user?.role === 'super_admin') && (
                <>
                  <button onClick={() => setIsAddMemberOpen(true)} className="btn btn-secondary justify-start text-left">
                    <span>👥</span> Add New Member
                  </button>
                  {user?.role === 'super_admin' ? (
                    <Link to="/security-audit" className="btn btn-secondary justify-start text-left" style={{ borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)', color: '#f87171' }}>
                      <span>🔐</span> Security Audit Logs
                    </Link>
                  ) : (
                    <Link to="/audit" className="btn btn-secondary justify-start text-left">
                      <span>🛡️</span> Security Audit Logs
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>

          <RecentActivity tasks={tasks} />
        </div>

        <div className="glass-card p-8 col-span-2">
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
            <span>👥</span> {user?.role === 'super_admin' ? 'Recent Organizations' : 'Manage Organization Agents'}
          </h2>
          {user?.role === 'super_admin' ? <OrganizationList /> : <MemberManagement />}
        </div>
      </div>


      <div className="glass-card p-8 mb-8 mt-8">
        <h2 className="text-xl font-semibold mb-4">Your Role Permissions</h2>
        <div className="space-y-3">
          <p className="flex items-center text-slate-300">
            <span className={`w-3 h-3 rounded-full mr-3 ${user?.role === 'viewer' ? 'bg-slate-500' : 'bg-green-500'}`}></span>
            {user?.role === 'viewer' ? 'Read-only access to tasks' : 
             user?.role === 'super_admin' ? 'Full platform access (multi-tenant oversight)' : 
             'Can create and edit tasks within your organization'}
          </p>
          {(user?.role === 'admin' || user?.role === 'super_admin') && (
            <p className="flex items-center text-slate-300">
              <span className="w-3 h-3 rounded-full bg-green-500 mr-3"></span>
              Full organization management and auditing
            </p>
          )}
        </div>
      </div>

      {isAddMemberOpen && (
        <AddMemberModal onClose={() => setIsAddMemberOpen(false)} onRefresh={() => window.location.reload()} />
      )}
    </div>
  );
};

const SuperAdminDashboard = () => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const response = await api.get('/admin/stats');
      return response.data;
    },
  });

  if (isLoading) return <p className="text-slate-400">Loading platform stats...</p>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
      <StatCard title="Total Companies" value={stats?.totalOrganizations || 0} pastelColor="indigo" />
      <StatCard title="Total Admins" value={stats?.totalAdmins || 0} pastelColor="amber" />
      <StatCard title="Total Agents" value={stats?.totalAgents || 0} pastelColor="emerald" />
    </div>
  );
};

const OrganizationList = () => {
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(null); // holds the org object to delete

  const { data: orgs, isLoading } = useQuery({
    queryKey: ['admin-organizations'],
    queryFn: async () => {
      const response = await api.get('/admin/organizations');
      return response.data;
    },
  });

  if (isLoading) return <p className="text-slate-400">Loading organizations...</p>;

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10 text-slate-400 text-sm">
              <th className="pb-4 font-semibold">COMPANY NAME</th>
              <th className="pb-4 font-semibold">ADMIN EMAIL</th>
              <th className="pb-4 font-semibold text-center">USERS</th>
              <th className="pb-4 font-semibold text-right">ACTION</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {orgs?.map(o => (
              <tr key={o.id} className="group hover:bg-white/5 transition-colors">
                <td className="py-4 font-medium text-white">{o.name}</td>
                <td className="py-4 text-slate-300">
                  <p>{o.admin_email || 'No Admin'}</p>
                  <p className="text-xs text-slate-500">{o.admin_name}</p>
                </td>
                <td className="py-4 text-center text-slate-400 font-mono">
                  {o.user_count}
                </td>
                <td className="py-4 text-right">
                  <button
                    id={`delete-org-${o.id}`}
                    onClick={() => setConfirmDelete(o)}
                    title="Delete this company permanently"
                    style={{
                      padding: '6px 14px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: '600',
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      border: '1px solid rgba(239,68,68,0.4)',
                      background: 'rgba(239,68,68,0.12)',
                      color: '#f87171',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(239,68,68,0.28)';
                      e.currentTarget.style.borderColor = 'rgba(239,68,68,0.8)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'rgba(239,68,68,0.12)';
                      e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)';
                    }}
                  >
                    🗑 Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirmDelete && (
        <DeleteOrganizationModal
          org={confirmDelete}
          onClose={() => setConfirmDelete(null)}
          onSuccess={() => {
            setConfirmDelete(null);
            queryClient.invalidateQueries({ queryKey: ['admin-organizations'] });
            queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
          }}
        />
      )}
    </>
  );
};

/**
 * Modal to confirm and execute permanent deletion of an organization.
 */
const DeleteOrganizationModal = ({ org, onClose, onSuccess }) => {
  const [status, setStatus] = useState({ loading: false, error: null });
  const [confirmed, setConfirmed] = useState('');

  const handleDelete = async () => {
    setStatus({ loading: true, error: null });
    try {
      await api.delete(`/admin/organizations/${org.id}`);
      onSuccess();
    } catch (err) {
      setStatus({ loading: false, error: err.response?.data?.error || 'Deletion failed. Please try again.' });
    }
  };

  const isConfirmed = confirmed.trim() === org.name;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div className="glass-card animate-fade-in" style={{ maxWidth: '480px', width: '100%', padding: '36px' }}>
        {/* Danger icon */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <span style={{ fontSize: '48px' }}>⚠️</span>
        </div>

        <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#f87171', marginBottom: '12px', textAlign: 'center' }}>
          Delete Organization
        </h2>

        <p style={{ color: '#94a3b8', fontSize: '14px', textAlign: 'center', marginBottom: '20px', lineHeight: '1.6' }}>
          You are about to <strong style={{ color: '#f87171' }}>permanently delete</strong>{' '}
          <strong style={{ color: '#fff' }}>{org.name}</strong>.<br />
          This will remove <strong style={{ color: '#fbbf24' }}>{org.user_count} user{org.user_count !== '1' ? 's' : ''}</strong>,
          all their tasks, and all audit logs.<br />
          <strong style={{ color: '#f87171' }}>This action cannot be undone.</strong>
        </p>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '13px', color: '#94a3b8', marginBottom: '8px' }}>
            Type <strong style={{ color: '#fff' }}>{org.name}</strong> to confirm:
          </label>
          <input
            id="delete-confirm-input"
            type="text"
            value={confirmed}
            onChange={e => setConfirmed(e.target.value)}
            placeholder={org.name}
            className="glass-input"
            style={{ width: '100%', borderColor: isConfirmed ? 'rgba(239,68,68,0.6)' : undefined }}
            autoFocus
          />
        </div>

        {status.error && (
          <p style={{ color: '#f87171', fontSize: '13px', marginBottom: '16px', textAlign: 'center' }}>
            {status.error}
          </p>
        )}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            id="cancel-delete-org"
            onClick={onClose}
            disabled={status.loading}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button
            id="confirm-delete-org"
            onClick={handleDelete}
            disabled={!isConfirmed || status.loading}
            style={{
              padding: '10px 20px',
              borderRadius: '10px',
              fontWeight: '600',
              fontSize: '14px',
              cursor: isConfirmed && !status.loading ? 'pointer' : 'not-allowed',
              opacity: isConfirmed && !status.loading ? 1 : 0.45,
              border: '1px solid rgba(239,68,68,0.6)',
              background: isConfirmed ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.1)',
              color: '#f87171',
              transition: 'all 0.2s',
            }}
          >
            {status.loading ? 'Deleting...' : '🗑 Permanently Delete'}
          </button>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, pastelColor }) => (
  <div className={`glass-card bg-pastel-${pastelColor} p-6 flex flex-col justify-center items-center text-center transition-transform hover:scale-105 duration-300`}>
    <p className="text-sm font-bold uppercase tracking-wider mb-2 opacity-80">{title}</p>
    <p className="text-5xl font-black drop-shadow-sm">{value}</p>
  </div>
);

const AddMemberModal = ({ onClose, onRefresh }) => {
  const [formData, setFormData] = useState({ 
    username: '', 
    email: '', 
    password: '', 
    allottedTasks: '',
    role: 'agent' 
  });
  const [status, setStatus] = useState({ loading: false, error: null, success: false });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus({ loading: true, error: null, success: false });
    
    // Parse comma separated tasks
    const tasksArray = formData.allottedTasks.split(',').map(t => t.trim()).filter(Boolean);

    try {
      await api.post('/orgs/invite', {
        username: formData.username,
        email: formData.email,
        password: formData.password,
        role: formData.role,
        allottedTasks: tasksArray
      });
      setStatus({ loading: false, error: null, success: true });
      if (onRefresh) onRefresh();
      setTimeout(onClose, 2000);
    } catch (err) {
      setStatus({ loading: false, error: err.response?.data?.error || 'Failed to add member.', success: false });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="glass-card max-w-md w-full p-8 animate-fade-in">
        <h2 className="text-2xl font-bold mb-6">Add New Member</h2>
        {status.success ? (
          <div className="text-center p-4">
            <p className="text-emerald-400 font-medium mb-4">Member successfully added & tasks allotted! ✓</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Name (Username)</label>
              <input type="text" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} className="glass-input w-full" required />
            </div>
            <div className="form-group">
              <label className="form-label">Email ID</label>
              <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="glass-input w-full" required />
            </div>
            <div className="form-group">
              <label className="form-label">Temporary Password</label>
              <input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="glass-input w-full" required />
            </div>
            <div className="form-group">
              <label className="form-label">Role</label>
              <select 
                value={formData.role} 
                onChange={e => setFormData({...formData, role: e.target.value})} 
                className="glass-input w-full bg-[#1e293b]"
              >
                <option value="agent">Agent</option>
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Allotted Tasks (Comma separated)</label>
              <textarea 
                value={formData.allottedTasks}
                onChange={e => setFormData({...formData, allottedTasks: e.target.value})}
                className="glass-input w-full min-h-[80px]" 
                placeholder="e.g. Design Dashboard, Write Docs"
              />
            </div>
            {status.error && <p className="form-error mb-4">{status.error}</p>}
            <div className="flex justify-end gap-4 mt-6">
              <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={status.loading}>
                {status.loading ? 'Adding...' : 'Create Member'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

const MemberManagement = () => {
  const { user } = useAuth();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const { data: members, isLoading, refetch } = useQuery({
    queryKey: ['members'],
    queryFn: async () => {
      const resp = await api.get('/orgs/members');
      return resp.data;
    }
  });

  const handleDelete = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this agent?')) return;
    try {
      await api.delete(`/orgs/members/${userId}`);
      refetch();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete user.');
    }
  };

  const handleEdit = (member) => {
    setEditingUser(member);
    setIsEditModalOpen(true);
  };

  if (isLoading) return <p className="text-slate-400">Loading agents...</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-white/10 text-slate-400 text-sm">
            <th className="pb-4 font-semibold">NAME / EMAIL</th>
            <th className="pb-4 font-semibold">ROLE</th>
            <th className="pb-4 font-semibold text-right">ACTIONS</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {members?.map(m => (
            <tr key={m.id} className="group hover:bg-white/5 transition-colors">
              <td className="py-4">
                <p className="font-medium text-white">{m.name || 'N/A'}</p>
                <p className="text-sm text-slate-400">{m.email}</p>
              </td>
              <td className="py-4">
                <span className={`badge ${
                  m.role === 'super_admin' ? 'badge-high' : 
                  m.role === 'admin' ? 'badge-medium' : 'badge-low'
                }`}>
                  {m.role.replace('_', ' ')}
                </span>
              </td>
              <td className="py-4 text-right">
                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => handleEdit(m)}
                    className="p-2 hover:bg-indigo-500/20 rounded-lg text-indigo-400 title='Edit'"
                  >
                    ✏️
                  </button>
                  <button 
                    onClick={() => handleDelete(m.id)}
                    className="p-2 hover:bg-red-500/20 rounded-lg text-red-400 title='Delete'"
                  >
                    🗑️
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {isEditModalOpen && (
        <EditMemberModal 
          user={editingUser} 
          onClose={() => setIsEditModalOpen(false)} 
          onRefetch={refetch} 
        />
      )}
    </div>
  );
};

const EditMemberModal = ({ user, onClose, onRefetch }) => {
  const [formData, setFormData] = useState({ 
    name: user.name || '', 
    email: user.email || '', 
    role: user.role 
  });
  const [status, setStatus] = useState({ loading: false, error: null });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus({ loading: true, error: null });
    try {
      await api.patch(`/orgs/members/${user.id}`, formData);
      onRefetch();
      onClose();
    } catch (err) {
      setStatus({ loading: false, error: err.response?.data?.error || 'Update failed.' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="glass-card max-w-md w-full p-8">
        <h2 className="text-2xl font-bold mb-6 text-white">Edit Agent Details</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input 
              type="text" 
              value={formData.name} 
              onChange={e => setFormData({ ...formData, name: e.target.value })} 
              className="glass-input" 
              required 
            />
          </div>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input 
              type="email" 
              value={formData.email} 
              onChange={e => setFormData({ ...formData, email: e.target.value })} 
              className="glass-input" 
              required 
            />
          </div>
          <div className="form-group">
            <label className="form-label">Role</label>
            <select 
              value={formData.role} 
              onChange={e => setFormData({ ...formData, role: e.target.value })} 
              className="glass-input bg-[#1e293b]"
            >
              <option value="agent">Agent</option>
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>
          {status.error && <p className="text-red-400 text-sm">{status.error}</p>}
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={status.loading}>
              {status.loading ? 'Saving...' : 'Update Details'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const RecentActivity = ({ tasks }) => {
  const recentTasks = tasks?.slice(0, 5) || [];

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
      <div className="space-y-4">
        {recentTasks.length === 0 ? (
          <p className="text-sm text-slate-500 italic">No recent tasks</p>
        ) : (
          recentTasks.map(task => (
            <div key={task.id} className="p-4 rounded-xl bg-white/5 border border-white/5 hover:border-indigo-500/30 transition-all">
              <p className="text-sm font-medium text-indigo-300 truncate">{task.title}</p>
              <div className="flex justify-between items-center mt-1">
                <span className={`text-[10px] uppercase font-bold text-slate-500`}>
                  {task.status.replace('_', ' ')}
                </span>
                <span className="text-[10px] text-slate-500">
                  {new Date(task.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default DashboardPage;
