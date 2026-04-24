'use strict';

let io;
const jwt = require('jsonwebtoken');

module.exports = {
  init: (server) => {
    const { Server } = require('socket.io');
    io = new Server(server, {
      cors: {
        origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
        credentials: true
      }
    });

    // Authentication middleware for Socket.io
    io.use((socket, next) => {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
          return next(new Error('Authentication error: Invalid token'));
        }
        
        socket.user = decoded;
        next();
      });
    });

    io.on('connection', (socket) => {
      const { userId, orgId, role, email } = socket.user;
      
      console.log(`⚡ User connected: ${email} (Role: ${role})`);

      // 1. Join Organization Room (for org-wide updates)
      if (orgId) {
        socket.join(`org_${orgId}`);
        console.log(`🏠 Joined Organization Room: org_${orgId}`);
      }

      // 2. Join Private User Room (for personal assignments)
      socket.join(`user_${userId}`);
      console.log(`👤 Joined Private Room: user_${userId}`);

      socket.on('disconnect', () => {
        console.log(`🔌 User disconnected: ${email}`);
      });
    });

    return io;
  },
  getIO: () => {
    if (!io) {
      throw new Error('Socket.io not initialized!');
    }
    return io;
  }
};
