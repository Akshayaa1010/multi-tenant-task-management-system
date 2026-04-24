import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import api from '../api/axios';

const AuditPage = () => {
  const [page, setPage] = useState(0);
  const limit = 10;

  const { data: logs, isLoading } = useQuery({
    queryKey: ['audit', page],
    queryFn: async () => {
      const response = await api.get(`/audit?limit=${limit}&offset=${page * limit}`);
      return response.data;
    },
  });

  return (
    <div className="container animate-fade-in">
      <header className="mb-12">
        <h1 className="text-3xl font-bold">Security Audit Trail</h1>
        <p className="text-slate-400 mt-2">Immutable logs of all sensitive actions in your organization.</p>
      </header>

      <div className="glass-card overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-800/50">
              <th className="p-4 font-semibold text-slate-400 text-sm">Timestamp</th>
              <th className="p-4 font-semibold text-slate-400 text-sm">Actor</th>
              <th className="p-4 font-semibold text-slate-400 text-sm">Event Type</th>
              <th className="p-4 font-semibold text-slate-400 text-sm">Description</th>
              <th className="p-4 font-semibold text-slate-400 text-sm text-right">IP Address</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {isLoading ? (
              <tr><td colSpan="5" className="p-8 text-center text-slate-500">Loading logs...</td></tr>
            ) : logs?.length === 0 ? (
              <tr><td colSpan="5" className="p-8 text-center text-slate-500">No logs found.</td></tr>
            ) : logs?.map(log => (
              <tr key={log.id} className="hover:bg-white/5 transition-colors">
                <td className="p-4 text-sm text-slate-300">
                  {new Date(log.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </td>
                <td className="p-4">
                  <div className="font-medium text-white">{log.actor_name || 'System'}</div>
                  <div className="text-xs text-slate-500">{log.actor_email || 'n/a'}</div>
                </td>
                <td className="p-4">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight border ${
                    log.action_type?.includes('FAILURE') || log.action_type?.includes('DELETED') 
                    ? 'bg-red-500/10 text-red-400 border-red-500/20' 
                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  }`}>
                    {(log.action_type || log.action).replace(/[._]/g, ' ')}
                  </span>
                </td>
                <td className="p-4 text-sm text-slate-300 italic">
                  {log.description || 'No description provided.'}
                </td>
                <td className="p-4 text-right text-xs font-mono text-slate-500">
                  {log.ip_address || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="p-4 flex justify-between items-center bg-slate-800/30">
          <button 
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="btn btn-secondary py-1 px-4 text-sm disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-slate-400">Page {page + 1}</span>
          <button 
            onClick={() => setPage(p => p + 1)}
            disabled={logs?.length < limit}
            className="btn btn-secondary py-1 px-4 text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuditPage;
