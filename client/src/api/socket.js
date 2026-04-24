import { io } from 'socket.io-client';

const socketUrl = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace('/api', '') : 'http://localhost:5005';

export const socket = io(socketUrl, {
  autoConnect: false, // Connect only when needed (e.g. valid super_admin)
  transports: ['websocket'],
});

export const connectSocket = (token) => {
  if (!socket.connected) {
    socket.auth = { token };
    socket.connect();
    console.log('📡 Attempting to connect to WebSocket...');
  }
};

export const disconnectSocket = () => {
  if (socket.connected) {
    socket.disconnect();
    console.log('🔌 Disconnected from WebSocket');
  }
};
