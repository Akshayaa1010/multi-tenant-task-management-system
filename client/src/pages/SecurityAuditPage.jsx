import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/axios';
import { socket, connectSocket } from '../api/socket';
import { useAuth } from '../context/AuthContext';

const SecurityAuditPage = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState('');

  // 1. Fetch initial data
  const { data: initialLogs, isLoading: logsLoading } = useQuery({
    queryKey: ['superadmin-audit-logs', selectedTenant],
    queryFn: async () => {
      const response = await api.get(`/superadmin/audit-logs${selectedTenant ? `?tenant=${selectedTenant}` : ''}`);
      return response.data;
    },
    enabled: !!user && user.role === 'super_admin',
  });

  // Fetch tenants for dropdown
  const { data: tenants } = useQuery({
    queryKey: ['admin-organizations'],
    queryFn: async () => {
      const response = await api.get('/admin/organizations');
      return response.data;
    },
  });

  // 2. Set initial logs and handle WebSocket updates
  useEffect(() => {
    if (initialLogs) {
      setLogs(initialLogs);
    }
  }, [initialLogs]);

  useEffect(() => {
    if (user?.role === 'super_admin') {
      const token = localStorage.getItem('token'); // Assuming JWT is in localStorage
      connectSocket(token);

      socket.on('new_system_audit_log', (newLog) => {
        setLogs((prevLogs) => {
          // If a tenant filter is active, only add if it matches
          if (selectedTenant && newLog.tenant_name !== selectedTenant) {
            return prevLogs;
          }
          return [newLog, ...prevLogs].slice(0, 100); // Keep last 100
        });
      });

      return () => {
        socket.off('new_system_audit_log');
      };
    }
  }, [user, selectedTenant]);

  const getEventBadgeStyle = (type) => {
    switch (type) {
      case 'SECURITY_ALERT':
        return { bg: 'rgba(239,68,68,0.15)', color: '#f87171', border: 'rgba(239,68,68,0.3)' };
      case 'TENANT_CREATE':
        return { bg: 'rgba(16,185,129,0.15)', color: '#34d399', border: 'rgba(16,185,129,0.3)' };
      default:
        return { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: 'rgba(59,130,246,0.3)' };
    }
  };

  const fmtDate = (d) => new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="container animate-fade-in p-8">
      <header className="mb-12">
        <h1 className="text-4xl font-black bg-gradient-to-r from-red-400 to-indigo-400 bg-clip-text text-transparent mb-2">
          🛡️ Security Audit Log
        </h1>
        <p className="text-slate-400">Real-time platform-wide security event monitoring.</p>
      </header>

      {/* Filters */}
      <div className="glass-card p-6 mb-8 flex items-center gap-6">
        <div style={{ flex: '1 1 auto' }}>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">
            Filter by Company / Tenant
          </label>
          <select 
            value={selectedTenant} 
            onChange={(e) => setSelectedTenant(e.target.value)}
            className="glass-input w-full md:w-80"
          >
            <option value="">All Organizations</option>
            {tenants?.map(t => (
              <option key={t.id} value={t.name}>{t.name}</option>
            ))}
          </select>
        </div>
        <div className="text-right">
            <span className="text-xs text-indigo-400 font-mono bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
                Live Status: Connected 🟢
            </span>
        </div>
      </div>

      {/* Data Table */}
      <div className="glass-card overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-white/5 text-slate-400 text-xs font-bold uppercase tracking-wider">
              <th className="px-6 py-4">Timestamp</th>
              <th className="px-6 py-4">Event</th>
              <th className="px-6 py-4">Company / Tenant</th>
              <th className="px-6 py-4">User</th>
              <th className="px-6 py-4">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {logsLoading ? (
              <tr>
                <td colSpan="5" className="px-6 py-20 text-center text-slate-500">
                  <div className="animate-pulse">Loading secure audit trail...</div>
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-6 py-20 text-center text-slate-500">
                  No security events found.
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const style = getEventBadgeStyle(log.event_type);
                return (
                  <tr key={log.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 text-sm text-slate-300 font-mono">
                      {fmtDate(log.created_at)}
                    </td>
                    <td className="px-6 py-4">
                      <span 
                        style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}
                        className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter"
                      >
                        {log.event_type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-white">
                      {log.tenant_name || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-indigo-300">
                      {log.performed_by}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400 italic">
                      {log.description}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SecurityAuditPage;
