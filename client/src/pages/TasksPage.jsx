import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { socket, connectSocket } from '../api/socket';

const TasksPage = () => {
  const { user, token } = useAuth();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const response = await api.get('/tasks');
      return response.data;
    },
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (token) {
      connectSocket(token);

      const handleTaskEvent = () => {
        console.log('⚡ Real-time update: Refreshing task board...');
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

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/tasks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const statuses = [
    { id: 'todo', label: 'To Do', color: 'slate' },
    { id: 'in_progress', label: 'In Progress', color: 'amber' },
    { id: 'done', label: 'Done', color: 'emerald' },
  ];

  const handleEdit = (task) => {
    setEditingTask(task);
    setIsModalOpen(true);
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this task?')) {
      deleteMutation.mutate(id);
    }
  };

  if (isLoading) return <div className="container p-8">Loading tasks...</div>;

  return (
    <div className="container animate-fade-in">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Task Board</h1>
        {user?.role !== 'viewer' && (
          <button 
            className="btn btn-primary"
            onClick={() => { setEditingTask(null); setIsModalOpen(true); }}
          >
            <span>+</span> New Task
          </button>
        )}
      </header>

      <div className="kanban-board">
        {statuses.map(status => (
          <div key={status.id} className="kanban-column">
            <h2 className={`text-sm font-bold uppercase tracking-widest text-${status.color}-400 mb-6 px-2 flex justify-between`}>
              {status.label}
              <span className="bg-slate-800 px-2 py-0.5 rounded-full text-xs">
                {tasks?.filter(t => t.status === status.id).length}
              </span>
            </h2>
            
            <div className="space-y-4">
              {tasks?.filter(t => t.status === status.id).map(task => (
                <TaskCard 
                  key={task.id} 
                  task={task} 
                  onEdit={handleEdit} 
                  onDelete={handleDelete}
                  currentUser={user}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <TaskModal 
          task={editingTask} 
          onClose={() => setIsModalOpen(false)} 
        />
      )}
    </div>
  );
};

const TaskCard = ({ task, onEdit, onDelete, currentUser }) => {
  const canEdit = currentUser.role === 'admin' || task.created_by === currentUser.userId;

  return (
    <div className="glass-card task-card">
      <div className="flex justify-between items-start mb-3">
        <span className={`badge badge-${task.priority}`}>{task.priority}</span>
        <div className="flex gap-2">
          {canEdit && (
            <>
              <button onClick={() => onEdit(task)} className="text-slate-400 hover:text-indigo-400">
                ✏️
              </button>
              <button onClick={() => onDelete(task.id)} className="text-slate-400 hover:text-red-400">
                🗑️
              </button>
            </>
          )}
        </div>
      </div>
      <h3 className="font-semibold text-lg mb-2">{task.title}</h3>
      <p className="text-sm text-slate-400 line-clamp-2 mb-4">{task.description}</p>
      
      {task.due_date && (
        <p className="text-xs text-amber-400 mb-2">⏱️ Deadline: {new Date(task.due_date).toLocaleDateString()}</p>
      )}

      {task.attachments && task.attachments.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold mb-1">Attachments:</p>
          <div className="flex flex-wrap gap-2">
            {task.attachments.map((file, i) => (
              <a key={i} href={`http://localhost:5005${file.path}`} target="_blank" rel="noopener noreferrer" className="text-xs bg-black/20 px-2 py-1 rounded hover:bg-indigo-500/20 text-indigo-300">
                📎 {file.originalname}
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center text-xs text-slate-500">
        <span className="mr-auto">Assigned to: {task.assigned_to_email || 'Unassigned'}</span>
      </div>
    </div>
  );
};

const TaskModal = ({ task, onClose }) => {
  const queryClient = useQueryClient();
  const { register, handleSubmit, control, formState: { errors } } = useForm({
    defaultValues: task 
      ? { ...task, due_date: task.due_date ? new Date(task.due_date) : null } 
      : { status: 'todo', priority: 'medium', due_date: null, assigned_to: '' }
  });

  const { data: members } = useQuery({
    queryKey: ['members'],
    queryFn: async () => {
      const resp = await api.get('/orgs/members');
      return resp.data;
    }
  });

  const mutation = useMutation({
    mutationFn: (data) => {
      const formData = new FormData();
      formData.append('title', data.title);
      formData.append('description', data.description || '');
      formData.append('status', data.status);
      formData.append('priority', data.priority);
      formData.append('assigned_to', data.assigned_to || '');

      if (data.due_date) {
        const d = data.due_date;
        const dateString = typeof d === 'string' ? d : d.toISOString().split('T')[0];
        formData.append('due_date', dateString);
      } else {
        formData.append('due_date', '');
      }
      
      if (data.attachments && data.attachments.length > 0) {
        for (let i = 0; i < data.attachments.length; i++) {
          formData.append('attachments', data.attachments[i]);
        }
      }

      if (task) return api.put(`/tasks/${task.id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      return api.post('/tasks', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      onClose();
    },
    onError: (err) => {
      const msg = err.response?.data?.error || 'Failed to save task. Please check your inputs and try again.';
      alert(`❌ Error: ${msg}`);
    }
  });
  });

  const onSubmit = (data) => mutation.mutate(data);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="glass-card max-w-lg w-full p-8 animate-fade-in">
        <h2 className="text-2xl font-bold mb-6">{task ? 'Edit Task' : 'Create New Task'}</h2>
        
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="form-group">
            <label className="form-label">Task Title</label>
            <input 
              {...register('title', { required: 'Title is required' })}
              className="glass-input w-full"
            />
            {errors.title && <p className="form-error">{errors.title.message}</p>}
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea 
              {...register('description')}
              className="glass-input w-full min-h-[100px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">Status</label>
              <select {...register('status')} className="glass-input w-full bg-[#1e293b]">
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Priority</label>
              <select {...register('priority')} className="glass-input w-full bg-[#1e293b]">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">Assign To</label>
              <select {...register('assigned_to')} className="glass-input w-full bg-[#1e293b]">
                <option value="">Unassigned</option>
                {members?.map(m => (
                  <option key={m.id} value={m.id}>{m.name || m.email}</option>
                ))}
              </select>
              {!members && <p className="text-[10px] text-slate-500 mt-1">Loading members...</p>}
            </div>
            <div className="form-group">
              <label className="form-label">Deadline</label>
              <Controller
                control={control}
                name="due_date"
                render={({ field }) => (
                  <DatePicker
                    selected={field.value}
                    onChange={(date) => field.onChange(date)}
                    className="glass-input w-full cursor-pointer"
                    placeholderText="Select a deadline"
                    dateFormat="yyyy-MM-dd"
                    minDate={new Date()}
                    isClearable
                    wrapperClassName="w-full"
                  />
                )}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Attachments (PDF, Excel, Images)</label>
            <input 
              type="file" 
              multiple 
              accept=".pdf,.xls,.xlsx,.png,.jpg,.jpeg"
              {...register('attachments')}
              className="glass-input w-full"
            />
            {task?.attachments && task.attachments.length > 0 && (
              <p className="text-xs text-slate-400 mt-2">Uploading new files will append to existing attachments.</p>
            )}
          </div>

          <div className="flex justify-end gap-4 mt-8">
            <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving...' : 'Save Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TasksPage;
